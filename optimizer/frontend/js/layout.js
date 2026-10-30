/* ===== Array arrangement + module structure visuals (SVG) ===== */
const LAYOUT = (() => {

  function arrayView(p){
    // p: tilt, gcr, pitch, collector_w, height, modules_per_row, orientation
    const W=760, H=300, groundY=238, marginL=64;
    const tiltDeg = p.tilt, tilt = tiltDeg*Math.PI/180;
    const Lm = Math.max(p.collector_w, 0.5);          // slant length (m)
    const rows = 3;
    // auto-fit scale (px per metre) so 3 rows fit
    const spanM = (rows-1)*p.pitch + Lm*Math.cos(tilt) + 0.6;
    const avail = W - marginL - 26;
    const scale = Math.min(46, avail/spanM);
    const Lpx = Lm*scale, pitchPx = p.pitch*scale, hpx = Math.max(p.height*scale, 10);
    const sun = {x:70, y:54};

    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="svgwrap">`;
    s += `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0e1c30"/><stop offset="1" stop-color="#13243d"/></linearGradient>
      <linearGradient id="pan" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1b3b66"/><stop offset="1" stop-color="#2f6ab0"/></linearGradient>
      <radialGradient id="sung" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffe39a"/><stop offset="1" stop-color="#ffb838"/></radialGradient>
    </defs>`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>`;
    // ground
    s += `<rect x="0" y="${groundY}" width="${W}" height="${H-groundY}" fill="#1a2a16" opacity="0.6"/>`;
    s += `<line x1="0" y1="${groundY}" x2="${W}" y2="${groundY}" stroke="#3a5a2e" stroke-width="2"/>`;
    // sun + rays
    s += `<circle cx="${sun.x}" cy="${sun.y}" r="17" fill="url(#sung)"/>`;
    for(let a=0;a<360;a+=45){const r1=20,r2=28,rad=a*Math.PI/180;
      s+=`<line x1="${sun.x+r1*Math.cos(rad)}" y1="${sun.y+r1*Math.sin(rad)}" x2="${sun.x+r2*Math.cos(rad)}" y2="${sun.y+r2*Math.sin(rad)}" stroke="#ffce5a" stroke-width="2"/>`;}

    const dx = Lpx*Math.cos(tilt), dy = Lpx*Math.sin(tilt);
    for(let i=0;i<rows;i++){
      const x0 = marginL + i*pitchPx, y0 = groundY - hpx;     // bottom-front
      const x1 = x0 + dx, y1 = y0 - dy;                        // top of panel
      // support post + leg
      const cx = (x0+x1)/2, cy=(y0+y1)/2;
      s += `<line x1="${cx}" y1="${cy+3}" x2="${cx}" y2="${groundY}" stroke="#5b6b80" stroke-width="3"/>`;
      s += `<line x1="${x0}" y1="${y0}" x2="${x0+6}" y2="${groundY}" stroke="#46566b" stroke-width="2"/>`;
      // panel as thick tilted bar
      const th=7, nx=Math.sin(tilt)*th, ny=Math.cos(tilt)*th;
      s += `<polygon points="${x0},${y0} ${x1},${y1} ${x1-nx},${y1+ny} ${x0-nx},${y0+ny}" fill="url(#pan)" stroke="#7fb4ef" stroke-width="1"/>`;
      // cell division ticks along the panel
      const ncell=6;
      for(let c=1;c<ncell;c++){const t=c/ncell; const px=x0+dx*t, py=y0-dy*t;
        s+=`<line x1="${px}" y1="${py}" x2="${px-nx}" y2="${py+ny}" stroke="#11233b" stroke-width="1" opacity="0.7"/>`;}
      if(i===0){
        // tilt angle arc + label
        s += `<path d="M ${x0+34} ${y0} A 34 34 0 0 0 ${x0+34*Math.cos(tilt)} ${y0-34*Math.sin(tilt)}" fill="none" stroke="#ffb838" stroke-width="1.5"/>`;
        s += `<line x1="${x0}" y1="${y0}" x2="${x0+52}" y2="${y0}" stroke="#ffb838" stroke-width="1" stroke-dasharray="3 3"/>`;
        s += `<text x="${x0+40}" y="${y0-8}" fill="#ffce5a" font-size="12" font-weight="700">β=${tiltDeg.toFixed(0)}°</text>`;
        // height dimension
        s += dim(x0-20, groundY, x0-20, y0, `${p.height.toFixed(1)} m`, "v");
      }
      if(i===0){
        // pitch dimension between row 0 and row 1
        s += dim(x0, groundY+22, x0+pitchPx, groundY+22, `pitch ${p.pitch.toFixed(2)} m`, "h");
      }
    }
    // GCR badge
    s += `<g transform="translate(${W-150},18)"><rect width="136" height="44" rx="8" fill="#0d1a2c" stroke="#2b3f5e"/>
      <text x="10" y="18" fill="#aabfda" font-size="11">Ground-cover ratio</text>
      <text x="10" y="36" fill="#3ee0c0" font-size="16" font-weight="700">GCR ${p.gcr.toFixed(2)}</text></g>`;
    s += `</svg>`;
    return s;
  }

  function dim(x1,y1,x2,y2,label,dir){
    const col="#7089a8";
    let s=`<g font-size="10" fill="${col}">`;
    s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1"/>`;
    // arrow caps
    s+=cap(x1,y1,dir,1)+cap(x2,y2,dir,-1);
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    if(dir==="h") s+=`<text x="${mx}" y="${my+13}" text-anchor="middle">${label}</text>`;
    else s+=`<text x="${x1-6}" y="${my}" text-anchor="end">${label}</text>`;
    return s+`</g>`;
  }
  function cap(x,y,dir,d){
    if(dir==="h") return `<path d="M ${x} ${y} l ${5*d} -3 l 0 6 z" fill="#7089a8"/>`;
    return `<path d="M ${x} ${y} l -3 ${5*d} l 6 0 z" fill="#7089a8"/>`;
  }

  function moduleView(p){
    // p: length_m, width_m, cells, bifaciality, pmpp, orientation, model
    const W=240, H=312, pad=16;
    const portrait = p.orientation!=="landscape";
    const Lm = p.length_m, Wm = p.width_m;
    const longSide = portrait?Lm:Wm, shortSide = portrait?Wm:Lm;
    const maxW=W-2*pad, maxH=H-2*pad-26;
    let pw, ph;
    if(portrait){ ph=maxH; pw=ph*(Wm/Lm); if(pw>maxW){pw=maxW; ph=pw*(Lm/Wm);} }
    else { pw=maxW; ph=pw*(Wm/Lm); if(ph>maxH){ph=maxH; pw=ph*(Lm/Wm);} }
    const x0=(W-pw)/2, y0=20;
    const cols=6, rows=Math.max(2,Math.round(p.cells/6));
    let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="svgwrap">`;
    s+=`<defs><linearGradient id="cell" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#16365f"/><stop offset="1" stop-color="#0f2742"/></linearGradient></defs>`;
    // frame
    s+=`<rect x="${x0-4}" y="${y0-4}" width="${pw+8}" height="${ph+8}" rx="5" fill="#c9d3e0" opacity="0.9"/>`;
    s+=`<rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="url(#cell)"/>`;
    // half-cut centre gap
    const gap=4, half=(ph-gap)/2;
    // cells (two halves)
    const cw=pw/cols;
    [0,1].forEach(hh=>{
      const yy=y0+hh*(half+gap), rr=Math.round(rows/2);
      const ch=half/rr;
      for(let r=0;r<rr;r++) for(let c=0;c<cols;c++){
        s+=`<rect x="${x0+c*cw+0.7}" y="${yy+r*ch+0.7}" width="${cw-1.4}" height="${ch-1.4}" fill="#10395f" stroke="#1d4f80" stroke-width="0.4"/>`;
      }
    });
    // busbars (vertical lines)
    for(let c=1;c<cols;c++) s+=`<line x1="${x0+c*cw}" y1="${y0}" x2="${x0+c*cw}" y2="${y0+ph}" stroke="#0a1726" stroke-width="1"/>`;
    s+=`<line x1="${x0}" y1="${y0+half+gap/2}" x2="${x0+pw}" y2="${y0+half+gap/2}" stroke="#0a1726" stroke-width="2"/>`;
    // junction box
    s+=`<rect x="${x0+pw/2-9}" y="${y0+ph}" width="18" height="6" fill="#2b3540"/>`;
    // dimension labels
    s+=`<text x="${x0+pw/2}" y="${y0+ph+22}" text-anchor="middle" fill="#aabfda" font-size="11">${Wm.toFixed(3)} m wide</text>`;
    s+=`<text x="${x0-9}" y="${y0+ph/2}" text-anchor="middle" fill="#aabfda" font-size="11" transform="rotate(-90 ${x0-9} ${y0+ph/2})">${Lm.toFixed(3)} m</text>`;
    // spec chip
    s+=`<g transform="translate(${W/2-70},${H-22})">
      <rect width="140" height="20" rx="10" fill="#0d1a2c" stroke="#2b3f5e"/>
      <text x="70" y="14" text-anchor="middle" fill="#ffce5a" font-size="11" font-weight="700">${p.pmpp} Wp · ${p.cells} cells${p.bifaciality>0?" · bifacial":""}</text></g>`;
    s+=`</svg>`;
    return s;
  }

  function azimuthCompass(p){
    // p: azimuth (deg, 0=N 90=E 180=S 270=W), lat, tilt
    const W=250, H=312, cx=125, cy=150, R=94;
    const A = p.azimuth*Math.PI/180;
    const fx=Math.sin(A), fy=-Math.cos(A);            // facing unit vector (screen)
    const px=Math.cos(A), py=Math.sin(A);             // row direction (perp)
    const dirName=(a=>{const d=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW","N"];return d[Math.round(a/22.5)];})(p.azimuth);
    const refAz = (p.lat>=0)?180:0;                    // hemisphere reference only
    const dev = p.azimuth-refAz;
    const devTxt = Math.abs(dev)<0.5 ? `due ${p.lat>=0?"south":"north"}`
                 : `${Math.abs(dev).toFixed(0)}° ${dev>0?"west":"east"} of ${p.lat>=0?"south":"north"}`;

    let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="svgwrap">`;
    s+=`<defs><radialGradient id="cdisc" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stop-color="#16263f"/><stop offset="1" stop-color="#0e1c30"/></radialGradient></defs>`;
    s+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#cdisc)" stroke="#2b3f5e" stroke-width="1.5"/>`;
    s+=`<circle cx="${cx}" cy="${cy}" r="${R*0.66}" fill="none" stroke="#1b2b45" stroke-width="1"/>`;
    // tick marks every 30deg
    for(let a=0;a<360;a+=30){const r=a*Math.PI/180, s1=R-(a%90===0?12:6);
      s+=`<line x1="${cx+s1*Math.sin(r)}" y1="${cy-s1*Math.cos(r)}" x2="${cx+R*Math.sin(r)}" y2="${cy-R*Math.cos(r)}" stroke="#3a4f6e" stroke-width="${a%90===0?2:1}"/>`;}
    // cardinal labels
    const card=[["N",0],["E",90],["S",180],["W",270]];
    card.forEach(([t,a])=>{const r=a*Math.PI/180, rr=R+13;
      s+=`<text x="${cx+rr*Math.sin(r)}" y="${cy-rr*Math.cos(r)+4}" text-anchor="middle" fill="${t==='S'&&p.lat>=0||t==='N'&&p.lat<0?'#ffce5a':'#8aa0c0'}" font-size="13" font-weight="700">${t}</text>`;});
    // hemisphere reference (dashed); weather optimum can differ materially
    const rA=refAz*Math.PI/180;
    s+=`<line x1="${cx}" y1="${cy}" x2="${cx+R*0.9*Math.sin(rA)}" y2="${cy-R*0.9*Math.cos(rA)}" stroke="#46566b" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    // panel rows (perp to facing), shifted along facing
    const rowLen=R*0.62, gap=15;
    for(let k=-2;k<=2;k++){
      const ox=cx+k*gap*fx, oy=cy+k*gap*fy;
      const x1=ox-rowLen*px, y1=oy-rowLen*py, x2=ox+rowLen*px, y2=oy+rowLen*py;
      s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2f6ab0" stroke-width="6" stroke-linecap="round" opacity="${k===0?1:0.55}"/>`;
    }
    // facing arrow
    const tipx=cx+R*0.82*fx, tipy=cy+R*0.82*fy;
    s+=`<line x1="${cx}" y1="${cy}" x2="${tipx}" y2="${tipy}" stroke="#ffb838" stroke-width="3"/>`;
    const ah=12, aa=Math.PI/7;
    const left=[tipx-ah*(fx*Math.cos(aa)-fy*Math.sin(aa)), tipy-ah*(fy*Math.cos(aa)+fx*Math.sin(aa))];
    const right=[tipx-ah*(fx*Math.cos(-aa)-fy*Math.sin(-aa)), tipy-ah*(fy*Math.cos(-aa)+fx*Math.sin(-aa))];
    s+=`<polygon points="${tipx},${tipy} ${left[0]},${left[1]} ${right[0]},${right[1]}" fill="#ffb838"/>`;
    s+=`<circle cx="${cx}" cy="${cy}" r="4" fill="#ffce5a"/>`;
    // labels
    s+=`<text x="${cx}" y="${H-44}" text-anchor="middle" fill="#ffce5a" font-size="17" font-weight="700">${p.azimuth.toFixed(0)}° · ${dirName}</text>`;
    s+=`<text x="${cx}" y="${H-26}" text-anchor="middle" fill="#aabfda" font-size="11">panels face ${dirName} (${devTxt})</text>`;
    s+=`<text x="${cx}" y="${H-10}" text-anchor="middle" fill="#6f84a3" font-size="10">arrow = facing · dashed = hemisphere reference</text>`;
    s+=`</svg>`;
    return s;
  }

  return {arrayView, moduleView, azimuthCompass};
})();
