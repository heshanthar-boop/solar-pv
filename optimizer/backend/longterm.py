"""
Long-term yield: probabilistic P50/P75/P90/P95/P99 and degradation.

P-levels combine **interannual variability** (the year-to-year spread of energy
from many real PVGIS years at the chosen orientation) with an assumed **model
uncertainty**:

    CoV_total = sqrt( CoV_interannual^2 + CoV_model^2 )
    P_x       = P50 * (1 - z_x * CoV_total)

z-scores are one-sided normal exceedance probabilities. Lifetime energy applies
first-year light-induced degradation, an annual linear degradation rate and a
plant availability factor to the long-term P50 typical-year energy.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import engine

# one-sided normal exceedance z-scores
Z = {"P50": 0.0, "P75": 0.6745, "P90": 1.2816, "P95": 1.6449, "P99": 2.3263}


def per_year_energy(df: pd.DataFrame, lat, lon, altitude, plant, tilt, az) -> pd.Series:
    """Annual AC energy (MWh) per calendar year at one orientation."""
    # PVGIS multi-year series labels the start of each averaging hour.
    C = engine.build_context(df, lat, lon, altitude, plant, interval_label="start")
    poa = engine._poa_effective(tilt, az, C)
    ac, _, _ = engine._ac_series(poa, C)
    e_kwh = ac * C.dt_h / 1000.0
    by_year = e_kwh.groupby(e_kwh.index.year).sum() / 1000.0          # MWh
    hours = ac.groupby(ac.index.year).count() * C.dt_h
    full = hours[hours >= 8000].index                                 # drop partial years
    return by_year[by_year.index.isin(full)]


def distribution(by_year: pd.Series, model_uncertainty: float) -> dict:
    vals = by_year.to_numpy(dtype=float)
    p50 = float(np.mean(vals))
    sd = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0
    cov_inter = sd / p50 if p50 > 0 else 0.0
    cov_total = float(np.hypot(cov_inter, model_uncertainty))
    sigma = p50 * cov_total
    return {
        "p50": round(p50, 1),
        "levels": {k: round(max(p50 - z * sigma, 0.0), 1) for k, z in Z.items()},
        "cov_interannual_pct": round(cov_inter * 100, 2),
        "cov_model_pct": round(model_uncertainty * 100, 2),
        "cov_total_pct": round(cov_total * 100, 2),
        "sigma_mwh": round(sigma, 1),
        "n_years": int(len(vals)),
        "min_year": {"year": int(by_year.idxmin()), "energy": round(float(by_year.min()), 1)},
        "max_year": {"year": int(by_year.idxmax()), "energy": round(float(by_year.max()), 1)},
        "by_year": [{"year": int(y), "energy": round(float(v), 1)} for y, v in by_year.items()],
    }


def degradation(p50_typical: float, dc_kwp: float, years: int,
                lid: float, degr: float, avail: float) -> dict:
    """Year-by-year energy with first-year LID + linear degradation + availability."""
    rows, total = [], 0.0
    for y in range(1, years + 1):
        perf = (1 - lid / 100.0) if y == 1 else (1 - lid / 100.0) * (1 - degr / 100.0) ** (y - 1)
        e = p50_typical * perf * (avail / 100.0)
        total += e
        rows.append({"year": y, "perf_pct": round(perf * 100, 2),
                     "energy_mwh": round(e, 1), "specific": round(e * 1000 / dc_kwp, 0)})
    return {
        "years": years, "lid_pct": lid, "degradation_pct_yr": degr, "availability_pct": avail,
        "lifetime_mwh": round(total, 0), "avg_annual_mwh": round(total / years, 1),
        "year1_mwh": rows[0]["energy_mwh"], "yearN_mwh": rows[-1]["energy_mwh"],
        "retention_pct": round(100 * rows[-1]["energy_mwh"] / rows[0]["energy_mwh"], 1),
        "table": rows,
    }


def analyze(df_multi, lat, lon, altitude, plant, tilt, az,
            model_uncertainty, years, lid, degr, avail) -> dict:
    by_year_gross = per_year_energy(df_multi, lat, lon, altitude, plant, tilt, az)
    if len(by_year_gross) < 5:
        raise ValueError("At least five complete historical years are required.")
    first_year_factor = (1 - lid / 100.0) * (avail / 100.0)
    by_year_net = by_year_gross * first_year_factor
    dist = distribution(by_year_net, model_uncertainty)
    gross_p50 = float(np.mean(by_year_gross.to_numpy(dtype=float)))
    dc_kwp = plant["dc_mw"] * 1000.0
    deg = degradation(gross_p50, dc_kwp, years, lid, degr, avail)
    return {
        "tilt": tilt, "azimuth": az,
        "specific_yield_p50": round(dist["p50"] * 1000 / dc_kwp, 0),
        "basis": (
            "Historical annual energy with user-selected first-year LID and "
            "availability applied once; model uncertainty combined in quadrature."
        ),
        "distribution": dist,
        "degradation": deg,
    }
