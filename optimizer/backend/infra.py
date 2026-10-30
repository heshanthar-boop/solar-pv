"""
Balance-of-plant sizing: minimum land area and MV step-up transformers.

Land area follows the standard collector-area / ground-cover-ratio relationship
plus explicit allowances for internal roads, the 33 kV switchyard + step-up
transformers, the control room, and a perimeter setback/buffer. Cross-checked
against NREL land-use benchmarks (Ong et al. 2013): total land use is typically
~1.0-1.4 ha/MWdc for fixed-tilt and ~1.4-2.0 ha/MWdc for single-axis trackers.

Transformers use IEC 60076 standard MVA ratings. The recommended scheme is the
best value for money: the fewest standard units that cover the plant MVA with
the least over-sizing (lowest installed MVA, highest utilisation).
"""
from __future__ import annotations

import math

# IEC 60076 standard transformer ratings (MVA)
STD_MVA = [0.5, 0.63, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.15, 4.0, 5.0, 6.3,
           8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 31.5, 40.0, 50.0, 63.0]

M2_PER_HA = 1e4
M2_PER_ACRE = 4046.86


def transformer_design(ac_mw: float, pf: float = 0.95,
                       lv_v: int = 800, mv_kv: int = 33,
                       requested_units: int | None = None,
                       harmonic_tdd_pct: float | None = 3.0) -> dict:
    """Best value-for-money MV step-up scheme from IEC standard ratings."""
    req = ac_mw / pf                                   # required apparent power (MVA)
    candidates = []
    for n in range(1, 13):
        per = req / n
        rating = next((r for r in STD_MVA if r >= per - 1e-9), None)
        if rating is None:
            continue
        total = rating * n
        oversize = total / req - 1.0
        candidates.append({
            "units": n, "rating_mva": rating, "total_mva": round(total, 2),
            "utilisation_pct": round(100 * req / total, 1),
            "oversize_pct": round(100 * oversize, 1),
            # value score: least over-sizing, with a small penalty per extra unit
            "score": oversize + 0.03 * (n - 1),
        })
    candidates.sort(key=lambda c: c["score"])
    best = candidates[0]
    selected = best
    selection_source = "best-value auto"
    warnings = []
    if requested_units:
        n = max(1, int(requested_units))
        per = req / n
        rating = next((r for r in STD_MVA if r >= per - 1e-9), None)
        if rating is None:
            rating = STD_MVA[-1]
            warnings.append(
                f"{n} transformer(s) cannot cover {req:.2f} MVA with standard ratings up to {STD_MVA[-1]} MVA."
            )
        total = rating * n
        selected = {
            "units": n,
            "rating_mva": rating,
            "total_mva": round(total, 2),
            "utilisation_pct": round(100 * req / total, 1),
            "oversize_pct": round(100 * (total / req - 1.0), 1),
            "score": 0,
        }
        selection_source = "manual transformer count"
        if selected["utilisation_pct"] > 100:
            warnings.append("Selected transformer count/rating is overloaded for the requested AC power.")
    # a couple of distinct alternatives for context (different unit counts)
    seen, alts = {best["units"]}, []
    for c in candidates[1:]:
        if c["units"] not in seen and c["oversize_pct"] <= 35:
            alts.append(c); seen.add(c["units"])
        if len(alts) >= 2:
            break
    harmonic = harmonic_acceptance(harmonic_tdd_pct)
    return {
        "required_mva": round(req, 2), "pf": pf,
        "lv_v": lv_v, "mv_kv": mv_kv,
        "vector_group": "Dyn11", "impedance_pct": "6–8", "cooling": "ONAN/ONAF",
        "tap_changer": "Off-load HV taps (±2×2.5%); OLTC optional at the grid GSS",
        "recommended": {k: selected[k] for k in
                        ("units", "rating_mva", "total_mva", "utilisation_pct", "oversize_pct")},
        "auto_recommended": {k: best[k] for k in
                             ("units", "rating_mva", "total_mva", "utilisation_pct", "oversize_pct")},
        "selection_source": selection_source,
        "alternatives": [{k: c[k] for k in
                          ("units", "rating_mva", "total_mva", "utilisation_pct", "oversize_pct")}
                         for c in alts],
        "sri_lanka_grid": sri_lanka_grid_basis(mv_kv),
        "harmonic": harmonic,
        "warnings": warnings,
        "calculation_steps": transformer_steps(req, pf, selected, harmonic),
    }


def sri_lanka_grid_basis(mv_kv: int = 33) -> dict:
    """Preliminary Sri Lankan MV connection basis for report/checklist use."""
    return {
        "nominal_voltage_kv": mv_kv,
        "highest_system_voltage_kv": 36 if mv_kv == 33 else 12 if mv_kv == 11 else None,
        "rated_fault_current_ka": 25 if mv_kv == 33 else 20 if mv_kv == 11 else None,
        "frequency_hz": 50,
        "voltage_variation_pct": "±6% at 33/22/11 kV",
        "harmonic_voltage_basis": "CEB Grid Connection Code 2023: IEC 61000-3-6 planning levels; harmonic range N=1…100 for power park modules.",
        "current_harmonic_basis": "CEB/SEA interconnection standard: TDD 5%; even harmonics limited to 25% of the listed odd-harmonic limits.",
        "references": [
            {
                "label": "CEB Grid Connection Code, revised September 2023",
                "url": "https://www.ceb.lk/front_img/img_reports/1723552921Grid_Connection_Code_for_publishing_in_CEB_web.pdf",
            },
            {
                "label": "CEB/SEA grid interconnection standards for hybrid systems",
                "url": "https://www.energy.gov.lk/images/solar-systems/agreeement-and-grid-interconnection-standards-for-hybrid.pdf",
            },
        ],
    }


