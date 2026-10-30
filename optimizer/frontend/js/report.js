/* ===== Professional report generator (self-contained HTML + print-to-PDF) ===== */
const REPORT = (() => {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const UNC = 0.06;                       // indicative combined uncertainty for P90

  // capture a dashboard Plotly chart as a light-themed PNG data-URL
  async function shot(id, w, h){
    const gd = document.getElementById(id);
    if(!gd || !gd.data || typeof Plotly === "undefined") return null;
    const hasY2 = !!(gd.layout && gd.layout.yaxis2);
    const light = {paper_bgcolor:"#ffffff", plot_bgcolor:"#ffffff", "font.color":"#26344a",
      "xaxis.gridcolor":"#e6ecf5","xaxis.linecolor":"#c4cedd","xaxis.zerolinecolor":"#c4cedd",
      "yaxis.gridcolor":"#e6ecf5","yaxis.linecolor":"#c4cedd","yaxis.zerolinecolor":"#c4cedd"};
    const dark = {paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)", "font.color":"#a9bbd4",
      "xaxis.gridcolor":"#1d2d46","xaxis.linecolor":"#26395a","xaxis.zerolinecolor":"#26395a",
      "yaxis.gridcolor":"#1d2d46","yaxis.linecolor":"#26395a","yaxis.zerolinecolor":"#26395a"};
    if(hasY2){ light["yaxis2.linecolor"]="#c4cedd"; dark["yaxis2.linecolor"]="#26395a"; }
    try{
      await Plotly.relayout(gd, light);
      try{ await Plotly.restyle(gd, {"colorbar.tickfont.color":"#26344a","colorbar.title.font.color":"#26344a"}); }catch(e){}
      const url = await Plotly.toImage(gd, {format:"png", width:w||860, height:h||330, scale:2});
      try{ await Plotly.restyle(gd, {"colorbar.tickfont.color":"#a9bbd4","colorbar.title.font.color":"#a9bbd4"}); }catch(e){}
      await Plotly.relayout(gd, dark);
      return url;
    }catch(e){ return null; }
  }

  const img = (u, cap) => u ? `<figure><img src="${u}"/>${cap?`<figcaption>${cap}</figcaption>`:""}</figure>` : "";
  const fmt = v => (typeof v==="number") ? v.toLocaleString(undefined,{maximumFractionDigits:0}) : v;
  const az = a => ["N","NE","E","SE","S","SW","W","NW","N"][Math.round(a/45)];
  const esc = v => String(v??"").replace(/[&<>"']/g,c=>(
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]
  ));

  async function generate(d){
    if(!d){ return; }
    const o = d.optimum_detail, k = o.kpis, opt = d.sweep.optimum;
    const meta = d.weather_meta||{}, ws = d.weather_summary||{}, dv = d.derived||{};
    const site = esc((document.getElementById("site_name").value)||`${d.sun_path.lat.toFixed(4)}, ${parseFloat(document.getElementById("lon").value).toFixed(4)}`);
    const resourceSource = esc(meta.source||"—");
    const now = new Date().toLocaleString();
    const e50 = k.energy_mwh;
    // bankable P-levels if a multi-year long-term run exists, else indicative
    const lt = d.longterm;
    let p50=e50, p75=e50*(1-0.675*UNC), p90=e50*(1-1.282*UNC), p99=e50*(1-2.326*UNC);
    let p90Label="Indicative P90", probabilistic=false;
    if(lt){ const L=lt.distribution.levels; p50=L.P50; p75=L.P75; p90=L.P90; p99=L.P99; p90Label="P90 estimate"; probabilistic=true; }
    const tracker = d.sweep.mounting === "sat";
    const manual = d.sweep.mode === "manual";
    const azTxt = tracker ? "single-axis tracker (N–S)"
      : (opt.azimuth_defined ? `${opt.azimuth}° ${az(opt.azimuth)}` : "N/A (horizontal)");
    const tiltTxt = tracker ? "Single-axis" : (opt.tilt + "°");
    const orientLabel = manual ? "Evaluated" : "Optimum";   // manual = user-fixed orientation

    // chart images (curated set)
    const [imHeat,imMon,imPR,imGP,imWf,imCar,imDur,imSun,imLtYear,imLtDeg] = await Promise.all([
      shot("heatmap",860,420), shot("monthly",820,300), shot("monthly_pr",820,300),
      shot("ghi_poa",820,300), shot("waterfall",820,320), shot("carpet",1000,300),
      shot("duration",820,300), shot("sunpath",820,300),
      shot("lt_year_chart",820,300), shot("lt_degr_chart",820,300),
    ]);

    // design figures (inline SVG)
    const g = (typeof geomParams==="function") ? geomParams() : null;
    let arraySvg="", moduleSvg="", compassSvg="", planSvg="";
    if(g && typeof LAYOUT!=="undefined"){
      const trackerMax=parseFloat((document.getElementById("max_angle")||{}).value)||60;
      const gg = Object.assign({}, g, {tilt: tracker ? trackerMax : opt.tilt});
      arraySvg = LAYOUT.arrayView(gg); moduleSvg = LAYOUT.moduleView(gg);
      if(opt.azimuth_defined) compassSvg = LAYOUT.azimuthCompass({azimuth:opt.azimuth, lat:d.sun_path.lat, tilt:opt.tilt});
    }
    if(d.layout && d.layout.available && typeof EL!=="undefined") planSvg = EL.planSVG(d.layout);

    // ---- tables ----
    const monthly = MONTHS.map((m,i)=>`<tr><td>${m}</td><td>${(o.monthly_mwh[i]||0).toFixed(1)}</td>`+
      `<td>${(o.monthly_yield[i]||0).toFixed(0)}</td><td>${(o.monthly_pr[i]||0).toFixed(1)}</td>`+
      `<td>${(o.monthly_ghi[i]||0).toFixed(0)}</td><td>${(o.poa_monthly[i]||0).toFixed(0)}</td></tr>`).join("");
    const monthlyTotal = `<tr class="tot"><td>Year</td><td>${fmt(e50)}</td><td>${fmt(k.specific_yield)}</td>`+
      `<td>${k.performance_ratio}</td><td>${fmt(o.monthly_ghi.reduce((a,b)=>a+b,0))}</td>`+
      `<td>${fmt(o.poa_monthly.reduce((a,b)=>a+b,0))}</td></tr>`;

    const wf = o.waterfall.map(w=>`<tr><td>${w.stage}</td><td>${w.value>0?"":""}${fmt(w.value)}</td></tr>`).join("");

    let elecHtml = "<p>Electrical sizing not available for this configuration.</p>";
    if(d.electrical && d.electrical.available){
      const e=d.electrical, s=e.string, m=e.mppt, pl=e.plant;
      const nmppt = Math.max(...e.inverters.map(i=>i.mppt.length));
      let th=`<tr><th>Inverter</th><th>Strings</th><th>Modules</th><th>DC kW</th><th>DC/AC</th>`;
      for(let j=0;j<nmppt;j++) th+=`<th>MPPT${j+1}</th>`; th+="</tr>";
      const rows=e.inverters.map(iv=>{let r=`<tr><td>INV ${String(iv.id).padStart(2,"0")}</td><td>${iv.strings}</td><td>${iv.modules}</td><td>${iv.dc_kw}</td><td>${iv.dc_ac}</td>`;
        for(let j=0;j<nmppt;j++) r+=`<td>${iv.mppt[j]!==undefined?iv.mppt[j]:"—"}</td>`; return r+"</tr>";}).join("");
      const tempRows=(e.temperature_variation||[]).map(r=>`<tr><td>${esc(r.label)}</td><td>${r.cell_temp_c}</td><td>${r.string_voc}</td><td>${r.string_vmp}</td><td>${r.pmax_factor_pct}</td><td>${r.dc_power_at_target_mw}</td></tr>`).join("");
      const warn=(e.warnings||[]).length?`<p class="warn">${e.warnings.map(esc).join("<br>")}</p>`:"";
      elecHtml =
        `<table class="kv"><tbody>
          <tr><td>Modules per string</td><td><b>${s.modules_per_string}</b> (allowed ${s.n_min}–${s.n_max})</td></tr>
          <tr><td>Design temperatures</td><td>${e.design_temps.t_min} °C min / ${e.design_temps.t_max_cell} °C max cell (${esc(e.design_temps.source||"")})</td></tr>
          <tr><td>String Voc at ${e.design_temps.t_min} °C</td><td>${s.voc_string_cold} V (limit ${s.v_sys_limit} V, margin ${s.voc_margin_v} V)</td></tr>
          <tr><td>String Vmp (STC / hot ${e.design_temps.t_max_cell} °C)</td><td>${s.vmp_string_stc} V / ${s.vmp_string_hot} V — ${s.in_window?"within MPPT window":"OUT of window"}</td></tr>
          <tr><td>Strings per MPPT</td><td>${m.strings_per_mppt} (limited by ${m.limited_by}; ${m.current_per_mppt_a} A of ${m.imax_mppt_a} A)</td></tr>
          <tr><td>MPPT short-circuit current</td><td>${m.isc_per_mppt_a} A of ${m.isc_limit_a} A</td></tr>
          <tr><td>Total strings / inverters</td><td>${pl.total_strings} strings · ${pl.inverter_count} inverters (${pl.inverter_count_source}; minimum ${pl.min_required_inverters}) · ${pl.ac_installed_mw} MW AC</td></tr>
          <tr><td>Modules used / DC</td><td>${fmt(pl.modules_used)} modules · ${pl.dc_used_mw} MW DC${pl.unused_dc_mw>0?` · ${pl.unused_dc_mw} MWdc left out by quantity limit`:""}</td></tr>
        </tbody></table>
        ${warn}
        <h3 class="rh">Temperature-only voltage and performance variation</h3>
        <table class="grid"><thead><tr><th>Case</th><th>Cell temp °C</th><th>String Voc V</th><th>String Vmp V</th><th>Pmax %</th><th>Approx DC MW</th></tr></thead><tbody>${tempRows}</tbody></table>
        <table class="grid"><thead>${th}</thead><tbody>${rows}</tbody></table>`;
    }

    const landTxt = (d.layout && d.layout.available) ? `${d.layout.field_w}×${d.layout.field_h} m (≈ ${d.layout.land_ha} ha), rows facing ${d.layout.azimuth}°` : "—";

    let ltSection = "";
    if(lt){
      const di=lt.distribution, dg=lt.degradation, L=di.levels;
      const degRows = dg.table.filter(r=>r.year===1||r.year%5===0||r.year===dg.years)
        .map(r=>`<tr><td>${r.year}</td><td>${r.perf_pct}</td><td>${fmt(r.energy_mwh)}</td><td>${fmt(r.specific)}</td></tr>`).join("");
      ltSection =
`  <section><h2>10 · Long-term performance &amp; exceedance estimates</h2>
    <p>From <b>${di.n_years} historical years</b> (${di.by_year[0].year}–${di.by_year[di.by_year.length-1].year}) modelled at the optimum
       orientation, combined with an assumed ${di.cov_model_pct}% model uncertainty (total CoV ${di.cov_total_pct}%).</p>
    <table class="kv"><tbody>
      <tr><td>P50 / P75 / P90 / P95 / P99</td><td><b>${fmt(L.P50)}</b> / ${fmt(L.P75)} / ${fmt(L.P90)} / ${fmt(L.P95)} / ${fmt(L.P99)} MWh</td></tr>
      <tr><td>Interannual variability (CoV)</td><td>${di.cov_interannual_pct}% — best ${di.max_year.year}: ${fmt(di.max_year.energy)} MWh · worst ${di.min_year.year}: ${fmt(di.min_year.energy)} MWh</td></tr>
      <tr><td>Degradation assumptions</td><td>${dg.lid_pct}% first-year LID, ${dg.degradation_pct_yr}%/yr linear, ${dg.availability_pct}% availability</td></tr>
      <tr><td>${dg.years}-year lifetime energy</td><td><b>${fmt(dg.lifetime_mwh)} MWh</b> · avg ${fmt(dg.avg_annual_mwh)} MWh/yr · ${dg.retention_pct}% retained at year ${dg.years}</td></tr>
    </tbody></table>
    ${img(imLtYear,"Annual energy across the historical years (P50 / P90 lines).")}
    ${img(imLtDeg,"Projected annual energy over the project life.")}
    <table class="grid"><thead><tr><th>Project year</th><th>Performance %</th><th>Energy MWh</th><th>kWh/kWp</th></tr></thead>
      <tbody>${degRows}<tr class="tot"><td>Σ ${dg.years}-yr</td><td>—</td><td>${fmt(dg.lifetime_mwh)}</td><td>—</td></tr></tbody></table>
  </section>`;
    }

    let infraHtml = "";
    if(d.infra){
      const land=d.infra.land, tx=d.infra.transformer, r=tx.recommended;
      const h=tx.harmonic||{}, grid=tx.sri_lanka_grid||{};
      const ls=land.schedule.map(s=>`<tr><td>${s.item}</td><td>${fmt(s.m2)}</td><td>${s.ha}</td></tr>`).join("");
      const bnd=(typeof window!=="undefined")?window.__boundary:null;
      infraHtml=
`    <h3 class="rh">Minimum land area</h3>
    <table class="grid"><thead><tr><th>Land component</th><th>m²</th><th>ha</th></tr></thead>
      <tbody>${ls}<tr class="tot"><td>Minimum project land</td><td>${fmt(land.total_m2)}</td><td>${land.total_ha}</td></tr></tbody></table>
    <p>≈ <b>${land.total_acre} acres</b> · land-use <b>${land.land_use_ha_per_mwdc} ha/MWdc</b> (${land.land_use_acre_per_mwdc} ac/MWdc).
       Benchmark: ${land.benchmark}. Includes the 33 kV switchyard, step-up transformers and control room.${bnd?` Drawn site boundary: <b>${bnd.area_ha} ha</b> — ${bnd.area_ha>=land.total_ha?"sufficient":"insufficient"}.`:""}</p>
    <h3 class="rh">MV step-up transformers (best value for money)</h3>
    <table class="kv"><tbody>
      <tr><td>Required apparent power (pf ${tx.pf})</td><td>${tx.required_mva} MVA</td></tr>
      <tr><td>${tx.selection_source==="manual transformer count"?"Selected":"Recommended"}</td><td><b>${r.units} × ${r.rating_mva} MVA</b> — ${r.total_mva} MVA total, ${r.utilisation_pct}% utilisation (${r.oversize_pct}% over-sized)</td></tr>
      <tr><td>Configuration</td><td>${tx.lv_v} V / ${tx.mv_kv} kV, ${tx.vector_group}, Z = ${tx.impedance_pct}%, ${tx.cooling}</td></tr>
      <tr><td>Tap changer</td><td>${tx.tap_changer}</td></tr>
      <tr><td>Sri Lankan MV basis</td><td>${grid.nominal_voltage_kv||tx.mv_kv} kV, ${grid.frequency_hz||50} Hz, highest ${grid.highest_system_voltage_kv||"—"} kV, fault level ${grid.rated_fault_current_ka||"—"} kA, voltage ${grid.voltage_variation_pct||"—"}</td></tr>
      <tr><td>Harmonic current TDD screen</td><td>${h.input_tdd_pct==null?"not entered":h.input_tdd_pct+"%"} vs ${h.tdd_limit_pct||5}% limit — ${(h.tdd_status||"unknown").toUpperCase()}</td></tr>
    </tbody></table>`;
    }

    const calcSteps=[...((d.electrical&&d.electrical.calculation_steps)||[]),...((d.infra&&d.infra.transformer&&d.infra.transformer.calculation_steps)||[])];
    const calcHtml=calcSteps.length?`
  <section><h2>9 · Verification calculation steps</h2>
    ${calcSteps.map(sec=>`<h3 class="rh">${esc(sec.title)}</h3><ol>${(sec.items||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`).join("")}
  </section>`:"";

    const css = reportCss();
    const html =
`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Solar Yield Report — ${site}</title><style>${css}</style></head>
<body><div class="rpt">
  <header class="cover">
    <div class="brand"><div class="logo">☀</div><div><div class="bt">Solar Yield &amp; Preliminary Design Report</div>
      <div class="bs">pvlib energy model · Hay-Davies / bifacial / PVWatts</div></div></div>
    <h1>${site}</h1>
    <div class="cover-meta">Lat ${d.sun_path.lat.toFixed(4)}°, Lon ${parseFloat(document.getElementById("lon").value).toFixed(4)}° ·
      Resource: ${resourceSource} · Generated ${now}</div>
    <div class="headline">
      ${kp(tracker?"Mounting":orientLabel+" tilt", tiltTxt)}
      ${kp(tracker?"Tracker gain":orientLabel+" azimuth", tracker?("+"+opt.tracker_gain_pct+"% vs fixed"):azTxt)}
      ${kp("Specific yield", fmt(k.specific_yield)+" kWh/kWp")}
      ${kp("Annual energy (P50)", fmt(p50)+" MWh")}
      ${kp("Performance ratio", k.performance_ratio+" %")}
      ${kp(p90Label, fmt(p90)+" MWh")}
    </div>
  </header>

  <section><h2>1 · Executive summary</h2>
    <p>For a <b>${dv.ilr?(dv.ilr+" DC/AC"):""}</b> plant of <b>${document.getElementById("dc_mw").value} MW<sub>dc</sub></b> /
      <b>${document.getElementById("ac_mw").value} MW<sub>ac</sub></b> at ${site}, ${manual
        ? `the analysis was carried out at the <b>user-specified orientation</b> of`
        : `the orientation that maximises annual generation uses`} <b>${tracker?"a single-axis tracker":(opt.tilt+"° tilt")}</b>${(!tracker&&opt.azimuth_defined)?` facing <b>${azTxt}</b>`:(tracker?` (<b>+${opt.tracker_gain_pct}%</b> vs fixed)`:"")}, giving an estimated
      <b>${fmt(e50)} MWh/yr</b> (${fmt(k.specific_yield)} kWh/kWp, PR ${k.performance_ratio}%, capacity factor ${k.capacity_factor}%).
      ${d.selected_detail?`This is <b>+${(100*(k.specific_yield-d.selected_detail.kpis.specific_yield)/d.selected_detail.kpis.specific_yield).toFixed(1)}%</b> versus the current design of ${d.selected_detail.tilt}° / ${d.selected_detail.azimuth}°.`:""}</p>
    <table class="kv"><tbody>
      <tr><td>Annual energy — P50 / P75 / P90 / P99</td><td><b>${fmt(p50)}</b> / ${fmt(p75)} / ${fmt(p90)} / ${fmt(p99)} MWh <span class="muted">${probabilistic?`(${lt.distribution.n_years}-year PVGIS interannual variability + ${lt.distribution.cov_model_pct}% model uncertainty; probabilistic estimate)`:`(indicative, ${(UNC*100).toFixed(0)}% assumed uncertainty — run multi-year for a site-specific estimate)`}</span></td></tr>
      <tr><td>POA irradiation</td><td>${fmt(k.poa_insolation)} kWh/m² (GHI ${fmt(k.ghi_insolation)} kWh/m²)</td></tr>
      <tr><td>Mean operating cell temperature</td><td>${k.mean_cell_temp} °C</td></tr>
      <tr><td>Inverter clipping loss</td><td>${k.clipping_loss_pct} %</td></tr>
      <tr><td>Approx. modules</td><td>${fmt(dv.n_panels)}</td></tr>
    </tbody></table>
  </section>

  <section><h2>2 · Site &amp; solar resource</h2>
    <table class="kv"><tbody>
      <tr><td>Location</td><td>${site} — ${d.sun_path.lat.toFixed(4)}°, ${parseFloat(document.getElementById("lon").value).toFixed(4)}°</td></tr>
      <tr><td>Weather dataset</td><td>${resourceSource}</td></tr>
      <tr><td>Annual GHI / DNI</td><td>${ws.ghi_annual||"—"} / ${ws.dni_annual||"—"} kWh/m²</td></tr>
      <tr><td>Air temperature (mean / max)</td><td>${ws.temp_mean||"—"} / ${ws.temp_max||"—"} °C</td></tr>
      <tr><td>Mean wind speed</td><td>${ws.wind_mean||"—"} m/s</td></tr>
    </tbody></table>
    ${img(imSun,"Sun-path at the site (solar elevation vs azimuth).")}
  </section>

  <section><h2>3 · Methodology &amp; assumptions</h2>
    ${(d.calculation_steps||[]).length?`<h3 class="sub-h">Step-by-step, with this run's numbers</h3>`+
      d.calculation_steps.map(sec=>`<h3 class="sub-h">${sec.title}</h3><ul>${sec.items.map(x=>`<li>${x}</li>`).join("")}</ul>`).join("")
      :""}
    <h3 class="sub-h">Model chain</h3>
    <p>Energy is modelled hour-by-hour with the open-source <b>pvlib</b> chain: NREL solar position →
      Hay-Davies infinite-sheds plane-of-array irradiance (inter-row shading + rear-side bifacial gain) →
      ASHRAE incidence-angle reflection → ${tempModelName()} cell temperature →
      PVWatts DC with the datasheet power-temperature coefficient → DC loss stack →
      PVWatts inverter conversion with AC-nameplate clipping.</p>
    <table class="kv"><tbody>
      <tr><td>Transposition / shading</td><td>${(d.model_info&&d.model_info.transposition)||"Hay-Davies infinite-sheds"}</td></tr>
      <tr><td>DC model</td><td>${o.dc_model==="detailed"?"Detailed (single-diode low-light correction + datasheet γ)":"PVWatts (linear)"}</td></tr>
      <tr><td>Mounting</td><td>${tracker?`Single-axis tracker (N–S, ${document.getElementById("max_angle").value}° max, ${document.getElementById("backtrack").checked?"backtracking":"no backtrack"})`:"Fixed tilt"}</td></tr>
      <tr><td>Horizon / far-shading</td><td>${horizonText(d)}</td></tr>
      <tr><td>DC system derate (loss stack)</td><td>${dv.dc_loss_pct} %</td></tr>
      <tr><td>Bifacial</td><td>${dv.bifacial?("modelled, gain "+k.bifacial_gain_pct+" %"):"off"}</td></tr>
      <tr><td>Row pitch / GCR</td><td>${dv.pitch_m} m / ${document.getElementById("gcr").value}</td></tr>
      <tr><td>P90 method</td><td>${probabilistic?`${lt.distribution.n_years} PVGIS years; interannual and entered model uncertainty combined in quadrature under a normal approximation`:`P50 × (1 − 1.282 × ${(UNC*100).toFixed(0)}%); indicative only`}</td></tr>
    </tbody></table>
    <p class="muted">${(d.model_info&&d.model_info.electrical_scope)||""}</p>
  </section>

  <section><h2>4 · Generation results</h2>
    <table class="grid"><thead><tr><th>Month</th><th>Energy MWh</th><th>kWh/kWp</th><th>PR %</th><th>GHI kWh/m²</th><th>POA kWh/m²</th></tr></thead>
      <tbody>${monthly}${monthlyTotal}</tbody></table>
    ${img(imMon,`Monthly generation at the ${manual?"evaluated":"optimum"} orientation.`)}
    ${img(imPR,"Monthly performance ratio and specific yield.")}
    ${img(imGP,"Monthly horizontal (GHI) vs in-plane (POA) irradiation — transposition gain.")}
    ${img(imCar,"Hourly AC power across the year (clipping band visible at midday).")}
  </section>

  <section><h2>5 · Orientation analysis</h2>
    ${img(imHeat,"Annual specific yield over the tilt × azimuth grid; ★ marks the optimum.")}
    <div class="two">${compassSvg?`<div class="svgbox">${compassSvg}</div>`:""}
      <table class="kv"><tbody>
        <tr><td>${tracker?"Mounting":orientLabel+" tilt"}</td><td><b>${tiltTxt}</b></td></tr>
        <tr><td>${tracker?"Tracker gain":orientLabel+" azimuth"}</td><td><b>${tracker?("+"+opt.tracker_gain_pct+"% vs fixed"):azTxt}</b></td></tr>
        ${manual?`<tr><td>Analysis mode</td><td>Fixed orientation specified by the user (no optimisation sweep)</td></tr>`:""}
        ${d.selected_detail?`<tr><td>Current design</td><td>${d.selected_detail.tilt}° / ${d.selected_detail.azimuth}° → ${fmt(d.selected_detail.kpis.specific_yield)} kWh/kWp</td></tr>`:""}
      </tbody></table></div>
    ${scenariosTable(d)}
  </section>

  <section><h2>6 · Loss analysis</h2>
    ${img(imWf,"Energy loss waterfall from reference yield to net AC.")}
    <table class="grid"><thead><tr><th>Stage</th><th>MWh</th></tr></thead><tbody>${wf}</tbody></table>
    ${img(imDur,"AC power duration curve versus the inverter AC limit.")}
  </section>

  <section><h2>7 · Array &amp; electrical design</h2>
    ${tracker?`<p>The tracker drawing shows the entered maximum rotation angle for illustration. Actual module tilt
       and facing azimuth vary continuously; the fixed site bearing is the N–S tracker axis.</p>`:""}
    <div class="two">${arraySvg?`<div class="svgbox">${arraySvg}</div>`:""}${moduleSvg?`<div class="svgbox sm">${moduleSvg}</div>`:""}</div>
    ${elecHtml}
  </section>

  <section><h2>8 · Site, layout &amp; balance of plant</h2>
    <p>Schematic block &amp; string distribution. Array footprint: <b>${landTxt}</b>. This is an idealised equal-block
       layout for feasibility/area estimation — not a surveyed, terrain-fitted or setback-compliant layout.</p>
    ${d.layout&&d.layout.site?`<p>Minimum fenced site envelope: <b>${d.layout.site.w} x ${d.layout.site.h} m = ${d.layout.site.area_ha} ha</b>.
       Includes PV tables, internal access road, 33 kV switchyard, transformer bay, control room and perimeter setback.</p>`:""}
    ${planSvg?`<div class="svgbox wide">${planSvg}</div>`:""}
${infraHtml}
  </section>
${calcHtml}
${ltSection}
  <footer>
    <p><b>Disclaimer.</b> Preliminary engineering estimates from a transparent pvlib model and datasheet limits.
    Not a bankable study. Cable/protection, LV/MV, structural, geotechnical, grid-code and surveyed-layout design
    are out of scope. Validate against PVsyst/SAM with site-specific inputs and measured/horizon data.</p>
    <p class="muted">Generated by Solar Yield Optimizer · ${now}</p>
  </footer>

  <div class="noprint actions">
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
    <button onclick="downloadReportHtml()">⬇ Download HTML</button>
  </div>
</div>
<script>
function downloadReportHtml(){
  const blob=new Blob([document.documentElement.outerHTML],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download="solar-yield-report.html"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
</script></body></html>`;

    const w = window.open("", "_blank");
    if(!w){ const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"})), a=document.createElement("a"); a.href=url; a.download="solar-yield-report.html"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  function kp(l,v){ return `<div class="kp"><div class="kl">${l}</div><div class="kv2">${v}</div></div>`; }

  function scenariosTable(d){
    // saved orientation scenarios from the explorer (global from app.js)
    const sc = (typeof SCENARIOS !== "undefined") ? SCENARIOS : [];
    if(!sc.length || !d.optimum_detail) return "";
    const k = d.optimum_detail.kpis, o = d.sweep.optimum;
    const rows = sc.map((s,i)=>{
      const dp = k.energy_mwh>0 ? ((s.energy_mwh-k.energy_mwh)/k.energy_mwh*100) : 0;
      return `<tr><td>S${i+1}</td><td>${s.tilt}°</td><td>${s.azimuth}° ${az(s.azimuth)}</td>`+
        `<td>${fmt(s.energy_mwh)}</td><td>${fmt(s.specific_yield)}</td><td>${s.performance_ratio}</td>`+
        `<td>${dp>=0?"+":""}${dp.toFixed(1)}%</td></tr>`;
    }).join("");
    return `<h3 class="sub-h">Orientation scenarios studied (vs ${d.sweep.mode==="manual"?"evaluated case":"optimum"})</h3>
      <table class="grid"><thead><tr><th>Case</th><th>Tilt</th><th>Azimuth</th><th>MWh/yr</th><th>kWh/kWp</th><th>PR %</th><th>Δ energy</th></tr></thead>
      <tbody><tr class="tot"><td>★ ${d.sweep.mode==="manual"?"Evaluated":"Optimum"}</td><td>${o.tilt!=null?o.tilt+"°":"tracker"}</td><td>${o.azimuth_defined?o.azimuth+"° "+az(o.azimuth):"—"}</td>
        <td>${fmt(k.energy_mwh)}</td><td>${fmt(k.specific_yield)}</td><td>${k.performance_ratio}</td><td>—</td></tr>${rows}</tbody></table>`;
  }
  function tempModelName(){
    const v=(document.getElementById("temp_model")||{}).value;
    return ({faiman:"Faiman (IEC 61853)",pvsyst:"PVsyst",sapm_open:"SAPM open-rack",sapm_close:"SAPM close-mount"})[v]||"Faiman";
  }
  function horizonText(d){
    const mi=d.model_info||{};
    if(mi.horizon_applied) return "applied (PVGIS horizon)";
    if(mi.horizon_requested) return "requested but unavailable; no horizon mask applied";
    return "not applied";
  }

  function reportCss(){ return `
*{box-sizing:border-box}
body{margin:0;background:#f1f4f9;color:#1d2b45;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.5}
.rpt{max-width:900px;margin:0 auto;background:#fff;box-shadow:0 2px 18px rgba(20,40,80,.12)}
.cover{background:linear-gradient(135deg,#10233f,#1d3a63);color:#fff;padding:34px 40px 28px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.logo{width:40px;height:40px;border-radius:10px;background:linear-gradient(145deg,#ffb12b,#ff8f1f);display:grid;place-items:center;font-size:22px;color:#3a2403}
.bt{font-weight:700;font-size:15px}.bs{font-size:11px;color:#a9c2e6}
.cover h1{margin:6px 0;font-size:26px}
.cover-meta{font-size:12px;color:#bcd0ec}
.headline{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.kp{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:11px 13px}
.kl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#a9c2e6}
.kv2{font-size:18px;font-weight:700;margin-top:3px}
section{padding:22px 40px;border-bottom:1px solid #eef2f8}
h2{font-size:15px;color:#1d3a63;border-left:4px solid #ffb12b;padding-left:10px;margin:0 0 12px}
.sub-h{font-size:13px;color:#1d3a63;margin:16px 0 6px}
h3.rh{font-size:12.5px;color:#1d3a63;margin:16px 0 4px;font-weight:700}
table{width:100%;border-collapse:collapse;margin:10px 0;font-variant-numeric:tabular-nums}
table.kv td{padding:6px 10px;border-bottom:1px solid #eef2f8}
table.kv td:first-child{color:#5a6b86;width:46%}
table.grid th{background:#10233f;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:7px 9px;text-align:left}
table.grid td{padding:6px 9px;border-bottom:1px solid #eef2f8}
table.grid tr.tot td{font-weight:700;background:#fff7e9;border-top:2px solid #ffb12b}
b{color:#10233f}.muted{color:#8493a8;font-size:11px}
.warn{border:1px solid #f5c169;background:#fff8e9;color:#8a5a05;border-radius:8px;padding:8px 10px;font-size:11px}
ol{margin:8px 0 0 20px;padding:0}
li{margin:4px 0}
figure{margin:14px 0;text-align:center}
figure img{max-width:100%;border:1px solid #e3e9f2;border-radius:8px}
figcaption{font-size:11px;color:#8493a8;margin-top:5px}
.two{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.svgbox{flex:1;min-width:280px;border:1px solid #e3e9f2;border-radius:8px;overflow:hidden}
.svgbox.sm{flex:0 0 230px}.svgbox.wide{flex:1 1 100%}
.svgbox svg{display:block;width:100%}
footer{padding:20px 40px;color:#5a6b86;font-size:11px}
.actions{padding:18px 40px}
.actions button{background:#1d3a63;color:#fff;border:none;border-radius:9px;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer}
@media print{
  body{background:#fff}.rpt{box-shadow:none;max-width:none}
  .noprint{display:none}
  section{break-inside:avoid;border-bottom:none}
  figure,table,.svgbox{break-inside:avoid}
  .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h2{break-after:avoid}
}`; }

  return {generate};
})();
