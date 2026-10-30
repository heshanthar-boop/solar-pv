"""Sri Lanka solar atlas — progressive country-wide optimization grid.

Computes, cell by cell, the best single-plane orientation and the best
symmetric East-West dual-plane arrangement for a reference 1 MWdc / 1 MWac
system, using the same hourly pvlib chain as the main app with real PVGIS
satellite weather per cell.

Honest resolution note: PVGIS SARAH satellite irradiance has ~5 km native
resolution, so the grid is computed at 0.05-0.25 deg and any clicked point is
served from the nearest computed cell. Finer sampling would only duplicate the
same weather data.

The build is a resumable background job: each finished cell is appended to a
JSON-lines file, so stopping the app (or the build) loses nothing.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import engine
from . import eastwest as ew
from . import weather as wx

# Simplified Sri Lanka land polygon (lon, lat) — mask for grid cells.
SL_POLY = [
    (79.86, 9.80), (80.20, 9.83), (80.55, 9.62), (80.35, 9.45), (80.65, 9.25),
    (81.05, 8.95), (81.25, 8.65), (81.40, 8.30), (81.55, 8.05), (81.80, 7.70),
    (81.88, 7.40), (81.85, 7.05), (81.65, 6.75), (81.45, 6.40), (81.05, 6.15),
    (80.65, 5.98), (80.25, 5.93), (79.98, 6.10), (79.88, 6.50), (79.82, 6.95),
    (79.78, 7.40), (79.72, 7.90), (79.78, 8.35), (79.92, 8.75), (79.98, 9.10),
    (80.08, 9.40), (79.86, 9.80),
]

# Reference system for atlas comparability: 1 MWdc / 1 MWac (ILR 1.0 keeps the
# orientation comparison free of clipping effects), default bifacial module and
# loss stack — stated in the UI legend.
ATLAS_PLANT = dict(
    dc_mw=1.0, ac_mw=1.0, eta_inv_nom=0.988, albedo=0.20, gcr=0.40,
    height_m=1.5, pitch_m=5.955, collector_w=2.382, bifaciality=0.85,
    gamma_pdc=-0.0026, dc_derate=0.886, temp_model="faiman",
    dc_model="pvwatts", mounting="fixed", inverter_id=None,
)
UTC_OFFSET = 5.5


def _point_in_poly(lon: float, lat: float) -> bool:
    inside = False
    n = len(SL_POLY)
    j = n - 1
    for i in range(n):
        xi, yi = SL_POLY[i]
        xj, yj = SL_POLY[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = True if not inside else False
        j = i
    return inside


def atlas_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SolarYieldOptimizer"
    else:
        base = Path(__file__).resolve().parent.parent
    d = base / "atlas"
    d.mkdir(parents=True, exist_ok=True)
    return d


def grid_cells(resolution: float) -> list[tuple[float, float]]:
    lats = np.round(np.arange(5.90, 9.90 + 1e-9, resolution), 4)
    lons = np.round(np.arange(79.60, 81.90 + 1e-9, resolution), 4)
    return [(float(la), float(lo)) for la in lats for lo in lons
            if _point_in_poly(float(lo), float(la))]


def _monthly_kwh_per_kwp(ac_w: pd.Series, dt_h: float) -> list[float]:
    # dc reference is exactly 1000 kWp, so kWh/1000 = kWh/kWp
    m = (ac_w * dt_h / 1000.0).groupby(ac_w.index.month).sum() / 1000.0
    return [round(float(m.get(i, 0.0)), 1) for i in range(1, 13)]


def compute_cell(lat: float, lon: float) -> dict:
    """Full optimization of one atlas cell (single + dual plane)."""
    df, meta = wx.get_weather("pvgis_tmy", lat, lon)
    C = engine.build_context(df, lat, lon, 0.0, dict(ATLAS_PLANT), None,
                             meta.get("interval_label", "start"))
    dt = C.dt_h

    # ---- single plane: coarse grid, then local refinement ----
    best = (-1.0, 0.0, 180.0)
    for t in (1, 4, 7, 10, 13, 16, 20, 25):
        for a in range(90, 271, 15):
            e = engine.annual_energy(float(t), float(a), C)
            if e > best[0]:
                best = (e, float(t), float(a))
    e0, t0, a0 = best
    for t in np.arange(max(0.0, t0 - 3), min(30.0, t0 + 3) + 0.1, 1.0):
        for a in np.arange(max(60.0, a0 - 14), min(300.0, a0 + 14) + 0.1, 2.0):
            e = engine.annual_energy(float(t), float(a), C)
            if e > best[0]:
                best = (e, float(t), float(a))
    e1, t1, a1 = best
    poa1 = engine._poa_effective(t1, a1, C)
    ac1, _, _ = engine._ac_series(poa1, C, fast=True)
    monthly_single = _monthly_kwh_per_kwp(ac1, dt)
    sy1 = round(e1 / 1000.0, 0)                      # kWh/kWp (1000 kWp ref)

    # ---- dual plane (symmetric E-W, 50/50, shared inverter pool) ----
    cache: dict = {}
    bestd = None
    for t in (2, 4, 6, 8, 11, 15):
        for a_e in (75, 85, 95, 105, 115):
            pa = ew._plane_dict("E", float(t), float(a_e), 50.0)
            pb = ew._plane_dict("W", float(t), float(a_e + 180), 50.0)
            r = ew.evaluate_dual_plane(C, pa, pb, "shared", UTC_OFFSET, cache, fast=True)
            e = r["kpis"]["energy_mwh"]
            if bestd is None or e > bestd[0]:
                bestd = (e, float(t), float(a_e), r)
    ed, td, aed, rd = bestd
    syd = round(rd["kpis"]["specific_yield"], 0)
    monthly_dual = [round(v, 1) for v in rd["monthly"]["combined_mwh"]]  # = kWh/kWp @1MW

    ws = wx.summary(df)
    return {
        "lat": round(lat, 4), "lon": round(lon, 4),
        "ghi": ws["ghi_annual"], "temp_mean": ws["temp_mean"], "wind_mean": ws["wind_mean"],
        "single": {"tilt": t1, "azimuth": a1, "sy": sy1, "monthly": monthly_single},
        "dual": {"tilt": td, "azimuth_east": aed, "azimuth_west": (aed + 180) % 360,
                 "sy": syd, "monthly": monthly_dual},
        "dual_vs_single_pct": round(100.0 * (syd / sy1 - 1.0), 2) if sy1 else 0.0,
        "computed": time.strftime("%Y-%m-%d %H:%M"),
    }


# --------------------------------------------------------------------------- #
# Resumable background builder (singleton)
# --------------------------------------------------------------------------- #
class _Builder:
    def __init__(self):
        self.lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self.stop_flag = False
        self.state = {"running": False, "resolution": 0.1, "done": 0, "total": 0,
                      "errors": 0, "last_error": None, "current": None,
                      "assumptions": "1 MWdc / 1 MWac (ILR 1.0), bifacial 660 W class, "
                                     "GCR 0.40, standard loss stack, PVGIS TMY per cell"}
        self._load_state()

    def _results_file(self) -> Path:
        return atlas_dir() / f"atlas_{self.state['resolution']:g}.jsonl"

    def _state_file(self) -> Path:
        return atlas_dir() / "state.json"

    def _load_state(self):
        try:
            saved = json.loads(self._state_file().read_text(encoding="utf-8"))
            self.state.update({k: saved[k] for k in ("resolution",) if k in saved})
        except Exception:
            pass
        self._refresh_counts()

    def _save_state(self):
        try:
            self._state_file().write_text(json.dumps(
                {"resolution": self.state["resolution"]}), encoding="utf-8")
        except Exception:
            pass

    def done_keys(self) -> set:
        keys = set()
        f = self._results_file()
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                try:
                    r = json.loads(line)
                    keys.add((r["lat"], r["lon"]))
                except Exception:
                    continue
        return keys

    def _refresh_counts(self):
        cells = grid_cells(self.state["resolution"])
        self.state["total"] = len(cells)
        self.state["done"] = len(self.done_keys())

    def results(self) -> list[dict]:
        out = []
        f = self._results_file()
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
        return out

    def start(self, resolution: float | None = None, max_cells: int | None = None):
        with self.lock:
            if self.state["running"]:
                return self.state
            if resolution and abs(resolution - self.state["resolution"]) > 1e-9:
                self.state["resolution"] = float(resolution)
                self._save_state()
            self._refresh_counts()
            self.stop_flag = False
            self.thread = threading.Thread(target=self._run, args=(max_cells,), daemon=True)
            self.state["running"] = True
            self.thread.start()
        return self.state

    def stop(self):
        self.stop_flag = True
        return self.state

    def _run(self, max_cells: int | None):
        try:
            cells = grid_cells(self.state["resolution"])
            done = self.done_keys()
            pending = [c for c in cells if (round(c[0], 4), round(c[1], 4)) not in done]
            if max_cells:
                pending = pending[:max_cells]
            f = self._results_file()
            for lat, lon in pending:
                if self.stop_flag:
                    break
                self.state["current"] = f"{lat:.2f}, {lon:.2f}"
                try:
                    rec = compute_cell(lat, lon)
                    with open(f, "a", encoding="utf-8") as fh:
                        fh.write(json.dumps(rec) + "\n")
                    self.state["done"] += 1
                except Exception as e:
                    self.state["errors"] += 1
                    self.state["last_error"] = f"{lat:.2f},{lon:.2f}: {str(e)[:160]}"
                    time.sleep(3)              # be gentle after failures
        finally:
            self.state["running"] = False
            self.state["current"] = None


BUILDER = _Builder()


def nearest_cell(lat: float, lon: float) -> dict | None:
    rows = BUILDER.results()
    if not rows:
        return None
    best, bd = None, 1e9
    for r in rows:
        d = (r["lat"] - lat) ** 2 + (r["lon"] - lon) ** 2
        if d < bd:
            bd, best = d, r
    if best is not None:
        best = dict(best)
        best["distance_km"] = round((bd ** 0.5) * 111.0, 1)
    return best
