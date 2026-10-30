"""
Weather / irradiance "pattern data" sourcing.

Sources exposed to the UI (the 'pattern data' selector):
  * pvgis_tmy   - PVGIS SARAH/ERA5 Typical Meteorological Year (satellite, real)
  * pvgis_year  - PVGIS hourly data for one specific historical year
  * clearsky    - Ineichen clear-sky model (idealised, no clouds) for comparison
  * upload      - user CSV: timestamp, ghi, dni, dhi, temp_air[, wind_speed]

All series are returned as an hourly, UTC-indexed DataFrame with the canonical
columns: ghi, dni, dhi, temp_air, wind_speed.
"""
from __future__ import annotations

import io
import hashlib
import time
from datetime import timedelta, timezone

import numpy as np
import pandas as pd
import pvlib

_CACHE: dict[str, pd.DataFrame] = {}          # weather cache (network results)
_UPLOADS: dict[str, pd.DataFrame] = {}        # in-memory uploaded datasets
_META: dict[str, dict] = {}

_REQUIRED = ["ghi", "dni", "dhi", "temp_air"]
_CANONICAL = ["ghi", "dni", "dhi", "temp_air", "wind_speed"]


def _finalize(df: pd.DataFrame) -> pd.DataFrame:
    """Validate canonical columns, UTC index, and a regular time interval."""
    missing_columns = [c for c in _REQUIRED if c not in df.columns]
    if missing_columns:
        raise ValueError(f"Weather data missing columns: {', '.join(missing_columns)}")
    if "wind_speed" not in df:
        df["wind_speed"] = 1.0
    df = df[_CANONICAL].copy()
    for c in _CANONICAL:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    if df.index.has_duplicates:
        raise ValueError("Weather timestamps contain duplicates.")
    df = df.sort_index()
    if len(df) < 2:
        raise ValueError("Weather data must contain at least two timestamps.")
    gaps = pd.Series(df.index).diff().dropna().dt.total_seconds()
    interval_s = float(gaps.median())
    if interval_s <= 0 or not np.allclose(gaps, interval_s, rtol=0, atol=1):
        raise ValueError("Weather timestamps must use one regular interval without gaps.")
    missing = [c for c in _REQUIRED if df[c].isna().any()]
    if missing:
        raise ValueError(f"Weather data contains blank/non-numeric values in: {', '.join(missing)}")
    df["wind_speed"] = df["wind_speed"].fillna(1.0).clip(lower=0)
    df[["ghi", "dni", "dhi"]] = df[["ghi", "dni", "dhi"]].clip(lower=0.0)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    return df


def get_weather(source: str, lat: float, lon: float,
                year: int | None = None, upload_id: str | None = None):
    """Return (DataFrame, meta dict)."""
    if source == "upload":
        if upload_id not in _UPLOADS:
            raise ValueError("Uploaded dataset not found - please re-upload.")
        df = _UPLOADS[upload_id]
        return df, _META.get(upload_id, {"source": "upload"})

    key = f"{source}:{lat:.4f}:{lon:.4f}:{year}"
    if key in _CACHE:
        return _CACHE[key], _META[key]

    if source == "clearsky":
        df, meta = _clearsky(lat, lon)
    elif source == "pvgis_tmy":
        df, meta = _pvgis_tmy(lat, lon)
    elif source == "pvgis_year":
        df, meta = _pvgis_year(lat, lon, year or 2020)
    else:
        raise ValueError(f"Unknown weather source: {source}")

    _CACHE[key] = df
    _META[key] = meta
    return df, meta


def _with_retry(fn, what: str, tries: int = 3, delay_s: float = 2.0):
    """Call a PVGIS fetch with retries and a human-readable failure message."""
    last = None
    for attempt in range(tries):
        try:
            return fn()
        except Exception as e:                     # network resets, timeouts, 5xx
            last = e
            if attempt < tries - 1:
                time.sleep(delay_s * (attempt + 1))
    raise ValueError(
        f"The PVGIS weather service did not respond while fetching {what} "
        f"(tried {tries} times). Check the internet connection and run again, "
        f"or switch the weather source to 'Clear-sky' to work offline. "
        f"[{type(last).__name__}]"
    )


