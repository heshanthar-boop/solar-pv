/* ===== East-West dual-plane optimizer UI ===== */
const EW = (() => {
  const E = id => document.getElementById(id);
  const MONTHS = (typeof CH !== "undefined" && CH.MONTHS) ? CH.MONTHS : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const FONT = {family:"Segoe UI,Roboto,sans-serif", color:"#aabfda", size:11};
  const PLOT = {
    paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
    font:FONT, margin:{l:50,r:18,t:12,b:40},
    xaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
    yaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
  };
  const CFG = {displayModeBar:false, responsive:true};
  const MIN_OPT_TILT = 1;
  let RESULT = null;
  let OV_RESULT = null;
  let ACTIVE = "single";

  function init(){
    if(!E("eastwest_tab")) return;
    E("tab_single").onclick = () => showTab("single");
    E("tab_eastwest").onclick = () => showTab("eastwest");
    E("ew_run").onclick = () => runEastWest();
    E("ew_manual").onclick = () => runEastWest("manual");
    E("ew_opt_around").onclick = () => runEastWest("optimize", true);
    E("ew_export_json").onclick = exportJSON;
    E("ew_export_html").onclick = exportHTML;
    E("ew_ov_run").onclick = runOverload;
    E("ew_day_select").onchange = () => renderRepresentativeDay(RESULT);

    ["ew_mode","ew_arrangement","ew_inverter_arrangement","ew_optimize_split",
     "ew_a_tilt","ew_a_az","ew_b_tilt","ew_b_az",
     "ew_tilt_min","ew_tilt_max","ew_tilt_step","ew_az_min","ew_az_max","ew_az_step",
     "ew_split_min","ew_split_max","ew_split_step"].forEach(id => {
      const el = E(id); if(el) el.addEventListener("input", () => { validate(); renderDiagram(); });
      if(el && el.tagName === "SELECT") el.addEventListener("change", () => { validate(); renderDiagram(); });
    });
    E("ew_a_share").addEventListener("input", () => {
      const v = num("ew_a_share", 50);
      if(isFinite(v)) E("ew_b_share").value = clamp(100 - v, 1, 99).toFixed(0);
      validate(); renderDiagram();
    });
    E("ew_b_share").addEventListener("input", () => {
      const v = num("ew_b_share", 50);
      if(isFinite(v)) E("ew_a_share").value = clamp(100 - v, 1, 99).toFixed(0);
      validate(); renderDiagram();
    });
    validate();
    renderDiagram();
  }

  function showTab(name){
    ACTIVE = name;
    if(typeof ATLAS !== "undefined") ATLAS.hideFromOthers();
    if(typeof clearSectionNav === "function") clearSectionNav();
    const ew = name === "eastwest";
    E("tab_single").classList.toggle("active", !ew);
    E("tab_eastwest").classList.toggle("active", ew);
    document.body.classList.toggle("ew-active", ew);
    E("eastwest_tab").style.display = ew ? "flex" : "none";
    if(ew){
      E("empty").style.display = "none";
      E("results").style.display = "none";
      setTimeout(resizePlots, 80);
    }else{
      E("empty").style.display = (typeof LAST !== "undefined" && LAST) ? "none" : "grid";
      E("results").style.display = (typeof LAST !== "undefined" && LAST) ? "block" : "none";
      setTimeout(resizePlots, 80);
      if(typeof LAST !== "undefined" && LAST && typeof buildSectionNav === "function")
        setTimeout(buildSectionNav, 120);
    }
  }

  function resizePlots(){
    if(typeof Plotly === "undefined") return;
    ["ew_monthly","ew_compare","ew_day_profile","ew_heatmap"].forEach(id => {
      const el = E(id);
      if(el && el.data) try{ Plotly.Plots.resize(el); }catch(e){}
    });
  }

  function num(id, fallback=null){
    const el = E(id);
    if(!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  }
  function intNum(id, fallback=null){
    const v = parseInt(E(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function az(v){ return ((Number(v) % 360) + 360) % 360; }
  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function f(v, d=0){
    if(typeof v !== "number" || !isFinite(v)) return "—";
    return v.toLocaleString(undefined, {maximumFractionDigits:d, minimumFractionDigits:d});
  }

  function ratio(v){ return typeof v === "number" && isFinite(v) ? String(v) : "—"; }

  function currentPlanes(){
    return {
      a: {label:"Plane A", tilt:num("ew_a_tilt",10), azimuth:az(num("ew_a_az",90)), dc_share:num("ew_a_share",50)},
      b: {label:"Plane B", tilt:num("ew_b_tilt",10), azimuth:az(num("ew_b_az",270)), dc_share:num("ew_b_share",50)},
    };
  }

  function validate(){
    const p = currentPlanes();
    const msgs = [];
    const bad = [];
    if(!isFinite(p.a.tilt) || !isFinite(p.b.tilt)) bad.push("Enter valid plane tilts.");
    if(p.a.tilt < 0 || p.a.tilt > 90 || p.b.tilt < 0 || p.b.tilt > 90) bad.push("Plane tilts must be between 0 and 90 deg.");
    const sum = (p.a.dc_share || 0) + (p.b.dc_share || 0);
    if(Math.abs(sum - 100) > 0.01) bad.push(`DC shares total ${f(sum,1)}%, not 100%.`);
    if(p.a.tilt <= 0.05 || p.b.tilt <= 0.05) msgs.push("Zero tilt is horizontal; azimuth is only kept for bookkeeping in manual mode.");
    if(E("ew_mode").value === "optimize"){
      const symMin = num("ew_tilt_min", MIN_OPT_TILT);
      const aMin = num("ew_a_tilt_min", MIN_OPT_TILT);
      const bMin = num("ew_b_tilt_min", MIN_OPT_TILT);
      if(symMin < MIN_OPT_TILT || aMin < MIN_OPT_TILT || bMin < MIN_OPT_TILT){
        msgs.push(`Automatic optimization will enforce a ${MIN_OPT_TILT}° minimum physical tilt.`);
      }
    }
    if(E("ew_optimize_split").checked){
      const mn=num("ew_split_min",30), mx=num("ew_split_max",70), st=num("ew_split_step",5);
      if(mx < mn || st <= 0) bad.push("Split search range is invalid.");
      else msgs.push(`Split optimizer will test Plane A share from ${mn}% to ${mx}% in ${st}% steps.`);
    }
    const el = E("ew_validation");
    if(bad.length){
      el.className = "ew-validation warn";
      el.innerHTML = bad.map(esc).join("<br>");
      return false;
    }
    el.className = "ew-validation ok";
    el.innerHTML = [
      `Manual split check: ${f(p.a.dc_share,1)}% + ${f(p.b.dc_share,1)}% = ${f(sum,1)}%.`,
      E("ew_inverter_arrangement").value === "shared"
        ? "Shared topology: both planes feed one inverter pool and clip once at total AC."
        : "Separate topology: each plane clips at its proportional AC block.",
      ...msgs,
    ].map(esc).join("<br>");
    return true;
  }

  function searchPayload(around=false){
    if(around){
      const p = currentPlanes();
      return {
        common_tilt_min: Math.max(num("ew_tilt_min",MIN_OPT_TILT), MIN_OPT_TILT), common_tilt_max: num("ew_tilt_max",45), common_tilt_step: num("ew_tilt_step",2),
        east_az_min: num("ew_az_min",45), east_az_max: num("ew_az_max",135), east_az_step: num("ew_az_step",5),
        split_min_pct: clamp(p.a.dc_share - 10, 1, 99),
        split_max_pct: clamp(p.a.dc_share + 10, 1, 99),
        split_step_pct: 5,
        a_tilt_min: Math.max(clamp(p.a.tilt - 6, 0, 90), MIN_OPT_TILT), a_tilt_max: clamp(p.a.tilt + 6, MIN_OPT_TILT, 90), a_tilt_step: 2,
        a_az_min: clamp(p.a.azimuth - 20, 0, 360), a_az_max: clamp(p.a.azimuth + 20, 0, 360), a_az_step: 5,
        b_tilt_min: Math.max(clamp(p.b.tilt - 6, 0, 90), MIN_OPT_TILT), b_tilt_max: clamp(p.b.tilt + 6, MIN_OPT_TILT, 90), b_tilt_step: 2,
        b_az_min: clamp(p.b.azimuth - 20, 0, 360), b_az_max: clamp(p.b.azimuth + 20, 0, 360), b_az_step: 5,
        top_plane_count: 12,
        exact_rerank_count: 35,
      };
    }
    return {
      common_tilt_min: Math.max(num("ew_tilt_min",MIN_OPT_TILT), MIN_OPT_TILT), common_tilt_max: num("ew_tilt_max",45), common_tilt_step: num("ew_tilt_step",2),
      east_az_min: num("ew_az_min",45), east_az_max: num("ew_az_max",135), east_az_step: num("ew_az_step",5),
      split_min_pct: num("ew_split_min",30), split_max_pct: num("ew_split_max",70), split_step_pct: num("ew_split_step",5),
      a_tilt_min: Math.max(num("ew_a_tilt_min",MIN_OPT_TILT), MIN_OPT_TILT), a_tilt_max: num("ew_a_tilt_max",45), a_tilt_step: num("ew_a_tilt_step",5),
      a_az_min: num("ew_a_az_min",45), a_az_max: num("ew_a_az_max",180), a_az_step: num("ew_a_az_step",10),
      b_tilt_min: Math.max(num("ew_b_tilt_min",MIN_OPT_TILT), MIN_OPT_TILT), b_tilt_max: num("ew_b_tilt_max",45), b_tilt_step: num("ew_b_tilt_step",5),
      b_az_min: num("ew_b_az_min",180), b_az_max: num("ew_b_az_max",315), b_az_step: num("ew_b_az_step",10),
      top_plane_count: intNum("ew_top_plane_count",10),
      exact_rerank_count: intNum("ew_exact_rerank",25),
    };
  }

  function buildPayload(modeOverride=null, around=false){
    const base = analyzePayload();
    base.plant.mounting = "fixed";
    base.plant.axis_azimuth = 0;
    const p = currentPlanes();
    const mode = modeOverride || E("ew_mode").value;
    return {
      location: base.location,
      weather: base.weather,
      panel: base.panel,
      plant: base.plant,
      mode,
      arrangement: around ? "independent" : E("ew_arrangement").value,
      inverter_arrangement: E("ew_inverter_arrangement").value,
      optimize_split: around ? true : E("ew_optimize_split").checked,
      plane_a: p.a,
      plane_b: p.b,
      search: searchPayload(around),
      single_plane_sweep: base.sweep,
    };
  }

  async function runEastWest(modeOverride=null, around=false){
    showTab("eastwest");
    if(!validate()){ toast("Fix the East-West inputs first."); return; }
    const payload = buildPayload(modeOverride, around);
    if(payload.mode === "manual" && Math.abs(payload.plane_a.dc_share + payload.plane_b.dc_share - 100) > 0.01){
      toast("Manual plane DC shares must total 100%."); return;
    }
    setBusy(true);
    E("ew_status").textContent = "Starting...";
    E("progress").style.display = "flex";
    if(typeof setProgress === "function") setProgress(0, "starting...");
    try{
      const r = await fetch("/api/eastwest/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });
      if(!r.ok){
        const j = await r.json();
        const detail = Array.isArray(j.detail) ? j.detail.map(x=>x.msg).join("; ") : j.detail;
        throw new Error(detail || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "", got = false;
      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        buf += dec.decode(value, {stream:true});
        let nl;
        while((nl = buf.indexOf("\n")) >= 0){
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if(!line.trim()) continue;
          const msg = JSON.parse(line);
          if(msg.type === "status") E("ew_status").textContent = msg.message;
          else if(msg.type === "progress" && typeof setProgress === "function"){
            setProgress(Math.round(100 * msg.done / msg.total), `${msg.done}/${msg.total}`);
          }else if(msg.type === "error") throw new Error(msg.message);
          else if(msg.type === "result"){
            RESULT = msg.data;
            OV_RESULT = null;      // planes changed — clear stale overload result
            E("ew_ov_body").innerHTML = `<p class="hint">Planes updated — click “Optimize overload” to sweep the DC/AC ratio for this arrangement.</p>`;
            E("ew_ov_sub").textContent = "fixed AC nameplate · swept installed DC";
            renderResult(RESULT);
            got = true;
          }
        }
      }
      if(!got) throw new Error("The East-West stream ended without a result.");
      E("ew_status").textContent = "East-West analysis complete.";
    }catch(err){
      E("ew_status").textContent = "Failed - " + err.message;
      toast("East-West analysis failed: " + err.message);
    }finally{
      setBusy(false);
      setTimeout(() => E("progress").style.display = "none", 600);
    }
  }

  function setBusy(busy){
    ["ew_run","ew_manual","ew_opt_around"].forEach(id => E(id).disabled = busy);
    E("ew_run").textContent = busy ? "Running..." : "Run East-West analysis";
  }

  function renderResult(d){
    E("ew_results_wrap").style.display = "block";
    renderDiagram(d);
    const k = d.kpis, pa = d.plane_results[0], pb = d.plane_results[1];
    E("ew_kpis").innerHTML = [
      card("Annual energy", f(k.energy_mwh,1), "MWh", true),
      card("Specific yield", f(k.specific_yield,0), "kWh/kWp"),
      card("Plane A", `${f(pa.tilt,2)} deg / ${azText(pa)}`, `${f(pa.dc_share_pct,1)}% DC`, true),
      card("Plane B", `${f(pb.tilt,2)} deg / ${azText(pb)}`, `${f(pb.dc_share_pct,1)}% DC`, true),
      card("Clipping", f(k.clipping_loss_pct,2), "%"),
      card("Capacity factor", f(k.capacity_factor,1), "%"),
    ].join("");
    renderSummary(d);
    renderMonthly(d);
    renderComparison(d);
    renderHeatmap(d);
    renderDaySelect(d);
    renderRepresentativeDay(d);
    renderRanked(d);
    renderSteps(d);
    renderWarnings(d);
    setTimeout(resizePlots, 80);
  }

  function card(l, v, u, accent){
    return `<div class="kpi ${accent?"accent":""}"><div class="k-l">${esc(l)}</div><div class="k-v">${esc(v)}<span class="k-u"> ${esc(u||"")}</span></div></div>`;
  }

  function renderSummary(d){
    const rows = [];
    const p = d.plant_summary || {};
    rows.push(["Mode", `${d.mode} / ${d.arrangement} / ${d.inverter_arrangement}`]);
    rows.push(["Plant capacity", `${f(p.dc_mw,3)} MWp DC / ${f(p.ac_mw,3)} MWac, ILR ${f(p.dc_ac_ratio,3)}`]);
    rows.push(["Result", `${f(d.kpis.energy_mwh,1)} MWh, ${f(d.kpis.specific_yield,0)} kWh/kWp, PR ${f(d.kpis.performance_ratio,1)}%`]);
    rows.push(["Single-plane comparison", `${d.comparison.statement} (${d.comparison.delta_energy_pct >= 0 ? "+" : ""}${f(d.comparison.delta_energy_pct,2)}%)`]);
    const planeRows = d.plane_results.map(x => `<tr><td>${esc(x.label)}</td><td>${f(x.tilt,1)}</td><td>${esc(azText(x))}</td><td>${f(x.dc_share_pct,1)}%</td><td>${f(x.dc_capacity_mwp,3)}</td><td>${f(x.poa_kwh_m2,0)}</td><td>${f(x.ac_energy_mwh,1)}</td><td>${f(x.specific_yield,0)}</td></tr>`).join("");
    E("ew_summary_table").innerHTML =
      `<table class="restable kv"><tbody>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="v">${esc(r[1])}</td></tr>`).join("")}</tbody></table>`+
      `<div class="sub3">Plane breakdown</div><table class="restable"><thead><tr><th>Plane</th><th>Tilt</th><th>Az</th><th>Share</th><th>MWp</th><th>POA kWh/m2</th><th>AC MWh</th><th>kWh/kWp</th></tr></thead><tbody>${planeRows}</tbody></table>`;
  }

  function renderMonthly(d){
    const m = d.monthly;
    const data = [
      {type:"bar", x:MONTHS, y:m.east_mwh, name:"Plane A AC", marker:{color:"#5aabff"}, hovertemplate:"%{x}: %{y:.1f} MWh<extra></extra>"},
      {type:"bar", x:MONTHS, y:m.west_mwh, name:"Plane B AC", marker:{color:"#ffb838"}, hovertemplate:"%{x}: %{y:.1f} MWh<extra></extra>"},
      {type:"scatter", mode:"lines+markers", x:MONTHS, y:m.clipping_mwh, name:"Clipping", line:{color:"#fb7185", width:2}, yaxis:"y2", hovertemplate:"%{x}: %{y:.1f} MWh clipped<extra></extra>"},
    ];
    const lay = clone(PLOT);
    lay.barmode = "stack";
    lay.yaxis.title = {text:"MWh", font:FONT};
    lay.yaxis2 = {overlaying:"y", side:"right", title:{text:"clipping MWh", font:FONT}, gridcolor:"rgba(0,0,0,0)", tickfont:FONT};
    lay.legend = {orientation:"h", y:1.18, font:FONT};
    Plotly.newPlot(E("ew_monthly"), data, lay, CFG);
  }

  function renderComparison(d){
    const c = d.comparison;
    const data = [
      {type:"bar", x:["Single-plane best","East-West"], y:[c.single_plane_best.energy_mwh, c.east_west.energy_mwh],
       marker:{color:["#3ee0c0","#ffb838"]}, hovertemplate:"%{x}<br>%{y:.1f} MWh<extra></extra>"},
    ];
    const lay = clone(PLOT);
    lay.yaxis.title = {text:"MWh/year", font:FONT};
    lay.margin.t = 16;
    Plotly.newPlot(E("ew_compare"), data, lay, CFG);
    E("ew_compare_text").textContent =
      `${c.statement} Morning delta ${c.delta_morning_pct >= 0 ? "+" : ""}${f(c.delta_morning_pct,2)}%, evening delta ${c.delta_evening_pct >= 0 ? "+" : ""}${f(c.delta_evening_pct,2)}%.`;
  }

  function renderHeatmap(d){
    const h = d.search && d.search.heatmap;
    const el = E("ew_heatmap");
    if(!h || !d.search.east_azimuths){
      if(typeof Plotly !== "undefined" && Plotly.purge) try{ Plotly.purge(el); }catch(e){}
      el.innerHTML = `<p class="hint" style="padding:16px">Independent/manual runs do not produce a 2D symmetric heatmap. Use the ranked candidates table for the search result.</p>`;
      return;
    }
    const data = [
      {type:"heatmap", x:d.search.east_azimuths, y:d.search.tilts, z:h.specific_yield,
       colorscale:[[0,"#0b2545"],[0.45,"#1d6fb8"],[0.72,"#3ee0c0"],[0.9,"#ffd166"],[1,"#ff9416"]],
       colorbar:{title:{text:"kWh/kWp", font:FONT}, thickness:12, outlinewidth:0, tickfont:FONT},
       hovertemplate:"Tilt %{y} deg<br>East az %{x} deg<br>%{z:.0f} kWh/kWp<extra></extra>"},
      {type:"scatter", mode:"markers+text", x:[d.optimum.a.azimuth], y:[d.optimum.a.tilt],
       marker:{symbol:"star", size:16, color:"#fff", line:{color:"#ff9416", width:2}},
       text:[" optimum"], textposition:"middle right", textfont:{color:"#fff", size:11}, hoverinfo:"skip"},
    ];
    const lay = clone(PLOT);
    lay.xaxis.title = {text:"Plane A / East azimuth (deg)", font:FONT};
    lay.yaxis.title = {text:"Common tilt (deg)", font:FONT};
    Plotly.newPlot(el, data, lay, CFG);
  }

  function renderDaySelect(d){
    E("ew_day_select").innerHTML = d.representative_days.map((x,i)=>`<option value="${i}">${esc(x.label)}</option>`).join("");
  }

  function renderRepresentativeDay(d){
    if(!d) return;
    const day = d.representative_days[parseInt(E("ew_day_select").value || "0", 10)] || d.representative_days[0];
    const data = [
      {type:"scatter", mode:"lines", x:day.hours, y:day.east_kw, name:"Plane A", line:{color:"#5aabff", width:3}, hovertemplate:"%{x}:00 %{y:.0f} kW<extra></extra>"},
      {type:"scatter", mode:"lines", x:day.hours, y:day.west_kw, name:"Plane B", line:{color:"#ffb838", width:3}, hovertemplate:"%{x}:00 %{y:.0f} kW<extra></extra>"},
      {type:"scatter", mode:"lines", x:day.hours, y:day.combined_kw, name:"Combined", line:{color:"#3ee0c0", width:3}, hovertemplate:"%{x}:00 %{y:.0f} kW<extra></extra>"},
      {type:"scatter", mode:"lines", x:day.hours, y:day.clipping_kw, name:"Clipping", line:{color:"#fb7185", width:2, dash:"dash"}, hovertemplate:"%{x}:00 %{y:.0f} kW clipped<extra></extra>"},
    ];
    const lay = clone(PLOT);
    lay.xaxis.title = {text:"Local hour", font:FONT};
    lay.yaxis.title = {text:"kW", font:FONT};
    lay.legend = {orientation:"h", y:1.18, font:FONT};
    Plotly.newPlot(E("ew_day_profile"), data, lay, CFG);
  }

  function renderRanked(d){
    const rows = (d.ranked_candidates || []).map(r =>
      `<tr${r.rank===1?' class="rowopt"':''}><td>${r.rank}</td><td>${f(r.tilt_a,2)}</td><td>${f(r.azimuth_a,2)}</td><td>${f(r.tilt_b,2)}</td><td>${f(r.azimuth_b,2)}</td><td>${f(r.share_a,1)} / ${f(r.share_b,1)}</td><td><b>${f(r.energy_mwh,1)}</b></td><td>${f(r.specific_yield,0)}</td><td>${f(r.clipping_loss_pct,2)}%</td></tr>`
    ).join("");
    E("ew_ranked_table").innerHTML =
      `<table class="restable"><thead><tr><th>#</th><th>A tilt</th><th>A az</th><th>B tilt</th><th>B az</th><th>DC split %</th><th>MWh</th><th>kWh/kWp</th><th>Clip</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderSteps(d){
    E("ew_calc_steps").innerHTML = `<div class="calc-steps">` + (d.calculation_steps || []).map(sec =>
      `<div class="calc-step"><h4>${esc(sec.title)}</h4><ol>${(sec.items || []).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`
    ).join("") + `</div>`;
  }

  function renderWarnings(d){
    E("ew_warnings").innerHTML = `<ul class="ew-warn-list">${(d.warnings || []).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
    E("ew_methodology").innerHTML = `<div class="sub3">Methodology</div><ol class="ew-method-list">${(d.methodology || []).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`;
  }

  function renderDiagram(d=null){
    const source = d ? {
      a: {tilt:d.optimum.a.tilt, azimuth:d.optimum.a.azimuth, dc_share:d.optimum.a.dc_share_pct},
      b: {tilt:d.optimum.b.tilt, azimuth:d.optimum.b.azimuth, dc_share:d.optimum.b.dc_share_pct},
    } : currentPlanes();
    const W = 330, H = 210, cx = 165, cy = 108, r = 70;
    const pt = bearing => {
      const a = az(bearing) * Math.PI / 180;
      return {x:cx + Math.sin(a) * r, y:cy - Math.cos(a) * r};
    };
    const arrow = (bearing, color, label, tilt, share) => {
      const p = pt(bearing), a = az(bearing) * Math.PI / 180;
      const lx = Math.sin(a + Math.PI / 2), ly = -Math.cos(a + Math.PI / 2);
      return `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
        <polygon points="${p.x},${p.y} ${p.x-10*Math.sin(a)+5*lx},${p.y+10*Math.cos(a)+5*ly} ${p.x-10*Math.sin(a)-5*lx},${p.y+10*Math.cos(a)-5*ly}" fill="${color}"/>
        <text x="${p.x}" y="${p.y + (p.y < cy ? -12 : 20)}" text-anchor="middle" fill="#eaf1fb" font-size="11" font-weight="700">${esc(label)}</text>
        <text x="${p.x}" y="${p.y + (p.y < cy ? 1 : 34)}" text-anchor="middle" fill="#aabfda" font-size="10">${f(tilt,1)} deg / ${f(bearing,0)} deg / ${f(share,0)}%</text>`;
    };
    E("ew_diagram").innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="#0d1a2c"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2b3f5e" stroke-width="1.5"/>
        <line x1="${cx}" y1="${cy-r-16}" x2="${cx}" y2="${cy+r+16}" stroke="#22344f"/>
        <line x1="${cx-r-16}" y1="${cy}" x2="${cx+r+16}" y2="${cy}" stroke="#22344f"/>
        <text x="${cx}" y="20" text-anchor="middle" fill="#ffce5a" font-size="12" font-weight="700">N</text>
        <text x="${cx+r+22}" y="${cy+4}" text-anchor="middle" fill="#ffce5a" font-size="12" font-weight="700">E</text>
        <text x="${cx}" y="${cy+r+30}" text-anchor="middle" fill="#ffce5a" font-size="12" font-weight="700">S</text>
        <text x="${cx-r-22}" y="${cy+4}" text-anchor="middle" fill="#ffce5a" font-size="12" font-weight="700">W</text>
        <rect x="${cx-30}" y="${cy-18}" width="60" height="36" rx="6" fill="#14223a" stroke="#2b3f5e"/>
        <text x="${cx}" y="${cy-2}" text-anchor="middle" fill="#eaf1fb" font-size="10" font-weight="700">Plant</text>
        <text x="${cx}" y="${cy+12}" text-anchor="middle" fill="#aabfda" font-size="9">total MWp fixed</text>
        ${arrow(source.a.azimuth, "#5aabff", "Plane A", source.a.tilt, source.a.dc_share)}
        ${arrow(source.b.azimuth, "#ffb838", "Plane B", source.b.tilt, source.b.dc_share)}
      </svg>`;
  }

  function exportJSON(){
    if(!RESULT){ toast("Run an East-West analysis first."); return; }
    const payload = OV_RESULT ? {analysis: RESULT, overload: OV_RESULT} : RESULT;
    download("eastwest_result.json", JSON.stringify(payload, null, 2), "application/json");
  }

  // ---------- inverter overload (DC/AC ratio) optimizer ----------
  function overloadPlanes(){
    if(RESULT && RESULT.plane_results && RESULT.plane_results.length === 2){
      const [pa, pb] = RESULT.plane_results;
      return {
        a: {label: pa.label, tilt: pa.tilt, azimuth: pa.azimuth, dc_share: pa.dc_share_pct},
        b: {label: pb.label, tilt: pb.tilt, azimuth: pb.azimuth, dc_share: pb.dc_share_pct},
        source: "last East-West result",
      };
    }
    const p = currentPlanes();
    return {a: p.a, b: p.b, source: "manual plane inputs"};
  }

  async function runOverload(){
    const base = analyzePayload();
    const planes = overloadPlanes();
    const sref = (RESULT && RESULT.comparison && RESULT.comparison.single_plane_best) || null;
    const body = {
      location: base.location, weather: base.weather, panel: base.panel,
      plant: Object.assign({}, base.plant, {mounting: "fixed"}),
      inverter_arrangement: E("ew_inverter_arrangement").value,
      plane_a: planes.a, plane_b: planes.b,
      single_ref_tilt: sref ? sref.tilt : null,
      single_ref_azimuth: sref ? sref.azimuth : null,
      ilr_min: num("ew_ov_min", 1.0), ilr_max: num("ew_ov_max", 1.6),
      ilr_step: num("ew_ov_step", 0.05), clip_threshold_pct: num("ew_ov_clip", 2.0),
    };
    const btn = E("ew_ov_run");
    btn.disabled = true; btn.textContent = "⏳ Sweeping DC/AC…";
    E("ew_ov_sub").textContent = `planes from ${planes.source} · computing…`;
    try{
      const r = await fetch("/api/eastwest/overload", {method:"POST",
        headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
      const j = await r.json();
      if(!r.ok) throw new Error(Array.isArray(j.detail) ? j.detail.map(x=>x.msg).join("; ") : (j.detail || "failed"));
      OV_RESULT = j;
      renderOverload(j, planes.source);
    }catch(err){
      E("ew_ov_sub").textContent = "overload sweep failed";
      toast("Overload sweep failed: " + err.message);
    }finally{
      btn.disabled = false; btn.textContent = "▶ Optimize overload";
    }
  }

  function renderOverload(d, planeSource){
    const rows = d.rows, rd = d.recommended_dual, rs = d.recommended_single, g = d.dual_vs_single_at_threshold;
    const hardwareKnown = d.hardware_max_ilr != null;
    const qualifier = hardwareKnown ? "recommended overload" : "clipping-limited candidate (hardware not verified)";
    const bestLabel = d.preferred_method === "dual" ? "Dual-plane" : d.preferred_method === "single" ? "Single plane" : "Tied";
    E("ew_ov_sub").textContent =
      `fixed ${f(d.fixed_ac_mw,2)} MWac · planes from ${planeSource} · single ref ${f(d.single_ref.tilt,2)}°/${f(d.single_ref.azimuth,2)}° (${d.single_ref.source})`;
    const cards = [
      rd ? card(hardwareKnown ? "Recommended overload" : "Clipping-limited candidate", "ILR "+ratio(rd.ilr), `${f(rd.dc_mwp,2)} MWp on ${f(d.fixed_ac_mw,2)} MWac`, true) :
           card(hardwareKnown ? "Recommended overload" : "Clipping-limited candidate", "—", hardwareKnown ? "no ILR meets the clipping and hardware limits" : "no ILR meets the clipping limit; hardware not verified", true),
      rd ? card(hardwareKnown ? "Yield at recommendation" : "Yield at candidate", f(rd.dual_mwh,0)+" MWh/yr", `clipping ${f(rd.dual_clip_pct,4)}%`) : "",
      g ? card("Dual-plane advantage", (g.energy_advantage_pct>=0?"+":"")+f(g.energy_advantage_pct,2)+"%",
               `${(g.energy_advantage_mwh>=0?"+":"")+f(g.energy_advantage_mwh,0)} MWh vs single @ same clip limit`, true) : "",
      (rd && rs && d.preferred_method) ? card("Higher annual energy", bestLabel,
               `${f(rd.dual_mwh,1)} vs ${f(rs.single_mwh,1)} MWh at the selected ${hardwareKnown ? "recommendations" : "candidates"}`, true) : "",
      d.hardware_max_ilr != null ? card("Hardware ILR cap", ratio(d.hardware_max_ilr),
               "string capacity of selected inverter") : "",
      card("Max in range", f(d.max_in_range.dual_mwh,0)+" MWh", `ILR ${ratio(d.max_in_range.ilr)} · clip ${f(d.max_in_range.dual_clip_pct,2)}%`),
    ].filter(Boolean).join("");
    let h = `<div class="kpi-strip" style="margin:4px 0 14px">${cards}</div>`;
    h += `<div id="ew_ov_chart" class="plot sm"></div>`;
    h += `<div class="sub3" style="margin-top:14px">Average-day response at each method's ${qualifier}</div>`;
    h += d.day_response ? `<div id="ew_ov_day" class="plot sm"></div>` : `<p class="hint">The comparison is unavailable because at least one method has no eligible overload in the swept range.</p>`;
    h += `<div class="restable-wrap" style="margin-top:12px"><table class="restable"><thead><tr>
      <th>ILR</th><th>DC MWp</th><th>Dual MWh</th><th>Dual clip %</th><th>Dual marg. kWh/kWp</th>
      <th>Single MWh</th><th>Single clip %</th><th></th></tr></thead><tbody>`;
    rows.forEach(r=>{
      const isRd = rd && r.ilr === rd.ilr, isRs = rs && r.ilr === rs.ilr;
      const overHw = d.hardware_max_ilr != null && r.ilr > d.hardware_max_ilr + 1e-9;
      h += `<tr${isRd?' class="rowopt"':''}><td>${ratio(r.ilr)}${overHw?" ⚠":""}</td><td>${f(r.dc_mwp,2)}</td>`+
           `<td><b>${f(r.dual_mwh,0)}</b></td><td>${f(r.dual_clip_pct,4)}</td><td>${r.dual_marginal_kwh_per_kwp!=null?f(r.dual_marginal_kwh_per_kwp,0):"—"}</td>`+
           `<td>${f(r.single_mwh,0)}</td><td>${f(r.single_clip_pct,4)}</td>`+
           `<td>${isRd?(hardwareKnown?"★ dual rec.":"★ dual candidate"):""}${isRs?(isRd?" · ":"")+(hardwareKnown?"single rec.":"single candidate"):""}${overHw?" over hardware cap":""}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    if(d.hardware_note) h += `<p class="hint">⚠ ${esc(d.hardware_note)}</p>`;
    h += `<p class="hint">Annual AC energy never decreases when DC is added, so “maximum yield” alone would always pick the largest DC. The ★ ${hardwareKnown ? "recommendation" : "candidate"} is the largest swept overload within ${ratio(d.clip_threshold_pct)}% clipping${hardwareKnown ? " and the known inverter string-capacity limit" : "; inverter string-capacity is unknown and must be verified separately"}.</p>`;
    E("ew_ov_body").innerHTML = h;

    // chart: energy vs ILR (y) + clipping % (y2), threshold & hardware-cap guides
    const x = rows.map(r=>r.ilr);
    const data = [
      {type:"scatter", mode:"lines+markers", x, y:rows.map(r=>r.dual_mwh), name:"Dual-plane MWh",
       line:{color:"#ffb838", width:3}, hovertemplate:"ILR %{x}: <b>%{y:.0f} MWh</b><extra>dual</extra>"},
      {type:"scatter", mode:"lines+markers", x, y:rows.map(r=>r.single_mwh), name:"Single-plane MWh",
       line:{color:"#3ee0c0", width:2}, hovertemplate:"ILR %{x}: %{y:.0f} MWh<extra>single</extra>"},
      {type:"scatter", mode:"lines", x, y:rows.map(r=>r.dual_clip_pct), name:"Dual clip %",
       yaxis:"y2", line:{color:"#ffb838", width:1.5, dash:"dot"}, hovertemplate:"ILR %{x}: %{y:.4f}%<extra>dual clip</extra>"},
      {type:"scatter", mode:"lines", x, y:rows.map(r=>r.single_clip_pct), name:"Single clip %",
       yaxis:"y2", line:{color:"#3ee0c0", width:1.5, dash:"dot"}, hovertemplate:"ILR %{x}: %{y:.4f}%<extra>single clip</extra>"},
    ];
    if(rd) data.push({type:"scatter", mode:"markers", x:[rd.ilr], y:[rd.dual_mwh], name:hardwareKnown ? "Recommended" : "Clipping-limited candidate",
      marker:{symbol:"star", size:16, color:"#fff", line:{color:"#ff9416", width:2}},
      hovertemplate:`${hardwareKnown ? "Recommended" : "Candidate, hardware unverified"}: ILR ${ratio(rd.ilr)} → ${f(rd.dual_mwh,0)} MWh<extra></extra>`});
    const lay = clone(PLOT);
    lay.xaxis.title = {text:"DC / AC ratio (inverter overload)", font:FONT};
    lay.yaxis.title = {text:"MWh/year", font:FONT};
    lay.yaxis2 = {overlaying:"y", side:"right", title:{text:"clipping %", font:FONT},
                  gridcolor:"rgba(0,0,0,0)", rangemode:"tozero", tickfont:FONT};
    lay.legend = {orientation:"h", y:1.2, font:FONT};
    lay.shapes = [];
    lay.shapes.push({type:"line", xref:"paper", x0:0, x1:1, yref:"y2",
      y0:d.clip_threshold_pct, y1:d.clip_threshold_pct, line:{color:"#fb7185", width:1, dash:"dash"}});
    if(d.hardware_max_ilr != null)
      lay.shapes.push({type:"line", x0:d.hardware_max_ilr, x1:d.hardware_max_ilr, yref:"paper",
        y0:0, y1:1, line:{color:"#7089a8", width:1, dash:"dash"}});
    Plotly.newPlot(E("ew_ov_chart"), data, lay, CFG);
    renderOverloadDay(d);
  }

  function renderOverloadDay(d){
    const dr = d.day_response;
    if(!dr) return;
    const hours = [...Array(24).keys()];
    const data = [
      {type:"scatter", mode:"lines", x:hours, y:dr.dual_kw, name:`Dual-plane @ ILR ${ratio(dr.dual_ilr)}`,
       line:{color:"#ffb838", width:3}, hovertemplate:"%{x}:00 — <b>%{y:.0f} kW</b><extra>dual</extra>"},
      {type:"scatter", mode:"lines", x:hours, y:dr.single_kw, name:`Single-plane @ ILR ${ratio(dr.single_ilr)}`,
       line:{color:"#3ee0c0", width:3}, hovertemplate:"%{x}:00 — %{y:.0f} kW<extra>single</extra>"},
      {type:"scatter", mode:"lines", x:hours, y:dr.dual_east_kw, name:"Dual: east plane",
       line:{color:"#5aabff", width:1.2, dash:"dot"}, hovertemplate:"%{x}:00 — %{y:.0f} kW<extra>east</extra>"},
      {type:"scatter", mode:"lines", x:hours, y:dr.dual_west_kw, name:"Dual: west plane",
       line:{color:"#a78bfa", width:1.2, dash:"dot"}, hovertemplate:"%{x}:00 — %{y:.0f} kW<extra>west</extra>"},
    ];
    const lay = clone(PLOT);
    lay.xaxis.title = {text:"Hour of day (local)", font:FONT};
    lay.yaxis.title = {text:"Average AC power (kW)", font:FONT};
    lay.legend = {orientation:"h", y:1.22, font:FONT};
    lay.shapes = [{type:"line", xref:"paper", x0:0, x1:1, y0:dr.ac_limit_kw, y1:dr.ac_limit_kw,
      line:{color:"#fb7185", width:1.5, dash:"dash"}}];
    lay.annotations = [{xref:"paper", x:0.01, y:dr.ac_limit_kw, yanchor:"bottom",
      text:"AC nameplate", showarrow:false, font:{size:10, color:"#fb7185"}}];
    Plotly.newPlot(E("ew_ov_day"), data, lay, CFG);
  }

  async function shot(id, w, h){
    const gd = E(id);
    if(!gd || !gd.data || typeof Plotly === "undefined") return null;
    const light = {paper_bgcolor:"#ffffff", plot_bgcolor:"#ffffff", "font.color":"#26344a",
      "xaxis.gridcolor":"#e6ecf5","xaxis.linecolor":"#c4cedd","yaxis.gridcolor":"#e6ecf5","yaxis.linecolor":"#c4cedd"};
    const dark = {paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)", "font.color":"#aabfda",
      "xaxis.gridcolor":"#1b2b45","xaxis.linecolor":"#2a3f60","yaxis.gridcolor":"#1b2b45","yaxis.linecolor":"#2a3f60"};
    try{
      await Plotly.relayout(gd, light);
      const url = await Plotly.toImage(gd, {format:"png", width:w||860, height:h||320, scale:2});
      await Plotly.relayout(gd, dark);
      return url;
    }catch(e){ return null; }
  }
  const rimg = (u, cap) => u ? `<figure><img src="${u}"/>${cap?`<figcaption>${esc(cap)}</figcaption>`:""}</figure>` : "";

  async function exportHTML(){
    if(!RESULT){ toast("Run an East-West analysis first."); return; }
    const d = RESULT, k = d.kpis, c = d.comparison;
    const site = (document.getElementById("site_name")||{}).value || "";
    const now = new Date().toLocaleString();
    const [imMon, imCmp, imDay, imHeat, imOv, imOvDay] = await Promise.all([
      shot("ew_monthly",860,320), shot("ew_compare",860,320),
      shot("ew_day_profile",860,320), shot("ew_heatmap",860,380),
      OV_RESULT ? shot("ew_ov_chart",860,340) : Promise.resolve(null),
      OV_RESULT ? shot("ew_ov_day",860,340) : Promise.resolve(null),
    ]);
    const planeRows = d.plane_results.map(p => `<tr><td>${esc(p.label)}</td><td>${f(p.tilt,1)}°</td><td>${esc(azText(p))}</td><td>${f(p.dc_share_pct,1)}%</td><td>${f(p.dc_capacity_mwp,3)}</td><td>${f(p.poa_kwh_m2,0)}</td><td>${f(p.ac_energy_mwh,1)}</td><td>${f(p.specific_yield,0)}</td></tr>`).join("");
    const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m = d.monthly;
    const monRows = MON.map((mm,i)=>`<tr><td>${mm}</td><td>${f(m.east_mwh[i],1)}</td><td>${f(m.west_mwh[i],1)}</td><td>${f(m.combined_mwh[i],1)}</td><td>${f(m.clipping_mwh[i],2)}</td><td>${f(m.poa_kwh_m2[i],0)}</td></tr>`).join("");
    const rankRows = (d.ranked_candidates||[]).slice(0,10).map(r=>`<tr><td>${r.rank||""}</td><td>${f(r.tilt_a,2)}°/${f(r.azimuth_a,2)}°</td><td>${f(r.tilt_b,2)}°/${f(r.azimuth_b,2)}°</td><td>${f(r.share_a,0)}/${f(100-r.share_a,0)}</td><td>${f(r.energy_mwh,1)}</td><td>${f(r.specific_yield,0)}</td><td>${f(r.clipping_loss_pct,2)}%</td></tr>`).join("");
    const steps = (d.calculation_steps || []).map(sec => `<h3 class="sub-h">${esc(sec.title)}</h3><ol>${(sec.items||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`).join("");
    const warnings = (d.warnings || []).map(x => `<li>${esc(x)}</li>`).join("");
    const kpCard = (l,v)=>`<div class="kp"><div class="kl">${l}</div><div class="kv2">${v}</div></div>`;
    const pa = d.plane_results[0], pb = d.plane_results[1];
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>East-West Report — ${esc(site)}</title>
<style>
*{box-sizing:border-box} body{margin:0;background:#f1f4f9;color:#1d2b45;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.5}
.rpt{max-width:900px;margin:0 auto;background:#fff;box-shadow:0 2px 18px rgba(20,40,80,.12)}
.cover{background:linear-gradient(135deg,#10233f,#1d3a63);color:#fff;padding:34px 40px 28px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.logo{width:40px;height:40px;border-radius:10px;background:linear-gradient(145deg,#ffb12b,#ff8f1f);display:grid;place-items:center;font-size:22px;color:#3a2403}
.bt{font-weight:700;font-size:15px}.bs{font-size:11px;color:#a9c2e6}
.cover h1{margin:6px 0;font-size:24px}.cover-meta{font-size:12px;color:#bcd0ec}
.headline{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.kp{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:11px 13px}
.kl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#a9c2e6}
.kv2{font-size:17px;font-weight:700;margin-top:3px}
section{padding:22px 40px;border-bottom:1px solid #eef2f8}
h2{font-size:15px;color:#1d3a63;border-left:4px solid #ffb12b;padding-left:10px;margin:0 0 12px}
.sub-h{font-size:13px;color:#1d3a63;margin:16px 0 6px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-variant-numeric:tabular-nums}
th{background:#10233f;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px;padding:7px 9px;text-align:left}
td{padding:6px 9px;border-bottom:1px solid #eef2f8}
tr.tot td{font-weight:700;background:#fff7e9;border-top:2px solid #ffb12b}
b{color:#10233f}.muted{color:#8493a8;font-size:11px}
figure{margin:14px 0;text-align:center} figure img{max-width:100%;border:1px solid #e3e9f2;border-radius:8px}
figcaption{font-size:11px;color:#8493a8;margin-top:5px}
.warn{background:#fff7e6;border:1px solid #f1be66;border-radius:8px;padding:12px;font-size:12px}
li{margin:5px 0} footer{padding:20px 40px;color:#5a6b86;font-size:11px}
.actions{padding:18px 40px}.actions button{background:#1d3a63;color:#fff;border:none;border-radius:9px;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer}
@media print{body{background:#fff}.rpt{box-shadow:none;max-width:none}.noprint{display:none}section{break-inside:avoid;border-bottom:none}figure,table{break-inside:avoid}.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="rpt">
  <header class="cover">
    <div class="brand"><div class="logo">☀</div><div><div class="bt">East-West Dual-Plane Yield Report</div>
      <div class="bs">two fixed planes · conserved DC capacity · pvlib engine</div></div></div>
    <h1>${esc(site)||"Dual-plane analysis"}</h1>
    <div class="cover-meta">${esc((d.weather_meta&&d.weather_meta.source)||"")} · ${d.mode==="manual"?"Manual dual-plane calculation":"Automatic dual-plane optimisation"} · Generated ${now}</div>
    <div class="headline">
      ${kpCard("Plane A", f(pa.tilt,2)+"° / "+f(pa.azimuth,2)+"° · "+f(pa.dc_share_pct,0)+"%")}
      ${kpCard("Plane B", f(pb.tilt,2)+"° / "+f(pb.azimuth,2)+"° · "+f(pb.dc_share_pct,0)+"%")}
      ${kpCard("Annual energy", f(k.energy_mwh,1)+" MWh")}
      ${kpCard("Specific yield", f(k.specific_yield,0)+" kWh/kWp")}
      ${kpCard("Performance ratio", f(k.performance_ratio,1)+" %")}
      ${kpCard("Clipping", f(k.clipping_loss_pct,2)+" %")}
    </div>
  </header>
  <section><h2>1 · Executive summary</h2>
    <p>${d.mode==="manual"
        ? `The user-specified dual-plane arrangement was evaluated with the full hourly model.`
        : `The dual-plane optimiser searched ${d.arrangement==="independent"?"independent plane orientations":"symmetric East-West orientations"}${d.optimize_split?" including the DC split":""} and reranked the best candidates with the exact model.`}
      The arrangement delivers <b>${f(k.energy_mwh,1)} MWh/yr</b> (${f(k.specific_yield,0)} kWh/kWp, PR ${f(k.performance_ratio,1)}%, capacity factor ${f(k.capacity_factor,1)}%).</p>
    <p><b>Single-plane comparison:</b> ${esc(c.statement)} Best single plane ${f(c.single_plane_best.tilt,1)}°/${f(c.single_plane_best.azimuth,2)}° gives ${f(c.single_plane_best.energy_mwh,1)} MWh (${c.delta_energy_pct>=0?"+":""}${f(c.delta_energy_pct,2)}% for East-West);
      morning window ${c.delta_morning_pct>=0?"+":""}${f(c.delta_morning_pct,1)}%, evening window ${c.delta_evening_pct>=0?"+":""}${f(c.delta_evening_pct,1)}%.</p>
  </section>
  <section><h2>2 · Plane breakdown</h2>
    <table><thead><tr><th>Plane</th><th>Tilt</th><th>Azimuth</th><th>DC share</th><th>MWp</th><th>POA kWh/m²</th><th>AC MWh</th><th>kWh/kWp</th></tr></thead>
    <tbody>${planeRows}<tr class="tot"><td>Total</td><td></td><td></td><td>100%</td><td>${f(pa.dc_capacity_mwp+pb.dc_capacity_mwp,3)}</td><td></td><td>${f(k.energy_mwh,1)}</td><td>${f(k.specific_yield,0)}</td></tr></tbody></table>
    ${rimg(imDay,"Average day AC power — East plane, West plane and combined output.")}
  </section>
  <section><h2>3 · Monthly results</h2>
    <table><thead><tr><th>Month</th><th>East MWh</th><th>West MWh</th><th>Combined MWh</th><th>Clipping MWh</th><th>POA kWh/m²</th></tr></thead><tbody>${monRows}</tbody></table>
    ${rimg(imMon,"Monthly generation by plane and combined.")}
  </section>
  <section><h2>4 · Optimisation &amp; comparison</h2>
    ${rimg(imHeat,"Dual-plane search grid (annual energy).")}
    ${rankRows?`<h3 class="sub-h">Best candidates (exact reranked)</h3><table><thead><tr><th>#</th><th>Plane A</th><th>Plane B</th><th>Split %</th><th>MWh</th><th>kWh/kWp</th><th>Clip</th></tr></thead><tbody>${rankRows}</tbody></table>`:""}
    ${rimg(imCmp,"East-West vs best single plane.")}
  </section>
  ${OV_RESULT ? overloadReportSection(imOv, imOvDay) : ""}
  <section><h2>5 · Calculation transparency</h2>${steps}
    <h3 class="sub-h">Methodology</h3><ol>${(d.methodology||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    <h3 class="sub-h">Model warnings</h3><ul class="warn">${warnings}</ul>
  </section>
  <footer><p><b>Disclaimer.</b> Preliminary engineering estimates from a transparent pvlib model; not a bankable study. Validate with PVsyst/SAM using site-specific inputs.</p>
    <p class="muted">Generated by Solar Yield Optimizer · ${now}</p></footer>
  <div class="noprint actions"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
</div></body></html>`;
    const w = window.open("", "_blank");
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else download("eastwest_report.html", html, "text/html");
  }

  function overloadReportSection(imOv, imOvDay){
    const d = OV_RESULT;
    if(!d) return "";
    const dr = d.day_response;
    const rd = d.recommended_dual, rs = d.recommended_single, g = d.dual_vs_single_at_threshold;
    const hardwareKnown = d.hardware_max_ilr != null;
    const term = hardwareKnown ? "recommended overload" : "clipping-limited candidate (hardware not verified)";
    const verdict = (rd && rs && d.preferred_method)
      ? `<b>${d.preferred_method === "tied" ? "Equal annual modelled energy" : d.preferred_method === "dual" ? "Dual-plane has higher annual modelled energy" : "Single-plane has higher annual modelled energy"}</b> at the selected ${hardwareKnown ? "recommendations" : "candidates"}: dual-plane ILR ${ratio(rd.ilr)} vs single-plane ILR ${ratio(rs.ilr)}.`
      : "";
    const rows = d.rows.map(r=>{
      const isRd = rd && r.ilr === rd.ilr;
      const overHw = d.hardware_max_ilr != null && r.ilr > d.hardware_max_ilr + 1e-9;
      return `<tr${isRd?' class="tot"':''}><td>${ratio(r.ilr)}${overHw?" ⚠":""}</td><td>${f(r.dc_mwp,2)}</td><td>${f(r.dual_mwh,0)}</td><td>${f(r.dual_clip_pct,4)}</td><td>${r.dual_marginal_kwh_per_kwp!=null?f(r.dual_marginal_kwh_per_kwp,0):"—"}</td><td>${f(r.single_mwh,0)}</td><td>${f(r.single_clip_pct,4)}</td></tr>`;
    }).join("");
    return `<section><h2>4b · Inverter overload (DC/AC) optimisation</h2>
      <p>Installed DC was swept at the fixed AC nameplate of <b>${f(d.fixed_ac_mw,2)} MWac</b>
        (single-plane reference ${f(d.single_ref.tilt,2)}°/${f(d.single_ref.azimuth,2)}°, ${esc(d.single_ref.source)}).
        ${rd ? `The ${term} is <b>ILR ${ratio(rd.ilr)}</b> (${f(rd.dc_mwp,2)} MWp) giving
        <b>${f(rd.dual_mwh,0)} MWh/yr</b> at ${f(rd.dual_clip_pct,4)}% clipping — the largest overload within the
        ${ratio(d.clip_threshold_pct)}% clipping limit${hardwareKnown?` and the hardware string-capacity cap of ILR ${ratio(d.hardware_max_ilr)}`:"; inverter hardware capacity must still be verified"}.`
        : `No ILR in the swept range met the ${ratio(d.clip_threshold_pct)}% clipping limit${hardwareKnown ? " and the known hardware limit" : "; inverter hardware capacity is unverified"}.`}
        ${g ? `At the same clipping limit the dual-plane arrangement supports ${g.ilr_advantage>=0?"+":""}${f(g.ilr_advantage,2)} more ILR than the single plane,
        worth <b>${g.energy_advantage_mwh>=0?"+":""}${f(g.energy_advantage_mwh,0)} MWh/yr (${g.energy_advantage_pct>=0?"+":""}${f(g.energy_advantage_pct,2)}%)</b> from the same inverter pool.` : ""}</p>
      ${verdict?`<p>${verdict}</p>`:""}
      ${rimg(imOv,"Annual energy and clipping vs DC/AC ratio — dual-plane vs single-plane on the same AC nameplate.")}
      ${dr ? rimg(imOvDay, `Average-day AC response at each method's ${term} (dual @ ILR ${ratio(dr.dual_ilr)}, single @ ILR ${ratio(dr.single_ilr)}; dashed = AC nameplate ${f(dr.ac_limit_kw,0)} kW).`) : `<p>Average-day comparison unavailable: at least one method has no eligible overload in the swept range.</p>`}
      <table><thead><tr><th>ILR</th><th>DC MWp</th><th>Dual MWh</th><th>Dual clip %</th><th>Dual marginal kWh/kWp</th><th>Single MWh</th><th>Single clip %</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${d.hardware_note?`<p class="muted">⚠ ${esc(d.hardware_note)}</p>`:""}
      <h3 class="sub-h">Method</h3><ol>${(d.methodology||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
    </section>`;
  }

  function download(name, text, mime){
    const blob = new Blob([text], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function azText(p){
    return p && p.azimuth_defined === false ? "N/A (horizontal)" : `${f(p.azimuth,2)} deg`;
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {showTab, run:runEastWest};
})();