def harmonic_acceptance(tdd_pct: float | None) -> dict:
    """Harmonic current limit checklist for preliminary inverter acceptance."""
    limits = [
        {"order": "h < 11", "limit_pct": 4.0},
        {"order": "11 ≤ h < 17", "limit_pct": 2.0},
        {"order": "17 ≤ h < 23", "limit_pct": 1.5},
        {"order": "23 ≤ h < 35", "limit_pct": 0.6},
        {"order": "35 ≤ h", "limit_pct": 0.3},
    ]
    tdd_limit = 5.0
    if tdd_pct is None:
        status = "unknown"
        margin = None
    else:
        status = "pass" if tdd_pct <= tdd_limit else "fail"
        margin = round(tdd_limit - tdd_pct, 2)
    return {
        "input_tdd_pct": None if tdd_pct is None else round(tdd_pct, 2),
        "tdd_limit_pct": tdd_limit,
        "tdd_status": status,
        "tdd_margin_pct": margin,
        "individual_current_limits": limits,
        "even_harmonic_rule": "Even harmonics ≤ 25% of the corresponding odd-harmonic limit.",
        "study_required": (
            "Final acceptance needs inverter harmonic spectrum, PCC short-circuit level, "
            "background distortion and CEB/LECO/PUCSL approval."
        ),
    }


def transformer_steps(req_mva: float, pf: float, selected: dict, harmonic: dict) -> list[dict]:
    return [
        {
            "title": "5. Transformer apparent-power sizing",
            "items": [
                f"Required transformer MVA = AC MW ÷ power factor = {req_mva * pf:.2f} ÷ {pf:.2f} = {req_mva:.2f} MVA.",
                f"Selected standard scheme = {selected['units']} × {selected['rating_mva']} MVA = {selected['total_mva']} MVA total.",
                f"Transformer utilisation = {selected['utilisation_pct']}%; oversizing = {selected['oversize_pct']}%.",
            ],
        },
        {
            "title": "6. Sri Lankan grid and harmonic checklist",
            "items": [
                "Use 33 kV, 50 Hz preliminary connection basis unless the utility specifies another PCC voltage.",
                f"Current harmonic TDD check: {harmonic['input_tdd_pct'] if harmonic['input_tdd_pct'] is not None else 'not entered'}% vs {harmonic['tdd_limit_pct']}% limit → {harmonic['tdd_status'].upper()}.",
                "Voltage harmonic acceptance is not calculated here; it requires PCC harmonic study and utility-apportioned limits.",
            ],
        },
    ]


def land_area(n_modules: int, module_area_m2: float, gcr: float,
              ac_mw: float, dc_mw: float, mounting: str, total_mva: float,
              road_factor: float = 0.12, setback_factor: float = 0.08) -> dict:
    """Minimum project land with an itemised area schedule (m2 + ha)."""
    module_total = n_modules * module_area_m2
    array_net = module_total / max(gcr, 0.05)          # collector field incl. inter-row

    roads = array_net * road_factor                    # internal access roads/spacing
    switchyard = (0.08 + 0.025 * total_mva) * M2_PER_HA  # 33 kV yard + transformer bays
    control_room = max(120.0, 25.0 * total_mva)        # building + immediate access (m2)
    core = array_net + roads + switchyard + control_room
    setback = core * setback_factor                    # fence offset / buffer / drainage
    total = core + setback

    def ha(x):
        return round(x / M2_PER_HA, 3)

    schedule = [
        {"item": "PV array field (modules ÷ GCR)", "m2": round(array_net), "ha": ha(array_net)},
        {"item": "Internal roads & spacing", "m2": round(roads), "ha": ha(roads)},
        {"item": "33 kV switchyard + step-up transformers", "m2": round(switchyard), "ha": ha(switchyard)},
        {"item": "Control room (control panels, SCADA, LV/aux)", "m2": round(control_room), "ha": ha(control_room)},
        {"item": "Perimeter setback / buffer", "m2": round(setback), "ha": ha(setback)},
    ]
    return {
        "schedule": schedule,
        "module_area_m2": round(module_total),
        "gcr": gcr,
        "array_net_ha": ha(array_net),
        "total_m2": round(total),
        "total_ha": ha(total),
        "total_acre": round(total / M2_PER_ACRE, 2),
        "land_use_ha_per_mwdc": round(total / M2_PER_HA / dc_mw, 3) if dc_mw else None,
        "land_use_acre_per_mwdc": round(total / M2_PER_ACRE / dc_mw, 2) if dc_mw else None,
        "benchmark": ("1.0–1.4 ha/MWdc fixed-tilt; 1.4–2.0 ha/MWdc trackers (NREL)"),
        "mounting": mounting,
    }
