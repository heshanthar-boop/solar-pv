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
    utilityvalidator: { title: 'Utility Validator', render: (c) => UtilityValidator.render(c) },
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
    checklist:   { title: 'Commissioning Checklist',   render: (c) => Checklist.render(c) },
    reportbuilder: { title: 'Report Builder',          render: (c) => ReportBuilder.render(c) },
    cableschedule: { title: 'Cable Schedule',          render: (c) => CableSchedule.render(c) },
    settings:    { title: 'Settings',                   render: (c) => _renderSettings(c) },
  };

  const PROJECT_TYPES = {
    all: {
      label: 'All Modules',
      pages: Object.keys(PAGES),
    },
    gridTie: {
      label: 'Grid-Tie System',
      pages: ['database', 'sizing', 'wirecalc', 'cableschedule', 'utilityvalidator', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'checklist', 'inverter', 'shading', 'yield', 'inspector', 'standards', 'reportbuilder', 'settings'],
    },
    gridTieHybrid: {
      label: 'Grid-Tie Hybrid System',
      pages: ['database', 'sizing', 'wirecalc', 'cableschedule', 'hybrid', 'utilityvalidator', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'checklist', 'inverter', 'shading', 'yield', 'inspector', 'degradation', 'fieldanalysis', 'diagnostics', 'faultai', 'standards', 'reportbuilder', 'settings'],
    },
    fullyHybrid: {
      label: 'Fully Hybrid System',
      pages: ['database', 'wirecalc', 'cableschedule', 'hybrid', 'utilityvalidator', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'checklist', 'degradation', 'fieldanalysis', 'diagnostics', 'yield', 'standards', 'reportbuilder', 'settings'],
    },
    groundMount: {
      label: 'Ground Mount Solar System',
      pages: ['database', 'sizing', 'wirecalc', 'cableschedule', 'utilityvalidator', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'checklist', 'inverter', 'shading', 'yield', 'inspector', 'fieldanalysis', 'diagnostics', 'standards', 'reportbuilder', 'settings'],
    },
    battery: {
      label: 'Battery Focus',
      pages: ['database', 'wirecalc', 'cableschedule', 'hybrid', 'utilityvalidator', 'fieldtest', 'fault', 'pr', 'checklist', 'standards', 'reportbuilder', 'settings'],
    },
    standardsOnly: {
      label: 'Standards',
      pages: ['standards', 'wirecalc', 'cableschedule', 'checklist', 'settings'],
    },
    pvAnalysis: {
      label: 'PV Analysis',
      pages: ['fieldanalysis', 'diagnostics', 'pr', 'degradation', 'yield', 'inverter', 'shading', 'faultai', 'standards', 'wirecalc', 'cableschedule', 'settings'],
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
        { page: 'cableschedule', icon: '&#128200;', label: 'Cable Schedule',     desc: 'Panel schedule & export' },
        { page: 'hybrid',      icon: '&#128267;', label: 'Hybrid Setup',         desc: 'Battery & inverter check' },
        { page: 'utilityvalidator', icon: '&#128221;', label: 'Utility Validator', desc: 'CEB/LECO submission gate' },
        { page: 'yield',       icon: '&#9728;',   label: 'Yield Estimator',      desc: 'Monthly kWh simulation' },
        { page: 'inspector',   icon: '&#128202;', label: 'PV Inspection Analyzer', desc: 'Metrel Excel import & analysis' },
        { page: 'shading',     icon: '&#127774;', label: 'Shading & Loss',       desc: 'AOI & irradiance loss' },
      ]
    },
    {
      group: 'Field Testing',
      tiles: [
        { page: 'checklist',   icon: '&#9989;',   label: 'Commissioning',        desc: 'Pre-energisation checklist' },
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
        { page: 'standards',     icon: '&#128218;', label: 'Standards Reference', desc: 'IEC / SLS / PUCSL' },
        { page: 'reportbuilder', icon: '&#128196;', label: 'Report Builder',       desc: 'Combined PDF report' },
        { page: 'settings',      icon: '&#9881;',   label: 'Settings',             desc: 'Profile & data mgmt' },
      ]
    },
  ];

  const main = document.getElementById('main-content');
  const IMPORT_HISTORY_KEY = 'solarpv_import_history_v1';
  const IMPORT_HISTORY_MODAL_PREFS_KEY = 'solarpv_import_history_modal_prefs_v1';
  const IMPORT_HISTORY_MAX = 60;
  const PROJECT_KEY = 'solarpv_active_project';

  // Active project — shared across all modules via App.getProject()
  const _defaultProject = () => ({
    name: '', client: '', siteAddress: '', systemKwp: '', systemType: 'grid-tie',
    lat: '', lon: '',
    updatedAt: new Date().toISOString()
  });

  let _project = _defaultProject();

  function _loadProject() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
      if (raw && typeof raw === 'object') _project = Object.assign(_defaultProject(), raw);
    } catch (_) {}
  }

  function _saveProject() {
    _project.updatedAt = new Date().toISOString();
    localStorage.setItem(PROJECT_KEY, JSON.stringify(_project));
  }

  function getProject() { return Object.assign({}, _project); }

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

  function _canRetryImportEntry(entry) {
    const source = String(entry && entry.source ? entry.source : '');
    return source === 'PV Module Catalog JSON'
      || source === 'Inverter Catalog JSON'
      || source === 'Battery Catalog JSON'
      || source === 'Utility Override Import';
  }

  function _retryImportEntry(entry) {
    const source = String(entry && entry.source ? entry.source : '');
    if (!_canRetryImportEntry(entry)) {
      toast('Retry is not available for this entry', 'warning');
      return false;
    }

    closeModal();

    const openDbImport = (tabId) => {
      navigate('database');
      const tabBtn = document.getElementById(tabId);
      if (tabBtn) tabBtn.click();
      const importBtn = document.getElementById('db-import-btn');
      if (importBtn) {
        importBtn.click();
        toast('Retry import: select the source file again', 'warning');
        return true;
      }
      toast('Import button not available on Database page', 'warning');
      return false;
    };

    if (source === 'PV Module Catalog JSON') return openDbImport('db-tab-pv');
    if (source === 'Inverter Catalog JSON') return openDbImport('db-tab-inv');
    if (source === 'Battery Catalog JSON') return openDbImport('db-tab-bat');

    if (source === 'Utility Override Import') {
      navigate('hybrid');
      const root = document.getElementById('main-content');
      if (typeof HybridSetup !== 'undefined' && HybridSetup && typeof HybridSetup.openUtilityManager === 'function') {
        HybridSetup.openUtilityManager(root);
        const importBtn = document.getElementById('hy-ulm-import');
        if (importBtn) {
          importBtn.click();
          toast('Retry utility import: select the source file again', 'warning');
          return true;
        }
      }
      toast('Utility import manager is not available', 'warning');
      return false;
    }

    return false;
  }

  function _historyFilteredSummaryText(rows, totalCount, ctx) {
    const list = Array.isArray(rows) ? rows : [];
    const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : list.length;
    const okCount = list.filter(x => x && x.ok).length;
    const failCount = list.length - okCount;
    const bySource = {};
    list.forEach((r) => {
      const k = String(r && r.source ? r.source : 'Unknown');
      bySource[k] = (bySource[k] || 0) + 1;
    });
    const sourceLines = Object.keys(bySource).sort().map((k) => `- ${k}: ${bySource[k]}`);
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    const filterLine = `search="${c.search || ''}", source="${c.source || ''}", status="${c.status || ''}", from="${c.from || ''}", to="${c.to || ''}", sort="${c.sortBy || 'ts'} ${c.sortDir || 'desc'}"`;
    const rowsText = list.map((h, i) => `${i + 1}. [${_historyWhen(h.ts)}] ${h.source || '-'} | ${h.fileName || '-'} | ${h.ok ? 'OK' : 'FAIL'} | ${_historyCountsText(h)} | ${_historyAuditText(h)}`).join('\n');

    return [
      'Import History Filtered Summary',
      `Generated: ${new Date().toLocaleString()}`,
      `Filtered records: ${list.length} of ${total}`,
      `Status: OK ${okCount}, FAIL ${failCount}`,
      `Filters: ${filterLine}`,
      'By source:',
      sourceLines.length ? sourceLines.join('\n') : '- (none)',
      '',
      'Rows:',
      rowsText || '(none)'
    ].join('\n');
  }

  function _historyStats(history) {
    const rows = Array.isArray(history) ? history : [];
    const total = rows.length;
    const failed = rows.filter(r => !(r && r.ok)).length;
    const success = total - failed;
    const nowMs = Date.now();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const start7d = nowMs - ms7d;

    const sourceMap = {};
    let latest = null;

    const recent = rows.filter((r) => {
      const tsMs = Date.parse(String(r && r.ts ? r.ts : ''));
      const src = String(r && r.source ? r.source : 'Unknown');
      sourceMap[src] = (sourceMap[src] || 0) + 1;
      if (Number.isFinite(tsMs)) {
        if (!latest || tsMs > latest.ms) latest = { ms: tsMs, ts: String(r.ts) };
        return tsMs >= start7d;
      }
      return false;
    });

    const recentTotal = recent.length;
    const recentFailed = recent.filter(r => !(r && r.ok)).length;
    const recentSuccess = recentTotal - recentFailed;

    const topSource = Object.keys(sourceMap)
      .map((k) => ({ name: k, count: sourceMap[k] }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.name).localeCompare(String(b.name));
      })[0] || null;

    const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
    return {
      total,
      failed,
      success,
      failRatePct: pct(failed, total),
      recentTotal,
      recentFailed,
      recentSuccess,
      recentFailRatePct: pct(recentFailed, recentTotal),
      topSource,
      lastTs: latest ? latest.ts : ''
    };
  }

  function _defaultHistoryModalPrefs() {
    return {
      search: '',
      source: '',
      status: '',
      from: '',
      to: '',
      sortBy: 'ts',
      sortDir: 'desc'
    };
  }

  function _normalizeHistoryModalPrefs(raw) {
    const d = _defaultHistoryModalPrefs();
    const src = raw && typeof raw === 'object' ? raw : {};
    const sortByRaw = _cleanHistoryText(src.sortBy || '', 24).toLowerCase();
    const sortBy = ['ts', 'source', 'status', 'counts'].includes(sortByRaw) ? sortByRaw : d.sortBy;
    const sortDirRaw = _cleanHistoryText(src.sortDir || '', 8).toLowerCase();
    const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : d.sortDir;
    const fmtDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? String(v).trim() : '');
    const statusRaw = _cleanHistoryText(src.status || '', 12).toLowerCase();
    const status = ['ok', 'fail', ''].includes(statusRaw) ? statusRaw : '';
    return {
      search: _cleanHistoryText(src.search || '', 120),
      source: _cleanHistoryText(src.source || '', 120),
      status,
      from: fmtDate(src.from),
      to: fmtDate(src.to),
      sortBy,
      sortDir
    };
  }

  function _loadHistoryModalPrefs() {
    try {
      const raw = localStorage.getItem(IMPORT_HISTORY_MODAL_PREFS_KEY);
      if (!raw) return _defaultHistoryModalPrefs();
      return _normalizeHistoryModalPrefs(JSON.parse(raw));
    } catch (_) {
      return _defaultHistoryModalPrefs();
    }
  }

  function _saveHistoryModalPrefs(prefs) {
    localStorage.setItem(IMPORT_HISTORY_MODAL_PREFS_KEY, JSON.stringify(_normalizeHistoryModalPrefs(prefs)));
  }

  function _historyCountMetric(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};
    if (Number(e.records || 0) > 0) return Number(e.records || 0);
    return Number(e.added || 0) + Number(e.updated || 0) + Number(e.rejected || 0);
  }

  function _historySortValue(entry, key) {
    const e = entry && typeof entry === 'object' ? entry : {};
    if (key === 'ts') {
      const ms = Date.parse(String(e.ts || ''));
      return Number.isFinite(ms) ? ms : 0;
    }
    if (key === 'source') return String(e.source || '').toLowerCase();
    if (key === 'status') return e.ok ? 1 : 0;
    if (key === 'counts') return _historyCountMetric(e);
    return '';
  }

  function _sortHistoryRows(rows, sortBy, sortDir) {
    const key = ['ts', 'source', 'status', 'counts'].includes(String(sortBy || '').toLowerCase())
      ? String(sortBy || '').toLowerCase()
      : 'ts';
    const dir = String(sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const mul = dir === 'asc' ? 1 : -1;
    return (Array.isArray(rows) ? rows : [])
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const va = _historySortValue(a.item, key);
        const vb = _historySortValue(b.item, key);
        if (typeof va === 'string' || typeof vb === 'string') {
          const cmp = String(va).localeCompare(String(vb));
          if (cmp !== 0) return cmp * mul;
          return a.idx - b.idx;
        }
        if (va < vb) return -1 * mul;
        if (va > vb) return 1 * mul;
        return a.idx - b.idx;
      })
      .map(x => x.item);
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
      _updateBottomNav('home');
      return;
    }

    if (!_isPageAllowed(pageId)) { navigate('home'); return; }
    const page = PAGES[pageId];
    if (!page) return;

    state.currentPage = pageId;
    titleEl.textContent = page.title;
    homeBtn.classList.remove('hidden');
    _updateBottomNav(pageId);
    main.scrollTop = 0;
    page.render(main);
  }

  // -----------------------------------------------------------------------
  // HOME SCREEN
  // -----------------------------------------------------------------------

  const ONBOARD_DISMISS_KEY = 'solarpv_onboard_dismissed';

  function _onboardSteps() {
    const p = _project;
    const hasProject = !!(p.name || p.client || p.siteAddress);
    const hasPanel = typeof DB !== 'undefined' && DB.getAll().length > 0;
    const hasSizing = !!(state.sizingResult);
    return [
      { title: 'Set your project', desc: 'Name, client, site address, system size', done: hasProject, action: 'project' },
      { title: 'Add a PV module', desc: 'Import or enter module datasheet values', done: hasPanel, action: 'database' },
      { title: 'Run string sizing', desc: 'Verify voltage & current limits for your inverter', done: hasSizing, action: 'sizing' },
    ];
  }

  function _renderHome(container) {
    const allowed = _allowedPages();
    const projectTypeOptions = Object.entries(PROJECT_TYPES).map(([k, v]) =>
      `<option value="${k}" ${k === state.projectType ? 'selected' : ''}>${escapeHTML(v.label)}</option>`
    ).join('');

    const p = _project;
    const hasProject = !!(p.name || p.client || p.siteAddress);

    // System type display label
    const typeLabels = {
      'grid-tie': 'Grid-Tie', 'hybrid': 'Hybrid', 'off-grid': 'Off-Grid', 'ground-mount': 'Ground Mount'
    };
    const typeLabel = typeLabels[p.systemType] || p.systemType || '';

    const projectCardHtml = `
      <div class="project-card card" id="home-project-card">
        <div class="project-card-header">
          <span class="project-card-icon">&#128736;</span>
          <span class="project-card-title">${hasProject ? escapeHTML(p.name || 'Unnamed Project') : 'No Active Project'}</span>
          <button class="btn btn-sm btn-secondary" id="home-project-edit-btn" style="margin-left:auto;flex-shrink:0">${hasProject ? '&#9998; Edit' : '+ Set Project'}</button>
        </div>
        ${hasProject ? `
        <div class="project-card-meta" style="margin-bottom:6px">
          ${p.client ? `<span>&#128100; ${escapeHTML(p.client)}</span>` : ''}
          ${p.siteAddress ? `<span>&#128205; ${escapeHTML(p.siteAddress)}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          ${p.systemKwp ? `<span class="project-card-kwp">&#9889; ${escapeHTML(p.systemKwp)} kWp</span>` : ''}
          ${typeLabel ? `<span class="project-card-type">&#128268; ${escapeHTML(typeLabel)}</span>` : ''}
          ${(p.lat && p.lon) ? `<span class="project-card-loc">&#127757; ${parseFloat(p.lat).toFixed(4)}, ${parseFloat(p.lon).toFixed(4)}</span>` : ''}
        </div>` : `<div class="text-muted" style="font-size:0.82rem;padding:4px 0">Set project details to pre-fill forms and reports across all modules.</div>`}
      </div>`;

    const backupDays = _backupAgeDays();
    const backupWarnHtml = (backupDays === null || backupDays > 30)
      ? `<div class="warn-box" style="margin-bottom:14px;cursor:pointer" id="home-backup-warn">
           &#9888; ${backupDays === null ? 'No backup made yet.' : `Last backup ${backupDays} days ago.`}
           <strong>Export a backup in Settings &rarr;</strong>
         </div>`
      : '';

    // Onboarding banner — show if not dismissed and not all steps done
    const dismissed = localStorage.getItem(ONBOARD_DISMISS_KEY) === '1';
    const steps = _onboardSteps();
    const allDone = steps.every(s => s.done);
    const onboardHtml = (!dismissed && !allDone) ? `
      <div class="home-onboard" id="home-onboard">
        <div class="home-onboard-title">&#128640; Get started — 3 quick steps</div>
        <div class="home-onboard-steps">
          ${steps.map((s, i) => `
            <div class="home-onboard-step ${s.done ? 'done' : ''}" data-onboard-action="${s.action}">
              <div class="home-onboard-num">${s.done ? '&#10003;' : (i + 1)}</div>
              <div class="home-onboard-step-text">
                <div class="home-onboard-step-title">${escapeHTML(s.title)}</div>
                <div class="home-onboard-step-desc">${escapeHTML(s.desc)}</div>
              </div>
              ${!s.done ? '<span style="color:var(--text-muted);font-size:1rem">&#8250;</span>' : ''}
            </div>`).join('')}
        </div>
        <div class="home-onboard-dismiss" id="home-onboard-dismiss">Dismiss &times;</div>
      </div>` : '';

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

    const settings = (() => { try { return JSON.parse(localStorage.getItem('solarpv_settings') || '{}'); } catch { return {}; } })();
    const footerCompany = escapeHTML(settings.company || 'Heshan Engineering Solution');

    container.innerHTML = `
      <div class="home-screen">
        ${projectCardHtml}
        ${backupWarnHtml}
        ${onboardHtml}
        <div class="home-filter">
          <label class="home-filter-label">&#128268; Tool Filter</label>
          <select class="form-select" id="home-project-mode">${projectTypeOptions}</select>
        </div>
        ${groups}
        <div class="home-footer">Solar PV Field Tool &bull; ${footerCompany}</div>
      </div>`;

    container.querySelector('#home-project-mode').addEventListener('change', e => {
      const next = e.target.value;
      if (!PROJECT_TYPES[next]) return;
      state.projectType = next;
      localStorage.setItem('solarpv_project_type', next);
      _renderHome(container);
    });

    container.querySelector('#home-project-edit-btn').addEventListener('click', () => {
      _showProjectModal(container);
    });

    const backupWarn = container.querySelector('#home-backup-warn');
    if (backupWarn) backupWarn.addEventListener('click', () => navigate('settings'));

    // Onboarding step clicks
    container.querySelectorAll('[data-onboard-action]').forEach(el => {
      if (el.classList.contains('done')) return;
      el.addEventListener('click', () => {
        const action = el.dataset.onboardAction;
        if (action === 'project') _showProjectModal(container);
        else navigate(action);
      });
    });
    const dismissBtn = container.querySelector('#home-onboard-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        localStorage.setItem(ONBOARD_DISMISS_KEY, '1');
        container.querySelector('#home-onboard').remove();
      });
    }

    container.querySelectorAll('.home-tile').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
  }

  function _showProjectModal(homeContainer) {
    const p = _project;
    const typeOptions = [
      ['grid-tie', 'Grid-Tie'],
      ['hybrid', 'Hybrid'],
      ['off-grid', 'Off-Grid'],
      ['ground-mount', 'Ground Mount'],
    ].map(([v, l]) => `<option value="${v}" ${p.systemType === v ? 'selected' : ''}>${l}</option>`).join('');

    showModal('Active Project', `
      <div class="form-group">
        <label class="form-label">Project Name / Site ID</label>
        <input class="form-input" id="proj-name" value="${escapeHTML(p.name)}" placeholder="e.g. Colombo Rooftop 50kWp" />
      </div>
      <div class="form-group">
        <label class="form-label">Client Name</label>
        <input class="form-input" id="proj-client" value="${escapeHTML(p.client)}" placeholder="Client or company name" />
      </div>
      <div class="form-group">
        <label class="form-label">Site Address</label>
        <input class="form-input" id="proj-address" value="${escapeHTML(p.siteAddress)}" placeholder="Site location" />
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">System Size (kWp)</label>
          <input class="form-input" id="proj-kwp" type="number" min="0.1" step="0.1" value="${escapeHTML(p.systemKwp)}" placeholder="e.g. 10.2" />
        </div>
        <div class="form-group">
          <label class="form-label">System Type</label>
          <select class="form-select" id="proj-type">${typeOptions}</select>
        </div>
      </div>
      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <label class="form-label" style="margin:0">Site Location (GPS)</label>
          <button class="btn btn-secondary btn-sm" id="proj-gps-btn" type="button">&#127757; Detect GPS</button>
        </div>
        <div class="form-row cols-2">
          <input class="form-input" id="proj-lat" type="number" step="0.0001" value="${escapeHTML(p.lat || '')}" placeholder="Latitude (e.g. 7.2906)" />
          <input class="form-input" id="proj-lon" type="number" step="0.0001" value="${escapeHTML(p.lon || '')}" placeholder="Longitude (e.g. 80.6337)" />
        </div>
        <div class="form-hint" id="proj-gps-hint">Used by Sun Angle estimator &amp; Yield calculator. Sri Lanka ≈ 6–9&deg;N, 79–82&deg;E</div>
      </div>`,
      [
        { label: 'Cancel', cls: 'btn-secondary', action: 'close' },
        { label: 'Clear', cls: 'btn-secondary', action: () => {
          _project = _defaultProject();
          _saveProject();
          _renderHome(homeContainer);
          return true;
        }},
        { label: 'Save', cls: 'btn-primary', action: () => {
          _project.name = document.getElementById('proj-name').value.trim();
          _project.client = document.getElementById('proj-client').value.trim();
          _project.siteAddress = document.getElementById('proj-address').value.trim();
          _project.systemKwp = document.getElementById('proj-kwp').value.trim();
          _project.systemType = document.getElementById('proj-type').value;
          const latVal = document.getElementById('proj-lat').value.trim();
          const lonVal = document.getElementById('proj-lon').value.trim();
          _project.lat = latVal;
          _project.lon = lonVal;
          _saveProject();
          _renderHome(homeContainer);
          toast('Project saved', 'success');
          return true;
        }},
      ]
    );

    // Wire up GPS detect button after modal is shown
    const gpsBtn = document.getElementById('proj-gps-btn');
    const gpsHint = document.getElementById('proj-gps-hint');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          gpsHint.textContent = 'GPS not available on this device.';
          return;
        }
        gpsBtn.textContent = '⏳ Detecting…';
        gpsBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            document.getElementById('proj-lat').value = pos.coords.latitude.toFixed(4);
            document.getElementById('proj-lon').value = pos.coords.longitude.toFixed(4);
            gpsHint.textContent = `Detected: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m)`;
            gpsBtn.textContent = '✓ Got GPS';
            gpsBtn.disabled = false;
          },
          (err) => {
            gpsHint.textContent = 'GPS error: ' + (err.message || 'Permission denied. Enter manually.');
            gpsBtn.textContent = '🌍 Detect GPS';
            gpsBtn.disabled = false;
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    }
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
  // THEME (DARK MODE)
  // -----------------------------------------------------------------------

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('solarpv_theme', theme);
    // Update meta theme-color for browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#1a1a1a' : '#d97706';
  }

  function _initTheme() {
    const saved = localStorage.getItem('solarpv_theme') || 'light';
    _applyTheme(saved);
  }

  // -----------------------------------------------------------------------
  // BOTTOM NAV
  // -----------------------------------------------------------------------

  function _initBottomNav() {
    const nav = document.createElement('nav');
    nav.id = 'bottom-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `
      <button class="nav-item" id="nav-home" data-nav="home" aria-label="Home">
        <span class="nav-item-icon">&#8962;</span>
        <span class="nav-item-label">Home</span>
      </button>
      <button class="nav-item" id="nav-back" data-nav="back" aria-label="Back" style="display:none">
        <span class="nav-item-icon">&#8592;</span>
        <span class="nav-item-label">Back</span>
      </button>
      <button class="nav-item" id="nav-database" data-nav="database" aria-label="Database">
        <span class="nav-item-icon">&#128230;</span>
        <span class="nav-item-label">Database</span>
      </button>
      <button class="nav-item" id="nav-settings" data-nav="settings" aria-label="Settings">
        <span class="nav-item-icon">&#9881;</span>
        <span class="nav-item-label">Settings</span>
      </button>
    `;
    document.body.appendChild(nav);

    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-nav]');
      if (!btn) return;
      const target = btn.dataset.nav;
      if (target === 'back') {
        navigate('home');
      } else {
        navigate(target);
      }
    });
  }

  function _updateBottomNav(page) {
    const homeBtn = document.getElementById('nav-home');
    const backBtn = document.getElementById('nav-back');
    const dbBtn = document.getElementById('nav-database');
    const setBtn = document.getElementById('nav-settings');
    if (!homeBtn) return;

    // Show back button on non-home pages, hide home button
    const onHome = (page === 'home');
    homeBtn.style.display = onHome ? '' : 'none';
    backBtn.style.display = onHome ? 'none' : '';

    // Active state
    [homeBtn, dbBtn, setBtn].forEach(b => b && b.classList.remove('active'));
    if (page === 'home') homeBtn.classList.add('active');
    if (page === 'database') dbBtn && dbBtn.classList.add('active');
    if (page === 'settings') setBtn && setBtn.classList.add('active');
  }

  // -----------------------------------------------------------------------
  // DATA BACKUP / RESTORE
  // -----------------------------------------------------------------------

  const BACKUP_KEYS = [
    'solarpv_panels',
    'solarpv_sessions',
    'solarpv_settings',
    'solarpv_project_type',
    'solarpv_active_project',
    'solarpv_theme',
    'solarpv_checklists_v1',
    'solarpv_catalog_inverters_v1',
    'solarpv_catalog_batteries_v1',
    'solarpv_import_history_v1',
  ];
  const BACKUP_TS_KEY = 'solarpv_last_backup_ts';

  function _exportBackup() {
    const data = { version: '1.1', exportedAt: new Date().toISOString(), data: {} };
    BACKUP_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data.data[k] = v;
    });
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `solarpv_backup_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
    toast('Backup exported', 'success');
  }

  function _importBackup(file, container) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
          toast('Invalid backup file', 'error'); return;
        }
        if (!confirm(`Restore backup from ${parsed.exportedAt || 'unknown date'}?\n\nThis will overwrite all local data including inspections, checklists and panel database. Cannot be undone.`)) return;
        Object.entries(parsed.data).forEach(([k, v]) => {
          if (typeof v === 'string') localStorage.setItem(k, v);
        });
        localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
        toast('Backup restored — reloading…', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } catch {
        toast('Failed to read backup file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function _backupAgeDays() {
    const ts = localStorage.getItem(BACKUP_TS_KEY);
    if (!ts) return null;
    return Math.floor((Date.now() - Date.parse(ts)) / (1000 * 60 * 60 * 24));
  }

  function _backupAgeHtml() {
    const days = _backupAgeDays();
    if (days === null) {
      return `<div class="warn-box" style="margin:8px 0 0">&#9888; No backup made yet. Export a backup to protect your data.</div>`;
    }
    if (days > 30) {
      return `<div class="warn-box" style="margin:8px 0 0">&#9888; Last backup was ${days} days ago. Consider exporting a fresh backup.</div>`;
    }
    return `<div class="info-box" style="margin:8px 0 0">&#10003; Last backup: ${days === 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' ago'}</div>`;
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
    const importHistoryAll = getImportHistory();
    const importStats = _historyStats(importHistoryAll);
    const importHistory = importHistoryAll.slice(0, 8);
    const topSourceLabel = importStats.topSource
      ? `${importStats.topSource.name} (${importStats.topSource.count})`
      : '-';
    const lastImportLabel = importStats.lastTs ? _historyWhen(importStats.lastTs) : '-';
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

    const darkActive = document.documentElement.getAttribute('data-theme') === 'dark';
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9881; Settings</div>

        <div class="card">
          <div class="card-title">Display</div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
            <div>
              <div style="font-weight:700;font-size:0.95rem">Dark Mode</div>
              <div class="text-muted" style="font-size:0.8rem">Reduces glare in bright sunlight</div>
            </div>
            <label class="toggle-switch" aria-label="Dark mode">
              <input type="checkbox" id="set-dark-mode" ${darkActive ? 'checked' : ''} />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
        </div>

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
          <div class="card-title">Import Health</div>
          <div class="text-muted mt-4">Quick telemetry from local import history.</div>
          <div class="result-grid mt-8" style="grid-template-columns:repeat(4,minmax(120px,1fr))">
            <div class="result-box">
              <div class="result-value">${importStats.total}</div>
              <div class="result-label">Total Imports</div>
            </div>
            <div class="result-box ${importStats.failed > 0 ? 'alert-warn' : 'alert-safe'}">
              <div class="result-value">${importStats.failed}</div>
              <div class="result-label">Total Failed</div>
            </div>
            <div class="result-box ${importStats.failRatePct > 20 ? 'alert-warn' : 'alert-safe'}">
              <div class="result-value">${importStats.failRatePct.toFixed(1)}%</div>
              <div class="result-label">Overall Fail Rate</div>
            </div>
            <div class="result-box ${importStats.recentFailed > 0 ? 'alert-warn' : 'alert-safe'}">
              <div class="result-value">${importStats.recentTotal}</div>
              <div class="result-label">Imports (Last 7 Days)</div>
            </div>
          </div>
          <table class="status-table mt-8">
            <tbody>
              <tr><td><strong>Last 7 days failures</strong></td><td>${importStats.recentFailed}</td></tr>
              <tr><td><strong>Last 7 days fail rate</strong></td><td>${importStats.recentFailRatePct.toFixed(1)}%</td></tr>
              <tr><td><strong>Top source</strong></td><td>${escapeHTML(topSourceLabel)}</td></tr>
              <tr><td><strong>Last import</strong></td><td>${escapeHTML(lastImportLabel)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-title">Data Backup &amp; Restore</div>
          ${_backupAgeHtml()}
          <div class="text-muted mt-4" style="font-size:0.82rem">Backup saves all inspections, checklists, PV module database, settings and project data to a single JSON file. Restore from a previous backup — this overwrites current local data.</div>
          <div class="btn-group mt-8">
            <button class="btn btn-primary btn-sm" id="set-backup-btn">&#128190; Export Backup</button>
            <button class="btn btn-secondary btn-sm" id="set-restore-btn">&#128228; Restore from Backup</button>
          </div>
          <input type="file" id="set-restore-file" accept=".json" style="display:none" />
        </div>

        <div class="card">
          <div class="card-title">About</div>
          <div class="text-sm">
            <div><strong>SolarPV Field Tool</strong> v1.1</div>
            <div class="text-muted mt-4">Solar string sizing, temperature correction, field test analysis, and inspection logging.</div>
            <div class="text-muted mt-4">Built for: ${escapeHTML(safeCompany || 'Heshan Engineering Solution')}</div>
            <div class="divider"></div>
            <div>Modules: ${DB.getAll().length} panels in database</div>
            <div class="mt-4">Serve with: <code style="background:var(--bg-3);padding:2px 6px;border-radius:4px">py -m http.server 8090</code></div>
          </div>
        </div>
      </div>
    `;

    const darkModeToggle = container.querySelector('#set-dark-mode');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', () => {
        const dark = darkModeToggle.checked;
        _applyTheme(dark ? 'dark' : 'light');
      });
    }

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

    const backupBtn = container.querySelector('#set-backup-btn');
    if (backupBtn) backupBtn.addEventListener('click', () => _exportBackup());

    const restoreBtn = container.querySelector('#set-restore-btn');
    const restoreFile = container.querySelector('#set-restore-file');
    if (restoreBtn && restoreFile) {
      restoreBtn.addEventListener('click', () => restoreFile.click());
      restoreFile.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file) _importBackup(file, container);
        restoreFile.value = '';
      });
    }

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
        let prefs = _loadHistoryModalPrefs();
        let sortBy = prefs.sortBy;
        let sortDir = prefs.sortDir;
        const bodyHtml = `
          <div class="text-muted mb-8">Stored locally on this device. Newest first by default. Use header buttons to sort.</div>
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
                <button class="btn btn-secondary btn-sm" id="set-ih-copy-summary">Copy Filtered Summary</button>
              </div>
            </div>
          </div>
          <div class="text-muted mb-8" id="set-ih-count">-</div>
          <div style="overflow-x:auto;max-height:62vh">
            <table class="status-table">
              <thead>
                <tr>
                  <th><button class="btn btn-secondary btn-sm" data-ih-sort="ts">When</button></th>
                  <th><button class="btn btn-secondary btn-sm" data-ih-sort="source">Source</button></th>
                  <th>File</th>
                  <th>Source Format</th>
                  <th>Format</th>
                  <th>Schema</th>
                  <th>Exported At</th>
                  <th><button class="btn btn-secondary btn-sm" data-ih-sort="status">Status</button></th>
                  <th><button class="btn btn-secondary btn-sm" data-ih-sort="counts">Counts</button></th>
                  <th>Standards</th>
                  <th>Error</th>
                  <th>Actions</th>
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
        const copySummaryBtn = modalBody.querySelector('#set-ih-copy-summary');
        const countEl = modalBody.querySelector('#set-ih-count');
        const tbody = modalBody.querySelector('#set-ih-tbody');
        const sortBtns = Array.from(modalBody.querySelectorAll('[data-ih-sort]'));
        if (!searchInput || !sourceInput || !statusInput || !fromInput || !toInput || !clearBtn || !copySummaryBtn || !countEl || !tbody || !sortBtns.length) return;

        const sourceSet = new Set(sourceOptions);
        searchInput.value = prefs.search || '';
        sourceInput.value = sourceSet.has(prefs.source) ? prefs.source : '';
        statusInput.value = (prefs.status === 'ok' || prefs.status === 'fail') ? prefs.status : '';
        fromInput.value = prefs.from || '';
        toInput.value = prefs.to || '';

        let filteredRows = allHistory.slice();
        const sortLabelMap = { ts: 'When', source: 'Source', status: 'Status', counts: 'Counts' };

        const renderSortButtons = () => {
          sortBtns.forEach((btn) => {
            const key = String(btn.getAttribute('data-ih-sort') || '');
            const base = sortLabelMap[key] || key;
            if (key === sortBy) {
              btn.textContent = `${base}${sortDir === 'asc' ? ' [ASC]' : ' [DESC]'}`;
            } else {
              btn.textContent = base;
            }
          });
        };

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
                <td>
                  <div class="btn-group">
                    <button class="btn btn-secondary btn-sm" data-ih-copy="${idx}">Copy</button>
                    <button class="btn btn-danger btn-sm" data-ih-del="${idx}">Delete</button>
                    ${(!h.ok && _canRetryImportEntry(h)) ? `<button class="btn btn-secondary btn-sm" data-ih-retry="${idx}">Retry</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('');
          }
          countEl.textContent = `${filteredRows.length} of ${allHistory.length} record(s) | Sort: ${(sortLabelMap[sortBy] || sortBy)} ${sortDir.toUpperCase()}`;
          renderSortButtons();
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

          filteredRows = _sortHistoryRows(filteredRows, sortBy, sortDir);
          prefs = {
            search: String(searchInput.value || ''),
            source,
            status,
            from,
            to,
            sortBy,
            sortDir
          };
          _saveHistoryModalPrefs(prefs);
          renderRows();
        };

        tbody.addEventListener('click', (evt) => {
          const copyBtn = evt.target && evt.target.closest ? evt.target.closest('[data-ih-copy]') : null;
          if (copyBtn) {
            const idx = Number(copyBtn.getAttribute('data-ih-copy'));
            if (!Number.isFinite(idx) || idx < 0 || idx >= filteredRows.length) return;
            copyText(_historyRowCopyText(filteredRows[idx]));
            return;
          }

          const delBtn = evt.target && evt.target.closest ? evt.target.closest('[data-ih-del]') : null;
          if (delBtn) {
            const idx = Number(delBtn.getAttribute('data-ih-del'));
            if (!Number.isFinite(idx) || idx < 0 || idx >= filteredRows.length) return;
            if (!confirm('Delete this import history row?')) return;
            const target = filteredRows[idx];
            const pos = allHistory.indexOf(target);
            if (pos >= 0) {
              allHistory.splice(pos, 1);
              _saveImportHistory(allHistory);
              applyFilters();
              toast('Import history row deleted', 'success');
            }
            return;
          }

          const retryBtn = evt.target && evt.target.closest ? evt.target.closest('[data-ih-retry]') : null;
          if (retryBtn) {
            const idx = Number(retryBtn.getAttribute('data-ih-retry'));
            if (!Number.isFinite(idx) || idx < 0 || idx >= filteredRows.length) return;
            _retryImportEntry(filteredRows[idx]);
            return;
          }
        });

        sortBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            const key = String(btn.getAttribute('data-ih-sort') || '').toLowerCase();
            if (!['ts', 'source', 'status', 'counts'].includes(key)) return;
            if (sortBy === key) {
              sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              sortBy = key;
              sortDir = key === 'ts' ? 'desc' : 'asc';
            }
            applyFilters();
          });
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

        copySummaryBtn.addEventListener('click', () => {
          const text = _historyFilteredSummaryText(filteredRows, allHistory.length, {
            search: String(searchInput.value || ''),
            source: String(sourceInput.value || ''),
            status: String(statusInput.value || ''),
            from: String(fromInput.value || ''),
            to: String(toInput.value || ''),
            sortBy,
            sortDir
          });
          copyText(text);
        });

        applyFilters();
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
    _loadProject();
    _initTheme();
    _initBottomNav();
    _initAutoValidation();

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

  // -----------------------------------------------------------------------
  // LIVE VALIDATION UTILITY
  // -----------------------------------------------------------------------
  // Call App.attachLiveValidation(container) after rendering a form to
  // automatically wire up real-time validation on all .form-input[type=number]
  // and .form-input[required] elements. Reads data-min / data-max / required attrs.

  function attachLiveValidation(container) {
    const inputs = (container || document).querySelectorAll('.form-input, .form-select');
    inputs.forEach(el => {
      if (el.dataset.liveValidated) return;
      el.dataset.liveValidated = '1';

      const validate = () => {
        const val = el.value.trim();
        let ok = true;
        let msg = '';

        if (el.required && val === '') {
          ok = false; msg = 'Required';
        } else if (el.type === 'number' && val !== '') {
          const num = parseFloat(val);
          if (isNaN(num)) {
            ok = false; msg = 'Enter a number';
          } else {
            const min = el.dataset.min !== undefined ? parseFloat(el.dataset.min) : null;
            const max = el.dataset.max !== undefined ? parseFloat(el.dataset.max) : null;
            if (min !== null && num < min) { ok = false; msg = `Min: ${min}`; }
            else if (max !== null && num > max) { ok = false; msg = `Max: ${max}`; }
          }
        }

        // Only show state if user has interacted (not on pristine empty optional fields)
        const pristineEmpty = val === '' && !el.required;
        el.classList.toggle('is-valid', !pristineEmpty && ok);
        el.classList.toggle('is-invalid', !pristineEmpty && !ok);

        // Update sibling error message if present
        const errEl = el.parentElement && el.parentElement.querySelector('.form-error-msg');
        if (errEl) errEl.textContent = msg;
      };

      el.addEventListener('input', validate);
      el.addEventListener('blur', validate);
    });
  }

  // Auto-attach on every page render (MutationObserver on main-content)
  function _initAutoValidation() {
    const observer = new MutationObserver(() => {
      attachLiveValidation(main);
    });
    observer.observe(main, { childList: true, subtree: false });
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
    attachLiveValidation,
    getProject,
  };
})();
