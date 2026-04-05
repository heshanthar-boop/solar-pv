/**
 * field-test.js — Field Test vs STC Comparison
 * Enter measured Voc/Isc per string + site conditions.
 * Corrects to STC, compares to datasheet, pass/fail per string.
 */

const FieldTest = (() => {
  let _strings = [];
  let _panel = null;

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${p.id}">${p.manufacturer} ${p.model} (${p.Pmax}W)</option>`
    ).join('');

    // Pre-fill from sizing result if available
    const sr = App.state.sizingResult;
    const defNmod = sr ? sr.n_mod : 20;
    const defPanelId = sr ? sr.panel.id : '';

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
              <input class="form-input" id="ft-nmod" type="number" value="${defNmod}" />
            </div>
            <div class="form-group">
              <label class="form-label">Irradiance (W/m²)</label>
              <input class="form-input" id="ft-irr" type="number" value="900" />
              <div class="form-hint">From reference cell / pyranometer</div>
            </div>
            <div class="form-group">
              <label class="form-label">Module Temp (°C)</label>
              <input class="form-input" id="ft-tmod" type="number" value="55" />
              <div class="form-hint">Back-of-panel IR or Pt100</div>
            </div>
            <div class="form-group">
              <label class="form-label">Test Date</label>
              <input class="form-input" id="ft-date" type="date" value="${new Date().toISOString().slice(0,10)}" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">String Measurements</div>
          <div id="ft-string-list"></div>
          <div class="btn-group" style="margin-top:8px">
            <button class="btn btn-secondary btn-sm" id="ft-add-btn">+ Add String</button>
            <button class="btn btn-secondary btn-sm" id="ft-bulk-btn">+ Bulk Add</button>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="ft-compare-btn" style="margin-bottom:12px">Compare All to STC</button>

        <div id="ft-results" class="hidden"></div>
      </div>
    `;

    // Pre-select panel
    if (defPanelId) {
      container.querySelector('#ft-panel').value = defPanelId;
      _panel = DB.getById(defPanelId);
    }

    container.querySelector('#ft-panel').addEventListener('change', e => {
      _panel = DB.getById(e.target.value) || null;
    });

    // Init with 2 empty strings
    _strings = [];
    _addString();
    _addString();
    _renderStringList(container);

    container.querySelector('#ft-add-btn').addEventListener('click', () => {
      _addString();
      _renderStringList(container);
    });

    container.querySelector('#ft-bulk-btn').addEventListener('click', () => {
      const n = parseInt(prompt('How many strings to add?', '10'));
      if (!isNaN(n) && n > 0) {
        for (let i = 0; i < n; i++) _addString();
        _renderStringList(container);
      }
    });

    container.querySelector('#ft-compare-btn').addEventListener('click', () => _compare(container));
  }

  function _addString() {
    _strings.push({
      label: 'String ' + (_strings.length + 1),
      Voc: '',
      Isc: ''
    });
  }

  function _renderStringList(container) {
    const list = container.querySelector('#ft-string-list');
    if (!_strings.length) {
      list.innerHTML = `<div class="text-muted text-sm">No strings added yet.</div>`;
      return;
    }
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
        <tbody id="ft-tbody">
          ${_strings.map((s, i) => `
            <tr>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" data-idx="${i}" data-field="label" value="${s.label}" /></td>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" type="number" step="0.1" data-idx="${i}" data-field="Voc" value="${s.Voc}" placeholder="V" /></td>
              <td><input class="form-input" style="padding:6px 8px;font-size:0.82rem" type="number" step="0.01" data-idx="${i}" data-field="Isc" value="${s.Isc}" placeholder="A" /></td>
              <td><button class="btn btn-danger btn-sm" style="padding:4px 8px" data-del="${i}">&#10005;</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    list.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        _strings[inp.dataset.idx][inp.dataset.field] = inp.value;
      });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        _strings.splice(parseInt(btn.dataset.del), 1);
        _renderStringList(container);
      });
    });
  }

  function _compare(container) {
    const panelId = container.querySelector('#ft-panel').value;
    if (!panelId) { App.toast('Select a panel first', 'error'); return; }
    _panel = DB.getById(panelId);
    if (!_panel) return;

    const n_mod = parseInt(container.querySelector('#ft-nmod').value) || 20;
    const G     = parseFloat(container.querySelector('#ft-irr').value) || 900;
    const T_mod = parseFloat(container.querySelector('#ft-tmod').value) || 55;

    const results = _strings.map(s => {
      const Voc = parseFloat(s.Voc);
      const Isc = parseFloat(s.Isc);
      if (isNaN(Voc) || isNaN(Isc)) return { label: s.label, skipped: true };
      return {
        label: s.label,
        ...PVCalc.fieldTestString(_panel, Voc, Isc, T_mod, G, n_mod)
      };
    }).filter(r => !r.skipped);

    if (!results.length) { App.toast('No valid measurements to compare', 'error'); return; }

    const passAll = results.every(r => r.passVoc && r.passIsc);
    const failCount = results.filter(r => !r.passVoc || !r.passIsc).length;

    // Build tab-separated copy text for WhatsApp/notes
    const copyLines = [
      `String\tVoc Meas\tVoc Corr\tVoc DS\tVoc Dev%\tVoc P/F\tIsc Meas\tIsc Corr\tIsc DS\tIsc Dev%\tIsc P/F`,
      ...results.map(r =>
        `${r.label}\t${r.Voc_meas.toFixed(1)}\t${r.Voc_corrected.toFixed(1)}\t${r.Voc_expected.toFixed(1)}\t${r.devVoc.toFixed(2)}%\t${r.passVoc?'PASS':'FAIL'}\t${r.Isc_meas.toFixed(2)}\t${r.Isc_corrected.toFixed(2)}\t${r.Isc_expected.toFixed(2)}\t${r.devIsc.toFixed(2)}%\t${r.passIsc?'PASS':'FAIL'}`
      )
    ].join('\n');

    // Save for reports
    App.state.fieldTestResults = { panel: _panel, n_mod, G, T_mod, results, date: container.querySelector('#ft-date').value };

    const resultsDiv = container.querySelector('#ft-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="result-box ${passAll ? 'alert-safe' : 'alert-unsafe'}" style="margin-bottom:12px">
          <div class="result-value">${passAll ? '&#10003; ALL PASS' : `&#9888; ${failCount} STRING${failCount>1?'S':''} FAIL`}</div>
          <div class="result-label">${results.length} strings tested &bull; Corrected to STC &bull; G=${G} W/m², T_mod=${T_mod}°C</div>
        </div>

        <div class="info-box">
          Pass criteria: Voc ±3% of datasheet STC &bull; Isc ±5% of datasheet STC
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
                const vocBadge = r.passVoc
                  ? `<span class="status-badge badge-pass">PASS</span>`
                  : `<span class="status-badge badge-fail">FAIL</span>`;
                const iscBadge = r.passIsc
                  ? `<span class="status-badge badge-pass">PASS</span>`
                  : `<span class="status-badge badge-fail">FAIL</span>`;
                const vocDevCls = !r.passVoc ? 'text-danger fw-bold' : '';
                const iscDevCls = !r.passIsc ? 'text-danger fw-bold' : '';
                return `
                  <tr class="${rowCls}">
                    <td><strong>${r.label}</strong></td>
                    <td>${r.Voc_meas.toFixed(1)}</td>
                    <td>${r.Voc_corrected.toFixed(1)}</td>
                    <td>${r.Voc_expected.toFixed(1)}</td>
                    <td class="${vocDevCls}">${(r.devVoc>=0?'+':'')}${r.devVoc.toFixed(2)}% ${vocBadge}</td>
                    <td>${r.Isc_meas.toFixed(2)}</td>
                    <td>${r.Isc_corrected.toFixed(2)}</td>
                    <td>${r.Isc_expected.toFixed(2)}</td>
                    <td class="${iscDevCls}">${(r.devIsc>=0?'+':'')}${r.devIsc.toFixed(2)}% ${iscBadge}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="btn-group" style="margin-top:12px">
          <button class="btn btn-secondary btn-sm" id="ft-copy-btn">&#128203; Copy as Text</button>
        </div>
      </div>
    `;

    resultsDiv.querySelector('#ft-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(copyLines).then(() => App.toast('Copied to clipboard', 'success'));
    });

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
