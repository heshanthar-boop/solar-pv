"""
Solar Yield Optimizer - FastAPI backend.

Serves the single-page UI and exposes:
  GET  /api/catalog            built-in panel/inverter presets
  POST /api/weather/inspect    fetch + summarise a weather "pattern dataset"
  POST /api/weather/upload     upload a custom CSV weather file
  POST /api/analyze            stream the tilt x azimuth sweep + detailed result
"""
from __future__ import annotations

import json
import math
import queue
import sys
import threading
from pathlib import Path

import numpy as np
import pvlib
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import atlas as atlas_mod
from . import catalog as cat
from . import eastwest as ew_mod
from . import electrical as elec
from . import engine
from . import fieldreport
from . import fieldtest
from . import infra as infra_mod
from . import longterm as lt
from . import weather as wx
from .models import (
    AnalyzeRequest,
    EastWestAnalyzeRequest,
    EastWestOverloadRequest,
    EvaluateRequest,
    InspectRequest,
    LongTermRequest,
)

# Resolve the frontend folder both when running from source and when frozen
# into a PyInstaller bundle (one-file extracts to sys._MEIPASS).
if getattr(sys, "frozen", False):
    BASE = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
else:
    BASE = Path(__file__).resolve().parent.parent
FRONTEND = BASE / "frontend"

app = FastAPI(title="Solar Yield Optimizer", version="1.2.0")


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.get("/api/catalog")
def get_catalog():
    return cat.catalog()


@app.post("/api/weather/inspect")
def inspect(req: InspectRequest):
    try:
        df, meta = wx.get_weather(req.weather.source, req.location.lat,
                                  req.location.lon, req.weather.year,
                                  req.weather.upload_id)
        return {"meta": meta, **wx.summary(df)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/weather/upload")
async def upload(file: UploadFile = File(...), utc_offset: float = Form(0.0)):
    try:
        content = await file.read()
        return wx.store_upload(content, file.filename or "upload.csv", utc_offset)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/fieldtest/analyze")
async def analyze_fieldtest(
    file: UploadFile = File(...),
    warning_pct: float = Form(90.0),
    critical_pct: float = Form(80.0),
    voltage_warning_pct: float = Form(5.0),
    current_warning_pct: float = Form(8.0),
    irradiance_min_wm2: float = Form(700.0),
    ff_warning_pct: float = Form(70.0),
    warranty_start_date: str | None = Form(None),
    warranty_first_year_min_pct: float = Form(97.0),
    warranty_annual_degradation_pct: float = Form(0.7),
    warranty_term_years: int = Form(25),
):
    try:
        content = await file.read()
        thresholds = fieldtest.FieldThresholds(
            warning_pct=warning_pct,
            critical_pct=critical_pct,
            voltage_warning_pct=voltage_warning_pct,
            current_warning_pct=current_warning_pct,
            irradiance_min_wm2=irradiance_min_wm2,
            ff_warning_pct=ff_warning_pct,
        )
        warranty = fieldtest.WarrantyModel(
            start_date=warranty_start_date,
            first_year_min_pct=warranty_first_year_min_pct,
            annual_degradation_pct=warranty_annual_degradation_pct,
            term_years=warranty_term_years,
        )
        return fieldtest.analyze_upload(content, file.filename or "field-test-upload", thresholds, warranty)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/fieldtest/report.pdf")
def fieldtest_report_pdf(analysis: dict = Body(...)):
    try:
        pdf = fieldreport.build_pdf(analysis)
        filename = (analysis.get("summary", {}) or {}).get("source") or "pv-condition-analysis"
        safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in filename)[:80]
        return Response(
            pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe}_report.pdf"'},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _build_plant(p, pl) -> dict:
    # collector bandwidth along the slope -> pitch from ground-coverage ratio
    base = p.length_m if pl.orientation == "portrait" else p.width_m
    collector_w = base * max(pl.modules_per_row, 1)
    pitch = collector_w / pl.gcr
    # combined DC-side derate from the loss stack
    lo = pl.losses
    pct = pvlib.pvsystem.pvwatts_losses(
        soiling=lo.soiling, shading=lo.shading, snow=lo.snow, mismatch=lo.mismatch,
        wiring=lo.wiring, connections=lo.connections, lid=lo.lid,
        nameplate_rating=lo.nameplate_rating, age=lo.age, availability=lo.availability,
    )
    plant = {
        "dc_mw": pl.dc_mw, "ac_mw": pl.ac_mw, "eta_inv_nom": pl.eta_inv_nom,
        "albedo": pl.albedo, "gcr": pl.gcr, "height_m": pl.height_m,
        "pitch_m": pitch, "collector_w": collector_w,
        "bifaciality": p.bifaciality if pl.bifacial else 0.0,
        "gamma_pdc": p.gamma_pmp, "dc_derate": 1.0 - pct / 100.0,
        "temp_model": pl.temp_model, "dc_loss_pct": round(pct, 2),
        "inverter_id": pl.inverter_id,
        "dc_model": pl.dc_model,
        "mounting": pl.mounting, "axis_azimuth": pl.axis_azimuth,
        "max_angle": pl.max_angle, "backtrack": pl.backtrack,
    }
    # IV specs for the detailed (low-light) DC model, if a catalogue module is used
    specs = elec._bin_specs(p.id, p.pmpp_w)
    if specs:
        pinfo, s, _ = specs
        plant["iv"] = {"voc": s["voc"], "isc": s["isc"], "vmp": s["vmp"], "imp": s["imp"],
                       "alpha_isc": pinfo["alpha_isc"],
                       "cells": pinfo.get("cells_in_series")}
    return plant


