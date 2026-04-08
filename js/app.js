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
    database:   { title: 'Panel Database',      render: (c) => DB.renderPage(c) },
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
      pages: ['database', 'sizing', 'wirecalc', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'standards', 'settings'],
    },
    gridTieHybrid: {
      label: 'Grid-Tie Hybrid System',
      pages: ['database', 'sizing', 'wirecalc', 'hybrid', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'degradation', 'fieldanalysis', 'diagnostics', 'faultai', 'standards', 'settings'],
    },
    fullyHybrid: {
      label: 'Fully Hybrid System',
      pages: ['database', 'wirecalc', 'hybrid', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'degradation', 'fieldanalysis', 'diagnostics', 'yield', 'standards', 'settings'],
    },
    groundMount: {
      label: 'Ground Mount Solar System',
      pages: ['database', 'sizing', 'wirecalc', 'temp', 'fieldtest', 'fault', 'inspection', 'pr', 'inverter', 'shading', 'yield', 'fieldanalysis', 'diagnostics', 'standards', 'settings'],
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

  function _firstAllowedPage() {
    return [..._allowedPages()][0] || 'database';
  }

  function _isPageAllowed(pageId) {
    return _allowedPages().has(pageId);
  }

  function navigate(pageId) {
    const targetPageId = _isPageAllowed(pageId) ? pageId : _firstAllowedPage();
    const page = PAGES[targetPageId];
    if (!page) return;

    state.currentPage = targetPageId;

    // Update header title
    document.getElementById('page-title').textContent = page.title;

    // Update bottom nav active state
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === targetPageId);
    });

    // Update sidebar nav active state
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.page === targetPageId);
    });

    // Render page
    main.scrollTop = 0;
    page.render(main);
  }

  function _applyProjectTypeFilter(opts) {
    const allowed = _allowedPages();
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('hidden', !allowed.has(link.dataset.page));
    });
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.classList.toggle('hidden', !allowed.has(btn.dataset.page));
    });

    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      const hasVisibleLink = (li) => {
        const link = li && li.querySelector && li.querySelector('.nav-link');
        return !!(link && !link.classList.contains('hidden'));
      };
      nav.querySelectorAll('.nav-divider').forEach(divider => {
        let prev = divider.previousElementSibling;
        while (prev && !hasVisibleLink(prev)) prev = prev.previousElementSibling;
        let next = divider.nextElementSibling;
        while (next && !hasVisibleLink(next)) next = next.nextElementSibling;
        divider.classList.toggle('hidden', !(prev && next));
      });
    }

    const selector = document.getElementById('project-mode');
    if (selector && selector.value !== state.projectType) {
      selector.value = state.projectType;
    }

    if (!(opts && opts.skipNavigate) && !_isPageAllowed(state.currentPage)) {
      navigate(_firstAllowedPage());
    }
  }

  // -----------------------------------------------------------------------
  // SIDEBAR
  // -----------------------------------------------------------------------

  function _initSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const menuBtn  = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('sidebar-close');

    function open() {
      sidebar.classList.remove('hidden');
      sidebar.classList.add('open');
      overlay.classList.remove('hidden');
    }
    function close() {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
      setTimeout(() => { if (!sidebar.classList.contains('open')) sidebar.classList.add('hidden'); }, 260);
    }

    menuBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);

    sidebar.querySelectorAll('.nav-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        close();
        navigate(a.dataset.page);
      });
    });

    const projectSelect = document.getElementById('project-mode');
    if (projectSelect) {
      const saved = localStorage.getItem('solarpv_project_type');
      if (saved && PROJECT_TYPES[saved]) state.projectType = saved;
      projectSelect.value = state.projectType;
      projectSelect.addEventListener('change', () => {
        const next = projectSelect.value;
        if (!PROJECT_TYPES[next]) return;
        state.projectType = next;
        localStorage.setItem('solarpv_project_type', next);
        _applyProjectTypeFilter();
      });
    }
  }

  // -----------------------------------------------------------------------
  // BOTTOM NAV
  // -----------------------------------------------------------------------

  function _initBottomNav() {
    document.querySelectorAll('.bnav-btn').forEach(btn => {
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

    container.querySelector('#set-reset-db').addEventListener('click', () => {
      if (!confirm('Reset panel database to factory defaults? All custom panels will be lost.')) return;
      localStorage.removeItem('solarpv_panels');
      DB.init();
      toast('Panel database reset to defaults', 'success');
    });
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
    _initSidebar();
    _initBottomNav();
    _initModalClose();
    _initSW();
    _applyProjectTypeFilter({ skipNavigate: true });

    // Firebase sync — render sign-in button in header, then init
    FirebaseSync.renderSignInButton(document.getElementById('header-right'));
    FirebaseSync.init(user => {
      if (user) {
        // Auto-sync on sign-in
        FirebaseSync.syncAll();
      }
    });

    navigate('database');
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
