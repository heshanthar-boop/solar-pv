/* ===== Balance of plant: land area, transformers, site-boundary drawing ===== */
const INFRA = (() => {
  let BMAP=null, BLK=null, BND=null, REQ_HA=0, AUTO_SITE=null, drawing=false, pts=[];
  const fmt = v => (typeof v==="number") ? v.toLocaleString(undefined,{maximumFractionDigits:0}) : v;

  function render(d){
    if(!d.infra){ document.getElementById("infra_body").innerHTML=""; return; }
    const land=d.infra.land, tx=d.infra.transformer;
    document.getElementById("infra_sub").textContent =
      `min ${land.total_ha} ha (${land.total_acre} ac) · ${land.land_use_ha_per_mwdc} ha/MWdc · ${tx.recommended.units}×${tx.recommended.rating_mva} MVA`;

    // ---- land schedule ----
    const rows = land.schedule.map(s=>`<tr><td>${s.item}</td><td>${fmt(s.m2)}</td><td>${s.ha}</td></tr>`).join("");
    const landTbl =
      `<table class="restable"><thead><tr><th>Land component</th><th>m²</th><th>ha</th></tr></thead><tbody>${rows}
        <tr class="rowopt"><td><b>Minimum project land</b></td><td><b>${fmt(land.total_m2)}</b></td><td><b>${land.total_ha}</b></td></tr>
      </tbody></table>
      <p class="hint">≈ <b>${land.total_acre} acres</b> · land-use <b>${land.land_use_ha_per_mwdc} ha/MWdc</b> (${land.land_use_acre_per_mwdc} ac/MWdc). Benchmark: ${land.benchmark}. Includes the 33 kV switchyard, step-up transformers and control room.</p>`;

    // ---- transformer scheme ----
    const r=tx.recommended;
    const altTxt = tx.alternatives.map(a=>`${a.units}×${a.rating_mva} MVA (${a.utilisation_pct}%)`).join(" · ") || "—";
    const txCards=[
      ec("Required power", tx.required_mva+" MVA", `at pf ${tx.pf}`),
      ec(tx.selection_source==="manual transformer count"?"Selected":"Recommended", `${r.units}×${r.rating_mva} MVA`, `${r.total_mva} MVA total`,"ok"),
      ec("Utilisation", r.utilisation_pct+" %", `${r.oversize_pct}% over-sized`,"ok"),
      ec("Voltage / group", `${tx.lv_v} V → ${tx.mv_kv} kV`, tx.vector_group),
      ec("Impedance", tx.impedance_pct+" %", tx.cooling),
      ec("Alternatives", tx.alternatives.length?tx.alternatives.map(a=>a.units+"×"+a.rating_mva).join(", "):"—", altTxt),
    ];
    const grid=tx.sri_lanka_grid||{}, h=tx.harmonic||{};
    const harmonicState = h.tdd_status==="pass" ? "ok" : h.tdd_status==="fail" ? "bad" : "";
    const gridCards=[
      ec("Sri Lanka MV basis", `${grid.nominal_voltage_kv||tx.mv_kv} kV`, `${grid.frequency_hz||50} Hz · highest ${grid.highest_system_voltage_kv||"—"} kV`),
      ec("Fault level", `${grid.rated_fault_current_ka||"—"} kA`, "preliminary switchgear basis"),
      ec("Voltage range", grid.voltage_variation_pct||"—", "CEB Grid Connection Code"),
      ec("Harmonic TDD", h.input_tdd_pct==null?"not entered":h.input_tdd_pct+" %", `limit ${h.tdd_limit_pct||5}% · ${h.tdd_status||"unknown"}`, harmonicState),
    ];
    const harmonicRows = (h.individual_current_limits||[]).map(x=>`<tr><td>${x.order}</td><td>${x.limit_pct}%</td></tr>`).join("");
    const warningBox = (tx.warnings||[]).length
      ? `<div class="warnbox">${tx.warnings.map(w=>`<div>⚠ ${esc(w)}</div>`).join("")}</div>`
      : "";
    const txBlock =
      `<div class="sub3">MV step-up transformers (best value for money)</div>
       <div class="ec-cards lt-cards">${txCards.join("")}</div>
       ${warningBox}
       <p class="hint">${r.units} × ${r.rating_mva} MVA, ${tx.lv_v} V/${tx.mv_kv} kV ${tx.vector_group}, Z=${tx.impedance_pct}%, ${tx.cooling}. ${tx.tap_changer}.</p>
       <div class="sub3">Sri Lankan grid / harmonic preliminary screen</div>
       <div class="ec-cards">${gridCards.join("")}</div>
       <div class="restable-wrap"><table class="restable"><thead><tr><th>Current harmonic order</th><th>Limit (% of reference current)</th></tr></thead><tbody>${harmonicRows}</tbody></table></div>
       <p class="hint">${esc(h.even_harmonic_rule||"")} ${esc(h.study_required||"")}</p>`;

    document.getElementById("infra_body").innerHTML =
      `<div class="grid-2"><div><div class="sub3">Minimum land-area schedule</div>${landTbl}</div><div>${txBlock}</div></div>`;
    initBoundary(d);
  }
  function ec(l,v,s,st){ return `<div class="ec ${st||""}"><div class="ec-l">${l}</div><div class="ec-v">${v}</div><div class="ec-s">${s||""}</div></div>`; }
  function esc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // ---- scaled site-boundary drawing ----
  function initBoundary(d){
    REQ_HA = d.infra ? d.infra.land.total_ha : 0;
    AUTO_SITE = d.layout && d.layout.site ? d.layout.site : null;
    if(AUTO_SITE && AUTO_SITE.area_ha) REQ_HA = AUTO_SITE.area_ha;
    const lat=d.sun_path.lat;
    const lon=(d.layout&&d.layout.available)?d.layout.geojson.properties.site[0]:parseFloat(document.getElementById("lon").value);
    if(!BMAP){
      BMAP=L.map("boundary_map",{zoomControl:true,attributionControl:true});
      const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:"Imagery © Esri"});
      const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"});
      sat.addTo(BMAP); L.control.layers({"Satellite":sat,"Map":osm}).addTo(BMAP);
      L.control.scale({imperial:false}).addTo(BMAP);
      BMAP.on("click", e=>{ if(drawing){ pts.push([e.latlng.lat,e.latlng.lng]); redraw(); } });
      document.getElementById("bnd_draw").onclick=()=>{ drawing=true; pts=[]; redraw(); setBtns(); };
      document.getElementById("bnd_undo").onclick=()=>{ pts.pop(); redraw(); };
      document.getElementById("bnd_clear").onclick=()=>{ drawing=false; pts=[]; redraw(); setBtns(); };
      document.getElementById("bnd_finish").onclick=()=>{ drawing=false; setBtns(); redraw(); };
    }
    BMAP.setView([lat,lon],17);
    if(BLK) BLK.remove();
    if(d.layout && d.layout.available){
      const colorById={}; d.layout.blocks.forEach(b=>colorById[b.id]=b.color);
      BLK=L.geoJSON(d.layout.geojson,{
        style:f=>boundaryFeatureStyle(f,colorById),
        onEachFeature:(f,l)=>l.bindTooltip(boundaryFeatureTooltip(f)),
      }).addTo(BMAP);
      try{ BMAP.fitBounds(BLK.getBounds(),{padding:[40,40]}); }catch(e){}
    }
    pts=[]; redraw(); setBtns();
    setTimeout(()=>BMAP.invalidateSize(),120);
  }
  function boundaryFeatureStyle(f,colorById){
    const p=f.properties||{}, kind=p.kind||"array_block";
    if(kind==="site_boundary") return {color:"#f8fafc",weight:2,fillColor:"#38bdf8",fillOpacity:0.05,dashArray:"8 6"};
    if(kind==="service_road") return {color:"#8b98a8",weight:1,fillColor:"#475569",fillOpacity:0.42};
    if(kind==="switchyard") return {color:"#fbbf24",weight:1.4,fillColor:"#64748b",fillOpacity:0.42};
    if(kind==="control_room") return {color:"#93c5fd",weight:1.4,fillColor:"#1d4ed8",fillOpacity:0.38};
    return {color:colorById[p.inverter]||"#ffb838",weight:1,fillOpacity:0.22};
  }
  function boundaryFeatureTooltip(f){
    const p=f.properties||{}, kind=p.kind||"array_block";
    if(kind==="site_boundary") return `Minimum fence boundary: ${p.area_ha} ha (required ${p.required_ha} ha)`;
    if(kind==="service_road"||kind==="switchyard"||kind==="control_room") return `${p.label}: ${p.area_m2} m2`;
    return `INV ${String(p.inverter).padStart(2,"0")} | ${p.strings} strings`;
  }
  function setBtns(){
    document.getElementById("bnd_draw").textContent = drawing?"● Drawing… click map":"✏ Draw boundary";
    ["bnd_undo","bnd_finish"].forEach(id=>document.getElementById(id).style.display=drawing?"inline-block":"none");
  }
  function redraw(){
    if(BND) BND.remove();
    BND=L.layerGroup().addTo(BMAP);
    if(pts.length){
      pts.forEach(p=>L.circleMarker(p,{radius:4,color:"#fff",weight:1,fillColor:"#3ee0c0",fillOpacity:1}).addTo(BND));
      if(pts.length>=2) L.polyline(pts,{color:"#3ee0c0",weight:2,dashArray:"6 5"}).addTo(BND);
      if(pts.length>=3) L.polygon(pts,{color:"#3ee0c0",weight:2,fillColor:"#3ee0c0",fillOpacity:0.12}).addTo(BND);
    }
    updateInfo();
  }
  function areaHa(p){
    if(p.length<3) return 0;
    const lat0=p[0][0]*Math.PI/180, X=ll=>ll[1]*111320*Math.cos(lat0), Y=ll=>ll[0]*110540;
    let a=0; for(let i=0;i<p.length;i++){const j=(i+1)%p.length; a+=X(p[i])*Y(p[j])-X(p[j])*Y(p[i]);}
    return Math.abs(a)/2/1e4;
  }
  function updateInfo(){
    const el=document.getElementById("bnd_info");
    const a=areaHa(pts);
    if(!a && AUTO_SITE){
      const autoAcres=(AUTO_SITE.area_ha*2.47105).toFixed(1);
      window.__boundary={area_ha:AUTO_SITE.area_ha, points:4, automatic:true};
      el.innerHTML=`<span class="muted">Automatic minimum fence plotted: <b>${AUTO_SITE.area_ha} ha</b> (${autoAcres} ac). Land schedule minimum is <b>${AUTO_SITE.required_ha} ha</b>; the plotted fence is larger when physical block packing, road and BOP placement need it. Use Draw boundary only if you want to test real surveyed site corners.</span>`;
      return;
    }
    if(!a){ el.innerHTML=`<span class="muted">Required minimum: <b>${REQ_HA} ha</b>. Click “Draw boundary”, then click the map to mark your proposed site corners.</span>`; window.__boundary=null; return; }
    const acres=(a*2.47105).toFixed(1);
    const ok=a>=REQ_HA;
    const margin=((a-REQ_HA)/REQ_HA*100).toFixed(0);
    window.__boundary={area_ha:+a.toFixed(2), points:pts.length};
    el.innerHTML=`Proposed site: <b>${a.toFixed(2)} ha</b> (${acres} ac, ${pts.length} pts) — required <b>${REQ_HA} ha</b> → `+
      `<span class="delta ${ok?"good":"bad"}">${ok?"sufficient (+"+margin+"%)":"insufficient ("+margin+"%)"}</span>`;
  }

  return {render};
})();
