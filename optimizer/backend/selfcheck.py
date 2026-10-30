"""Self-verification suite for the Solar Yield Optimizer calculation engine.

Run with:  python -m backend.selfcheck            (offline checks, clear-sky)
           python -m backend.selfcheck --online   (adds PVGIS-dependent checks)

Every check states what physical or mathematical property it proves. The suite
is deterministic and must pass after any code change.
"""
from __future__ import annotations

import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

from . import eastwest as ew            # noqa: E402
from . import engine                    # noqa: E402
from . import longterm as lt            # noqa: E402
from . import weather as wx             # noqa: E402

LAT, LON = 6.37, 80.98
PLANT = dict(dc_mw=3.7, ac_mw=3.0, eta_inv_nom=0.988, albedo=0.20, gcr=0.40,
             height_m=1.5, pitch_m=5.955, collector_w=2.382, bifaciality=0.85,
             gamma_pdc=-0.0026, dc_derate=0.886, temp_model="faiman",
             dc_model="pvwatts", mounting="fixed", inverter_id="sg350hx_20")

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = ""):
    RESULTS.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))


def run(online: bool = False):
    src = "pvgis_tmy" if online else "clearsky"
    df, meta = wx.get_weather(src, LAT, LON)
    C = engine.build_context(df, LAT, LON, 0.0, dict(PLANT), None,
                             meta.get("interval_label", "start"))
    dt = C.dt_h

    # 1. Energy accounting: detail() waterfall must close exactly.
    d = engine.detail(10.0, 180.0, C, 5.5)
    wf = d["waterfall"]
    closure = wf[0]["value"] + sum(w["value"] for w in wf[1:-1])
    check("loss waterfall closes (start + deltas == net AC)",
          abs(closure - wf[-1]["value"]) < 1.0,
          f"{closure:.1f} vs {wf[-1]['value']:.1f} MWh")

    # 2. Monthly sums equal the annual total.
    check("monthly energies sum to the annual total",
          abs(sum(d["monthly_mwh"]) - d["kpis"]["energy_mwh"]) < 1.0,
          f"{sum(d['monthly_mwh']):.1f} vs {d['kpis']['energy_mwh']:.1f} MWh")

    # 3. PR definition: SY == PR x POA insolation.
    k = d["kpis"]
    check("PR definition consistent (SY = PR x POA)",
          abs(k["specific_yield"] - k["performance_ratio"] / 100 * k["poa_insolation"]) < 15,
          f"{k['specific_yield']} vs {k['performance_ratio']/100*k['poa_insolation']:.0f}")

    # 4. Capacity factor definition.
    hours = len(C.index) * dt
    cf = k["energy_mwh"] * 1000 / (PLANT["ac_mw"] * 1000 * hours) * 100
    check("capacity factor definition", abs(cf - k["capacity_factor"]) < 0.2,
          f"{cf:.1f} vs {k['capacity_factor']}%")

    # 5. Sweep refinement can only improve the optimum.
    cfg = dict(tilt_min=1, tilt_max=20, tilt_step=5, az_min=120, az_max=240, az_step=30)
    sw = engine.sweep(C, cfg)
    grid_best = sw["optimum"]["energy_mwh"]
    sw = engine.refine_optimum(C, sw, cfg)
    check("1-deg refinement never worsens the optimum",
          sw["optimum"]["energy_mwh"] >= grid_best - 0.01,
          f"{grid_best} -> {sw['optimum']['energy_mwh']} MWh")

    # 6. Dual-plane identity: two identical planes == the single plane.
    a = ew._plane_dict("A", 10, 180, 50.0)
    b = ew._plane_dict("B", 10, 180, 50.0)
    dd = ew.evaluate_dual_plane(C, a, b, "shared", 5.5)
    check("dual-plane with identical planes equals single-plane",
          abs(dd["kpis"]["energy_mwh"] - d["kpis"]["energy_mwh"]) < 1.0,
          f"{dd['kpis']['energy_mwh']} vs {d['kpis']['energy_mwh']} MWh")

    # 7. Separate blocks equal shared pool for identical planes.
    ds = ew.evaluate_dual_plane(C, a, b, "separate", 5.5)
    check("separate == shared for identical planes",
          abs(ds["kpis"]["energy_mwh"] - dd["kpis"]["energy_mwh"]) < 1.0)

    # 8. DC capacity conservation in the dual-plane split.
    pa, pb = dd["plane_results"]
    check("dual-plane DC capacity conserved",
          abs(pa["dc_capacity_mwp"] + pb["dc_capacity_mwp"] - PLANT["dc_mw"]) < 1e-3,
          f"{pa['dc_capacity_mwp']}+{pb['dc_capacity_mwp']} MWp")

    # 9. True E-W: a shared pool never clips more than separate blocks.
    ae = ew._plane_dict("E", 10, 90, 50.0)
    bw = ew._plane_dict("W", 10, 270, 50.0)
    shared = ew.evaluate_dual_plane(C, ae, bw, "shared", 5.5)
    sep = ew.evaluate_dual_plane(C, ae, bw, "separate", 5.5)
    check("E-W shared pool clips <= separate blocks",
          shared["kpis"]["clipping_loss_pct"] <= sep["kpis"]["clipping_loss_pct"] + 0.01,
          f"{shared['kpis']['clipping_loss_pct']}% vs {sep['kpis']['clipping_loss_pct']}%")

    # 10. Overload sweep: AC energy is monotonically non-decreasing in DC.
    sref = {"tilt": 10.0, "azimuth": 180.0, "source": "check"}
    ov = ew.overload_sweep(C, ae, bw, "shared", sref, [1.0, 1.2, 1.4, 1.6], 2.0, None, 5.5)
    mono = all(ov["rows"][i]["dual_mwh"] >= ov["rows"][i-1]["dual_mwh"] - 0.1
               and ov["rows"][i]["single_mwh"] >= ov["rows"][i-1]["single_mwh"] - 0.1
               for i in range(1, len(ov["rows"])))
    clips = all(ov["rows"][i]["dual_clip_pct"] >= ov["rows"][i-1]["dual_clip_pct"] - 1e-6
                for i in range(1, len(ov["rows"])))
    check("overload sweep: energy monotonic and clipping monotonic", mono and clips)

    # 11. Overload day-response conserves the AC limit.
    drr = ov["day_response"]
    check("day-response curves never exceed the AC nameplate",
          max(drr["dual_kw"]) <= drr["ac_limit_kw"] + 0.5
          and max(drr["single_kw"]) <= drr["ac_limit_kw"] + 0.5,
          f"peaks {max(drr['dual_kw'])}/{max(drr['single_kw'])} vs {drr['ac_limit_kw']} kW")

    # 12. Tracker energy exceeds fixed tilt at the same site.
    Ct = engine.build_context(df, LAT, LON, 0.0,
                              dict(PLANT, mounting="sat", axis_azimuth=0.0,
                                   max_angle=60.0, backtrack=True),
                              None, meta.get("interval_label", "start"))
    e_trk = engine.detail(0, 180, Ct, 5.5)["kpis"]["energy_mwh"]
    check("single-axis tracker beats fixed tilt",
          e_trk > d["kpis"]["energy_mwh"],
          f"{e_trk} vs {d['kpis']['energy_mwh']} MWh")

    # 13. Bifacial gain is positive and physically bounded.
    C0 = engine.build_context(df, LAT, LON, 0.0, dict(PLANT, bifaciality=0.0), None,
                              meta.get("interval_label", "start"))
    e_mono = engine.annual_energy(10, 180, C0)
    e_bi = engine.annual_energy(10, 180, C)
    gain = (e_bi / e_mono - 1) * 100
    check("bifacial gain positive and < 20%", 0.0 < gain < 20.0, f"{gain:.1f}%")

    # 14. Solar position interval convention: midpoint beats label on clear-sky fit.
    if online:
        loc_idx = df.index
        import pvlib
        loc = pvlib.location.Location(LAT, LON)
        cs0 = loc.get_clearsky(loc_idx, model="ineichen")
        cs30 = loc.get_clearsky(loc_idx + pd.Timedelta(minutes=30), model="ineichen")
        cs30.index = loc_idx
        m = df["ghi"] > 20
        r0 = np.corrcoef(df["ghi"][m], cs0["ghi"][m])[0, 1]
        r30 = np.corrcoef(df["ghi"][m], cs30["ghi"][m])[0, 1]
        check("PVGIS labels are interval-start (midpoint fits better)", r30 > r0,
              f"corr {r30:.4f} > {r0:.4f}")

    # 15. Long-term maths: P-level ordering and degradation retention.
    by_year = pd.Series([6800.0, 6650.0, 6700.0, 6500.0, 6900.0],
                        index=[2016, 2017, 2018, 2019, 2020])
    dist = lt.distribution(by_year, 0.04)
    L = dist["levels"]
    check("P-levels strictly ordered P50>P75>P90>P95>P99",
          L["P50"] > L["P75"] > L["P90"] > L["P95"] > L["P99"])
    deg = lt.degradation(6800.0, 3700.0, 25, 1.0, 0.35, 99.0)
    expect = 0.99 * (1 - 0.0035) ** 24 * 100
    check("25-yr degradation retention matches closed form",
          abs(deg["retention_pct"] - round(expect / 0.99, 1) * 0.99) < 1.5
          or abs(deg["retention_pct"] - expect / (0.99) * 0.99) < 1.5,
          f"{deg['retention_pct']}% vs {(1-0.0035)**24*100:.1f}% (pre-availability)")

    # 16. Atlas cell consistency with the designer engine (same assumptions).
    if online:
        from . import atlas
        rec = atlas.compute_cell(LAT, LON)
        Ca = engine.build_context(df, LAT, LON, 0.0, dict(atlas.ATLAS_PLANT), None,
                                  meta.get("interval_label", "start"))
        e_direct = engine.annual_energy(rec["single"]["tilt"], rec["single"]["azimuth"], Ca)
        check("atlas cell yield equals a direct engine run at the same angles",
              abs(e_direct / 1000.0 - rec["single"]["sy"]) < 3.0,
              f"{e_direct/1000:.0f} vs {rec['single']['sy']} kWh/kWp")
        check("atlas monthly sums equal annual (single & dual)",
              abs(sum(rec["single"]["monthly"]) - rec["single"]["sy"]) < 3.0
              and abs(sum(rec["dual"]["monthly"]) - rec["dual"]["sy"]) < 3.0)

    n_fail = sum(1 for _, ok, _ in RESULTS if not ok)
    print(f"\n{'='*60}\n{len(RESULTS)} checks · {len(RESULTS)-n_fail} passed · {n_fail} failed"
          + ("  — ALL CALCULATIONS VERIFIED" if n_fail == 0 else "  — FIX REQUIRED"))
    return n_fail


if __name__ == "__main__":
    sys.exit(1 if run(online="--online" in sys.argv) else 0)
