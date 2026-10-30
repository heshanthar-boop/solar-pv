/* ===== Plotly chart builders ===== */
const CH = (() => {
  const FONT = {family:"Segoe UI,Roboto,sans-serif", color:"#aabfda", size:11};
  const BASE = {
    paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
    font:FONT, margin:{l:48,r:14,t:10,b:40},
    xaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
    yaxis:{gridcolor:"#1b2b45", zerolinecolor:"#2a3f60", linecolor:"#2a3f60"},
  };
  const CFG = {displayModeBar:false, responsive:true};
  const clone = o => JSON.parse(JSON.stringify(o));
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function heatmap(el, sw, metric, selected){
    const z = metric === "energy_mwh" ? sw.energy_mwh : sw.specific_yield;
    const unit = metric === "energy_mwh" ? "MWh" : "kWh/kWp";
    const data = [
      { type:"heatmap", x:sw.azimuths, y:sw.tilts, z:z,
        colorscale:[[0,"#0b2545"],[0.4,"#1d6fb8"],[0.65,"#3ee0c0"],[0.85,"#ffd166"],[1,"#ff9416"]],
        colorbar:{title:{text:unit,side:"right",font:FONT}, thickness:12, outlinewidth:0, tickfont:FONT},
        hovertemplate:"Tilt %{y}°<br>Azimuth %{x}°<br><b>%{z:.0f} "+unit+"</b><extra></extra>" },
      { type:"contour", x:sw.azimuths, y:sw.tilts, z:z, showscale:false,
        contours:{coloring:"none"}, line:{color:"rgba(255,255,255,.22)",width:1},
        hoverinfo:"skip" },
      { type:"scatter", mode:"markers+text", x:[sw.optimum.azimuth], y:[sw.optimum.tilt],
        marker:{symbol:"star", size:18, color:"#fff", line:{color:"#ff9416",width:2}},
        text:["  optimum"], textposition:"middle right", textfont:{color:"#fff",size:11},
        hovertemplate:sw.optimum.azimuth_defined
          ? `Optimum<br>Tilt ${sw.optimum.tilt}° · Az ${sw.optimum.azimuth}°<extra></extra>`
          : `Optimum<br>Horizontal plane · azimuth N/A<extra></extra>` },
    ];
    if(selected){
      data.push({type:"scatter",mode:"markers+text",x:[selected.azimuth],y:[selected.tilt],
        marker:{symbol:"diamond-open",size:14,color:"#5aabff",line:{color:"#5aabff",width:2}},
        text:["  current design"],textposition:"middle right",textfont:{color:"#b9d9ff",size:10},
        hovertemplate:`Current design<br>Tilt ${selected.tilt}° · Az ${selected.azimuth}°<extra></extra>`});
    }
    const lay = clone(BASE);
    lay.margin = {l:52,r:14,t:10,b:46};
    lay.showlegend = false;
    lay.xaxis.title = {text:"Azimuth (°)   90 = East · 180 = South · 270 = West", font:FONT};
    lay.yaxis.title = {text:"Tilt (°)", font:FONT};
    Plotly.newPlot(el, data, lay, CFG);
  }

  function line(el, x, y, opt={}){
    const data = [{
      type:"scatter", mode:"lines", x, y, line:{color:opt.color||"#ffb838", width:3, shape:"spline"},
      fill: opt.nofill?"none":"tozeroy", fillcolor:opt.fill||"rgba(255,177,43,.10)",
      hovertemplate:(opt.htpl||"%{x}: %{y:.0f}")+"<extra></extra>" }];
    if(opt.marker){
      data.push({type:"scatter",mode:"markers",x:[opt.marker.x],y:[opt.marker.y],
        marker:{size:11,color:"#fff",line:{color:opt.color||"#ffb838",width:2}},
        hovertemplate:`${opt.marker.x}: ${opt.marker.y}<extra></extra>`});
    }
    const lay = clone(BASE);
    if(opt.xtitle) lay.xaxis.title={text:opt.xtitle,font:FONT};
    if(opt.ytitle) lay.yaxis.title={text:opt.ytitle,font:FONT};
    if(opt.nofill){ const mn=Math.min(...y),mx=Math.max(...y),pad=(mx-mn)*0.12||1; lay.yaxis.range=[mn-pad,mx+pad]; }
    lay.showlegend=false;
    Plotly.newPlot(el, data, lay, CFG);
  }

  function monthly(el, vals){
    const data=[{type:"bar", x:MONTHS, y:vals,
      marker:{color:vals.map((_,i)=>`rgba(54,214,184,${0.55+0.4*vals[i]/Math.max(...vals)})`),
              line:{width:0}},
      hovertemplate:"%{x}: <b>%{y:.0f} MWh</b><extra></extra>"}];
    const lay=clone(BASE); lay.yaxis.title={text:"MWh",font:FONT};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function waterfall(el, items){
    const x = items.map(i=>i.stage);
    const y = items.map(i=>i.value);
    const measure = items.map((it,idx)=> (idx===0||idx===items.length-1)?"total":"relative");
    const data=[{type:"waterfall", x, y, measure, orientation:"v",
      textposition:"outside", text:y.map(v=>(v>0?"":"")+v.toLocaleString()), textfont:{size:9,color:"#aabfda"},
      connector:{line:{color:"#2b3f5e"}},
      increasing:{marker:{color:"#3ee0c0"}}, decreasing:{marker:{color:"#fb7185"}},
      totals:{marker:{color:"#ffb838"}},
      hovertemplate:"%{x}<br><b>%{y:.0f} MWh</b><extra></extra>"}];
    const lay=clone(BASE); lay.margin={l:48,r:10,t:14,b:80};
    lay.xaxis.tickangle=-28; lay.xaxis.tickfont={size:9,color:"#7089a8"};
    lay.yaxis.title={text:"MWh",font:FONT};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function profile(el, kw){
    const x=[...Array(24).keys()];
    line(el, x, kw, {color:"#ffd166", fill:"rgba(255,209,102,.12)",
      xtitle:"Hour of day (local)", ytitle:"Average power (kW)",
      htpl:"%{x}:00 — %{y:.0f} kW"});
  }

  function ghi(el, vals){
    const data=[{type:"bar", x:MONTHS, y:vals,
      marker:{color:"#5aabff", line:{width:0}}, opacity:.85,
      hovertemplate:"%{x}: <b>%{y:.0f} kWh/m²</b><extra></extra>"}];
    const lay=clone(BASE); lay.yaxis.title={text:"kWh/m²",font:FONT};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function carpet(el, c){
    const data=[{type:"heatmap", x:c.days, y:c.hours, z:c.z,
      colorscale:[[0,"#0b1a30"],[0.25,"#143a6b"],[0.5,"#1f7fb8"],[0.7,"#3ee0c0"],[0.88,"#ffd166"],[1,"#ff9416"]],
      colorbar:{title:{text:"kW",side:"right",font:FONT}, thickness:12, outlinewidth:0, tickfont:FONT},
      hovertemplate:"Day %{x} · %{y}:00<br><b>%{z:.0f} kW</b><extra></extra>"}];
    const lay=clone(BASE); lay.margin={l:46,r:14,t:8,b:38};
    lay.xaxis.title={text:"Day of year",font:FONT};
    lay.yaxis.title={text:"Hour",font:FONT}; lay.yaxis.dtick=4;
    Plotly.newPlot(el,data,lay,CFG);
  }

  function monthlyDual(el, pr, yld){
    const data=[
      {type:"bar", x:MONTHS, y:yld, name:"Specific yield",
       marker:{color:"#3ee0c0"}, yaxis:"y",
       hovertemplate:"%{x}: %{y:.0f} kWh/kWp<extra></extra>"},
      {type:"scatter", mode:"lines+markers", x:MONTHS, y:pr, name:"PR",
       line:{color:"#ffb838",width:3}, marker:{size:6}, yaxis:"y2",
       hovertemplate:"%{x}: PR %{y:.1f}%<extra></extra>"},
    ];
    const lay=clone(BASE); lay.margin={l:46,r:46,t:10,b:34};
    lay.yaxis.title={text:"kWh/kWp",font:FONT};
    lay.yaxis2={overlaying:"y",side:"right",title:{text:"PR %",font:FONT},
      gridcolor:"rgba(0,0,0,0)", range:[0,100], tickfont:FONT};
    lay.legend={orientation:"h",y:1.15,font:FONT};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function ghiPoa(el, ghiM, poaM){
    const data=[
      {type:"bar", x:MONTHS, y:ghiM, name:"GHI (horizontal)", marker:{color:"#5aabff"}, opacity:.85,
       hovertemplate:"%{x}: %{y:.0f} kWh/m²<extra></extra>"},
      {type:"bar", x:MONTHS, y:poaM, name:"POA (in-plane)", marker:{color:"#ffb838"}, opacity:.9,
       hovertemplate:"%{x}: %{y:.0f} kWh/m²<extra></extra>"},
    ];
    const lay=clone(BASE); lay.barmode="group"; lay.yaxis.title={text:"kWh/m²",font:FONT};
    lay.legend={orientation:"h",y:1.15,font:FONT}; lay.margin={l:46,r:14,t:24,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function duration(el, d){
    const data=[
      {type:"scatter", mode:"lines", x:d.pct, y:d.power, name:"AC power",
       line:{color:"#3ee0c0",width:3}, fill:"tozeroy", fillcolor:"rgba(54,214,184,.12)",
       hovertemplate:"%{x:.0f}% of time ≥ <b>%{y:.0f} kW</b><extra></extra>"},
      {type:"scatter", mode:"lines", x:[0,100], y:[d.ac_cap,d.ac_cap], name:"AC limit",
       line:{color:"#fb7185",width:2,dash:"dash"}, hoverinfo:"skip"},
    ];
    const lay=clone(BASE); lay.xaxis.title={text:"% of year exceeding",font:FONT};
    lay.yaxis.title={text:"AC power (kW)",font:FONT};
    lay.legend={orientation:"h",y:1.15,font:FONT}; lay.margin={l:52,r:14,t:24,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function sunpath(el, sp){
    const cols={"Jun solstice":"#ffb838","Equinox":"#3ee0c0","Dec solstice":"#5aabff"};
    const data=sp.arcs.map(a=>({type:"scatter",mode:"lines",x:a.az,y:a.el,name:a.label,
      line:{color:cols[a.label]||"#ccc",width:3},
      hovertemplate:a.label+"<br>Az %{x:.0f}° · El %{y:.0f}°<extra></extra>"}));
    const lay=clone(BASE);
    lay.xaxis.title={text:"Solar azimuth (°)",font:FONT}; lay.xaxis.range=[60,300]; lay.xaxis.dtick=30;
    lay.yaxis.title={text:"Solar elevation (°)",font:FONT}; lay.yaxis.range=[0,90];
    lay.legend={orientation:"h",y:1.15,font:FONT}; lay.margin={l:46,r:14,t:24,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function peryear(el, di){
    const x=di.by_year.map(r=>r.year), y=di.by_year.map(r=>r.energy);
    const xr=[x[0]-0.5, x[x.length-1]+0.5];
    const data=[
      {type:"bar", x, y, name:"Annual", marker:{color:"#5aabff"},
       hovertemplate:"%{x}: <b>%{y:.0f} MWh</b><extra></extra>"},
      {type:"scatter", mode:"lines", x:xr, y:[di.levels.P50,di.levels.P50], name:"P50",
       line:{color:"#3ee0c0",width:2}, hoverinfo:"skip"},
      {type:"scatter", mode:"lines", x:xr, y:[di.levels.P90,di.levels.P90], name:"P90",
       line:{color:"#ffb838",width:2,dash:"dash"}, hoverinfo:"skip"},
    ];
    const lay=clone(BASE); lay.yaxis.title={text:"MWh/yr",font:FONT};
    lay.xaxis.dtick=1; lay.legend={orientation:"h",y:1.16,font:FONT}; lay.margin={l:52,r:12,t:24,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function degradation(el, dg){
    const x=dg.table.map(r=>r.year), y=dg.table.map(r=>r.energy_mwh);
    const data=[{type:"scatter", mode:"lines", x, y, line:{color:"#ffb838",width:3},
      fill:"tozeroy", fillcolor:"rgba(255,177,43,.10)",
      hovertemplate:"Year %{x}: %{y:.0f} MWh<extra></extra>"}];
    const lay=clone(BASE); lay.xaxis.title={text:"Project year",font:FONT};
    lay.yaxis.title={text:"MWh",font:FONT};
    const mn=Math.min(...y),mx=Math.max(...y); lay.yaxis.range=[mn*0.9,mx*1.02];
    lay.margin={l:52,r:12,t:12,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function fieldPerformance(el, records, thresholds={}){
    const rows = records.filter(r=>r.performance_pct!=null);
    const colors = rows.map(r=>r.condition==="Critical"?"#fb7185":r.condition==="Degraded"?"#f59e0b":r.condition==="Watch"?"#ffb838":"#3ee0c0");
    const x = rows.map((r,i)=>`${i+1}. ${r.asset_id}`);
    const y = rows.map(r=>r.performance_pct);
    const data=[{type:"bar", x, y, marker:{color:colors}, hovertemplate:"%{x}<br><b>%{y:.1f}%</b><extra></extra>"}];
    const warn = thresholds.warning_pct || 90, crit = thresholds.critical_pct || 80;
    data.push({type:"scatter",mode:"lines",x,y:x.map(()=>warn),line:{color:"#ffb838",width:2,dash:"dash"},hoverinfo:"skip",name:"Warning"});
    data.push({type:"scatter",mode:"lines",x,y:x.map(()=>crit),line:{color:"#fb7185",width:2,dash:"dot"},hoverinfo:"skip",name:"Critical"});
    const lay=clone(BASE); lay.margin={l:46,r:14,t:8,b:96};
    lay.yaxis.title={text:"Performance index %",font:FONT}; lay.yaxis.range=[Math.min(70, ...y)-2, Math.max(105, ...y)+2];
    lay.xaxis.tickangle=-35; lay.xaxis.tickfont={size:9,color:"#7089a8"};
    lay.legend={orientation:"h",y:1.15,font:FONT};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function fieldConditions(el, conditions){
    const labels=["Healthy","Watch","Degraded","Critical","Needs review"];
    const colors=["#3ee0c0","#ffb838","#f59e0b","#fb7185","#5aabff"];
    const vals=labels.map(k=>conditions[k]||0);
    const data=[{type:"bar",x:labels,y:vals,marker:{color:colors},hovertemplate:"%{x}: <b>%{y}</b><extra></extra>"}];
    const lay=clone(BASE); lay.margin={l:40,r:12,t:8,b:42};
    lay.yaxis.title={text:"Records",font:FONT}; lay.xaxis.tickfont={size:10,color:"#7089a8"};
    Plotly.newPlot(el,data,lay,CFG);
  }

  function exMonthly(el, custom, optimum, customLabel){
    const data=[
      {type:"bar", x:MONTHS, y:optimum, name:"Optimum", marker:{color:"#3ee0c0"}, opacity:.85,
       hovertemplate:"%{x}: <b>%{y:.0f} MWh</b> (optimum)<extra></extra>"},
      {type:"bar", x:MONTHS, y:custom, name:customLabel||"This orientation", marker:{color:"#ffb838"},
       hovertemplate:"%{x}: <b>%{y:.0f} MWh</b><extra></extra>"},
    ];
    const lay=clone(BASE); lay.barmode="group"; lay.yaxis.title={text:"MWh",font:FONT};
    lay.legend={orientation:"h",y:1.16,font:FONT}; lay.margin={l:46,r:12,t:24,b:34};
    Plotly.newPlot(el,data,lay,CFG);
  }

  return {heatmap, line, monthly, waterfall, profile, ghi, carpet, monthlyDual,
          ghiPoa, duration, sunpath, peryear, degradation, fieldPerformance,
          fieldConditions, exMonthly, MONTHS};
})();
