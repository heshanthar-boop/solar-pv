/* ===== Solar Yield Optimizer — app logic ===== */
const $ = id => document.getElementById(id);
let CATALOG = null, PANELS = {}, INVERTERS = {}, LAST = null, UPLOAD_ID = null, PANEL_CELLS = 264, FIELD_RESULT = null;

// ---------- init ----------
(async function init(){
  // collapsible cards
  document.querySelectorAll("[data-toggle]").forEach(h=>{
    h.addEventListener("click",()=>{
      const b=h.nextElementSibling;
      const open = b.style.display!=="none";
      b.style.display = open?"none":"flex";
      h.classList.toggle("collapsed", open);
    });
  });

  try{
    CATALOG = await (await fetch("/api/catalog")).json();
    CATALOG.panels.forEach(p=>PANELS[p.id]=p);
    CATALOG.inverters.forEach(i=>INVERTERS[i.id]=i);
    fillSelect($("panel_id"), CATALOG.panels.map(p=>[p.id,`${p.brand} ${p.model}`]));
    fillSelect($("inverter_id"), CATALOG.inverters.map(i=>[i.id,`${i.brand} ${i.model}`]));
    onPanel(); onInverter();
  }catch(e){ toast("Could not load catalog: "+e); }

  // locations + map
  populateLocations($("site_preset"));
  initMap();

  // wiring
  $("panel_id").onchange = onPanel;
  $("panel_bin").onchange = onPanelBin;
  $("inverter_id").onchange = onInverter;
  $("dc_mw").oninput = $("ac_mw").oninput = updateILR;
  $("site_preset").onchange = onSitePreset;
  $("lat").oninput = $("lon").oninput = ()=>syncMarker();
  $("wx_source").onchange = onWxSource;
  $("wx_file").onchange = onUpload;
  $("btn_inspect").onclick = inspectWeather;
  $("btn_run").onclick = run;
  $("btn_copy_summary").onclick = copySummary;
  $("btn_report").onclick = ()=>{ if(LAST) REPORT.generate(LAST); else toast("Run an analysis first."); };
  $("btn_longterm").onclick = computeLongterm;
  // field-test analysis lives on its own page (/field); wire only if present here
  if($("btn_ft_analyze")) $("btn_ft_analyze").onclick = analyzeFieldTests;
  $("metric").onchange = ()=>{ if(LAST&&LAST.sweep&&LAST.sweep.tilts) CH.heatmap($("heatmap"),LAST.sweep,$("metric").value,LAST.selected_detail); updateHeatCaption(); };
  ["tilt_min","tilt_max","tilt_step","az_min","az_max","az_step"].forEach(k=>$(k).oninput=updateGridNote);
  ["gcr","height_m","modules_per_row","orientation","design_tilt"].forEach(k=>$(k).addEventListener("input",renderMiniLayout));
  $("mounting").onchange = updateMounting;
  $("analysis_mode").onchange = updateAnalysisMode;
  updateGridNote(); updateILR(); updateMounting(); updateAnalysisMode(); renderMiniLayout();
  applyInputHelp();
})();

// ---------- hover help for technical inputs ----------
function applyInputHelp(){
  const HELP={
    dc_mw:"Total panel (DC) capacity you plan to install. More DC than AC is normal — the extra is 'inverter overload'.",
    ac_mw:"Grid/inverter output limit. Generation can never exceed this; excess DC power is clipped.",
    gcr:"Ground-cover ratio = panel width ÷ row spacing. Higher packs more panels per hectare but increases row-to-row shading. 0.35–0.45 is typical.",
    albedo:"How reflective the ground is (0–1). Grass ≈ 0.20, sand ≈ 0.30, white gravel ≈ 0.5. Feeds the bifacial rear side.",
    bifaciality:"Rear-side power as a fraction of front (datasheet). 0.85 means the back makes up to 85% of the front at equal light.",
    gamma_pmp:"Power temperature coefficient from the datasheet: % of power lost per °C above 25 °C. More negative = worse in heat.",
    height_m:"Height of the lower panel edge (or tracker axis) above ground. Higher lets more reflected light reach bifacial rears.",
    eta_inv_nom:"Nominal inverter efficiency used by the PVWatts conversion curve (Euro efficiency from the datasheet is a good value).",
    temp_model:"How cell temperature is estimated from sun, air temp and wind. Faiman (IEC 61853) is a robust default for open racks.",
    dc_model:"PVWatts = linear with light (simple). Detailed = adds the module's real low-light behaviour from a single-diode fit.",
    mounting:"Fixed tilt vs a single-axis tracker that rotates east→west through the day (typically +15…25% energy).",
    apply_horizon:"Blocks direct sun when it is behind hills, using the PVGIS terrain horizon for the site.",
    utc_offset:"Local clock offset from UTC — Sri Lanka is +5.5. Used for daily profiles and morning/evening windows.",
    design_temp_min_c:"Coldest expected site temperature — sets the highest string voltage (safety limit check).",
    design_temp_max_cell_c:"Hottest expected CELL temperature (≈ air + 25–30 °C) — sets the lowest string voltage (MPPT window check).",
    harmonic_tdd_pct:"Total demand distortion of the inverter current from its datasheet, screened against the CEB/SEA 5% limit.",
    transformer_pf:"Power factor the transformer must support at the grid connection (0.95 typical for NCRE plants).",
    gcr_note:"", modules_per_row:"How many module rows are stacked up the slope of one mounting table (1-up, 2-up…).",
    tilt_step:"Coarse search step. The selected region is then refined locally using 1° steps and bounded edges.",
    az_step:"Coarse azimuth step; the selected region is refined locally using 1° steps and bounded edges.",
  };
  Object.entries(HELP).forEach(([id,txt])=>{
    const inp=$(id); if(!inp||!txt) return;
    const lbl=inp.closest("label")||inp;
    lbl.title=txt;
  });
}

// ---------- Leaflet map ----------
let MAP=null, MARKER=null;
function initMap(){
  try{
    MAP = L.map("map",{zoomControl:true, attributionControl:true})
            .setView([parseFloat($("lat").value)||7.5, parseFloat($("lon").value)||80.7], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })
      .addTo(MAP);
    const icon = L.icon({iconUrl:"vendor/marker-icon.png", iconRetinaUrl:"vendor/marker-icon-2x.png",
      shadowUrl:"vendor/marker-shadow.png", iconSize:[25,41], iconAnchor:[12,41], shadowSize:[41,41]});
    MARKER = L.marker([parseFloat($("lat").value)||7.5, parseFloat($("lon").value)||80.7],
                      {draggable:true, icon}).addTo(MAP);
    MARKER.on("dragend", e=>{const ll=e.target.getLatLng(); setLatLon(ll.lat,ll.lng);});
    MAP.on("click", e=>{ setLatLon(e.latlng.lat, e.latlng.lng); MARKER.setLatLng(e.latlng); });
    setTimeout(()=>MAP.invalidateSize(), 300);
  }catch(e){ console.warn("map init failed", e); }
}
function setLatLon(la, lo){
  $("lat").value = la.toFixed(4); $("lon").value = lo.toFixed(4);
}
function syncMarker(){
  const la=parseFloat($("lat").value), lo=parseFloat($("lon").value);
  if(MAP && MARKER && isFinite(la) && isFinite(lo)){ MARKER.setLatLng([la,lo]); MAP.panTo([la,lo]); }
}

function fillSelect(sel, pairs){ sel.innerHTML = pairs.map(([v,t])=>`<option value="${v}">${t}</option>`).join(""); }

// ---------- panel ----------
function onPanel(){
  const p = PANELS[$("panel_id").value]; if(!p) return;
  fillSelect($("panel_bin"), p.bins.map(b=>[b,`${b} Wp`]));
  $("panel_bin").value = p.default_bin;
  $("bifaciality").value = p.bifaciality;
  $("gamma_pmp").value = (p.gamma_pmp*100).toFixed(3);
  $("length_m").value = p.length_m;
  $("width_m").value = p.width_m;
  $("bifacial").checked = p.bifaciality>0;
  PANEL_CELLS = p.cells || 264;
  onPanelBin();
  $("panel_note").textContent = `${p.technology} · area ${p.area_m2} m² · ${p.bifaciality>0?"bifacial "+(p.bifaciality*100)+"% rear":"monofacial"}`;
  recalcArea();
}
function onPanelBin(){ recalcArea(); }
function recalcArea(){
  const a = (parseFloat($("length_m").value)*parseFloat($("width_m").value));
  if(isFinite(a)) $("area_m2").value = a.toFixed(3);
}
$("length_m") && ($("length_m").addEventListener?.("input",recalcArea));
$("width_m") && ($("width_m").addEventListener?.("input",recalcArea));

// ---------- inverter ----------
function onInverter(){
  const i = INVERTERS[$("inverter_id").value]; if(!i) return;
  $("eta_inv_nom").value = i.eta_euro;
  $("inv_note").textContent = `${i.type} · ${i.ac_kva_40c} kVA @40°C · η_euro ${(i.eta_euro*100).toFixed(1)}% · DC ≤ ${i.max_dc_voltage} V · ${i.max_strings||"—"} strings max`;
}

