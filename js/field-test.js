/**
 * field-test.js - Field Test vs STC Comparison
 * Enter measured Voc/Isc per string + site conditions.
 * Corrects to STC and compares using selectable standards profile.
 */

var FieldTest = (() => {
  let _strings = [];
  let _panel = null;
  let _container = null;

  function _esc(value) {
    if (typeof App !== 'undefined' && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _localDateISO() {
    if (typeof App !== 'undefined' && typeof App.localDateISO === 'function') {
      return App.localDateISO();
    }
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function _profiles() {
    if (typeof PVCalc !== 'undefined' && PVCalc && typeof PVCalc.getFieldTestProfiles === 'function') {
      return PVCalc.getFieldTestProfiles();
    }
    if (typeof PVCalc !== 'undefined' && PVCalc && PVCalc.FIELD_TEST_PROFILES) {
      return PVCalc.FIELD_TEST_PROFILES;
    }
    return {
      iec62446_2016: {
        id: 'iec62446_2016',
        label: 'IEC 62446-1:2016 + AMD1:2018',
        vocTolPct: 2,
        iscTolPct: 5,
      }
    };
  }

  function _defaultProfileId() {
    if (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getDefaultFieldTestProfileId === 'function') {
      return StandardsRules.getDefaultFieldTestProfileId();
    }
    return 'iec62446_2016';
  }

  // -----------------------------------------------------------------------
  // SUN ANGLE / IRRADIANCE ESTIMATOR
  // Pure math — no external API. Uses NOAA solar position algorithm (simplified).
  // -----------------------------------------------------------------------

  function _toRad(deg) { return deg * Math.PI / 180; }
  function _toDeg(rad) { return rad * 180 / Math.PI; }

  /**
   * Estimate solar elevation angle (degrees) for given lat/lon/datetime.
   * Returns elevation in degrees (0 = horizon, 90 = zenith).
   */
  function _solarElevation(lat, lon, dt) {
    const JD = _julianDate(dt);
    const T = (JD - 2451545.0) / 36525.0;

    // Geometric mean longitude (degrees)
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    // Mean anomaly (degrees)
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const Mrad = _toRad(M);
    // Equation of center
    const C = Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T))
            + Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T)
            + Math.sin(3 * Mrad) * 0.000289;
    // Sun's true longitude
    const sunLon = L0 + C;
    // Apparent longitude
    const omega = 125.04 - 1934.136 * T;
    const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(_toRad(omega));
    // Obliquity
    const epsilon0 = 23 + (26 + ((21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813)))) / 60) / 60;
    const epsilon = epsilon0 + 0.00256 * Math.cos(_toRad(omega));
    // Right ascension & declination
    const lambdaRad = _toRad(lambda);
    const epsilonRad = _toRad(epsilon);
    const decl = _toDeg(Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad)));

    // Greenwich mean sidereal time
    const JD0 = Math.floor(JD - 0.5) + 0.5;
    const D0 = JD0 - 2451545.0;
    const H = (dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600);
    const GMST = 6.697375 + 0.0657098242 * D0 + H;
    const LMST = ((GMST + lon / 15) % 24 + 24) % 24;
    // RA in degrees (approximate from apparent longitude)
    const RA = _toDeg(Math.atan2(
      Math.cos(epsilonRad) * Math.sin(lambdaRad),
      Math.cos(lambdaRad)
    ));
    const HA = (LMST * 15 - ((RA % 360) + 360) % 360);

    const latRad = _toRad(lat);
    const declRad = _toRad(decl);
    const HArad = _toRad(HA);

    const sinElev = Math.sin(latRad) * Math.sin(declRad)
                  + Math.cos(latRad) * Math.cos(declRad) * Math.cos(HArad);
    return _toDeg(Math.asin(Math.max(-1, Math.min(1, sinElev))));
  }

  function _julianDate(dt) {
    return dt.getTime() / 86400000 + 2440587.5;
  }

  /**
   * Estimate plane-of-array irradiance (W/m²) from solar elevation.
   * Uses simplified clear-sky model (Meinel & Meinel).
   * For cloudy/partial: user adjusts manually.
   */
  function _estimateIrradiance(elevDeg) {
    if (elevDeg <= 0) return 0;
    // Optical air mass (Kasten-Young formula)
    const elevRad = _toRad(elevDeg);
    const am = 1 / (Math.sin(elevRad) + 0.50572 * Math.pow(elevDeg + 6.07995, -1.6364));
    // Direct normal irradiance (clear-sky)
    const DNI = 1353 * Math.pow(0.7, Math.pow(am, 0.678));
    // Diffuse (simplified)
    const DHI = 0.1 * 1353 * Math.sin(elevRad);
    // Global horizontal irradiance
    const GHI = DNI * Math.sin(elevRad) + DHI;
    return Math.round(Math.max(0, GHI));
  }

  function _renderSunHelper(container) {
    const card = container.querySelector('#ft-sun-helper');
    if (!card) return;

    const lat = parseFloat(card.querySelector('#ft-lat').value);
    const lon = parseFloat(card.querySelector('#ft-lon').value);
    const dateVal = card.querySelector('#ft-sun-date').value;
    const timeVal = card.querySelector('#ft-sun-time').value;
    const utcOff = parseFloat(card.querySelector('#ft-utcoff').value) || 0;
    const cloudFactor = parseFloat(card.querySelector('#ft-cloud').value) / 100;
    const resultDiv = card.querySelector('#ft-sun-result');

    if (isNaN(lat) || isNaN(lon) || !dateVal || !timeVal) {
      resultDiv.innerHTML = '<span class="text-muted text-sm">Enter location and time to estimate.</span>';
      return;
    }

    // Treat dateVal+timeVal as wall-clock in the user's UTC offset zone.
    // Parse as UTC-0 (append Z), then subtract the offset to get actual UTC.
    const nominalMs = new Date(dateVal + 'T' + timeVal + ':00Z').getTime();
    const utcMs = nominalMs - utcOff * 3600000;
    const dt = new Date(utcMs);

    const elev = _solarElevation(lat, lon, dt);
    const ghi = _estimateIrradiance(elev);
    const ghiAdjusted = Math.round(ghi * (1 - cloudFactor * 0.75));

    const elevStr = elev.toFixed(1);
    const status = elev <= 0
      ? '<span class="status-badge badge-fail">Below horizon</span>'
      : elev < 15
        ? '<span class="status-badge badge-warn">Low angle — high air mass</span>'
        : '<span class="status-badge badge-pass">Good angle</span>';

    resultDiv.innerHTML = `
      <div class="form-row cols-2" style="margin-top:8px">
        <div class="result-mini"><div class="result-mini-val">${elevStr}&deg;</div><div class="result-mini-label">Solar Elevation</div></div>
        <div class="result-mini"><div class="result-mini-val">${ghiAdjusted}</div><div class="result-mini-label">Est. GHI (W/m&sup2;)</div></div>
      </div>
      <div style="margin-top:6px">${status}</div>
      ${ghiAdjusted > 0 ? `<button class="btn btn-secondary btn-sm" id="ft-use-irr" style="margin-top:8px">&#8593; Use ${ghiAdjusted} W/m&sup2; in test</button>` : ''}
    `;

    const useBtn = resultDiv.querySelector('#ft-use-irr');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        container.querySelector('#ft-irr').value = ghiAdjusted;
        App.toast('Irradiance set to ' + ghiAdjusted + ' W/m²', 'success');
        _revalidateAllRows(container);
      });
    }
  }

  // -----------------------------------------------------------------------
  // REAL-TIME ROW VALIDATION
  // -----------------------------------------------------------------------

  function _getConditions(container) {
    const panelId = container.querySelector('#ft-panel').value;
    const panel = panelId ? DB.getById(panelId) : null;
    const n_mod = parseInt(container.querySelector('#ft-nmod').value) || 0;
    const G = parseFloat(container.querySelector('#ft-irr').value) || 0;
    const T_mod = parseFloat(container.querySelector('#ft-tmod').value) || 25;
    const profileId = container.querySelector('#ft-profile')
      ? String(container.querySelector('#ft-profile').value || _defaultProfileId())
      : _defaultProfileId();
    return { panel, n_mod, G, T_mod, profileId };
  }

  function _liveValidateRow(container, idx) {
    const s = _strings[idx];
    if (!s) return;
    const { panel, n_mod, G, T_mod, profileId } = _getConditions(container);
    const row = container.querySelector(`tr[data-row-idx="${idx}"]`);
    if (!row) return;

    const indicator = row.querySelector('.ft-row-indicator');
    const Voc = parseFloat(s.Voc);
    const Isc = parseFloat(s.Isc);

    // Can't validate without panel, conditions, or values
    if (!panel || !n_mod || !G || isNaN(Voc) || isNaN(Isc)) {
      if (indicator) {
        indicator.className = 'ft-row-indicator ft-row-empty';
        indicator.textContent = '–';
      }
      row.className = row.className.replace(/ ft-row-(pass|fail)/g, '');
      return;
    }

    try {
      const r = PVCalc.fieldTestString(panel, Voc, Isc, T_mod, G, n_mod, { profileId });
      const pass = r.passVoc && r.passIsc;
      if (indicator) {
        indicator.className = 'ft-row-indicator ' + (pass ? 'ft-row-pass' : 'ft-row-fail');
        indicator.textContent = pass ? '✓' : '✗';
        indicator.title = `Voc: ${r.devVoc >= 0 ? '+' : ''}${r.devVoc.toFixed(2)}% ${r.passVoc ? 'PASS' : 'FAIL'} | Isc: ${r.devIsc >= 0 ? '+' : ''}${r.devIsc.toFixed(2)}% ${r.passIsc ? 'PASS' : 'FAIL'}`;
      }
      // Colour the row background
      const trCls = row.className.replace(/ ft-row-(pass|fail)/g, '');
      row.className = trCls + (pass ? ' ft-row-pass' : ' ft-row-fail');
    } catch (e) {
      if (indicator) {
        indicator.className = 'ft-row-indicator ft-row-empty';
        indicator.textContent = '?';
      }
    }
  }

  function _revalidateAllRows(container) {
    _strings.forEach((_, i) => _liveValidateRow(container, i));
  }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  function render(container) {
    _container = container;
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${p.Pmax}W)</option>`
    ).join('');

    const profileMap = _profiles();
    const defaultProfileId = _defaultProfileId();
    const profileDefault = (App.state.fieldTestProfileId && profileMap[App.state.fieldTestProfileId])
      ? App.state.fieldTestProfileId
      : defaultProfileId;
    const profileOptions = Object.keys(profileMap).map((id) => {
      const p = profileMap[id] || {};
      return `<option value="${_esc(id)}" ${id === profileDefault ? 'selected' : ''}>${_esc(p.label || id)}</option>`;
    }).join('');

    // Pre-fill from sizing result if available
    const sr = App.state.sizingResult;
    const defNmod = sr ? sr.n_mod : 20;
    const defPanelId = sr ? sr.panel.id : '';

    // Default location from project if available
    const proj = typeof App.getProject === 'function' ? App.getProject() : null;

    // Today's date/time for sun helper
    const now = new Date();
    const nowDate = _localDateISO();
    const nowTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128202; Field Test vs STC</div>

        <div class="card">
          <div class="card-title">Test Conditions</div>
          <div class="form-group">
            <label class="form-label">Module</label>
            <select class="form-select" id="ft-panel">
              <option value="">-- Select Panel --</option>
              ${panelOptions}
            </select>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Modules per String</label>
              <input class="form-input" id="ft-nmod" type="number" value="${defNmod}" min="1" max="50" />
            </div>
            <div class="form-group">
              <label class="form-label">Irradiance (W/m&sup2;)</label>
              <input class="form-input" id="ft-irr" type="number" value="900" min="100" max="1400" />
              <div class="form-hint">Reference cell / pyranometer</div>
            </div>
            <div class="form-group">
              <label class="form-label">Module Temp (&deg;C)</label>
              <input class="form-input" id="ft-tmod" type="number" value="55" min="-10" max="85" />
              <div class="form-hint">Back-of-panel IR or Pt100</div>
            </div>
            <div class="form-group">
              <label class="form-label">Test Date</label>
              <input class="form-input" id="ft-date" type="date" value="${_localDateISO()}" />
            </div>
            <div class="form-group">
              <label class="form-label">Pass Criteria Profile</label>
              <select class="form-select" id="ft-profile">${profileOptions}</select>
            </div>
          </div>
        </div>

        <!-- SUN ANGLE / IRRADIANCE HELPER -->
        <details class="card" id="ft-sun-helper">
          <summary class="card-title" style="cursor:pointer;user-select:none">
            &#9728; Sun Angle &amp; Irradiance Estimator
            <span class="text-muted text-sm" style="font-weight:normal;margin-left:8px">No internet needed</span>
          </summary>
          <div style="padding-top:8px">
            <div class="form-row cols-2">
              <div class="form-group">
                <label class="form-label">Latitude (&deg;)</label>
                <input class="form-input" id="ft-lat" type="number" step="0.0001" placeholder="e.g. 7.2906" value="${proj && proj.lat ? proj.lat : ''}" />
              </div>
              <div class="form-group">
                <label class="form-label">Longitude (&deg;)</label>
                <input class="form-input" id="ft-lon" type="number" step="0.0001" placeholder="e.g. 80.6337" value="${proj && proj.lon ? proj.lon : ''}" />
              </div>
              <div class="form-group">
                <label class="form-label">Date</label>
                <input class="form-input" id="ft-sun-date" type="date" value="${nowDate}" />
              </div>
              <div class="form-group">
                <label class="form-label">Local Time</label>
                <input class="form-input" id="ft-sun-time" type="time" value="${nowTime}" />
              </div>
              <div class="form-group">
                <label class="form-label">UTC Offset (h)</label>
                <input class="form-input" id="ft-utcoff" type="number" step="0.5" value="5.5" min="-12" max="14" />
                <div class="form-hint">Sri Lanka = +5.5</div>
              </div>
              <div class="form-group">
                <label class="form-label">Cloud Cover (%)</label>
                <input class="form-input" id="ft-cloud" type="number" value="0" min="0" max="100" step="5" />
                <div class="form-hint">0 = clear sky</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="ft-calc-sun">&#9881; Calculate</button>
            <div id="ft-sun-result" style="margin-top:8px"></div>
          </div>
        </details>

        <div class="card">
          <div class="card-title">
            String Measurements
            <span id="ft-live-summary" class="text-sm text-muted" style="font-weight:normal;margin-left:8px"></span>
          </div>
          <div id="ft-string-list"></div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" id="ft-add-btn">+ Add String</button>
            <div style="display:flex;align-items:center;gap:4px">
              <button class="btn btn-secondary btn-sm" id="ft-bulk-minus" aria-label="Remove bulk">&#8722;</button>
              <input class="form-input" id="ft-bulk-count" type="number" value="4" min="1" max="50"
                style="width:56px;text-align:center;padding:6px 4px;min-height:40px" />
              <button class="btn btn-secondary btn-sm" id="ft-bulk-plus" aria-label="Add bulk">&#43;</button>
              <button class="btn btn-secondary btn-sm" id="ft-bulk-add">+ Add N Strings</button>
            </div>
            <button class="btn btn-secondary btn-sm" id="ft-paste-btn" title="Paste tab-separated: Label[tab]Voc[tab]Isc per line">&#128203; Paste</button>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="ft-compare-btn" style="margin-bottom:12px">Compare All to STC</button>

        <div id="ft-results" class="hidden"></div>
      </div>
    `;

    if (defPanelId) {
      container.querySelector('#ft-panel').value = defPanelId;
      _panel = DB.getById(defPanelId);
    }

    // Condition change listeners → revalidate all rows
    ['#ft-panel', '#ft-nmod', '#ft-irr', '#ft-tmod', '#ft-profile'].forEach(sel => {
      const el = container.querySelector(sel);
      if (el) el.addEventListener('change', () => {
        if (sel === '#ft-panel') {
          _panel = DB.getById(el.value) || null;
        }
        _revalidateAllRows(container);
        _updateLiveSummary(container);
      });
    });
    ['#ft-nmod', '#ft-irr', '#ft-tmod'].forEach(sel => {
      const el = container.querySelector(sel);
      if (el) el.addEventListener('input', () => {
        _revalidateAllRows(container);
        _updateLiveSummary(container);
      });
    });

    _strings = [];
    _addString();
    _addString();
    _renderStringList(container);

    container.querySelector('#ft-add-btn').addEventListener('click', () => {
      _addString();
      _renderStringList(container);
    });

    // Bulk add controls
    container.querySelector('#ft-bulk-minus').addEventListener('click', () => {
      const inp = container.querySelector('#ft-bulk-count');
      inp.value = Math.max(1, (parseInt(inp.value) || 1) - 1);
    });
    container.querySelector('#ft-bulk-plus').addEventListener('click', () => {
      const inp = container.querySelector('#ft-bulk-count');
      inp.value = Math.min(50, (parseInt(inp.value) || 1) + 1);
    });
    container.querySelector('#ft-bulk-add').addEventListener('click', () => {
      const n = parseInt(container.querySelector('#ft-bulk-count').value) || 1;
      for (let i = 0; i < n; i++) _addString();
      _renderStringList(container);
    });

    // Paste handler: accepts tab-separated lines: Label\tVoc\tIsc
    container.querySelector('#ft-paste-btn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        let added = 0;
        lines.forEach(line => {
          const parts = line.split(/\t/);
          if (parts.length >= 2) {
            const label = parts[0].trim() || ('String ' + (_strings.length + 1));
            const Voc = parts[1].trim();
            const Isc = parts.length >= 3 ? parts[2].trim() : '';
            _strings.push({ label, Voc, Isc });
            added++;
          }
        });
        if (added > 0) {
          _renderStringList(container);
          App.toast(`Pasted ${added} string${added > 1 ? 's' : ''}`, 'success');
        } else {
          App.toast('No valid data found. Use: Label[Tab]Voc[Tab]Isc per line', 'error');
        }
      } catch (e) {
        App.toast('Clipboard access denied. Paste manually into cells.', 'error');
      }
    });

    // Sun helper
    container.querySelector('#ft-calc-sun').addEventListener('click', () => _renderSunHelper(container));

    container.querySelector('#ft-compare-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#ft-compare-btn'), () => _compare(container));
    });
  }

  function _addString() {
    _strings.push({
      label: 'String ' + (_strings.length + 1),
      Voc: '',
      Isc: ''
    });
  }

  function _updateLiveSummary(container) {
    const sumEl = container.querySelector('#ft-live-summary');
    if (!sumEl) return;
    const { panel, n_mod, G } = _getConditions(container);
    if (!panel || !n_mod || !G) {
      sumEl.textContent = '';
      return;
    }
    let passCount = 0, failCount = 0, emptyCount = 0;
    _strings.forEach(s => {
      const Voc = parseFloat(s.Voc);
      const Isc = parseFloat(s.Isc);
      if (isNaN(Voc) || isNaN(Isc)) { emptyCount++; return; }
      try {
        const { panel: p, n_mod: n, G: g, T_mod, profileId } = _getConditions(container);
        const r = PVCalc.fieldTestString(p, Voc, Isc, T_mod, g, n, { profileId });
        if (r.passVoc && r.passIsc) passCount++; else failCount++;
      } catch (e) { emptyCount++; }
    });
    const parts = [];
    if (passCount > 0) parts.push(`<span style="color:var(--success)">${passCount} pass</span>`);
    if (failCount > 0) parts.push(`<span style="color:var(--danger)">${failCount} fail</span>`);
    if (emptyCount > 0) parts.push(`<span class="text-muted">${emptyCount} empty</span>`);
    sumEl.innerHTML = parts.join(' &bull; ');
  }

  function _renderStringList(container) {
    const list = container.querySelector('#ft-string-list');
    if (!_strings.length) {
      list.innerHTML = '<div class="text-muted text-sm">No strings added yet.</div>';
      return;
    }
    list.innerHTML = `
      <table class="status-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th style="min-width:90px">Label</th>
            <th>Voc (V)</th>
            <th>Isc (A)</th>
            <th style="width:36px"></th>
          </tr>
        </thead>
        <tbody id="ft-tbody">
          ${_strings.map((s, i) => `
            <tr data-row-idx="${i}">
              <td style="text-align:center"><span class="ft-row-indicator ft-row-empty" title="">–</span></td>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" data-idx="${i}" data-field="label" value="${_esc(s.label)}" /></td>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" type="number" step="0.1" data-idx="${i}" data-field="Voc" value="${_esc(s.Voc)}" placeholder="V" /></td>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" type="number" step="0.01" data-idx="${i}" data-field="Isc" value="${_esc(s.Isc)}" placeholder="A" /></td>
              <td><button class="btn btn-danger btn-sm" style="padding:4px 8px" data-del="${i}">&#10005;</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    list.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.idx, 10);
        _strings[idx][inp.dataset.field] = inp.value;
        if (inp.dataset.field === 'Voc' || inp.dataset.field === 'Isc') {
          _liveValidateRow(container, idx);
          _updateLiveSummary(container);
        }
      });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        _strings.splice(parseInt(btn.dataset.del, 10), 1);
        _renderStringList(container);
        _updateLiveSummary(container);
      });
    });

    // Initial validation pass for any pre-filled values
    _strings.forEach((_, i) => _liveValidateRow(container, i));
    _updateLiveSummary(container);
  }

  function _compare(container) {
    const panelId = container.querySelector('#ft-panel').value;
    if (!panelId) { App.toast('Select a panel first', 'error'); return; }
    _panel = DB.getById(panelId);
    if (!_panel) return;

    const n_mod = parseInt(container.querySelector('#ft-nmod').value) || 20;
    const G = parseFloat(container.querySelector('#ft-irr').value) || 900;
    const T_mod = parseFloat(container.querySelector('#ft-tmod').value) || 55;
    const profileId = container.querySelector('#ft-profile')
      ? String(container.querySelector('#ft-profile').value || _defaultProfileId())
      : _defaultProfileId();

    App.state.fieldTestProfileId = profileId;

    const results = _strings.map((s) => {
      const Voc = parseFloat(s.Voc);
      const Isc = parseFloat(s.Isc);
      if (isNaN(Voc) || isNaN(Isc)) return { label: s.label, skipped: true };
      return {
        label: s.label,
        ...PVCalc.fieldTestString(_panel, Voc, Isc, T_mod, G, n_mod, { profileId })
      };
    }).filter(r => !r.skipped);

    if (!results.length) { App.toast('No valid measurements to compare', 'error'); return; }

    const first = results[0] || {};
    const vocTol = Number(first.vocTolerancePct || 0);
    const iscTol = Number(first.iscTolerancePct || 0);
    const profileLabel = String(first.profileLabel || profileId);

    const passAll = results.every(r => r.passVoc && r.passIsc);
    const failCount = results.filter(r => !r.passVoc || !r.passIsc).length;

    const copyLines = [
      `Profile: ${profileLabel} (Voc +/-${vocTol.toFixed(1)}%, Isc +/-${iscTol.toFixed(1)}%)`,
      'String\tVoc Meas\tVoc Corr\tVoc DS\tVoc Dev%\tVoc P/F\tIsc Meas\tIsc Corr\tIsc DS\tIsc Dev%\tIsc P/F',
      ...results.map(r =>
        `${r.label}\t${r.Voc_meas.toFixed(1)}\t${r.Voc_corrected.toFixed(1)}\t${r.Voc_expected.toFixed(1)}\t${r.devVoc.toFixed(2)}%\t${r.passVoc ? 'PASS' : 'FAIL'}\t${r.Isc_meas.toFixed(2)}\t${r.Isc_corrected.toFixed(2)}\t${r.Isc_expected.toFixed(2)}\t${r.devIsc.toFixed(2)}%\t${r.passIsc ? 'PASS' : 'FAIL'}`
      )
    ].join('\n');

    App.state.fieldTestResults = {
      panel: _panel,
      n_mod,
      G,
      T_mod,
      results,
      date: container.querySelector('#ft-date').value,
      profileId,
      profileLabel,
      tolerances: { vocPct: vocTol, iscPct: iscTol },
      qualityBadges: ['Datasheet-backed', 'Heuristic'],
    };

    const resultsDiv = container.querySelector('#ft-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="result-box ${passAll ? 'alert-safe' : 'alert-unsafe'}" style="margin-bottom:12px">
          <div class="result-value">${passAll ? '&#10003; ALL PASS' : `&#9888; ${failCount} STRING${failCount > 1 ? 'S' : ''} FAIL`}</div>
          <div class="result-label">${results.length} strings tested &bull; Corrected to STC &bull; G=${G} W/m&sup2;, T_mod=${T_mod}&deg;C</div>
        </div>

        <div class="info-box">
          Profile: ${_esc(profileLabel)} &bull; Pass criteria: Voc &plusmn;${vocTol.toFixed(1)}% and Isc &plusmn;${iscTol.toFixed(1)}%
        </div>

        <div style="overflow-x:auto">
          <table class="status-table">
            <thead>
              <tr>
                <th rowspan="2" style="vertical-align:bottom">String</th>
                <th colspan="4" style="text-align:center;border-bottom:1px solid var(--border)">Voc (V)</th>
                <th colspan="4" style="text-align:center;border-bottom:1px solid var(--border)">Isc (A)</th>
              </tr>
              <tr>
                <th>Meas</th><th>Corr</th><th>DS</th><th>Dev% / P/F</th>
                <th>Meas</th><th>Corr</th><th>DS</th><th>Dev% / P/F</th>
              </tr>
            </thead>
            <tbody>
              ${results.map(r => {
                const rowCls = (!r.passVoc || !r.passIsc) ? 'status-warning' : '';
                const vocBadge = r.passVoc ? '<span class="status-badge badge-pass">PASS</span>' : '<span class="status-badge badge-fail">FAIL</span>';
                const iscBadge = r.passIsc ? '<span class="status-badge badge-pass">PASS</span>' : '<span class="status-badge badge-fail">FAIL</span>';
                const vocDevCls = !r.passVoc ? 'text-danger fw-bold' : '';
                const iscDevCls = !r.passIsc ? 'text-danger fw-bold' : '';
                return `
                  <tr class="${rowCls}">
                    <td><strong>${_esc(r.label)}</strong></td>
                    <td>${r.Voc_meas.toFixed(1)}</td>
                    <td>${r.Voc_corrected.toFixed(1)}</td>
                    <td>${r.Voc_expected.toFixed(1)}</td>
                    <td class="${vocDevCls}">${(r.devVoc >= 0 ? '+' : '')}${r.devVoc.toFixed(2)}% ${vocBadge}</td>
                    <td>${r.Isc_meas.toFixed(2)}</td>
                    <td>${r.Isc_corrected.toFixed(2)}</td>
                    <td>${r.Isc_expected.toFixed(2)}</td>
                    <td class="${iscDevCls}">${(r.devIsc >= 0 ? '+' : '')}${r.devIsc.toFixed(2)}% ${iscBadge}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="btn-group" style="margin-top:12px">
          <button class="btn btn-secondary btn-sm" id="ft-print-btn">&#128424; Print</button>
          <button class="btn btn-secondary btn-sm" id="ft-copy-btn">&#128203; Copy as Text</button>
          <button class="btn btn-secondary btn-sm" id="ft-csv-btn">&#128190; Export CSV</button>
          <button class="btn btn-success btn-sm" id="ft-pdf-btn">&#128196; Export PDF</button>
          <button class="btn btn-secondary btn-sm" id="ft-docx-btn">Export DOCX</button>
        </div>
      </div>
    `;

    resultsDiv.querySelector('#ft-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ft-results', 'Field Test vs STC Report', container);
        return;
      }
      window.print();
    });

    resultsDiv.querySelector('#ft-copy-btn').addEventListener('click', () => {
      if (typeof App.copyText === 'function') {
        App.copyText(copyLines);
        return;
      }
      navigator.clipboard.writeText(copyLines).then(() => App.toast('Copied to clipboard', 'success'));
    });

    resultsDiv.querySelector('#ft-csv-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.downloadFieldTestCSV !== 'function') {
        App.toast('CSV export not available', 'error');
        return;
      }
      Reports.downloadFieldTestCSV(App.state.fieldTestResults);
    });

    resultsDiv.querySelector('#ft-pdf-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.generateFieldTest !== 'function') {
        App.toast('PDF export not available', 'error');
        return;
      }
      Reports.generateFieldTest(App.state.fieldTestResults);
    });

    const docxBtn = resultsDiv.querySelector('#ft-docx-btn');
    if (docxBtn) {
      docxBtn.addEventListener('click', () => {
        if (typeof Reports === 'undefined' || typeof Reports.generateFieldTestDOCX !== 'function') {
          App.toast('DOCX export not available', 'error');
          return;
        }
        Reports.generateFieldTestDOCX(App.state.fieldTestResults);
      });
    }

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
