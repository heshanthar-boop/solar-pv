/**
 * inverter-perf.js — Inverter & System Performance
 * Phase 4: Efficiency, loss breakdown, efficiency curve, AC/DC ratio.
 */

const InverterPerf = (() => {

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9889; Inverter Performance</div>

        <div class="info-box">
          Calculate inverter efficiency, loss breakdown, and AC/DC ratio.
          Efficiency curve benchmarked against typical string inverter profile.
          Formula: &eta; = P_AC &divide; P_DC &times; 100%
        </div>

        <!-- EFFICIENCY CALCULATOR -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128200; Efficiency &amp; Loss Breakdown</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">DC Input Power P_DC (W)</label>
              <input class="form-input" id="ip-pdc" type="number" step="any" placeholder="e.g. 5800" />
              <div class="form-hint">Measured at inverter DC terminals</div>
            </div>
            <div class="form-group">
              <label class="form-label">AC Output Power P_AC (W)</label>
              <input class="form-input" id="ip-pac" type="number" step="any" placeholder="e.g. 5600" />
              <div class="form-hint">Measured at inverter AC output</div>
            </div>
            <div class="form-group">
              <label class="form-label">Inverter Rated Power (W)</label>
              <input class="form-input" id="ip-prated" type="number" step="any" placeholder="e.g. 6000" />
              <div class="form-hint">Nameplate AC rated power</div>
            </div>
            <div class="form-group">
              <label class="form-label">Inverter Temp (&deg;C)</label>
              <input class="form-input" id="ip-temp" type="number" step="any" placeholder="e.g. 45" />
              <div class="form-hint">Heatsink or ambient near inverter</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="ip-calc-btn">Calculate</button>
          <div id="ip-result"></div>
        </div>

        <!-- EFFICIENCY CURVE -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128200; Efficiency Curve vs Load %</div>
          <div class="info-box" style="margin-bottom:8px">
            Typical string inverter efficiency curve. Enter rated power to overlay your measurement.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Rated Power (W)</label>
              <input class="form-input" id="ec-rated" type="number" step="any" placeholder="e.g. 6000" />
            </div>
            <div class="form-group">
              <label class="form-label">Your P_DC (W) <span style="color:var(--text-muted)">(optional)</span></label>
              <input class="form-input" id="ec-pdc" type="number" step="any" placeholder="to mark on curve" />
            </div>
            <div class="form-group">
              <label class="form-label">Your P_AC (W) <span style="color:var(--text-muted)">(optional)</span></label>
              <input class="form-input" id="ec-pac" type="number" step="any" placeholder="" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="ec-btn">Plot Curve</button>
          <div id="ec-result"></div>
        </div>

        <!-- AC/DC RATIO -->
        <div class="card">
          <div class="card-title">&#9889; AC/DC Sizing Ratio Check</div>
          <div class="info-box" style="margin-bottom:8px">
            Sri Lanka rule: P_inverter_AC &ge; 0.85 &times; P_array_DC. Ratio 0.85&ndash;1.05 optimal.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Array DC Capacity (kWp)</label>
              <input class="form-input" id="ar-pdc" type="number" step="any" placeholder="e.g. 6.6" />
            </div>
            <div class="form-group">
              <label class="form-label">Inverter AC Rating (kW)</label>
              <input class="form-input" id="ar-pac" type="number" step="any" placeholder="e.g. 6.0" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="ar-btn">Check Ratio</button>
          <div id="ar-result"></div>
        </div>
      </div>
    `;

    container.querySelector('#ip-calc-btn').addEventListener('click', () => _calcEfficiency(container));
    container.querySelector('#ec-btn').addEventListener('click', () => _plotCurve(container));
    container.querySelector('#ar-btn').addEventListener('click', () => _calcRatio(container));
  }

  // -----------------------------------------------------------------------
  // EFFICIENCY & LOSS
  // -----------------------------------------------------------------------

  function inverterEfficiency(Pdc, Pac, Prated, T) {
    const eta        = Pac / Pdc;
    const Ploss      = Pdc - Pac;
    const loadPct    = Pdc / Prated * 100;
    // Loss breakdown (empirical model)
    const P_conv     = Ploss * 0.55;   // switching/conversion
    const P_thermal  = Ploss * 0.30;   // thermal / heatsink
    const P_wiring   = Ploss * 0.15;   // internal wiring
    // Temperature derating (>40°C typically loses 0.3%/°C)
    const T_derate   = (!isNaN(T) && T > 40) ? (T - 40) * 0.003 : 0;
    const eta_derated = Math.max(0, eta - T_derate);
    return { eta, eta_derated, Ploss, P_conv, P_thermal, P_wiring, loadPct, T_derate };
  }

  function _calcEfficiency(container) {
    const Pdc    = parseFloat(container.querySelector('#ip-pdc').value);
    const Pac    = parseFloat(container.querySelector('#ip-pac').value);
    const Prated = parseFloat(container.querySelector('#ip-prated').value);
    const T      = parseFloat(container.querySelector('#ip-temp').value);
    const res    = container.querySelector('#ip-result');

    if (isNaN(Pdc)||isNaN(Pac)||isNaN(Prated)) { res.innerHTML='<div class="danger-box">Enter P_DC, P_AC and rated power</div>'; return; }
    if (Pac > Pdc) { res.innerHTML='<div class="danger-box">P_AC cannot exceed P_DC — check measurement</div>'; return; }

    const e   = inverterEfficiency(Pdc, Pac, Prated, T);
    const cls = e.eta > 0.96 ? 'alert-safe' : e.eta > 0.93 ? 'alert-warn' : 'alert-unsafe';

    res.innerHTML = `
      <div style="margin-top:10px">
        <div class="section-title">Step-by-Step</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>Formula: \u03b7 = P_AC \u00f7 P_DC \u00d7 100%</div>
          <div>Step 1: P_DC = ${Pdc} W, P_AC = ${Pac} W</div>
          <div>Step 2: \u03b7 = ${Pac} \u00f7 ${Pdc} = ${e.eta.toFixed(5)}</div>
          <div>Step 3: \u03b7 = ${(e.eta*100).toFixed(2)}%</div>
          <div>Step 4: Load = P_DC / P_rated = ${Pdc} / ${Prated} = ${e.loadPct.toFixed(1)}%</div>
          <div>Step 5: Total loss = ${Pdc} \u2212 ${Pac} = ${e.Ploss.toFixed(1)} W</div>
          <div> &nbsp; Conversion loss (switching) \u2248 55% = ${e.P_conv.toFixed(1)} W</div>
          <div> &nbsp; Thermal loss (heatsink) \u2248 30% = ${e.P_thermal.toFixed(1)} W</div>
          <div> &nbsp; Wiring/standby loss \u2248 15% = ${e.P_wiring.toFixed(1)} W</div>
          ${!isNaN(T) ? `<div>Step 6: Temp derating: T=${T}\u00b0C ${T>40?`> 40\u00b0C \u2192 derate ${((T-40)*0.3).toFixed(2)}% \u2192 \u03b7_derated=${(e.eta_derated*100).toFixed(2)}%`:'<= 40\u00b0C, no derating'}</div>` : ''}
        </div>

        <div class="form-row cols-2" style="margin-top:10px">
          <div class="result-box ${cls}">
            <div class="result-label">Efficiency</div>
            <div class="result-value">${(e.eta*100).toFixed(2)}%</div>
            <div class="result-unit">${e.eta>0.97?'\u2713 Excellent':e.eta>0.95?'\u2713 Good':e.eta>0.93?'\u26a0 Low':'\u2717 Poor'}</div>
          </div>
          <div class="result-box alert-warn">
            <div class="result-label">Total Loss</div>
            <div class="result-value">${e.Ploss.toFixed(1)} W</div>
            <div class="result-unit">Load: ${e.loadPct.toFixed(1)}%</div>
          </div>
        </div>

        <!-- Loss bar chart (SVG) -->
        <div class="section-title" style="margin-top:10px">Loss Breakdown</div>
        ${_lossBar(e)}

        <div class="info-box" style="margin-top:10px">
          Benchmark: typical string inverter efficiency 95\u201398%. Peak efficiency usually at 50\u201375% load.
          Efficiency drops at low load (&lt;10%) and may also drop at high temp (&gt;40\u00b0C).
        </div>
      </div>`;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="ip-print-btn">&#128424; Print</button>';
    res.appendChild(printWrap);
    printWrap.querySelector('#ip-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ip-result', 'Inverter Efficiency Report', container);
        return;
      }
      window.print();
    });
  }

  function _lossBar(e) {
    const bars = [
      { label: 'Conversion', val: e.P_conv,    color: '#d97706' },
      { label: 'Thermal',    val: e.P_thermal,  color: '#dc2626' },
      { label: 'Wiring',     val: e.P_wiring,   color: '#0284c7' },
    ];
    const max = e.Ploss;
    return `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
      ${bars.map(b=>`
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:0.78rem;min-width:80px;color:var(--text-secondary)">${b.label}</span>
          <div style="flex:1;background:var(--bg-3);border-radius:4px;height:18px;overflow:hidden">
            <div style="width:${(b.val/max*100).toFixed(1)}%;height:18px;background:${b.color};border-radius:4px"></div>
          </div>
          <span style="font-size:0.78rem;min-width:50px;color:var(--text-secondary)">${b.val.toFixed(1)} W</span>
        </div>`).join('')}
    </div>`;
  }

  // -----------------------------------------------------------------------
  // EFFICIENCY CURVE
  // -----------------------------------------------------------------------

  function _plotCurve(container) {
    const Prated = parseFloat(container.querySelector('#ec-rated').value);
    const Pdc    = parseFloat(container.querySelector('#ec-pdc').value);
    const Pac    = parseFloat(container.querySelector('#ec-pac').value);
    const res    = container.querySelector('#ec-result');

    if (isNaN(Prated)) { res.innerHTML='<div class="danger-box">Enter rated power</div>'; return; }

    // Typical efficiency curve model (empirical, matches SMA/Fronius profile)
    const loadPts = [2,5,10,15,20,25,30,40,50,60,70,80,90,100,110];
    const etaModel = l => {
      if (l <= 0) return 0;
      // Peaks ~97.5% at 50-75% load, drops at low and high load
      const peak = 0.975;
      const a = -0.00004, b = 0.006, c = peak - 0.006*75 + 0.00004*75*75;
      const val = a*l*l + b*l + c;
      return Math.min(peak, Math.max(0.80, val));
    };

    const etaPoints = loadPts.map(l => ({ l, eta: etaModel(l) }));

    // User measurement point
    const userLoad = !isNaN(Pdc) ? Pdc/Prated*100 : NaN;
    const userEta  = (!isNaN(Pdc)&&!isNaN(Pac)) ? Pac/Pdc : NaN;

    // SVG
    const W=320,H=180,PL=46,PR=16,PT=14,PB=34;
    const cW=W-PL-PR, cH=H-PT-PB;
    const xMin=0,xMax=115,yMin=0.88,yMax=0.99;

    const px = x => PL + (x-xMin)/(xMax-xMin)*cW;
    const py = y => PT + cH - (y-yMin)/(yMax-yMin)*cH;

    const modelPath = etaPoints.map((p,i)=>`${i===0?'M':'L'}${px(p.l).toFixed(1)},${py(p.eta).toFixed(1)}`).join(' ');

    const yTicks = [0.88,0.90,0.92,0.94,0.96,0.98];
    const yTickHtml = yTicks.map(y=>`
      <line x1="${PL}" y1="${py(y).toFixed(1)}" x2="${PL+cW}" y2="${py(y).toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
      <text x="${PL-3}" y="${(py(y)+3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">${(y*100).toFixed(0)}%</text>`).join('');

    const xTickHtml = [0,25,50,75,100].map(x=>`
      <text x="${px(x).toFixed(1)}" y="${PT+cH+12}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${x}%</text>`).join('');

    const userDot = !isNaN(userLoad)&&!isNaN(userEta) ? `
      <circle cx="${px(userLoad).toFixed(1)}" cy="${py(userEta).toFixed(1)}" r="5" fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
      <text x="${(px(userLoad)+7).toFixed(1)}" y="${(py(userEta)-4).toFixed(1)}" font-size="8" fill="#dc2626">Your measurement</text>` : '';

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:8px auto 0">
        ${yTickHtml}
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        ${xTickHtml}
        <path d="${modelPath}" fill="none" stroke="#0284c7" stroke-width="2"/>
        ${userDot}
        <text x="${PL+cW/2}" y="${H-2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">Load %</text>
        <text x="10" y="${PT+cH/2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" transform="rotate(-90,10,${PT+cH/2})">Efficiency</text>
        <line x1="60" y1="10" x2="74" y2="10" stroke="#0284c7" stroke-width="2"/>
        <text x="77" y="13" font-size="8" fill="var(--text-secondary)">Typical inverter</text>
        ${!isNaN(userEta)?`<circle cx="155" cy="10" r="4" fill="#dc2626"/><text x="162" y="13" font-size="8" fill="#dc2626">Your measurement</text>`:''}
      </svg>`;

    res.innerHTML = svg +
      `<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:4px">
        Peak efficiency typically at 50\u201375% load. Efficiency drops at light load and high temperature.
      </div>`;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="ec-print-btn">&#128424; Print</button>';
    res.appendChild(printWrap);
    printWrap.querySelector('#ec-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ec-result', 'Inverter Efficiency Curve Report', container);
        return;
      }
      window.print();
    });
  }

  // -----------------------------------------------------------------------
  // AC/DC RATIO
  // -----------------------------------------------------------------------

  function _calcRatio(container) {
    const Pdc = parseFloat(container.querySelector('#ar-pdc').value);
    const Pac = parseFloat(container.querySelector('#ar-pac').value);
    const res = container.querySelector('#ar-result');

    if (isNaN(Pdc)||isNaN(Pac)) { res.innerHTML='<div class="danger-box">Enter both values</div>'; return; }

    const ratio    = Pac / Pdc;
    const minReq   = 0.85 * Pdc;
    const pass     = ratio >= 0.80;
    const optimal  = ratio >= 0.85 && ratio <= 1.05;
    const cls      = optimal ? 'alert-safe' : pass ? 'alert-warn' : 'alert-unsafe';

    res.innerHTML = `
      <div style="margin-top:10px">
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>Sri Lanka / PUCSL: P_AC \u2265 0.85 \u00d7 P_DC</div>
          <div>Step 1: Array DC = ${Pdc} kWp</div>
          <div>Step 2: Inverter AC = ${Pac} kW</div>
          <div>Step 3: Min required AC = 0.85 \u00d7 ${Pdc} = ${minReq.toFixed(2)} kW</div>
          <div>Step 4: AC/DC ratio = ${Pac} \u00f7 ${Pdc} = ${ratio.toFixed(4)} = ${(ratio*100).toFixed(1)}%</div>
          <div>${ratio<0.80?`\u2717 Ratio ${(ratio*100).toFixed(1)}% < 80% \u2014 Inverter significantly undersized`:
                ratio<0.85?`\u26a0 Ratio ${(ratio*100).toFixed(1)}% \u2014 Borderline (marginally undersized)`:
                ratio<=1.05?`\u2713 Ratio ${(ratio*100).toFixed(1)}% \u2014 Optimal range (85\u2013105%)`:
                `\u26a0 Ratio ${(ratio*100).toFixed(1)}% > 105% \u2014 Inverter oversized`}</div>
        </div>
        <div class="result-box ${cls}" style="margin-top:8px">
          <div class="result-value">AC/DC Ratio: ${(ratio*100).toFixed(1)}%</div>
          <div class="result-unit">${optimal?'\u2713 Optimal':pass?'\u26a0 Acceptable':'\u2717 Out of range'}</div>
        </div>
      </div>`;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="ar-print-btn">&#128424; Print</button>';
    res.appendChild(printWrap);
    printWrap.querySelector('#ar-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ar-result', 'AC/DC Ratio Report', container);
        return;
      }
      window.print();
    });
  }

  return { render, inverterEfficiency };
})();
