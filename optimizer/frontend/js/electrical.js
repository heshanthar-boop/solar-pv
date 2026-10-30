/* ===== Electrical design + plant layout + exports ===== */
const EL = (() => {

  // ---------- string sizing + inverter/MPPT tables ----------
  function renderElectrical(d){
    const e = d.electrical;
    const body = document.getElementById("electrical_body");
    if(!e || !e.available){
      body.innerHTML = `<p class="hint">${(e&&e.reason)||"Select a catalogue module and string inverter to size strings."}</p>`;
      document.getElementById("electrical_sub").textContent = "";
      const calc=document.getElementById("calc_steps_body");
      if(calc) calc.innerHTML="<p class='hint'>Electrical calculation steps need catalogue electrical sizing.</p>";
      return;
    }
    const s=e.string, m=e.mppt, pl=e.plant, dt=e.design_temps;
    document.getElementById("electrical_sub").textContent =
      `${e.panel.model} → ${e.inverter.model} · design temps ${dt.t_min}/${dt.t_max_cell} °C`;

    const cards = [
      ec("Modules / string", s.modules_per_string, `range ${s.n_min}–${s.n_max}`),
      ec("String Voc (cold)", s.voc_string_cold+" V", `limit ${s.v_sys_limit} V · margin ${s.voc_margin_v} V`,
         s.voc_margin_v>0?"ok":"bad"),
      ec("String Vmp", s.vmp_string_stc+" V", `hot ${s.vmp_string_hot} V · ${s.in_window?"in MPPT window":"OUT of window"}`,
         s.in_window?"ok":"bad"),
      ec("Strings / MPPT", m.strings_per_mppt, `limited by ${m.limited_by}`),
      ec("MPPT current", m.current_per_mppt_a+" A", `of ${m.imax_mppt_a} A max`,
         m.current_per_mppt_a<=m.imax_mppt_a?"ok":"bad"),
      ec("MPPT short-circuit", m.isc_per_mppt_a+" A", `of ${m.isc_limit_a} A max`,
         m.isc_per_mppt_a<=m.isc_limit_a?"ok":"bad"),
      ec("Inverters", pl.inverter_count, `${pl.inverter_count_source}${pl.requested_inverter_count?` · requested ${pl.requested_inverter_count}`:""} · min ${pl.min_required_inverters}`),
      ec("Placed DC", pl.dc_used_mw+" MW", pl.unused_dc_mw>0?`${pl.unused_dc_mw} MW left out`:`${pl.total_strings} strings`, pl.unused_dc_mw>0?"bad":"ok"),
      ec("Installed AC", pl.ac_installed_mw+" MW", pl.ac_shortfall_mw>0?`${pl.ac_shortfall_mw} MW shortfall`:`${pl.strings_per_inverter} strings/inverter`, pl.ac_shortfall_mw>0?"bad":"ok"),
    ];

    // per-inverter MPPT assignment table
    const nmppt = Math.max(...e.inverters.map(i=>i.mppt.length));
    let th = `<tr><th>Inverter</th><th>Strings</th><th>Modules</th><th>DC kW</th><th>DC/AC</th>`;
    for(let k=0;k<nmppt;k++) th+=`<th>MPPT${k+1}</th>`;
    th+=`</tr>`;
    const rows = e.inverters.map(iv=>{
      let r=`<tr><td><b>INV ${String(iv.id).padStart(2,"0")}</b></td><td>${iv.strings}</td><td>${iv.modules}</td>`+
            `<td>${iv.dc_kw}</td><td>${iv.dc_ac}</td>`;
      for(let k=0;k<nmppt;k++) r+=`<td class="mc">${iv.mppt[k]!==undefined?iv.mppt[k]:"—"}</td>`;
      return r+`</tr>`;
    }).join("");

    const note = e.feasible
      ? `<p class="hint">String length is the longest allowed by <b>${s.n_max_driver}</b>; ${m.strings_per_mppt} strings/MPPT is set by the <b>${m.limited_by}</b> (connectors ${m.connector_max}, operating-current limit ${m.current_max}, short-circuit limit ${m.isc_max}).</p>`
      : `<p class="hint bad">⚠ No string length fits the inverter window at these temperatures — adjust module/inverter or design temps.</p>`;
    const warnings = (e.warnings||[]).length
      ? `<div class="warnbox">${e.warnings.map(w=>`<div>⚠ ${esc(w)}</div>`).join("")}</div>`
      : "";

    const variationRows = (e.temperature_variation||[]).map(r =>
      `<tr><td>${esc(r.label)}</td><td>${r.cell_temp_c}</td><td>${r.string_voc}</td><td>${r.string_vmp}</td><td>${r.module_isc}</td><td>${r.pmax_factor_pct}</td><td>${r.dc_power_at_target_mw}</td></tr>`
    ).join("");
    const variation = variationRows
      ? `<div class="sub3">Temperature-only voltage and performance variation</div>
        <div class="restable-wrap"><table class="restable"><thead><tr><th>Case</th><th>Cell temp °C</th><th>String Voc V</th><th>String Vmp V</th><th>Module Isc A</th><th>Pmax %</th><th>Approx DC MW</th></tr></thead><tbody>${variationRows}</tbody></table></div>
        <p class="hint">Design temperature source: ${esc(dt.source||"—")}. This is a temperature-only electrical variation table; irradiance/cloud effects are not included in these rows.</p>`
      : "";

    body.innerHTML =
      `<div class="ec-cards">${cards.join("")}</div>`+
      `<div class="restable-wrap"><table class="restable"><thead>${th}</thead><tbody>${rows}</tbody></table></div>`+
      warnings+note+variation;
    renderCalculationSteps(d);
  }
  function ec(label,val,sub,state){
    return `<div class="ec ${state||""}"><div class="ec-l">${label}</div>`+
           `<div class="ec-v">${val}</div><div class="ec-s">${sub||""}</div></div>`;
  }
  function esc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  function renderCalculationSteps(d){
    const el=document.getElementById("calc_steps_body");
    if(!el) return;
    const sections=[
      ...((d.electrical&&d.electrical.calculation_steps)||[]),
      ...((d.infra&&d.infra.transformer&&d.infra.transformer.calculation_steps)||[]),
    ];
    if(!sections.length){
      el.innerHTML="<p class='hint'>Run an analysis to show the calculation steps.</p>";
      return;
    }
    el.innerHTML = `<div class="calc-steps">` + sections.map(sec =>
      `<div class="calc-step"><h4>${esc(sec.title)}</h4><ol>${(sec.items||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`
    ).join("") + `</div>`;
  }

  // ---------- plant layout: plan SVG + satellite map ----------
  let LMAP=null, LLAYER=null;
  function renderLayout(d){
    const lay=d.layout;
    const sub=document.getElementById("layout_sub2");
    if(!lay || !lay.available){ document.getElementById("layout_plan").innerHTML=
        "<p class='hint'>Layout needs the electrical sizing above.</p>"; sub.textContent=""; return; }
    sub.textContent = `${lay.blocks.length} inverter blocks · ${lay.field_w}×${lay.field_h} m · ≈ ${lay.land_ha} ha · rows face ${lay.azimuth}°`;
    document.getElementById("layout_plan").innerHTML = planSVG(lay);
    renderLayoutMap(d);
    document.getElementById("layout_legend").innerHTML =
      lay.blocks.map(b=>`<span><i class="legend-box" style="background:${b.color}"></i>INV ${String(b.id).padStart(2,"0")} · ${b.strings} str</span>`).join("")
      + `<span>Schematic equal blocks; not a surveyed/terrain-fitted layout.</span>`;
    const site = lay.site || {};
    sub.textContent = site.w
      ? `${lay.blocks.length} inverter blocks | fence ${site.w}x${site.h} m = ${site.area_ha} ha | schedule ${site.required_ha} ha | rows face ${lay.azimuth} deg`
      : `${lay.blocks.length} inverter blocks | ${lay.field_w}x${lay.field_h} m | approx ${lay.land_ha} ha | rows face ${lay.azimuth} deg`;
    document.getElementById("layout_legend").innerHTML =
      `<span><i class="legend-box fence"></i>Minimum fence</span>
       <span><i class="legend-box road"></i>Internal access</span>
       <span><i class="legend-box switchyard"></i>Switchyard / transformer bay</span>
       <span><i class="legend-box control"></i>Control room</span>`+
      lay.blocks.map(b=>`<span><i class="legend-box" style="background:${b.color}"></i>INV ${String(b.id).padStart(2,"0")} | ${b.strings} str</span>`).join("")
      + `<span>Preliminary 3D-style feasibility layout; not a surveyed terrain design.</span>`;
    wireExports(d);
  }

  function planSVG(lay){
    const pad=34, W=900;
    const H=Math.max(260, Math.round((W-2*pad)*lay.field_h/lay.field_w)+2*pad);
    const sc=(W-2*pad)/lay.field_w;
    let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="svgwrap">`;
    s+=`<rect x="0" y="0" width="${W}" height="${H}" fill="#0e1c30"/>`;
    lay.blocks.forEach(b=>{
      const x=pad+b.x*sc, y=pad+b.y*sc, w=b.w*sc, h=b.h*sc;
      s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${b.color}" fill-opacity="0.22" stroke="${b.color}" stroke-width="1.5" rx="2"/>`;
      // row lines (north-south spacing by pitch)
      const nrows=Math.max(1,Math.round(b.h/b.row_pitch));
      for(let r=0;r<nrows;r++){const yy=y+ (r+0.5)*(h/nrows);
        s+=`<line x1="${x+2}" y1="${yy}" x2="${x+w-2}" y2="${yy}" stroke="${b.color}" stroke-width="1" opacity="0.5"/>`;}
      s+=`<text x="${x+5}" y="${y+14}" fill="#eaf1fb" font-size="11" font-weight="700">INV ${String(b.id).padStart(2,"0")}</text>`;
      s+=`<text x="${x+5}" y="${y+27}" fill="#aabfda" font-size="9.5">${b.strings} str · ${b.dc_kw} kW</text>`;
    });
    // north arrow (screen vector for geographic north given row azimuth)
    const a=lay.azimuth*Math.PI/180, nx=-Math.sin(a), ny=Math.cos(a);
    const cx=W-40, cy=44, len=20;
    s+=`<line x1="${cx-nx*len}" y1="${cy-ny*len}" x2="${cx+nx*len}" y2="${cy+ny*len}" stroke="#ffce5a" stroke-width="2"/>`;
    s+=`<polygon points="${cx+nx*len},${cy+ny*len} ${cx+nx*len-6*(nx*0.5+ny*0.5)},${cy+ny*len-6*(ny*0.5-nx*0.5)} ${cx+nx*len-6*(nx*0.5-ny*0.5)},${cy+ny*len-6*(ny*0.5+nx*0.5)}" fill="#ffce5a"/>`;
    s+=`<text x="${cx+nx*(len+11)}" y="${cy+ny*(len+11)+4}" fill="#ffce5a" font-size="12" font-weight="700" text-anchor="middle">N</text>`;
    // scale bar
    let m=Math.max(10,Math.round(lay.field_w/5/10)*10); const px=m*sc;
    s+=`<line x1="${pad}" y1="${H-12}" x2="${pad+px}" y2="${H-12}" stroke="#aabfda" stroke-width="2"/>`;
    s+=`<text x="${pad+px/2}" y="${H-16}" fill="#aabfda" font-size="10" text-anchor="middle">${m} m</text>`;
    return s+`</svg>`;
  }

  function planSVG(lay){
    const site = lay.site || {
      w: lay.field_w, h: lay.field_h, area_ha: lay.land_ha, required_ha: lay.land_ha,
      array: {x:0, y:0, w:lay.field_w, h:lay.field_h}, areas: [],
      fence_setback_m: 0, road_width_m: 0, transformer_units: 0,
      note: "Array block envelope only."
    };
    const W=940, H=560, margin=42, cos=0.8660254, sin=0.5;
    const raw=(x,y,z=0)=>({x:(x-y)*cos, y:(x+y)*sin-z});
    const corners=[[0,0,0],[site.w,0,0],[site.w,site.h,0],[0,site.h,0]].map(p=>raw(...p));
    const minX=Math.min(...corners.map(p=>p.x)), maxX=Math.max(...corners.map(p=>p.x));
    const minY=Math.min(...corners.map(p=>p.y)), maxY=Math.max(...corners.map(p=>p.y));
    const sc=Math.min((W-2*margin)/(maxX-minX||1),(H-118)/(maxY-minY+30||1));
    const ox=(W-(maxX-minX)*sc)/2-minX*sc, oy=74-minY*sc;
    const pt=(x,y,z=0)=>{const r=raw(x,y,z); return {x:ox+r.x*sc,y:oy+r.y*sc};};
    const pts=a=>a.map(q=>{const p=pt(q[0],q[1],q[2]||0); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(" ");
    const line=(a,b,col,w=1,op=1,dash="")=>{
      const p1=pt(a[0],a[1],a[2]||0), p2=pt(b[0],b[1],b[2]||0);
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" opacity="${op}" ${dash?`stroke-dasharray="${dash}"`:""}/>`;
    };
    const poly=(a,fill,stroke="#000",op=1,extra="")=>`<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke}" opacity="${op}" ${extra}/>`;
    const rectPoly=(r,fill,stroke,op=1,extra="")=>poly([[r.x,r.y,0],[r.x+r.w,r.y,0],[r.x+r.w,r.y+r.h,0],[r.x,r.y+r.h,0]],fill,stroke,op,extra);
    const textAt=(x,y,z,t,size=10,fill="#eaf1fb",anchor="middle",weight="600")=>{
      const p=pt(x,y,z);
      return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(t)}</text>`;
    };
    const box=(r,h,fill,stroke,label)=>{
      const z=h||5, x=r.x, y=r.y, w=r.w, d=r.h;
      let s="";
      s+=poly([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]],fill,stroke,1);
      s+=poly([[x+w,y,z],[x+w,y,0],[x+w,y+d,0],[x+w,y+d,z]],"#172235",stroke,0.94);
      s+=poly([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,0],[x,y+d,0]],"#101a2b",stroke,0.94);
      if(label) s+=textAt(x+w/2,y+d/2,z+2,label,10,"#fff");
      return s;
    };
    const panel=(x,y,w,d,col)=>{
      let s="";
      s+=poly([[x,y,0],[x+w,y,0],[x+w,y+d,0],[x,y+d,0]],"#07101a","#07101a",0.22);
      s+=poly([[x,y,2.6],[x+w,y,2.6],[x+w,y+d,2.6],[x,y+d,2.6]],col,"#9ed0ff",0.92);
      for(let k=1;k<4;k++){
        const xx=x+w*k/4;
        s+=line([xx,y,2.8],[xx,y+d,2.8],"#0a1b2d",0.7,0.7);
      }
      s+=line([x,y+d,0.2],[x,y+d,2.4],"#6f7d8e",0.7,0.7);
      s+=line([x+w,y+d,0.2],[x+w,y+d,2.4],"#6f7d8e",0.7,0.7);
      return s;
    };

    let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="svgwrap site-3d">`;
    s+=`<defs>
      <linearGradient id="ground3d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#203817"/><stop offset="1" stop-color="#10240f"/></linearGradient>
      <linearGradient id="panel3d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#194c82"/><stop offset="1" stop-color="#071a2d"/></linearGradient>
      <filter id="softShadow"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity="0.28"/></filter>
    </defs>`;
    s+=`<rect x="0" y="0" width="${W}" height="${H}" fill="#08111f"/>`;
    s+=poly([[0,0,0],[site.w,0,0],[site.w,site.h,0],[0,site.h,0]],"url(#ground3d)","#6aa36b",1,`filter="url(#softShadow)"`);
    const arr=site.array || {x:0,y:0,w:lay.field_w,h:lay.field_h};
    s+=rectPoly(arr,"#132b18","#2f5b31",0.45,`stroke-dasharray="5 5"`);
    (site.areas||[]).forEach(a=>{
      if(a.kind==="service_road") s+=rectPoly(a,"#394552","#657184",0.9);
      if(a.kind==="switchyard") s+=rectPoly(a,"#35414b","#aab2bd",0.92);
      if(a.kind==="control_room") s+=rectPoly(a,"#243047","#7da0d5",0.9);
    });
    const sw=(site.areas||[]).find(a=>a.kind==="switchyard");
    const cr=(site.areas||[]).find(a=>a.kind==="control_room");
    if(sw){
      const units=Math.max(1,site.transformer_units||1);
      const tw=Math.min(11,sw.w/(units+1.8)), th=Math.min(9,sw.h*0.38);
      for(let i=0;i<units;i++){
        const tx=sw.x+4+i*(tw+3), ty=sw.y+sw.h*0.55;
        s+=box({x:tx,y:ty,w:tw,h:th},4.2,"#87909b","#d9e1ea",`TX ${i+1}`);
      }
      s+=textAt(sw.x+sw.w/2,sw.y+sw.h*0.18,1.2,"33 kV switchyard",10,"#f7d17a");
    }
    if(cr) s+=box(cr,6.2,"#2d4772","#9fc4ff","Control");

    const drawItems=[];
    lay.blocks.forEach(b=>{
      const bx=("site_x" in b)?b.site_x:(arr.x+b.x), by=("site_y" in b)?b.site_y:(arr.y+b.y);
      const cols=Math.max(1,b.str_cols||1), rows=Math.max(1,Math.ceil((b.strings||0)/cols));
      const cellW=b.w/cols, rowPitch=b.row_pitch||lay.pitch||2.5;
      const d=Math.max(0.7,Math.min(b.row_depth||rowPitch*0.55,rowPitch*0.72));
      for(let i=0;i<(b.strings||0);i++){
        const c=i%cols, r=Math.floor(i/cols);
        const x=bx+c*cellW+cellW*0.06;
        const y=by+r*rowPitch+(rowPitch-d)*0.36;
        const w=Math.max(0.8,Math.min(b.table_w||cellW*0.82,cellW*0.88));
        drawItems.push({depth:y+r*0.01, html:panel(x,y,w,d,b.color||"url(#panel3d)")});
      }
      drawItems.push({depth:by+b.h+0.2, html:rectPoly({x:bx,y:by,w:b.w,h:b.h},"none",b.color,1,`stroke-dasharray="4 4"`)});
      drawItems.push({depth:by+b.h+0.3, html:textAt(bx+b.w*0.08,by+b.h*0.16,5,`INV ${String(b.id).padStart(2,"0")} | ${b.strings} strings`,9,"#f2f6ff","start")});
    });
    drawItems.sort((a,b)=>a.depth-b.depth).forEach(x=>s+=x.html);

    // fence posts and rails
    const sides=[[[0,0],[site.w,0]],[[site.w,0],[site.w,site.h]],[[site.w,site.h],[0,site.h]],[[0,site.h],[0,0]]];
    sides.forEach(side=>{
      const [a,b]=side, dx=b[0]-a[0], dy=b[1]-a[1];
      const n=Math.max(2,Math.ceil(Math.hypot(dx,dy)/28));
      s+=line([a[0],a[1],4.8],[b[0],b[1],4.8],"#eaf1fb",1.1,0.85,"5 5");
      for(let i=0;i<=n;i++){
        const x=a[0]+dx*i/n, y=a[1]+dy*i/n;
        s+=line([x,y,0],[x,y,5.2],"#dfe8f7",1.1,0.85);
      }
    });

    // 2D info card and scale bar.
    const scaleM=Math.max(20,Math.round(site.w/5/10)*10), scalePx=scaleM*sc*cos;
    s+=`<g transform="translate(18,18)"><rect width="250" height="82" rx="11" fill="#0d1a2c" stroke="#2b3f5e"/>
      <text x="12" y="22" fill="#ffce5a" font-size="13" font-weight="700">Minimum physical site envelope</text>
      <text x="12" y="43" fill="#d7e2f2" font-size="12">Fence: ${site.w} x ${site.h} m = ${site.area_ha} ha</text>
      <text x="12" y="61" fill="#aabfda" font-size="11">Required schedule: ${site.required_ha} ha | setback ${site.fence_setback_m||0} m</text>
      <text x="12" y="76" fill="#aabfda" font-size="10">${esc(site.note||"Preliminary layout")}</text></g>`;
    s+=`<line x1="${W-170}" y1="${H-32}" x2="${W-170+scalePx}" y2="${H-32}" stroke="#aabfda" stroke-width="3"/>
        <text x="${W-170+scalePx/2}" y="${H-39}" fill="#aabfda" font-size="11" text-anchor="middle">${scaleM} m</text>`;
    s+=`<text x="${W-22}" y="30" fill="#ffce5a" font-size="13" font-weight="700" text-anchor="end">N</text>
        <path d="M ${W-28} 62 L ${W-28} 38" stroke="#ffce5a" stroke-width="3"/>
        <path d="M ${W-28} 36 l -6 10 h 12 z" fill="#ffce5a"/>`;
    return s+`</svg>`;
  }

  function renderLayoutMap(d){
    const lay=d.layout, lat=d.sun_path.lat, lon=d.layout.geojson.properties.site[0];
    if(!LMAP){
      LMAP=L.map("layout_map",{zoomControl:true,attributionControl:true});
      const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {maxZoom:20, attribution:"Imagery © Esri"});
      const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {maxZoom:19, attribution:"© OpenStreetMap"});
      sat.addTo(LMAP); L.control.layers({"Satellite":sat,"Map":osm}).addTo(LMAP);
      L.control.scale({imperial:false}).addTo(LMAP);
    }
    if(LLAYER) LLAYER.remove();
    const colorById={}; lay.blocks.forEach(b=>colorById[b.id]=b.color);
    LLAYER=L.geoJSON(d.layout.geojson,{
      style:f=>({color:colorById[f.properties.inverter]||"#ffb838",weight:1.5,fillOpacity:0.35}),
      onEachFeature:(f,l)=>l.bindTooltip(`INV ${String(f.properties.inverter).padStart(2,"0")} · ${f.properties.strings} strings · ${f.properties.dc_kw} kW`),
    }).addTo(LMAP);
    LMAP.fitBounds(LLAYER.getBounds(),{padding:[20,20]});
    setTimeout(()=>LMAP.invalidateSize(),120);
  }

  function renderLayoutMap(d){
    const lay=d.layout;
    if(!lay || !lay.available || !lay.geojson) return;
    if(!LMAP){
      LMAP=L.map("layout_map",{zoomControl:true,attributionControl:true});
      const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {maxZoom:20, attribution:"Imagery (c) Esri"});
      const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {maxZoom:19, attribution:"(c) OpenStreetMap"});
      sat.addTo(LMAP); L.control.layers({"Satellite":sat,"Map":osm}).addTo(LMAP);
      L.control.scale({imperial:false}).addTo(LMAP);
    }
    if(LLAYER) LLAYER.remove();
    const colorById={}; lay.blocks.forEach(b=>colorById[b.id]=b.color);
    LLAYER=L.geoJSON(lay.geojson,{
      style:f=>featureStyle(f,colorById),
      onEachFeature:(f,l)=>l.bindTooltip(featureTooltip(f)),
    }).addTo(LMAP);
    try{ LMAP.fitBounds(LLAYER.getBounds(),{padding:[24,24]}); }catch(e){}
    setTimeout(()=>LMAP.invalidateSize(),120);
  }

  function featureStyle(f,colorById){
    const p=f.properties||{}, kind=p.kind||"array_block";
    if(kind==="site_boundary") return {color:"#f2f6ff",weight:2,fillColor:"#38bdf8",fillOpacity:0.05,dashArray:"8 6"};
    if(kind==="service_road") return {color:"#8b98a8",weight:1,fillColor:"#475569",fillOpacity:0.45};
    if(kind==="switchyard") return {color:"#fbbf24",weight:1.4,fillColor:"#64748b",fillOpacity:0.42};
    if(kind==="control_room") return {color:"#93c5fd",weight:1.4,fillColor:"#1d4ed8",fillOpacity:0.38};
    return {color:colorById[p.inverter]||"#ffb838",weight:1.5,fillOpacity:0.35};
  }

  function featureTooltip(f){
    const p=f.properties||{}, kind=p.kind||"array_block";
    if(kind==="site_boundary") return `Minimum fence | ${p.area_ha} ha required ${p.required_ha} ha`;
    if(kind==="service_road") return `${p.label} | ${p.area_m2} m2`;
    if(kind==="switchyard") return `${p.label} | ${p.area_m2} m2`;
    if(kind==="control_room") return `${p.label} | ${p.area_m2} m2`;
    return `INV ${String(p.inverter).padStart(2,"0")} | ${p.strings} strings | ${p.dc_kw} kW`;
  }

  // ---------- exports ----------
  function wireExports(d){
    document.getElementById("btn_csv").onclick=()=>download("plant_electrical_design.csv", buildCSV(d), "text/csv");
    document.getElementById("btn_json").onclick=()=>download("plant_design.json", JSON.stringify({electrical:d.electrical,layout:{...d.layout,geojson:undefined}},null,2),"application/json");
    document.getElementById("btn_geojson").onclick=()=>download("plant_layout.geojson", JSON.stringify(d.layout.geojson,null,2),"application/geo+json");
  }
  function buildCSV(d){
    const e=d.electrical, s=e.string, m=e.mppt, pl=e.plant;
    const L=[];
    L.push("# Solar Yield Optimizer - preliminary electrical design");
    L.push(`# Module,${e.panel.model} ${e.panel.bin_w} Wp`);
    L.push(`# Inverter,${e.inverter.model} ${e.inverter.ac_kw} kW`);
    L.push(`# Design temps (min/maxcell C),${e.design_temps.t_min},${e.design_temps.t_max_cell}`);
    L.push(`# Modules per string,${s.modules_per_string},(min ${s.n_min} max ${s.n_max})`);
    L.push(`# String Voc cold (V),${s.voc_string_cold},limit ${s.v_sys_limit}`);
    L.push(`# String Vmp STC/hot (V),${s.vmp_string_stc},${s.vmp_string_hot}`);
    L.push(`# Strings per MPPT,${m.strings_per_mppt},limited by ${m.limited_by}`);
    L.push(`# Total strings,${pl.total_strings}`);
    L.push(`# Inverters,${pl.inverter_count}`);
    L.push(`# Modules used,${pl.modules_used},DC ${pl.dc_used_mw} MW`);
    L.push("");
    const nmppt=Math.max(...e.inverters.map(i=>i.mppt.length));
    let head=["Inverter","Strings","Modules","DC_kW","DC_AC"];
    for(let k=0;k<nmppt;k++) head.push("MPPT"+(k+1));
    L.push(head.join(","));
    e.inverters.forEach(iv=>{
      const row=[`INV${String(iv.id).padStart(2,"0")}`,iv.strings,iv.modules,iv.dc_kw,iv.dc_ac];
      for(let k=0;k<nmppt;k++) row.push(iv.mppt[k]!==undefined?iv.mppt[k]:"");
      L.push(row.join(","));
    });
    if(d.layout && d.layout.site){
      const s=d.layout.site;
      L.push("");
      L.push("# Preliminary site envelope");
      L.push(`Fence width m,${s.w}`);
      L.push(`Fence depth m,${s.h}`);
      L.push(`Fence area ha,${s.area_ha}`);
      L.push(`Required minimum ha,${s.required_ha}`);
      (s.areas||[]).forEach(a=>L.push(`${a.label},${a.area_m2} m2`));
    }
    return L.join("\n");
  }
  function download(name,text,mime){
    const b=new Blob([text],{type:mime}); const u=URL.createObjectURL(b);
    const a=document.createElement("a"); a.href=u; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(u),2000);
  }

  return {renderElectrical, renderLayout, planSVG, buildCSV};
})();
