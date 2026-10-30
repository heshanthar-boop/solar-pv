/* ===== Sri Lanka solar atlas tab ===== */
const ATLAS = (() => {
  const E = id => document.getElementById(id);
  const FONT = {family:"Segoe UI,Roboto,sans-serif", color:"#aabfda", size:11};
  const PLOT = {
    paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
    font:FONT, margin:{l:48,r:14,t:10,b:36},
    xaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
    yaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
  };
  const CFG = {displayModeBar:false, responsive:true};
  const clone = o => JSON.parse(JSON.stringify(o));
  let MAPA = null, LAYER = null, DATA = null, POLL = null;

  function init(){
    const tb = E("tab_atlas");
    if(!tb) return;
    tb.onclick = show;
    E("atlas_start").onclick = start;
    E("atlas_stop").onclick = stop;
    E("atlas_metric").onchange = () => draw();
    E("atlas_search_btn").onclick = search;
    E("atlas_search").addEventListener("keydown", e => { if(e.key === "Enter") search(); });
    refresh(true);
  }

  function show(){
    ["empty","results","eastwest_tab"].forEach(id=>{const el=E(id); if(el) el.style.display="none";});
    if(typeof clearSectionNav === "function") clearSectionNav();
    E("atlas_tab").style.display = "block";
    document.querySelectorAll(".view-tab").forEach(b=>b.classList.remove("active"));
    E("tab_atlas").classList.add("active");
    if(!MAPA) initMap();
    setTimeout(()=>{ if(MAPA) MAPA.invalidateSize(); }, 120);
    refresh(true);
  }
  function hideFromOthers(){       // called by the other tabs via patched showTab
    E("atlas_tab").style.display = "none";
    E("tab_atlas").classList.remove("active");
  }

  function initMap(){
    MAPA = L.map("atlas_map", {zoomControl:true, attributionControl:true})
            .setView([7.87, 80.77], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {maxZoom:15, attribution:"© OpenStreetMap"}).addTo(MAPA);
    L.control.scale({imperial:false}).addTo(MAPA);
    MAPA.on("click", e => openDetail(e.latlng.lat, e.latlng.lng));
  }

  // ---------- build control ----------
  async function start(){
    const res = parseFloat(E("atlas_res").value);
    try{
      const r = await fetch("/api/atlas/start", {method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({resolution: res})});
      const j = await r.json();
      if(!r.ok) throw new Error(j.detail || "failed");
      toast("Atlas build running — it keeps going while you use the app, and resumes if stopped.");
      refresh(true);
    }catch(err){ toast("Atlas start failed: " + err.message); }
  }
  async function stop(){
    await fetch("/api/atlas/stop", {method:"POST"});
    refresh(true);
  }

  async function refresh(withData){
    try{
      const s = await (await fetch("/api/atlas/status")).json();
      const pct = s.total ? Math.round(100*s.done/s.total) : 0;
      E("atlas_progress").textContent =
        `${s.done} / ${s.total} cells (${pct}%) at ${s.resolution}°` +
        (s.running ? ` · computing ${s.current||"…"}` : " · paused") +
        (s.errors ? ` · ${s.errors} cells failed (will retry on next start)` : "");
      E("atlas_start").style.display = s.running ? "none" : "";
      E("atlas_stop").style.display = s.running ? "" : "none";
      E("atlas_res").disabled = s.running;
      if(withData || s.running){
        const d = await (await fetch("/api/atlas/data")).json();
        DATA = d;
        E("atlas_assumptions").textContent = "Reference system: " + d.assumptions +
          ` · weather resolution ≈ 5 km (PVGIS SARAH) — each cell shows its nearest satellite data.`;
        draw();
      }
      clearTimeout(POLL);
      if(s.running || E("atlas_tab").style.display !== "none")
        POLL = setTimeout(()=>refresh(s.running), s.running ? 5000 : 30000);
    }catch(e){ /* server briefly busy */ }
  }

  // ---------- grid drawing ----------
  const RAMP = [[0,"#0b2545"],[0.4,"#1d6fb8"],[0.65,"#3ee0c0"],[0.85,"#ffd166"],[1,"#ff9416"]];
  function rampColor(f){
    f = Math.max(0, Math.min(1, f));
    for(let i=1;i<RAMP.length;i++){
      if(f <= RAMP[i][0]){
        const [f0,c0] = RAMP[i-1], [f1,c1] = RAMP[i];
        const t = (f - f0) / (f1 - f0 || 1);
        const p = h => parseInt(h,16);
        const mix = (a,b) => Math.round(p(a)+(p(b)-p(a))*t).toString(16).padStart(2,"0");
        return "#"+mix(c0.slice(1,3),c1.slice(1,3))+mix(c0.slice(3,5),c1.slice(3,5))+mix(c0.slice(5,7),c1.slice(5,7));
      }
    }
    return RAMP[RAMP.length-1][1];
  }

  function metricOf(c){
    const m = E("atlas_metric").value;
    return m==="syd" ? c.syd : m==="gain" ? c.gain : m==="ghi" ? c.ghi : c.sy1;
  }

  function draw(){
    if(!MAPA || !DATA || !DATA.cells.length){ if(E("atlas_legend")) E("atlas_legend").innerHTML=""; return; }
    if(LAYER) LAYER.remove();
    LAYER = L.layerGroup().addTo(MAPA);
    const vals = DATA.cells.map(metricOf);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const half = DATA.resolution / 2;
    DATA.cells.forEach(c=>{
      const v = metricOf(c);
      const f = mx>mn ? (v-mn)/(mx-mn) : 0.5;
      L.rectangle([[c.lat-half, c.lon-half],[c.lat+half, c.lon+half]], {
        color: rampColor(f), weight: 0.4, fillColor: rampColor(f), fillOpacity: 0.55,
      }).bindTooltip(
        `${v.toLocaleString()} ${unit()} · single ${c.t1}°/${c.a1}° · E-W ${c.td}°/${c.aed}°`,
        {sticky:true}
      ).on("click", ()=>openDetail(c.lat, c.lon)).addTo(LAYER);
    });
    const m = E("atlas_metric").value;
    E("atlas_legend").innerHTML =
      `<span>${mn.toLocaleString()} ${unit()}</span>`+
      `<span class="atlas-grad"></span>`+
      `<span>${mx.toLocaleString()} ${unit()}</span>`+
      `<span style="margin-left:14px;color:var(--ink3)">${DATA.count} cells computed · click any cell for details</span>`;
  }
  function unit(){
    const m = E("atlas_metric").value;
    return m==="gain" ? "% E-W vs single" : m==="ghi" ? "kWh/m² GHI" : "kWh/kWp";
  }

  // ---------- cell detail ----------
  async function openDetail(lat, lon){
    try{
      const r = await fetch(`/api/atlas/cell?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
      const j = await r.json();
      if(!r.ok) throw new Error(j.detail || "no data");
      const s = j.single, d = j.dual;
      E("atlas_detail").style.display = "block";
      E("atlas_detail_body").innerHTML =
        `<div class="kpi-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
          <div class="kpi accent"><div class="k-l">Cell</div><div class="k-v" style="font-size:15px">${j.lat.toFixed(2)}, ${j.lon.toFixed(2)}<span class="k-u"> (${j.distance_km} km away)</span></div></div>
          <div class="kpi"><div class="k-l">Best single plane</div><div class="k-v" style="font-size:15px">${s.tilt}° / ${s.azimuth}°<span class="k-u"> ${fmtNum(s.sy)} kWh/kWp</span></div></div>
          <div class="kpi"><div class="k-l">Best East-West</div><div class="k-v" style="font-size:15px">${d.tilt}° / ${d.azimuth_east}°+${d.azimuth_west}°<span class="k-u"> ${fmtNum(d.sy)} kWh/kWp (${j.dual_vs_single_pct>=0?"+":""}${j.dual_vs_single_pct}%)</span></div></div>
        </div>
        <div id="atlas_cell_chart" class="plot sm"></div>
        <p class="hint">GHI ${fmtNum(j.ghi)} kWh/m² · mean air ${j.temp_mean} °C · wind ${j.wind_mean} m/s · computed ${j.computed}.
          Values are for the reference 1 MW system — your plant scales proportionally.
          <button class="btn-mini" onclick="ATLAS.designHere(${j.lat},${j.lon})">Open in designer</button>
          <button class="btn-mini" style="background:rgba(255,177,43,.15);border-color:#5a4a1f;color:var(--amber)"
            onclick="ATLAS.designHere(${j.lat},${j.lon},true)">▶ Run the FULL simulation here</button></p>`;
      const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      Plotly.newPlot(E("atlas_cell_chart"), [
        {type:"bar", x:MON, y:s.monthly, name:`Single ${s.tilt}°/${s.azimuth}°`, marker:{color:"#3ee0c0"},
         hovertemplate:"%{x}: %{y:.0f} kWh/kWp<extra>single</extra>"},
        {type:"bar", x:MON, y:d.monthly, name:`E-W ${d.tilt}°`, marker:{color:"#ffb838"},
         hovertemplate:"%{x}: %{y:.0f} kWh/kWp<extra>E-W</extra>"},
      ], Object.assign(clone(PLOT), {barmode:"group",
        yaxis:Object.assign(clone(PLOT).yaxis,{title:{text:"kWh/kWp per month",font:FONT}}),
        legend:{orientation:"h",y:1.18,font:FONT}}), CFG);
    }catch(err){ toast("Atlas: " + err.message); }
  }

  function fmtNum(v){ return (typeof v==="number") ? v.toLocaleString(undefined,{maximumFractionDigits:0}) : v; }

  // ---------- place search: local town list first, OSM Nominatim fallback ----------
  let SEARCH_PIN = null;
  async function search(){
    const q = (E("atlas_search").value || "").trim();
    if(!q){ toast("Type a place name to search."); return; }
    let hit = null;
    if(typeof SL_LOCATIONS !== "undefined"){
      const ql = q.toLowerCase();
      const m = SL_LOCATIONS.find(r => r[1].toLowerCase() === ql)
             || SL_LOCATIONS.find(r => r[1].toLowerCase().startsWith(ql))
             || SL_LOCATIONS.find(r => r[1].toLowerCase().includes(ql));
      if(m) hit = {lat: m[2], lon: m[3], name: m[1] + " (" + m[0] + " Province)"};
    }
    if(!hit){
      try{
        const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=lk&q="
                              + encodeURIComponent(q), {headers:{"Accept":"application/json"}});
        const j = await r.json();
        if(j && j.length) hit = {lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon),
                                 name: (j[0].display_name || q).split(",").slice(0,2).join(",")};
      }catch(e){ /* offline — local list only */ }
    }
    if(!hit){ toast(`No place found for “${q}” — try a nearby town name.`); return; }
    if(!MAPA) initMap();
    MAPA.setView([hit.lat, hit.lon], 12);
    if(SEARCH_PIN) SEARCH_PIN.remove();
    SEARCH_PIN = L.marker([hit.lat, hit.lon]).addTo(MAPA)
      .bindTooltip(hit.name, {permanent:true, direction:"top"});
    openDetail(hit.lat, hit.lon);
  }

  function designHere(lat, lon, autorun){
    document.getElementById("lat").value = lat.toFixed(4);
    document.getElementById("lon").value = lon.toFixed(4);
    const sq = (E("atlas_search")||{}).value;
    if(sq && !document.getElementById("site_name").value)
      document.getElementById("site_name").value = sq;
    if(typeof syncMarker === "function") syncMarker();
    document.getElementById("tab_single").click();
    if(autorun){
      document.getElementById("btn_run").click();
      toast("Full simulation started for this location — results in ~15–30 s.");
    }else{
      toast("Location loaded into the designer — press ▶ Run analysis.");
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {show, hideFromOthers, designHere};
})();
