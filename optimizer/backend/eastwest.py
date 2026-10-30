"""East-West dual-plane optimizer.

The existing engine models one physical PV plane at a time.  This module keeps
that single-plane chain untouched and combines two fixed planes at plant scale:

* total DC nameplate is split by percentage, never duplicated;
* shared inverter mode sums both net DC profiles before one AC clipping step;
* separate mode clips each proportional inverter block independently;
* two ordinary infinite-sheds plane models are used, because pvlib 0.15 does
  not expose an exact alternating back-to-back East-West shed geometry.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Callable

import numpy as np
import pandas as pd

from . import engine

MIN_OPTIMIZER_TILT_DEG = 1.0


def _axis(start: float, stop: float, step: float) -> list[float]:
    return engine._axis(start, stop, step).tolist()


def _optimizer_tilts(start: float, stop: float, step: float, label: str) -> list[float]:
    """Automatic East-West optimization must stay in real dual-plane geometry.

    At zero tilt, azimuth is undefined and the model is simply a horizontal
    plane split into two labels. That may maximize annual yield near the
    equator, but it is not an East-West table arrangement.
    """
    if stop < MIN_OPTIMIZER_TILT_DEG:
        raise ValueError(
            f"{label} tilt_max must be at least {MIN_OPTIMIZER_TILT_DEG:g} deg "
            "for automatic East-West optimization. Use manual mode to evaluate a flat 0 deg plane."
        )
    return _axis(max(float(start), MIN_OPTIMIZER_TILT_DEG), float(stop), float(step))


def _az(value: float) -> float:
    return float(value) % 360.0


def _ctx_with(C: engine.SimContext, **updates) -> engine.SimContext:
    return replace(C, **updates)


def _round(value: float, digits: int = 1) -> float:
    return round(float(value), digits)


def _plane_dict(label: str, tilt: float, azimuth: float, share: float) -> dict:
    return {
        "label": label,
        "tilt": float(tilt),
        "azimuth": _az(azimuth),
        "azimuth_defined": bool(float(tilt) > 0.05),
        "dc_share_pct": float(share),
    }


def _plane_profile(
    C: engine.SimContext,
    tilt: float,
    azimuth: float,
    cache: dict,
    fast: bool = False,
) -> dict:
    """Return normalized plane irradiance and net DC profile per Wdc.

    The result is per installed Wdc, so applying a 50/50 split is simply
    profile * total_pdc0 * 0.5.  This is the guardrail that prevents accidental
    capacity doubling.
    """
    key = (round(float(tilt), 4), round(_az(azimuth), 4), bool(fast))
    if key in cache:
        return cache[key]

    dc_model = "pvwatts" if fast else C.dc_model
    lowlight = None if fast else C.lowlight
    C1 = _ctx_with(C, pdc0=1.0, dc_model=dc_model, lowlight=lowlight)
    poa = engine._poa_effective(float(tilt), _az(azimuth), C1)
    tcell = C1.tempf(poa, C1.temp_air, C1.wind_speed)
    gross = engine._dc_power(poa, tcell, C1)
    cache[key] = {
        "poa": poa,
        "tcell": tcell,
        "net_dc_per_w": gross * C.dc_derate,
    }
    return cache[key]


def combine_shared_inverter(pdc_a: pd.Series, pdc_b: pd.Series, C: engine.SimContext) -> dict:
    """Shared inverter pool: sum net DC first, then one inverter conversion/clamp."""
    pdc_total = (pdc_a + pdc_b).clip(lower=0.0)
    ac_unclipped = engine._pvwatts_unclipped(pdc_total, C)
    ac = ac_unclipped.clip(lower=0.0, upper=C.ac_w)
    clipping = (ac_unclipped - ac).clip(lower=0.0)
    frac_a = pdc_a.divide(pdc_total.where(pdc_total > 1e-9), fill_value=0.0).fillna(0.0).clip(0.0, 1.0)
    ac_a = (ac * frac_a).fillna(0.0)
    ac_b = (ac - ac_a).clip(lower=0.0)
    return {
        "ac": ac,
        "ac_unclipped": ac_unclipped,
        "clipping": clipping,
        "plane_ac": {"A": ac_a, "B": ac_b},
        "plane_clipping": {"A": clipping * frac_a, "B": clipping * (1.0 - frac_a)},
    }


def combine_separate_inverter_blocks(
    pdc_a: pd.Series,
    pdc_b: pd.Series,
    C: engine.SimContext,
    share_a: float,
) -> dict:
    """Separate proportional inverter blocks: convert/clip each plane independently."""
    share_b = 1.0 - share_a
    ac_lim_a = max(C.ac_w * share_a, 1.0)
    ac_lim_b = max(C.ac_w * share_b, 1.0)
    Ca = _ctx_with(C, ac_w=ac_lim_a, pdc0_inv=ac_lim_a / C.eta_nom)
    Cb = _ctx_with(C, ac_w=ac_lim_b, pdc0_inv=ac_lim_b / C.eta_nom)
    un_a = engine._pvwatts_unclipped(pdc_a, Ca)
    un_b = engine._pvwatts_unclipped(pdc_b, Cb)
    ac_a = un_a.clip(lower=0.0, upper=ac_lim_a)
    ac_b = un_b.clip(lower=0.0, upper=ac_lim_b)
    clip_a = (un_a - ac_a).clip(lower=0.0)
    clip_b = (un_b - ac_b).clip(lower=0.0)
    return {
        "ac": ac_a + ac_b,
        "ac_unclipped": un_a + un_b,
        "clipping": clip_a + clip_b,
        "plane_ac": {"A": ac_a, "B": ac_b},
        "plane_clipping": {"A": clip_a, "B": clip_b},
    }


def _monthly(series_w: pd.Series, dt_h: float, scale: float = 1_000_000.0) -> list[float]:
    values = (series_w * dt_h / scale).groupby(series_w.index.month).sum()
    return [_round(values.get(m, 0.0), 2) for m in range(1, 13)]


def _monthly_poa(poa: pd.Series, dt_h: float) -> list[float]:
    values = (poa * dt_h / 1000.0).groupby(poa.index.month).sum()
    return [_round(values.get(m, 0.0), 1) for m in range(1, 13)]


def _hour_profile(series_w: pd.Series, utc_offset: float) -> list[float]:
    local = (series_w / 1000.0).copy()
    local.index = local.index + pd.Timedelta(hours=utc_offset)
    prof = local.groupby(local.index.hour).mean()
    return [_round(prof.get(h, 0.0), 1) for h in range(24)]


def _energy_kwh(series_w: pd.Series, dt_h: float) -> float:
    return float(series_w.sum()) * dt_h / 1000.0


def _window_kwh(series_w: pd.Series, dt_h: float, utc_offset: float, start_h: int, end_h: int) -> float:
    local = series_w.copy()
    local.index = local.index + pd.Timedelta(hours=utc_offset)
    mask = (local.index.hour >= start_h) & (local.index.hour < end_h)
    return _energy_kwh(local.loc[mask], dt_h)


def _representative_days(
    C: engine.SimContext,
    ac_a: pd.Series,
    ac_b: pd.Series,
    ac_total: pd.Series,
    clipping: pd.Series,
    utc_offset: float,
) -> list[dict]:
    idx_local = C.index + pd.Timedelta(hours=utc_offset)
    df = pd.DataFrame(
        {
            "hour": idx_local.hour + idx_local.minute / 60.0,
            "east_kw": ac_a.to_numpy() / 1000.0,
            "west_kw": ac_b.to_numpy() / 1000.0,
            "combined_kw": ac_total.to_numpy() / 1000.0,
            "clipping_kw": clipping.to_numpy() / 1000.0,
        },
        index=idx_local,
    )
    out = []
    for month, day, label in [(3, 21, "March equinox"), (6, 21, "June solstice"),
                              (9, 21, "September equinox"), (12, 21, "December solstice")]:
        mask = (df.index.month == month) & (df.index.day == day)
        if not mask.any():
            doy = pd.Timestamp(2021, month, day).dayofyear
            days = pd.Series(df.index.dayofyear, index=df.index)
            nearest = int((days - doy).abs().idxmin().dayofyear)
            mask = df.index.dayofyear == nearest
        d = df.loc[mask].sort_values("hour")
        out.append({
            "label": label,
            "month": month,
            "day": day,
            "hours": [_round(v, 2) for v in d["hour"].tolist()],
            "east_kw": [_round(v, 1) for v in d["east_kw"].tolist()],
            "west_kw": [_round(v, 1) for v in d["west_kw"].tolist()],
            "combined_kw": [_round(v, 1) for v in d["combined_kw"].tolist()],
            "clipping_kw": [_round(v, 1) for v in d["clipping_kw"].tolist()],
        })
    return out


def evaluate_dual_plane(
    C: engine.SimContext,
    plane_a: dict,
    plane_b: dict,
    inverter_arrangement: str,
    utc_offset: float,
    cache: dict | None = None,
    fast: bool = False,
    include_series: bool = False,
) -> dict:
    cache = cache if cache is not None else {}
    share_a = float(plane_a["dc_share_pct"]) / 100.0
    share_b = float(plane_b["dc_share_pct"]) / 100.0
    if share_a <= 0 or share_b <= 0 or abs((share_a + share_b) - 1.0) > 1e-6:
        raise ValueError("East-West DC shares must be positive and sum to 100%")

    prof_a = _plane_profile(C, plane_a["tilt"], plane_a["azimuth"], cache, fast=fast)
    prof_b = _plane_profile(C, plane_b["tilt"], plane_b["azimuth"], cache, fast=fast)
    pdc_a = prof_a["net_dc_per_w"] * C.pdc0 * share_a
    pdc_b = prof_b["net_dc_per_w"] * C.pdc0 * share_b

    if inverter_arrangement == "separate":
        combo = combine_separate_inverter_blocks(pdc_a, pdc_b, C, share_a)
    else:
        combo = combine_shared_inverter(pdc_a, pdc_b, C)

    dt = C.dt_h
    ac = combo["ac"]
    ac_a = combo["plane_ac"]["A"]
    ac_b = combo["plane_ac"]["B"]
    clipping = combo["clipping"]
    dc_kwp = C.pdc0 / 1000.0
    e_ac_kwh = _energy_kwh(ac, dt)
    e_dc_net_kwh = _energy_kwh(pdc_a + pdc_b, dt)
    clip_kwh = _energy_kwh(clipping, dt)
    poa_weighted = prof_a["poa"] * share_a + prof_b["poa"] * share_b
    poa_insol = float(poa_weighted.sum()) * dt / 1000.0
    pr = (e_ac_kwh / dc_kwp) / poa_insol if poa_insol > 0 else 0.0
    cap_factor = e_ac_kwh / (C.ac_w / 1000.0 * len(C.index) * dt) if C.ac_w > 0 else 0.0
    weighted_temp = prof_a["tcell"] * share_a + prof_b["tcell"] * share_b
    active = poa_weighted > 50

    plane_results = []
    for key, plane, share, prof, pdc, pac in [
        ("A", plane_a, share_a, prof_a, pdc_a, ac_a),
        ("B", plane_b, share_b, prof_b, pdc_b, ac_b),
    ]:
        cap_kwp = C.pdc0 * share / 1000.0
        e_plane_kwh = _energy_kwh(pac, dt)
        plane_results.append({
            "key": key,
            "label": plane.get("label") or f"Plane {key}",
            "tilt": _round(plane["tilt"], 2),
            "azimuth": _round(_az(plane["azimuth"]), 2),
            "azimuth_defined": bool(float(plane["tilt"]) > 0.05),
            "dc_share_pct": _round(share * 100.0, 2),
            "dc_capacity_mwp": _round(cap_kwp / 1000.0, 4),
            "poa_kwh_m2": _round(float(prof["poa"].sum()) * dt / 1000.0, 1),
            "dc_net_mwh": _round(_energy_kwh(pdc, dt) / 1000.0, 2),
            "ac_energy_mwh": _round(e_plane_kwh / 1000.0, 2),
            "specific_yield": _round(e_plane_kwh / cap_kwp if cap_kwp else 0.0, 0),
            "monthly_mwh": _monthly(pac, dt),
        })

    result = {
        # Keep unrounded annual energy for optimization; public KPIs stay rounded.
        "_energy_mwh_raw": e_ac_kwh / 1000.0,
        "planes": {
            "a": {**plane_a, "azimuth": _az(plane_a["azimuth"])},
            "b": {**plane_b, "azimuth": _az(plane_b["azimuth"])},
        },
        "kpis": {
            "energy_mwh": _round(e_ac_kwh / 1000.0, 1),
            "specific_yield": _round(e_ac_kwh / dc_kwp, 0),
            "performance_ratio": _round(pr * 100.0, 1),
            "capacity_factor": _round(cap_factor * 100.0, 1),
            "poa_insolation": _round(poa_insol, 0),
            "clipping_loss_pct": _round(100.0 * clip_kwh / e_dc_net_kwh, 2) if e_dc_net_kwh else 0.0,
            "clipping_mwh": _round(clip_kwh / 1000.0, 2),
            "dc_net_mwh": _round(e_dc_net_kwh / 1000.0, 2),
            "mean_cell_temp": _round(float(weighted_temp[active].mean()), 1) if active.any() else 0.0,
            "morning_kwh": _round(_window_kwh(ac, dt, utc_offset, 6, 10), 1),
            "evening_kwh": _round(_window_kwh(ac, dt, utc_offset, 15, 19), 1),
        },
        "plane_results": plane_results,
        "monthly": {
            "east_mwh": _monthly(ac_a, dt),
            "west_mwh": _monthly(ac_b, dt),
            "combined_mwh": _monthly(ac, dt),
            "clipping_mwh": _monthly(clipping, dt),
            "poa_kwh_m2": _monthly_poa(poa_weighted, dt),
            "specific_yield": [_round(v * 1000.0 / dc_kwp, 1) for v in _monthly(ac, dt)],
        },
        "representative_days": _representative_days(C, ac_a, ac_b, ac, clipping, utc_offset),
        "day_profile_kw": {
            "east": _hour_profile(ac_a, utc_offset),
            "west": _hour_profile(ac_b, utc_offset),
            "combined": _hour_profile(ac, utc_offset),
        },
    }
    if include_series:
        result["_series"] = {
            "ac": ac,
            "ac_a": ac_a,
            "ac_b": ac_b,
            "pdc_a": pdc_a,
            "pdc_b": pdc_b,
            "clipping": clipping,
        }
    return result


def _candidate_row(candidate: dict, result: dict) -> dict:
    k = result["kpis"]
    return {
        **candidate,
        # Ranking on the one-decimal public KPI can make many angles tie,
        # especially on small plants; retain full precision until presentation.
        "energy_mwh": result["_energy_mwh_raw"],
        "specific_yield": k["specific_yield"],
        "clipping_loss_pct": k["clipping_loss_pct"],
        "morning_kwh": k["morning_kwh"],
        "evening_kwh": k["evening_kwh"],
    }


def _evaluate_candidate(C, cand, inverter_arrangement, utc_offset, cache, fast):
    a = _plane_dict("East / Plane A", cand["tilt_a"], cand["azimuth_a"], cand["share_a"])
    b = _plane_dict("West / Plane B", cand["tilt_b"], cand["azimuth_b"], 100.0 - cand["share_a"])
    return evaluate_dual_plane(C, a, b, inverter_arrangement, utc_offset, cache, fast=fast)


def _rank_exact(C, candidates, inverter_arrangement, utc_offset, cache, exact_n):
    rows = []
    for cand in candidates[:exact_n]:
        exact = _evaluate_candidate(C, cand, inverter_arrangement, utc_offset, cache, fast=False)
        rows.append(_candidate_row(cand, exact))
    rows.sort(key=lambda r: r["energy_mwh"], reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def optimize_symmetric(req, C: engine.SimContext, utc_offset: float, progress: Callable | None = None) -> dict:
    search = req.search
    tilts = _optimizer_tilts(
        search.common_tilt_min, search.common_tilt_max, search.common_tilt_step, "common"
    )
    east_azs = _axis(search.east_az_min, search.east_az_max, search.east_az_step)
    splits = (
        _axis(search.split_min_pct, search.split_max_pct, search.split_step_pct)
        if req.optimize_split
        else [50.0]
    )
    cache: dict = {}
    grid_e = np.zeros((len(tilts), len(east_azs)))
    grid_sy = np.zeros_like(grid_e)
    grid_split = np.zeros_like(grid_e)
    candidates = []
    total = len(tilts) * len(east_azs) * len(splits)
    done = 0

    for i, tilt in enumerate(tilts):
        for j, east_az in enumerate(east_azs):
            best = None
            for split in splits:
                cand = {
                    "tilt_a": float(tilt),
                    "azimuth_a": _az(east_az),
                    "tilt_b": float(tilt),
                    "azimuth_b": _az(east_az + 180.0),
                    "share_a": float(split),
                    "share_b": float(100.0 - split),
                    "arrangement": "symmetric",
                }
                fast = _evaluate_candidate(C, cand, req.inverter_arrangement, utc_offset, cache, fast=True)
                row = _candidate_row(cand, fast)
                candidates.append(row)
                if best is None or row["energy_mwh"] > best["energy_mwh"]:
                    best = row
                done += 1
                if progress:
                    progress(done, total)
            grid_e[i, j] = best["energy_mwh"]
            grid_sy[i, j] = best["specific_yield"]
            grid_split[i, j] = best["share_a"]

    candidates.sort(key=lambda r: r["energy_mwh"], reverse=True)
    exact_rank = _rank_exact(
        C, candidates, req.inverter_arrangement, utc_offset, cache, req.search.exact_rerank_count
    )
    # 1° local refinement around the grid best (exact evaluations, no interpolation)
    refined = _refine_symmetric_1deg(C, exact_rank[0], req, utc_offset, cache)
    if refined and refined[0]["energy_mwh"] > exact_rank[0]["energy_mwh"]:
        merged = {(r["tilt_a"], r["azimuth_a"], r["share_a"]): r for r in exact_rank + refined}
        exact_rank = sorted(merged.values(), key=lambda r: r["energy_mwh"], reverse=True)
        for i, r in enumerate(exact_rank, 1):
            r["rank"] = i
    best = exact_rank[0]
    plane_a = _plane_dict("East plane", best["tilt_a"], best["azimuth_a"], best["share_a"])
    plane_b = _plane_dict("West plane", best["tilt_b"], best["azimuth_b"], best["share_b"])
    detail = evaluate_dual_plane(
        C, plane_a, plane_b, req.inverter_arrangement, utc_offset, cache, fast=False, include_series=True
    )
    return {
        "detail": detail,
        "ranked_candidates": exact_rank[:25],
        "search": {
            "type": "symmetric_grid",
            "refined_resolution_deg": 1.0,
            "minimum_physical_tilt_deg": MIN_OPTIMIZER_TILT_DEG,
            "tilts": tilts,
            "east_azimuths": east_azs,
            "splits_pct": splits,
            "heatmap": {
                "energy_mwh": np.round(grid_e, 2).tolist(),
                "specific_yield": np.round(grid_sy, 1).tolist(),
                "best_east_share_pct": np.round(grid_split, 1).tolist(),
            },
        },
    }


def _plane_candidates(C, tilts, azimuths, cache, label, count):
    rows = []
    for t in tilts:
        for a in azimuths:
            prof = _plane_profile(C, t, a, cache, fast=True)
            dc_kwh_per_w = float(prof["net_dc_per_w"].sum()) * C.dt_h / 1000.0
            rows.append({"tilt": t, "azimuth": _az(a), "dc_kwh_per_w": dc_kwh_per_w, "label": label})
    rows.sort(key=lambda r: r["dc_kwh_per_w"], reverse=True)
    return rows[:count]


def _local_values(center, step, lo, hi):
    """Small numeric candidates around `center` for split refinement."""
    offs = {-float(step), -2.0, -1.0, 0.0, 1.0, 2.0, float(step)}
    vals = sorted({min(max(center + off, lo), hi) for off in offs})
    return vals


def _local_1deg_values(center, radius, lo, hi):
    """All integer-degree candidates in a bounded local box, plus the seed."""
    c = min(max(float(center), float(lo)), float(hi))
    lo_v = max(float(lo), c - float(radius))
    hi_v = min(float(hi), c + float(radius))
    vals = {c}
    # Include fractional user bounds only when they lie in the local window.
    if lo_v == float(lo): vals.add(lo_v)
    if hi_v == float(hi): vals.add(hi_v)
    start = int(np.ceil(lo_v))
    stop = int(np.floor(hi_v))
    for v in range(start, stop + 1):
        vals.add(float(v))
    return sorted(v for v in vals if lo_v <= v <= hi_v)


def _local_refine_radius(step):
    """Half-step local radius, capped so four-dimensional refinement stays fast."""
    return max(1.0, min(6.0, float(step) / 2.0 + 0.5))


def _refine_symmetric_1deg(C, best, req, utc_offset, cache):
    """1° local box around the symmetric-grid best; exact rerank of the top few."""
    s = req.search
    lo_t = max(float(s.common_tilt_min), MIN_OPTIMIZER_TILT_DEG)
    tilts = engine._refinement_axis(best["tilt_a"], s.common_tilt_step, lo_t, s.common_tilt_max)
    az_center = best["azimuth_a"]
    if az_center < s.east_az_min and az_center + 360.0 <= s.east_az_max:
        az_center += 360.0  # 360° is stored as the equivalent 0° bearing.
    azs = engine._refinement_axis(az_center, s.east_az_step, s.east_az_min, s.east_az_max)
    rows = []
    for t in tilts:
        for a in azs:
            cand = {"tilt_a": float(t), "azimuth_a": _az(a),
                    "tilt_b": float(t), "azimuth_b": _az(a + 180.0),
                    "share_a": best["share_a"], "share_b": 100.0 - best["share_a"],
                    "arrangement": "symmetric_refined_1deg"}
            fast = _evaluate_candidate(C, cand, req.inverter_arrangement, utc_offset, cache, fast=True)
            rows.append(_candidate_row(cand, fast))
    rows.sort(key=lambda r: r["energy_mwh"], reverse=True)
    return _rank_exact(C, rows, req.inverter_arrangement, utc_offset, cache, 5)


def optimize_independent(req, C: engine.SimContext, utc_offset: float, progress: Callable | None = None) -> dict:
    s = req.search
    cache: dict = {}
    a_tilts = _optimizer_tilts(s.a_tilt_min, s.a_tilt_max, s.a_tilt_step, "Plane A")
    a_azs = _axis(s.a_az_min, s.a_az_max, s.a_az_step)
    b_tilts = _optimizer_tilts(s.b_tilt_min, s.b_tilt_max, s.b_tilt_step, "Plane B")
    b_azs = _axis(s.b_az_min, s.b_az_max, s.b_az_step)
    splits = _axis(s.split_min_pct, s.split_max_pct, s.split_step_pct) if req.optimize_split else [50.0]

    top_a = _plane_candidates(C, a_tilts, a_azs, cache, "A", s.top_plane_count)
    top_b = _plane_candidates(C, b_tilts, b_azs, cache, "B", s.top_plane_count)
    coarse = []
    total = len(top_a) * len(top_b) * len(splits)
    done = 0
    for pa in top_a:
        for pb in top_b:
            for split in splits:
                cand = {
                    "tilt_a": pa["tilt"], "azimuth_a": pa["azimuth"],
                    "tilt_b": pb["tilt"], "azimuth_b": pb["azimuth"],
                    "share_a": split, "share_b": 100.0 - split,
                    "arrangement": "independent",
                }
                fast = _evaluate_candidate(C, cand, req.inverter_arrangement, utc_offset, cache, fast=True)
                coarse.append(_candidate_row(cand, fast))
                done += 1
                if progress:
                    progress(done, total)
    coarse.sort(key=lambda r: r["energy_mwh"], reverse=True)

    seed = coarse[0]
    refined = list(coarse[:max(10, s.exact_rerank_count)])
    a_t2 = _local_1deg_values(seed["tilt_a"], _local_refine_radius(s.a_tilt_step),
                              max(s.a_tilt_min, MIN_OPTIMIZER_TILT_DEG), s.a_tilt_max)
    a_center = seed["azimuth_a"]
    if a_center < s.a_az_min and a_center + 360.0 <= s.a_az_max:
        a_center += 360.0
    a_a2 = _local_1deg_values(a_center, _local_refine_radius(s.a_az_step),
                              s.a_az_min, s.a_az_max)
    b_t2 = _local_1deg_values(seed["tilt_b"], _local_refine_radius(s.b_tilt_step),
                              max(s.b_tilt_min, MIN_OPTIMIZER_TILT_DEG), s.b_tilt_max)
    b_center = seed["azimuth_b"]
    if b_center < s.b_az_min and b_center + 360.0 <= s.b_az_max:
        b_center += 360.0
    b_a2 = _local_1deg_values(b_center, _local_refine_radius(s.b_az_step),
                              s.b_az_min, s.b_az_max)
    split2 = _local_values(seed["share_a"], s.split_step_pct, s.split_min_pct, s.split_max_pct) if req.optimize_split else [50.0]

    for ta in a_t2:
        for aa in a_a2:
            for tb in b_t2:
                for ab in b_a2:
                    for split in split2:
                        cand = {
                            "tilt_a": ta, "azimuth_a": _az(aa),
                            "tilt_b": tb, "azimuth_b": _az(ab),
                            "share_a": split, "share_b": 100.0 - split,
                            "arrangement": "independent_refined",
                        }
                        fast = _evaluate_candidate(C, cand, req.inverter_arrangement, utc_offset, cache, fast=True)
                        refined.append(_candidate_row(cand, fast))

    dedup = {}
    for row in refined:
        key = (row["tilt_a"], row["azimuth_a"], row["tilt_b"], row["azimuth_b"], row["share_a"])
        if key not in dedup or row["energy_mwh"] > dedup[key]["energy_mwh"]:
            dedup[key] = row
    ranked_fast = sorted(dedup.values(), key=lambda r: r["energy_mwh"], reverse=True)
    exact_rank = _rank_exact(
        C, ranked_fast, req.inverter_arrangement, utc_offset, cache, s.exact_rerank_count
    )
    best = exact_rank[0]
    plane_a = _plane_dict("Plane A", best["tilt_a"], best["azimuth_a"], best["share_a"])
    plane_b = _plane_dict("Plane B", best["tilt_b"], best["azimuth_b"], best["share_b"])
    detail = evaluate_dual_plane(
        C, plane_a, plane_b, req.inverter_arrangement, utc_offset, cache, fast=False, include_series=True
    )
    return {
        "detail": detail,
        "ranked_candidates": exact_rank[:25],
        "search": {
            "type": "independent_coarse_to_fine",
            "refined_resolution_deg": 1.0,
            "minimum_physical_tilt_deg": MIN_OPTIMIZER_TILT_DEG,
            "top_plane_count": s.top_plane_count,
            "coarse_candidates": len(coarse),
            "refined_candidates": len(ranked_fast),
            "heatmap": None,
        },
    }


def _single_plane_comparison(C, sweep_cfg: dict, utc_offset: float, ew_detail: dict) -> dict:
    sw = engine.sweep(C, sweep_cfg)
    sw = engine.refine_optimum(C, sw, sweep_cfg)
    opt = sw["optimum"]
    poa = engine._poa_effective(opt["tilt"], opt["azimuth"], C)
    ac, _, _ = engine._ac_series(poa, C)
    single = engine.detail(opt["tilt"], opt["azimuth"], C, utc_offset)
    single_energy = single["kpis"]["energy_mwh"]
    ew_energy = ew_detail["kpis"]["energy_mwh"]
    series = ew_detail.get("_series") or {}
    ew_ac = series.get("ac")
    if ew_ac is not None:
        ew_morning = _window_kwh(ew_ac, C.dt_h, utc_offset, 6, 10)
        ew_evening = _window_kwh(ew_ac, C.dt_h, utc_offset, 15, 19)
    else:
        ew_morning = ew_detail["kpis"]["morning_kwh"]
        ew_evening = ew_detail["kpis"]["evening_kwh"]
    single_morning = _window_kwh(ac, C.dt_h, utc_offset, 6, 10)
    single_evening = _window_kwh(ac, C.dt_h, utc_offset, 15, 19)
    # Calculate differences from actual energy, not display-rounded MWh values.
    single_energy_raw = _energy_kwh(ac, C.dt_h) / 1000.0
    ew_energy_raw = ew_detail["_energy_mwh_raw"]
    delta = (ew_energy_raw / single_energy_raw - 1.0) * 100.0 if single_energy_raw else 0.0
    statement = (
        "East-West is higher in annual energy for this weather, loss stack and inverter topology."
        if delta > 0.05
        else "Single-plane remains higher in annual energy for this weather, loss stack and inverter topology."
        if delta < -0.05
        else "Annual energy is effectively tied; use hourly profile and layout constraints to decide."
    )
    return {
        "single_plane_best": {
            "tilt": opt["tilt"],
            "azimuth": opt["azimuth"],
            "azimuth_defined": opt["azimuth_defined"],
            "refined_resolution_deg": sw.get("refined_resolution_deg"),
            "energy_mwh": single_energy,
            "specific_yield": single["kpis"]["specific_yield"],
            "clipping_loss_pct": single["kpis"]["clipping_loss_pct"],
            "morning_kwh": _round(single_morning, 1),
            "evening_kwh": _round(single_evening, 1),
        },
        "east_west": {
            "energy_mwh": ew_energy,
            "specific_yield": ew_detail["kpis"]["specific_yield"],
            "clipping_loss_pct": ew_detail["kpis"]["clipping_loss_pct"],
            "morning_kwh": _round(ew_morning, 1),
            "evening_kwh": _round(ew_evening, 1),
        },
        "delta_energy_pct": _round(delta, 2),
        "delta_morning_pct": _round((ew_morning / single_morning - 1.0) * 100.0, 2) if single_morning else 0.0,
        "delta_evening_pct": _round((ew_evening / single_evening - 1.0) * 100.0, 2) if single_evening else 0.0,
        "statement": statement,
    }


def _warnings(req, C: engine.SimContext, detail: dict, forced_fixed: bool) -> list[str]:
    warnings = [
        "pvlib 0.15.1 has no exact alternating back-to-back East-West infinite-sheds geometry here; each plane is modelled as an independent fixed shed and then electrically combined.",
    ]
    if forced_fixed:
        warnings.append("The global mounting selection was a tracker; East-West dual-plane analysis was forced to fixed-tilt planes.")
    if req.mode == "optimize" and (
        req.search.common_tilt_min < MIN_OPTIMIZER_TILT_DEG
        or req.search.a_tilt_min < MIN_OPTIMIZER_TILT_DEG
        or req.search.b_tilt_min < MIN_OPTIMIZER_TILT_DEG
    ):
        warnings.append(
            f"Automatic East-West optimization enforces a minimum physical tilt of "
            f"{MIN_OPTIMIZER_TILT_DEG:g} deg. A 0 deg plane is horizontal and has no meaningful azimuth."
        )
    if req.inverter_arrangement == "shared":
        warnings.append("Shared inverter plane-level AC is allocated in proportion to each plane's DC contribution at each timestamp; the combined AC energy and clipping are exact for the shared pool.")
    if any(not p["azimuth_defined"] for p in detail["plane_results"]):
        warnings.append("A zero-tilt plane is physically horizontal, so its azimuth is not meaningful even though a wrapped azimuth is shown for bookkeeping.")
    if C.bifaciality > 0:
        warnings.append("Bifacial rear gain is approximate for East-West racks because cross-plane rear-side obstruction is not represented by the two independent shed models.")
    if req.mode == "optimize":
        warnings.append("The 1-degree refinement is local to selected coarse candidates; it is not a global exhaustive 1-degree search. Fast-model candidates are shortlisted before exact reranking, so the best detailed-model candidate may be missed.")
    if req.arrangement == "independent" and req.mode == "optimize":
        warnings.append("Independent optimization uses deterministic coarse-to-fine search and exact reranking of top candidates, not a full brute-force four-dimensional grid.")
    return warnings


def _calculation_steps(req, C: engine.SimContext, detail: dict) -> list[dict]:
    a, b = detail["plane_results"]
    k = detail["kpis"]
    inv_text = (
        "Shared inverter pool: net DC from both planes is added first, PVWatts inverter efficiency is applied once, then the total AC output is clipped at the plant AC nameplate."
        if req.inverter_arrangement == "shared"
        else "Separate proportional blocks: each plane receives its proportional AC nameplate, is converted and clipped separately, and the two AC outputs are then added."
    )
    return [
        {
            "title": "1. Capacity split check",
            "items": [
                f"Total plant DC remains {C.pdc0 / 1e6:.3f} MWp.",
                f"{a['label']}: {C.pdc0 / 1e6:.3f} x {a['dc_share_pct']:.1f}% = {a['dc_capacity_mwp']:.3f} MWp.",
                f"{b['label']}: {C.pdc0 / 1e6:.3f} x {b['dc_share_pct']:.1f}% = {b['dc_capacity_mwp']:.3f} MWp.",
                f"Check: {a['dc_capacity_mwp']:.3f} + {b['dc_capacity_mwp']:.3f} = {(a['dc_capacity_mwp'] + b['dc_capacity_mwp']):.3f} MWp, so capacity is not doubled.",
            ],
        },
        {
            "title": "2. Plane irradiance and DC power",
            "items": [
                f"{a['label']} uses tilt {a['tilt']} deg, azimuth {a['azimuth']} deg and receives {a['poa_kwh_m2']} kWh/m2 POA irradiation.",
                f"{b['label']} uses tilt {b['tilt']} deg, azimuth {b['azimuth']} deg and receives {b['poa_kwh_m2']} kWh/m2 POA irradiation.",
                f"DC power is calculated hour-by-hour using the selected {C.dc_model} DC model, module gamma {C.gamma_pdc:.5f}/degC and the DC loss multiplier {C.dc_derate:.4f}.",
            ],
        },
        {
            "title": "3. Inverter combination",
            "items": [
                inv_text,
                f"Total AC clamp is {C.ac_w / 1e6:.3f} MWac and nominal inverter efficiency is {C.eta_nom * 100:.2f}%.",
                f"Annual clipping is {k['clipping_mwh']} MWh, equal to {k['clipping_loss_pct']}% of net DC energy entering the inverter model.",
            ],
        },
        {
            "title": "4. Final KPI calculation",
            "items": [
                f"Annual AC energy = hourly AC sum x timestep = {k['energy_mwh']} MWh.",
                f"Specific yield = annual AC kWh / total plant kWp = {k['specific_yield']} kWh/kWp.",
                f"Capacity factor = annual AC kWh / ({C.ac_w / 1000:.0f} kWac x 8760 h equivalent) = {k['capacity_factor']}%.",
                f"Performance ratio uses the weighted East-West POA reference and equals {k['performance_ratio']}%.",
            ],
        },
    ]


def strip_internal_series(detail: dict) -> dict:
    detail.pop("_series", None)
    detail.pop("_energy_mwh_raw", None)
    return detail


# --------------------------------------------------------------------------- #
# Inverter-overload (DC/AC ratio) optimizer
# --------------------------------------------------------------------------- #
def _scaled_combined_ac(prof_a, prof_b, share_a, dc_w, arrangement, C):
    """AC series for a given installed DC (W) at fixed plant AC nameplate."""
    pdc_a = prof_a["net_dc_per_w"] * dc_w * share_a
    pdc_b = prof_b["net_dc_per_w"] * dc_w * (1.0 - share_a)
    if arrangement == "separate":
        combo = combine_separate_inverter_blocks(pdc_a, pdc_b, C, share_a)
    else:
        combo = combine_shared_inverter(pdc_a, pdc_b, C)
    return combo, pdc_a, pdc_b


def overload_sweep(C: engine.SimContext, plane_a: dict, plane_b: dict,
                   inverter_arrangement: str, single_ref: dict,
                   ilr_values: list[float], clip_threshold_pct: float,
                   hardware_max_ilr: float | None, utc_offset: float) -> dict:
    """Sweep the DC/AC ratio at fixed AC nameplate for dual-plane vs single-plane.

    The per-Wdc plane profiles are ILR-independent, so each ILR point is a pure
    electrical recombination — the sweep is exact, not interpolated. Annual AC
    energy is monotonically non-decreasing in DC, so 'maximum yield' alone always
    picks the largest DC; the engineering optimum reported here is the largest
    ILR whose clipping stays within the chosen threshold and the hardware
    string-capacity limit.
    """
    cache: dict = {}
    share_a = float(plane_a["dc_share_pct"]) / 100.0
    prof_a = _plane_profile(C, plane_a["tilt"], plane_a["azimuth"], cache)
    prof_b = _plane_profile(C, plane_b["tilt"], plane_b["azimuth"], cache)
    prof_s = _plane_profile(C, single_ref["tilt"], single_ref["azimuth"], cache)

    dt = C.dt_h
    ac_kw = C.ac_w / 1000.0
    rows = []
    raw_rows = []
    prev = None
    for ilr in ilr_values:
        dc_w = C.ac_w * float(ilr)
        dc_kwp = dc_w / 1000.0
        combo, _, _ = _scaled_combined_ac(prof_a, prof_b, share_a, dc_w, inverter_arrangement, C)
        e_dual = _energy_kwh(combo["ac"], dt)
        dcin_dual = _energy_kwh(prof_a["net_dc_per_w"] * dc_w * share_a
                                + prof_b["net_dc_per_w"] * dc_w * (1.0 - share_a), dt)
        clip_dual = _energy_kwh(combo["clipping"], dt)
        # single-plane reference on the same inverter pool
        pdc_s = prof_s["net_dc_per_w"] * dc_w
        un_s = engine._pvwatts_unclipped(pdc_s, C)
        ac_s = un_s.clip(lower=0.0, upper=C.ac_w)
        e_single = _energy_kwh(ac_s, dt)
        clip_single = _energy_kwh((un_s - ac_s).clip(lower=0.0), dt)
        dcin_single = _energy_kwh(pdc_s, dt)
        row = {
            "ilr": float(ilr),
            "dc_mwp": _round(dc_kwp / 1000.0, 3),
            "dual_mwh": _round(e_dual / 1000.0, 1),
            "dual_clip_pct": 100.0 * clip_dual / dcin_dual if dcin_dual else 0.0,
            "dual_specific": _round(e_dual / dc_kwp, 0),
            "single_mwh": _round(e_single / 1000.0, 1),
            "single_clip_pct": 100.0 * clip_single / dcin_single if dcin_single else 0.0,
            "single_specific": _round(e_single / dc_kwp, 0),
            "dual_capacity_factor_pct": _round(100.0 * e_dual / (ac_kw * len(C.index) * dt), 1),
        }
        if prev is not None:
            d_dc_kwp = dc_kwp - prev["_dc_kwp"]
            row["dual_marginal_kwh_per_kwp"] = _round((e_dual - prev["_e_dual"]) / d_dc_kwp, 0) if d_dc_kwp else 0.0
            row["single_marginal_kwh_per_kwp"] = _round((e_single - prev["_e_single"]) / d_dc_kwp, 0) if d_dc_kwp else 0.0
        prev = {"_dc_kwp": dc_kwp, "_e_dual": e_dual, "_e_single": e_single}
        rows.append(row)
        raw_rows.append({"ilr": float(ilr), "dual_clip_pct": 100.0 * clip_dual / dcin_dual if dcin_dual else 0.0,
                         "single_clip_pct": 100.0 * clip_single / dcin_single if dcin_single else 0.0,
                         "dual_kwh": e_dual, "single_kwh": e_single})

    def best_within(clip_key, thr):
        # Rounded display values must not decide safety/design constraints.
        ok = [i for i, raw in enumerate(raw_rows) if raw[clip_key] <= thr + 1e-9
              and (hardware_max_ilr is None or raw["ilr"] <= hardware_max_ilr + 1e-9)]
        return ok[-1] if ok else None

    dual_index = best_within("dual_clip_pct", clip_threshold_pct)
    single_index = best_within("single_clip_pct", clip_threshold_pct)
    rec_dual = rows[dual_index] if dual_index is not None else None
    rec_single = rows[single_index] if single_index is not None else None
    max_row = rows[-1]
    hardware_note = None
    if hardware_max_ilr is not None and raw_rows[-1]["ilr"] > hardware_max_ilr:
        hardware_note = (
            f"ILR values above {hardware_max_ilr} are shown for the curve but exceed the "
            "string-capacity of the selected inverter and cannot be built with it."
        )

    gain = None
    preferred_method = None
    if rec_dual and rec_single:
        # Compare raw annual energies; display-rounded MWh can invert the verdict.
        dual_energy = raw_rows[dual_index]["dual_kwh"]
        single_energy = raw_rows[single_index]["single_kwh"]
        preferred_method = "dual" if dual_energy > single_energy else "single" if dual_energy < single_energy else "tied"
        gain = {
            "ilr_advantage": _round(raw_rows[dual_index]["ilr"] - raw_rows[single_index]["ilr"], 3),
            "energy_advantage_mwh": _round((raw_rows[dual_index]["dual_kwh"] - raw_rows[single_index]["single_kwh"]) / 1000.0, 1),
            "energy_advantage_pct": _round(
                100.0 * (raw_rows[dual_index]["dual_kwh"] / raw_rows[single_index]["single_kwh"] - 1.0), 2)
            if raw_rows[single_index]["single_kwh"] else 0.0,
        }

    # Plot recommended cases only when both exist. A fallback to the first
    # swept ILR would silently label a non-compliant case as recommended.
    day_response = None
    if dual_index is not None and single_index is not None:
        ilr_d = raw_rows[dual_index]["ilr"]
        ilr_s = raw_rows[single_index]["ilr"]
        combo_d, _, _ = _scaled_combined_ac(prof_a, prof_b, share_a, C.ac_w * ilr_d,
                                            inverter_arrangement, C)
        pdc_s_rec = prof_s["net_dc_per_w"] * C.ac_w * ilr_s
        un_s_rec = engine._pvwatts_unclipped(pdc_s_rec, C)
        ac_s_rec = un_s_rec.clip(lower=0.0, upper=C.ac_w)
        day_response = {
            "dual_ilr": ilr_d,
            "single_ilr": ilr_s,
            "ac_limit_kw": _round(C.ac_w / 1000.0, 1),
            "dual_kw": _hour_profile(combo_d["ac"], utc_offset),
            "dual_east_kw": _hour_profile(combo_d["plane_ac"]["A"], utc_offset),
            "dual_west_kw": _hour_profile(combo_d["plane_ac"]["B"], utc_offset),
            "single_kw": _hour_profile(ac_s_rec, utc_offset),
            "dual_clipping_kw": _hour_profile(combo_d["clipping"], utc_offset),
            "single_clipping_kw": _hour_profile((un_s_rec - ac_s_rec).clip(lower=0.0), utc_offset),
        }

    return {
        "fixed_ac_mw": _round(C.ac_w / 1e6, 3),
        "inverter_arrangement": inverter_arrangement,
        "planes": {"a": plane_a, "b": plane_b},
        "single_ref": single_ref,
        "clip_threshold_pct": clip_threshold_pct,
        "hardware_max_ilr": None if hardware_max_ilr is None else float(hardware_max_ilr),
        "hardware_note": hardware_note,
        "rows": rows,
        "recommended_dual": rec_dual,
        "recommended_single": rec_single,
        "max_in_range": {"ilr": max_row["ilr"], "dual_mwh": max_row["dual_mwh"],
                         "dual_clip_pct": max_row["dual_clip_pct"]},
        "dual_vs_single_at_threshold": gain,
        "preferred_method": preferred_method,
        "hardware_limit_known": hardware_max_ilr is not None,
        "day_response": day_response,
        "methodology": [
            "The plant AC nameplate is held constant; installed DC is swept as ILR x AC.",
            "Per-Wdc hourly DC profiles for each plane are computed once and rescaled exactly for every ILR point — no interpolation.",
            "Shared topology sums both plane DC profiles before one inverter efficiency and clipping step; separate topology clips proportional blocks.",
            ("Annual AC energy never decreases when DC is added; the candidate is the largest swept ILR within the selected clipping threshold"
             + (" and known inverter string-capacity limit." if hardware_max_ilr is not None else "; inverter string-capacity is unknown and must be verified separately.")),
            "Marginal kWh/kWp shows the yield of each additional DC increment and is the input for a value-of-energy decision.",
        ],
    }


def analyze(req, C: engine.SimContext, utc_offset: float, progress: Callable | None = None, forced_fixed: bool = False) -> dict:
    if req.mode == "manual":
        cache: dict = {}
        plane_a = _plane_dict(
            req.plane_a.label or "Plane A",
            req.plane_a.tilt,
            req.plane_a.azimuth,
            req.plane_a.dc_share,
        )
        plane_b = _plane_dict(
            req.plane_b.label or "Plane B",
            req.plane_b.tilt,
            req.plane_b.azimuth,
            req.plane_b.dc_share,
        )
        detail = evaluate_dual_plane(
            C, plane_a, plane_b, req.inverter_arrangement, utc_offset, cache, fast=False, include_series=True
        )
        ranked = [_candidate_row(
            {
                "rank": 1,
                "tilt_a": plane_a["tilt"],
                "azimuth_a": plane_a["azimuth"],
                "tilt_b": plane_b["tilt"],
                "azimuth_b": plane_b["azimuth"],
                "share_a": plane_a["dc_share_pct"],
                "share_b": plane_b["dc_share_pct"],
                "arrangement": "manual",
            },
            detail,
        )]
        search_meta = {"type": "manual", "heatmap": None}
    elif req.arrangement == "independent":
        opt = optimize_independent(req, C, utc_offset, progress)
        detail, ranked, search_meta = opt["detail"], opt["ranked_candidates"], opt["search"]
    else:
        opt = optimize_symmetric(req, C, utc_offset, progress)
        detail, ranked, search_meta = opt["detail"], opt["ranked_candidates"], opt["search"]

    comparison = _single_plane_comparison(C, req.single_plane_sweep.model_dump(), utc_offset, detail)
    result = {
        "mode": req.mode,
        "arrangement": req.arrangement,
        "inverter_arrangement": req.inverter_arrangement,
        "optimize_split": bool(req.optimize_split),
        "optimum": detail["planes"],
        "kpis": detail["kpis"],
        "plane_results": detail["plane_results"],
        "monthly": detail["monthly"],
        "representative_days": detail["representative_days"],
        "day_profile_kw": detail["day_profile_kw"],
        "ranked_candidates": ranked,
        "comparison": comparison,
        "search": search_meta,
        "warnings": _warnings(req, C, detail, forced_fixed),
        "methodology": [
            "Two fixed PV planes are evaluated hour-by-hour using the existing single-plane pvlib chain.",
            "The plant DC nameplate is divided by the requested percentages; the sum of the plane capacities equals the original plant MWp.",
            "Shared topology sums both net DC profiles before one inverter efficiency and clipping calculation.",
            "Separate topology gives each plane a proportional inverter AC block and clips each block independently before adding AC outputs.",
            "Specific yield denominator is the total plant DC kWp; capacity factor denominator is the total plant AC nameplate.",
            "Single-plane comparison is computed with the existing sweep/detail engine and is reported as comparison only, not forced as a recommendation.",
        ],
        "calculation_steps": _calculation_steps(req, C, detail),
    }
    strip_internal_series(detail)
    return result
