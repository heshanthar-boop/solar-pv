/**
 * app.js — Router, Navigation, Global State, Utilities
 * Must load last. All other modules are already defined.
 */

const App = (() => {
  // Global state shared across modules
  const state = {
    currentPage: null,
    projectType: 'all',
    sizingInputs: null,
    sizingResult: null,   // used by FaultChecker + FieldTest
    wireInputs: null,
    wireResult: null,
    hybridInputs: null,
    hybridResult: null,
    fieldTestResults: null,
    faultCheckResults: null,
    yieldResults: null,
    lastSessionId: null
  };

  const PAGES = {
    database:   { title: 'Database',            render: (c) => DB.renderPage(c) },
    sizing:     { title: 'String Sizing',       render: (c) => Sizing.render(c) },
    wirecalc:   { title: 'Wire Calculation',    render: (c) => WireCalc.render(c) },
    hybrid:     { title: 'Hybrid Setup',        render: (c) => HybridSetup.render(c) },
    temp:       { title: 'Temp Correction',     render: (c) => TempCalc.render(c) },
    fieldtest:  { title: 'Field Test vs STC',   render: (c) => FieldTest.render(c) },
    fault:      { title: 'Fault Checker',       render: (c) => FaultChecker.render(c) },
    inspection: { title: 'Inspection Log',      render: (c) => Inspection.render(c) },
    pr:         { title: 'PR & IR Test',        render: (c) => PRCalc.render(c) },
    standards:   { title: 'Standards Reference',        render: (c) => Standards.render(c) },
    degradation: { title: 'Module Degradation',         render: (c) => Degradation.render(c) },
    fieldanalysis:{ title: 'Field Analysis & Tracking', render: (c) => FieldAnalysis.render(c) },
    diagnostics: { title: 'PV Diagnostics',             render: (c) => PVDiagnostics.render(c) },
    inverter:    { title: 'Inverter Performance',       render: (c) => InverterPerf.render(c) },
    shading:     { title: 'Shading & Loss',             render: (c) => ShadingLoss.render(c) },
    yield:       { title: 'Yield Estimator',            render: (c) => YieldEstimator.render(c) },
    inspector:   { title: 'PV Inspection Analyzer',    render: (c) => PVInspector.render(c) },
    faultai:     { title: 'Fault Detection',            render: (c) => FaultAI.render(c) },
    settings:    { title: 'Settings',                   render: (c) => _renderSettings(c) },
  };

  const PROJECT_TYPES = {
    all: {
      label: 'All Modules',
      pages: Object.keys(PAGES),
    },
    gridTie: {
      label: 'Grid-Tie System',
      pages: ['database', 'sizing', 'wirecalc', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'inspector', 'standards', 'settings'],
    },
    gridTieHybrid: {
      label: 'Grid-Tie Hybrid System',
      pages: ['database', 'sizing', 'wirecalc', 'hybrid', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'inspector', 'degradation', 'fieldanalysis', 'diagnostics', 'faultai', 'standards', 'settings'],
    },
    fullyHybrid: {
      label: 'Fully Hybrid System',
      pages: ['database', 'wirecalc', 'hybrid', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'degradation', 'fieldanalysis', 'diagnostics', 'yield', 'standards', 'settings'],
    },
    groundMount: {
      label: 'Ground Mount Solar System',
      pages: ['database', 'sizing', 'wirecalc', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'inspector', 'fieldanalysis', 'diagnostics', 'standards', 'settings'],
    },
    battery: {
      label: 'Battery Focus',
      pages: ['database', 'wirecalc', 'hybrid', 'fieldtest', 'fault', 'pr', 'standards', 'settings'],
    },
    standardsOnly: {
      label: 'Standards',
      pages: ['standards', 'wirecalc', 'settings'],
    },
    pvAnalysis: {
      label: 'PV Analysis',
      pages: ['fieldanalysis', 'diagnostics', 'pr', 'degradation', 'yield', 'inverter', 'shading', 'faultai', 'standards', 'wirecalc', 'settings'],
    },
  };

  // Home screen tile definitions — grouped, with project-type visibility
  const HOME_TILES = [
    {
      group: 'Design & Sizing',
      tiles: [
        { page: 'database',    icon: '&#128230;', label: 'Database',            desc: 'PV, inverter, battery catalogs' },
        { page: 'sizing',      icon: '&#9889;',   label: 'String Sizing',        desc: 'Voltage & current limits' },
        { page: 'wirecalc',    icon: '&#128268;', label: 'Wire Calculation',     desc: 'Cable sizing & losses' },
        { page: 'hybrid',      icon: '&#128267;', label: 'Hybrid Setup',         desc: 'Battery & inverter check' },
        { page: 'yield',       icon: '&#9728;',   label: 'Yield Estimator',      desc: 'Monthly kWh simulation' },
        { page: 'inspector',   icon: '&#128202;', label: 'PV Inspection Analyzer', desc: 'Metrel Excel import & analysis' },
        { page: 'shading',     icon: '&#127774;', label: 'Shading & Loss',       desc: 'AOI & irradiance loss' },
      ]
    },
    {
      group: 'Field Testing',
      tiles: [
        { page: 'fieldtest',   icon: '&#128202;', label: 'Field Test vs STC',    desc: 'Voc/Isc correction' },
        { page: 'temp',        icon: '&#127777;', label: 'Temp Correction',      desc: 'Module temp derating' },
        { page: 'fault',       icon: '&#9888;',   label: 'Fault Checker',        desc: 'String fault patterns' },
        { page: 'pr',          icon: '&#128200;', label: 'PR & IR Test',         desc: 'IEC 61724 / 62446' },
        { page: 'inspection',  icon: '&#128203;', label: 'Inspection Log',       desc: 'Site inspection record' },
      ]
    },
    {
      group: 'Analysis & Diagnostics',
      tiles: [
        { page: 'diagnostics',   icon: '&#128269;', label: 'PV Diagnostics',       desc: 'System health check' },
        { page: 'inverter',      icon: '&#9889;',   label: 'Inverter Performance',  desc: 'Efficiency & AC/DC ratio' },
        { page: 'fieldanalysis', icon: '&#128202;', label: 'Field Analysis',        desc: 'Trend & tracking' },
        { page: 'degradation',   icon: '&#128200;', label: 'Module Degradation',    desc: 'Linear / compound model' },
        { page: 'faultai',       icon: '&#129302;', label: 'Fault Detection',       desc: 'AI-assisted analysis' },
      ]
    },
    {
      group: 'Reference & Settings',
      tiles: [
        { page: 'standards', icon: '&#128218;', label: 'Standards Reference',  desc: 'IEC / SLS / PUCSL' },
        { page: 'settings',  icon: '&#9881;',   label: 'Settings',             desc: 'Profile & data mgmt' },
      ]
    },
  ];

  const main = document.getElementById('main-content');
  const IMPORT_HISTORY_KEY = 'solarpv_import_history_v1';
  const IMPORT_HISTORY_MAX = 60;

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function localDateISO(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function _cleanHistoryText(value, maxLen) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen || 160);
  }

  function _normalizeAudit(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const profileId = _cleanHistoryText(raw.profileId || raw.profile || '', 64);
    const profileLabel = _cleanHistoryText(raw.profileLabel || raw.profileName || '', 160);
    const rulesetVersion = _cleanHistoryText(raw.rulesetVersion || raw.rulesVersion || '', 64);
    if (!profileId && !profileLabel && !rulesetVersion) return null;
    return { profileId, profileLabel, rulesetVersion };
  }

  function _loadImportHistory() {
    try {
      const raw = localStorage.getItem(IMPORT_HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => (x && typeof x === 'object' ? x : null))
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function _saveImportHistory(items) {
    const safe = Array.isArray(items) ? items.slice(0, IMPORT_HISTORY_MAX) : [];
    localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(safe));
  }

  function addImportHistory(entry) {
    const raw = entry && typeof entry === 'object' ? entry : {};
    const item = {
      ts: _cleanHistoryText(raw.ts || new Date().toISOString(), 64),
      source: _cleanHistoryText(raw.source || 'Import', 120),
      fileName: _cleanHistoryText(raw.fileName || '', 180),
      sourceFormat: _cleanHistoryText(raw.sourceFormat || '', 32),
      format: _cleanHistoryText(raw.format || '', 64),
      schemaVersion: _cleanHistoryText(raw.schemaVersion || '', 64),
      exportedAt: _cleanHistoryText(raw.exportedAt || '', 64),
      ok: raw.ok === true,
      total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : 0,
      added: Number.isFinite(Number(raw.added)) ? Number(raw.added) : 0,
      updated: Number.isFinite(Number(raw.updated)) ? Number(raw.updated) : 0,
      rejected: Number.isFinite(Number(raw.rejected)) ? Number(raw.rejected) : 0,
      records: Number.isFinite(Number(raw.records)) ? Number(raw.records) : 0,
      error: _cleanHistoryText(raw.error || '', 240),
      standardsAudit: _normalizeAudit(raw.standardsAudit),
    };
    const list = _loadImportHistory();
    list.unshift(item);
    _saveImportHistory(list);
    return item;
  }

  function getImportHistory(limit) {
    const list = _loadImportHistory();
    if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return list;
    return list.slice(0, Number(limit));
  }

  function clearImportHistory() {
    localStorage.removeItem(IMPORT_HISTORY_KEY);
  }

  function _historyWhen(isoText) {
    if (!isoText) return '-';
    const ms = Date.parse(String(isoText));
    if (!Number.isFinite(ms)) return String(isoText);
    return new Date(ms).toLocaleString();
  }

  function _historyAuditText(entry) {
    const a = entry && entry.standardsAudit;
    if (!a) return '-';
    const profile = a.profileLabel || a.profileId;
    const rule = a.rulesetVersion;
    if (profile && rule) return `${profile} @ ${rule}`;
    return profile || rule || '-';
  }

  function _historyCountsText(entry) {
    if (Number(entry.records || 0) > 0) return `${entry.records} records`;
    return `${entry.added || 0} added / ${entry.updated || 0} updated / ${entry.rejected || 0} rejected`;
  }

  function _historyDateOnly(isoText) {
    if (!isoText) return '';
    const ms = Date.parse(String(isoText));
    if (!Number.isFinite(ms)) return '';
    return localDateISO(new Date(ms));
  }

  function _historyRowCopyText(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};
    return [
      `When: ${_historyWhen(e.ts)}`,
      `Source: ${e.source || '-'}`,
      `File: ${e.fileName || '-'}`,
      `Source Format: ${e.sourceFormat || '-'}`,
      `Format: ${e.format || '-'}`,
      `Schema: ${e.schemaVersion || '-'}`,
      `Exported At: ${e.exportedAt ? _historyWhen(e.exportedAt) : '-'}`,
      `Status: ${e.ok ? 'OK' : 'FAIL'}`,
      `Counts: ${_historyCountsText(e)}`,
      `Standards: ${_historyAuditText(e)}`,
      `Error: ${e.error || '-'}`,
    ].join('\n');
  }

  function _downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([String(content ?? '')], { type: mimeType || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function _historyFileStamp() {
    const now = new Date();
    const d = localDateISO(now).replace(/-/g, '');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${d}_${hh}${mm}${ss}`;
  }

  function _historyCSV(history) {
    const header = [
      'ts',
      'source',
      'fileName',
      'sourceFormat',
      'format',
      'schemaVersion',
      'exportedAt',
      'ok',
      'total',
      'added',
      'updated',
      'rejected',
      'records',
      'standardsProfileId',
      'standardsProfileLabel',
      'standardsRulesetVersion',
      'error'
    ];
    const rows = (Array.isArray(history) ? history : []).map((h) => {
      const a = h && h.standardsAudit ? h.standardsAudit : {};
      return [
        h && h.ts ? h.ts : '',
        h && h.source ? h.source : '',
        h && h.fileName ? h.fileName : '',
        h && h.sourceFormat ? h.sourceFormat : '',
        h && h.format ? h.format : '',
        h && h.schemaVersion ? h.schemaVersion : '',
        h && h.exportedAt ? h.exportedAt : '',
        h && h.ok ? 'true' : 'false',
        h && Number.isFinite(Number(h.total)) ? Number(h.total) : 0,
        h && Number.isFinite(Number(h.added)) ? Number(h.added) : 0,
        h && Number.isFinite(Number(h.updated)) ? Number(h.updated) : 0,
        h && Number.isFinite(Number(h.rejected)) ? Number(h.rejected) : 0,
        h && Number.isFinite(Number(h.records)) ? Number(h.records) : 0,
        a && a.profileId ? a.profileId : '',
        a && a.profileLabel ? a.profileLabel : '',
        a && a.rulesetVersion ? a.rulesetVersion : '',
        h && h.error ? h.error : ''
      ];
    });
    const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  }

  function _historyJSON(history) {
    return JSON.stringify({
      format: 'solarpv.import.history',
      schemaVersion: '2026.04.09',
      exportedAt: new Date().toISOString(),
      items: Array.isArray(history) ? history : []
    }, null, 2);
  }

  async function copyText(text) {
    const value = String(text ?? '');
    if (!value) {
      toast('Nothing to copy', 'warning');
      return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        toast('Copied to clipboard', 'success');
        return true;
      } catch (_) {}
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        toast('Copied to clipboard', 'success');
        return true;
      }
    } catch (_) {}

    try {
      window.prompt('Clipboard blocked. Copy manually:', value);
      toast('Clipboard unavailable. Copy manually.', 'warning');
    } catch (_) {
      toast('Clipboard unavailable', 'error');
    }
    return false;
  }

  function printHTML(title, html, opts) {
    const safeTitle = escapeHTML(title || 'Report');
    const meta = opts && opts.meta ? `<div class="print-meta">${escapeHTML(opts.meta)}</div>` : '';
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      toast('Pop-up blocked. Allow pop-ups to print.', 'warning');
      return false;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const generated = `${localDateISO(now)} ${hh}:${mm}`;
    const body = String(html || '');

    win.document.open();
    win.document.write(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="css/style.css?v=2" />
  <style>
    body { background: #fff; }
    #print-root { max-width: 980px; margin: 0 auto; padding: 16px; }
    .print-header { margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    .print-title { font-size: 1.15rem; font-weight: 700; color: #111827; }
    .print-meta { font-size: 0.78rem; color: #6b7280; margin-top: 2px; }
    .btn, .btn-group, button, [data-no-print] { display: none !important; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-root { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div id="print-root">
    <div class="print-header">
      <div class="print-title">${safeTitle}</div>
      <div class="print-meta">Generated: ${escapeHTML(generated)}</div>
      ${meta}
    </div>
    ${body}
  </div>
</body>
</html>`);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 150);

    return true;
  }

  function printSection(selectorOrElement, title, root) {
    const source = typeof selectorOrElement === 'string'
      ? (root ? root.querySelector(selectorOrElement) : document.querySelector(selectorOrElement))
      : selectorOrElement;
    if (!source || source.classList.contains('hidden')) {
      toast('No results to print', 'warning');
      return false;
    }
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.btn, .btn-group, button, [data-no-print]').forEach(el => el.remove());
    return printHTML(title, clone.innerHTML);
  }

  // -----------------------------------------------------------------------
  // NAVIGATION
  // -----------------------------------------------------------------------

  function _allowedPages() {
    const cfg = PROJECT_TYPES[state.projectType] || PROJECT_TYPES.all;
    return new Set((cfg && Array.isArray(cfg.pages) ? cfg.pages : Object.keys(PAGES)).filter(id => !!PAGES[id]));
  }

  function _isPageAllowed(pageId) {
    return _allowedPages().has(pageId);
  }

  function navigate(pageId) {
    const homeBtn = document.getElementById('home-btn');
    const titleEl = document.getElementById('page-title');

    if (pageId === 'home') {
      state.currentPage = 'home';
      titleEl.textContent = 'Solar PV Field Tool';
      homeBtn.classList.add('hidden');
      main.scrollTop = 0;
      _renderHome(main);
      return;
    }

    if (!_isPageAllowed(pageId)) { navigate('home'); return; }
    const page = PAGES[pageId];
    if (!page) return;

    state.currentPage = pageId;
    titleEl.textContent = page.title;
    homeBtn.classList.remove('hidden');
    main.scrollTop = 0;
    page.render(main);
  }

  // -----------------------------------------------------------------------
  // HOME SCREEN
  // -----------------------------------------------------------------------

  function _renderHome(container) {
    const allowed = _allowedPages();
    const projectTypeOptions = Object.entries(PROJECT_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === state.projectType ? 'selected' : ''}>${escapeHTML(v.label)}</option>`
    ).join('');

    const groups = HOME_TILES.map(group => {
      const visibleTiles = group.tiles.filter(t => allowed.has(t.page));
      if (!visibleTiles.length) return '';
      const tileHtml = visibleTiles.map(t => `
        <button class="home-tile" data-page="${t.page}">
          <span class="home-tile-icon">${t.icon}</span>
          <span class="home-tile-label">${escapeHTML(t.label)}</span>
          <span class="home-tile-desc">${escapeHTML(t.desc)}</span>
        </button>`).join('');
      return `
        <div class="home-group">
          <div class="home-group-title">${escapeHTML(group.group)}</div>
          <div class="home-tile-grid">${tileHtml}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="home-screen">
        <div class="home-filter">
          <label class="home-filter-label">Project View</label>
          <select class="form-select" id="home-project-mode">${projectTypeOptions}</select>
        </div>
        ${groups}
        <div class="home-footer">v1.0 &bull; Heshan Engineering Solution</div>
      </div>`;

    container.querySelector('#home-project-mode').addEventListener('change', e => {
      const next = e.target.value;
      if (!PROJECT_TYPES[next]) return;
      state.projectType = next;
      localStorage.setItem('solarpv_project_type', next);
      _renderHome(container);
    });

    container.querySelectorAll('.home-tile').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
  }

  // -----------------------------------------------------------------------
  // TOAST
  // -----------------------------------------------------------------------

  let _toastTimer = null;

  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 2800);
  }

  // -----------------------------------------------------------------------
  // MODAL
  // -----------------------------------------------------------------------

  function showModal(title, bodyHtml, buttons) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';

    (buttons || []).forEach(btn => {
      const el = document.createElement('button');
      el.className = 'btn ' + (btn.cls || 'btn-secondary');
      el.textContent = btn.label;
      el.addEventListener('click', () => {
        if (btn.action === 'close') { closeModal(); return; }
        if (typeof btn.action === 'function') {
          const result = btn.action();
          if (result !== false) closeModal();
        }
      });
      footer.appendChild(el);
    });

    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // -----------------------------------------------------------------------
  // SETTINGS PAGE
  // -----------------------------------------------------------------------

  function _renderSettings(container) {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem('solarpv_settings') || '{}'); } catch {}
    const safeName = escapeHTML(settings.inspectorName || '');
    const safeCompany = escapeHTML(settings.company || 'Heshan Engineering Solution');
    const safePhone = escapeHTML(settings.phone || '');
    const hybridCatalog = (typeof HybridSetup !== 'undefined' && HybridSetup && typeof HybridSetup.getCatalogSummary === 'function')
      ? HybridSetup.getCatalogSummary()
      : null;
    const hybridCatalogSummary = hybridCatalog
      ? (hybridCatalog.loading
        ? 'Loading hybrid catalog...'
        : (hybridCatalog.loaded
          ? `${hybridCatalog.inverterCount} inverters, ${hybridCatalog.batteryCount} batteries`
          : 'Not loaded yet'))
      : 'Hybrid catalog module unavailable';
    const hybridCatalogVersion = hybridCatalog && (hybridCatalog.inverterVersion || hybridCatalog.batteryVersion)
      ? `Inverter v${hybridCatalog.inverterVersion || '-'} / Battery v${hybridCatalog.batteryVersion || '-'}`
      : '';
    const importHistory = getImportHistory(8);
    const importRows = importHistory.length
      ? importHistory.map((h) => `
            <tr>
              <td>${escapeHTML(_historyWhen(h.ts))}</td>
              <td>${escapeHTML(h.source || '-')}</td>
              <td>${escapeHTML(h.fileName || '-')}</td>
              <td>${escapeHTML(h.ok ? 'OK' : 'FAIL')}</td>
              <td>${escapeHTML(_historyCountsText(h))}</td>
              <td>${escapeHTML(_historyAuditText(h))}</td>
            </tr>
          `).join('')
      : '<tr><td colspan="6" class="text-muted">No imports recorded yet.</td></tr>';

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9881; Settings</div>

        <div class="card">
          <div class="card-title">Inspector Details</div>
          <div class="form-group">
            <label class="form-label">Inspector Name</label>
            <input class="form-input" id="set-name" value="${safeName}" placeholder="Your full name" />
          </div>
          <div class="form-group">
            <label class="form-label">Company</label>
            <input class="form-input" id="set-company" value="${safeCompany}" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="set-phone" type="tel" value="${safePhone}" />
          </div>
          <button class="btn btn-primary btn-sm" id="set-save-btn">Save Settings</button>
        </div>

        <div class="card">
          <div class="card-title">Data Management</div>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" id="set-clear-sessions">Clear All Inspections</button>
            <button class="btn btn-danger btn-sm" id="set-reset-db">Reset Panel DB to Defaults</button>
            <button class="btn btn-danger btn-sm" id="set-reset-catalogs">Reset Catalog to Bundled Defaults</button>
          </div>
          <div class="text-muted mt-4">Resets PV modules, inverters, and batteries to bundled app datasets.</div>
        </div>

        <div class="card">
          <div class="card-title">Utility Approval Data</div>
          <div class="text-sm">
            <div><strong>Hybrid Catalog:</strong> ${escapeHTML(hybridCatalogSummary)}</div>
            ${hybridCatalogVersion ? `<div class="text-muted mt-4">${escapeHTML(hybridCatalogVersion)}</div>` : ''}
            <div class="text-muted mt-4">Export-mode hybrid checks use strict CEB/LECO listed tags from catalog + local overrides.</div>
            <div class="text-muted mt-4">Import CSV columns: <code>id,ceb_2025,leco_2025,ceb_source,leco_source</code></div>
            <div class="text-muted mt-4">Reference portals: <a href="https://www.ceb.lk/standard-spec/en" target="_blank" rel="noopener noreferrer">CEB standards/spec</a> | <a href="https://www.leco.lk/index_e.php" target="_blank" rel="noopener noreferrer">LECO</a></div>
            <div class="text-muted mt-4">Profile docs: <a href="https://www.ceb.lk/front_img/img_reports/1742277909Solar_Inverter_settings.pdf" target="_blank" rel="noopener noreferrer">CEB inverter settings (2025-02-25)</a> | <a href="https://www.ceb.lk/front_img/img_reports/1723552921Grid_Connection_Code_for_publishing_in_CEB_web.pdf" target="_blank" rel="noopener noreferrer">Grid Connection Code (2024)</a> | <a href="https://www.pucsl.gov.lk/wp-content/uploads/2024/09/Guidelines-on-Rooftop-Solar-PV-installation-for-Service-Providers.pdf" target="_blank" rel="noopener noreferrer">PUCSL rooftop guideline (2024)</a> | <a href="https://www.pucsl.gov.lk/wp-content/uploads/2020/11/Supply-Services-Code-LECO-E.pdf" target="_blank" rel="noopener noreferrer">LECO Supply Services Code</a></div>
          </div>
          <div class="btn-group mt-8">
            <button class="btn btn-secondary btn-sm" id="set-open-utility-manager">Open Utility List Manager</button>
            <button class="btn btn-secondary btn-sm" id="set-export-utility-template">Download CSV Template</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Import Details</div>
          <div class="text-muted mt-4">Recent import history with schema and standards audit traceability.</div>
          <div style="overflow-x:auto;margin-top:8px">
            <table class="status-table">
              <thead><tr><th>When</th><th>Source</th><th>File</th><th>Status</th><th>Counts</th><th>Standards</th></tr></thead>
              <tbody>${importRows}</tbody>
            </table>
          </div>
          <div class="btn-group mt-8">
            <button class="btn btn-secondary btn-sm" id="set-import-history-view">View Full History</button>
            <button class="btn btn-secondary btn-sm" id="set-import-history-export-csv">Export CSV</button>
            <button class="btn btn-secondary btn-sm" id="set-import-history-export-json">Export JSON</button>
            <button class="btn btn-danger btn-sm" id="set-import-history-clear">Clear History</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">About</div>
          <div class="text-sm">
            <div><strong>SolarPV Field Tool</strong> v1.0</div>
            <div class="text-muted mt-4">Solar string sizing, temperature correction, field test analysis, and inspection logging.</div>
            <div class="text-muted mt-4">Built for: Heshan Engineering Solution</div>
            <div class="divider"></div>
            <div>Modules: ${DB.getAll().length} panels in database</div>
            <div class="mt-4">Serve with: <code style="background:var(--bg-3);padding:2px 6px;border-radius:4px">py -m http.server 8090</code></div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#set-save-btn').addEventListener('click', () => {
      const s = {
        inspectorName: container.querySelector('#set-name').value.trim(),
        company: container.querySelector('#set-company').value.trim(),
        phone: container.querySelector('#set-phone').value.trim(),
      };
      localStorage.setItem('solarpv_settings', JSON.stringify(s));
      FirebaseSync.saveSettings(s);
      toast('Settings saved', 'success');
    });

    container.querySelector('#set-clear-sessions').addEventListener('click', () => {
      if (!confirm('Delete ALL saved inspections? Cannot be undone.')) return;
      localStorage.removeItem('solarpv_sessions');
      state.lastSessionId = null;
      toast('All inspections cleared');
    });

    container.querySelector('#set-reset-db').addEventListener('click', async () => {
      if (!confirm('Reset panel database to bundled defaults? All custom PV modules will be lost.')) return;
      const report = (typeof DB.resetToBundledDefaults === 'function')
        ? await DB.resetToBundledDefaults()
        : null;
      if (report && report.ok) toast(`Panel database reset (${report.count} modules)`, 'success');
      else toast('Panel database reset completed', 'success');
      _renderSettings(container);
    });

    const resetCatalogsBtn = container.querySelector('#set-reset-catalogs');
    if (resetCatalogsBtn) {
      resetCatalogsBtn.addEventListener('click', async () => {
        if (!confirm('Reset ALL catalogs to bundled defaults? This will overwrite custom PV modules, inverters, and batteries.')) return;
        const prev = resetCatalogsBtn.textContent;
        resetCatalogsBtn.disabled = true;
        resetCatalogsBtn.textContent = 'Resetting...';
        try {
          const pvReport = (typeof DB.resetToBundledDefaults === 'function')
            ? await DB.resetToBundledDefaults()
            : { ok: false, error: 'PV module reset unavailable' };
          let catReport = { ok: false, error: 'Catalog store unavailable', inverterCount: 0, batteryCount: 0 };
          if (typeof CatalogStore !== 'undefined' && CatalogStore && typeof CatalogStore.resetToBundledDefaults === 'function') {
            catReport = await CatalogStore.resetToBundledDefaults();
          }
          if (pvReport.ok && catReport.ok) {
            toast(`Catalog reset complete: ${pvReport.count} PV, ${catReport.inverterCount} inverters, ${catReport.batteryCount} batteries`, 'success');
          } else {
            const err = [pvReport && pvReport.ok ? '' : (pvReport && pvReport.error ? pvReport.error : 'PV reset failed'),
              catReport && catReport.ok ? '' : (catReport && catReport.error ? catReport.error : 'Catalog reset failed')]
              .filter(Boolean).join(' | ');
            toast(`Reset completed with warnings: ${err}`, 'warning');
          }
          _renderSettings(container);
        } catch (err) {
          toast(err && err.message ? err.message : 'Failed to reset catalog defaults', 'error');
        } finally {
          resetCatalogsBtn.disabled = false;
          resetCatalogsBtn.textContent = prev;
        }
      });
    }

    const openUtilityBtn = container.querySelector('#set-open-utility-manager');
    if (openUtilityBtn) {
      openUtilityBtn.addEventListener('click', () => {
        navigate('hybrid');
        setTimeout(() => {
          if (typeof HybridSetup !== 'undefined' && HybridSetup && typeof HybridSetup.openUtilityManager === 'function') {
            HybridSetup.openUtilityManager(document.getElementById('main-content'));
          } else {
            toast('Utility manager unavailable', 'warning');
          }
        }, 60);
      });
    }

    const exportTemplateBtn = container.querySelector('#set-export-utility-template');
    if (exportTemplateBtn) {
      exportTemplateBtn.addEventListener('click', () => {
        const csv = 'id,ceb_2025,leco_2025,ceb_source,leco_source\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'utility_list_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast('Utility CSV template downloaded', 'success');
      });
    }

    const viewImportHistoryBtn = container.querySelector('#set-import-history-view');
    if (viewImportHistoryBtn) {
      viewImportHistoryBtn.addEventListener('click', () => {
        const allHistory = getImportHistory();
        const sourceOptions = Array.from(new Set(allHistory.map((h) => String(h.source || '').trim()).filter(Boolean))).sort();
        const bodyHtml = `
          <div class="text-muted mb-8">Stored locally on this device. Newest first.</div>
          <div class="form-row cols-3" style="margin-bottom:8px">
            <div class="form-group">
              <label class="form-label">Search</label>
              <input class="form-input" id="set-ih-search" placeholder="Source, file, format, standards, error..." />
            </div>
            <div class="form-group">
              <label class="form-label">Source</label>
              <select class="form-select" id="set-ih-source">
                <option value="">All sources</option>
                ${sourceOptions.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="set-ih-status">
                <option value="">All</option>
                <option value="ok">OK</option>
                <option value="fail">FAIL</option>
              </select>
            </div>
          </div>
          <div class="form-row cols-3" style="margin-bottom:8px">
            <div class="form-group">
              <label class="form-label">From Date</label>
              <input class="form-input" id="set-ih-from" type="date" />
            </div>
            <div class="form-group">
              <label class="form-label">To Date</label>
              <input class="form-input" id="set-ih-to" type="date" />
            </div>
            <div class="form-group">
              <label class="form-label">Actions</label>
              <div class="btn-group">
                <button class="btn btn-secondary btn-sm" id="set-ih-clear-filters">Clear Filters</button>
              </div>
            </div>
          </div>
          <div class="text-muted mb-8" id="set-ih-count">-</div>
          <div style="overflow-x:auto;max-height:62vh">
            <table class="status-table">
              <thead>
                <tr>
                  <th>When</th><th>Source</th><th>File</th><th>Source Format</th><th>Format</th><th>Schema</th><th>Exported At</th><th>Status</th><th>Counts</th><th>Standards</th><th>Error</th><th>Copy</th>
                </tr>
              </thead>
              <tbody id="set-ih-tbody">${allHistory.length ? '' : '<tr><td colspan="12" class="text-muted">No imports recorded.</td></tr>'}</tbody>
            </table>
          </div>
        `;
        showModal('Import Details History', bodyHtml, [{ label: 'Close', cls: 'btn-secondary', action: 'close' }]);

        const modalBody = document.getElementById('modal-body');
        if (!modalBody) return;
        const searchInput = modalBody.querySelector('#set-ih-search');
        const sourceInput = modalBody.querySelector('#set-ih-source');
        const statusInput = modalBody.querySelector('#set-ih-status');
        const fromInput = modalBody.querySelector('#set-ih-from');
        const toInput = modalBody.querySelector('#set-ih-to');
        const clearBtn = modalBody.querySelector('#set-ih-clear-filters');
        const countEl = modalBody.querySelector('#set-ih-count');
        const tbody = modalBody.querySelector('#set-ih-tbody');
        if (!searchInput || !sourceInput || !statusInput || !fromInput || !toInput || !clearBtn || !countEl || !tbody) return;

        let filteredRows = allHistory.slice();

        const renderRows = () => {
          if (!filteredRows.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-muted">No matching records.</td></tr>';
          } else {
            tbody.innerHTML = filteredRows.map((h, idx) => `
              <tr>
                <td>${escapeHTML(_historyWhen(h.ts))}</td>
                <td>${escapeHTML(h.source || '-')}</td>
                <td>${escapeHTML(h.fileName || '-')}</td>
                <td>${escapeHTML(h.sourceFormat || '-')}</td>
                <td>${escapeHTML(h.format || '-')}</td>
                <td>${escapeHTML(h.schemaVersion || '-')}</td>
                <td>${escapeHTML(h.exportedAt ? _historyWhen(h.exportedAt) : '-')}</td>
                <td>${escapeHTML(h.ok ? 'OK' : 'FAIL')}</td>
                <td>${escapeHTML(_historyCountsText(h))}</td>
                <td>${escapeHTML(_historyAuditText(h))}</td>
                <td>${escapeHTML(h.error || '-')}</td>
                <td><button class="btn btn-secondary btn-sm" data-ih-copy="${idx}">Copy</button></td>
              </tr>
            `).join('');
          }
          countEl.textContent = `${filteredRows.length} of ${allHistory.length} record(s)`;
        };

        const applyFilters = () => {
          const q = String(searchInput.value || '').trim().toLowerCase();
          const source = String(sourceInput.value || '').trim();
          const status = String(statusInput.value || '').trim();
          const from = String(fromInput.value || '').trim();
          const to = String(toInput.value || '').trim();

          filteredRows = allHistory.filter((h) => {
            if (source && String(h.source || '') !== source) return false;
            if (status === 'ok' && !h.ok) return false;
            if (status === 'fail' && h.ok) return false;

            const d = _historyDateOnly(h.ts);
            if (from && d && d < from) return false;
            if (to && d && d > to) return false;
            if ((from || to) && !d) return false;

            if (!q) return true;
            const hay = [
              h.source, h.fileName, h.sourceFormat, h.format, h.schemaVersion,
              h.exportedAt, h.error, _historyAuditText(h), _historyCountsText(h)
            ].map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.includes(q);
          });

          renderRows();
        };

        tbody.addEventListener('click', (evt) => {
          const btn = evt.target && evt.target.closest ? evt.target.closest('[data-ih-copy]') : null;
          if (!btn) return;
          const idx = Number(btn.getAttribute('data-ih-copy'));
          if (!Number.isFinite(idx) || idx < 0 || idx >= filteredRows.length) return;
          copyText(_historyRowCopyText(filteredRows[idx]));
        });

        [searchInput, sourceInput, statusInput, fromInput, toInput].forEach((el) => {
          const evt = el.tagName === 'INPUT' ? 'input' : 'change';
          el.addEventListener(evt, applyFilters);
        });
        clearBtn.addEventListener('click', () => {
          searchInput.value = '';
          sourceInput.value = '';
          statusInput.value = '';
          fromInput.value = '';
          toInput.value = '';
          applyFilters();
        });

        renderRows();
      });
    }

    const exportImportHistoryCsvBtn = container.querySelector('#set-import-history-export-csv');
    if (exportImportHistoryCsvBtn) {
      exportImportHistoryCsvBtn.addEventListener('click', () => {
        const history = getImportHistory();
        if (!history.length) {
          toast('No import history to export', 'warning');
          return;
        }
        const file = `solarpv_import_history_${_historyFileStamp()}.csv`;
        _downloadTextFile(file, _historyCSV(history), 'text/csv;charset=utf-8');
        toast(`Import history exported: ${file}`, 'success');
      });
    }

    const exportImportHistoryJsonBtn = container.querySelector('#set-import-history-export-json');
    if (exportImportHistoryJsonBtn) {
      exportImportHistoryJsonBtn.addEventListener('click', () => {
        const history = getImportHistory();
        if (!history.length) {
          toast('No import history to export', 'warning');
          return;
        }
        const file = `solarpv_import_history_${_historyFileStamp()}.json`;
        _downloadTextFile(file, _historyJSON(history), 'application/json');
        toast(`Import history exported: ${file}`, 'success');
      });
    }

    const clearImportHistoryBtn = container.querySelector('#set-import-history-clear');
    if (clearImportHistoryBtn) {
      clearImportHistoryBtn.addEventListener('click', () => {
        if (!confirm('Clear import history records from this device?')) return;
        clearImportHistory();
        toast('Import history cleared', 'success');
        _renderSettings(container);
      });
    }
  }

  // -----------------------------------------------------------------------
  // SERVICE WORKER
  // -----------------------------------------------------------------------

  function _initSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // MODAL OVERLAY CLOSE ON BACKGROUND CLICK
  // -----------------------------------------------------------------------

  function _initModalClose() {
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
  }

  // -----------------------------------------------------------------------
  // INIT
  // -----------------------------------------------------------------------

  function init() {
    DB.init();
    _initModalClose();
    _initSW();

    // Restore saved project type
    const savedType = localStorage.getItem('solarpv_project_type');
    if (savedType && PROJECT_TYPES[savedType]) state.projectType = savedType;

    // Home button → go back to home screen
    document.getElementById('home-btn').addEventListener('click', () => navigate('home'));

    // Firebase sync
    FirebaseSync.renderSignInButton(document.getElementById('header-right'));
    FirebaseSync.init(user => {
      if (user) FirebaseSync.syncAll();
    });

    navigate('home');
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    state,
    navigate,
    toast,
    showModal,
    closeModal,
    escapeHTML,
    localDateISO,
    copyText,
    printHTML,
    printSection,
    addImportHistory,
    getImportHistory,
    clearImportHistory,
  };
})();
