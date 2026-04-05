/**
 * field-analysis.js — Field Test & Degradation Tracking
 * Phase 2: CSV upload, STC normalization, trend analysis, prediction, chart.
 * IEC 60891 STC correction | IEC 61724 performance analysis
 */

const FieldAnalysis = (() => {

  // Internal state
  let _data = [];   // array of test point objects (raw + corrected)
  let _chart = null;

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128202; Field Analysis &amp; Tracking</div>

        <div class="info-box">
          Enter multiple field measurements over time. All readings are STC-corrected per
          <strong>IEC 60891</strong> before trend analysis. Degradation rate is extracted by
          linear regression on corrected data. Predictions compare real trend vs linear/compound models.
        </div>

        <!-- INPUT SECTION -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#9998; System Parameters</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Module Nameplate Pmax (W)</label>
              <input class="form-input" id="fa-p0" type="number" step="any" placeholder="e.g. 600" />
              <div class="form-hint">STC rated power per module</div>
            </div>
            <div class="form-group">
              <label class="form-label">Modules in String</label>
              <input class="form-input" id="fa-nm" type="number" step="1" placeholder="e.g. 20" />
            </div>
            <div class="form-group">
              <label class="form-label">&beta;Voc (%/&deg;C)</label>
              <input class="form-input" id="fa-bvoc" type="number" step="any" value="-0.26" />
              <div class="form-hint">Voltage temp coeff (negative)</div>
            </div>
            <div class="form-group">
              <label class="form-label">&alpha;Isc (%/&deg;C)</label>
              <input class="form-input" id="fa-aisc" type="number" step="any" value="0.04" />
              <div class="form-hint">Current temp coeff (positive)</div>
            </div>
          </div>
        </div>

        <!-- DATA ENTRY -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128203; Test Data Points</div>

          <div class="info-box" style="margin-bottom:10px">
            Enter one row per test session. Year = years since commissioning (0 = commissioning).
          </div>

          <!-- CSV Upload -->
          <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">
              &#128196; Upload CSV
              <input type="file" id="fa-csv-input" accept=".csv" style="display:none" />
            </label>
            <span style="font-size:0.75rem;color:var(--text-muted)">
              CSV format: year,irradiance,temp,voc,isc,vmp,imp
            </span>
          </div>

          <!-- Table header -->
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem" id="fa-table">
              <thead>
                <tr style="background:var(--bg-3)">
                  <th style="padding:6px;text-align:left">Year</th>
                  <th style="padding:6px;text-align:left">G (W/m&sup2;)</th>
                  <th style="padding:6px;text-align:left">T (&deg;C)</th>
                  <th style="padding:6px;text-align:left">Voc (V)</th>
                  <th style="padding:6px;text-align:left">Isc (A)</th>
                  <th style="padding:6px;text-align:left">Vmp (V)</th>
                  <th style="padding:6px;text-align:left">Imp (A)</th>
                  <th style="padding:6px"></th>
                </tr>
              </thead>
              <tbody id="fa-rows"></tbody>
            </table>
          </div>

          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" id="fa-add-row">+ Add Row</button>
            <button class="btn btn-primary btn-sm" id="fa-analyse">Analyse</button>
          </div>
        </div>

        <!-- RESULTS -->
        <div id="fa-results"></div>
      </div>
    `;

    _addRow(container);   // start with one empty row

    container.querySelector('#fa-add-row').addEventListener('click', () => _addRow(container));
    container.querySelector('#fa-analyse').addEventListener('click', () => _analyse(container));
    container.querySelector('#fa-csv-input').addEventListener('change', e => _loadCSV(e, container));
  }

  // -----------------------------------------------------------------------
  // ROW MANAGEMENT
  // -----------------------------------------------------------------------

  function _addRow(container, vals) {
    const tbody = container.querySelector('#fa-rows');
    const idx   = tbody.children.length;
    const v     = vals || {};
    const td    = (id, val, ph) =>
      `<td style="padding:4px"><input class="form-input" style="width:72px;padding:4px 6px;font-size:0.78rem"
        data-col="${id}" type="number" step="any" placeholder="${ph||''}" value="${val||''}" /></td>`;

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    tr.innerHTML =
      td('year', v.year, '0') +
      td('g',    v.g,    '1000') +
      td('t',    v.t,    '25') +
      td('voc',  v.voc,  '') +
      td('isc',  v.isc,  '') +
      td('vmp',  v.vmp,  '') +
      td('imp',  v.imp,  '') +
      `<td style="padding:4px"><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:0.75rem" data-del="${idx}">&times;</button></td>`;

    tr.querySelector('[data-del]').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  }

  function _readRows(container) {
    const rows = [];
    container.querySelectorAll('#fa-rows tr').forEach(tr => {
      const get = col => parseFloat(tr.querySelector(`[data-col="${col}"]`).value);
      const r = { year: get('year'), g: get('g'), t: get('t'), voc: get('voc'), isc: get('isc'), vmp: get('vmp'), imp: get('imp') };
      if (!isNaN(r.year) && !isNaN(r.g) && !isNaN(r.voc) && !isNaN(r.isc)) rows.push(r);
    });
    return rows.sort((a, b) => a.year - b.year);
  }

  // -----------------------------------------------------------------------
  // CSV LOADER
  // -----------------------------------------------------------------------

  function _loadCSV(e, container) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      // Skip header if non-numeric first field
      const dataLines = lines.filter(l => !isNaN(parseFloat(l.split(',')[0])));
      container.querySelector('#fa-rows').innerHTML = '';
      dataLines.forEach(line => {
        const [year, g, t, voc, isc, vmp, imp] = line.split(',').map(x => x.trim());
        _addRow(container, { year, g, t, voc, isc, vmp, imp });
      });
      App.toast(`Loaded ${dataLines.length} rows from CSV`, 'success');
    };
    reader.readAsText(file);
  }

  // -----------------------------------------------------------------------
  // STC CORRECTION — IEC 60891
  // -----------------------------------------------------------------------

  function stcCorrection(voc, isc, vmp, imp, g, t, bVoc, aIsc) {
    // IEC 60891 Method 1 (simplified):
    // Isc_stc = Isc_meas × (1000 / G) × [1 + αIsc/100 × (25 − T)]
    // Voc_stc = Voc_meas + βVoc/100 × Voc_meas × (25 − T)  [approximate for string]
    // Pmp_stc = Vmp_stc × Imp_stc
    const G_ratio   = 1000 / g;
    const dT        = 25 - t;                              // delta T from STC
    const aIsc_dec  = aIsc / 100;
    const bVoc_dec  = bVoc / 100;

    const Isc_stc = isc * G_ratio * (1 + aIsc_dec * dT);
    const Voc_stc = voc + bVoc_dec * voc * dT;

    const Imp_stc = isNaN(imp) ? NaN : imp * G_ratio * (1 + aIsc_dec * dT);
    const Vmp_stc = isNaN(vmp) ? NaN : vmp + bVoc_dec * vmp * dT;
    const Pmp_stc = isNaN(Vmp_stc) || isNaN(Imp_stc) ? NaN : Vmp_stc * Imp_stc;

    return { Isc_stc, Voc_stc, Imp_stc, Vmp_stc, Pmp_stc, G_ratio, dT, aIsc_dec, bVoc_dec };
  }

  // -----------------------------------------------------------------------
  // LINEAR REGRESSION
  // -----------------------------------------------------------------------

  function _linReg(xs, ys) {
    const n   = xs.length;
    const sx  = xs.reduce((a, x) => a + x, 0);
    const sy  = ys.reduce((a, y) => a + y, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sx2 = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sx2 - sx * sx;
    if (denom === 0) return { slope: 0, intercept: sy / n, r2: 0 };
    const slope     = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    // R²
    const yMean = sy / n;
    const ssTot = ys.reduce((a, y) => a + (y - yMean) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
    const r2    = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
  }

  // -----------------------------------------------------------------------
  // MAIN ANALYSIS
  // -----------------------------------------------------------------------

  function _analyse(container) {
    const rows = _readRows(container);
    if (rows.length < 2) {
      container.querySelector('#fa-results').innerHTML = '<div class="danger-box">Need at least 2 data points</div>';
      return;
    }

    const P0     = parseFloat(container.querySelector('#fa-p0').value);
    const Nm     = parseFloat(container.querySelector('#fa-nm').value) || 1;
    const bVoc   = parseFloat(container.querySelector('#fa-bvoc').value) || -0.26;
    const aIsc   = parseFloat(container.querySelector('#fa-aisc').value) || 0.04;
    const hasP0  = !isNaN(P0);
    const P0_str = hasP0 ? P0 * Nm : NaN;   // string nameplate

    // STC-correct each row
    const corrected = rows.map(r => {
      const c = stcCorrection(r.voc, r.isc, r.vmp, r.imp, r.g, r.t, bVoc, aIsc);
      return { ...r, ...c };
    });

    // Use Pmp_stc if available, else use Isc_stc as proxy
    const usePmp = corrected.every(c => !isNaN(c.Pmp_stc));
    const metric = usePmp ? 'Pmp_stc' : 'Isc_stc';
    const metricLabel = usePmp ? 'Pmp (W, STC-corrected)' : 'Isc (A, STC-corrected)';

    const xs = corrected.map(c => c.year);
    const ys = corrected.map(c => c[metric]);

    // Linear regression
    const reg = _linReg(xs, ys);

    // Degradation rate (% per year relative to year-0 intercept)
    const base     = reg.intercept > 0 ? reg.intercept : ys[0];
    const degRate  = base > 0 ? (-reg.slope / base * 100) : 0;  // %/year

    // Predictions at key years
    const predYears = [1, 5, 10, 15, 20, 25];
    const predMeas  = predYears.map(y => reg.slope * y + reg.intercept);

    // Linear & compound model predictions (if P0 known)
    const LID  = 0.02;   // assume 2% LID as default
    const d    = Math.abs(degRate) / 100;
    const predLin  = hasP0 ? predYears.map(y => P0_str * (1 - LID) - P0_str * d * (y - 1)) : null;
    const predCmp  = hasP0 ? predYears.map(y => P0_str * (1 - LID) * Math.pow(1 - d, y - 1)) : null;

    // Build results HTML
    const res = container.querySelector('#fa-results');
    res.innerHTML = '';

    // --- STC Correction Table ---
    res.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">&#9889; STC Normalization (IEC 60891)</div>
        <div class="info-box" style="margin-bottom:8px">
          <strong>IEC 60891 Method 1 formulae:</strong><br>
          Isc_stc = Isc &times; (1000/G) &times; [1 + &alpha;Isc &times; (25 &minus; T)]<br>
          Voc_stc = Voc + &beta;Voc &times; Voc &times; (25 &minus; T)<br>
          Pmp_stc = Vmp_stc &times; Imp_stc
        </div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead><tr>
              <th>Year</th><th>G (W/m&sup2;)</th><th>T (&deg;C)</th>
              <th>Voc raw</th><th>Voc STC</th>
              <th>Isc raw</th><th>Isc STC</th>
              <th>${usePmp ? 'Pmp STC (W)' : 'Isc STC'}</th>
            </tr></thead>
            <tbody>
              ${corrected.map(c => `
                <tr>
                  <td>${c.year}</td>
                  <td>${c.g}</td>
                  <td>${c.t}</td>
                  <td>${c.voc.toFixed(2)}</td>
                  <td style="color:var(--primary);font-weight:600">${c.Voc_stc.toFixed(2)}</td>
                  <td>${c.isc.toFixed(3)}</td>
                  <td style="color:var(--primary);font-weight:600">${c.Isc_stc.toFixed(3)}</td>
                  <td style="color:var(--primary);font-weight:700">${usePmp ? c.Pmp_stc.toFixed(1) : c.Isc_stc.toFixed(3)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <!-- Step-by-step for first row -->
        <div class="section-title" style="margin-top:12px">Step-by-Step (Row 1)</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>G = ${corrected[0].g} W/m&sup2;, T = ${corrected[0].t}&deg;C, &alpha;Isc = ${aIsc}%/&deg;C, &beta;Voc = ${bVoc}%/&deg;C</div>
          <div>G_ratio = 1000 / ${corrected[0].g} = ${corrected[0].G_ratio.toFixed(4)}</div>
          <div>&Delta;T = 25 &minus; ${corrected[0].t} = ${corrected[0].dT}&deg;C</div>
          <div>Isc_stc = ${corrected[0].isc.toFixed(3)} &times; ${corrected[0].G_ratio.toFixed(4)} &times; (1 + ${corrected[0].aIsc_dec.toFixed(5)} &times; ${corrected[0].dT}) = <strong>${corrected[0].Isc_stc.toFixed(3)} A</strong></div>
          <div>Voc_stc = ${corrected[0].voc.toFixed(2)} + ${corrected[0].bVoc_dec.toFixed(5)} &times; ${corrected[0].voc.toFixed(2)} &times; ${corrected[0].dT} = <strong>${corrected[0].Voc_stc.toFixed(2)} V</strong></div>
          ${usePmp ? `<div>Pmp_stc = ${corrected[0].Vmp_stc.toFixed(2)} &times; ${corrected[0].Imp_stc.toFixed(3)} = <strong>${corrected[0].Pmp_stc.toFixed(1)} W</strong></div>` : ''}
        </div>
      </div>
    `);

    // --- Regression & Degradation Rate ---
    const degCls = degRate > 0.8 ? 'alert-unsafe' : degRate > 0.5 ? 'alert-warn' : 'alert-safe';
    res.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">&#128200; Trend Analysis — Linear Regression</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>Data metric: ${metricLabel}</div>
          <div>n = ${xs.length} data points</div>
          <div>Linear regression: y = slope &times; x + intercept</div>
          <div>slope = ${reg.slope.toFixed(4)} &nbsp; intercept = ${reg.intercept.toFixed(3)} &nbsp; R&sup2; = ${reg.r2.toFixed(4)}</div>
          <div>Base value (Y=0 intercept) = ${base.toFixed(3)}</div>
          <div>Degradation rate = &minus;slope / base &times; 100 = &minus;${reg.slope.toFixed(4)} / ${base.toFixed(3)} &times; 100 = <strong>${degRate.toFixed(3)}%/year</strong></div>
        </div>
        <div class="result-box ${degCls}" style="margin-top:10px">
          <div class="result-label">Measured Degradation Rate</div>
          <div class="result-value">${degRate.toFixed(3)}%/year</div>
          <div class="result-unit">R&sup2; = ${reg.r2.toFixed(3)} &nbsp;|&nbsp; ${reg.r2 > 0.9 ? 'Good fit' : reg.r2 > 0.7 ? 'Acceptable fit' : 'Low fit — check data'}</div>
        </div>
        <div class="info-box" style="margin-top:10px">
          Benchmark: 0.3&ndash;0.5%/yr mono-Si &nbsp;|&nbsp; 0.5&ndash;0.8%/yr poly-Si &nbsp;|&nbsp; 0.6&ndash;1.0%/yr thin-film
        </div>
      </div>
    `);

    // --- Prediction Table ---
    res.insertAdjacentHTML('beforeend', `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">&#128270; Prediction vs Models</div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead><tr>
              <th>Year</th>
              <th>Measured Trend</th>
              ${hasP0 ? '<th>Linear Model</th><th>Compound Model</th><th>Status</th>' : ''}
            </tr></thead>
            <tbody>
              ${predYears.map((y, i) => {
                const mTrend = predMeas[i];
                const mPct   = hasP0 ? (mTrend / P0_str * 100).toFixed(1) : '';
                const lPct   = hasP0 ? (predLin[i] / P0_str * 100).toFixed(1) : '';
                const cPct   = hasP0 ? (predCmp[i] / P0_str * 100).toFixed(1) : '';
                const ok     = hasP0 ? parseFloat(mPct) >= 80 : true;
                return `<tr>
                  <td style="font-weight:600">Year ${y}</td>
                  <td style="color:var(--primary);font-weight:700">${mTrend.toFixed(usePmp?1:3)}${hasP0?' ('+mPct+'%)':''}</td>
                  ${hasP0 ? `
                    <td>${predLin[i].toFixed(1)} (${lPct}%)</td>
                    <td>${predCmp[i].toFixed(1)} (${cPct}%)</td>
                    <td style="color:${ok?'var(--success)':'var(--danger)'};font-weight:600">${ok?'&#10003; OK':'&#10007; &lt;80%'}</td>
                  ` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);

    // --- SVG Chart ---
    _renderChart(res, corrected, metric, reg, predYears, predMeas, predLin, predCmp, P0_str);
  }

  // -----------------------------------------------------------------------
  // SVG LINE CHART
  // -----------------------------------------------------------------------

  function _renderChart(container, corrected, metric, reg, predYears, predMeas, predLin, predCmp, P0_str) {
    const W = 320, H = 200, PL = 50, PR = 20, PT = 20, PB = 40;
    const cW = W - PL - PR, cH = H - PT - PB;

    const allX = [...corrected.map(c => c.year), ...predYears];
    const allY = [...corrected.map(c => c[metric]), ...predMeas];
    if (predLin) allY.push(...predLin);
    if (predCmp) allY.push(...predCmp);

    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const yMin = Math.max(0, Math.min(...allY) * 0.9);
    const yMax = Math.max(...allY) * 1.05;

    const px = x => PL + (x - xMin) / (xMax - xMin || 1) * cW;
    const py = y => PT + cH - (y - yMin) / (yMax - yMin || 1) * cH;

    const line = (pts, color, dash) => {
      const d = pts.map((p, i) => `${i===0?'M':'L'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${dash?'stroke-dasharray="5,3"':''} />`;
    };

    const dots = corrected.map(c =>
      `<circle cx="${px(c.year).toFixed(1)}" cy="${py(c[metric]).toFixed(1)}" r="4" fill="#d97706" stroke="#fff" stroke-width="1.5"/>`
    ).join('');

    const predPts   = predYears.map((y, i) => [y, predMeas[i]]);
    const linePts   = predLin ? predYears.map((y, i) => [y, predLin[i]]) : null;
    const cmpPts    = predCmp ? predYears.map((y, i) => [y, predCmp[i]]) : null;

    // Y-axis ticks
    const yTicks = 5;
    const yTickHtml = Array.from({length: yTicks+1}, (_, i) => {
      const val = yMin + (yMax - yMin) * i / yTicks;
      const y   = py(val);
      return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${PL+cW}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
              <text x="${PL-4}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--text-muted)">${val.toFixed(0)}</text>`;
    }).join('');

    // X-axis labels
    const xTicks = [...new Set([...corrected.map(c => c.year), ...predYears])].sort((a,b)=>a-b);
    const xTickHtml = xTicks.map(x =>
      `<text x="${px(x).toFixed(1)}" y="${(PT+cH+14).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${x}</text>`
    ).join('');

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:0 auto">
        <!-- Grid -->
        ${yTickHtml}
        <!-- Axes -->
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <!-- X labels -->
        ${xTickHtml}
        <!-- Axis labels -->
        <text x="${PL+cW/2}" y="${H-2}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">Year</text>
        <!-- Trend line -->
        ${line(predPts, '#d97706', false)}
        <!-- Linear model -->
        ${linePts ? line(linePts, '#16a34a', true) : ''}
        <!-- Compound model -->
        ${cmpPts ? line(cmpPts, '#0284c7', true) : ''}
        <!-- 80% warranty line -->
        ${P0_str ? `<line x1="${PL}" y1="${py(P0_str*0.8).toFixed(1)}" x2="${PL+cW}" y2="${py(P0_str*0.8).toFixed(1)}" stroke="#dc2626" stroke-width="1" stroke-dasharray="4,2"/>
        <text x="${PL+4}" y="${(py(P0_str*0.8)-3).toFixed(1)}" font-size="8" fill="#dc2626">80% warranty</text>` : ''}
        <!-- Data points -->
        ${dots}
        <!-- Legend -->
        <circle cx="60" cy="14" r="4" fill="#d97706"/>
        <text x="67" y="17" font-size="9" fill="var(--text-secondary)">Measured trend</text>
        ${linePts ? `<line x1="140" y1="14" x2="155" y2="14" stroke="#16a34a" stroke-width="2" stroke-dasharray="4,2"/>
        <text x="158" y="17" font-size="9" fill="var(--text-secondary)">Linear model</text>` : ''}
        ${cmpPts ? `<line x1="215" y1="14" x2="230" y2="14" stroke="#0284c7" stroke-width="2" stroke-dasharray="4,2"/>
        <text x="233" y="17" font-size="9" fill="var(--text-secondary)">Compound</text>` : ''}
      </svg>`;

    container.insertAdjacentHTML('beforeend', `
      <div class="card">
        <div class="card-title">&#128200; Degradation Trend Chart</div>
        ${svg}
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;text-align:center">
          Orange circles = measured (STC-corrected) &nbsp;|&nbsp; Orange line = regression trend &nbsp;|&nbsp;
          Green dashed = linear model &nbsp;|&nbsp; Blue dashed = compound model
        </div>
      </div>
    `);
  }

  return { render, stcCorrection };
})();
