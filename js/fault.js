/**
 * fault.js - String Fault Checker
 * Input measured Voc/Isc for multiple strings.
 * Auto-detect: open, short, bypass diode, shading, mismatch.
 * Reads App.state.sizingResult for expected values if available.
 */

const FaultChecker = (() => {
  let _strings = [];

  function _esc(value) {
    if (typeof App !== 'undefined' && App && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
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

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p => {
      const optionText = `${p.manufacturer || ''} ${p.model || ''} (${p.Pmax || ''}W)`.trim();
      return `<option value="${_esc(p.id)}">${_esc(optionText)}</option>`;
    }).join('');

    // Pre-fill from sizing result
    const sr = App.state.sizingResult;
    const defPanelId = sr ? String(sr.panel.id || '') : '';
    const defNmod = sr ? Number(sr.n_mod || 20) : 20;
    const defVocExp = sr ? (Number(sr.panel.Voc || 0) * Number(sr.n_mod || 0)).toFixed(1) : '';
    const defIscExp = sr ? Number(sr.panel.Isc || 0).toFixed(2) : '';
    const srInfo = sr
      ? `<div class="info-box">Pre-filled from Sizing Calculator: ${_esc(sr.panel.manufacturer)} ${_esc(sr.panel.model)}, ${_esc(sr.n_mod)} mod/string.</div>`
      : '';

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9888; String Fault Checker</div>

        <div class="card">
          <div class="card-title">Reference Configuration</div>
          ${srInfo}
          <div class="form-group">
            <label class="form-label">Module</label>
            <select class="form-select" id="fc-panel">
              <option value="">-- Select Panel --</option>
              ${panelOptions}
            </select>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Modules per String</label>
              <input class="form-input" id="fc-nmod" type="number" value="${_esc(defNmod)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Expected String Voc (V)</label>
              <input class="form-input" id="fc-voc-exp" type="number" step="0.1" value="${_esc(defVocExp)}" />
              <div class="form-hint">STC: n_mod x panel Voc. Leave blank to auto-calc.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Expected Isc (A)</label>
              <input class="form-input" id="fc-isc-exp" type="number" step="0.01" value="${_esc(defIscExp)}" />
              <div class="form-hint">Panel datasheet Isc</div>
            </div>
            <div class="form-group">
              <label class="form-label">Test Date</label>
              <input class="form-input" id="fc-date" type="date" value="${_localDateISO()}" />
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="fc-autofill-btn">Auto-fill from Panel</button>
        </div>

        <div class="card">
          <div class="card-title">String Measurements</div>
          <div id="fc-string-list"></div>
          <div class="btn-group" style="margin-top:8px">
            <button class="btn btn-secondary btn-sm" id="fc-add-btn">+ Add String</button>
            <button class="btn btn-secondary btn-sm" id="fc-bulk-btn">+ Bulk Add</button>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="fc-detect-btn" style="margin-bottom:12px">Detect Faults</button>

        <div id="fc-results" class="hidden"></div>
      </div>
    `;

    if (defPanelId) container.querySelector('#fc-panel').value = defPanelId;

    // Init with default strings
    _strings = [];
    for (let i = 0; i < 4; i++) _addString();
    _renderList(container);

    container.querySelector('#fc-add-btn').addEventListener('click', () => {
      _addString();
      _renderList(container);
    });

    container.querySelector('#fc-bulk-btn').addEventListener('click', () => {
      const n = parseInt(prompt('How many strings to add?', '8'), 10);
      if (!isNaN(n) && n > 0) {
        for (let i = 0; i < n; i++) _addString();
        _renderList(container);
      }
    });

    container.querySelector('#fc-autofill-btn').addEventListener('click', () => _autofill(container));
    container.querySelector('#fc-panel').addEventListener('change', () => _autofill(container));
    container.querySelector('#fc-detect-btn').addEventListener('click', () => _detect(container));
  }

  function _addString() {
    _strings.push({ label: `String ${_strings.length + 1}`, Voc: '', Isc: '' });
  }

  function _autofill(container) {
    const id = container.querySelector('#fc-panel').value;
    if (!id) return;
    const panel = DB.getById(id);
    if (!panel) return;
    const n = parseInt(container.querySelector('#fc-nmod').value, 10) || 20;
    container.querySelector('#fc-voc-exp').value = (panel.Voc * n).toFixed(1);
    container.querySelector('#fc-isc-exp').value = panel.Isc.toFixed(2);
  }

  function _renderList(container) {
    const list = container.querySelector('#fc-string-list');
    list.innerHTML = `
      <table class="status-table">
        <thead>
          <tr>
            <th style="width:110px">Label</th>
            <th>Voc (V)</th>
            <th>Isc (A)</th>
            <th style="width:36px"></th>
          </tr>
        </thead>
        <tbody>
          ${_strings.map((s, i) => `
            <tr>
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
      inp.addEventListener('input', () => { _strings[inp.dataset.idx][inp.dataset.field] = inp.value; });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        _strings.splice(parseInt(btn.dataset.del, 10), 1);
        _renderList(container);
      });
    });
  }

  function _detect(container) {
    const panelId = container.querySelector('#fc-panel').value;
    const panel = panelId ? DB.getById(panelId) : null;

    const n_mod = parseInt(container.querySelector('#fc-nmod').value, 10) || 20;
    const Voc_exp = parseFloat(container.querySelector('#fc-voc-exp').value);
    const Isc_exp = parseFloat(container.querySelector('#fc-isc-exp').value);

    if (isNaN(Voc_exp) || isNaN(Isc_exp)) {
      App.toast('Enter expected Voc and Isc values', 'error');
      return;
    }

    const results = _strings.map(s => {
      const Voc = parseFloat(s.Voc);
      const Isc = parseFloat(s.Isc);
      if (isNaN(Voc) || isNaN(Isc)) return { label: s.label, skipped: true };
      const fault = PVCalc.detectFault(
        Voc,
        Isc,
        Voc_exp,
        Isc_exp,
        n_mod,
        panel || { Voc: Voc_exp / n_mod, Isc: Isc_exp }
      );
      return { label: s.label, Voc, Isc, ...fault };
    });

    const valid = results.filter(r => !r.skipped);
    if (!valid.length) {
      App.toast('No valid measurements entered', 'error');
      return;
    }

    const faultCount = valid.filter(r => r.severity === 'fault').length;
    const warnCount = valid.filter(r => r.severity === 'warning').length;
    const okCount = valid.filter(r => r.severity === 'ok').length;

    const overallCls = faultCount > 0 ? 'alert-unsafe' : warnCount > 0 ? 'alert-warn' : 'alert-safe';
    const overallTxt = faultCount > 0
      ? `&#9888; ${faultCount} FAULT${faultCount > 1 ? 'S' : ''}`
      : warnCount > 0
        ? `&#9888; ${warnCount} WARNING${warnCount > 1 ? 'S' : ''}`
        : '&#10003; ALL OK';

    const rowMap = { ok: '', warning: 'status-warning', fault: 'status-fault' };
    const badgeMap = {
      ok: '<span class="status-badge badge-ok">OK</span>',
      warning: '<span class="status-badge badge-warn">WARN</span>',
      fault: '<span class="status-badge badge-fault">FAULT</span>'
    };

    App.state.faultCheckResults = {
      panel,
      n_mod,
      Voc_exp,
      Isc_exp,
      date: (container.querySelector('#fc-date') && container.querySelector('#fc-date').value) || _localDateISO(),
      results
    };

    const resultsDiv = container.querySelector('#fc-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="result-box ${overallCls}" style="margin-bottom:12px">
          <div class="result-value">${overallTxt}</div>
          <div class="result-label">${valid.length} strings &bull; ${okCount} OK &bull; ${warnCount} Warning &bull; ${faultCount} Fault</div>
        </div>

        <div style="overflow-x:auto">
          <table class="status-table">
            <thead>
              <tr>
                <th>String</th>
                <th>Voc (V)</th>
                <th>Voc%</th>
                <th>Isc (A)</th>
                <th>Isc%</th>
                <th>Status</th>
                <th>Fault Type</th>
              </tr>
            </thead>
            <tbody>
              ${results.map(r => {
                if (r.skipped) {
                  return `<tr><td><em>${_esc(r.label)}</em></td><td colspan="6" class="text-muted">- no data -</td></tr>`;
                }
                const vPct = (r.Voc / Voc_exp * 100).toFixed(1);
                const iPct = (r.Isc / Isc_exp * 100).toFixed(1);
                const vCls = parseFloat(vPct) < 80 ? 'text-danger fw-bold' : parseFloat(vPct) < 96 ? 'text-warning fw-bold' : '';
                const iCls = parseFloat(iPct) < 90 ? 'text-warning fw-bold' : '';
                const severity = rowMap[r.severity] || '';
                const badge = badgeMap[r.severity] || '';
                return `
                  <tr class="${severity}">
                    <td><strong>${_esc(r.label)}</strong></td>
                    <td>${r.Voc.toFixed(1)}</td>
                    <td class="${vCls}">${vPct}%</td>
                    <td>${r.Isc.toFixed(2)}</td>
                    <td class="${iCls}">${iPct}%</td>
                    <td>${badge}</td>
                    <td style="font-size:0.78rem">${_esc(r.fault || '')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="section-title">Fault Details</div>
        ${valid.filter(r => r.severity !== 'ok').map(r => `
          <div class="${r.severity === 'fault' ? 'danger-box' : 'info-box'}" style="margin-bottom:8px">
            <strong>${_esc(r.label)} - ${_esc(r.fault || '')}</strong><br>
            <span style="font-size:0.82rem">${_esc(r.detail || '')}</span>
          </div>
        `).join('') || '<div class="info-box">No faults detected in all strings.</div>'}

        <div class="info-box mt-8" style="font-size:0.78rem">
          Expected: Voc = ${Voc_exp.toFixed(1)} V &bull; Isc = ${Isc_exp.toFixed(2)} A &bull; ${n_mod} modules/string
        </div>

        <div class="btn-group" style="margin-top:12px">
          <button class="btn btn-secondary btn-sm" id="fc-print-btn">&#128424; Print</button>
          <button class="btn btn-secondary btn-sm" id="fc-csv-btn">&#128190; Export CSV</button>
          <button class="btn btn-success btn-sm" id="fc-pdf-btn">&#128196; Export PDF</button>
        </div>
      </div>
    `;

    resultsDiv.querySelector('#fc-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#fc-results', 'String Fault Checker Report', container);
        return;
      }
      window.print();
    });

    resultsDiv.querySelector('#fc-csv-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.downloadFaultCSV !== 'function') {
        App.toast('CSV export not available', 'error');
        return;
      }
      Reports.downloadFaultCSV(App.state.faultCheckResults);
    });

    resultsDiv.querySelector('#fc-pdf-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.generateFault !== 'function') {
        App.toast('PDF export not available', 'error');
        return;
      }
      Reports.generateFault(App.state.faultCheckResults);
    });

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
