/**
 * pv-inspector.js — Metrel PV Tester Import & Analysis
 *
 * Parses Excel exports from Metrel PV analyzers (IEC 62446 Autotest + I/V curve).
 * Supports both "Measurements" sheet format (string-level) and "Sheet" format
 * (individual module with I/V curve arrays).
 *
 * Data flow:
 *   Excel file → SheetJS parse → normalise rows → store in session
 *   → summary dashboard → string table → per-string detail + I/V chart
 *   → compare vs panel DB or manual STC input
 *
 * Column mapping handles Metrel's mixed-unit strings (e.g. "684 W/m2", "45.8 degC").
 */

const PVInspector = (() => {

  // =========================================================================
  // STATE
  // =========================================================================

  let _session = null;   // { fileName, importedAt, rows[], ivRows[], projectName, stats }

  // =========================================================================
  // UNIT PARSER
  // Metrel embeds units into cell text: "684 W/m2" → { val: 684, unit: 'W/m2' }
  // =========================================================================

  function parseUnit(raw) {
    if (raw === null || raw === undefined || raw === '') return { val: null, unit: '' };
    const s = String(raw).trim();
    const m = s.match(/^([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (m) return { val: parseFloat(m[1]), unit: m[2].trim() };
    return { val: null, unit: '', raw: s };
  }

  function pv(raw) { return parseUnit(raw).val; }   // parse value only

  // =========================================================================
  // EXCEL PARSER — "Measurements" sheet (string-level, rows = one string each)
  // =========================================================================

  function parseMeasurementsSheet(ws, XLSX) {
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows = [];

    data.forEach((row, idx) => {
      // Parse structure path → project / inverter / string labels
      const path   = String(row['Structure Path'] || '');
      const parts  = path.split('/').map(s => s.trim());
      const project   = parts[0] || '';
      const inverter  = parts.slice(1, -1).join(' / ') || '';
      const stringId  = parts[parts.length - 1] || `Row ${idx + 2}`;

      const status    = String(row['Status'] || '').trim();
      const datetime  = String(row['DateTime'] || '').trim();
      const measType  = String(row['Measurement'] || '').trim();

      // Irradiance & temperature
      const irr    = pv(row['Irr']);
      const tcell  = pv(row['Tcell']);

      // Measured Voc / Isc
      const Uoc_m  = pv(row['Uoc_m']);
      const Isc_m  = pv(row['Isc_m']);

      // STC-normalised
      const Uoc_n  = pv(row['Uoc_n']);
      const Isc_n  = pv(row['Isc_n']);

      // STC reference (datasheet expected)
      const Uoc    = pv(row['Uoc']);
      const Isc    = pv(row['Isc']);

      // Deviations
      const dUoc   = pv(row['ΔUoc']);
      const dIsc   = pv(row['ΔIsc']);

      // MPP (if available — Daladagama format)
      const Umpp_m  = pv(row['Umpp_m']);
      const Impp_m  = pv(row['Impp_m']);
      const Pmpp_m  = pv(row['Pmpp_m']);
      const Pmpp_n  = pv(row['Pmpp_n']);
      const dPmpp   = pv(row['ΔPmpp']);
      const dUmpp   = pv(row['ΔUmpp']);
      const dImpp   = pv(row['ΔImpp']);
      const FF_m    = pv(row['FF_m']);
      const FF_n    = pv(row['FF_n']);

      // Insulation
      const Roc_pos = pv(row['Roc+']);
      const Roc_neg = pv(row['Roc-']);
      const Uiso    = pv(row['Uiso']);

      // String config
      const nMod    = pv(row['Number of modules in PV string']);
      const nStr    = pv(row['Number of PV strings']);

      // Module info from tester
      const moduleName = String(row['Module'] || row['Name'] || '').trim();
      const instrId    = String(row['Instrument ID'] || '').trim();

      rows.push({
        _raw: row,
        path, project, inverter, stringId, status, datetime, measType,
        irr, tcell,
        Uoc_m, Isc_m, Uoc_n, Isc_n, Uoc, Isc,
        dUoc, dIsc,
        Umpp_m, Impp_m, Pmpp_m, Pmpp_n, dPmpp, dUmpp, dImpp,
        FF_m, FF_n,
        Roc_pos, Roc_neg, Uiso,
        nMod, nStr, moduleName, instrId,
        hasMpp: Pmpp_m !== null,
      });
    });

    return rows;
  }

  // =========================================================================
  // EXCEL PARSER — "Sheet" (per-module with I/V curve arrays)
  // Metrel stores each param as three columns: _pref, _val, _unit
  // =========================================================================

  function parseModuleSheet(ws, XLSX) {
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    if (!raw.length) return [];

    const headers = raw[0].map(h => String(h || '').trim());
    const rows = [];

    for (let r = 1; r < raw.length; r++) {
      const row = raw[r];
      if (row.every(c => c === '' || c === null || c === undefined)) continue;

      const get = (name) => {
        const vi = headers.indexOf(name + '_val');
        return vi >= 0 ? row[vi] : null;
      };
      const getStr = (name) => {
        const i = headers.indexOf(name);
        return i >= 0 ? String(row[i] || '').trim() : '';
      };

      // Parse I/V curve data: stored as comma-separated "V/I" pairs
      const parseIV = (raw) => {
        if (!raw || String(raw).trim() === '') return [];
        try {
          return String(raw).split(',').map(pt => {
            const [u, i] = pt.trim().split('/');
            return { U: parseFloat(u), I: parseFloat(i) };
          }).filter(p => !isNaN(p.U) && !isNaN(p.I));
        } catch { return []; }
      };

      const ivRaw  = get('U') !== null ? null : null;   // placeholder
      const module = getStr('module') || getStr('Module');
      const cond   = getStr('condition');
      const path   = getStr('Path');
      const mtype  = getStr('Measurement');
      const status = getStr('Status');
      const dt     = getStr('DateTime');
      const serial = getStr('Serial');

      // Key measurements
      const irr    = parseFloat(get('Irr') ?? get('Irr_val') ?? '') || null;
      const tcell  = parseFloat(get('Tcell') ?? '') || null;
      const Uoc_m  = parseFloat(get('Uoc_m') ?? '') || null;
      const Isc_m  = parseFloat(get('Isc_m') ?? '') || null;
      const Uoc_n  = parseFloat(get('Uoc_n') ?? '') || null;
      const Isc_n  = parseFloat(get('Isc_n') ?? '') || null;
      const dUoc   = parseFloat(get('ΔUoc') ?? '') || null;
      const dIsc   = parseFloat(get('ΔIsc') ?? '') || null;
      const Pmpp_m = parseFloat(get('Pmpp_m') ?? '') || null;
      const Pmpp_n = parseFloat(get('Pmpp_n') ?? '') || null;
      const dPmpp  = parseFloat(get('ΔPmpp') ?? '') || null;
      const FF_m   = parseFloat(get('FF_m') ?? '') || null;
      const FF_n   = parseFloat(get('FF_n') ?? '') || null;
      const Umpp_m = parseFloat(get('Umpp_m') ?? '') || null;
      const Impp_m = parseFloat(get('Impp_m') ?? '') || null;

      // I/V curve: find any column with slash-separated data
      let ivPoints = [];
      for (let c = 0; c < headers.length; c++) {
        const cell = String(row[c] || '');
        if (cell.includes('/') && cell.includes(',')) {
          const pts = parseIV(cell);
          if (pts.length > 5) { ivPoints = pts; break; }
        }
      }

      rows.push({
        module, cond, path, mtype, status, dt, serial,
        irr, tcell, Uoc_m, Isc_m, Uoc_n, Isc_n,
        dUoc, dIsc, Pmpp_m, Pmpp_n, dPmpp, FF_m, FF_n,
        Umpp_m, Impp_m, ivPoints,
        hasIV: ivPoints.length > 0,
      });
    }
    return rows;
  }

  // =========================================================================
  // STATS SUMMARY
  // =========================================================================

  function calcStats(rows) {
    const total   = rows.length;
    const pass    = rows.filter(r => r.status.toLowerCase() === 'pass').length;
    const fail    = rows.filter(r => r.status.toLowerCase() === 'fail').length;
    const warn    = total - pass - fail;
    const irrs    = rows.map(r => r.irr).filter(v => v !== null);
    const tcells  = rows.map(r => r.tcell).filter(v => v !== null);
    const dUocs   = rows.map(r => r.dUoc).filter(v => v !== null);
    const dIscs   = rows.map(r => r.dIsc).filter(v => v !== null);
    const dPmpps  = rows.map(r => r.dPmpp).filter(v => v !== null);
    const rocPos  = rows.map(r => r.Roc_pos).filter(v => v !== null);
    const rocNeg  = rows.map(r => r.Roc_neg).filter(v => v !== null);

    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    const min = arr => arr.length ? Math.min(...arr) : null;
    const max = arr => arr.length ? Math.max(...arr) : null;

    return {
      total, pass, fail, warn,
      passRate: total ? (pass/total*100) : 0,
      irr:   { avg: avg(irrs),  min: min(irrs),  max: max(irrs)  },
      tcell: { avg: avg(tcells),min: min(tcells), max: max(tcells) },
      dUoc:  { avg: avg(dUocs), min: min(dUocs),  max: max(dUocs)  },
      dIsc:  { avg: avg(dIscs), min: min(dIscs),  max: max(dIscs)  },
      dPmpp: { avg: avg(dPmpps),min: min(dPmpps), max: max(dPmpps) },
      roc:   { minPos: min(rocPos), minNeg: min(rocNeg) },
    };
  }

  // =========================================================================
  // PANEL DB LOOKUP
  // =========================================================================

  function matchPanel(moduleName, nMod) {
    if (!moduleName || !DB) return null;
    const all = DB.getAll();
    const q   = moduleName.toLowerCase();
    // Try exact match on model or manufacturer+model
    return all.find(p =>
      (p.model && p.model.toLowerCase().includes(q)) ||
      (p.manufacturer && q.includes(p.manufacturer.toLowerCase()))
    ) || null;
  }

  // =========================================================================
  // STC CORRECTION CHECK vs PANEL DB
  // =========================================================================

  function checkVsDB(row, panel) {
    if (!panel || !row.Uoc_n || !row.Isc_n) return null;
    const Voc_exp  = panel.Voc * (row.nMod || 1);
    const Isc_exp  = panel.Isc;
    const devVoc   = ((row.Uoc_n - Voc_exp) / Voc_exp) * 100;
    const devIsc   = ((row.Isc_n - Isc_exp) / Isc_exp) * 100;
    const passVoc  = Math.abs(devVoc) <= 3;
    const passIsc  = Math.abs(devIsc) <= 5;
    return { Voc_exp, Isc_exp, devVoc, devIsc, passVoc, passIsc };
  }

  // =========================================================================
  // RENDER — MAIN
  // =========================================================================

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128202; PV Inspection Analyzer</div>

        <!-- IMPORT CARD -->
        <div class="card" id="insp-import-card">
          <div class="card-title">&#128196; Import Metrel PV Tester Excel</div>
          <div class="info-box">
            Accepts Excel exports from Metrel PV analyzers (IEC 62446 Autotest / I/V curve).
            Supports both string-level and per-module format. Sheet names: <strong>Measurements</strong> or <strong>Sheet</strong>.
          </div>

          <div class="insp-drop-zone" id="insp-drop">
            <div class="insp-drop-icon">&#128196;</div>
            <div class="insp-drop-title">Drop Excel file here</div>
            <div class="insp-drop-sub">or tap to browse &mdash; .xlsx / .xls</div>
            <input type="file" id="insp-file" accept=".xlsx,.xls" style="display:none" />
          </div>

          <div id="insp-import-status" style="margin-top:8px"></div>

          <!-- Module DB source -->
          <div class="card-title" style="margin-top:14px">Module Reference (for STC comparison)</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Match from Panel DB</label>
              <select class="form-select" id="insp-panel-src">
                <option value="auto">Auto-match from tester name</option>
                <option value="manual">Select manually</option>
                <option value="none">No comparison</option>
              </select>
            </div>
            <div class="form-group" id="insp-manual-panel-group" style="display:none">
              <label class="form-label">Select Panel</label>
              <select class="form-select" id="insp-manual-panel">
                <option value="">-- Select --</option>
                ${DB.getAll().map(p => `<option value="${p.id}">${App.escapeHTML(p.manufacturer)} ${App.escapeHTML(p.model)} (${p.Pmax}W)</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- RESULTS (hidden until import) -->
        <div id="insp-results" class="hidden"></div>
      </div>
    `;

    // Panel source toggle
    container.querySelector('#insp-panel-src').addEventListener('change', e => {
      container.querySelector('#insp-manual-panel-group').style.display =
        e.target.value === 'manual' ? '' : 'none';
    });

    // Drop zone
    const dropZone = container.querySelector('#insp-drop');
    const fileInput = container.querySelector('#insp-file');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) _loadFile(file, container);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) _loadFile(e.target.files[0], container);
    });

    // If session already loaded, re-render results
    if (_session) _renderResults(container);
  }

  // =========================================================================
  // FILE LOAD & PARSE
  // =========================================================================

  function _loadFile(file, container) {
    const statusDiv = container.querySelector('#insp-import-status');
    statusDiv.innerHTML = `<div class="info-box">&#9203; Reading <strong>${App.escapeHTML(file.name)}</strong>…</div>`;

    if (typeof XLSX === 'undefined') {
      statusDiv.innerHTML = `<div class="danger-box">SheetJS (XLSX) library not loaded. Check index.html script tag.</div>`;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheetNames = wb.SheetNames;

        let rows = [], ivRows = [], projectName = '', format = '';

        if (sheetNames.includes('Measurements')) {
          const ws = wb.Sheets['Measurements'];
          rows = parseMeasurementsSheet(ws, XLSX);
          projectName = rows[0]?.project || file.name;
          format = 'measurements';
        }
        if (sheetNames.includes('Sheet')) {
          const ws = wb.Sheets['Sheet'];
          ivRows = parseModuleSheet(ws, XLSX);
          if (!projectName) projectName = ivRows[0]?.path || file.name;
          format = format ? 'both' : 'module-sheet';
        }

        if (!rows.length && !ivRows.length) {
          statusDiv.innerHTML = `<div class="danger-box">No recognisable Metrel data found. Expected sheet named <strong>Measurements</strong> or <strong>Sheet</strong>.</div>`;
          return;
        }

        // Get panel reference
        const srcMode = container.querySelector('#insp-panel-src').value;
        let refPanel = null;
        if (srcMode === 'manual') {
          const pid = container.querySelector('#insp-manual-panel').value;
          refPanel = pid ? DB.getById(pid) : null;
        } else if (srcMode === 'auto' && rows.length) {
          refPanel = matchPanel(rows[0].moduleName, rows[0].nMod);
        }

        _session = {
          fileName: file.name,
          importedAt: new Date().toISOString(),
          rows, ivRows, projectName, format, refPanel,
          stats: rows.length ? calcStats(rows) : null,
        };

        statusDiv.innerHTML = `<div class="info-box" style="border-color:var(--success);color:#166534">
          &#10003; Loaded <strong>${App.escapeHTML(file.name)}</strong> &mdash;
          ${rows.length} strings${ivRows.length ? `, ${ivRows.length} module tests` : ''}
          ${refPanel ? `&mdash; Panel: <strong>${App.escapeHTML(refPanel.manufacturer)} ${App.escapeHTML(refPanel.model)}</strong>` : ''}
        </div>`;

        _renderResults(container);

      } catch (err) {
        statusDiv.innerHTML = `<div class="danger-box">Parse error: ${App.escapeHTML(err.message)}</div>`;
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // =========================================================================
  // RESULTS RENDERER
  // =========================================================================

  function _renderResults(container) {
    const s = _session;
    const res = container.querySelector('#insp-results');
    res.classList.remove('hidden');

    const hasStrings = s.rows.length > 0;
    const hasIV      = s.ivRows.length > 0;
    const stats      = s.stats;

    res.innerHTML = `
      ${hasStrings ? _renderSummaryCards(stats, s) : ''}
      ${hasStrings ? _renderStatusBreakdown(s) : ''}
      ${hasStrings ? _renderStringTable(s) : ''}
      ${hasIV      ? _renderModuleTestSection(s) : ''}
      <div class="card">
        <div class="card-title">&#128196; Export / Actions</div>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" id="insp-clear-btn">&#128465; Clear Session</button>
          <button class="btn btn-secondary btn-sm" id="insp-print-btn">&#128424; Print Report</button>
          <button class="btn btn-secondary btn-sm" id="insp-csv-btn">&#128229; Export CSV</button>
        </div>
      </div>
    `;

    // Wire actions
    res.querySelector('#insp-clear-btn').addEventListener('click', () => {
      _session = null;
      res.classList.add('hidden');
      container.querySelector('#insp-import-status').innerHTML = '';
      App.toast('Session cleared');
    });
    res.querySelector('#insp-print-btn').addEventListener('click', () => {
      App.printSection('#insp-results', `PV Inspection — ${s.projectName}`, container);
    });
    res.querySelector('#insp-csv-btn').addEventListener('click', () => _exportCSV(s));

    // Wire string row detail buttons
    res.querySelectorAll('.insp-row-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        _showStringDetail(s.rows[idx], s.refPanel, res, idx);
      });
    });

    // Wire IV row buttons
    res.querySelectorAll('.insp-iv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        _showIVDetail(s.ivRows[idx], res);
      });
    });
  }

  // =========================================================================
  // SUMMARY CARDS
  // =========================================================================

  function _renderSummaryCards(stats, s) {
    const prCls = stats.passRate >= 95 ? 'alert-safe' : stats.passRate >= 80 ? 'alert-warn' : 'alert-unsafe';
    const rocOk = (stats.roc.minPos === null || stats.roc.minPos >= 1) &&
                  (stats.roc.minNeg === null || stats.roc.minNeg >= 1);

    return `
    <div class="card">
      <div class="card-title">&#128202; ${App.escapeHTML(s.projectName)} — Import Summary</div>
      <div class="insp-summary-meta">
        File: <strong>${App.escapeHTML(s.fileName)}</strong> &bull;
        Imported: ${new Date(s.importedAt).toLocaleString()} &bull;
        Format: ${App.escapeHTML(s.format)}
        ${s.refPanel ? ` &bull; Panel ref: <strong>${App.escapeHTML(s.refPanel.manufacturer)} ${App.escapeHTML(s.refPanel.model)}</strong>` : ''}
      </div>
      <div class="result-grid" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
        <div class="result-box ${prCls}">
          <div class="result-value">${stats.passRate.toFixed(0)}%</div>
          <div class="result-label">Pass Rate</div>
          <div class="result-unit">${stats.pass} pass / ${stats.fail} fail / ${stats.warn} warn</div>
        </div>
        <div class="result-box">
          <div class="result-value">${stats.total}</div>
          <div class="result-label">Strings Tested</div>
          <div class="result-unit">IEC 62446 Autotest</div>
        </div>
        <div class="result-box ${rocOk ? 'alert-safe' : 'alert-unsafe'}">
          <div class="result-value">${rocOk ? '&#10003;' : '&#9888;'}</div>
          <div class="result-label">Insulation</div>
          <div class="result-unit">Min Roc+: ${stats.roc.minPos !== null ? stats.roc.minPos.toFixed(1)+' MΩ' : 'N/A'}</div>
        </div>
        <div class="result-box">
          <div class="result-value">${stats.irr.avg !== null ? stats.irr.avg.toFixed(0) : '—'}</div>
          <div class="result-label">Avg Irr (W/m²)</div>
          <div class="result-unit">${stats.irr.min?.toFixed(0)}–${stats.irr.max?.toFixed(0)} W/m²</div>
        </div>
        <div class="result-box">
          <div class="result-value">${stats.tcell.avg !== null ? stats.tcell.avg.toFixed(1) : '—'}</div>
          <div class="result-label">Avg T_cell (°C)</div>
          <div class="result-unit">${stats.tcell.min?.toFixed(1)}–${stats.tcell.max?.toFixed(1)} °C</div>
        </div>
        <div class="result-box ${stats.dUoc && Math.abs(stats.dUoc.avg||0) > 3 ? 'alert-warn' : ''}">
          <div class="result-value">${stats.dUoc.avg !== null ? stats.dUoc.avg.toFixed(1)+'%' : '—'}</div>
          <div class="result-label">Avg ΔVoc</div>
          <div class="result-unit">${stats.dUoc.min?.toFixed(1)}% to ${stats.dUoc.max?.toFixed(1)}%</div>
        </div>
      </div>
    </div>`;
  }

  // =========================================================================
  // STATUS BREAKDOWN BAR CHART
  // =========================================================================

  function _renderStatusBreakdown(s) {
    // ΔVoc histogram
    const dVocVals = s.rows.map(r => r.dUoc).filter(v => v !== null);
    const dIscVals = s.rows.map(r => r.dIsc).filter(v => v !== null);

    return `
    <div class="card">
      <div class="card-title">&#128202; Deviation Distribution</div>
      <div class="form-row cols-2" style="gap:16px">
        <div>
          <div class="section-title">ΔVoc (%) — all strings</div>
          ${_miniHistogram(dVocVals, -10, 10, 20, '%', 3)}
        </div>
        <div>
          <div class="section-title">ΔIsc (%) — all strings</div>
          ${_miniHistogram(dIscVals, -15, 5, 20, '%', 5)}
        </div>
      </div>
      ${s.stats.dPmpp.avg !== null ? `
      <div class="section-title" style="margin-top:10px">ΔPmpp (%) — power deviation at MPP</div>
      ${_miniHistogram(s.rows.map(r=>r.dPmpp).filter(v=>v!==null), -15, 5, 20, '%', 5)}
      ` : ''}
    </div>`;
  }

  // Mini histogram SVG
  function _miniHistogram(values, xMin, xMax, bins, unit, warnThresh) {
    if (!values.length) return '<div class="text-muted" style="font-size:0.78rem">No data</div>';
    const W=300,H=80,PL=30,PR=10,PT=8,PB=20;
    const cW=W-PL-PR, cH=H-PT-PB;
    const step=(xMax-xMin)/bins;
    const counts=Array(bins).fill(0);
    values.forEach(v=>{
      const bi=Math.min(bins-1,Math.max(0,Math.floor((v-xMin)/step)));
      counts[bi]++;
    });
    const maxC=Math.max(...counts,1);
    const bw=cW/bins;
    const px=x=>PL+(x-xMin)/(xMax-xMin)*cW;
    const py=y=>PT+cH-y/maxC*cH;

    const bars=counts.map((c,i)=>{
      const x=PL+i*bw, barY=py(c), h=cH-(barY-PT);
      const binCenter=xMin+(i+0.5)*step;
      const col=Math.abs(binCenter)>warnThresh?'#dc2626':'#d97706';
      return `<rect x="${x.toFixed(1)}" y="${barY.toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" rx="1"/>`;
    }).join('');

    // Tick marks at 0 and warn thresholds
    const ticks=[-warnThresh,0,warnThresh].map(v=>{
      const x=px(v);
      return `<line x1="${x.toFixed(1)}" y1="${PT}" x2="${x.toFixed(1)}" y2="${PT+cH}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3"/>
        <text x="${x.toFixed(1)}" y="${PT+cH+11}" text-anchor="middle" font-size="7" fill="#9ca3af">${v}${unit}</text>`;
    }).join('');

    const avg=values.reduce((a,b)=>a+b,0)/values.length;
    const avgX=px(avg);

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:400px;display:block">
      ${ticks}
      ${bars}
      <line x1="${avgX.toFixed(1)}" y1="${PT}" x2="${avgX.toFixed(1)}" y2="${PT+cH}" stroke="#16a34a" stroke-width="1.5"/>
      <text x="${(avgX+3).toFixed(1)}" y="${PT+10}" font-size="7" fill="#16a34a">avg ${avg.toFixed(1)}${unit}</text>
      <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="#6b7280" stroke-width="1"/>
      <text x="${PL-3}" y="${PT+cH}" text-anchor="end" font-size="7" fill="#9ca3af">${maxC}</text>
      <text x="${PL-3}" y="${PT+4}" text-anchor="end" font-size="7" fill="#9ca3af">0</text>
    </svg>
    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">
      n=${values.length} &bull; avg=${avg.toFixed(2)}${unit} &bull; min=${Math.min(...values).toFixed(2)}${unit} &bull; max=${Math.max(...values).toFixed(2)}${unit}
    </div>`;
  }

  // =========================================================================
  // STRING TABLE
  // =========================================================================

  function _renderStringTable(s) {
    const hasMpp = s.rows.some(r => r.hasMpp);
    const rows = s.rows.map((r, i) => {
      const sc = r.status.toLowerCase() === 'pass' ? 'status-ok' :
                 r.status.toLowerCase() === 'fail' ? 'status-fault' : 'status-warning';
      const badge = r.status.toLowerCase() === 'pass'
        ? '<span class="status-badge badge-pass">PASS</span>'
        : r.status.toLowerCase() === 'fail'
          ? '<span class="status-badge badge-fail">FAIL</span>'
          : `<span class="status-badge badge-warn">${App.escapeHTML(r.status)}</span>`;

      const dVocCls = r.dUoc !== null && Math.abs(r.dUoc) > 3 ? 'style="color:var(--danger);font-weight:700"' : '';
      const dIscCls = r.dIsc !== null && Math.abs(r.dIsc) > 5 ? 'style="color:var(--danger);font-weight:700"' : '';
      const rocOk   = (r.Roc_pos === null || r.Roc_pos >= 1) && (r.Roc_neg === null || r.Roc_neg >= 1);

      // DB comparison
      const dbCheck = s.refPanel ? checkVsDB(r, s.refPanel) : null;
      const dbCell  = dbCheck
        ? `<td ${dbCheck.passVoc && dbCheck.passIsc ? '' : 'style="color:var(--danger);font-weight:700"'}>
            Voc: ${dbCheck.devVoc.toFixed(1)}% Isc: ${dbCheck.devIsc.toFixed(1)}%
           </td>`
        : '<td>—</td>';

      return `<tr class="${sc}">
        <td><strong>${App.escapeHTML(r.stringId)}</strong><br><small style="color:var(--text-muted)">${App.escapeHTML(r.inverter)}</small></td>
        <td>${badge}</td>
        <td>${r.irr !== null ? r.irr.toFixed(0) : '—'}</td>
        <td>${r.tcell !== null ? r.tcell.toFixed(1) : '—'}</td>
        <td>${r.Uoc_m !== null ? r.Uoc_m.toFixed(0) : '—'}</td>
        <td>${r.Isc_m !== null ? r.Isc_m.toFixed(2) : '—'}</td>
        <td ${dVocCls}>${r.dUoc !== null ? r.dUoc.toFixed(2)+'%' : '—'}</td>
        <td ${dIscCls}>${r.dIsc !== null ? r.dIsc.toFixed(2)+'%' : '—'}</td>
        ${hasMpp ? `<td>${r.dPmpp !== null ? r.dPmpp.toFixed(2)+'%' : '—'}</td>` : ''}
        <td ${!rocOk ? 'style="color:var(--danger)"' : ''}>${r.Roc_pos !== null ? r.Roc_pos.toFixed(1) : '—'} / ${r.Roc_neg !== null ? r.Roc_neg.toFixed(1) : '—'}</td>
        ${dbCell}
        <td><button class="btn btn-secondary btn-sm insp-row-detail-btn" data-idx="${i}">Detail</button></td>
      </tr>`;
    }).join('');

    return `
    <div class="card">
      <div class="card-title">&#9889; String Results (${s.rows.length} strings)</div>
      <div style="overflow-x:auto">
        <table class="status-table" style="font-size:0.78rem;white-space:nowrap">
          <thead>
            <tr>
              <th>String / Path</th>
              <th>Status</th>
              <th>Irr<br><small>W/m²</small></th>
              <th>T_cell<br><small>°C</small></th>
              <th>Voc_m<br><small>V</small></th>
              <th>Isc_m<br><small>A</small></th>
              <th>ΔVoc<br><small>%</small></th>
              <th>ΔIsc<br><small>%</small></th>
              ${hasMpp ? '<th>ΔPmpp<br><small>%</small></th>' : ''}
              <th>Roc+/−<br><small>MΩ</small></th>
              <th>${s.refPanel ? 'vs DB' : 'vs DB'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="insp-string-detail"></div>
    </div>`;
  }

  // =========================================================================
  // STRING DETAIL PANEL (expands inline)
  // =========================================================================

  function _showStringDetail(row, refPanel, res, idx) {
    const detailDiv = res.querySelector('#insp-string-detail');
    if (!detailDiv) return;

    // Toggle off if same
    if (detailDiv.dataset.idx === String(idx) && !detailDiv.classList.contains('hidden')) {
      detailDiv.classList.add('hidden');
      detailDiv.dataset.idx = '';
      return;
    }
    detailDiv.dataset.idx = String(idx);
    detailDiv.classList.remove('hidden');

    const dbCheck = refPanel ? checkVsDB(row, refPanel) : null;
    const rocOk   = (row.Roc_pos === null || row.Roc_pos >= 1) && (row.Roc_neg === null || row.Roc_neg >= 1);

    detailDiv.innerHTML = `
      <div style="margin-top:12px;padding:14px;background:var(--bg-2);border-radius:var(--radius);border:1px solid var(--border)">
        <div class="card-title" style="margin-bottom:10px">
          &#128202; ${App.escapeHTML(row.stringId)} &mdash; ${App.escapeHTML(row.datetime)}
        </div>

        <div class="form-row cols-2">
          <div>
            <div class="section-title">Measurement Conditions</div>
            ${_kv('Irradiance', row.irr !== null ? row.irr.toFixed(0)+' W/m²' : '—')}
            ${_kv('Cell Temp', row.tcell !== null ? row.tcell.toFixed(1)+' °C' : '—')}
            ${_kv('Modules/String', row.nMod || '—')}
            ${_kv('Strings', row.nStr || '—')}
            ${_kv('Instrument', row.instrId || '—')}
            ${_kv('Test Type', row.measType)}
          </div>
          <div>
            <div class="section-title">Measured Values</div>
            ${_kv('Voc (measured)', row.Uoc_m !== null ? row.Uoc_m.toFixed(1)+' V' : '—')}
            ${_kv('Isc (measured)', row.Isc_m !== null ? row.Isc_m.toFixed(3)+' A' : '—')}
            ${_kv('Voc (STC norm)', row.Uoc_n !== null ? row.Uoc_n.toFixed(1)+' V' : '—')}
            ${_kv('Isc (STC norm)', row.Isc_n !== null ? row.Isc_n.toFixed(3)+' A' : '—')}
            ${_kv('ΔVoc', row.dUoc !== null ? row.dUoc.toFixed(2)+'%' : '—', Math.abs(row.dUoc||0)>3)}
            ${_kv('ΔIsc', row.dIsc !== null ? row.dIsc.toFixed(2)+'%' : '—', Math.abs(row.dIsc||0)>5)}
          </div>
        </div>

        ${row.hasMpp ? `
        <div class="section-title" style="margin-top:10px">MPP (Maximum Power Point)</div>
        <div class="form-row cols-2">
          <div>
            ${_kv('Vmpp (measured)', row.Umpp_m !== null ? row.Umpp_m.toFixed(1)+' V' : '—')}
            ${_kv('Impp (measured)', row.Impp_m !== null ? row.Impp_m.toFixed(3)+' A' : '—')}
            ${_kv('Pmpp (measured)', row.Pmpp_m !== null ? row.Pmpp_m.toFixed(1)+' W' : '—')}
          </div>
          <div>
            ${_kv('Pmpp (STC norm)', row.Pmpp_n !== null ? row.Pmpp_n.toFixed(1)+' W' : '—')}
            ${_kv('ΔPmpp', row.dPmpp !== null ? row.dPmpp.toFixed(2)+'%' : '—', Math.abs(row.dPmpp||0)>5)}
            ${_kv('FF (measured)', row.FF_m !== null ? row.FF_m.toFixed(2)+'%' : '—')}
            ${_kv('FF (STC norm)', row.FF_n !== null ? row.FF_n.toFixed(2)+'%' : '—')}
          </div>
        </div>` : ''}

        <div class="section-title" style="margin-top:10px">Insulation Resistance (IEC 62446-1)</div>
        <div class="form-row cols-2">
          <div>
            ${_kv('Roc+ (DC+ to Earth)', row.Roc_pos !== null ? row.Roc_pos.toFixed(1)+' MΩ' : '—', row.Roc_pos !== null && row.Roc_pos < 1)}
            ${_kv('Roc− (DC− to Earth)', row.Roc_neg !== null ? row.Roc_neg.toFixed(1)+' MΩ' : '—', row.Roc_neg !== null && row.Roc_neg < 1)}
            ${_kv('Uiso (test voltage)', row.Uiso !== null ? row.Uiso.toFixed(0)+' V' : '—')}
          </div>
          <div>
            <div class="result-box ${rocOk ? 'alert-safe' : 'alert-unsafe'}" style="margin-top:4px">
              <div class="result-value" style="font-size:1.1rem">${rocOk ? '&#10003; IR PASS' : '&#9888; IR FAIL'}</div>
              <div class="result-unit">Min IEC 62446-1: 1 MΩ at 500V</div>
            </div>
          </div>
        </div>

        ${dbCheck ? `
        <div class="section-title" style="margin-top:10px">vs Panel DB (${App.escapeHTML(refPanel.manufacturer)} ${App.escapeHTML(refPanel.model)})</div>
        <div class="form-row cols-2">
          <div>
            ${_kv('Expected Voc (STC)', dbCheck.Voc_exp.toFixed(1)+' V')}
            ${_kv('Measured Voc (norm)', row.Uoc_n !== null ? row.Uoc_n.toFixed(1)+' V' : '—')}
            ${_kv('Deviation', dbCheck.devVoc.toFixed(2)+'%', !dbCheck.passVoc)}
          </div>
          <div>
            ${_kv('Expected Isc (STC)', dbCheck.Isc_exp.toFixed(3)+' A')}
            ${_kv('Measured Isc (norm)', row.Isc_n !== null ? row.Isc_n.toFixed(3)+' A' : '—')}
            ${_kv('Deviation', dbCheck.devIsc.toFixed(2)+'%', !dbCheck.passIsc)}
          </div>
        </div>
        <div class="info-box" style="font-size:0.78rem;margin-top:6px">
          IEC 62446-1: Voc tolerance ±3%, Isc tolerance ±5% vs STC datasheet.
          ${dbCheck.passVoc && dbCheck.passIsc ? '&#10003; Both within limits.' : '&#9888; One or more deviations exceed limits — investigate.'}
        </div>` : ''}

        ${_faultHint(row)}
      </div>`;
  }

  // =========================================================================
  // AUTO FAULT HINT
  // =========================================================================

  function _faultHint(row) {
    const hints = [];

    if (row.dUoc !== null && row.dIsc !== null) {
      const aVoc = Math.abs(row.dUoc), aIsc = Math.abs(row.dIsc);

      if (row.dUoc < -5 && aIsc < 3)
        hints.push({ sev: 'fault', msg: 'Voc significantly low, Isc normal → possible module open-circuit or reduced string count.' });
      if (row.dIsc < -8)
        hints.push({ sev: 'warn', msg: `ΔIsc = ${row.dIsc.toFixed(1)}% → possible shading, soiling, or module mismatch. Check individual modules.` });
      if (aVoc < 2 && aIsc < 2)
        hints.push({ sev: 'ok', msg: 'Both Voc and Isc within ±2% — excellent string health.' });
      if (row.Roc_pos !== null && row.Roc_pos < 1)
        hints.push({ sev: 'fault', msg: `Roc+ = ${row.Roc_pos.toFixed(2)} MΩ < 1 MΩ — earth fault on DC+ rail. Do not energise.` });
      if (row.Roc_neg !== null && row.Roc_neg < 1)
        hints.push({ sev: 'fault', msg: `Roc− = ${row.Roc_neg.toFixed(2)} MΩ < 1 MΩ — earth fault on DC− rail. Do not energise.` });
      if (row.irr !== null && row.irr < 300)
        hints.push({ sev: 'warn', msg: `Irradiance ${row.irr.toFixed(0)} W/m² — below 300 W/m². Low-irradiance test; normalised values less reliable.` });
    }

    if (!hints.length) return '';

    return `<div class="section-title" style="margin-top:10px">Automatic Fault Hints</div>
      ${hints.map(h => `<div class="${h.sev === 'fault' ? 'danger-box' : h.sev === 'warn' ? 'warn-box' : 'info-box'}" style="margin-bottom:6px">${h.msg}</div>`).join('')}`;
  }

  // =========================================================================
  // MODULE TEST SECTION (I/V curve data)
  // =========================================================================

  function _renderModuleTestSection(s) {
    const rows = s.ivRows.map((r, i) => {
      const sc = r.status.toLowerCase() === 'pass' ? 'status-ok' :
                 r.status.toLowerCase() === 'fail' ? 'status-fault' : '';
      return `<tr class="${sc}">
        <td><strong>${App.escapeHTML(r.module || '—')}</strong></td>
        <td>${App.escapeHTML(r.cond || '—')}</td>
        <td>${App.escapeHTML(r.mtype || '—')}</td>
        <td>${r.irr !== null ? r.irr.toFixed(0) : '—'}</td>
        <td>${r.tcell !== null ? r.tcell.toFixed(1) : '—'}</td>
        <td>${r.Uoc_m !== null ? r.Uoc_m.toFixed(2) : '—'}</td>
        <td>${r.Isc_m !== null ? r.Isc_m.toFixed(3) : '—'}</td>
        <td>${r.Pmpp_m !== null ? r.Pmpp_m.toFixed(2) : '—'}</td>
        <td>${r.dPmpp !== null ? r.dPmpp.toFixed(2)+'%' : '—'}</td>
        <td>${r.FF_m !== null ? r.FF_m.toFixed(1)+'%' : '—'}</td>
        <td>${r.hasIV
          ? `<button class="btn btn-secondary btn-sm insp-iv-btn" data-idx="${i}">I/V Curve</button>`
          : '—'}</td>
      </tr>`;
    }).join('');

    return `
    <div class="card">
      <div class="card-title">&#128200; Module Tests (${s.ivRows.length} records)</div>
      <div style="overflow-x:auto">
        <table class="status-table" style="font-size:0.78rem;white-space:nowrap">
          <thead>
            <tr>
              <th>Module</th><th>Condition</th><th>Test Type</th>
              <th>Irr<br><small>W/m²</small></th><th>T_cell<br><small>°C</small></th>
              <th>Voc<br><small>V</small></th><th>Isc<br><small>A</small></th>
              <th>Pmpp<br><small>W</small></th><th>ΔPmpp</th>
              <th>FF</th><th>I/V</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="insp-iv-detail"></div>
    </div>`;
  }

  // =========================================================================
  // I/V CURVE CHART
  // =========================================================================

  function _showIVDetail(row, res) {
    const detailDiv = res.querySelector('#insp-iv-detail');
    if (!detailDiv) return;

    if (!row.hasIV) {
      detailDiv.innerHTML = '<div class="info-box">No I/V curve data in this record.</div>';
      return;
    }

    const pts = row.ivPoints;
    const maxU = Math.max(...pts.map(p => p.U));
    const maxI = Math.max(...pts.map(p => p.I));

    // Find MPP (max P = U×I)
    let mpp = pts.reduce((best, p) => (p.U * p.I > best.U * best.I ? p : best), pts[0]);

    const W=340, H=200, PL=44, PR=14, PT=14, PB=28;
    const cW=W-PL-PR, cH=H-PT-PB;
    const px = u => PL + (u / maxU) * cW;
    const py = i => PT + cH - (i / maxI) * cH;

    // I/V curve path
    const ivPath = pts.map((p, i) => `${i===0?'M':'L'}${px(p.U).toFixed(1)},${py(p.I).toFixed(1)}`).join(' ');

    // P/V curve (scale P to fit same canvas — Pmax maps to cH)
    const maxP = Math.max(...pts.map(p => p.U * p.I));
    const pyP  = p => PT + cH - (p / maxP) * cH;
    const pvPath = pts.map((p, i) => `${i===0?'M':'L'}${px(p.U).toFixed(1)},${pyP(p.U*p.I).toFixed(1)}`).join(' ');

    // MPP marker
    const mppX = px(mpp.U), mppY = py(mpp.I);

    const xTicks = [0, 0.25, 0.5, 0.75, 1.0].map(f => {
      const u = maxU * f, x = px(u);
      return `<line x1="${x.toFixed(1)}" y1="${PT}" x2="${x.toFixed(1)}" y2="${PT+cH}" stroke="#e5e7eb" stroke-width="0.5"/>
        <text x="${x.toFixed(1)}" y="${PT+cH+11}" text-anchor="middle" font-size="7" fill="#9ca3af">${u.toFixed(1)}</text>`;
    }).join('');
    const yTicks = [0, 0.5, 1.0].map(f => {
      const ii = maxI * f, y = py(ii);
      return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${PL+cW}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>
        <text x="${PL-3}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7" fill="#9ca3af">${ii.toFixed(2)}</text>`;
    }).join('');

    detailDiv.innerHTML = `
      <div style="margin-top:12px;padding:14px;background:var(--bg-2);border-radius:var(--radius);border:1px solid var(--border)">
        <div class="card-title">I/V Curve — ${App.escapeHTML(row.module || 'Module')} (${App.escapeHTML(row.cond || '')})</div>
        <div class="insp-summary-meta">
          Irr: ${row.irr ?? '—'} W/m² &bull; T_cell: ${row.tcell ?? '—'} °C &bull;
          Voc: ${row.Uoc_m?.toFixed(2) ?? '—'} V &bull; Isc: ${row.Isc_m?.toFixed(3) ?? '—'} A &bull;
          Pmpp: ${row.Pmpp_m?.toFixed(2) ?? '—'} W &bull; FF: ${row.FF_m?.toFixed(1) ?? '—'}%
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:8px auto 0">
          ${xTicks}${yTicks}
          <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="#6b7280" stroke-width="1.5"/>
          <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="#6b7280" stroke-width="1.5"/>
          <!-- P/V curve (orange, dashed) -->
          <path d="${pvPath}" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.7"/>
          <!-- I/V curve (blue) -->
          <path d="${ivPath}" fill="none" stroke="#0284c7" stroke-width="2"/>
          <!-- MPP marker -->
          <circle cx="${mppX.toFixed(1)}" cy="${mppY.toFixed(1)}" r="5" fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
          <text x="${(mppX+7).toFixed(1)}" y="${(mppY-4).toFixed(1)}" font-size="7" fill="#dc2626">MPP: ${(mpp.U*mpp.I).toFixed(1)}W</text>
          <!-- Axis labels -->
          <text x="${PL+cW/2}" y="${H-1}" text-anchor="middle" font-size="8" fill="#6b7280">Voltage (V)</text>
          <text x="10" y="${PT+cH/2}" text-anchor="middle" font-size="8" fill="#0284c7" transform="rotate(-90,10,${PT+cH/2})">Current (A)</text>
          <text x="${PL+cW-4}" y="${PT+10}" text-anchor="end" font-size="7" fill="#d97706">P/V (W, scaled)</text>
          <!-- Legend -->
          <line x1="52" y1="10" x2="64" y2="10" stroke="#0284c7" stroke-width="2"/>
          <text x="67" y="13" font-size="7" fill="#6b7280">I/V</text>
          <line x1="90" y1="10" x2="102" y2="10" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4 2"/>
          <text x="105" y="13" font-size="7" fill="#6b7280">P/V</text>
        </svg>
        <div class="result-grid" style="grid-template-columns:repeat(4,1fr);margin-top:10px">
          ${_rbox(mpp.U.toFixed(2)+' V', 'Vmpp (meas.)')}
          ${_rbox(mpp.I.toFixed(3)+' A', 'Impp (meas.)')}
          ${_rbox((mpp.U*mpp.I).toFixed(2)+' W', 'Pmpp (meas.)', Math.abs(((mpp.U*mpp.I)-(row.Pmpp_m||mpp.U*mpp.I))/(row.Pmpp_m||1)*100) > 5 ? 'alert-warn' : '')}
          ${_rbox((row.FF_m||0).toFixed(1)+'%', 'Fill Factor', (row.FF_m||0) < 70 ? 'alert-warn' : '')}
        </div>
        ${row.dPmpp !== null ? `
        <div class="${Math.abs(row.dPmpp)>5 ? 'warn-box' : 'info-box'}" style="margin-top:8px;font-size:0.80rem">
          ΔPmpp = ${row.dPmpp.toFixed(2)}% vs STC normalised value.
          ${Math.abs(row.dPmpp) > 5 ? '⚠ Exceeds ±5% — investigate module.' : '✓ Within acceptable range.'}
        </div>` : ''}
      </div>`;
  }

  // =========================================================================
  // CSV EXPORT
  // =========================================================================

  function _exportCSV(s) {
    if (!s.rows.length) { App.toast('No string data to export', 'warning'); return; }
    const headers = ['String ID','Path','Status','DateTime','Irr(W/m2)','Tcell(degC)',
      'Voc_m(V)','Isc_m(A)','Voc_n(V)','Isc_n(V)','dVoc(%)','dIsc(%)',
      'Pmpp_m(W)','Pmpp_n(W)','dPmpp(%)','FF_m(%)','FF_n(%)',
      'Roc+(MOhm)','Roc-(MOhm)','Modules/String'];
    const lines = [headers.join(',')];
    s.rows.forEach(r => {
      lines.push([
        r.stringId, r.path, r.status, r.datetime,
        r.irr ?? '', r.tcell ?? '',
        r.Uoc_m ?? '', r.Isc_m ?? '', r.Uoc_n ?? '', r.Isc_n ?? '',
        r.dUoc ?? '', r.dIsc ?? '',
        r.Pmpp_m ?? '', r.Pmpp_n ?? '', r.dPmpp ?? '',
        r.FF_m ?? '', r.FF_n ?? '',
        r.Roc_pos ?? '', r.Roc_neg ?? '', r.nMod ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pv_inspection_${s.projectName.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
    App.toast('CSV exported', 'success');
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  function _kv(label, value, warn) {
    return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.80rem">
      <span style="color:var(--text-secondary)">${label}</span>
      <span style="font-weight:600;color:${warn ? 'var(--danger)' : 'var(--text)'}">${value}</span>
    </div>`;
  }

  function _rbox(value, label, cls) {
    return `<div class="result-box ${cls||''}"><div class="result-value" style="font-size:1rem">${value}</div><div class="result-label">${label}</div></div>`;
  }

  return { render };

})();