def _derived(req: AnalyzeRequest, plant: dict) -> dict:
    """Plant make-up numbers for display."""
    n_panels = round(req.plant.dc_mw * 1e6 / req.panel.pmpp_w)
    ilr = req.plant.dc_mw / req.plant.ac_mw
    inverter = cat.INVERTERS.get(req.plant.inverter_id or "")
    inverter_count = None
    inverter_ac_mw = None
    if inverter:
        inverter_count = math.ceil(req.plant.ac_mw * 1000 / inverter["ac_nominal_kw"])
        inverter_ac_mw = inverter_count * inverter["ac_nominal_kw"] / 1000.0
    return {
        "n_panels": int(n_panels),
        "ilr": round(ilr, 3),
        "dc_loss_pct": plant["dc_loss_pct"],
        "pitch_m": round(plant["pitch_m"], 2),
        "collector_w": round(plant["collector_w"], 2),
        "bifacial": req.plant.bifacial and req.panel.bifaciality > 0,
        "inverter_count": inverter_count,
        "inverter_ac_mw": round(inverter_ac_mw, 3) if inverter_ac_mw else None,
    }


def _fixed_ctx(df, req, alt, horizon, interval_label="start"):
    """Build a fixed-tilt context (for the tracker-vs-fixed comparison)."""
    plant = _build_plant(req.panel, req.plant)
    plant["mounting"] = "fixed"
    return engine.build_context(df, req.location.lat, req.location.lon, float(alt), plant,
                                horizon, interval_label)


def _required_horizon(lat: float, lon: float):
    """Fetch a requested horizon, or fail rather than silently omit shading."""
    try:
        result = pvlib.iotools.get_pvgis_horizon(lat, lon)
        horizon = result[0] if isinstance(result, tuple) else result
        if horizon is None or len(horizon) < 2:
            raise ValueError("the returned horizon contains fewer than two points")
        return horizon
    except Exception as exc:
        raise ValueError(
            f"Horizon shading was requested but the PVGIS horizon could not be loaded: {exc}. "
            "Check the connection and retry, or explicitly turn off horizon shading."
        ) from exc


# Small cache of prepared simulation contexts so the orientation explorer can
# evaluate arbitrary tilt/azimuth points quickly (solar position is reused).
_CTX_CACHE: dict[str, object] = {}
_CTX_LOCK = threading.Lock()