// ---------- helpers ----------
function updateILR(){
  const dc=parseFloat($("dc_mw").value), ac=parseFloat($("ac_mw").value);
  const r = (dc&&ac)? dc/ac : null;
  $("ilr").textContent = r? r.toFixed(3) : "—";
  const h=$("ilr_hint");
  if(!r){ h.textContent=""; h.className="ilr-hint"; }
  else if(r<1.05){ h.textContent="low — inverter under-used"; h.className="ilr-hint warn"; }
  else if(r<=1.35){ h.textContent="typical range ✓"; h.className="ilr-hint ok"; }
  else { h.textContent="high — expect clipping"; h.className="ilr-hint warn"; }
}
function onSitePreset(){
  const v=$("site_preset").value; if(!v) return;
  const [la,lo,nm]=v.split(",");
  $("lat").value=parseFloat(la).toFixed(4); $("lon").value=parseFloat(lo).toFixed(4);
  $("site_name").value=nm;
  $("utc_offset").value="5.5";
  if(MAP){ MAP.setView([parseFloat(la),parseFloat(lo)], 10); MARKER.setLatLng([parseFloat(la),parseFloat(lo)]); }
}

function geomParams(){
  const len=parseFloat($("length_m").value), wid=parseFloat($("width_m").value);
  const base = $("orientation").value==="portrait"?len:wid;
  const collector_w = base * (parseInt($("modules_per_row").value)||1);
  const gcr = parseFloat($("gcr").value);
  return { gcr, collector_w, pitch: collector_w/gcr, height: parseFloat($("height_m").value),
           modules_per_row: parseInt($("modules_per_row").value)||1, orientation:$("orientation").value,
           length_m:len, width_m:wid, cells: PANEL_CELLS,
           bifaciality: $("bifacial").checked?parseFloat($("bifaciality").value):0,
           pmpp: parseFloat($("panel_bin").value) };
}
function renderMiniLayout(){
  const g=geomParams();
  g.tilt = $("mounting").value==="sat"
    ? (parseFloat($("max_angle").value)||60)
    : (parseFloat($("design_tilt").value)||0);
  $("mini_layout").innerHTML = LAYOUT.arrayView(g);
}
function updateMounting(){
  const tracker=$("mounting").value==="sat";
  $("tracker_params").style.display=tracker?"grid":"none";
  $("height_label").textContent=tracker?"Tracker axis height (m)":"Lower-edge clearance (m)";
  renderMiniLayout();
}
function updateAnalysisMode(){
  const manual=$("analysis_mode").value==="manual";
  $("manual_wrap").style.display=manual?"grid":"none";
  $("manual_hint").style.display=manual?"block":"none";
  $("sweep_wrap").style.display=manual?"none":"";
  if(manual) $("grid_note").textContent="Fixed-orientation run — the sweep grid is not used.";
  else updateGridNote();
}
function onWxSource(){
  const s=$("wx_source").value;
  $("wx_year_wrap").style.display = s==="pvgis_year"?"flex":"none";
  $("wx_upload_wrap").style.display = s==="upload"?"flex":"none";
}
function updateGridNote(){
  const n=(k)=>parseFloat($(k).value);
  const nt=Math.max(1,Math.round((n("tilt_max")-n("tilt_min"))/n("tilt_step"))+1);
  const na=Math.max(1,Math.round((n("az_max")-n("az_min"))/n("az_step"))+1);
  const tot=nt*na;
  $("grid_note").textContent = `${nt} tilts × ${na} azimuths = ${tot} coarse orientations (~${(tot*0.025).toFixed(0)} s), then local refinement in 1° steps plus bounded edges.`;
}

function locationPayload(){
  return { lat:parseFloat($("lat").value), lon:parseFloat($("lon").value),
           altitude: $("altitude").value!==""?parseFloat($("altitude").value):null,
           name:$("site_name").value||null,
           utc_offset:parseFloat($("utc_offset").value) };
}
function weatherPayload(){
  return { source:$("wx_source").value,
           year: parseInt($("wx_year").value)||null,
           upload_id: UPLOAD_ID };
}
function optionalNumber(id){
  const v=$(id).value;
  return v==="" ? null : parseFloat(v);
}
function optionalInt(id){
  const v=$(id).value;
  return v==="" ? null : parseInt(v);
}

// ---------- upload ----------
async function onUpload(e){
  const f=e.target.files[0]; if(!f) return;
  const fd=new FormData(); fd.append("file",f); fd.append("utc_offset",$("utc_offset").value);
  try{
    const r=await fetch("/api/weather/upload",{method:"POST",body:fd});
    const j=await r.json();
    if(!r.ok) throw new Error(j.detail||"upload failed");
    UPLOAD_ID=j.upload_id;
    showInspect(j, {source:j.source});
    toast("✓ Loaded "+j.rows+" rows from CSV");
  }catch(err){ toast("Upload error: "+err.message); }
}

// ---------- inspect pattern data ----------
async function inspectWeather(){
  const btn=$("btn_inspect"); btn.disabled=true; btn.textContent="⏳ Fetching…";
  try{
    const body={location:locationPayload(), weather:weatherPayload()};
    const r=await fetch("/api/weather/inspect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok) throw new Error(j.detail||"failed");
    showInspect(j, j.meta);
  }catch(err){ toast("Inspect error: "+err.message); }
  finally{ btn.disabled=false; btn.textContent="🔍 Inspect pattern data"; }
}
function showInspect(j, meta){
  const el=$("wx_inspect");
  el.innerHTML = `
    <div class="vk"><span>Source</span><b>${esc((meta&&meta.source)||"—")}</b></div>
    <div class="vk"><span>Annual GHI</span><b>${j.ghi_annual} kWh/m²</b></div>
    <div class="vk"><span>Annual DNI</span><b>${j.dni_annual} kWh/m²</b></div>
    <div class="vk"><span>Mean / max air temp</span><b>${j.temp_mean} / ${j.temp_max} °C</b></div>
    <div class="vk"><span>Mean wind</span><b>${j.wind_mean} m/s</b></div>
    <div class="vk"><span>Data points</span><b>${j.rows} @ ${j.interval_minutes||60} min</b></div>
    <div class="vk"><span>Coverage</span><b>${j.coverage_days||"—"} days</b></div>`;
  el.classList.add("show");
}

// ---------- losses ----------
function lossesPayload(){
  const g=k=>parseFloat($("l_"+k).value)||0;
  return {soiling:g("soiling"),shading:g("shading"),snow:0,mismatch:g("mismatch"),
    wiring:g("wiring"),connections:g("connections"),lid:g("lid"),
    nameplate_rating:g("nameplate_rating"),age:0,availability:g("availability")};
}

function analyzePayload(){
  return {
    location: locationPayload(),
    weather: weatherPayload(),
    panel: {
      id:$("panel_id").value, model:$("panel_id").value,
      pmpp_w: parseFloat($("panel_bin").value),
      gamma_pmp: parseFloat($("gamma_pmp").value)/100,
      bifaciality: $("bifacial").checked ? parseFloat($("bifaciality").value) : 0,
      length_m: parseFloat($("length_m").value),
      width_m: parseFloat($("width_m").value),
    },
    plant: {
      dc_mw: parseFloat($("dc_mw").value), ac_mw: parseFloat($("ac_mw").value),
      inverter_id:$("inverter_id").value,
      eta_inv_nom: parseFloat($("eta_inv_nom").value), albedo: parseFloat($("albedo").value),
      gcr: parseFloat($("gcr").value), height_m: parseFloat($("height_m").value),
      modules_per_row: parseInt($("modules_per_row").value)||1,
      orientation: $("orientation").value, bifacial: $("bifacial").checked,
      temp_model: $("temp_model").value,
      dc_model: $("dc_model").value, mounting: $("mounting").value,
      axis_azimuth: 0, max_angle: parseFloat($("max_angle").value)||60,
      backtrack: $("backtrack").checked, apply_horizon: $("apply_horizon").checked,
      design_temp_min_c: optionalNumber("design_temp_min_c"),
      design_temp_max_cell_c: optionalNumber("design_temp_max_cell_c"),
      inverter_count: optionalInt("inverter_count"),
      transformer_count: optionalInt("transformer_count"),
      transformer_pf: parseFloat($("transformer_pf").value)||0.95,
      harmonic_tdd_pct: optionalNumber("harmonic_tdd_pct"),
      losses: lossesPayload(),
    },
    sweep: {
      tilt_min:parseFloat($("tilt_min").value), tilt_max:parseFloat($("tilt_max").value),
      tilt_step:parseFloat($("tilt_step").value), az_min:parseFloat($("az_min").value),
      az_max:parseFloat($("az_max").value), az_step:parseFloat($("az_step").value),
    },
    selected: $("analysis_mode").value==="manual"
      ? { tilt:parseFloat($("manual_tilt").value), azimuth:parseFloat($("manual_az").value) }
      : { tilt:parseFloat($("design_tilt").value), azimuth:parseFloat($("design_azimuth").value) },
    mode: $("analysis_mode").value,
  };
}

// ---------- run (streaming) ----------
async function run(){
  const payload = analyzePayload();
  if(!isFinite(payload.location.lat)||!isFinite(payload.location.lon)){ toast("Enter a valid latitude/longitude."); return; }
  const btn=$("btn_run"); btn.disabled=true; btn.textContent="⏳ Running…";
  $("progress").style.display="flex"; setProgress(0,"starting…");
  $("run_status").textContent="Analyzing…";
  try{
    const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!r.ok){
      const j=await r.json();
      const detail=Array.isArray(j.detail)?j.detail.map(x=>x.msg).join("; "):j.detail;
      throw new Error(detail||`HTTP ${r.status}`);
    }
    const reader=r.body.getReader(); const dec=new TextDecoder(); let buf="";
    let gotResult=false;
    while(true){
      const {value,done}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      let nl; while((nl=buf.indexOf("\n"))>=0){
        const line=buf.slice(0,nl); buf=buf.slice(nl+1);
        if(!line.trim()) continue;
        const msg=JSON.parse(line);
        if(msg.type==="status"){ $("run_status").textContent=msg.message; }
        else if(msg.type==="progress"){ setProgress(Math.round(100*msg.done/msg.total), `${msg.done}/${msg.total}`); }
        else if(msg.type==="error"){ throw new Error(msg.message); }
        else if(msg.type==="result"){ LAST=msg.data; render(msg.data); gotResult=true; }
      }
    }
    if(!gotResult) throw new Error("The analysis stream ended without a result.");
    $("run_status").textContent="✓ Analysis complete.";
  }catch(err){
    const conn = /fetch|networkerror|load failed/i.test(err.message);
    const msg = conn
      ? "Can't reach the server — its console window may have been closed. Re-open SolarYieldOptimizer.exe (or restart the server), then reload this page."
      : err.message;
    toast("Analysis failed: "+msg);
    $("run_status").textContent = conn ? "⚠ Server not reachable — see message." : "Failed — "+msg;
  }
  finally{ btn.disabled=false; btn.textContent="▶ Run analysis"; setTimeout(()=>$("progress").style.display="none",600); }
}
function setProgress(pct,txt){ $("progress-fill").style.width=pct+"%"; $("progress-text").textContent=txt||pct+"%"; }

