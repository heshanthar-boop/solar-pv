/**
 * app.js — Router, Navigation, Global State, Utilities
 * Must load last. All other modules are already defined.
 */

const App = (() => {
  // Global state shared across modules
  const state = {
    currentPage: null,
    sizingInputs: null,
    sizingResult: null,   // used by FaultChecker + FieldTest
    fieldTestResults: null,
    lastSessionId: null
  };

  const PAGES = {
    database:   { title: 'Panel Database',      render: (c) => DB.renderPage(c) },
    sizing:     { title: 'String Sizing',       render: (c) => Sizing.render(c) },
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

  const main = document.getElementById('main-content');

  // -----------------------------------------------------------------------
  // NAVIGATION
  // -----------------------------------------------------------------------

  function navigate(pageId) {
    const page = PAGES[pageId];
    if (!page) return;

    state.currentPage = pageId;

    // Update header title
    document.getElementById('page-title').textContent = page.title;

    // Update bottom nav active state
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    // Update sidebar nav active state
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.page === pageId);
    });

    // Render page
    main.scrollTop = 0;
    page.render(main);
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

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9881; Settings</div>

        <div class="card">
          <div class="card-title">Inspector Details</div>
          <div class="form-group">
            <label class="form-label">Inspector Name</label>
            <input class="form-input" id="set-name" value="${settings.inspectorName || ''}" placeholder="Your full name" />
          </div>
          <div class="form-group">
            <label class="form-label">Company</label>
            <input class="form-input" id="set-company" value="${settings.company || 'Heshan Engineering Solution'}" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="set-phone" type="tel" value="${settings.phone || ''}" />
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

  return { state, navigate, toast, showModal, closeModal };
})();
