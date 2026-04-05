/**
 * fault-ai.js — Intelligent Fault Detection
 * Phase 6: Rule-based scoring across all parameters.
 * Evaluates voltage deviation, current deviation, temperature, degradation,
 * fill factor, and mismatch. Outputs primary fault + confidence + secondary faults.
 */

const FaultAI = (() => {

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#129302; Intelligent Fault Detection</div>

        <div class="info-box">
          Rule-based diagnostic engine. Enter as many parameters as available &mdash;
          the engine scores all fault types and reports primary + secondary faults with confidence.
          More inputs = higher accuracy.
        </div>

        <!-- INPUT PANEL -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#9998; System Measurements</div>

          <div class="section-title">String Electrical</div>
          <div class="form-row cols-2">
            ${_inp('ai-voc-m',  'Measured Voc (V)',      '', '', '')}
            ${_inp('ai-voc-e',  'Expected Voc (V)',      '', '', 'Temperature-corrected')}
            ${_inp('ai-isc-m',  'Measured Isc (A)',      '', '', '')}
            ${_inp('ai-isc-e',  'Expected Isc (A)',      '', '', 'Irradiance-corrected')}
            ${_inp('ai-vmp',    'Measured Vmp (V)',      '', '', '')}
            ${_inp('ai-imp',    'Measured Imp (A)',      '', '', '')}
          </div>

          <div class="section-title" style="margin-top:10px">Environmental</div>
          <div class="form-row cols-2">
            ${_inp('ai-temp',   'Module Temp (&deg;C)',  '', '', 'Back-of-panel')}
            ${_inp('ai-irr',    'Irradiance (W/m&sup2;)','', '','Measured')}
            ${_inp('ai-humid',  'Humidity (%)',          '', '', 'Site relative humidity')}
          </div>

          <div class="section-title" style="margin-top:10px">History</div>
          <div class="form-row cols-2">
            ${_inp('ai-deg',    'Degradation Rate (%/yr)','', '','From field analysis')}
            ${_inp('ai-age',    'System Age (years)',     '', '','Years since commissioning')}
            ${_inp('ai-ir',     'IR Resistance (M&Omega;)','', '','DC+ or DC\u2212 to earth')}
          </div>
        </div>

        <button class="btn btn-primary" id="ai-run-btn" style="width:100%;margin-bottom:14px">
          &#129302; Run Fault Diagnosis
        </button>

        <div id="ai-result"></div>

        <!-- REFERENCE -->
        <div class="card" style="margin-top:12px">
          <div class="card-title">&#128218; Fault Signature Reference</div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead><tr><th>Fault</th><th>Voc</th><th>Isc</th><th>FF</th><th>Temp</th><th>Deg Rate</th></tr></thead>
              <tbody>
                <tr><td style="font-weight:600">PID</td><td style="color:#dc2626">Low (&gt;10%)</td><td>Slightly low</td><td>&lt;0.72</td><td>Normal</td><td>&gt;1%/yr</td></tr>
                <tr><td style="font-weight:600">LID</td><td>Slightly low</td><td>Slightly low</td><td>0.72&ndash;0.78</td><td>Normal</td><td>0.5&ndash;1.5%/yr (Year 1)</td></tr>
                <tr><td style="font-weight:600">Hotspot/Shading</td><td>Normal</td><td style="color:#dc2626">Very low</td><td>&lt;0.70</td><td>High</td><td>Variable</td></tr>
                <tr><td style="font-weight:600">Bypass Diode</td><td style="color:#dc2626">~33% drop</td><td>Normal</td><td>Normal</td><td>Normal</td><td>Normal</td></tr>
                <tr><td style="font-weight:600">Soiling</td><td>Normal</td><td>Slightly low</td><td>Normal</td><td>Normal</td><td>Normal</td></tr>
                <tr><td style="font-weight:600">Earth Fault</td><td>Variable</td><td>Variable</td><td>Variable</td><td>Normal</td><td>High</td></tr>
                <tr><td style="font-weight:600">General Aging</td><td>Slightly low</td><td>Slightly low</td><td>0.74&ndash;0.80</td><td>Normal</td><td>0.3&ndash;0.8%/yr</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#ai-run-btn').addEventListener('click', () => {
      try { _runDiagnosis(container); }
      catch(e) { container.querySelector('#ai-result').innerHTML = '<div class="danger-box">Error: '+e.message+'</div>'; }
    });
  }

  // -----------------------------------------------------------------------
  // INPUT HELPERS
  // -----------------------------------------------------------------------

  function _inp(id, label, ph, val, hint) {
    return `<div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-input" id="${id}" type="number" step="any" placeholder="${ph||''}" value="${val||''}" />
      ${hint?`<div class="form-hint">${hint}</div>`:''}
    </div>`;
  }

  function _g(c, id) {
    const el = c.querySelector('#'+id);
    return el ? parseFloat(el.value) : NaN;
  }

  // -----------------------------------------------------------------------
  // DIAGNOSIS ENGINE
  // -----------------------------------------------------------------------

  function _runDiagnosis(container) {
    const vocM  = _g(container, 'ai-voc-m');
    const vocE  = _g(container, 'ai-voc-e');
    const iscM  = _g(container, 'ai-isc-m');
    const iscE  = _g(container, 'ai-isc-e');
    const vmp   = _g(container, 'ai-vmp');
    const imp   = _g(container, 'ai-imp');
    const T     = _g(container, 'ai-temp');
    const irr   = _g(container, 'ai-irr');
    const humid = _g(container, 'ai-humid');
    const deg   = _g(container, 'ai-deg');
    const age   = _g(container, 'ai-age');
    const ir    = _g(container, 'ai-ir');

    const vocDev = (!isNaN(vocM)&&!isNaN(vocE)&&vocE>0) ? (vocM-vocE)/vocE*100 : NaN;
    const iscDev = (!isNaN(iscM)&&!isNaN(iscE)&&iscE>0) ? (iscM-iscE)/iscE*100 : NaN;
    const FF     = (!isNaN(vmp)&&!isNaN(imp)&&!isNaN(vocM)&&!isNaN(iscM)) ? (vmp*imp)/(vocM*iscM) : NaN;

    const inputCount = [vocM,iscM,T,deg,ir,humid,FF].filter(v=>!isNaN(v)).length;
    if (inputCount === 0) {
      container.querySelector('#ai-result').innerHTML = '<div class="danger-box">Enter at least one measurement to run diagnosis</div>';
      return;
    }

    const scored = _scoreFaults(vocDev, iscDev, FF, T, deg, age, ir, humid, irr);
    _renderResult(container, scored, { vocDev, iscDev, FF, T, irr, humid, deg, age, ir, inputCount });
  }

  function _scoreFaults(vocDev, iscDev, FF, T, deg, age, ir, humid, irr) {
    const faults = [
      {
        id: 'pid',
        name: 'PID (Potential-Induced Degradation)',
        icon: '&#9889;',
        score() {
          let s = 0;
          if (!isNaN(vocDev)) {
            if (vocDev < -10) s += 35;
            else if (vocDev < -5) s += 18;
          }
          if (!isNaN(iscDev) && iscDev < -3) s += 12;
          if (!isNaN(FF) && FF < 0.72) s += 20;
          if (!isNaN(deg) && deg > 1.0) s += 20;
          if (!isNaN(humid) && humid > 75) s += 10;
          if (!isNaN(ir) && ir < 1.0) s += 25;   // low IR = earth leakage
          return s;
        },
        symptoms: 'Negative voltage leakage through module glass to earth. High humidity accelerates.',
        action: 'Verify earth grounding. Install negative grounding or PID recovery box. Reduce system voltage.',
        urgency: 'high'
      },
      {
        id: 'bypass_diode',
        name: 'Bypass Diode Failure',
        icon: '&#128268;',
        score() {
          let s = 0;
          if (!isNaN(vocDev)) {
            if (vocDev < -28 && vocDev > -38) s += 70;   // ~33% drop = 1 diode
            else if (vocDev < -61 && vocDev > -72) s += 70;  // ~66% = 2 diodes
            else if (vocDev < -10 && vocDev > -25) s += 20;
          }
          if (!isNaN(iscDev) && Math.abs(iscDev) < 8 && !isNaN(vocDev) && vocDev < -20) s += 20;
          return s;
        },
        symptoms: 'Voc drops ~33% per failed diode. Isc remains near-normal. Junction box may show burn marks.',
        action: 'Locate affected module by Voc elimination test. Replace bypass diodes. Check junction box.',
        urgency: 'high'
      },
      {
        id: 'hotspot',
        name: 'Hotspot / Cell Damage',
        icon: '&#128293;',
        score() {
          let s = 0;
          if (!isNaN(iscDev) && iscDev < -10) s += 35;
          if (!isNaN(iscDev) && iscDev < -20) s += 25;
          if (!isNaN(T) && T > 75) s += 25;
          if (!isNaN(FF) && FF < 0.70) s += 20;
          if (!isNaN(vocDev) && Math.abs(vocDev) < 5 && !isNaN(iscDev) && iscDev < -10) s += 15;
          return s;
        },
        symptoms: 'Localised cell overheating. Isc reduced with normal Voc = bypass diode activation.',
        action: 'IR thermal imaging scan. Replace affected modules. Check for shading obstruction.',
        urgency: 'high'
      },
      {
        id: 'soiling',
        name: 'Soiling / Dust',
        icon: '&#127787;',
        score() {
          let s = 0;
          if (!isNaN(iscDev) && iscDev < -5 && iscDev > -25) s += 40;
          if (!isNaN(vocDev) && Math.abs(vocDev) < 5) s += 20;  // Voc nearly normal
          if (!isNaN(FF) && FF > 0.75) s += 20;   // FF OK = no cell damage
          if (!isNaN(irr) && irr < 700) s += 10;   // lower irradiance consistent
          return s;
        },
        symptoms: 'Uniform Isc reduction with near-normal Voc. FF not affected. Uniform across all strings.',
        action: 'Clean array. Schedule regular cleaning. Sri Lanka dust/pollen peak: Jan\u2013Mar, Jul\u2013Sep.',
        urgency: 'medium'
      },
      {
        id: 'lid',
        name: 'LID (Light-Induced Degradation)',
        icon: '&#9728;',
        score() {
          let s = 0;
          if (!isNaN(age) && age <= 2) s += 30;   // most likely in first 2 years
          if (!isNaN(vocDev) && vocDev > -5 && vocDev < 0) s += 20;
          if (!isNaN(iscDev) && iscDev > -5 && iscDev < 0) s += 20;
          if (!isNaN(deg) && deg > 0.5 && deg < 1.5) s += 20;
          if (!isNaN(FF) && FF > 0.72 && FF < 0.79) s += 10;
          return s;
        },
        symptoms: 'Gradual power loss in Year 1\u20132 due to boron-oxygen defects. Expected in p-type modules.',
        action: 'Expected behaviour for p-type modules. Monitor in Year 2\u20133. Consider N-type for next procurement.',
        urgency: 'low'
      },
      {
        id: 'earth_fault',
        name: 'Earth Fault / Insulation Failure',
        icon: '&#9888;',
        score() {
          let s = 0;
          if (!isNaN(ir) && ir < 1.0) s += 60;
          if (!isNaN(ir) && ir < 0.5) s += 30;
          if (!isNaN(humid) && humid > 80) s += 10;
          return s;
        },
        symptoms: 'Low insulation resistance indicates leakage path to earth. DO NOT ENERGISE.',
        action: 'ISOLATE IMMEDIATELY. Measure DC+ and DC\u2212 to earth separately. Find leakage point. Check cable insulation, connectors.',
        urgency: 'critical'
      },
      {
        id: 'aging',
        name: 'General Aging',
        icon: '&#128197;',
        score() {
          let s = 0;
          if (!isNaN(deg) && deg > 0.3 && deg < 0.8) s += 40;
          if (!isNaN(FF) && FF > 0.74 && FF < 0.80) s += 25;
          if (!isNaN(vocDev) && vocDev > -5 && vocDev < 0) s += 20;
          if (!isNaN(age) && age > 5) s += 15;
          return s;
        },
        symptoms: 'Slow, uniform decline across all parameters. Normal module aging process.',
        action: 'Monitor annually. Compare with manufacturer warranty curve. No immediate action if within spec.',
        urgency: 'low'
      },
    ];

    return faults
      .map(f => ({ ...f, confidence: Math.min(98, f.score()) }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  // -----------------------------------------------------------------------
  // RENDER RESULT
  // -----------------------------------------------------------------------

  function _renderResult(container, faults, inputs) {
    const primary = faults[0];
    const others  = faults.slice(1, 4).filter(f => f.confidence > 15);

    const urgencyColor = { critical: '#dc2626', high: '#d97706', medium: '#ca8a04', low: '#16a34a' };
    const urgencyLabel = { critical: 'CRITICAL', high: 'High', medium: 'Medium', low: 'Low' };

    // Evidence summary
    const evidence = [];
    if (!isNaN(inputs.vocDev)) evidence.push(`Voc deviation: ${inputs.vocDev.toFixed(2)}%`);
    if (!isNaN(inputs.iscDev)) evidence.push(`Isc deviation: ${inputs.iscDev.toFixed(2)}%`);
    if (!isNaN(inputs.FF))     evidence.push(`Fill Factor: ${inputs.FF.toFixed(3)} (${(inputs.FF*100).toFixed(1)}%)`);
    if (!isNaN(inputs.T))      evidence.push(`Module temp: ${inputs.T}\u00b0C`);
    if (!isNaN(inputs.deg))    evidence.push(`Degradation rate: ${inputs.deg}%/yr`);
    if (!isNaN(inputs.age))    evidence.push(`System age: ${inputs.age} years`);
    if (!isNaN(inputs.ir))     evidence.push(`IR: ${inputs.ir} M\u03a9 ${inputs.ir<1?'\u2717 FAIL':'\u2713 OK'}`);
    if (!isNaN(inputs.humid))  evidence.push(`Humidity: ${inputs.humid}%`);

    // Confidence bar chart SVG
    const topFaults = faults.slice(0, 5);
    const maxConf   = Math.max(...topFaults.map(f=>f.confidence), 1);
    const barSvgH   = 20 * topFaults.length + 20;
    const barSvg = `
      <svg viewBox="0 0 300 ${barSvgH}" style="width:100%;max-width:500px;display:block">
        ${topFaults.map((f,i)=>{
          const bw = Math.max(4, f.confidence/maxConf * 200);
          const y  = 10 + i*20;
          const uc = urgencyColor[f.urgency]||'#d97706';
          return `
            <text x="0" y="${y+11}" font-size="9" fill="var(--text-secondary)" style="font-family:monospace">${f.name.substring(0,22).padEnd(22)}</text>
            <rect x="150" y="${y}" width="${bw.toFixed(1)}" height="14" rx="3" fill="${uc}" opacity="0.85"/>
            <text x="${(154+bw).toFixed(1)}" y="${y+11}" font-size="9" fill="${uc}" font-weight="700">${f.confidence}%</text>`;
        }).join('')}
      </svg>`;

    // Secondary faults list
    const secondaryHtml = others.length > 0 ? `
      <div class="section-title" style="margin-top:10px">Secondary Possibilities</div>
      ${others.map(f=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:0.82rem">${f.icon} ${f.name}</span>
          <span style="font-size:0.78rem;color:${urgencyColor[f.urgency]};font-weight:600">${f.confidence}%</span>
        </div>`).join('')}
    ` : '';

    const criticalWarning = primary.urgency === 'critical' ?
      `<div class="danger-box" style="margin-bottom:10px">
        <strong>\u26a0 CRITICAL FAULT DETECTED \u26a0</strong><br>
        ${primary.action}
      </div>` : '';

    container.querySelector('#ai-result').innerHTML = `
      ${criticalWarning}

      <!-- PRIMARY FAULT -->
      <div class="card" style="margin-bottom:12px;border:2px solid ${urgencyColor[primary.urgency]}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:1.1rem;font-weight:700">${primary.icon} ${primary.name}</div>
            <div style="font-size:0.78rem;color:${urgencyColor[primary.urgency]};font-weight:600;margin-top:2px">
              Urgency: ${urgencyLabel[primary.urgency]} &nbsp;|&nbsp; Confidence: ${primary.confidence}%
            </div>
          </div>
          <div style="font-size:1.8rem;font-weight:800;color:${urgencyColor[primary.urgency]}">${primary.confidence}%</div>
        </div>
        <div style="font-size:0.82rem;margin-top:10px;color:var(--text-secondary)">${primary.symptoms}</div>
        <div style="background:var(--primary-bg);border-radius:var(--radius);padding:8px;margin-top:8px;font-size:0.82rem">
          <strong>Recommended Action:</strong> ${primary.action}
        </div>
      </div>

      <!-- CONFIDENCE CHART -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Fault Score Breakdown</div>
        ${barSvg}
        ${secondaryHtml}
      </div>

      <!-- EVIDENCE -->
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Evidence Used (${inputs.inputCount} parameters)</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          ${evidence.length > 0 ? evidence.map(e=>`<div>\u2022 ${e}</div>`).join('') : '<div>No measurements entered</div>'}
        </div>
        ${inputs.inputCount < 4 ? `<div class="warn-box" style="margin-top:8px;font-size:0.8rem">Enter more measurements for higher confidence. Ideally: Voc, Isc, module temp, degradation rate, IR resistance.</div>` : ''}
      </div>
    `;
  }

  return { render };
})();