// ---------- field test upload / condition analysis ----------
function ftNumber(id){
  const v=parseFloat($(id).value);
  return isFinite(v) ? v : "";
}
async function analyzeFieldTests(){
  const file=$("ft_file").files[0];
  if(!file){ toast("Choose a ZIP, PDF, or CSV field-test export first."); return; }
  const fd=new FormData();
  fd.append("file", file);
  ["warning_pct","critical_pct","voltage_warning_pct","current_warning_pct","irradiance_min_wm2","ff_warning_pct"]
    .forEach(k=>fd.append(k, ftNumber("ft_"+k)));
  const btn=$("btn_ft_analyze");
  btn.disabled=true; btn.textContent="Analyzing field tests...";
  $("ft_upload_status").textContent="Parsing instrument files and calculating condition indexes...";
  try{
    const r=await fetch("/api/fieldtest/analyze",{method:"POST",body:fd});
    const j=await r.json();
    if(!r.ok) throw new Error(j.detail||"field-test analysis failed");
    FIELD_RESULT=j;
    renderFieldTests(j);
    $("ft_upload_status").textContent=`Loaded ${j.summary.records} records from ${j.summary.source}.`;
    toast("Field-test analysis complete.");
  }catch(err){
    toast("Field-test analysis failed: "+err.message);
    $("ft_upload_status").textContent="Failed - "+err.message;
  }finally{
    btn.disabled=false; btn.textContent="Analyze field tests";
  }
}

function renderFieldTests(d){
  $("fieldtest_panel").style.display="block";
  const s=d.summary, c=s.conditions||{}, v=d.validation||{};
  $("ft_summary_sub").textContent =
    `${s.validation_status||"Validated"} | ${s.records} records | ${s.modules_tested} modules | ${s.strings_tested} strings | ${s.date_from||""}`;
  const card=(l,v,s2,st)=>`<div class="ec ${st||""}"><div class="ec-l">${esc(l)}</div><div class="ec-v">${esc(v)}</div><div class="ec-s">${esc(s2||"")}</div></div>`;
  const cards=[
    card("MI3115 verified", `${s.mi3115_records||0}/${s.records}`, "Metrel analyzer PDF records", (s.mi3115_records||0)===s.records?"ok":""),
    card("SolarWorld match", `${s.solarworld_records||0}/${v.solarworld_applicable_records||s.records}`, "SW XL 350 mono profile", (s.solarworld_records||0)>0?"ok":""),
    card("Median condition", s.median_performance_pct!=null?s.median_performance_pct+" %":"-", "corrected Pmpp / expected", "ok"),
    card("Minimum", s.min_performance_pct!=null?s.min_performance_pct+" %":"-", "lowest corrected power", (s.min_performance_pct||100)<80?"bad":""),
    card("Critical", c.Critical||0, "records requiring action", (c.Critical||0)>0?"bad":"ok"),
    card("High confidence", v.high_confidence_records||0, "IV with G and Tcell"),
  ].join("");

  const recRows=d.records.map(r=>`
    <tr class="${r.condition==="Critical"?"rowbad":r.condition==="Degraded"?"rowwarn":""}">
      <td>${esc(r.asset_id)}</td>
      <td>${esc(r.test_type)}</td>
      <td>${num(r.performance_pct," %")}</td>
      <td>${num(r.delta_pmpp_pct," %")}</td>
      <td>${num(r.delta_uoc_pct," %")}</td>
      <td>${num(r.delta_isc_pct," %")}</td>
      <td>${num(r.ff_measured_pct," %")}</td>
      <td>${esc(r.confidence||"-")}</td>
      <td><span class="cond ${condClass(r.condition)}">${esc(r.condition)}</span></td>
      <td>${flagPills(r.flags)}</td>
    </tr>`).join("");
  const stringRows=d.strings.map(r=>`
    <tr>
      <td>${esc(r.string_id)}</td><td>${r.tests}</td><td>${r.modules}</td>
      <td>${num(r.median_performance_pct," %")}</td><td>${num(r.min_performance_pct," %")}</td>
      <td><span class="cond ${condClass(r.condition)}">${esc(r.condition)}</span></td>
      <td>${(r.low_assets||[]).map(esc).join(", ")||"-"}</td>
    </tr>`).join("");
  const recs=d.recommendations.map(x=>`<li>${esc(x)}</li>`).join("");
  const methodology=renderMethodology(d.methodology);
  const validation=renderFieldValidation(v);

  $("fieldtest_body").innerHTML=`
    <div class="ec-cards ft-cards">${cards}</div>
    <div class="grid-2 ft-grid">
      <div class="panelsub"><div class="sub3">Corrected power index by asset</div><div id="ft_perf_chart" class="plot sm"></div></div>
      <div class="panelsub"><div class="sub3">Condition count</div><div id="ft_condition_chart" class="plot sm"></div></div>
    </div>
    <div class="ft-recommend"><div class="sub3">Recommended actions</div><ul>${recs}</ul></div>
    <div class="grid-2 ft-grid">
      <div><div class="sub3">String-wise condition</div><div class="restable-wrap"><table class="restable">
        <thead><tr><th>String</th><th>Tests</th><th>Modules</th><th>Median</th><th>Min</th><th>Condition</th><th>Low assets</th></tr></thead>
        <tbody>${stringRows}</tbody></table></div></div>
      <div>${validation}</div>
    </div>
    <div class="grid-2 ft-grid">
      <div>${methodology}</div>
      <div>${renderSpecialistNotes(d)}</div>
    </div>
    <div class="sub3">Parsed measurement records</div>
    <div class="restable-wrap ft-table"><table class="restable">
      <thead><tr><th>Asset</th><th>Test</th><th>Perf</th><th>dP</th><th>dVoc</th><th>dIsc</th><th>FF</th><th>Confidence</th><th>Condition</th><th>Flags</th></tr></thead>
      <tbody>${recRows}</tbody></table></div>`;
  CH.fieldPerformance($("ft_perf_chart"), d.records, d.methodology.thresholds);
  CH.fieldConditions($("ft_condition_chart"), c);
}

function renderFieldValidation(v){
  const failed=Object.entries(v.failed_checks||{});
  const failRows=failed.length
    ? failed.map(([k,n])=>`<tr><td>${esc(k)}</td><td class="v bad">${n}</td></tr>`).join("")
    : `<tr><td>All specialist checks passing or not applicable</td><td class="v opt">OK</td></tr>`;
  const warns=(v.warnings||[]).map(x=>`<li>${esc(x)}</li>`).join("") || "<li>No profile mismatch warnings.</li>";
  return `<div class="ft-method"><div class="sub3">MI3115 / SolarWorld validation</div>
    <table class="restable kv"><tbody>
      <tr><td>Status</td><td class="v opt">${esc(v.status||"-")}</td></tr>
      <tr><td>MI3115 records</td><td>${esc(v.mi3115_records||0)} / ${esc(v.total_records||0)}</td></tr>
      <tr><td>SolarWorld profile records</td><td>${esc(v.solarworld_records||0)} / ${esc(v.solarworld_applicable_records||v.total_records||0)}</td></tr>
      <tr><td>IV curves with A 1785 remote</td><td>${esc(v.iv_curves_with_remote||0)} / ${esc(v.iv_curve_records||0)}</td></tr>
      <tr><td>High-confidence records</td><td>${esc(v.high_confidence_records||0)}</td></tr>
    </tbody></table>
    <h4>Failed or missing checks</h4><table class="restable kv"><tbody>${failRows}</tbody></table>
    <h4>Profile warnings</h4><ol>${warns}</ol></div>`;
}

