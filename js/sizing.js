/**
 * sizing.js — String & Array Sizing Calculator
 * Calculates safe string configuration within inverter limits.
 * Reads panel from DB, writes result to App.state.sizingResult for Fault Checker.
 */

const Sizing = (() => {
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

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${_esc(p.Pmax)}W)</option>`
    ).join('');

    // Restore last values from App.state if available
    const s = (App.state.sizingInputs || {});

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9889; String & Array Sizing</div>

        <!-- PANEL SELECTION -->
        <div class="card">
          <div class="card-title">Module Selection</div>
          <div class="form-group">
            <label class="form-label">Module</label>
            <select class="form-select" id="sz-panel">
              <option value="">-- Select Panel --</option>
              ${panelOptions}
            </select>
          </div>
          <div id="sz-panel-specs" class="hidden"></div>
        </div>

        <!-- SITE CONDITIONS -->
        <div class="card">
          <div class="card-title">Site Conditions</div>
          <div class="info-box">Sri Lanka default: T_min = 10°C. Cell temp at STC irradiance calculated using NOCT formula.</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Site Min Temp (°C)</label>
              <input class="form-input" id="sz-tmin" type="number" value="${s.T_min ?? 10}" />
              <div class="form-hint">Coldest night/morning ambient</div>
            </div>
            <div class="form-group">
              <label class="form-label">Site Max Ambient (°C)</label>
              <input class="form-input" id="sz-tamb" type="number" value="${s.T_amb ?? 38}" />
              <div class="form-hint">Hottest ambient at site</div>
            </div>
          </div>
          <div id="sz-cell-temp-info" class="info-box hidden"></div>
        </div>

        <!-- INVERTER LIMITS -->
        <div class="card">
          <div class="card-title">Inverter Limits</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Max DC Input (V)</label>
              <input class="form-input" id="sz-vinv" type="number" value="${s.V_max ?? 1000}" />
              <div class="form-hint">Absolute max, e.g. 1000V or 1100V</div>
            </div>
            <div class="form-group">
              <label class="form-label">MPPT Vmin (V)</label>
              <input class="form-input" id="sz-vmppt-min" type="number" value="${s.V_mppt_min ?? 200}" />
            </div>
            <div class="form-group">
              <label class="form-label">MPPT Vmax (V)</label>
              <input class="form-input" id="sz-vmppt-max" type="number" value="${s.V_mppt_max ?? 800}" />
            </div>
            <div class="form-group">
              <label class="form-label">Max Isc per MPPT (A)</label>
              <input class="form-input" id="sz-imax" type="number" step="0.1" value="${s.I_max ?? 30}" />
            </div>
          </div>
        </div>

        <!-- PROPOSED CONFIG -->
        <div class="card">
          <div class="card-title">Proposed Configuration</div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label">Modules / String</label>
              <input class="form-input" id="sz-nmod" type="number" min="1" value="${s.n_mod ?? 20}" />
            </div>
            <div class="form-group">
              <label class="form-label">Strings / MPPT</label>
              <input class="form-input" id="sz-nstr" type="number" min="1" value="${s.n_str ?? 2}" />
            </div>
            <div class="form-group">
              <label class="form-label">No. of MPPTs</label>
              <input class="form-input" id="sz-nmppt" type="number" min="1" value="${s.n_mppt ?? 1}" />
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary btn-block" id="sz-calc-btn">Calculate</button>
          </div>
          <div class="mt-8" id="sz-auto-hint"></div>
        </div>

        <!-- RESULTS -->
        <div id="sz-results" class="hidden"></div>
      </div>
    `;

    // Panel selection → show specs + compute cell temp
    const panelSel = container.querySelector('#sz-panel');
    if (s.panelId) panelSel.value = s.panelId;
    panelSel.addEventListener('change', () => _onPanelChange(container));

    // Site temp change → recompute cell temp display
    ['#sz-tmin', '#sz-tamb'].forEach(id => {
      container.querySelector(id).addEventListener('input', () => _updateCellTempInfo(container));
    });

    container.querySelector('#sz-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#sz-calc-btn'), () => _calculate(container));
    });

    // If panel already selected from state, show its specs
    if (s.panelId) _onPanelChange(container);
  }

  function _onPanelChange(container) {
    const id = container.querySelector('#sz-panel').value;
    const specsDiv = container.querySelector('#sz-panel-specs');
    if (!id) { specsDiv.classList.add('hidden'); specsDiv.innerHTML = ''; return; }
    const p = DB.getById(id);
    if (!p) return;
    specsDiv.classList.remove('hidden');
    specsDiv.innerHTML = `
      <div class="panel-card-specs" style="margin-top:8px">
        <span class="spec-chip">${p.Pmax}W</span>
        <span class="spec-chip">Voc ${p.Voc}V</span>
        <span class="spec-chip">Vmp ${p.Vmp}V</span>
        <span class="spec-chip">Isc ${p.Isc}A</span>
        <span class="spec-chip">Imp ${p.Imp}A</span>
        <span class="spec-chip">NOCT ${p.NOCT}°C</span>
        <span class="spec-chip">&#945;Voc ${(p.coeffVoc*100).toFixed(3)}%/°C</span>
      </div>
    `;
    _updateCellTempInfo(container);
    _showAutoHints(container, p);
  }

  function _updateCellTempInfo(container) {
    const id = container.querySelector('#sz-panel').value;
    if (!id) return;
    const p = DB.getById(id);
    if (!p) return;
    const T_amb = parseFloat(container.querySelector('#sz-tamb').value) || 38;
    const T_cell = PVCalc.cellTemp(T_amb, p.NOCT, 1000);
    const info = container.querySelector('#sz-cell-temp-info');
    info.classList.remove('hidden');
    info.textContent = `Cell temperature at 1000 W/m², T_amb ${T_amb}°C, NOCT ${p.NOCT}°C → T_cell = ${T_cell.toFixed(1)}°C`;
  }

  function _showAutoHints(container, panel) {
    const T_min  = parseFloat(container.querySelector('#sz-tmin').value) || 10;
    const T_amb  = parseFloat(container.querySelector('#sz-tamb').value) || 38;
    const V_max  = parseFloat(container.querySelector('#sz-vinv').value) || 1000;
    const V_mppt_min = parseFloat(container.querySelector('#sz-vmppt-min').value) || 200;
    const T_cell = PVCalc.cellTemp(T_amb, panel.NOCT, 1000);

    const maxMod = PVCalc.maxModulesPerString(panel.Voc, panel.coeffVoc, T_min, V_max);
    const minMod = PVCalc.minModulesPerString(panel.Vmp, panel.coeffVoc, T_cell, V_mppt_min);

    container.querySelector('#sz-auto-hint').innerHTML =
      `<div class="info-box">Auto limits: Min ${minMod} — Max ${maxMod} modules/string based on inverter voltage limits at site temps.</div>`;
    // Pre-fill if empty or out of range
    const nModInput = container.querySelector('#sz-nmod');
    const cur = parseInt(nModInput.value);
    if (!cur || cur > maxMod) nModInput.value = maxMod;
    if (cur < minMod) nModInput.value = minMod;
  }

  function _calculate(container) {
    const panelId = container.querySelector('#sz-panel').value;
    if (!panelId) { App.toast('Select a panel first', 'error'); return; }
    const panel = DB.getById(panelId);
    if (!panel) return;

    const T_min  = parseFloat(container.querySelector('#sz-tmin').value);
    const T_amb  = parseFloat(container.querySelector('#sz-tamb').value);
    const V_max  = parseFloat(container.querySelector('#sz-vinv').value);
    const V_mppt_min = parseFloat(container.querySelector('#sz-vmppt-min').value);
    const V_mppt_max = parseFloat(container.querySelector('#sz-vmppt-max').value);
    const I_max  = parseFloat(container.querySelector('#sz-imax').value);
    const n_mod  = parseInt(container.querySelector('#sz-nmod').value);
    const n_str  = parseInt(container.querySelector('#sz-nstr').value);
    const n_mppt = parseInt(container.querySelector('#sz-nmppt').value);

    if ([T_min, T_amb, V_max, V_mppt_min, V_mppt_max, I_max, n_mod, n_str, n_mppt].some(isNaN)) {
      App.toast('Fill all fields', 'error'); return;
    }

    const T_cell_max = PVCalc.cellTemp(T_amb, panel.NOCT, 1000);
    const inv = { V_max, V_mppt_min, V_mppt_max, I_max_per_mppt: I_max };

    const violations = PVCalc.checkSizingLimits(panel, n_mod, n_str, T_min, T_cell_max, inv);
    const params_stc   = PVCalc.arrayParams(panel, n_mod, n_str, n_mppt, 25);
    const params_tmin  = PVCalc.arrayParams(panel, n_mod, n_str, n_mppt, T_min);
    const params_tmax  = PVCalc.arrayParams(panel, n_mod, n_str, n_mppt, T_cell_max);

    const Voc_tmin = PVCalc.vocAtTemp(panel.Voc, panel.coeffVoc, T_min) * n_mod;
    const Vmp_tmax = PVCalc.vmpAtTemp(panel.Vmp, panel.coeffVoc, T_cell_max) * n_mod;
    const Isc_tmax_per_mppt = PVCalc.iscAtTemp(panel.Isc, panel.coeffIsc, T_cell_max) * n_str;

    const total_strings = n_str * n_mppt;
    const total_modules = n_mod * total_strings;
    const total_kWp = (panel.Pmax * total_modules) / 1000;

    // Save state
    App.state.sizingInputs = { panelId, T_min, T_amb, V_max, V_mppt_min, V_mppt_max, I_max, n_mod, n_str, n_mppt };
    App.state.sizingResult = {
      panel, n_mod, n_str, n_mppt, T_min, T_amb, T_cell_max,
      Voc_expected: panel.Voc * n_mod,
      Isc_expected: panel.Isc,
      violations
    };

    const safeClass = violations.length === 0 ? 'alert-safe' : 'alert-unsafe';
    const safeText  = violations.length === 0 ? '&#10003; SAFE' : `&#9888; ${violations.length} VIOLATION${violations.length > 1 ? 'S' : ''}`;

    const violationsHtml = violations.length > 0
      ? violations.map(v => `
          <div class="danger-box">
            <strong>${_esc(v.param)}</strong>: ${_esc(v.value)} &gt; limit ${_esc(v.limit)}<br>
            ${_esc(v.msg)}
          </div>`).join('')
      : `<div class="info-box">All inverter voltage and current limits are satisfied at site temperature extremes.</div>`;

    const resultsDiv = container.querySelector('#sz-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="result-box ${safeClass}" style="margin-bottom:12px">
          <div class="result-value">${safeText}</div>
          <div class="result-label">${n_mod} mod/string &times; ${n_str} strings/MPPT &times; ${n_mppt} MPPT = ${total_modules} modules (${total_kWp.toFixed(2)} kWp)</div>
        </div>
        ${violationsHtml}
      </div>

      <div class="card">
        <div class="card-title">Voltage Check (Critical Limits)</div>
        <table class="status-table">
          <thead><tr><th>Parameter</th><th>Value</th><th>Limit</th><th>Status</th></tr></thead>
          <tbody>
            ${_limitRow('String Voc at T_min (' + T_min + '°C)', Voc_tmin.toFixed(1) + ' V', V_max + ' V max', Voc_tmin <= V_max)}
            ${_limitRow('String Vmp at T_cell_max (' + T_cell_max.toFixed(0) + '°C)', Vmp_tmax.toFixed(1) + ' V', V_mppt_min + ' V MPPT min', Vmp_tmax >= V_mppt_min)}
            ${_limitRow('MPPT input Isc at T_cell_max', Isc_tmax_per_mppt.toFixed(2) + ' A', I_max + ' A max', Isc_tmax_per_mppt <= I_max)}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Array Parameters</div>
        <div class="section-title">At STC (25°C, 1000 W/m²)</div>
        <div class="result-grid">
          ${_rbox(params_stc.string_Voc.toFixed(1) + ' V', 'String Voc')}
          ${_rbox(params_stc.string_Vmp.toFixed(1) + ' V', 'String Vmp')}
          ${_rbox(params_stc.string_Isc.toFixed(2) + ' A', 'String Isc')}
          ${_rbox(params_stc.array_Isc.toFixed(2) + ' A', 'Array Isc (' + total_strings + ' str)')}
          ${_rbox(params_stc.array_Pmax_kW.toFixed(2) + ' kW', 'Total Array Power')}
          ${_rbox(total_kWp.toFixed(2) + ' kWp', 'DC Array (STC)')}
        </div>

        <div class="section-title">At T_min = ${T_min}°C (Highest Voltage)</div>
        <div class="result-grid">
          ${_rbox(params_tmin.string_Voc.toFixed(1) + ' V', 'String Voc')}
          ${_rbox(params_tmin.string_Vmp.toFixed(1) + ' V', 'String Vmp')}
          ${_rbox(params_tmin.array_Pmax_kW.toFixed(2) + ' kW', 'Array Pmax')}
        </div>

        <div class="section-title">At T_cell = ${T_cell_max.toFixed(0)}°C (Worst Power Loss)</div>
        <div class="result-grid">
          ${_rbox(params_tmax.string_Voc.toFixed(1) + ' V', 'String Voc')}
          ${_rbox(params_tmax.string_Vmp.toFixed(1) + ' V', 'String Vmp')}
          ${_rbox(params_tmax.array_Pmax_kW.toFixed(2) + ' kW', 'Array Pmax')}
          ${_rbox(((params_tmax.array_Pmax_kW / params_stc.array_Pmax_kW - 1)*100).toFixed(1) + '%', 'Power Derating')}
        </div>
      </div>

      <div class="card" data-no-print>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" id="sz-print-btn">&#128424; Print Result</button>
        </div>
      </div>
    `;

    const printBtn = resultsDiv.querySelector('#sz-print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (typeof App.printSection === 'function') {
          App.printSection('#sz-results', 'String Sizing Report', container);
          return;
        }
        window.print();
      });
    }

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _limitRow(label, value, limit, pass) {
    const cls = pass ? 'status-ok' : 'status-fault';
    const badge = pass
      ? '<span class="status-badge badge-pass">PASS</span>'
      : '<span class="status-badge badge-fail">FAIL</span>';
    return `<tr class="${cls}"><td>${_esc(label)}</td><td><strong>${_esc(value)}</strong></td><td>${_esc(limit)}</td><td>${badge}</td></tr>`;
  }

  function _rbox(value, label) {
    return `<div class="result-box"><div class="result-value">${_esc(value)}</div><div class="result-label">${_esc(label)}</div></div>`;
  }

  return { render };
})();
