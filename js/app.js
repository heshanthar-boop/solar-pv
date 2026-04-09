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
  };
})();
