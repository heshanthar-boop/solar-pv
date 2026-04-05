/**
 * inspection.js — Field Inspection Log
 * IEC 62446-1 / PUCSL compliant inspection form.
 * Per-string: Voc, Isc, insulation resistance, visual checklist.
 * System-level: SPD, earthing, cable, PR, commissioning checks.
 */

const Inspection = (() => {
  const STORAGE_KEY = 'solarpv_sessions';
  let _session = null;
  let _saveTimer = null;

  // -----------------------------------------------------------------------
  // SESSION MANAGEMENT
  // -----------------------------------------------------------------------

  function _newSession() {
    return {
      id: 'session_' + Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      site: {
        projectName: '', siteLocation: '', gpsCoords: '',
        date: new Date().toISOString().slice(0, 10),
        inspector: _getInspectorName(),
        weather: '', irradiance: '', ambientTemp: '',
        inverterModel: '', systemCapacity: '',
        inspectionType: 'commissioning',   // commissioning | periodic | fault
        notes: ''
      },
      // IEC 62446-1 system-level checks
      systemChecks: {
        spd_dc: '', spd_ac: '', earthing_cont: '', earthing_resistance: '',
        cable_condition: '', cable_uv: '', cable_routing: '',
        array_mounting: '', module_labelling: '', string_labelling: '',
        inverter_display: '', grid_connection: '', ir_array: '',
        pr_measured: '', pr_expected: '',
        commissioning_ok: false, pucsl_compliant: false
      },
      strings: []
    };
  }

  function _getInspectorName() {
    try { return JSON.parse(localStorage.getItem('solarpv_settings') || '{}').inspectorName || ''; }
    catch { return ''; }
  }

  function _loadSessions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function _saveSession() {
    if (!_session) return;
    _session.updatedAt = new Date().toISOString();
    const sessions = _loadSessions();
    const idx = sessions.findIndex(s => s.id === _session.id);
    if (idx >= 0) sessions[idx] = _session;
    else sessions.unshift(_session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    // Cloud sync — silently push to Firestore if signed in
    if (typeof FirebaseSync !== 'undefined') FirebaseSync.onSessionSaved(_session);
  }

  function _debounceSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_saveSession, 1500);
  }

  function _addStringEntry() {
    _session.strings.push({
      label: 'String ' + (_session.strings.length + 1),
      Voc: '', Isc: '', IR: '',   // IR = insulation resistance MΩ
      visual: {
        hotspot: false, crack: false, soiling: false,
        delamination: false, yellowing: false, jbox: false,
        connector: false, earthing: false, frame: false
      },
      notes: ''
    });
  }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128203; Inspection Log</div>
        <div class="btn-group" style="margin-bottom:14px">
          <button class="btn btn-primary btn-sm" id="insp-new-btn">+ New Inspection</button>
          <button class="btn btn-secondary btn-sm" id="insp-load-btn">&#128196; Load Saved</button>
        </div>
        <div id="insp-body">
          <div class="empty-state">
            <div class="empty-icon">&#128203;</div>
            <div>Start a new inspection or load a saved one.</div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#insp-new-btn').addEventListener('click', () => {
      _session = _newSession();
      _addStringEntry(); _addStringEntry();
      _renderForm(container);
    });
    container.querySelector('#insp-load-btn').addEventListener('click', () => _showSavedList(container));

    if (App.state.lastSessionId) {
      const last = _loadSessions().find(s => s.id === App.state.lastSessionId);
      if (last) { _session = last; _renderForm(container); }
    }
  }

  function _renderForm(container) {
    // Ensure systemChecks exists for sessions created before this update
    if (!_session.systemChecks) _session.systemChecks = _newSession().systemChecks;

    const sc = _session.systemChecks;
    const si = _session.site;

    const body = container.querySelector('#insp-body');
    body.innerHTML = `

      <!-- SITE INFO -->
      <div class="card">
        <div class="card-title">&#127968; Site Information</div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Project Name</label>
            <input class="form-input" id="si-proj" value="${si.projectName}" placeholder="e.g. Colombo Solar 1MW" />
          </div>
          <div class="form-group">
            <label class="form-label">Site Location</label>
            <input class="form-input" id="si-loc" value="${si.siteLocation}" placeholder="City / Address" />
          </div>
          <div class="form-group">
            <label class="form-label">GPS Coordinates</label>
            <input class="form-input" id="si-gps" value="${si.gpsCoords}" placeholder="e.g. 6.9271° N, 79.8612° E" />
          </div>
          <div class="form-group">
            <label class="form-label">System Capacity (kWp)</label>
            <input class="form-input" id="si-cap" type="number" step="0.1" value="${si.systemCapacity}" placeholder="e.g. 100" />
          </div>
          <div class="form-group">
            <label class="form-label">Inspection Type</label>
            <select class="form-select" id="si-type">
              <option value="commissioning" ${si.inspectionType==='commissioning'?'selected':''}>Commissioning (IEC 62446-1)</option>
              <option value="periodic" ${si.inspectionType==='periodic'?'selected':''}>Periodic / Annual</option>
              <option value="fault" ${si.inspectionType==='fault'?'selected':''}>Fault Investigation</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Inspection Date</label>
            <input class="form-input" id="si-date" type="date" value="${si.date}" />
          </div>
          <div class="form-group">
            <label class="form-label">Inspector Name</label>
            <input class="form-input" id="si-inspector" value="${si.inspector}" placeholder="Full Name" />
          </div>
          <div class="form-group">
            <label class="form-label">Inverter Model</label>
            <input class="form-input" id="si-inv" value="${si.inverterModel}" placeholder="e.g. Huawei SUN2000-50KTL" />
          </div>
          <div class="form-group">
            <label class="form-label">Weather</label>
            <select class="form-select" id="si-weather">
              ${['','Clear','Partly Cloudy','Overcast','Hazy'].map(w =>
                `<option value="${w}" ${si.weather===w?'selected':''}>${w||'-- Select --'}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Irradiance (W/m²)</label>
            <input class="form-input" id="si-irr" type="number" value="${si.irradiance}" placeholder="e.g. 850" />
          </div>
          <div class="form-group">
            <label class="form-label">Ambient Temp (°C)</label>
            <input class="form-input" id="si-temp" type="number" step="0.1" value="${si.ambientTemp}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">General Observations</label>
          <textarea class="form-textarea" id="si-notes" placeholder="Overall site condition, access issues, safety observations...">${si.notes}</textarea>
        </div>
      </div>

      <!-- SYSTEM-LEVEL CHECKS (IEC 62446-1 / PUCSL) -->
      <div class="card">
        <div class="card-title">&#9989; System Checks — IEC 62446-1 / PUCSL</div>
        <div class="info-box">Per IEC 62446-1:2016 commissioning requirements &amp; PUCSL Rooftop Solar Guidelines. Pass = compliant, Fail = action required.</div>

        <div class="section-title">Protection &amp; Safety (SLS 1522 / IEC 61643-32)</div>
        <div class="form-row cols-2">
          ${_scSelect('sc-spd-dc',  'SPD — DC Side', sc.spd_dc,  ['','Pass','Fail','N/A'])}
          ${_scSelect('sc-spd-ac',  'SPD — AC Side', sc.spd_ac,  ['','Pass','Fail','N/A'])}
        </div>

        <div class="section-title">Earthing &amp; Bonding (IEC 60364-7-712 / IEC 61730)</div>
        <div class="form-row cols-2">
          ${_scSelect('sc-earth-cont', 'Earthing Continuity', sc.earthing_cont, ['','Pass','Fail','N/A'])}
          <div class="form-group">
            <label class="form-label">Earth Resistance (Ω)</label>
            <input class="form-input" id="sc-earth-res" type="number" step="0.1" value="${sc.earthing_resistance}" placeholder="&lt; 1Ω required" />
            <div class="form-hint">IEC 60364: &lt;1Ω. Record measured value.</div>
          </div>
        </div>

        <div class="section-title">Wiring &amp; Cabling</div>
        <div class="form-row cols-2">
          ${_scSelect('sc-cable-cond',    'Cable Condition',          sc.cable_condition, ['','Pass','Fail','N/A'])}
          ${_scSelect('sc-cable-uv',      'UV-Resistant Cables',      sc.cable_uv,        ['','Pass','Fail','N/A'])}
          ${_scSelect('sc-cable-routing', 'Cable Routing / Support',  sc.cable_routing,   ['','Pass','Fail','N/A'])}
        </div>

        <div class="section-title">Array &amp; Module Compliance (IEC 61215 / IEC 61730)</div>
        <div class="form-row cols-2">
          ${_scSelect('sc-mounting',   'Module Mounting / Structure', sc.array_mounting,  ['','Pass','Fail','N/A'])}
          ${_scSelect('sc-mod-label',  'Module Labelling',            sc.module_labelling,['','Pass','Fail','N/A'])}
          ${_scSelect('sc-str-label',  'String / Combiner Labelling', sc.string_labelling,['','Pass','Fail','N/A'])}
        </div>

        <div class="section-title">Inverter &amp; Grid</div>
        <div class="form-row cols-2">
          ${_scSelect('sc-inv-disp',  'Inverter Display / Alarms',  sc.inverter_display,  ['','Pass','Fail','N/A'])}
          ${_scSelect('sc-grid-conn', 'Grid Connection Approval',   sc.grid_connection,   ['','Pass','Fail','N/A'])}
        </div>

        <div class="section-title">Electrical Tests</div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Array IR Test (MΩ) — DC to Earth</label>
            <input class="form-input" id="sc-ir-array" type="number" step="0.01" value="${sc.ir_array}" placeholder="&gt; 1 MΩ required" />
            <div class="form-hint">IEC 62446-1: minimum 1 MΩ at 500V DC test voltage.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Measured Performance Ratio (%)</label>
            <input class="form-input" id="sc-pr-meas" type="number" step="0.1" value="${sc.pr_measured}" placeholder="Typical 75–85%" />
          </div>
          <div class="form-group">
            <label class="form-label">Expected PR (%)</label>
            <input class="form-input" id="sc-pr-exp" type="number" step="0.1" value="${sc.pr_expected}" placeholder="Design PR" />
            <div class="form-hint">Deviation &gt;5% warrants investigation.</div>
          </div>
        </div>

        <div class="section-title">Final Sign-off</div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="sc-comm-ok" ${sc.commissioning_ok?'checked':''} style="width:18px;height:18px;accent-color:var(--success)" />
              Commissioning Tests Complete (IEC 62446-1)
            </label>
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="sc-pucsl-ok" ${sc.pucsl_compliant?'checked':''} style="width:18px;height:18px;accent-color:var(--success)" />
              PUCSL Guidelines Compliance Confirmed
            </label>
          </div>
        </div>
      </div>

      <!-- STRINGS -->
      <div class="card">
        <div class="card-title">&#9889; String Measurements &amp; Visual (IEC 62446-1 / IEC 61215)</div>
        <div class="info-box">
          Voc, Isc, insulation resistance per string. Visual per IEC 61215/61730 &amp; IEC 62446-1. Check = defect present → flagged in report.
        </div>
        <div id="insp-strings"></div>
        <div class="btn-group" style="margin-top:10px">
          <button class="btn btn-secondary btn-sm" id="insp-add-str-btn">+ Add String</button>
          <button class="btn btn-secondary btn-sm" id="insp-bulk-str-btn">+ Bulk Add</button>
        </div>
      </div>

      <div class="btn-group" style="margin-bottom:20px">
        <button class="btn btn-primary" id="insp-save-btn">&#128190; Save</button>
        <button class="btn btn-success" id="insp-pdf-btn">&#128196; Generate PDF</button>
        <button class="btn btn-danger btn-sm" id="insp-del-btn">Delete</button>
      </div>
    `;

    // Wire site info fields
    const siteFields = {
      '#si-proj': 'projectName', '#si-loc': 'siteLocation', '#si-gps': 'gpsCoords',
      '#si-cap': 'systemCapacity', '#si-type': 'inspectionType',
      '#si-date': 'date', '#si-inspector': 'inspector', '#si-weather': 'weather',
      '#si-irr': 'irradiance', '#si-temp': 'ambientTemp',
      '#si-inv': 'inverterModel', '#si-notes': 'notes'
    };
    Object.entries(siteFields).forEach(([sel, key]) => {
      const el = body.querySelector(sel);
      if (el) el.addEventListener('input', () => { _session.site[key] = el.value; _debounceSave(); });
    });

    // Wire system check selects + inputs
    const scMap = {
      '#sc-spd-dc': 'spd_dc', '#sc-spd-ac': 'spd_ac',
      '#sc-earth-cont': 'earthing_cont', '#sc-earth-res': 'earthing_resistance',
      '#sc-cable-cond': 'cable_condition', '#sc-cable-uv': 'cable_uv',
      '#sc-cable-routing': 'cable_routing', '#sc-mounting': 'array_mounting',
      '#sc-mod-label': 'module_labelling', '#sc-str-label': 'string_labelling',
      '#sc-inv-disp': 'inverter_display', '#sc-grid-conn': 'grid_connection',
      '#sc-ir-array': 'ir_array', '#sc-pr-meas': 'pr_measured', '#sc-pr-exp': 'pr_expected'
    };
    Object.entries(scMap).forEach(([sel, key]) => {
      const el = body.querySelector(sel);
      if (el) el.addEventListener('input', () => { _session.systemChecks[key] = el.value; _debounceSave(); });
    });

    const commOk = body.querySelector('#sc-comm-ok');
    const pucslOk = body.querySelector('#sc-pucsl-ok');
    if (commOk) commOk.addEventListener('change', () => { _session.systemChecks.commissioning_ok = commOk.checked; _debounceSave(); });
    if (pucslOk) pucslOk.addEventListener('change', () => { _session.systemChecks.pucsl_compliant = pucslOk.checked; _debounceSave(); });

    _renderStrings(body);

    body.querySelector('#insp-add-str-btn').addEventListener('click', () => {
      _addStringEntry(); _renderStrings(body); _debounceSave();
    });
    body.querySelector('#insp-bulk-str-btn').addEventListener('click', () => {
      const n = parseInt(prompt('How many strings to add?', '12'));
      if (!isNaN(n) && n > 0) { for (let i = 0; i < n; i++) _addStringEntry(); _renderStrings(body); _debounceSave(); }
    });
    body.querySelector('#insp-save-btn').addEventListener('click', () => {
      _saveSession(); App.state.lastSessionId = _session.id; App.toast('Inspection saved', 'success');
    });
    body.querySelector('#insp-pdf-btn').addEventListener('click', () => {
      _saveSession(); Reports.generateInspection(_session);
    });
    body.querySelector('#insp-del-btn').addEventListener('click', () => {
      if (!confirm('Delete this inspection?')) return;
      const sessions = _loadSessions().filter(s => s.id !== _session.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      _session = null; App.state.lastSessionId = null;
      render(container); App.toast('Deleted');
    });
  }

  // Helper: system check select dropdown
  function _scSelect(id, label, value, options) {
    const optHtml = options.map(o =>
      `<option value="${o}" ${value===o?'selected':''}>${o||'-- Select --'}</option>`
    ).join('');
    const cls = value === 'Pass' ? 'text-success' : value === 'Fail' ? 'text-danger' : '';
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <select class="form-select ${cls}" id="${id}">
          ${optHtml}
        </select>
      </div>`;
  }

  function _renderStrings(body) {
    const container = body.querySelector('#insp-strings');
    if (!_session.strings.length) {
      container.innerHTML = `<div class="text-muted text-sm">No strings added.</div>`;
      return;
    }

    container.innerHTML = _session.strings.map((s, i) => `
      <div class="string-row" id="sr-${i}">
        <div class="string-row-header">
          <input class="string-label-input" data-si="${i}" data-sfield="label" value="${s.label}" />
          <button class="btn btn-danger btn-sm" style="padding:4px 10px" data-sdel="${i}">&#10005;</button>
        </div>
        <div class="form-row cols-3">
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">Voc (V)</label>
            <input class="form-input" type="number" step="0.1" data-si="${i}" data-sfield="Voc" value="${s.Voc}" placeholder="Measured" />
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">Isc (A)</label>
            <input class="form-input" type="number" step="0.01" data-si="${i}" data-sfield="Isc" value="${s.Isc}" placeholder="Measured" />
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">IR (MΩ)</label>
            <input class="form-input" type="number" step="0.01" data-si="${i}" data-sfield="IR" value="${s.IR||''}" placeholder="&gt;1 MΩ" />
          </div>
        </div>
        <div class="form-label" style="margin-bottom:6px">Visual — IEC 61215/61730 (check = defect found)</div>
        <div class="checkbox-grid" style="grid-template-columns:1fr 1fr 1fr">
          ${_checkbox(i, 'hotspot',     'Hotspot',          s.visual.hotspot)}
          ${_checkbox(i, 'crack',       'Crack / Glass',    s.visual.crack)}
          ${_checkbox(i, 'soiling',     'Heavy Soiling',    s.visual.soiling)}
          ${_checkbox(i, 'delamination','Delamination',     s.visual.delamination)}
          ${_checkbox(i, 'yellowing',   'Yellowing/Bubble', s.visual.yellowing)}
          ${_checkbox(i, 'jbox',        'J-Box Damaged',    s.visual.jbox)}
          ${_checkbox(i, 'connector',   'MC4 Issue',        s.visual.connector)}
          ${_checkbox(i, 'earthing',    'Earthing Issue',   s.visual.earthing)}
          ${_checkbox(i, 'frame',       'Frame Damage',     s.visual.frame)}
        </div>
        <div class="form-group" style="margin-top:8px;margin-bottom:0">
          <input class="form-input" style="font-size:0.82rem;padding:7px 10px" placeholder="String notes" data-si="${i}" data-sfield="notes" value="${s.notes}" />
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-si][data-sfield]').forEach(el => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.si);
        const field = el.dataset.sfield;
        if (['label','Voc','Isc','IR','notes'].includes(field)) _session.strings[idx][field] = el.value;
        _debounceSave();
      });
    });

    container.querySelectorAll('input[type="checkbox"][data-si]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.si);
        _session.strings[idx].visual[cb.dataset.vkey] = cb.checked;
        cb.closest('.checkbox-item').classList.toggle('checked', cb.checked);
        _debounceSave();
      });
    });

    container.querySelectorAll('[data-sdel]').forEach(btn => {
      btn.addEventListener('click', () => {
        _session.strings.splice(parseInt(btn.dataset.sdel), 1);
        _renderStrings(body); _debounceSave();
      });
    });
  }

  function _checkbox(strIdx, key, label, checked) {
    return `
      <div class="checkbox-item ${checked ? 'checked' : ''}">
        <input type="checkbox" id="cb-${strIdx}-${key}" data-si="${strIdx}" data-vkey="${key}" ${checked ? 'checked' : ''} />
        <label for="cb-${strIdx}-${key}">${label}</label>
      </div>`;
  }

  function _showSavedList(container) {
    const sessions = _loadSessions();
    if (!sessions.length) { App.toast('No saved inspections'); return; }
    const listHtml = sessions.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div class="fw-bold">${s.site.projectName || 'Untitled'}</div>
          <div class="text-sm text-muted">${s.site.date} &bull; ${s.strings.length} strings &bull; ${s.site.inspector}</div>
          <div class="text-sm text-muted">${s.site.inspectionType || ''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" data-load="${s.id}">Load</button>
          <button class="btn btn-danger btn-sm" data-del-s="${s.id}">Del</button>
        </div>
      </div>
    `).join('');

    App.showModal('Saved Inspections', `<div>${listHtml}</div>`, [
      { label: 'Close', cls: 'btn-secondary', action: 'close' }
    ]);

    setTimeout(() => {
      document.querySelectorAll('[data-load]').forEach(btn => {
        btn.addEventListener('click', () => {
          const loaded = _loadSessions().find(s => s.id === btn.dataset.load);
          if (loaded) { _session = loaded; App.state.lastSessionId = _session.id; App.closeModal(); _renderForm(container); }
        });
      });
      document.querySelectorAll('[data-del-s]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!confirm('Delete?')) return;
          const updated = _loadSessions().filter(s => s.id !== btn.dataset.delS);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          App.closeModal(); _showSavedList(container);
        });
      });
    }, 50);
  }

  return { render };
})();