function renderSpecialistNotes(d){
  const worst=(d.worst_records||[]).slice(0,5).map(r=>
    `<li><b>${esc(r.asset_id)}</b>: ${esc(r.condition)} ${num(r.performance_pct," %")} - ${esc(r.diagnosis)}</li>`
  ).join("") || "<li>No weak assets detected by the configured thresholds.</li>";
  return `<div class="ft-method"><div class="sub3">SolarWorld specialist interpretation</div>
    <h4>Module family</h4>
    <ol><li>Target profile: SolarWorld AG Sunmodule SW XL 350 mono, 350 W STC, Voc 48.0 V, Isc 9.82 A, Vmpp 38.4 V, Impp 9.17 A, gamma -0.430 %/C.</li>
    <li>For this monofacial module, low current usually points first to soiling, shading, sensor plane mismatch, cracked cells, or degradation; low voltage points more toward module count, bypass section, hot-cell, or connection issues.</li></ol>
    <h4>Weakest records</h4><ol>${worst}</ol></div>`;
}

function renderMethodology(m){
  const assumptions=(m.assumptions||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  const formulas=(m.formulas||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  const standards=(m.standards_alignment||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  return `<div class="ft-method"><div class="sub3">Calculation steps and assumptions</div>
    <h4>Standards alignment</h4><ol>${standards}</ol>
    <h4>Assumptions</h4><ol>${assumptions}</ol>
    <h4>Formulas</h4><ol>${formulas}</ol></div>`;
}
function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function num(v,suffix=""){
  return v==null || !isFinite(v) ? "-" : esc(fmt(v)+suffix);
}
function condClass(c){
  return c==="Healthy"?"ok":c==="Critical"?"bad":c==="Degraded"?"warn":"watch";
}
function flagPills(flags){
  if(!flags || !flags.length) return "-";
  return flags.map(f=>`<span class="flag">${esc(f.replaceAll("_"," "))}</span>`).join("");
}

// ---------- render ----------
function render(d){
  $("empty").style.display="none";
  $("results").style.display="block";
  $("btn_report").disabled=false;
  $("lt_body").innerHTML=`<p class="hint">Runs at least five historical PVGIS years and combines interannual variability with the entered model uncertainty. Results are probabilistic estimates, not a bankable resource assessment. Takes ~20–40 s.</p>`;
  $("lt_sub").textContent="multi-year interannual variability + degradation";
  const o=d.optimum_detail, sw=d.sweep, k=o.kpis;
  const tracker = sw.mounting==="sat";
  const manual = sw.mode==="manual";
  const gridless = tracker || manual;      // no tilt x azimuth grid available

  // panel visibility (heatmap/cross-sections/explorer need the sweep grid)
  $("heatmap_panel").style.display = gridless?"none":"";
  $("xsec_row").style.display = gridless?"none":"";
  $("explorer_panel").style.display = gridless?"none":"";
  document.querySelector(".orientation-panel").style.display = "";
  $("tracker_banner").style.display = gridless?"block":"none";
  $("grid_main").style.gridTemplateColumns = gridless?"1fr":"";
  if(gridless && window.Plotly && Plotly.purge){
    ["heatmap","tilt_xsec","az_xsec"].forEach(id=>{try{Plotly.purge($(id));}catch(e){}});
  }

  // KPIs
  if(manual){
    const opt=sw.optimum;
    $("kpis").innerHTML=[
      kpi("Tilt (evaluated)", opt.tilt, "°", true),
      kpi("Azimuth (evaluated)", opt.azimuth, "° "+azLabel(opt.azimuth), true),
      kpi("Specific yield", fmt(k.specific_yield), "kWh/kWp"),
      kpi("Annual energy", fmt(k.energy_mwh), "MWh"),
      kpi("Modeled PR", k.performance_ratio, "%"),
      kpi("Capacity factor", k.capacity_factor, "%"),
    ].join("");
    $("tracker_banner").innerHTML=
      `<b>Fixed-orientation evaluation</b> — full analysis at your specified `+
      `<b>${opt.tilt}° tilt / ${opt.azimuth}° ${azLabel(opt.azimuth)}</b> `+
      `(no sweep). Result: <b>${fmt(k.energy_mwh)} MWh/yr</b> (${fmt(k.specific_yield)} kWh/kWp, PR ${k.performance_ratio}%). `+
      `Switch the analysis mode to “Optimize” to search for the best orientation.`;
    renderOrientationMap(d);
  } else if(tracker){
    const opt=sw.optimum;
    $("kpis").innerHTML=[
      kpi("Mounting","Tracker","single-axis",true),
      kpi("Tracker gain","+"+opt.tracker_gain_pct,"% vs fixed",true),
      kpi("Specific yield", fmt(k.specific_yield), "kWh/kWp"),
      kpi("Annual energy", fmt(k.energy_mwh), "MWh"),
      kpi("Modeled PR", k.performance_ratio, "%"),
      kpi("Capacity factor", k.capacity_factor, "%"),
    ].join("");
    $("tracker_banner").innerHTML=
      `<b>Single-axis horizontal tracker</b> (N–S axis, ${$("max_angle").value}° max, ${$("backtrack").checked?"backtracking":"no backtrack"}) — `+
      `<b>${fmt(k.energy_mwh)} MWh/yr</b> (${fmt(k.specific_yield)} kWh/kWp), <b>+${opt.tracker_gain_pct}%</b> vs a fixed `+
      `${opt.fixed_ref.tilt}°/${opt.fixed_ref.azimuth}° array (${fmt(opt.fixed_ref.energy_mwh)} MWh). A tilt × azimuth sweep does not apply to trackers.`;
    renderOrientationMap(d);
  } else {
    $("kpis").innerHTML = [
      kpi("Optimum tilt", sw.optimum.tilt, "°", true),
      sw.optimum.azimuth_defined
        ? kpi("Optimum azimuth", sw.optimum.azimuth, "° "+azLabel(sw.optimum.azimuth), true)
        : kpi("Optimum azimuth", "N/A", "horizontal plane", true),
      kpi("Specific yield", fmt(k.specific_yield), "kWh/kWp"),
      kpi("Annual energy", fmt(k.energy_mwh), "MWh"),
      kpi("Modeled PR", k.performance_ratio, "%"),
      kpi("Capacity factor", k.capacity_factor, "%"),
    ].join("");

    // heatmap + cross sections + orientation (grid only)
    // the optimum may be refined to 1° off the coarse grid — use nearest grid cell
    CH.heatmap($("heatmap"), sw, $("metric").value, d.selected_detail);
    updateHeatCaption();
    const ti = nearestIdx(sw.tilts, sw.optimum.tilt);
    const ai = nearestIdx(sw.azimuths, sw.optimum.azimuth);
    const yVsTilt = sw.tilts.map((_,i)=>sw.specific_yield[i][ai]);
    const yVsAz   = sw.azimuths.map((_,j)=>sw.specific_yield[ti][j]);
    $("xsec_az").textContent = `at azimuth ${sw.azimuths[ai]}° (grid nearest the 1°-refined optimum)`;
    $("xsec_tilt").textContent = `at tilt ${sw.tilts[ti]}° (grid nearest the 1°-refined optimum)`;
    CH.line($("tilt_xsec"), sw.tilts, yVsTilt, {color:"#36d6b8", nofill:true,
      xtitle:"Tilt (°)", ytitle:"kWh/kWp", htpl:"Tilt %{x}° — %{y:.0f}",
      marker:{x:sw.tilts[ti],y:sw.specific_yield[ti][ai]}});
    CH.line($("az_xsec"), sw.azimuths, yVsAz, {color:"#4ea3ff", nofill:true,
      xtitle:"Azimuth (°)", ytitle:"kWh/kWp", htpl:"Az %{x}° — %{y:.0f}",
      marker:{x:sw.azimuths[ai],y:sw.specific_yield[ti][ai]}});
    renderOrientationMap(d);
  }

  // array arrangement visual
  renderArrayLayout(tracker ? (parseFloat($("max_angle").value)||60) : sw.optimum.tilt, tracker);

  // PVsyst-style chart suite
  CH.carpet($("carpet"), o.carpet);
  CH.monthly($("monthly"), o.monthly_mwh);
  CH.monthlyDual($("monthly_pr"), o.monthly_pr, o.monthly_yield);
  CH.ghiPoa($("ghi_poa"), o.monthly_ghi, o.poa_monthly);
  CH.waterfall($("waterfall"), o.waterfall);
  CH.duration($("duration"), o.duration);
  if(d.sun_path){ CH.sunpath($("sunpath"), d.sun_path);
    $("sun_sub").textContent = `lat ${d.sun_path.lat.toFixed(2)}°`; }
  CH.profile($("profile"), o.day_profile_kw);
  CH.ghi($("wx_chart"), d.weather_summary.ghi_monthly);
  $("wx_src_lbl").textContent = (d.weather_meta&&d.weather_meta.source)||"";

  // compare + makeup
  renderCompare(d);
  renderMakeup(d);

  // summary table, orientation explorer, electrical design + layout
  renderSummary(d);
  renderMainCalcSteps(d);
  if(!gridless) initExplorer(d);
  EL.renderElectrical(d);
  EL.renderLayout(d);
  INFRA.render(d);
  setTimeout(buildSectionNav, 260);
}

// ---------- "how this was calculated" step pack ----------
function renderMainCalcSteps(d){
  const el=$("main_calc_steps_body");
  if(!el) return;
  const steps=d.calculation_steps||[];
  if(!steps.length){ el.innerHTML="<p class='hint'>No step data for this run.</p>"; return; }
  el.innerHTML = steps.map(sec=>
    `<div class="calc-sec"><div class="sub3">${sec.title}</div><ul>`+
    sec.items.map(x=>`<li>${x}</li>`).join("")+`</ul></div>`).join("")+
    `<p class="hint">Written to be checkable by hand: every figure comes from this run's hourly simulation — nothing is a typical value.</p>`;
}

// ---------- long-term bankability (multi-year P50/P90 + degradation) ----------
function longtermPayload(){
  const opt=LAST.sweep.optimum, p=analyzePayload();
  return {
    location:p.location, panel:p.panel, plant:p.plant,
    tilt:(opt.tilt!=null?opt.tilt:0), azimuth:opt.azimuth_defined?opt.azimuth:180,
    start_year:parseInt($("lt_start").value)||2005, end_year:parseInt($("lt_end").value)||2020,
    model_uncertainty:(parseFloat($("lt_unc").value)||0)/100,
    lifetime_years:parseInt($("lt_life").value)||25,
    lid:parseFloat($("lt_lid").value)||0,
    degradation_rate:parseFloat($("lt_degr").value)||0,
    availability:parseFloat($("lt_avail").value)||100,
  };
}
async function computeLongterm(){
  if(!LAST){ toast("Run an analysis first."); return; }
  const btn=$("btn_longterm"); btn.disabled=true; btn.textContent="⏳ Computing… (downloads multi-year data)";
  try{
    const r=await fetch("/api/longterm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(longtermPayload())});
    const j=await r.json();
    if(!r.ok) throw new Error(Array.isArray(j.detail)?j.detail.map(x=>x.msg).join("; "):(j.detail||"failed"));
    LAST.longterm=j; renderLongterm(j);
    toast("✓ P50/P90 estimates computed over "+j.distribution.n_years+" years");
  }catch(err){ toast("Long-term failed: "+err.message); }
  finally{ btn.disabled=false; btn.textContent="▶ Compute (multi-year)"; }
}
function renderLongterm(j){
  const di=j.distribution, dg=j.degradation, lv=di.levels;
  $("lt_sub").textContent=`${di.n_years} years (${di.by_year[0].year}–${di.by_year[di.by_year.length-1].year}) · total CoV ${di.cov_total_pct}% · ${dg.years}-yr lifetime`;
  const card=(l,v,s,st)=>`<div class="ec ${st||""}"><div class="ec-l">${l}</div><div class="ec-v">${v}</div><div class="ec-s">${s||""}</div></div>`;
  const cards=[
    card("P50 estimate", fmt(lv.P50)+" MWh", j.specific_yield_p50+" kWh/kWp","ok"),
    card("P75", fmt(lv.P75)+" MWh"),
    card("P90 estimate", fmt(lv.P90)+" MWh", "90% exceedance probability","ok"),
    card("P99", fmt(lv.P99)+" MWh"),
    card("Interannual CoV", di.cov_interannual_pct+" %", `model ${di.cov_model_pct}% → total ${di.cov_total_pct}%`),
    card("Lifetime "+dg.years+" yr", fmt(dg.lifetime_mwh)+" MWh", `${dg.retention_pct}% retained · avg ${fmt(dg.avg_annual_mwh)}`),
  ];
  $("lt_body").innerHTML=
    `<div class="ec-cards lt-cards">${cards.join("")}</div>`+
    `<div class="grid-2"><div class="panelsub"><div class="sub3">Annual energy by year (P50 / P90 lines)</div><div id="lt_year_chart" class="plot sm"></div></div>`+
    `<div class="panelsub"><div class="sub3">Energy over project life (degradation)</div><div id="lt_degr_chart" class="plot sm"></div></div></div>`+
    `<div class="restable-wrap" id="lt_table_wrap"></div>`;
  CH.peryear($("lt_year_chart"), di);
  CH.degradation($("lt_degr_chart"), dg);
  const yrs=dg.table.filter(r=>r.year===1||r.year%5===0||r.year===dg.years);
  let t=`<table class="restable"><thead><tr><th>Project year</th><th>Performance %</th><th>Energy MWh</th><th>kWh/kWp</th></tr></thead><tbody>`;
  yrs.forEach(r=>t+=`<tr${r.year===1?' class="rowopt"':''}><td>${r.year}</td><td>${r.perf_pct}</td><td>${fmt(r.energy_mwh)}</td><td>${fmt(r.specific)}</td></tr>`);
  t+=`<tr class="rowopt"><td><b>Σ ${dg.years}-yr</b></td><td>—</td><td><b>${fmt(dg.lifetime_mwh)}</b></td><td>—</td></tr></tbody></table>`;
  $("lt_table_wrap").innerHTML=t;
}

// ---------- results summary table ----------
function renderSummary(d){
  const sw=d.sweep, o=d.optimum_detail.kpis, opt=sw.optimum;
  const tracker = sw.mounting==="sat";
  document.getElementById("summary_sub").textContent =
    `${$("site_name").value||(d.sun_path.lat.toFixed(3)+", "+parseFloat($("lon").value).toFixed(3))} · ${(d.weather_meta&&d.weather_meta.source)||""}`;
  const tr=(k,v,cls)=>`<tr><td>${k}</td><td class="v ${cls||""}">${v}</td></tr>`;
  if(tracker){
    let r="";
    r+=tr("Mounting","<b>Single-axis tracker (N–S)</b>","opt");
    r+=tr("Tracker gain vs fixed",`<b>+${opt.tracker_gain_pct}%</b>`,"opt");
    r+=tr("Specific yield",fmt(o.specific_yield)+" kWh/kWp");
    r+=tr("Annual energy",fmt(o.energy_mwh)+" MWh");
    r+=tr("Fixed reference",`${opt.fixed_ref.tilt}° / ${opt.fixed_ref.azimuth}° → ${fmt(opt.fixed_ref.energy_mwh)} MWh`,"you");
    r+=tr("Performance ratio",o.performance_ratio+" %");
    r+=tr("Capacity factor",o.capacity_factor+" %");
    r+=tr("POA irradiation",o.poa_insolation+" kWh/m²");
    document.getElementById("summary_table").innerHTML=`<table class="restable kv"><tbody>${r}</tbody></table>`;
    return;
  }
  if(sw.mode==="manual"){
    let r="";
    r+=tr("Analysis mode","<b>Fixed orientation (manual)</b>","you");
    r+=tr("Evaluated tilt",`<b>${opt.tilt}°</b>`,"opt");
    r+=tr("Evaluated azimuth",`<b>${opt.azimuth}° ${azLabel(opt.azimuth)}</b>`,"opt");
    r+=tr("Specific yield",fmt(o.specific_yield)+" kWh/kWp");
    r+=tr("Annual energy",fmt(o.energy_mwh)+" MWh");
    r+=tr("Performance ratio",o.performance_ratio+" %");
    r+=tr("Capacity factor",o.capacity_factor+" %");
    r+=tr("POA irradiation",o.poa_insolation+" kWh/m²");
    document.getElementById("summary_table").innerHTML=`<table class="restable kv"><tbody>${r}</tbody></table>`;
    return;
  }
  const azTxt = opt.azimuth_defined ? `${opt.azimuth}° ${azLabel(opt.azimuth)}` : "N/A (horizontal)";
  let rows="";
  rows+=tr("Optimum tilt",`<b>${opt.tilt}°</b>`,"opt");
  rows+=tr("Optimum azimuth",`<b>${azTxt}</b>`,"opt");
  rows+=tr("Specific yield",fmt(o.specific_yield)+" kWh/kWp");
  rows+=tr("Annual energy",fmt(o.energy_mwh)+" MWh");
  rows+=tr("Performance ratio",o.performance_ratio+" %");
  rows+=tr("Capacity factor",o.capacity_factor+" %");
  rows+=tr("POA irradiation",o.poa_insolation+" kWh/m²");
  if(d.selected_detail){
    const s=d.selected_detail, gain=(100*(o.specific_yield-s.kpis.specific_yield)/s.kpis.specific_yield).toFixed(1);
    rows+=tr(`Your design (${s.tilt}° / ${s.azimuth}°)`, fmt(s.kpis.specific_yield)+" kWh/kWp · "+fmt(s.kpis.energy_mwh)+" MWh","you");
    rows+=tr("Optimum vs your design",`+${gain}%`,"opt");
  }
  const main=`<table class="restable kv"><tbody>${rows}</tbody></table>`;
  const alts=topOrientations(sw,5);
  let at=`<table class="restable"><thead><tr><th>#</th><th>Tilt</th><th>Azimuth</th><th>kWh/kWp</th><th>MWh</th><th>vs opt</th></tr></thead><tbody>`;
  alts.forEach((r,i)=>{ at+=`<tr${i===0?' class="rowopt"':''}><td>${i+1}</td><td>${r.tilt}°</td><td>${r.azDefined?r.az+"° "+azLabel(r.az):"—"}</td><td>${fmt(r.sy)}</td><td>${fmt(r.e)}</td><td>${r.pct}</td></tr>`; });
  at+="</tbody></table>";
  document.getElementById("summary_table").innerHTML =
    `<div class="summary-grid"><div>${main}</div><div><div class="sub3">Best orientations ranked</div>${at}</div></div>`;
}
function topOrientations(sw,n){
  const out=[];
  for(let i=0;i<sw.tilts.length;i++) for(let j=0;j<sw.azimuths.length;j++)
    out.push({tilt:sw.tilts[i],az:sw.azimuths[j],sy:sw.specific_yield[i][j],e:sw.energy_mwh[i][j]});
  out.sort((a,b)=>b.e-a.e);
  const top=out.slice(0,n), best=top[0].e;
  top.forEach(r=>{ r.pct=(r.e===best?"—":((r.e-best)/best*100).toFixed(1)+"%"); r.azDefined=r.tilt>0.05; });
  return top;
}

// ---------- orientation explorer (client-side interpolation) ----------
let EX_LAST=null, EX_TIMER=null, EX_SEQ=0;
function initExplorer(d){
  const sw=d.sweep, t=$("ex_tilt"), a=$("ex_az");
  t.min=sw.tilts[0]; t.max=sw.tilts[sw.tilts.length-1];
  a.min=sw.azimuths[0]; a.max=sw.azimuths[sw.azimuths.length-1];
  t.value=sw.optimum.tilt; a.value=sw.optimum.azimuth;
  const upd=()=>updateExplorer(d);
  t.oninput=upd; a.oninput=upd; $("ex_ref").oninput=()=>renderExplorerTable(d);
  $("btn_save_scenario").onclick=saveScenario;
  $("btn_scen_csv").onclick=exportScenariosCSV;
  $("btn_scen_clear").onclick=()=>{SCENARIOS.length=0; persistScenarios(); renderScenarios();};
  loadScenarios(); renderScenarios();
  upd();
}
function updateExplorer(d){
  const t=parseFloat($("ex_tilt").value), a=parseFloat($("ex_az").value);
  $("ex_tilt_v").textContent=t+"°"; $("ex_az_v").textContent=a+"° "+azLabel(a);
  EX_LAST=null;                                   // exact result pending
  renderExplorerTable(d);                         // instant interpolated preview
  $("ex_status").textContent="evaluating exact model…";
  clearTimeout(EX_TIMER);
  EX_TIMER=setTimeout(async ()=>{
    const seq=++EX_SEQ;
    try{
      const p=analyzePayload();
      const body={location:p.location, weather:p.weather, panel:p.panel, plant:p.plant, tilt:t, azimuth:a};
      const r=await fetch("/api/evaluate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok) throw new Error(Array.isArray(j.detail)?j.detail.map(x=>x.msg).join("; "):(j.detail||"failed"));
      if(seq!==EX_SEQ) return;                    // stale response
      EX_LAST=j;
      $("ex_status").textContent=`exact model · ${j.tilt}° / ${j.azimuth}°`;
      renderExplorerTable(d);
      CH.exMonthly($("ex_monthly"), j.monthly_mwh, d.optimum_detail.monthly_mwh,
                   `${j.tilt}° / ${j.azimuth}° ${azLabel(j.azimuth)}`);
    }catch(err){ if(seq===EX_SEQ) $("ex_status").textContent="evaluation failed: "+err.message; }
  }, 350);
}
function renderExplorerTable(d){
  const sw=d.sweep;
  const t=parseFloat($("ex_tilt").value), a=parseFloat($("ex_az").value);
  const exact=EX_LAST && EX_LAST.tilt===t && EX_LAST.azimuth===a;
  const sy=exact?EX_LAST.kpis.specific_yield:interp2(sw,sw.specific_yield,t,a);
  const e=exact?EX_LAST.kpis.energy_mwh:interp2(sw,sw.energy_mwh,t,a);
  const tr=(k,v,cls)=>`<tr><td>${k}</td><td class="v ${cls||""}">${v}</td></tr>`;
  let rows="";
  rows+=tr(`Custom ${t}° / ${a}° ${azLabel(a)}`,
    `<b>${fmt(sy)} kWh/kWp · ${fmt(e)} MWh</b> <span class="muted-tag">${exact?"exact model":"interpolated…"}</span>`,"you");
  if(exact){
    rows+=tr("Performance ratio", EX_LAST.kpis.performance_ratio+" %");
    rows+=tr("POA irradiation", fmt(EX_LAST.kpis.poa_insolation)+" kWh/m²");
  }
  rows+=tr("vs optimum", pctTxt(e, sw.optimum.energy_mwh));
  if(d.selected_detail) rows+=tr(`vs your design (${d.selected_detail.tilt}°/${d.selected_detail.azimuth}°)`, pctTxt(e, d.selected_detail.kpis.energy_mwh));
  const ref=parseFloat($("ex_ref").value);
  if(isFinite(ref)&&ref>0) rows+=tr(`vs previous prediction (${fmt(ref)} MWh)`, pctTxt(e, ref));
  document.getElementById("explorer_table").innerHTML=`<table class="restable kv"><tbody>${rows}</tbody></table>`;
}

// ---------- saved scenarios (up to 10, persisted, compared vs optimum) ----------
const SCENARIOS=[];
function saveScenario(){
  if(!EX_LAST){ toast("Wait for the exact evaluation to finish, then save."); return; }
  if(SCENARIOS.length>=10){ toast("Maximum 10 scenarios — delete one first."); return; }
  if(SCENARIOS.some(s=>s.tilt===EX_LAST.tilt && s.azimuth===EX_LAST.azimuth)){
    toast("This orientation is already saved."); return; }
  SCENARIOS.push({
    tilt:EX_LAST.tilt, azimuth:EX_LAST.azimuth,
    energy_mwh:EX_LAST.kpis.energy_mwh, specific_yield:EX_LAST.kpis.specific_yield,
    performance_ratio:EX_LAST.kpis.performance_ratio, poa:EX_LAST.kpis.poa_insolation,
    monthly_mwh:EX_LAST.monthly_mwh,
    site:$("site_name").value||"", saved:new Date().toISOString().slice(0,16).replace("T"," "),
  });
  persistScenarios(); renderScenarios();
  toast(`✓ Saved scenario ${SCENARIOS.length}/10 (${EX_LAST.tilt}° / ${EX_LAST.azimuth}°)`);
}
function renderScenarios(){
  const el=document.getElementById("scenarios_table");
  $("scen_sub").textContent=`${SCENARIOS.length}/10 saved`;
  if(!SCENARIOS.length){
    el.innerHTML=`<p class="hint">Move the sliders, then click “Save scenario” — each saved orientation is kept here side-by-side with the app-calculated optimum (up to 10, kept after reload).</p>`;
    return;
  }
  const opt=LAST&&LAST.sweep&&LAST.sweep.optimum, ok=LAST&&LAST.optimum_detail;
  const MON=CH.MONTHS;
  let h=`<table class="restable"><thead><tr><th>#</th><th>Tilt</th><th>Azimuth</th><th>MWh/yr</th><th>kWh/kWp</th><th>PR %</th><th>Δ vs optimum</th>${MON.map(m=>`<th>${m}</th>`).join("")}<th></th></tr></thead><tbody>`;
  if(opt&&ok){
    const k=LAST.optimum_detail.kpis;
    h+=`<tr class="rowopt"><td>★</td><td>${opt.tilt!=null?opt.tilt+"°":"tracker"}</td><td>${opt.azimuth_defined?opt.azimuth+"° "+azLabel(opt.azimuth):"—"}</td>`+
       `<td><b>${fmt(k.energy_mwh)}</b></td><td>${fmt(k.specific_yield)}</td><td>${k.performance_ratio}</td><td>—</td>`+
       LAST.optimum_detail.monthly_mwh.map(v=>`<td>${Math.round(v)}</td>`).join("")+`<td></td></tr>`;
  }
  SCENARIOS.forEach((s,i)=>{
    const base=ok?LAST.optimum_detail.kpis.energy_mwh:null;
    h+=`<tr><td>${i+1}</td><td>${s.tilt}°</td><td>${s.azimuth}° ${azLabel(s.azimuth)}</td>`+
       `<td><b>${fmt(s.energy_mwh)}</b></td><td>${fmt(s.specific_yield)}</td><td>${s.performance_ratio}</td>`+
       `<td>${base?pctTxt(s.energy_mwh,base):"—"}</td>`+
       s.monthly_mwh.map(v=>`<td>${Math.round(v)}</td>`).join("")+
       `<td><button class="btn-mini" onclick="deleteScenario(${i})">✕</button></td></tr>`;
  });
  el.innerHTML=h+"</tbody></table>";
}
function deleteScenario(i){ SCENARIOS.splice(i,1); persistScenarios(); renderScenarios(); }
function persistScenarios(){ try{ localStorage.setItem("syo_scenarios", JSON.stringify(SCENARIOS)); }catch(e){} }
function loadScenarios(){
  try{ const s=JSON.parse(localStorage.getItem("syo_scenarios")||"[]");
    SCENARIOS.length=0; s.slice(0,10).forEach(x=>SCENARIOS.push(x)); }catch(e){}
}
function exportScenariosCSV(){
  if(!SCENARIOS.length){ toast("No saved scenarios yet."); return; }
  const MON=CH.MONTHS, L=[];
  L.push("# Solar Yield Optimizer - orientation scenarios vs optimum");
  L.push(`# Site,${$("site_name").value||""}`);
  L.push(["Case","Tilt_deg","Azimuth_deg","Energy_MWh","kWh_per_kWp","PR_pct","POA_kWh_m2",...MON.map(m=>m+"_MWh")].join(","));
  if(LAST&&LAST.optimum_detail){
    const k=LAST.optimum_detail.kpis, o=LAST.sweep.optimum;
    L.push(["OPTIMUM",o.tilt!=null?o.tilt:"tracker",o.azimuth_defined?o.azimuth:"",k.energy_mwh,k.specific_yield,k.performance_ratio,k.poa_insolation,
            ...LAST.optimum_detail.monthly_mwh.map(v=>v.toFixed(1))].join(","));
  }
  SCENARIOS.forEach((s,i)=>L.push([`S${i+1}`,s.tilt,s.azimuth,s.energy_mwh,s.specific_yield,s.performance_ratio,s.poa,
            ...s.monthly_mwh.map(v=>v.toFixed(1))].join(",")));
  const b=new Blob([L.join("\n")],{type:"text/csv"}); const u=URL.createObjectURL(b);
  const a=document.createElement("a"); a.href=u; a.download="orientation_scenarios.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function pctTxt(v,base){
  if(!isFinite(base)||base<=0) return "—";
  const p=(v-base)/base*100; const cls=p>=0?"good":"bad";
  return `<span class="delta ${cls}">${p>=0?"+":""}${p.toFixed(1)}%</span>`;
}
function interp2(sw,grid,t,a){
  const T=sw.tilts, A=sw.azimuths;
  const [i0,i1]=bracket(T,t), [j0,j1]=bracket(A,a);
  const ft=(T[i1]===T[i0])?0:(t-T[i0])/(T[i1]-T[i0]);
  const fa=(A[j1]===A[j0])?0:(a-A[j0])/(A[j1]-A[j0]);
  return grid[i0][j0]*(1-ft)*(1-fa)+grid[i1][j0]*ft*(1-fa)+grid[i0][j1]*(1-ft)*fa+grid[i1][j1]*ft*fa;
}
function bracket(arr,x){
  if(arr.length<2) return [0,0];
  if(x<=arr[0]) return [0,1];
  if(x>=arr[arr.length-1]) return [arr.length-2,arr.length-1];
  let i=0; while(i<arr.length-1 && arr[i+1]<x) i++; return [i,i+1];
}

function renderArrayLayout(tilt, tracker=false){
  const g=geomParams(); g.tilt=tilt;
  $("array_svg").innerHTML = LAYOUT.arrayView(g);
  $("module_svg").innerHTML = LAYOUT.moduleView(g);
  $("layout_sub").textContent = tracker
    ? `${g.modules_per_row}-up ${g.orientation} · illustrative ${tilt}° maximum-angle position · axis height ${g.height.toFixed(2)} m · GCR ${g.gcr.toFixed(2)}`
    : `${g.modules_per_row}-up ${g.orientation} · tilt ${tilt}° · pitch ${g.pitch.toFixed(2)} m · GCR ${g.gcr.toFixed(2)}`;
}

let RESULT_MAP=null, RESULT_LAYER=null;
function renderOrientationMap(d){
  const lat=d.sun_path.lat, lon=parseFloat($("lon").value);
  if(!RESULT_MAP){
    RESULT_MAP=L.map("orientation_map",{zoomControl:true,attributionControl:true}).setView([lat,lon],18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(RESULT_MAP);
    L.control.scale({imperial:false}).addTo(RESULT_MAP);
  }
  RESULT_MAP.setView([lat,lon],18);
  if(RESULT_LAYER) RESULT_LAYER.remove();
  RESULT_LAYER=L.layerGroup().addTo(RESULT_MAP);
  L.circleMarker([lat,lon],{radius:5,color:"#fff",weight:2,fillColor:"#ffb12b",fillOpacity:1})
    .bindTooltip("Selected site").addTo(RESULT_LAYER);

  const tracker=d.sweep.mounting==="sat";
  const opt=d.sweep.optimum;
  if(tracker){
    drawTrackerOverlay(lat,lon,RESULT_LAYER);
  }else if(opt.azimuth_defined){
    drawOrientationOverlay(lat,lon,opt.azimuth,opt.tilt,"#ffb12b",false,"Optimum",RESULT_LAYER);
  }else{
    L.circle([lat,lon],{radius:46,color:"#ffb12b",weight:3,fillColor:"#ffb12b",fillOpacity:0.14})
      .bindTooltip("Optimum: horizontal plane; azimuth is not applicable",{permanent:true,direction:"right"})
      .addTo(RESULT_LAYER);
  }
  if(!tracker && d.selected_detail){
    drawOrientationOverlay(lat,lon,d.selected_detail.azimuth,d.selected_detail.tilt,
      "#4ea3ff",true,"Design",RESULT_LAYER);
  }
  if(tracker){
    const maxAngle=parseFloat($("max_angle").value)||60;
    $("azimuth_compass").innerHTML =
      `<div class="horizontal-result"><b>Single-axis tracker</b><span>N–S axis · ±${maxAngle}° rotation</span>`+
      `<p>Axis bearing is 0°/180°. Module tilt and facing azimuth vary continuously toward east or west as the tracker follows the sun.</p></div>`;
    $("orientation_sub").textContent =
      `${$("site_name").value||`${lat.toFixed(4)}, ${lon.toFixed(4)}`} · N–S tracker axis · ±${maxAngle}°`;
    $("legend_opt_label").textContent="Tracker row / axis bearing";
    $("legend_design").style.display="none";
  }else{
    $("azimuth_compass").innerHTML=opt.azimuth_defined
      ? LAYOUT.azimuthCompass({azimuth:opt.azimuth,lat,tilt:opt.tilt})
      : `<div class="horizontal-result"><b>Horizontal optimum</b><span>Tilt ${opt.tilt}°</span><p>A horizontal plane has no facing azimuth.</p></div>`;
    $("orientation_sub").textContent =
      `${$("site_name").value||`${lat.toFixed(4)}, ${lon.toFixed(4)}`} · optimum ${opt.tilt}° tilt`+
      (opt.azimuth_defined?` / ${opt.azimuth}° ${azLabel(opt.azimuth)}`:" / azimuth N/A");
    $("legend_opt_label").textContent="Optimum facing / row bearing";
    $("legend_design").style.display="";
  }
  setTimeout(()=>RESULT_MAP.invalidateSize(),100);
}

function drawTrackerOverlay(lat,lon,layer){
  const rowHalf=60, rowSpacing=12;
  for(let i=-2;i<=2;i++){
    const center=destinationPoint(lat,lon,90,i*rowSpacing);
    const north=destinationPoint(center.lat,center.lon,0,rowHalf);
    const south=destinationPoint(center.lat,center.lon,180,rowHalf);
    L.polyline([[south.lat,south.lon],[north.lat,north.lon]],{
      color:"#ffb12b",weight:i===0?5:3,opacity:i===0?0.95:0.62
    }).addTo(layer);
  }
  const labelPoint=destinationPoint(lat,lon,0,76);
  const icon=L.divIcon({
    className:"",
    html:`<div class="orientation-label">Tracker axis: 0°/180° N–S</div>`,
    iconAnchor:[0,-8],
  });
  L.marker([labelPoint.lat,labelPoint.lon],{icon,interactive:false}).addTo(layer);
}

function drawOrientationOverlay(lat,lon,azimuth,tilt,color,dashed,label,layer){
  const rowBearing=(azimuth+90)%360;
  const rowHalf=55, rowSpacing=12;
  const dashArray=dashed?"8 7":null;
  for(let i=-2;i<=2;i++){
    const center=destinationPoint(lat,lon,azimuth,i*rowSpacing);
    const a=destinationPoint(center.lat,center.lon,rowBearing+180,rowHalf);
    const b=destinationPoint(center.lat,center.lon,rowBearing,rowHalf);
    L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{
      color,weight:i===0?5:3,opacity:i===0?0.95:0.62,dashArray
    }).addTo(layer);
  }
  const arrowEnd=destinationPoint(lat,lon,azimuth,82);
  L.polyline([[lat,lon],[arrowEnd.lat,arrowEnd.lon]],{color,weight:4,dashArray}).addTo(layer);
  [azimuth+155,azimuth-155].forEach(bearing=>{
    const wing=destinationPoint(arrowEnd.lat,arrowEnd.lon,bearing,14);
    L.polyline([[arrowEnd.lat,arrowEnd.lon],[wing.lat,wing.lon]],{color,weight:4}).addTo(layer);
  });
  const icon=L.divIcon({
    className:"",
    html:`<div class="orientation-label ${dashed?"design":""}">${label}: ${tilt}° tilt · ${azimuth}° ${azLabel(azimuth)}</div>`,
    iconAnchor:[0,-8],
  });
  L.marker([arrowEnd.lat,arrowEnd.lon],{icon,interactive:false}).addTo(layer);
}

function destinationPoint(lat,lon,bearing,distanceM){
  const R=6371008.8, d=distanceM/R, br=bearing*Math.PI/180;
  const p1=lat*Math.PI/180, l1=lon*Math.PI/180;
  const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(br));
  const l2=l1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));
  return {lat:p2*180/Math.PI,lon:((l2*180/Math.PI+540)%360)-180};
}

function updateHeatCaption(){
  if(!LAST || !LAST.sweep || !LAST.sweep.tilts) return;   // no grid in manual/tracker runs
  const sw=LAST.sweep, z=$("metric").value==="energy_mwh"?sw.energy_mwh:sw.specific_yield;
  let mn=Infinity,mx=-Infinity;
  z.forEach(r=>r.forEach(v=>{mn=Math.min(mn,v);mx=Math.max(mx,v);}));
  const unit=$("metric").value==="energy_mwh"?"MWh":"kWh/kWp";
  const spread=(100*(mx-mn)/mx).toFixed(1);
  $("heatmap_caption").textContent =
    `Optimum ★ at tilt ${sw.optimum.tilt}°`+
    (sw.optimum.azimuth_defined?`, azimuth ${sw.optimum.azimuth}° (${azLabel(sw.optimum.azimuth)})`:", azimuth N/A for a horizontal plane")+
    (sw.refined_resolution_deg?` — locally refined in ${sw.refined_resolution_deg}° steps plus fractional bounded edges`:"")+". "+
    `Range across the grid: ${fmt(mn)}–${fmt(mx)} ${unit} (${spread}% spread). Contour lines show equal-yield orientations.`;
}

function renderCompare(d){
  const sw=d.sweep, oy=d.optimum_detail.kpis;
  const design=d.selected_detail;
  if(!design){ $("compare").innerHTML="<p class='hint'>Enter a current design tilt and azimuth to compare.</p>"; return; }
  const dy=design.kpis;
  const rows=[`<div class="cmp-row head"><span>Metric</span><span>Optimum</span><span>Design ${design.tilt}° / ${design.azimuth}°</span></div>`];
  const dPct=(100*(oy.specific_yield-dy.specific_yield)/dy.specific_yield).toFixed(1);
  rows.push(cmp("Specific yield (kWh/kWp)", oy.specific_yield, dy.specific_yield));
  rows.push(cmp("Annual energy (MWh)", oy.energy_mwh, dy.energy_mwh));
  rows.push(`<div class="cmp-row"><span>Gain vs. design</span><span class="v opt">+${dPct}%</span><span class="v">—</span></div>`);
  $("compare").innerHTML = rows.join("");
}
function cmp(label, opt, you){
  const up = opt>=you;
  return `<div class="cmp-row"><span>${label}</span>
    <span class="v opt">${fmt(opt)}</span>
    <span class="v you">${fmt(you)}</span></div>`;
}
function renderMakeup(d){
  const m=d.derived, k=d.optimum_detail.kpis;
  $("makeup").innerHTML = [
    mk("Approx. modules", m.n_panels.toLocaleString()),
    mk("DC/AC ratio", m.ilr),
    mk("Row pitch", m.pitch_m+" m"),
    mk("System derates", m.dc_loss_pct+" %"),
    mk("POA irradiation", k.poa_insolation+" kWh/m²"),
    mk("Mean cell temp", k.mean_cell_temp+" °C"),
    mk("Clipping loss", k.clipping_loss_pct+" %"),
    mk("Bifacial irradiance gain", m.bifacial?k.bifacial_gain_pct+" %":"off"),
    mk("Horizon model", horizonStatus(d)),
    mk(m.inverter_count_source==="manual"?"Selected inverter units":"Inverter units", m.inverter_count?m.inverter_count+" ("+m.inverter_ac_mw+" MW nominal)":"custom aggregate"),
  ].join("");
}
function horizonStatus(d){
  const mi=d.model_info||{};
  if(mi.horizon_applied) return "applied";
  if(mi.horizon_requested) return "requested, unavailable";
  return "off";
}

// ---------- tiny ui helpers ----------
function kpi(l,v,u,accent){ return `<div class="kpi ${accent?"accent":""}"><div class="k-l">${l}</div><div class="k-v">${v}<span class="k-u"> ${u||""}</span></div></div>`; }
function mk(l,v){ return `<div class="mk"><div class="ml">${l}</div><div class="mv">${v}</div></div>`; }
function fmt(v){ return (typeof v==="number")? v.toLocaleString(undefined,{maximumFractionDigits:0}) : v; }
function azLabel(a){ const d=["N","NE","E","SE","S","SW","W","NW","N"]; return d[Math.round(a/45)]; }
function nearestIdx(arr,t){ let bi=0,bd=Infinity; arr.forEach((v,i)=>{const dd=Math.abs(v-t); if(dd<bd){bd=dd;bi=i;}}); return bi; }
function toast(msg, kind){
  // kind is optional; otherwise infer from the message so success never looks like an error
  if(!kind){
    if(/^✓|complete|saved|loaded|copied|success/i.test(msg)) kind="ok";
    else if(/fail|error|cannot|can't|unable|invalid|not reach/i.test(msg)) kind="err";
    else if(/wait|maximum|already|no |warn/i.test(msg)) kind="warn";
    else kind="info";
  }
  const t=document.createElement("div");
  t.className="toast "+kind;
  const body=document.createElement("div"); body.textContent=msg;
  t.appendChild(body);
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.transition="opacity .3s,transform .3s";
    t.style.opacity="0"; t.style.transform="translate(-50%,10px)";
    setTimeout(()=>t.remove(),320); }, kind==="err"?6500:4200);
}

// ---------- floating section navigator ----------
function buildSectionNav(){
  const main=document.querySelector(".main");
  const res=$("results");
  if(!main||!res) return;
  document.querySelectorAll(".secnav").forEach(n=>n.remove());
  const panels=[...res.querySelectorAll(":scope > .panel, :scope > .grid-2, :scope > .grid-main")]
    .filter(p=>p.offsetParent!==null);
  if(panels.length<3) return;
  const nav=document.createElement("nav");
  nav.className="secnav";
  const links=[];
  panels.forEach((p,i)=>{
    const h=p.querySelector("h3");
    let label=h?h.textContent.trim():`Section ${i+1}`;
    label=label.replace(/\s*—.*$/,"").replace(/\s+/g," ").slice(0,34);
    if(!p.id) p.id="sec_"+i;
    const a=document.createElement("a");
    a.href="#"+p.id;
    a.innerHTML=`<i></i><span>${label}</span>`;
    a.onclick=e=>{ e.preventDefault();
      main.scrollTo({top:p.offsetTop-72, behavior:"smooth"}); };
    nav.appendChild(a); links.push({a,p});
  });
  document.body.appendChild(nav);
  // Cache offsets so the scroll handler is pure math (no layout reads, no rAF —
  // rAF is throttled in background tabs and would freeze the indicator).
  let tops=[];
  const measure=()=>{ tops=links.map(l=>l.p.offsetTop); };
  let last=-1;
  const sync=()=>{
    const y=main.scrollTop+140;
    let active=0;
    for(let i=0;i<tops.length;i++) if(tops[i]<=y) active=i;
    if(active===last) return;
    last=active;
    links.forEach((l,i)=>l.a.classList.toggle("on", i===active));
  };
  measure(); sync();
  main.addEventListener("scroll", sync, {passive:true});
  window.addEventListener("resize", ()=>{ measure(); last=-1; sync(); });
  // charts/maps settle after render and shift offsets — re-measure shortly after
  setTimeout(()=>{ measure(); last=-1; sync(); }, 900);
}
function clearSectionNav(){ document.querySelectorAll(".secnav").forEach(n=>n.remove()); }
function copySummary(){
  const el=document.getElementById("summary_table");
  if(!el||!el.innerText){ toast("Run an analysis first."); return; }
  const text=[...el.querySelectorAll("tr")].map(r=>[...r.children].map(c=>c.innerText.trim()).join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(()=>toast("✓ Summary copied to clipboard"),()=>toast("Copy failed"));
}
