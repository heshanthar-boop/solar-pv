"""
Built-in equipment catalog, populated from the supplied datasheets.

Panel : Astronergy ASTRO N7 Pro  CHSM66RN(DG)/F-BQ  (bifacial n-type TOPCon)
Inverter: Sungrow SG350HX-20 (1500 V multi-MPPT string inverter)

All values are taken directly from the manufacturer datasheets.  Each panel
preset carries every STC power bin so the user can pick the exact bin supplied.
"""

# Per-bin STC electrical parameters for the ASTRO N7 Pro (datasheet page 2)
_ASTRO_BINS = {
    645: dict(vmp=41.02, imp=15.73, voc=48.83, isc=16.50, eff=23.9),
    650: dict(vmp=41.14, imp=15.80, voc=48.98, isc=16.58, eff=24.1),
    655: dict(vmp=41.27, imp=15.87, voc=49.13, isc=16.65, eff=24.2),
    660: dict(vmp=41.40, imp=15.94, voc=49.28, isc=16.72, eff=24.4),
    665: dict(vmp=41.52, imp=16.02, voc=49.43, isc=16.80, eff=24.6),
    670: dict(vmp=41.65, imp=16.09, voc=49.58, isc=16.87, eff=24.8),
}

PANELS = {
    "astro_n7_pro": {
        "id": "astro_n7_pro",
        "brand": "Astronergy",
        "model": "ASTRO N7 Pro CHSM66RN(DG)/F-BQ",
        "technology": "n-type TOPCon, bifacial (glass/glass)",
        "bins": _ASTRO_BINS,
        "default_bin": 660,
        # geometry & ratings (datasheet)
        "length_m": 2.382,
        "width_m": 1.134,
        "area_m2": round(2.382 * 1.134, 4),     # 2.7012 m2
        "cells": 264,
        "weight_kg": 32,
        "bifaciality": 0.85,                     # 85 +/- 5 %
        # temperature coefficients (fraction per degC)
        "gamma_pmp": -0.0026,                    # -0.26 %/degC
        "beta_voc": -0.0023,                     # -0.23 %/degC
        "alpha_isc": 0.00042,                    # +0.042 %/degC
        "max_system_voltage": 1500,
        "series_fuse_a": 35,
        "noct": 45.0,                            # NMOT not stated; typical default
    },
    "generic_mono": {
        "id": "generic_mono",
        "brand": "Generic",
        "model": "Monofacial 600 W (custom)",
        "technology": "monofacial",
        "bins": {600: dict(vmp=34.5, imp=17.4, voc=41.5, isc=18.5, eff=22.0)},
        "default_bin": 600,
        "length_m": 2.384, "width_m": 1.303, "area_m2": round(2.384 * 1.303, 4),
        "cells": 156, "weight_kg": 32, "bifaciality": 0.0,
        "gamma_pmp": -0.0029, "beta_voc": -0.0025, "alpha_isc": 0.00045,
        "max_system_voltage": 1500, "series_fuse_a": 30, "noct": 45.0,
    },
}

INVERTERS = {
    "sg350hx_20": {
        "id": "sg350hx_20",
        "brand": "Sungrow",
        "model": "SG350HX-20",
        "type": "1500 V multi-MPPT string inverter",
        # AC ratings (datasheet) -- temperature-dependent kVA
        "ac_kva_30c": 352, "ac_kva_40c": 320, "ac_kva_50c": 295,
        "ac_nominal_kw": 320,                    # rated condition
        "max_ac_current_a": 254,
        "ac_voltage_v": 800,
        # DC side
        "max_dc_voltage": 1500, "min_mppt_v": 500, "max_mppt_v": 1500,
        "nominal_dc_v": 1080, "startup_v": 550,
        "n_mppt": 6, "strings_per_mppt": 5, "max_strings": 30,
        "max_current_per_mppt_a": 75, "max_dc_current_a": 450,
        "isc_per_mppt_a": 125,
        # efficiency
        "eta_max": 0.9902, "eta_euro": 0.988,
        "night_consumption_w": 6,
    },
    "generic_central": {
        "id": "generic_central",
        "brand": "Generic",
        "model": "Central 3.5 MVA (custom)",
        "type": "central inverter",
        "ac_kva_30c": 3500, "ac_kva_40c": 3300, "ac_kva_50c": 3000,
        "ac_nominal_kw": 3500, "max_ac_current_a": 0, "ac_voltage_v": 600,
        "max_dc_voltage": 1500, "min_mppt_v": 875, "max_mppt_v": 1300,
        "nominal_dc_v": 1080, "startup_v": 880,
        "n_mppt": 1, "strings_per_mppt": 0, "max_strings": 0,
        "max_current_per_mppt_a": 0, "max_dc_current_a": 0, "isc_per_mppt_a": 0,
        "eta_max": 0.99, "eta_euro": 0.985, "night_consumption_w": 100,
    },
}


def catalog() -> dict:
    """Lightweight catalog payload for the frontend dropdowns."""
    return {
        "panels": [
            {"id": p["id"], "brand": p["brand"], "model": p["model"],
             "technology": p["technology"], "bins": sorted(p["bins"].keys()),
             "default_bin": p["default_bin"], "bifaciality": p["bifaciality"],
             "gamma_pmp": p["gamma_pmp"], "area_m2": p["area_m2"],
             "length_m": p["length_m"], "width_m": p["width_m"],
             "cells": p["cells"]}
            for p in PANELS.values()
        ],
        "inverters": [
            {"id": i["id"], "brand": i["brand"], "model": i["model"], "type": i["type"],
             "ac_nominal_kw": i["ac_nominal_kw"], "eta_euro": i["eta_euro"],
             "ac_kva_40c": i["ac_kva_40c"], "max_dc_voltage": i["max_dc_voltage"],
             "n_mppt": i["n_mppt"], "max_strings": i["max_strings"]}
            for i in INVERTERS.values()
        ],
    }