def _pvgis_tmy(lat: float, lon: float):
    t0 = time.time()
    data, meta = _with_retry(
        lambda: pvlib.iotools.get_pvgis_tmy(lat, lon, map_variables=True),
        "the satellite TMY dataset",
    )
    df = _finalize(data)
    info = {"source": "PVGIS TMY (satellite)", "elevation": _elev(meta),
            "interval_label": "start",
            "fetch_s": round(time.time() - t0, 1)}
    return df, info


def _pvgis_components_to_canonical(data: pd.DataFrame, lat: float, lon: float) -> pd.DataFrame:
    """Convert PVGIS hourly horizontal-plane components to ghi/dni/dhi/temp/wind.

    get_pvgis_hourly(surface_tilt=0, components=True) returns the beam and sky-
    diffuse components on the horizontal plane. We reconstruct DNI exactly from
    the beam-on-horizontal and the solar zenith (no decomposition model needed).
    """
    idx = data.index
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    # PVGIS labels the START of each averaging hour -> evaluate the solar
    # zenith at the interval midpoint for the beam->DNI reconstruction.
    sp = pvlib.location.Location(lat, lon).get_solarposition(idx + pd.Timedelta(minutes=30))
    cosz = np.cos(np.radians(sp["apparent_zenith"].to_numpy()))
    cosz = np.clip(cosz, 0.0, None)
    beam_h = pd.to_numeric(data.get("poa_direct"), errors="coerce").fillna(0.0).clip(lower=0).to_numpy()
    dhi = pd.to_numeric(data.get("poa_sky_diffuse"), errors="coerce").fillna(0.0).clip(lower=0).to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        dni = np.where(cosz > 0.035, beam_h / cosz, 0.0)
    dni = np.clip(dni, 0.0, 1400.0)
    return pd.DataFrame({
        "ghi": beam_h + dhi, "dni": dni, "dhi": dhi,
        "temp_air": pd.to_numeric(data.get("temp_air"), errors="coerce").to_numpy(),
        "wind_speed": pd.to_numeric(data.get("wind_speed", 1.0), errors="coerce").fillna(1.0).to_numpy(),
    }, index=idx)


def _get_pvgis_hourly(lat, lon, start, end):
    """Version-robust wrapper (pvlib returns (data, meta) or (data, inputs, meta))."""
    res = _with_retry(
        lambda: pvlib.iotools.get_pvgis_hourly(
            lat, lon, start=start, end=end, components=True, surface_tilt=0,
            map_variables=True, outputformat="json",
        ),
        f"hourly data {start}–{end}",
    )
    return res[0], res[-1]


def _pvgis_year(lat: float, lon: float, year: int):
    t0 = time.time()
    data, meta = _get_pvgis_hourly(lat, lon, year, year)
    df = _finalize(_pvgis_components_to_canonical(data, lat, lon))
    info = {"source": f"PVGIS hourly {year}", "elevation": _elev(meta),
            "interval_label": "start",
            "fetch_s": round(time.time() - t0, 1), "year": year}
    return df, info


def get_multiyear(lat: float, lon: float, start: int, end: int):
    """Fetch a multi-year hourly PVGIS series (for interannual P50/P90)."""
    t0 = time.time()
    data, meta = _get_pvgis_hourly(lat, lon, start, end)
    df = _finalize(_pvgis_components_to_canonical(data, lat, lon))
    years = sorted({int(y) for y in df.index.year.unique()})
    info = {"source": f"PVGIS hourly {start}–{end}", "elevation": _elev(meta),
            "interval_label": "start",
            "fetch_s": round(time.time() - t0, 1), "years": years}
    return df, info


def _clearsky(lat: float, lon: float):
    loc = pvlib.location.Location(lat, lon)
    idx = pd.date_range("2021-01-01", "2021-12-31 23:00", freq="1h", tz="UTC")
    cs = loc.get_clearsky(idx, model="ineichen")
    # Synthetic ambient temperature for an upper-bound irradiance comparison.
    doy = idx.dayofyear.values
    hod = idx.hour.values + lon / 15.0
    seasonal_amp = min(8.0, 1.5 + abs(lat) * 0.08)
    base = 27.0 - seasonal_amp * np.cos(2 * np.pi * (doy - 30) / 365.0)
    diurnal = 4.0 * np.sin(2 * np.pi * (hod - 9) / 24.0)
    temp = base + diurnal
    df = pd.DataFrame({"ghi": cs["ghi"], "dni": cs["dni"], "dhi": cs["dhi"],
                       "temp_air": temp, "wind_speed": 1.5}, index=idx)
    df = _finalize(df)
    return df, {
        "source": "Clear-sky (Ineichen + synthetic temperature; upper bound)",
        "interval_label": "instant",
        "elevation": 0,
    }