def _ctx_for(req) -> "engine.SimContext":
    key = json.dumps({
        "w": req.weather.model_dump(), "lat": round(req.location.lat, 4),
        "lon": round(req.location.lon, 4), "alt": req.location.altitude,
        "panel": req.panel.model_dump(), "plant": req.plant.model_dump(),
    }, sort_keys=True, default=str)
    with _CTX_LOCK:
        if key in _CTX_CACHE:
            return _CTX_CACHE[key]
    df, meta = wx.get_weather(req.weather.source, req.location.lat,
                              req.location.lon, req.weather.year, req.weather.upload_id)
    alt = req.location.altitude
    if alt is None:
        alt = meta.get("elevation") or 0.0
    horizon = None
    if req.plant.apply_horizon:
        horizon = _required_horizon(req.location.lat, req.location.lon)
    plant = _build_plant(req.panel, req.plant)
    C = engine.build_context(df, req.location.lat, req.location.lon, float(alt),
                             plant, horizon, meta.get("interval_label", "start"))
    with _CTX_LOCK:
        if len(_CTX_CACHE) >= 4:                 # tiny LRU-ish cap
            _CTX_CACHE.pop(next(iter(_CTX_CACHE)))
        _CTX_CACHE[key] = C
    return C


@app.post("/api/evaluate")
def evaluate(req: EvaluateRequest):
    """Exact single-orientation result for the orientation explorer."""
    try:
        C = _ctx_for(req)
        d = engine.detail(float(req.tilt), float(req.azimuth), C, req.location.utc_offset)
        return {
            "tilt": req.tilt, "azimuth": req.azimuth,
            "kpis": d["kpis"],
            "monthly_mwh": d["monthly_mwh"],
            "monthly_yield": d["monthly_yield"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/longterm")
def longterm(req: LongTermRequest):
    """Multi-year probabilistic P50/P90 plus lifetime degradation."""
    try:
        df, meta = wx.get_multiyear(req.location.lat, req.location.lon,
                                    req.start_year, req.end_year)
        alt = req.location.altitude
        if alt is None:
            alt = meta.get("elevation") or 0.0
        # LID and availability are applied explicitly by the long-term model.
        # Remove them from the ordinary PVWatts loss stack to avoid double counting.
        longterm_plant = req.plant.model_copy(deep=True)
        longterm_plant.losses.lid = 0.0
        longterm_plant.losses.age = 0.0
        longterm_plant.losses.availability = 0.0
        plant = _build_plant(req.panel, longterm_plant)
        res = lt.analyze(df, req.location.lat, req.location.lon, float(alt), plant,
                         req.tilt, req.azimuth, req.model_uncertainty,
                         req.lifetime_years, req.lid, req.degradation_rate, req.availability)
        res["weather_meta"] = meta
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _main_calc_steps(req, meta, ws, sw, d, plant) -> list[dict]:
    """Plain-language, numbered walk-through of the yield calculation with the
    actual numbers of this run — so any reader can follow (and check) the result."""
    k = d["kpis"]
    wf = {w["stage"]: w["value"] for w in d.get("waterfall", [])}
    opt = sw.get("optimum", {})
    mounting = d.get("mounting", "fixed")
    if mounting == "sat":
        orient_txt = "a single-axis tracker (north-south axis, backtracking) that follows the sun through the day"
    elif sw.get("mode") == "manual":
        orient_txt = f"your specified orientation of {opt.get('tilt')}° tilt facing {opt.get('azimuth')}°"
    else:
        orient_txt = (f"the best orientation found by the sweep — {opt.get('tilt')}° tilt facing "
                      f"{opt.get('azimuth')}°" + (" (locally refined in 1° steps plus fractional bounded edges)" if sw.get("refined_resolution_deg") else ""))
    tm = {"faiman": "Faiman (IEC 61853)", "pvsyst": "PVsyst", "sapm_open": "SAPM open-rack",
          "sapm_close": "SAPM close-mount"}.get(req.plant.temp_model, req.plant.temp_model)
    steps = [
        {"title": "1. Weather input", "items": [
            f"Hourly weather comes from {meta.get('source','the selected source')}: "
            f"{ws.get('ghi_annual','—')} kWh/m² of horizontal solar irradiation per year, "
            f"average air temperature {ws.get('temp_mean','—')} °C, average wind {ws.get('wind_mean','—')} m/s.",
            "Solar position is computed for every hour at the middle of each measurement interval (NREL SPA algorithm).",
        ]},
        {"title": "2. Sunlight reaching the panel face", "items": [
            f"The panels use {orient_txt}.",
            f"Tilting the panels changes the received energy from {k.get('ghi_insolation','—')} kWh/m² (flat ground) "
            f"to {k.get('poa_insolation','—')} kWh/m² on the panel face (Hay-Davies sky model, including row-to-row shading"
            + (" and rear-side bifacial gain" if plant.get("bifaciality", 0) > 0 else "") + ").",
            f"Reflection at steep sun angles removes {abs(wf.get('IAM / reflection', 0)):,.0f} MWh (ASHRAE incidence model)."
            + (f" Low-light behaviour of the module removes a further {abs(wf.get('Low-light', 0)):,.0f} MWh." if wf.get("Low-light") else ""),
        ]},
        {"title": "3. Panel temperature", "items": [
            f"Cell temperature is calculated hour-by-hour with the {tm} model from sunlight, air temperature and wind; "
            f"the average operating cell temperature is {k.get('mean_cell_temp','—')} °C.",
            f"Because power falls {abs(req.panel.gamma_pmp)*100:.2f}% per °C above 25 °C, heat removes {abs(wf.get('Temperature', 0)):,.0f} MWh per year.",
        ]},
        {"title": "4. System losses (DC side)", "items": [
            f"Soiling, mismatch, wiring, connections, LID, nameplate tolerance and availability together derate the DC side by "
            f"{plant.get('dc_loss_pct','—')}%, removing {abs(wf.get('DC system derates', 0)):,.0f} MWh.",
        ]},
        {"title": "5. Inverter", "items": [
            f"DC power is converted with the PVWatts part-load efficiency curve (nominal {req.plant.eta_inv_nom*100:.1f}%), "
            f"costing {abs(wf.get('Inverter conversion', 0)):,.0f} MWh.",
            f"Whenever the array makes more than the {req.plant.ac_mw:g} MW AC nameplate, the excess is clipped: "
            f"{abs(wf.get('Inverter clipping', 0)):,.0f} MWh per year ({k.get('clipping_loss_pct','—')}% of DC energy).",
        ]},
        {"title": "6. Result", "items": [
            f"Net AC energy = {k.get('energy_mwh',0):,.0f} MWh per year "
            f"= {k.get('specific_yield',0):,.0f} kWh for every kWp of panels installed.",
            f"Performance ratio {k.get('performance_ratio','—')}% (energy delivered ÷ energy the panel face received × nameplate) "
            f"and capacity factor {k.get('capacity_factor','—')}% (average output ÷ AC nameplate).",
            "Every number above can be traced in the loss-waterfall chart; string sizing, transformer and land calculations "
            "have their own step-by-step boxes in the sections below.",
        ]},
    ]
    return steps


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    def stream():
        q: queue.Queue = queue.Queue()

        def worker():
            try:
                q.put({"type": "status", "message": "Fetching weather data..."})
                df, meta = wx.get_weather(req.weather.source, req.location.lat,
                                          req.location.lon, req.weather.year,
                                          req.weather.upload_id)
                alt = req.location.altitude
                if alt is None:
                    alt = meta.get("elevation") or 0.0

                horizon = None
                horizon_error = None
                if req.plant.apply_horizon:
                    try:
                        q.put({"type": "status", "message": "Fetching horizon profile..."})
                        h = pvlib.iotools.get_pvgis_horizon(req.location.lat, req.location.lon)
                        horizon = h[0] if isinstance(h, tuple) else h
                    except Exception as exc:
                        horizon_error = str(exc)
                        horizon = None

                plant = _build_plant(req.panel, req.plant)
                q.put({"type": "status", "message": "Building solar model..."})
                interval_label = meta.get("interval_label", "start")
                C = engine.build_context(df, req.location.lat, req.location.lon,
                                         float(alt), plant, horizon, interval_label)

                def prog(done, total):
                    q.put({"type": "progress", "done": done, "total": total})

                uo = req.location.utc_offset
                if req.plant.mounting == "sat":
                    # single-axis tracker: no fixed tilt/azimuth grid
                    q.put({"type": "status", "message": "Modelling single-axis tracker..."})
                    opt_detail = engine.detail(0.0, 180.0, C, uo)
                    fixed_tilt = round(abs(req.location.lat), 0)
                    fixed_az = 180.0 if req.location.lat >= 0 else 0.0
                    fixed_ctx = _fixed_ctx(df, req, alt, horizon, interval_label)
                    e_fixed = engine.detail(fixed_tilt, fixed_az, fixed_ctx, uo)["kpis"]["energy_mwh"]
                    sw = {
                        "mounting": "sat", "dc_kwp": plant["dc_mw"] * 1000.0,
                        "optimum": {
                            "tilt": None, "azimuth": None, "azimuth_defined": False, "mounting": "sat",
                            "energy_mwh": opt_detail["kpis"]["energy_mwh"],
                            "specific_yield": opt_detail["kpis"]["specific_yield"],
                            "fixed_ref": {"tilt": fixed_tilt, "azimuth": fixed_az,
                                          "energy_mwh": round(e_fixed, 1)},
                            "tracker_gain_pct": round(100 * (opt_detail["kpis"]["energy_mwh"] / e_fixed - 1), 1)
                            if e_fixed else 0.0,
                        },
                    }
                    opt = sw["optimum"]
                    sel_detail = None
                elif req.mode == "manual":
                    # PVsyst-style fixed-orientation evaluation at user angles
                    m_tilt = float(req.selected.tilt)
                    m_az = float(req.selected.azimuth)
                    q.put({"type": "status",
                           "message": f"Evaluating manual orientation {m_tilt:g}° / {m_az:g}°..."})
                    opt_detail = engine.detail(m_tilt, m_az, C, uo)
                    sw = {
                        "mounting": "fixed", "mode": "manual",
                        "dc_kwp": plant["dc_mw"] * 1000.0,
                        "optimum": {
                            "tilt": m_tilt, "azimuth": m_az,
                            "azimuth_defined": bool(m_tilt > 0.05), "mode": "manual",
                            "energy_mwh": opt_detail["kpis"]["energy_mwh"],
                            "specific_yield": opt_detail["kpis"]["specific_yield"],
                        },
                    }
                    opt = sw["optimum"]
                    sel_detail = None
                else:
                    q.put({"type": "status", "message": "Sweeping tilt x azimuth..."})
                    sw = engine.sweep(C, req.sweep.model_dump(), prog)
                    sw["mode"] = "optimize"
                    q.put({"type": "status", "message": "Refining locally in 1° steps and at search boundaries..."})
                    sw = engine.refine_optimum(C, sw, req.sweep.model_dump())
                    q.put({"type": "status", "message": "Evaluating optimum..."})
                    opt = sw["optimum"]
                    opt_detail = engine.detail(opt["tilt"], opt["azimuth"], C, uo)
                    sel_detail = None
                    s = req.selected
                    if s.tilt is not None and s.azimuth is not None:
                        sel_detail = engine.detail(float(s.tilt), float(s.azimuth), C, uo)

                # ---- preliminary electrical design + layout ----
                q.put({"type": "status", "message": "Sizing strings & inverters..."})
                t_min_weather = float(df["temp_air"].min())
                t_max_cell_weather = float(df["temp_air"].max()) + 29.0       # NOCT-style rise
                t_min = (
                    req.plant.design_temp_min_c
                    if req.plant.design_temp_min_c is not None
                    else t_min_weather
                )
                t_max_cell = (
                    req.plant.design_temp_max_cell_c
                    if req.plant.design_temp_max_cell_c is not None
                    else t_max_cell_weather
                )
                temp_source = (
                    "manual design override"
                    if (
                        req.plant.design_temp_min_c is not None
                        or req.plant.design_temp_max_cell_c is not None
                    )
                    else "weather-derived min air / max cell estimate"
                )
                uplift = 1.0 + (0.08 if (req.plant.bifacial and req.panel.bifaciality > 0) else 0.0)
                elec_design = elec.design(
                    req.panel.id, req.panel.pmpp_w, req.plant.inverter_id,
                    req.plant.dc_mw, req.plant.ac_mw, t_min, t_max_cell, uplift,
                    req.plant.inverter_count, req.panel.gamma_pmp, temp_source,
                )
                lay_az = opt["azimuth"] if opt.get("azimuth_defined") else (
                    req.plant.axis_azimuth + 90.0 if req.plant.mounting == "sat" else 180.0)
                lay_tilt = opt["tilt"] if opt.get("tilt") is not None else round(abs(req.location.lat), 0)
                geom = {"orientation": req.plant.orientation,
                        "width_m": req.panel.width_m, "length_m": req.panel.length_m,
                        "modules_per_row": req.plant.modules_per_row,
                        "collector_w": plant["collector_w"], "pitch_m": plant["pitch_m"]}
                # ---- balance of plant: transformers + minimum land area ----
                derived = _derived(req, plant)
                if elec_design.get("available") and elec_design.get("plant"):
                    ep = elec_design["plant"]
                    derived["inverter_count"] = ep["inverter_count"]
                    derived["inverter_ac_mw"] = ep["ac_installed_mw"]
                    derived["inverter_count_source"] = ep["inverter_count_source"]
                ac_basis_mw = max(
                    req.plant.ac_mw,
                    (elec_design.get("plant", {}) or {}).get("ac_installed_mw") or 0.0,
                )
                inv_catalog = cat.INVERTERS.get(req.plant.inverter_id or "")
                tx = infra_mod.transformer_design(
                    ac_basis_mw,
                    pf=req.plant.transformer_pf,
                    lv_v=inv_catalog.get("ac_voltage_v", 800) if inv_catalog else 800,
                    mv_kv=33,
                    requested_units=req.plant.transformer_count,
                    harmonic_tdd_pct=req.plant.harmonic_tdd_pct,
                )
                n_mod = (elec_design.get("plant", {}) or {}).get("modules_used") or derived["n_panels"]
                module_area = req.panel.length_m * req.panel.width_m
                land = infra_mod.land_area(int(n_mod), module_area, req.plant.gcr,
                                           req.plant.ac_mw, req.plant.dc_mw,
                                           req.plant.mounting, tx["recommended"]["total_mva"])
                elec_layout = elec.layout(
                    elec_design,
                    req.location.lat,
                    req.location.lon,
                    lay_az,
                    lay_tilt,
                    geom,
                    land,
                    tx,
                )

                weather_summary = wx.summary(df)
                result = {
                    "sweep": sw,
                    "optimum_detail": opt_detail,
                    "selected_detail": sel_detail,
                    "weather_meta": meta,
                    "weather_summary": weather_summary,
                    "calculation_steps": _main_calc_steps(req, meta, weather_summary,
                                                          sw, opt_detail, plant),
                    "derived": derived,
                    "infra": {"land": land, "transformer": tx},
                    "sun_path": engine.sun_path(
                        req.location.lat, req.location.lon, req.location.utc_offset
                    ),
                    "altitude": float(alt),
                    "electrical": elec_design,
                    "layout": elec_layout,
                    "model_info": {
                        "transposition": "Hay-Davies infinite-sheds",
                        "dc_model": opt_detail["dc_model"],
                        "horizon_requested": req.plant.apply_horizon,
                        "horizon_applied": C.horizon_applied,
                        "horizon_warning": horizon_error,
                        "map_overlay": "Schematic orientation only; not a surveyed layout",
                        "electrical_scope": (
                            "Preliminary string sizing & MPPT/inverter assignment from "
                            "datasheet limits and site temperatures; cable, protection, "
                            "LV/MV and grid-code design are out of scope"
                        ),
                    },
                }
                q.put({"type": "result", "data": result})
            except Exception as e:  # surface clean error to the UI
                q.put({"type": "error", "message": str(e)})
            finally:
                q.put(None)

        threading.Thread(target=worker, daemon=True).start()
        while True:
            item = q.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# --------------------------------------------------------------------------- #
# Sri Lanka solar atlas (progressive background build)
# --------------------------------------------------------------------------- #
@app.get("/api/atlas/status")
def atlas_status():
    atlas_mod.BUILDER._refresh_counts()
    return atlas_mod.BUILDER.state


@app.post("/api/atlas/start")
def atlas_start(body: dict = Body(default={})):
    try:
        res = float(body.get("resolution") or atlas_mod.BUILDER.state["resolution"])
        if res not in (0.05, 0.1, 0.25, 0.5):
            raise ValueError("resolution must be one of 0.05, 0.1, 0.25, 0.5 degrees")
        max_cells = body.get("max_cells")
        return atlas_mod.BUILDER.start(res, int(max_cells) if max_cells else None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/atlas/stop")
def atlas_stop():
    return atlas_mod.BUILDER.stop()


@app.get("/api/atlas/data")
def atlas_data():
    rows = atlas_mod.BUILDER.results()
    cells = [{"lat": r["lat"], "lon": r["lon"], "ghi": r["ghi"],
              "sy1": r["single"]["sy"], "t1": r["single"]["tilt"], "a1": r["single"]["azimuth"],
              "syd": r["dual"]["sy"], "td": r["dual"]["tilt"], "aed": r["dual"]["azimuth_east"],
              "gain": r["dual_vs_single_pct"]} for r in rows]
    return {"resolution": atlas_mod.BUILDER.state["resolution"],
            "assumptions": atlas_mod.BUILDER.state["assumptions"],
            "count": len(cells), "cells": cells}


@app.get("/api/atlas/cell")
def atlas_cell(lat: float, lon: float):
    r = atlas_mod.nearest_cell(lat, lon)
    if r is None:
        raise HTTPException(status_code=404, detail="No atlas cells computed yet — start the build first.")
    return r


@app.post("/api/eastwest/overload")
def eastwest_overload(req: EastWestOverloadRequest):
    """DC/AC (inverter overload) sweep for the dual-plane vs single-plane case."""
    try:
        df, meta = wx.get_weather(req.weather.source, req.location.lat,
                                  req.location.lon, req.weather.year, req.weather.upload_id)
        alt = req.location.altitude
        if alt is None:
            alt = meta.get("elevation") or 0.0
        horizon = None
        if req.plant.apply_horizon:
            horizon = _required_horizon(req.location.lat, req.location.lon)
        plant_in = req.plant.model_copy(deep=True)
        plant_in.mounting = "fixed"
        plant = _build_plant(req.panel, plant_in)
        C = engine.build_context(df, req.location.lat, req.location.lon, float(alt),
                                 plant, horizon, meta.get("interval_label", "start"))

        # single-plane reference orientation (given, or quick coarse search)
        if req.single_ref_tilt is not None and req.single_ref_azimuth is not None:
            sref = {"tilt": float(req.single_ref_tilt), "azimuth": float(req.single_ref_azimuth),
                    "source": "user"}
        else:
            sweep_cfg = {
                "tilt_min": 1.0, "tilt_max": 45.0, "tilt_step": 5.0,
                "az_min": 1.0, "az_max": 360.0, "az_step": 5.0,
            }
            sw = engine.sweep(C, sweep_cfg)
            sw = engine.refine_optimum(C, sw, sweep_cfg)
            best = sw["optimum"]
            sref = {"tilt": best["tilt"], "azimuth": best["azimuth"],
                    "source": "1 deg local refinement with bounded edges"}

        # hardware string-capacity ILR cap for the selected catalogue inverter
        hardware_max_ilr = None
        t_min = float(df["temp_air"].min())
        t_max_cell = float(df["temp_air"].max()) + 29.0
        uplift = 1.0 + (0.08 if (req.plant.bifacial and req.panel.bifaciality > 0) else 0.0)
        ed = elec.design(req.panel.id, req.panel.pmpp_w, req.plant.inverter_id,
                         req.plant.dc_mw, req.plant.ac_mw, t_min, t_max_cell, uplift)
        if ed.get("available") and ed.get("feasible"):
            per_unit_dc_kw = (ed["mppt"]["strings_per_inverter_max"]
                              * ed["string"]["modules_per_string"] * req.panel.pmpp_w / 1000.0)
            hardware_max_ilr = per_unit_dc_kw / ed["inverter"]["ac_kw"]

        plane_a = ew_mod._plane_dict(req.plane_a.label or "Plane A", req.plane_a.tilt,
                                     req.plane_a.azimuth, req.plane_a.dc_share)
        plane_b = ew_mod._plane_dict(req.plane_b.label or "Plane B", req.plane_b.tilt,
                                     req.plane_b.azimuth, req.plane_b.dc_share)
        ilr_values = ew_mod._axis(req.ilr_min, req.ilr_max, req.ilr_step)
        res = ew_mod.overload_sweep(C, plane_a, plane_b, req.inverter_arrangement, sref,
                                    ilr_values, req.clip_threshold_pct, hardware_max_ilr,
                                    req.location.utc_offset)
        res["weather_meta"] = meta
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/eastwest/analyze")
def eastwest_analyze(req: EastWestAnalyzeRequest):
    """Stream East-West dual-plane optimisation or exact manual calculation."""

    def stream():
        q: queue.Queue = queue.Queue()

        def worker():
            try:
                q.put({"type": "status", "message": "Fetching weather data..."})
                df, meta = wx.get_weather(req.weather.source, req.location.lat,
                                          req.location.lon, req.weather.year,
                                          req.weather.upload_id)
                alt = req.location.altitude
                if alt is None:
                    alt = meta.get("elevation") or 0.0

                horizon = None
                horizon_error = None
                if req.plant.apply_horizon:
                    try:
                        q.put({"type": "status", "message": "Fetching horizon profile..."})
                        h = pvlib.iotools.get_pvgis_horizon(req.location.lat, req.location.lon)
                        horizon = h[0] if isinstance(h, tuple) else h
                    except Exception as exc:
                        horizon_error = str(exc)
                        horizon = None

                ew_plant_in = req.plant.model_copy(deep=True)
                forced_fixed = ew_plant_in.mounting != "fixed"
                ew_plant_in.mounting = "fixed"
                plant = _build_plant(req.panel, ew_plant_in)
                q.put({"type": "status", "message": "Building East-West solar model..."})
                C = engine.build_context(
                    df,
                    req.location.lat,
                    req.location.lon,
                    float(alt),
                    plant,
                    horizon,
                    meta.get("interval_label", "start"),
                )

                def prog(done, total):
                    q.put({"type": "progress", "done": done, "total": total})

                if req.mode == "manual":
                    q.put({"type": "status", "message": "Evaluating manual dual-plane arrangement..."})
                elif req.arrangement == "independent":
                    q.put({"type": "status", "message": "Optimizing independent East-West planes..."})
                else:
                    q.put({"type": "status", "message": "Optimizing symmetric East-West planes..."})

                result = ew_mod.analyze(req, C, req.location.utc_offset, prog, forced_fixed=forced_fixed)
                result.update({
                    "weather_meta": meta,
                    "weather_summary": wx.summary(df),
                    "sun_path": engine.sun_path(req.location.lat, req.location.lon, req.location.utc_offset),
                    "altitude": float(alt),
                    "plant_summary": {
                        "dc_mw": req.plant.dc_mw,
                        "ac_mw": req.plant.ac_mw,
                        "dc_kwp": round(plant["dc_mw"] * 1000.0, 3),
                        "ac_kw": round(plant["ac_mw"] * 1000.0, 3),
                        "dc_ac_ratio": round(req.plant.dc_mw / req.plant.ac_mw, 3),
                        "dc_loss_pct": plant["dc_loss_pct"],
                        "bifaciality": plant["bifaciality"],
                        "gcr": plant["gcr"],
                    },
                    "model_info": {
                        "transposition": "Two independent Hay-Davies infinite-sheds plane models",
                        "pvlib_version": pvlib.__version__,
                        "dc_model": C.dc_model if C.dc_model != "detailed" or C.lowlight is not None else "pvwatts",
                        "horizon_requested": req.plant.apply_horizon,
                        "horizon_applied": C.horizon_applied,
                        "horizon_warning": horizon_error,
                        "geometry_scope": (
                            "Approximate East-West electrical combination; not a surveyed "
                            "3D terrain, row self-shading, or alternating-shed validation model"
                        ),
                    },
                })
                q.put({"type": "result", "data": result})
            except Exception as e:
                q.put({"type": "error", "message": str(e)})
            finally:
                q.put(None)

        threading.Thread(target=worker, daemon=True).start()
        while True:
            item = q.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# --------------------------------------------------------------------------- #
# Static frontend
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


@app.get("/field")
def field_page():
    """PV condition monitor (MI3115 field-test analysis) companion page."""
    return FileResponse(FRONTEND / "field.html")


app.mount("/", StaticFiles(directory=str(FRONTEND)), name="static")
