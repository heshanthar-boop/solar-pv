"""
Solar yield computation engine.

Implements a transparent preliminary-design PV energy model chain using pvlib:

    solar position (NREL SPA)
      -> infinite-sheds front/rear irradiance (Hay-Davies circumsolar diffuse)
      -> incidence-angle modifier (ASHRAE) reflection losses
      -> inter-row shading + rear-side bifacial gain (infinite_sheds, 2D view-factor)
      -> dynamic cell temperature (Faiman / PVsyst / SAPM)
      -> DC power (PVWatts effective-irradiance model, datasheet gamma_pdc)
      -> DC system loss stack (soiling, mismatch, wiring, LID, ...)
      -> inverter conversion + AC clipping (PVWatts inverter, clamped at AC nameplate)

The same chain is swept over a grid of tilt x azimuth angles to map annual
specific yield and locate the optimum, then evaluated in detail at any point.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_FLOOR
from typing import Callable, Optional

import numpy as np
import pandas as pd
import pvlib
from pvlib import irradiance, inverter, pvsystem, temperature, tracking
from pvlib import iam as iam_mod
from pvlib.bifacial import infinite_sheds
from scipy.optimize import least_squares

# Inverter part-load efficiency reference (PVWatts model default)
ETA_INV_REF = 0.9637


# --------------------------------------------------------------------------- #
# Low-light relative-efficiency curve (single-diode shape, datasheet gamma)
# --------------------------------------------------------------------------- #
def build_lowlight_curve(iv: dict):
    """Return (G_grid, rel_eff) capturing the module's relative efficiency vs
    irradiance from a single-diode (De Soto) fit, normalised to 1.0 at 1000 W/m2.

    The single-diode model reproduces the real low-light efficiency droop that
    PVWatts (linear in irradiance) misses. We use it ONLY for the irradiance
    shape; the temperature response keeps the exact datasheet gamma_pmp, because
    De Soto alone cannot match both beta_voc and gamma_pmp without PySAM's CEC
    'Adjust'. Returns None if the fit does not converge.
    """
    try:
        Voc, Isc, Vmp, Imp = iv["voc"], iv["isc"], iv["vmp"], iv["imp"]
        Ns = int(iv.get("cells") or round(Voc / 0.747))
        alpha = Isc * iv["alpha_isc"]
        k, q, Tref = 1.380649e-23, 1.602176634e-19, 298.15
        Vth = k * Tref / q

        def eqs(x):
            IL, Io, Rs, Rsh, n = x
            a = n * Ns * Vth
            def I_at(V, I):
                return IL - Io * (np.exp((V + I * Rs) / a) - 1) - (V + I * Rs) / Rsh
            g = Io / a * np.exp((Vmp + Imp * Rs) / a) + 1 / Rsh
            return [I_at(0, Isc) - Isc, I_at(Voc, 0), I_at(Vmp, Imp) - Imp,
                    Imp - Vmp * g / (1 + Rs * g), 0.1 * (IL - Isc) / Isc]

        r = least_squares(eqs, [Isc, 1e-10, 0.3, 200.0, 1.1],
                          bounds=([Isc * 0.95, 1e-13, 0.0, 20.0, 0.7],
                                  [Isc * 1.1, 1e-6, 1.0, 8000.0, 2.0]),
                          xtol=1e-12, ftol=1e-12, max_nfev=20000)
        if not r.success:
            return None
        IL, Io, Rs, Rsh, n = r.x
        a = n * Ns * Vth
        G = np.array([40, 70, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100], float)
        params = pvsystem.calcparams_desoto(G, 25.0, alpha, a, IL, Io, Rsh, Rs,
                                            EgRef=1.121, dEgdT=-0.0002677)
        pmp = np.asarray(pvsystem.max_power_point(*params, method="newton")["p_mp"], dtype=float)
        eff = pmp / G
        rel = eff / np.interp(1000.0, G, eff)
        rel = np.clip(rel, 0.5, 1.05)
        return G, rel
    except Exception:
        return None


def _timestep_hours(idx: pd.DatetimeIndex) -> float:
    """Resolution-independent timestep in hours (handles ns/us datetime64)."""
    if len(idx) < 2:
        return 1.0
    return float(pd.Series(idx).diff().dropna().median().total_seconds()) / 3600.0


# --------------------------------------------------------------------------- #
# Temperature models
# --------------------------------------------------------------------------- #
def _temp_func(model: str) -> Callable[[pd.Series, pd.Series, pd.Series], pd.Series]:
    """Return cell-temperature function f(poa, temp_air, wind_speed) -> cell temp."""
    if model == "pvsyst":
        # Glass/glass freestanding (good default for bifacial double-glass)
        return lambda poa, ta, ws: temperature.pvsyst_cell(poa, ta, ws, u_c=29.0, u_v=0.0)
    if model == "sapm_open":
        p = temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"]
        return lambda poa, ta, ws: temperature.sapm_cell(poa, ta, ws, **p)
    if model == "sapm_close":
        p = temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["close_mount_glass_glass"]
        return lambda poa, ta, ws: temperature.sapm_cell(poa, ta, ws, **p)
    # Default: Faiman (IEC 61853), robust open-rack coefficients
    return lambda poa, ta, ws: temperature.faiman(poa, ta, ws, u0=25.0, u1=6.84)


# --------------------------------------------------------------------------- #
# Simulation context (everything that does NOT depend on tilt/azimuth)
# --------------------------------------------------------------------------- #
@dataclass
class SimContext:
    zenith: pd.Series
    azimuth: pd.Series
    ghi: pd.Series
    dhi: pd.Series
    dni: pd.Series
    dni_extra: pd.Series
    temp_air: pd.Series
    wind_speed: pd.Series
    dt_h: float                 # timestep in hours
    index: pd.DatetimeIndex
    # array geometry
    gcr: float
    clearance: float
    pitch: float
    collector_width: float
    albedo: float
    bifaciality: float
    # electrical / plant
    pdc0: float                 # DC nameplate, W
    gamma_pdc: float            # /degC (e.g. -0.0026)
    dc_derate: float            # multiplicative DC-side derate (0-1)
    ac_w: float                 # AC nameplate clamp, W
    eta_nom: float              # nominal inverter efficiency
    pdc0_inv: float             # inverter DC input rating, W (= ac_w / eta_nom)
    temp_model: str
    dc_model: str = "pvwatts"   # "pvwatts" | "detailed" (low-light corrected)
    lowlight: tuple = None      # (G_grid, rel_eff) or None
    mounting: str = "fixed"     # "fixed" | "sat" (single-axis tracker)
    tracker_tilt: pd.Series = None
    tracker_az: pd.Series = None
    horizon_applied: bool = False
    tempf: Callable = field(repr=False, default=None)

    def __post_init__(self):
        self.tempf = _temp_func(self.temp_model)


def build_context(weather: pd.DataFrame, lat: float, lon: float, altitude: float,
                  plant: dict, horizon=None, interval_label: str = "start") -> SimContext:
    """Pre-compute solar geometry and all combo-independent quantities.

    interval_label: timestamp convention of the weather series.
      "start"   - each value is the average of the interval BEGINNING at the
                  label (PVGIS convention). Solar position is evaluated at the
                  interval midpoint (label + dt/2) — standard practice for
                  hourly-averaged irradiance; skipping this shift biases the
                  transposition toward the morning and skews the azimuth optimum.
      "instant" - values are instantaneous at the label (e.g. the synthetic
                  clear-sky series); no shift.
    """
    idx = weather.index
    dt_h = _timestep_hours(idx)
    loc = pvlib.location.Location(lat, lon, altitude=altitude or 0.0)
    pos_idx = idx + pd.Timedelta(hours=dt_h / 2.0) if interval_label == "start" else idx
    solpos = loc.get_solarposition(pos_idx, temperature=weather["temp_air"].to_numpy())
    solpos.index = idx
    dni_extra = irradiance.get_extra_radiation(pos_idx)
    dni_extra.index = idx
    zenith = solpos["apparent_zenith"]
    azimuth = solpos["azimuth"]

    # ---- far-shading: zero the beam when the sun is below the local horizon ----
    dni = weather["dni"]
    if horizon is not None and len(horizon) > 1:
        haz = np.asarray(horizon.index, dtype=float)
        hel = np.asarray(horizon.values, dtype=float)
        order = np.argsort(haz)
        hor_at = np.interp(azimuth.to_numpy() % 360, haz[order], hel[order], period=360)
        elev = 90.0 - zenith.to_numpy()
        dni = dni.where(elev >= hor_at, 0.0)

    eta_nom = plant["eta_inv_nom"]
    ac_w = plant["ac_mw"] * 1e6

    # ---- low-light curve for the detailed DC model ----
    dc_model = plant.get("dc_model", "pvwatts")
    lowlight = None
    if dc_model == "detailed" and plant.get("iv"):
        lowlight = build_lowlight_curve(plant["iv"])

    # ---- single-axis tracker orientation (time-varying) ----
    mounting = plant.get("mounting", "fixed")
    tr_tilt = tr_az = None
    if mounting == "sat":
        tr = tracking.singleaxis(zenith, azimuth,
                                 axis_tilt=0.0, axis_azimuth=plant.get("axis_azimuth", 0.0),
                                 max_angle=plant.get("max_angle", 60.0),
                                 backtrack=plant.get("backtrack", True), gcr=plant["gcr"])
        tr_tilt = tr["surface_tilt"].fillna(0.0)
        tr_az = tr["surface_azimuth"].fillna(plant.get("axis_azimuth", 0.0) + 90.0)

    return SimContext(
        zenith=zenith, azimuth=azimuth,
        ghi=weather["ghi"], dhi=weather["dhi"], dni=dni,
        dni_extra=dni_extra,
        temp_air=weather["temp_air"],
        wind_speed=weather["wind_speed"],
        dt_h=dt_h, index=idx,
        gcr=plant["gcr"], clearance=plant["height_m"], pitch=plant["pitch_m"],
        collector_width=plant["collector_w"],
        albedo=plant["albedo"], bifaciality=plant["bifaciality"],
        pdc0=plant["dc_mw"] * 1e6, gamma_pdc=plant["gamma_pdc"],
        dc_derate=plant["dc_derate"],
        ac_w=ac_w, eta_nom=eta_nom, pdc0_inv=ac_w / eta_nom,
        temp_model=plant["temp_model"],
        dc_model=dc_model, lowlight=lowlight,
        mounting=mounting, tracker_tilt=tr_tilt, tracker_az=tr_az,
        horizon_applied=horizon is not None and len(horizon) > 1,
    )


# --------------------------------------------------------------------------- #
# Core per-orientation evaluation
# --------------------------------------------------------------------------- #
def _poa_components(tilt, az, C: SimContext, iam: bool = True) -> pd.DataFrame:
    """POA components including IAM, row shading, and bifacial rear gain.

    For single-axis trackers, tilt/az are the time-varying tracker orientation.
    """
    if C.mounting == "sat":
        tilt, az = C.tracker_tilt, C.tracker_az
    aoi = irradiance.aoi(tilt, az, C.zenith, C.azimuth)
    iam_front = iam_mod.ashrae(aoi).fillna(0.0) if iam else 1.0
    # Fixed arrays use lower-edge clearance; trackers use constant axis height.
    if np.isscalar(tilt):
        center_height = C.clearance + 0.5 * C.collector_width * np.sin(np.radians(tilt))
    else:
        center_height = C.clearance
    return infinite_sheds.get_irradiance(
        surface_tilt=tilt, surface_azimuth=az,
        solar_zenith=C.zenith, solar_azimuth=C.azimuth,
        gcr=C.gcr, height=center_height, pitch=C.pitch,
        ghi=C.ghi, dhi=C.dhi, dni=C.dni, albedo=C.albedo,
        model="haydavies", dni_extra=C.dni_extra,
        iam_front=iam_front, iam_back=0.95,
        bifaciality=C.bifaciality,
    )


def _dc_power(poa: pd.Series, tcell: pd.Series, C: SimContext) -> pd.Series:
    """Gross DC power (W) before system derates. Uses the selected DC model."""
    if C.dc_model == "detailed" and C.lowlight is not None:
        gg, rel = C.lowlight
        rel_s = pd.Series(np.interp(poa.to_numpy(), gg, rel), index=poa.index)
        pdc = (poa / 1000.0) * C.pdc0 * rel_s * (1 + C.gamma_pdc * (tcell - 25.0))
        return pdc.clip(lower=0.0)
    return pvsystem.pvwatts_dc(poa, tcell, C.pdc0, C.gamma_pdc, temp_ref=25.0).clip(lower=0.0)


def _poa_effective(tilt: float, az: float, C: SimContext) -> pd.Series:
    """Effective front-plus-rear POA irradiance in W/m2."""
    irr = _poa_components(tilt, az, C)
    return irr["poa_global"].fillna(0.0).clip(lower=0.0)


def _ac_series(poa: pd.Series, C: SimContext, fast: bool = False):
    """Return (ac_W, pdc_net_W, tcell) series for an effective-POA series.

    `fast=True` forces the linear PVWatts DC model (used by the orientation sweep
    so it stays quick; the detailed low-light DC model is reserved for the final
    detailed evaluation where absolute accuracy matters).
    """
    tcell = C.tempf(poa, C.temp_air, C.wind_speed)
    if fast or C.dc_model != "detailed" or C.lowlight is None:
        pdc = pvsystem.pvwatts_dc(poa, tcell, C.pdc0, C.gamma_pdc, temp_ref=25.0).clip(lower=0.0)
    else:
        pdc = _dc_power(poa, tcell, C)
    pdc_net = pdc * C.dc_derate
    ac = inverter.pvwatts(pdc_net, C.pdc0_inv, eta_inv_nom=C.eta_nom,
                          eta_inv_ref=ETA_INV_REF)
    return ac.clip(lower=0.0), pdc_net, tcell


def _pvwatts_unclipped(pdc: pd.Series, C: SimContext) -> pd.Series:
    """PVWatts conversion output before the AC-nameplate clamp."""
    zeta = pdc / C.pdc0_inv
    with np.errstate(divide="ignore", invalid="ignore"):
        eta = (C.eta_nom / ETA_INV_REF) * (
            -0.0162 * zeta - 0.0059 / zeta + 0.9858
        )
    return (eta * pdc).fillna(0.0).clip(lower=0.0)


def annual_energy(tilt: float, az: float, C: SimContext) -> float:
    """Annual AC energy (kWh) for one orientation using the selected DC model."""
    poa = _poa_effective(tilt, az, C)
    ac, _, _ = _ac_series(poa, C)
    return float(ac.sum()) * C.dt_h / 1000.0


# --------------------------------------------------------------------------- #
# Sweep
# --------------------------------------------------------------------------- #
def _axis(a: float, b: float, step: float) -> np.ndarray:
    # Decimal arithmetic keeps fractional grid points within their input bounds
    # without rounding high-precision coordinates onto the wrong side of a limit.
    start, stop, spacing = Decimal(str(a)), Decimal(str(b)), Decimal(str(step))
    n = int(((stop - start) / spacing).to_integral_value(rounding=ROUND_FLOOR)) + 1
    return np.asarray([float(start + spacing * i) for i in range(max(n, 1))])


def sweep(C: SimContext, sweep_cfg: dict, progress: Optional[Callable] = None) -> dict:
    """Sweep tilt x azimuth. Returns grids of energy & specific yield + optimum."""
    tilts = _axis(sweep_cfg["tilt_min"], sweep_cfg["tilt_max"], sweep_cfg["tilt_step"])
    azs = _axis(sweep_cfg["az_min"], sweep_cfg["az_max"], sweep_cfg["az_step"])
    dc_kwp = C.pdc0 / 1000.0

    energy = np.zeros((len(tilts), len(azs)))            # MWh
    total = len(tilts) * len(azs)
    done = 0
    for i, t in enumerate(tilts):
        for j, a in enumerate(azs):
            energy[i, j] = annual_energy(float(t), float(a), C) / 1000.0  # MWh
            done += 1
        if progress:
            progress(done, total)

    specific = energy * 1000.0 / dc_kwp                   # kWh/kWp
    ii, jj = np.unravel_index(np.argmax(energy), energy.shape)
    azimuth_defined = bool(tilts[ii] > 0.05)
    if not azimuth_defined:
        jj = int(np.argmin(np.abs(azs - 180.0)))
    return {
        "tilts": tilts.tolist(),
        "azimuths": azs.tolist(),
        "energy_mwh": energy.round(2).tolist(),
        "specific_yield": specific.round(1).tolist(),
        "optimum": {
            "tilt": float(tilts[ii]),
            "azimuth": float(azs[jj]),
            "azimuth_defined": azimuth_defined,
            "energy_mwh": float(round(energy[ii, jj], 2)),
            "specific_yield": float(round(specific[ii, jj], 1)),
        },
        "dc_kwp": dc_kwp,
    }


def _refinement_axis(center: float, radius: float, lo: float, hi: float) -> list[float]:
    """Include every whole degree in the bounded local window and its endpoints.

    Fractional user boundaries and the coarse seed remain eligible; no value may
    cross a specified search limit. A local search is not a global 1-degree sweep.
    """
    left = max(float(lo), float(center) - float(radius))
    right = min(float(hi), float(center) + float(radius))
    vals = {left, right, float(center)}
    vals.update(float(v) for v in range(int(np.ceil(left)), int(np.floor(right)) + 1))
    return sorted(v for v in vals if left <= v <= right)


def refine_optimum(C: SimContext, sw: dict, cfg: dict) -> dict:
    """Refine around the sweep-grid optimum in 1° steps with exact evaluations.

    Searches a local box (± one grid step) around the grid optimum at 1° spacing
    in tilt and azimuth plus fractional edges, bounded by the user's ranges. Returns the updated
    sweep dict; adds sw['refined_resolution_deg'] and keeps the coarse grid for
    the heatmap/cross-sections.
    """
    opt = sw["optimum"]
    if not opt.get("azimuth_defined", True):
        return sw
    t0, a0 = float(opt["tilt"]), float(opt["azimuth"])
    lo_t = max(cfg["tilt_min"], t0 - cfg["tilt_step"])
    hi_t = min(cfg["tilt_max"], t0 + cfg["tilt_step"])
    lo_a = max(cfg["az_min"], a0 - cfg["az_step"])
    hi_a = min(cfg["az_max"], a0 + cfg["az_step"])
    tilts = _refinement_axis(t0, cfg["tilt_step"], lo_t, hi_t)
    azs = _refinement_axis(a0, cfg["az_step"], lo_a, hi_a)
    # The public coarse result is rounded; compare actual energy, never that rounded value.
    best = (annual_energy(t0, a0, C) / 1000.0, t0, a0)
    for t in tilts:
        for a in azs:
            if abs(t - t0) < 1e-9 and abs(a - a0) < 1e-9:
                continue
            e = annual_energy(float(t), float(a), C) / 1000.0
            if e > best[0]:
                best = (e, float(t), float(a))
    dc_kwp = C.pdc0 / 1000.0
    sw["optimum"] = {
        **opt,
        "tilt": best[1], "azimuth": best[2],
        "azimuth_defined": bool(best[1] > 0.05),
        "energy_mwh": round(best[0], 2),
        "specific_yield": round(best[0] * 1000.0 / dc_kwp, 1),
    }
    sw["refined_resolution_deg"] = 1.0
    return sw


# --------------------------------------------------------------------------- #
# Detailed evaluation at a single orientation (for KPIs, charts, waterfall)
# --------------------------------------------------------------------------- #
def detail(tilt: float, az: float, C: SimContext, utc_offset: float) -> dict:
    irr = _poa_components(tilt, az, C)
    poa = irr["poa_global"].fillna(0.0).clip(lower=0.0)
    ac, pdc_net, tcell = _ac_series(poa, C)
    dt = C.dt_h
    dc_kwp = C.pdc0 / 1000.0

    e_ac = float(ac.sum()) * dt / 1000.0                       # kWh
    poa_insol = float(poa.sum()) * dt / 1000.0                 # kWh/m2
    ghi_insol = float(C.ghi.sum()) * dt / 1000.0              # kWh/m2

    # ---- PVsyst-style loss tree (kWh, plant scale) ----
    poa_noiam = _poa_components(tilt, az, C, iam=False)["poa_global"].fillna(0.0).clip(lower=0.0)
    poa_noiam_insol = float(poa_noiam.sum()) * dt / 1000.0
    e_ghi = dc_kwp * ghi_insol                         # nameplate at horizontal sun-hours
    e_poa_noiam = dc_kwp * poa_noiam_insol             # after transposition, before IAM
    e_poa = dc_kwp * poa_insol                         # after IAM (= pvwatts_dc at 25 C)
    transpos_gain = e_poa_noiam - e_ghi
    iam_loss = e_poa - e_poa_noiam                     # <= 0
    e_dc25 = float(_dc_power(poa, pd.Series(25.0, index=poa.index), C).sum()) * dt / 1000.0
    lowlight_loss = e_dc25 - e_poa                     # <= 0 (0 for the PVWatts model)
    e_dc_temp = float(_dc_power(poa, tcell, C).sum()) * dt / 1000.0
    temp_loss = e_dc_temp - e_dc25
    e_dc_net = float(pdc_net.sum()) * dt / 1000.0
    dc_sys_loss = e_dc_net - e_dc_temp                 # soiling/mismatch/wiring/LID/avail
    e_ref = e_poa                                      # POA reference for PR
    # Split PVWatts conversion loss from the AC-nameplate clipping loss.
    ac_unclipped = _pvwatts_unclipped(pdc_net, C)
    e_ac_unclipped = float(ac_unclipped.sum()) * dt / 1000.0
    clip_loss = max(e_ac_unclipped - e_ac, 0.0)
    conv_loss = max(e_dc_net - e_ac_unclipped, 0.0)

    # performance ratio (IEC 61724): final yield (kWh/kWp) / reference yield (POA peak-sun-hours)
    pr = (e_ac / dc_kwp) / poa_insol if poa_insol > 0 else 0.0
    cap_factor = e_ac / (C.ac_w / 1000.0 * len(C.index) * dt) if C.ac_w > 0 else 0.0

    # ---- monthly metrics ----
    ac_kwh = ac * dt / 1000.0
    monthly = ac_kwh.groupby(ac_kwh.index.month).sum()
    monthly_mwh = [float(round(monthly.get(m, 0.0) / 1000.0, 2)) for m in range(1, 13)]
    poa_month = (poa * dt / 1000.0).groupby(poa.index.month).sum()
    poa_monthly = [float(round(poa_month.get(m, 0.0), 1)) for m in range(1, 13)]
    ghi_month = (C.ghi * dt / 1000.0).groupby(C.ghi.index.month).sum()
    monthly_ghi = [float(round(ghi_month.get(m, 0.0), 1)) for m in range(1, 13)]
    monthly_yield = [float(round((monthly.get(m, 0.0)) / dc_kwp, 1)) for m in range(1, 13)]
    monthly_pr = [float(round(100.0 * (monthly.get(m, 0.0) / dc_kwp) / poa_month.get(m, 1e-9), 1))
                  if poa_month.get(m, 0) > 0 else 0.0 for m in range(1, 13)]
    tc_op = tcell.where(poa > 50)
    tc_month = tc_op.groupby(tc_op.index.month).mean()
    cell_temp_monthly = [float(round(tc_month.get(m, 0.0) or 0.0, 1)) for m in range(1, 13)]

    # ---- average-day power profile (local solar time) ----
    ac_kw = ac / 1000.0
    local = ac_kw.copy()
    local.index = local.index + pd.Timedelta(hours=utc_offset)
    prof = local.groupby(local.index.hour).mean()              # avg kW by hour
    profile = [float(round(prof.get(h, 0.0), 1)) for h in range(24)]

    # ---- 8760 production carpet plot (hour-of-day x day-of-year, local) ----
    cdf = pd.DataFrame({"p": local.values, "h": local.index.hour, "d": local.index.dayofyear})
    pivot = cdf.pivot_table(index="h", columns="d", values="p", aggfunc="mean")
    pivot = pivot.reindex(index=range(24))
    carpet = {
        "days": [int(c) for c in pivot.columns],
        "hours": list(range(24)),
        "z": [[None if pd.isna(v) else round(float(v), 1) for v in pivot.loc[h].values]
              for h in range(24)],
    }

    # ---- AC power duration curve (sorted) ----
    s = np.sort(ac_kw.values)[::-1]
    n = len(s)
    sel = np.unique(np.linspace(0, n - 1, 240).astype(int))
    duration = {
        "pct": [round(float(i) / max(n - 1, 1) * 100.0, 2) for i in sel],
        "power": [round(float(s[i]), 1) for i in sel],
        "ac_cap": round(C.ac_w / 1000.0, 1),
    }

    return {
        "tilt": None if C.mounting == "sat" else tilt,
        "azimuth": None if C.mounting == "sat" else az,
        "mounting": C.mounting,
        "dc_model": (
            "detailed" if C.dc_model == "detailed" and C.lowlight is not None
            else "pvwatts"
        ),
        "kpis": {
            "energy_mwh": round(e_ac / 1000.0, 1),
            "specific_yield": round(e_ac / dc_kwp, 0),
            "performance_ratio": round(pr * 100.0, 1),
            "capacity_factor": round(cap_factor * 100.0, 1),
            "poa_insolation": round(poa_insol, 0),
            "ghi_insolation": round(ghi_insol, 0),
            "clipping_loss_pct": round(100.0 * clip_loss / e_dc_net, 2) if e_dc_net else 0.0,
            "mean_cell_temp": round(float(tcell[poa > 50].mean()), 1) if (poa > 50).any() else 0.0,
            "bifacial_gain_pct": round(
                100.0 * max(float(poa.sum() - irr["poa_front"].sum()), 0.0)
                / max(float(irr["poa_front"].sum()), 1e-9),
                2,
            ),
        },
        "waterfall": [
            {"stage": "GHI × nameplate", "value": round(e_ghi / 1000.0, 1)},
            {"stage": "Transposition (POA gain)", "value": round(transpos_gain / 1000.0, 1)},
            {"stage": "IAM / reflection", "value": round(iam_loss / 1000.0, 1)},
            {"stage": "Low-light", "value": round(lowlight_loss / 1000.0, 1)},
            {"stage": "Temperature", "value": round(temp_loss / 1000.0, 1)},
            {"stage": "DC system derates", "value": round(dc_sys_loss / 1000.0, 1)},
            {"stage": "Inverter clipping", "value": -round(clip_loss / 1000.0, 1)},
            {"stage": "Inverter conversion", "value": -round(conv_loss / 1000.0, 1)},
            {"stage": "Net AC energy", "value": round(e_ac / 1000.0, 1)},
        ],
        "monthly_mwh": monthly_mwh,
        "poa_monthly": poa_monthly,
        "monthly_ghi": monthly_ghi,
        "monthly_yield": monthly_yield,
        "monthly_pr": monthly_pr,
        "cell_temp_monthly": cell_temp_monthly,
        "day_profile_kw": profile,
        "carpet": carpet,
        "duration": duration,
    }


def sun_path(lat: float, lon: float, utc_offset: float) -> dict:
    """Solar elevation vs azimuth arcs for representative days (location only)."""
    loc = pvlib.location.Location(lat, lon)
    off = pd.Timedelta(hours=utc_offset)
    days = [("Jun solstice", "2021-06-21"),
            ("Equinox", "2021-03-21"),
            ("Dec solstice", "2021-12-21")]
    out = []
    for label, date in days:
        local = pd.date_range(date, periods=24 * 12, freq="5min")     # naive local day
        utc = pd.DatetimeIndex(local - off).tz_localize("UTC")
        sp = loc.get_solarposition(utc)
        el = sp["apparent_elevation"].values
        az = sp["azimuth"].values
        m = el > 0
        out.append({"label": label,
                    "az": [round(float(a), 1) for a in az[m]],
                    "el": [round(float(e), 1) for e in el[m]]})
    return {"arcs": out, "lat": lat}