def _elev(meta: dict):
    try:
        return meta.get("inputs", {}).get("location", {}).get("elevation")
    except Exception:
        return None


def store_upload(content: bytes, filename: str, utc_offset: float = 0.0) -> dict:
    """Parse an uploaded CSV into the canonical frame; return summary + id."""
    txt = content.decode("utf-8-sig", errors="replace")
    raw = pd.read_csv(io.StringIO(txt))
    cols = {c.lower().strip(): c for c in raw.columns}

    def pick(*names):
        for n in names:
            if n in cols:
                return cols[n]
        return None

    tcol = pick("timestamp", "time", "datetime", "date", "period")
    if tcol is None:
        raise ValueError("CSV must include a timestamp/time column.")
    parsed = pd.to_datetime(raw[tcol], errors="coerce")
    if isinstance(parsed.dtype, pd.DatetimeTZDtype):
        idx = pd.DatetimeIndex(parsed).tz_convert("UTC")
    else:
        tz = timezone(timedelta(hours=float(utc_offset)))
        idx = pd.DatetimeIndex(parsed).tz_localize(tz).tz_convert("UTC")

    out = pd.DataFrame(index=idx)
    mapping = {
        "ghi": pick("ghi", "g(h)", "global"),
        "dni": pick("dni", "b(n)", "beam"),
        "dhi": pick("dhi", "d(h)", "diffuse"),
        "temp_air": pick("temp_air", "tamb", "t2m", "temperature", "temp"),
        "wind_speed": pick("wind_speed", "ws", "ws10m", "wind"),
    }
    for k, src in mapping.items():
        if src is not None:
            out[k] = pd.to_numeric(raw[src], errors="coerce").values
    missing = [c for c in _REQUIRED if c not in out or out[c].isna().all()]
    if missing:
        raise ValueError(f"CSV missing required columns: {', '.join(missing)}")
    out = out[~out.index.isna()]
    df = _finalize(out)
    dt_h = float(pd.Series(df.index).diff().dropna().median().total_seconds()) / 3600.0
    coverage_days = len(df) * dt_h / 24.0
    if coverage_days < 350 or coverage_days > 370:
        raise ValueError(
            "Annual optimization requires one near-complete year of regular weather "
            f"data (received {coverage_days:.1f} days)."
        )

    uid = hashlib.md5((filename + str(time.time())).encode()).hexdigest()[:12]
    _UPLOADS[uid] = df
    _META[uid] = {"source": f"Upload: {filename}", "elevation": None,
                  "interval_label": "start",
                  "rows": len(df), "utc_offset": utc_offset}
    return {"upload_id": uid, **summary(df), "source": _META[uid]["source"]}


def summary(df: pd.DataFrame) -> dict:
    """Annual + monthly summary so the UI can 'inspect' a pattern dataset."""
    dt = 1.0
    if len(df.index) > 1:
        dt = float(pd.Series(df.index).diff().dropna().median().total_seconds()) / 3600.0
    ghi_m = (df["ghi"] * dt / 1000.0).groupby(df.index.month).sum()
    return {
        "ghi_annual": round(float(df["ghi"].sum()) * dt / 1000.0, 0),
        "dni_annual": round(float(df["dni"].sum()) * dt / 1000.0, 0),
        "temp_mean": round(float(df["temp_air"].mean()), 1),
        "temp_max": round(float(df["temp_air"].max()), 1),
        "wind_mean": round(float(df["wind_speed"].mean()), 1),
        "rows": int(len(df)),
        "interval_minutes": round(dt * 60.0, 2),
        "coverage_days": round(len(df) * dt / 24.0, 1),
        "ghi_monthly": [round(float(ghi_m.get(m, 0.0)), 1) for m in range(1, 13)],
    }
