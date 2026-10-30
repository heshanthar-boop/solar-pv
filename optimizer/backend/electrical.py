"""
Preliminary electrical design: string sizing, MPPT / inverter assignment and a
schematic plant layout.

Follows standard PV string-sizing practice (e.g. IEC 62548 / inverter design
guides):

  * Max modules per string  -> coldest-cell Voc must stay below the lower of the
    inverter max DC voltage and the module max system voltage.
  * Min modules per string  -> hottest-cell Vmp must stay above the inverter
    minimum MPP voltage, and STC Vmp above the start-up voltage.
  * Strings per MPPT         -> limited by the SMALLER of the physical connector
    count and the MPPT continuous-current rating (Impp x parallel strings).
  * Strings per inverter     -> limited by max strings and the MPPT layout.

These are preliminary sizing figures for layout/feasibility only; a bankable
design must use the manufacturer string-sizing tool with site record
temperatures, cable/protection design and grid-code compliance.
"""
from __future__ import annotations

import math
from . import catalog as cat


# --------------------------------------------------------------------------- #
def _bin_specs(panel_id: str | None, pmpp_w: float):
    p = cat.PANELS.get(panel_id or "")
    if not p:
        return None
    key = min(p["bins"], key=lambda b: abs(b - pmpp_w))
    return p, p["bins"][key], key


