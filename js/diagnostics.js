/**
 * diagnostics.js — Advanced PV Diagnostics
 * Phase 3: String mismatch, Fill Factor, IV curve reconstruction, fault classification.
 * IEC 60891 | IEC 61724 | IEC 62446
 */

const PVDiagnostics = (() => {

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128269; PV Diagnostics</div>

        <div class="info-box">
          Advanced diagnostics: fill factor analysis, IV curve reconstruction, string mismatch detection,
          and rule-based fault classification. All formulas shown step-by-step.
        </div>

        <!-- TAB NAV -->
        <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap" id="diag-tabs">
          <button class="btn btn-primary btn-sm diag-tab-btn" data-tab="ff">Fill Factor</button>
          <button class="btn btn-secondary btn-sm diag-tab-btn" data-tab="iv">IV Curve</button>
          <button class="btn btn-secondary btn-sm diag-tab-btn" data-tab="mismatch">Mismatch</button>
          <button class="btn btn-secondary btn-sm diag-tab-btn" data-tab="fault">Fault Classify</button>
        </div>

        <div id="diag-content"></div>
      </div>
    `;

    container.querySelectorAll('.diag-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.diag-tab-btn').forEach(b => {
          b.className = 'btn btn-secondary btn-sm diag-tab-btn';
        });
        btn.className = 'btn btn-primary btn-sm diag-tab-btn';
        _renderTab(container, btn.dataset.tab);
      });
    });

    _renderTab(container, 'ff');
  }

  function _renderTab(container, tab) {
    const c = container.querySelector('#diag-content');
    switch (tab) {
      case 'ff':       c.innerHTML = _ffHTML();       _wireFF(c);       break;
      case 'iv':       c.innerHTML = _ivHTML();       _wireIV(c);       break;
      case 'mismatch': c.innerHTML = _mismatchHTML(); _wireMismatch(c); break;
      case 'fault':    c.innerHTML = _faultHTML();    _wireFault(c);    break;
    }
  }

  // -----------------------------------------------------------------------
  // HELPERS
  // -----------------------------------------------------------------------

  function _g(c, id) { const e = c.querySelector('#'+id); return e ? parseFloat(e.value) : NaN; }

  function _inp(id, label, ph, val, hint) {
    return `<div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-input" id="${id}" type="number" step="any" placeholder="${ph||''}" value="${val||''}" />
      ${hint ? `<div class="form-hint">${hint}</div>` : ''}
    </div>`;
  }

  function _steps(steps, verdict, cls) {
    return `<div style="margin-top:10px">
      <div class="section-title">Step-by-Step</div>
      <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8;overflow-x:auto">
        ${steps.map(s=>`<div>${s}</div>`).join('')}
      </div>
      <div class="result-box ${cls}" style="margin-top:8px">
        <div class="result-value" style="font-size:1.15rem">${verdict}</div>
      </div>
    </div>`;
  }

  // -----------------------------------------------------------------------
  // FILL FACTOR
  // -----------------------------------------------------------------------

  function _ffHTML() {
    return `
      <div class="card">
        <div class="card-title">&#9711; Fill Factor Analysis</div>
        <div class="info-box" style="margin-bottom:10px">
          FF = (Vmp &times; Imp) &divide; (Voc &times; Isc)<br>
          <strong>Benchmark:</strong> &lt;0.70 = Fault &nbsp;|&nbsp; 0.70&ndash;0.80 = Acceptable &nbsp;|&nbsp; &gt;0.80 = Good
        </div>
        <div class="form-row cols-2">
          ${_inp('ff-voc','Voc (V)','','','Open-circuit voltage')}
          ${_inp('ff-isc','Isc (A)','','','Short-circuit current')}
          ${_inp('ff-vmp','Vmp (V)','','','Maximum power point voltage')}
          ${_inp('ff-imp','Imp (A)','','','Maximum power point current')}
        </div>
        <button class="btn btn-primary btn-sm" id="ff-btn">Calculate Fill Factor</button>
        <div id="ff-result"></div>
      </div>`;
  }

  function _wireFF(c) {
    c.querySelector('#ff-btn').addEventListener('click', () => {
      const voc = _g(c,'ff-voc'), isc = _g(c,'ff-isc');
      const vmp = _g(c,'ff-vmp'), imp = _g(c,'ff-imp');
      if ([voc,isc,vmp,imp].some(isNaN)) { c.querySelector('#ff-result').innerHTML='<div class="danger-box">Enter all 4 values</div>'; return; }

      const Pmp  = vmp * imp;
      const Pmax = voc * isc;
      const FF   = Pmp / Pmax;
      const cls  = FF > 0.80 ? 'alert-safe' : FF >= 0.70 ? 'alert-warn' : 'alert-unsafe';
      const label= FF > 0.80 ? 'Good — No fill factor fault' : FF >= 0.70 ? 'Acceptable — Minor degradation possible' : 'FAULT — Significant power loss. Check bypass diodes, cell damage, shading.';

      c.querySelector('#ff-result').innerHTML = _steps([
        'Formula: FF = (Vmp \u00d7 Imp) \u00f7 (Voc \u00d7 Isc)',
        `Step 1: Pmp = Vmp \u00d7 Imp = ${vmp} \u00d7 ${imp} = ${Pmp.toFixed(3)} W`,
        `Step 2: Pmax_ideal = Voc \u00d7 Isc = ${voc} \u00d7 ${isc} = ${Pmax.toFixed(3)} W`,
        `Step 3: FF = ${Pmp.toFixed(3)} \u00f7 ${Pmax.toFixed(3)} = ${FF.toFixed(4)}`,
        `FF = ${(FF*100).toFixed(2)}%`,
        `Benchmark: <0.70 = Fault | 0.70\u20130.80 = Acceptable | >0.80 = Good`,
        label
      ], `FF = ${FF.toFixed(4)} (${(FF*100).toFixed(1)}%) \u2014 ${FF>0.80?'\u2713 Good':FF>=0.70?'\u26a0 Acceptable':'\u2717 Fault'}`, cls);
    });
  }

  // -----------------------------------------------------------------------
  // IV CURVE RECONSTRUCTION
  // -----------------------------------------------------------------------

  function _ivHTML() {
    return `
      <div class="card">
        <div class="card-title">&#128200; IV Curve Reconstruction</div>
        <div class="info-box" style="margin-bottom:10px">
          Approximates the IV curve from Voc, Isc, Vmp, Imp using a single-diode model approximation.
          Marks Isc, Pmp point, and Voc on the curve.
        </div>
        <div class="form-row cols-2">
          ${_inp('iv-voc','Voc (V)','','','STC or measured')}
          ${_inp('iv-isc','Isc (A)','','','')}
          ${_inp('iv-vmp','Vmp (V)','','','')}
          ${_inp('iv-imp','Imp (A)','','','')}
        </div>
        <button class="btn btn-primary btn-sm" id="iv-btn">Plot IV Curve</button>
        <div id="iv-result"></div>
      </div>`;
  }

  function _wireIV(c) {
    c.querySelector('#iv-btn').addEventListener('click', () => {
      const Voc = _g(c,'iv-voc'), Isc = _g(c,'iv-isc');
      const Vmp = _g(c,'iv-vmp'), Imp = _g(c,'iv-imp');
      if ([Voc,Isc,Vmp,Imp].some(isNaN)) { c.querySelector('#iv-result').innerHTML='<div class="danger-box">Enter all 4 values</div>'; return; }

      // Single-diode approximate: I(V) = Isc × [1 - C1×(exp(V/(C2×Voc)) - 1)]
      // C1, C2 fitted from Vmp, Imp
      // C2 from: Imp/Isc = 1 - C1×(exp(Vmp/(C2×Voc))-1)
      // Simple fitted approach: use empirical shape parameter
      const FF = (Vmp * Imp) / (Voc * Isc);
      // Approximate diode ideality from FF
      const vF = Vmp / Voc;
      const iF = Imp / Isc;

      // Generate IV points using piecewise quadratic approximation (reliable, no solver needed)
      const N = 60;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const V = (i / N) * Voc;
        // Approximation: I = Isc × [1 - ((V/Voc)^a)] where a controls curve shape
        // Fitted a from Vmp/Imp: at V=Vmp, I=Imp => Imp/Isc = 1 - (Vmp/Voc)^a => a = log(1-Imp/Isc)/log(Vmp/Voc)
        const a = Math.log(1 - iF) / Math.log(vF);
        const I = Math.max(0, Isc * (1 - Math.pow(V / Voc, a)));
        pts.push([V, I]);
      }

      const Ppts = pts.map(([v,i]) => [v, v*i]);
      const Pmax = Math.max(...Ppts.map(p=>p[1]));

      // SVG
      const W=320, H=200, PL=48, PR=16, PT=14, PB=36;
      const cW=W-PL-PR, cH=H-PT-PB;
      const xMax=Voc*1.02, yMaxI=Isc*1.08, yMaxP=Pmax*1.12;

      const pxV = v => PL + v/xMax*cW;
      const pyI = i => PT + cH - i/yMaxI*cH;
      const pyP = p => PT + cH - p/yMaxP*cH;

      const ivPath = pts.map(([v,i],k)=>`${k===0?'M':'L'}${pxV(v).toFixed(1)},${pyI(i).toFixed(1)}`).join(' ');
      const pvPath = Ppts.map(([v,p],k)=>`${k===0?'M':'L'}${pxV(v).toFixed(1)},${pyP(p).toFixed(1)}`).join(' ');

      // Axis ticks
      const vTicks = [0,Vmp,Voc].map(v=>`
        <line x1="${pxV(v).toFixed(1)}" y1="${PT}" x2="${pxV(v).toFixed(1)}" y2="${PT+cH}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,2"/>
        <text x="${pxV(v).toFixed(1)}" y="${PT+cH+12}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${v.toFixed(1)}</text>`).join('');

      const iTicks = [0,Imp,Isc].map(i=>`
        <line x1="${PL}" y1="${pyI(i).toFixed(1)}" x2="${PL+cW}" y2="${pyI(i).toFixed(1)}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,2"/>
        <text x="${PL-3}" y="${(pyI(i)+3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">${i.toFixed(2)}</text>`).join('');

      const svg = `
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:8px auto 0">
          ${vTicks}${iTicks}
          <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
          <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
          <!-- PV curve (orange dashed) -->
          <path d="${pvPath}" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5,3"/>
          <!-- IV curve (blue) -->
          <path d="${ivPath}" fill="none" stroke="#0284c7" stroke-width="2"/>
          <!-- Key points -->
          <circle cx="${pxV(0).toFixed(1)}" cy="${pyI(Isc).toFixed(1)}" r="4" fill="#dc2626"/>
          <text x="${(pxV(0)+6).toFixed(1)}" y="${(pyI(Isc)-4).toFixed(1)}" font-size="8" fill="#dc2626">Isc=${Isc.toFixed(2)}A</text>
          <circle cx="${pxV(Vmp).toFixed(1)}" cy="${pyI(Imp).toFixed(1)}" r="4" fill="#16a34a"/>
          <text x="${(pxV(Vmp)+5).toFixed(1)}" y="${(pyI(Imp)-4).toFixed(1)}" font-size="8" fill="#16a34a">Pmp</text>
          <circle cx="${pxV(Voc).toFixed(1)}" cy="${pyI(0).toFixed(1)}" r="4" fill="#dc2626"/>
          <text x="${(pxV(Voc)-5).toFixed(1)}" y="${(pyI(0)+12).toFixed(1)}" text-anchor="end" font-size="8" fill="#dc2626">Voc=${Voc.toFixed(1)}V</text>
          <!-- Legend -->
          <line x1="60" y1="10" x2="74" y2="10" stroke="#0284c7" stroke-width="2"/>
          <text x="77" y="13" font-size="8" fill="var(--text-secondary)">I-V</text>
          <line x1="98" y1="10" x2="112" y2="10" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4,2"/>
          <text x="115" y="13" font-size="8" fill="var(--text-secondary)">P-V</text>
          <!-- Axis labels -->
          <text x="${PL+cW/2}" y="${H-1}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">Voltage (V)</text>
          <text x="10" y="${PT+cH/2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" transform="rotate(-90,10,${PT+cH/2})">Current (A)</text>
        </svg>`;

      const FF2 = (Vmp*Imp)/(Voc*Isc);
      c.querySelector('#iv-result').innerHTML = `
        ${svg}
        <div style="font-size:0.78rem;color:var(--text-muted);text-align:center;margin-top:4px">Blue = I-V curve &nbsp;|&nbsp; Orange dashed = P-V curve &nbsp;|&nbsp; Green dot = Pmp point</div>
        <div class="section-title" style="margin-top:10px">Key Parameters</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>Voc = ${Voc.toFixed(2)} V &nbsp;|&nbsp; Isc = ${Isc.toFixed(3)} A</div>
          <div>Vmp = ${Vmp.toFixed(2)} V &nbsp;|&nbsp; Imp = ${Imp.toFixed(3)} A</div>
          <div>Pmp = ${(Vmp*Imp).toFixed(2)} W &nbsp;|&nbsp; Pmax_ideal = ${(Voc*Isc).toFixed(2)} W</div>
          <div>Fill Factor = ${FF2.toFixed(4)} (${(FF2*100).toFixed(1)}%)</div>
          <div>Curve shape parameter a = ${(Math.log(1-Imp/Isc)/Math.log(Vmp/Voc)).toFixed(4)}</div>
        </div>`;
    });
  }

  // -----------------------------------------------------------------------
  // STRING MISMATCH
  // -----------------------------------------------------------------------

  function _mismatchHTML() {
    return `
      <div class="card">
        <div class="card-title">&#9889; String Mismatch Detection</div>
        <div class="info-box" style="margin-bottom:10px">
          Enter measured Voc and Isc for each string. Mismatch is calculated as deviation from the mean.
          <strong>Threshold:</strong> &gt;5% = Warning &nbsp;|&nbsp; &gt;10% = Critical
        </div>

        <div id="mm-rows"></div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="mm-add">+ Add String</button>
          <button class="btn btn-primary btn-sm" id="mm-calc">Analyse Mismatch</button>
        </div>
        <div id="mm-result"></div>
      </div>`;
  }

  function _wireMismatch(c) {
    const addRow = (idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
      row.innerHTML = `
        <span style="font-size:0.78rem;color:var(--text-muted);min-width:52px">String ${idx+1}</span>
        <input class="form-input mm-voc" type="number" step="any" placeholder="Voc (V)" style="flex:1;min-width:80px" />
        <input class="form-input mm-isc" type="number" step="any" placeholder="Isc (A)" style="flex:1;min-width:80px" />
        <button class="btn btn-danger btn-sm" style="padding:2px 8px" onclick="this.parentElement.remove()">&times;</button>`;
      c.querySelector('#mm-rows').appendChild(row);
    };

    // Start with 4 rows
    for (let i = 0; i < 4; i++) addRow(i);
    let cnt = 4;

    c.querySelector('#mm-add').addEventListener('click', () => addRow(cnt++));
    c.querySelector('#mm-calc').addEventListener('click', () => {
      const rows = [...c.querySelectorAll('#mm-rows > div')];
      const strings = rows.map((r, i) => ({
        idx: i+1,
        voc: parseFloat(r.querySelector('.mm-voc').value),
        isc: parseFloat(r.querySelector('.mm-isc').value)
      })).filter(s => !isNaN(s.voc) && !isNaN(s.isc));

      if (strings.length < 2) { c.querySelector('#mm-result').innerHTML='<div class="danger-box">Need at least 2 strings</div>'; return; }

      const vocs = strings.map(s=>s.voc), iscs = strings.map(s=>s.isc);
      const meanVoc = vocs.reduce((a,v)=>a+v,0)/vocs.length;
      const meanIsc = iscs.reduce((a,v)=>a+v,0)/iscs.length;

      const results = strings.map(s => ({
        ...s,
        vocDev: (s.voc - meanVoc)/meanVoc*100,
        iscDev: (s.isc - meanIsc)/meanIsc*100
      }));

      const maxVocDev = Math.max(...results.map(r=>Math.abs(r.vocDev)));
      const maxIscDev = Math.max(...results.map(r=>Math.abs(r.iscDev)));
      const overall   = Math.max(maxVocDev, maxIscDev);
      const cls       = overall > 10 ? 'alert-unsafe' : overall > 5 ? 'alert-warn' : 'alert-safe';

      const tableRows = results.map(r => {
        const vCls = Math.abs(r.vocDev)>10?'#dc2626':Math.abs(r.vocDev)>5?'#ca8a04':'var(--success)';
        const iCls = Math.abs(r.iscDev)>10?'#dc2626':Math.abs(r.iscDev)>5?'#ca8a04':'var(--success)';
        return `<tr>
          <td>String ${r.idx}</td>
          <td>${r.voc.toFixed(2)}</td>
          <td style="color:${vCls};font-weight:600">${r.vocDev>=0?'+':''}${r.vocDev.toFixed(2)}%</td>
          <td>${r.isc.toFixed(3)}</td>
          <td style="color:${iCls};font-weight:600">${r.iscDev>=0?'+':''}${r.iscDev.toFixed(2)}%</td>
        </tr>`;
      }).join('');

      c.querySelector('#mm-result').innerHTML = `
        <div style="margin-top:12px">
          <div class="section-title">Step-by-Step</div>
          <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
            <div>n = ${strings.length} strings</div>
            <div>Mean Voc = (${vocs.map(v=>v.toFixed(2)).join(' + ')}) / ${strings.length} = ${meanVoc.toFixed(2)} V</div>
            <div>Mean Isc = (${iscs.map(v=>v.toFixed(3)).join(' + ')}) / ${strings.length} = ${meanIsc.toFixed(3)} A</div>
            <div>Deviation = (measured \u2212 mean) / mean \u00d7 100%</div>
          </div>
          <div style="overflow-x:auto;margin-top:10px">
            <table class="status-table">
              <thead><tr><th>String</th><th>Voc</th><th>Voc Dev%</th><th>Isc</th><th>Isc Dev%</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
          <div class="result-box ${cls}" style="margin-top:10px">
            <div class="result-value">Max Mismatch: ${overall.toFixed(2)}%</div>
            <div class="result-unit">${overall>10?'\u2717 CRITICAL \u2014 investigate shading, diode failure, or soiling':overall>5?'\u26a0 WARNING \u2014 check string wiring and modules':'\u2713 Within tolerance \u2014 mismatch acceptable'}</div>
          </div>
        </div>`;
    });
  }

  // -----------------------------------------------------------------------
  // FAULT CLASSIFICATION
  // -----------------------------------------------------------------------

  function _faultHTML() {
    return `
      <div class="card">
        <div class="card-title">&#9888; Fault Classification</div>
        <div class="info-box" style="margin-bottom:10px">
          Enter measured string parameters. Rule-based engine classifies the most likely fault type
          with confidence score.
        </div>
        <div class="form-row cols-2">
          ${_inp('fc-voc-meas','Measured Voc (V)','','','')}
          ${_inp('fc-voc-exp','Expected Voc (V)','','','Temperature-corrected expected')}
          ${_inp('fc-isc-meas','Measured Isc (A)','','','')}
          ${_inp('fc-isc-exp','Expected Isc (A)','','','Irradiance-corrected expected')}
          ${_inp('fc-ff','Fill Factor (0-1)','','','From Vmp/Imp measurement')}
          ${_inp('fc-temp','Module Temp (&deg;C)','','','Back-of-panel measured')}
          ${_inp('fc-deg','Degradation Rate (%/yr)','','','From trend analysis')}
        </div>
        <button class="btn btn-primary btn-sm" id="fc-btn">Classify Fault</button>
        <div id="fc-result"></div>
      </div>`;
  }

  function _wireFault(c) {
    c.querySelector('#fc-btn').addEventListener('click', () => {
      const vocM = _g(c,'fc-voc-meas'), vocE = _g(c,'fc-voc-exp');
      const iscM = _g(c,'fc-isc-meas'), iscE = _g(c,'fc-isc-exp');
      const FF   = _g(c,'fc-ff');
      const T    = _g(c,'fc-temp');
      const deg  = _g(c,'fc-deg');

      const vocDev = (!isNaN(vocM)&&!isNaN(vocE)&&vocE>0) ? (vocM-vocE)/vocE*100 : NaN;
      const iscDev = (!isNaN(iscM)&&!isNaN(iscE)&&iscE>0) ? (iscM-iscE)/iscE*100 : NaN;

      const scores = detectFault(vocDev, iscDev, FF, T, deg);

      const rows = scores.map((s,i)=>`
        <tr>
          <td style="font-weight:600">${i===0?'&#128269; ':''}${s.name}</td>
          <td>
            <div style="background:var(--bg-3);border-radius:4px;overflow:hidden;height:14px;width:100%">
              <div style="width:${s.confidence}%;height:14px;background:${i===0?'var(--primary)':'var(--border)'}"></div>
            </div>
          </td>
          <td style="font-weight:700;color:${i===0?'var(--primary)':'var(--text-secondary)'};min-width:44px">${s.confidence}%</td>
          <td style="font-size:0.75rem;color:var(--text-muted)">${s.reason}</td>
        </tr>`).join('');

      const primary = scores[0];
      const cls = primary.confidence > 70 ? 'alert-unsafe' : primary.confidence > 40 ? 'alert-warn' : 'alert-safe';

      c.querySelector('#fc-result').innerHTML = `
        <div style="margin-top:12px">
          <div class="section-title">Evidence Used</div>
          <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
            ${!isNaN(vocDev)?`<div>Voc deviation: ${vocDev.toFixed(2)}%</div>`:''}
            ${!isNaN(iscDev)?`<div>Isc deviation: ${iscDev.toFixed(2)}%</div>`:''}
            ${!isNaN(FF)?`<div>Fill Factor: ${FF.toFixed(3)} (${(FF*100).toFixed(1)}%)</div>`:''}
            ${!isNaN(T)?`<div>Module temp: ${T}&deg;C</div>`:''}
            ${!isNaN(deg)?`<div>Degradation rate: ${deg}%/yr</div>`:''}
          </div>
          <div class="section-title" style="margin-top:10px">Fault Scores</div>
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
            <tbody>${rows}</tbody>
          </table>
          <div class="result-box ${cls}" style="margin-top:10px">
            <div class="result-label">Primary Fault</div>
            <div class="result-value">${primary.name}</div>
            <div class="result-unit">Confidence: ${primary.confidence}% &nbsp;|&nbsp; ${primary.action}</div>
          </div>
        </div>`;
    });
  }

  // -----------------------------------------------------------------------
  // FAULT DETECTION ENGINE
  // -----------------------------------------------------------------------

  function detectFault(vocDev, iscDev, FF, T, degRate) {
    const faults = [
      {
        name: 'PID (Potential-Induced Degradation)',
        score: () => {
          let s = 0;
          if (!isNaN(vocDev) && vocDev < -5)  s += 30;
          if (!isNaN(vocDev) && vocDev < -10) s += 20;
          if (!isNaN(iscDev) && iscDev < -3)  s += 15;
          if (!isNaN(FF) && FF < 0.72)        s += 20;
          if (!isNaN(degRate) && degRate > 1.0) s += 15;
          return s;
        },
        reason: 'High voltage negative-to-ground leakage. Check grounding, humidity.',
        action: 'Verify system grounding, install PID recovery box, check n-type upgrade.'
      },
      {
        name: 'LID (Light-Induced Degradation)',
        score: () => {
          let s = 0;
          if (!isNaN(vocDev) && vocDev > -4 && vocDev < 0) s += 25;
          if (!isNaN(iscDev) && iscDev > -4 && iscDev < 0) s += 25;
          if (!isNaN(degRate) && degRate > 0.5 && degRate < 1.5) s += 30;
          if (!isNaN(FF) && FF > 0.72 && FF < 0.78) s += 20;
          return s;
        },
        reason: 'Early-life power loss from boron-oxygen defects in p-type cells.',
        action: 'Expected in Year 1. If persists after Year 2, may indicate PID or soiling.'
      },
      {
        name: 'Hotspot / Shading',
        score: () => {
          let s = 0;
          if (!isNaN(iscDev) && iscDev < -10) s += 40;
          if (!isNaN(iscDev) && iscDev < -20) s += 20;
          if (!isNaN(vocDev) && vocDev > -3 && iscDev < -8) s += 20;
          if (!isNaN(T) && T > 75) s += 20;
          if (!isNaN(FF) && FF < 0.70) s += 10;
          return s;
        },
        reason: 'Current drop with normal voltage = bypass diode activation from shading/hotspot.',
        action: 'Inspect for shading, soiling, cracked cells. IR thermal scan recommended.'
      },
      {
        name: 'Bypass Diode Failure',
        score: () => {
          let s = 0;
          // Signature: Voc drops by ~1/3 multiples
          if (!isNaN(vocDev) && vocDev < -28 && vocDev > -38) s += 60;
          if (!isNaN(vocDev) && vocDev < -61 && vocDev > -72) s += 60;
          if (!isNaN(iscDev) && Math.abs(iscDev) < 5 && !isNaN(vocDev) && vocDev < -25) s += 25;
          return s;
        },
        reason: 'Voc drops ~33% per failed diode. Normal Isc with low Voc is the key signature.',
        action: 'Replace faulty bypass diodes. Check junction box for overheating marks.'
      },
      {
        name: 'Soiling / Dust',
        score: () => {
          let s = 0;
          if (!isNaN(iscDev) && iscDev < -5 && iscDev > -20) s += 35;
          if (!isNaN(vocDev) && vocDev > -5 && !isNaN(iscDev) && iscDev < -5) s += 30;
          if (!isNaN(FF) && FF > 0.75) s += 20;  // FF often OK with soiling
          return s;
        },
        reason: 'Isc reduced, Voc near-normal. Consistent with uniform irradiance reduction.',
        action: 'Clean modules. Schedule regular cleaning for Sri Lanka dust/pollen season.'
      },
      {
        name: 'General Aging',
        score: () => {
          let s = 0;
          if (!isNaN(degRate) && degRate > 0.3 && degRate < 0.8) s += 40;
          if (!isNaN(FF) && FF > 0.74 && FF < 0.80) s += 30;
          if (!isNaN(vocDev) && vocDev > -5 && vocDev < 0) s += 20;
          return s;
        },
        reason: 'Slow, steady decline across all parameters — normal module aging.',
        action: 'Monitor annually. No immediate action if within warranty degradation rate.'
      },
    ];

    const scored = faults.map(f => ({
      name: f.name, reason: f.reason, action: f.action,
      confidence: Math.min(95, f.score())
    })).sort((a,b) => b.confidence - a.confidence);

    // Normalize top 3 so they sum to 100 (visual only)
    const total = scored.slice(0,3).reduce((s,f)=>s+f.confidence, 0) || 1;
    return scored.slice(0, 4).map(f => ({...f, confidence: Math.round(f.confidence/total*100)}));
  }

  return { render, detectFault };
})();