def design(panel_id, pmpp_w, inverter_id, dc_mw, ac_mw,
           t_min=10.0, t_max_cell=70.0, bifacial_current_uplift=1.0,
           inverter_count_target: int | None = None,
           gamma_pmp: float | None = None,
           temp_source: str = "weather-derived") -> dict:
    """String sizing + MPPT/inverter assignment. Returns a structured report."""
    pinfo = _bin_specs(panel_id, pmpp_w)
    inv = cat.INVERTERS.get(inverter_id or "")
    if not pinfo or not inv or not inv.get("max_strings"):
        return {"available": False,
                "reason": "Electrical sizing needs a catalogue module + string inverter."}
    p, s, bin_w = pinfo
    voc, vmp, isc, imp = s["voc"], s["vmp"], s["isc"], s["imp"]
    beta_voc = p["beta_voc"]                     # /degC (negative)
    gamma_vmp = p.get("gamma_vmp", beta_voc)     # Vmp coeff (proxy = beta_voc)
    gamma_perf = gamma_pmp if gamma_pmp is not None else p.get("gamma_pmp", -0.003)
    alpha_isc = p.get("alpha_isc", 0.00045)

    # ---- voltage window -> modules per string ----
    voc_cold = voc * (1 + beta_voc * (t_min - 25.0))
    vmp_cold = vmp * (1 + gamma_vmp * (t_min - 25.0))
    vmp_hot = vmp * (1 + gamma_vmp * (t_max_cell - 25.0))
    v_sys = min(inv["max_dc_voltage"], p["max_system_voltage"])
    n_max_voltage = int(v_sys // voc_cold)
    n_max_mppt = int(inv["max_mppt_v"] // vmp_cold)
    n_min_mppt = math.ceil(inv["min_mppt_v"] / vmp_hot)
    n_min_start = math.ceil(inv["startup_v"] / vmp_hot)
    n_min = max(n_min_mppt, n_min_start, 1)
    n_max = min(n_max_voltage, n_max_mppt)

    feasible = n_max >= n_min
    n_string = n_max if feasible else n_min  # longest string satisfying all limits

    voc_string_cold = n_string * voc_cold
    vmp_string_stc = n_string * vmp
    vmp_string_hot = n_string * vmp_hot

    # ---- current -> strings per MPPT ----
    imp_eff = imp * bifacial_current_uplift
    isc_eff = isc * bifacial_current_uplift
    str_per_mppt_current = int(inv["max_current_per_mppt_a"] // imp_eff)
    str_per_mppt_isc = int(inv["isc_per_mppt_a"] // isc_eff)
    str_per_mppt = max(
        1,
        min(inv["strings_per_mppt"], str_per_mppt_current, str_per_mppt_isc),
    )
    limits = {
        "connector count": inv["strings_per_mppt"],
        "MPPT operating current": str_per_mppt_current,
        "MPPT short-circuit current": str_per_mppt_isc,
    }
    mppt_limit = min(limits, key=limits.get)
    str_per_inv_current = int(inv["max_dc_current_a"] // imp_eff)
    str_per_inv_max = min(
        inv["max_strings"],
        str_per_mppt * inv["n_mppt"],
        str_per_inv_current,
    )

    # ---- plant counts ----
    total_modules = math.floor(dc_mw * 1e6 / pmpp_w)
    target_strings = max(1, total_modules // n_string)
    min_by_ac = max(1, math.ceil(ac_mw * 1000.0 / inv["ac_nominal_kw"]))
    min_by_strings = max(1, math.ceil(target_strings / max(str_per_inv_max, 1)))
    min_required_inverters = max(min_by_ac, min_by_strings)
    warnings = []

    if inverter_count_target:
        inverter_count = max(1, int(inverter_count_target))
        inverter_count_source = "manual"
    else:
        inverter_count = min_required_inverters
        inverter_count_source = "auto"

    strings_capacity = inverter_count * max(str_per_inv_max, 1)
    total_strings = min(target_strings, strings_capacity)
    if total_strings < target_strings:
        warnings.append(
            f"Requested inverter count can accept {total_strings} strings; "
            f"{target_strings - total_strings} target strings are left unplaced."
        )
    ac_installed_mw = inverter_count * inv["ac_nominal_kw"] / 1000.0
    if ac_installed_mw + 1e-9 < ac_mw:
        warnings.append(
            f"Installed inverter AC is {ac_installed_mw:.2f} MW, below the requested {ac_mw:.2f} MW AC."
        )

    modules_used = total_strings * n_string
    dc_used_mw = modules_used * pmpp_w / 1e6
    unused_modules = max(0, total_modules - modules_used)
    unused_dc_mw = unused_modules * pmpp_w / 1e6
    strings_per_inv = math.ceil(total_strings / inverter_count) if inverter_count else 0

    # ---- distribute strings across inverters & MPPTs ----
    per_inv = _balance(total_strings, inverter_count, keep_zeros=True)
    inverters = []
    for k, n_str in enumerate(per_inv, start=1):
        mppts = _balance(n_str, inv["n_mppt"], keep_zeros=True)
        dc_kw = n_str * n_string * pmpp_w / 1000.0
        inverters.append({
            "id": k, "strings": n_str,
            "modules": n_str * n_string,
            "dc_kw": round(dc_kw, 1),
            "ac_kw": inv["ac_nominal_kw"],
            "dc_ac": round(dc_kw / inv["ac_nominal_kw"], 3),
            "mppt": mppts,
            "max_str_per_mppt": str_per_mppt,
        })

    # MPPT current per fully loaded MPPT
    mppt_current = round(str_per_mppt * imp_eff, 1)
    temp_points = []
    for label, temp in (
        ("Minimum design temperature", t_min),
        ("STC reference", 25.0),
        ("Maximum design cell temperature", t_max_cell),
    ):
        voc_t = voc * (1 + beta_voc * (temp - 25.0))
        vmp_t = vmp * (1 + gamma_vmp * (temp - 25.0))
        isc_t = isc * (1 + alpha_isc * (temp - 25.0)) * bifacial_current_uplift
        pmp_factor = 1 + gamma_perf * (temp - 25.0)
        temp_points.append({
            "label": label,
            "cell_temp_c": round(temp, 1),
            "module_voc": round(voc_t, 2),
            "string_voc": round(n_string * voc_t, 0),
            "module_vmp": round(vmp_t, 2),
            "string_vmp": round(n_string * vmp_t, 0),
            "module_isc": round(isc_t, 2),
            "pmax_factor_pct": round(100 * pmp_factor, 1),
            "dc_power_at_target_mw": round(dc_used_mw * pmp_factor, 3),
        })
    arrangement_feasible = (
        feasible
        and total_strings == target_strings
        and ac_installed_mw + 1e-9 >= ac_mw
        and strings_per_inv <= str_per_inv_max
    )
    if strings_per_inv > str_per_inv_max:
        warnings.append(
            f"Each inverter would need {strings_per_inv} strings, above the {str_per_inv_max} string limit."
        )

    return {
        "available": True,
        "feasible": feasible,
        "panel": {"model": p["model"], "bin_w": bin_w, "voc": voc, "vmp": vmp,
                  "isc": isc, "imp": imp, "beta_voc_pct": round(beta_voc * 100, 3)},
        "inverter": {"model": inv["model"], "ac_kw": inv["ac_nominal_kw"],
                     "mppt": inv["n_mppt"], "v_window": [inv["min_mppt_v"], inv["max_mppt_v"]],
                     "max_dc_v": inv["max_dc_voltage"], "imax_mppt": inv["max_current_per_mppt_a"],
                     "max_strings": inv["max_strings"]},
        "design_temps": {
            "t_min": round(t_min, 1),
            "t_max_cell": round(t_max_cell, 1),
            "source": temp_source,
        },
        "temperature_variation": temp_points,
        "string": {
            "modules_per_string": n_string,
            "n_min": n_min, "n_max": n_max,
            "n_min_driver": "MPPT min voltage" if n_min_mppt >= n_min_start else "start-up voltage",
            "n_max_driver": (
                "cold Voc/system voltage" if n_max_voltage <= n_max_mppt
                else "cold Vmp/MPPT maximum"
            ),
            "voc_cold": round(voc_cold, 1),
            "voc_string_cold": round(voc_string_cold, 0),
            "v_sys_limit": v_sys,
            "voc_margin_v": round(v_sys - voc_string_cold, 0),
            "vmp_string_stc": round(vmp_string_stc, 0),
            "vmp_string_hot": round(vmp_string_hot, 0),
            "in_window": bool(inv["min_mppt_v"] <= vmp_string_hot
                              and vmp_string_stc <= inv["max_mppt_v"]),
        },
        "mppt": {
            "strings_per_mppt": str_per_mppt,
            "limited_by": mppt_limit,
            "connector_max": inv["strings_per_mppt"],
            "current_max": str_per_mppt_current,
            "isc_max": str_per_mppt_isc,
            "current_per_mppt_a": mppt_current,
            "isc_per_mppt_a": round(str_per_mppt * isc_eff, 1),
            "isc_limit_a": inv["isc_per_mppt_a"],
            "imax_mppt_a": inv["max_current_per_mppt_a"],
            "strings_per_inverter_max": str_per_inv_max,
        },
        "plant": {
            "modules_target": total_modules,
            "modules_used": modules_used,
            "unused_modules": unused_modules,
            "dc_used_mw": round(dc_used_mw, 3),
            "unused_dc_mw": round(unused_dc_mw, 3),
            "target_strings": target_strings,
            "total_strings": total_strings,
            "inverter_count": inverter_count,
            "requested_inverter_count": inverter_count_target,
            "inverter_count_source": inverter_count_source,
            "min_required_inverters": min_required_inverters,
            "min_by_ac": min_by_ac,
            "min_by_strings": min_by_strings,
            "arrangement_feasible": arrangement_feasible,
            "strings_per_inverter": strings_per_inv,
            "ac_installed_mw": round(ac_installed_mw, 2),
            "ac_shortfall_mw": round(max(0.0, ac_mw - ac_installed_mw), 3),
        },
        "inverters": inverters,
        "warnings": warnings,
        "calculation_steps": _calculation_steps(
            voc, vmp, isc, imp, beta_voc, gamma_vmp, gamma_perf, t_min,
            t_max_cell, voc_cold, vmp_hot, n_min_mppt, n_min_start,
            n_max_voltage, n_max_mppt, n_string, str_per_mppt, str_per_inv_max,
            target_strings, total_strings, inverter_count, inverter_count_source,
            min_required_inverters, dc_used_mw, ac_installed_mw,
        ),
    }


def _balance(total: int, bins: int, keep_zeros: bool = False) -> list[int]:
    """Distribute `total` items across `bins` as evenly as possible."""
    if bins <= 0:
        return [total]
    base, rem = divmod(total, bins)
    out = [base + 1 if i < rem else base for i in range(bins)]
    if keep_zeros:
        return out
    return [x for x in out if x > 0] or [0]


def _calculation_steps(
    voc, vmp, isc, imp, beta_voc, gamma_vmp, gamma_perf, t_min, t_max_cell,
    voc_cold, vmp_hot, n_min_mppt, n_min_start, n_max_voltage, n_max_mppt,
    n_string, str_per_mppt, str_per_inv_max, target_strings, total_strings,
    inverter_count, inverter_count_source, min_required_inverters, dc_used_mw,
    ac_installed_mw,
) -> list[dict]:
    pct = lambda x: round(100 * x, 3)
    return [
        {
            "title": "1. Temperature correction",
            "items": [
                f"Cold module Voc = {voc:.2f} × [1 + ({pct(beta_voc)}%/°C × ({t_min:.1f} − 25))] = {voc_cold:.2f} V.",
                f"Hot module Vmp = {vmp:.2f} × [1 + ({pct(gamma_vmp)}%/°C × ({t_max_cell:.1f} − 25))] = {vmp_hot:.2f} V.",
                f"Module power at hot design temperature uses γPmax {pct(gamma_perf)}%/°C, so heat reduces output before inverter clipping is considered.",
            ],
        },
        {
            "title": "2. String length window",
            "items": [
                f"Maximum modules by cold Voc/system voltage = {n_max_voltage}.",
                f"Maximum modules by cold Vmp/MPPT high limit = {n_max_mppt}.",
                f"Minimum modules by MPPT low limit = {n_min_mppt}; minimum by start-up voltage = {n_min_start}.",
                f"Selected modules per string = {n_string}, the longest value inside all limits.",
            ],
        },
        {
            "title": "3. MPPT and inverter loading",
            "items": [
                f"STC operating current is {imp:.2f} A and short-circuit current is {isc:.2f} A before bifacial current uplift.",
                f"Selected strings per MPPT = {str_per_mppt}; maximum strings per inverter = {str_per_inv_max}.",
                f"Target array requires {target_strings} strings; placed strings = {total_strings}.",
            ],
        },
        {
            "title": "4. Inverter quantity and final arrangement",
            "items": [
                f"Inverter count is {inverter_count} ({inverter_count_source}; minimum required by AC/string limits = {min_required_inverters}).",
                f"Usable DC after whole-string rounding = {dc_used_mw:.3f} MWdc.",
                f"Installed inverter AC capacity = {ac_installed_mw:.2f} MWac.",
            ],
        },
    ]


# --------------------------------------------------------------------------- #
# Schematic plant layout (plan view + georeferenced GeoJSON)
# --------------------------------------------------------------------------- #
def _dest(lat, lon, bearing_deg, dist_m):
    R = 6371008.8
    d = dist_m / R
    br = math.radians(bearing_deg)
    p1 = math.radians(lat)
    l1 = math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(br))
    l2 = l1 + math.atan2(math.sin(br) * math.sin(d) * math.cos(p1),
                         math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180


def layout(design_result: dict, lat, lon, azimuth, tilt, geom: dict,
           land: dict | None = None, transformer: dict | None = None) -> dict:
    """Build a metre-based site, block and string layout plus GeoJSON overlays."""
    if not design_result.get("available"):
        return {"available": False}
    portrait = geom.get("orientation", "portrait") == "portrait"
    mod_w = geom["width_m"] if portrait else geom["length_m"]   # along-row module dim
    n_high = max(1, int(geom.get("modules_per_row", 1)))
    L = geom["collector_w"]                                     # slope length
    pitch = geom["pitch_m"]
    depth = L * math.cos(math.radians(tilt))                    # row footprint (plan)
    gap = 0.4                                                   # m between tables side-by-side

    inv = design_result["inverters"]
    n_string = design_result["string"]["modules_per_string"]

    # one "table" per string: width = (modules along row) * mod_w, depth = row footprint
    cols_per_string = max(1, math.ceil(n_string / n_high))
    table_w = cols_per_string * mod_w

    # arrange inverter blocks in a grid (aim ~16:9 field)
    n_inv = len(inv)
    block_cols = max(1, round(math.sqrt(n_inv * 1.6)))
    block_rows = math.ceil(n_inv / block_cols)

    # within a block, lay strings in rows aiming for a squarish block
    strings_max = max(b["strings"] for b in inv)
    str_cols = max(1, round(math.sqrt(strings_max * (pitch / max(table_w, 0.1)) * 1.0)))
    str_cols = max(1, min(str_cols, strings_max))

    block_w = str_cols * (table_w + gap)
    block_rows_of_strings = math.ceil(strings_max / str_cols)
    block_h = block_rows_of_strings * pitch
    aisle = max(6.0, pitch)                                     # service aisle between blocks

    palette = ["#ffb12b", "#36d6b8", "#4ea3ff", "#f87171", "#a78bfa",
               "#f59e0b", "#22d3ee", "#fb7185", "#34d399", "#60a5fa"]

    blocks = []
    geo_features = []
    bx_step = block_w + aisle
    by_step = block_h + aisle
    field_w = block_cols * bx_step - aisle
    field_h = block_rows * by_step - aisle

    # local axes: x = row direction (bearing = azimuth+90), y = pitch direction (= azimuth)
    bearing_x = (azimuth + 90) % 360
    bearing_y = azimuth % 360
    site = _site_layout(field_w, field_h, land, transformer)
    array_x = site["array"]["x"]
    array_y = site["array"]["y"]

    def to_ring(points):
        ring = []
        for (mx, my) in points:
            la, lo = _dest(lat, lon, bearing_x, mx - site["w"] / 2)
            la, lo = _dest(la, lo, bearing_y, my - site["h"] / 2)
            ring.append([round(lo, 7), round(la, 7)])
        ring.append(ring[0])
        return ring

    geo_features.append({
        "type": "Feature",
        "properties": {
            "kind": "site_boundary",
            "label": "Minimum site fence",
            "area_ha": site["area_ha"],
            "required_ha": site["required_ha"],
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [to_ring([(0, 0), (site["w"], 0), (site["w"], site["h"]), (0, site["h"])])],
        },
    })
    for area in site["areas"]:
        geo_features.append({
            "type": "Feature",
            "properties": {
                "kind": area["kind"],
                "label": area["label"],
                "area_m2": area["area_m2"],
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [to_ring([
                    (area["x"], area["y"]),
                    (area["x"] + area["w"], area["y"]),
                    (area["x"] + area["w"], area["y"] + area["h"]),
                    (area["x"], area["y"] + area["h"]),
                ])],
            },
        })

    for idx, b in enumerate(inv):
        gc = idx % block_cols
        gr = idx // block_cols
        x0 = gc * bx_step
        y0 = gr * by_step
        sx0 = array_x + x0
        sy0 = array_y + y0
        color = palette[idx % len(palette)]
        blocks.append({
            "id": b["id"], "x": round(x0, 1), "y": round(y0, 1),
            "site_x": round(sx0, 1), "site_y": round(sy0, 1),
            "w": round(block_w, 1), "h": round(block_h, 1),
            "color": color, "strings": b["strings"], "modules": b["modules"],
            "dc_kw": b["dc_kw"], "mppt": b["mppt"],
            "str_cols": str_cols, "table_w": round(table_w, 2),
            "table_gap": round(gap, 2), "row_pitch": round(pitch, 2),
            "row_depth": round(depth, 2),
        })
        # georeferenced block polygon
        corners = [(sx0, sy0), (sx0 + block_w, sy0),
                   (sx0 + block_w, sy0 + block_h), (sx0, sy0 + block_h)]
        geo_features.append({
            "type": "Feature",
            "properties": {"kind": "array_block", "inverter": b["id"], "strings": b["strings"],
                           "modules": b["modules"], "dc_kw": b["dc_kw"]},
            "geometry": {"type": "Polygon", "coordinates": [to_ring(corners)]},
        })

    return {
        "available": True,
        "field_w": round(field_w, 1), "field_h": round(field_h, 1),
        "land_ha": round(field_w * field_h / 1e4, 2),
        "block_w": round(block_w, 1), "block_h": round(block_h, 1),
        "azimuth": azimuth, "tilt": tilt, "pitch": round(pitch, 2),
        "site": site,
        "blocks": blocks,
        "geojson": {"type": "FeatureCollection",
                    "properties": {
                        "site": [lon, lat],
                        "azimuth": azimuth,
                        "tilt": tilt,
                        "site_w": site["w"],
                        "site_h": site["h"],
                    },
                    "features": geo_features},
    }


def _schedule_m2(land: dict | None, key: str) -> float:
    if not land:
        return 0.0
    for row in land.get("schedule", []):
        if key.lower() in str(row.get("item", "")).lower():
            return float(row.get("m2") or 0.0)
    return 0.0


def _rect_area(rect: dict) -> float:
    return float(rect["w"]) * float(rect["h"])


def _site_layout(field_w: float, field_h: float, land: dict | None,
                 transformer: dict | None) -> dict:
    """Reserve a minimum fence envelope with array, road, switchyard and control room."""
    required_m2 = float((land or {}).get("total_m2") or max(field_w * field_h * 1.25, 1.0))
    required_ha = round(required_m2 / 1e4, 3)
    switch_area = _schedule_m2(land, "switchyard") or max(900.0, required_m2 * 0.06)
    control_area = _schedule_m2(land, "control room") or 120.0

    fence = max(8.0, min(18.0, math.sqrt(required_m2) * 0.045))
    road = max(5.5, min(8.0, math.sqrt(required_m2) * 0.025))
    switch_w = max(34.0, min(115.0, math.sqrt(switch_area * 1.7)))
    switch_h = max(18.0, switch_area / switch_w)
    control_w = max(12.0, min(32.0, math.sqrt(control_area * 1.6)))
    control_h = max(8.0, control_area / control_w)
    service_h = max(switch_h, control_h) + road

    min_w = max(field_w + 2 * fence, switch_w + control_w + 3 * road + 2 * fence)
    min_h = field_h + service_h + 2 * fence + road
    site_w = max(min_w, math.sqrt(required_m2 * 1.35))
    site_h = max(min_h, required_m2 / site_w)
    if site_w * site_h < required_m2:
        scale = math.sqrt(required_m2 / (site_w * site_h))
        site_w *= scale
        site_h *= scale

    array_x = (site_w - field_w) / 2
    array_y = fence
    service_y = min(site_h - fence - service_h, array_y + field_h + road)
    service_y = max(array_y + field_h + road * 0.5, service_y)
    road_rect = {
        "kind": "service_road",
        "label": "Internal access road",
        "x": fence,
        "y": max(array_y + field_h, service_y - road),
        "w": max(site_w - 2 * fence, 1.0),
        "h": road,
    }
    switchyard = {
        "kind": "switchyard",
        "label": "33 kV switchyard + transformer bays",
        "x": fence,
        "y": service_y + road,
        "w": switch_w,
        "h": switch_h,
    }
    control = {
        "kind": "control_room",
        "label": "Control room / SCADA / LV auxiliary",
        "x": fence + switch_w + road,
        "y": service_y + road + max(0.0, switch_h - control_h),
        "w": control_w,
        "h": control_h,
    }
    areas = [road_rect, switchyard, control]
    for a in areas:
        a["area_m2"] = round(_rect_area(a), 1)
        for k in ("x", "y", "w", "h"):
            a[k] = round(a[k], 1)

    tx_units = 0
    if transformer:
        tx_units = int(((transformer.get("recommended") or {}).get("units")) or 0)

    return {
        "w": round(site_w, 1),
        "h": round(site_h, 1),
        "area_m2": round(site_w * site_h),
        "area_ha": round(site_w * site_h / 1e4, 3),
        "required_m2": round(required_m2),
        "required_ha": required_ha,
        "fence_setback_m": round(fence, 1),
        "road_width_m": round(road, 1),
        "array": {
            "x": round(array_x, 1),
            "y": round(array_y, 1),
            "w": round(field_w, 1),
            "h": round(field_h, 1),
        },
        "transformer_units": tx_units,
        "areas": areas,
        "note": "Minimum preliminary envelope includes PV tables, internal access, switchyard, transformer bays, control room and perimeter setback.",
    }
