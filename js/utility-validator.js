/**
 * utility-validator.js - Dedicated utility submission package validator screen.
 * Uses HybridSetup utility workflow rules and blocks final package export until PASS.
 */

const UtilityValidator = (() => {
  function _esc(value) {
    if (typeof App !== 'undefined' && App && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _statusBadge(state) {
    const s = String(state || '').toLowerCase();
    if (s === 'pass') return '<span class="status-badge badge-pass">PASS</span>';
    if (s === 'warn') return '<span class="status-badge badge-warn">CHECK</span>';
    if (s === 'na' || s === 'n/a') return '<span class="status-badge badge-warn">N/A</span>';
    return '<span class="status-badge badge-fail">FAIL</span>';
  }

  function _readPatch(container, vm) {
    const patch = {
      exportMode: container.querySelector('#uv-export-mode') ? container.querySelector('#uv-export-mode').value : 'no_export',
      utilityProfile: container.querySelector('#uv-profile') ? container.querySelector('#uv-profile').value : 'offgrid',
      inverterModelId: container.querySelector('#uv-inverter') ? container.querySelector('#uv-inverter').value : '__none__',
    };
    (vm.docs || []).forEach(item => {
      const el = container.querySelector(`#uv-${item.key}`);
      patch[item.key] = !!(el && el.checked);
    });
    (vm.gates || []).forEach(item => {
      const el = container.querySelector(`#uv-${item.key}`);
      patch[item.key] = !!(el && el.checked);
    });
    return patch;
  }

  function _renderPage(container, vm, packState) {
    const us = vm.utilitySubmission || { applicable: false, strictPass: true, checks: [], missingDocuments: [], blockers: [] };
    const gateState = !us.applicable ? 'N/A' : (us.strictPass ? 'PASS' : 'FAIL');
    const gateBadge = _statusBadge(!us.applicable ? 'na' : (us.strictPass ? 'pass' : 'fail'));

    const profileOptions = (vm.profiles || [])
      .map(p => `<option value="${_esc(p.id)}" ${p.id === vm.inputs.utilityProfile ? 'selected' : ''}>${_esc(p.label)}</option>`)
      .join('');

    const inverterOptions = ['<option value="__none__">(Select inverter for strict gate)</option>']
      .concat((vm.inverters || [])
        .map(inv => `<option value="${_esc(inv.id)}" ${inv.id === vm.inputs.inverterModelId ? 'selected' : ''}>${_esc(inv.manufacturer)} ${_esc(inv.model)} (${_esc(inv.acRated_kW)}kW)</option>`))
      .join('');

    const docChecks = (vm.docs || []).map(item => `
      <label class="checkbox-item ${item.checked ? 'checked' : ''}">
        <input type="checkbox" id="uv-${_esc(item.key)}" ${item.checked ? 'checked' : ''} />
        <span>${_esc(item.label)}</span>
      </label>
      <div class="form-hint">${_esc(item.note || '')}</div>
    `).join('');

    const gateChecks = (vm.gates || []).map(item => `
      <label class="checkbox-item ${item.checked ? 'checked' : ''}">
        <input type="checkbox" id="uv-${_esc(item.key)}" ${item.checked ? 'checked' : ''} />
        <span>${_esc(item.label)}</span>
      </label>
      <div class="form-hint">${_esc(item.note || '')}</div>
    `).join('');

    const rows = (us.checks || []).map(ch => `
      <tr>
        <td><strong>${_esc(ch.check)}</strong></td>
        <td>${_esc(ch.value)}</td>
        <td>${_esc(ch.target)}</td>
        <td>${_statusBadge(ch.status)}</td>
        <td>${_esc(ch.note || '')}</td>
      </tr>
    `).join('');

    const blockersHtml = (us.blockers && us.blockers.length)
      ? `<div class="warn-box"><strong>Blockers:</strong> ${_esc(us.blockers.join(' | '))}</div>`
      : '<div class="info-box">No utility submission blockers.</div>';

    const missingHtml = (us.missingDocuments && us.missingDocuments.length)
      ? `<div class="warn-box"><strong>Missing documents:</strong> ${_esc(us.missingDocuments.join(' | '))}</div>`
      : '<div class="info-box">All required submission documents are marked as provided.</div>';

    const packReadyLabel = packState.ready ? 'READY' : 'BLOCKED';
    const packReadyBadge = _statusBadge(packState.ready ? 'pass' : 'fail');
    const packHint = packState.ready
      ? 'Final project-pack export is enabled.'
      : (!packState.resultReady
        ? 'Run Hybrid Setup calculation first, then return here.'
        : (packState.gateReason || 'Utility strict gate must be PASS.'));

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128221; Utility Submission Package Validator</div>
        <div class="card">
          <div class="card-title">Workflow Scope</div>
          <div class="info-box">Auto-checks CEB/LECO submission documents and release gates. Final project-pack export is blocked until strict gate = PASS.</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Export Mode</label>
              <select class="form-select" id="uv-export-mode">
                <option value="no_export" ${vm.inputs.exportMode === 'no_export' ? 'selected' : ''}>No Export</option>
                <option value="export" ${vm.inputs.exportMode === 'export' ? 'selected' : ''}>Export Enabled</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Utility Profile</label>
              <select class="form-select" id="uv-profile">${profileOptions}</select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Inverter Model (for strict utility gate)</label>
              <select class="form-select" id="uv-inverter">${inverterOptions}</select>
            </div>
          </div>
          <div class="form-hint" id="uv-hint">${_esc(vm.summaryHint || '')}</div>
        </div>

        <div class="card">
          <div class="card-title">Required Submission Documents</div>
          <div class="checkbox-grid">${docChecks}</div>
        </div>

        <div class="card">
          <div class="card-title">Commissioning / Release Gates</div>
          <div class="checkbox-grid">${gateChecks}</div>
        </div>

        <div class="card">
          <div class="card-title">Validation Status</div>
          <div class="info-box">Strict gate: ${gateBadge} <span style="margin-left:8px">State: ${_esc(gateState)}</span> <span style="margin-left:8px">Docs ${_esc(us.docProvided || 0)}/${_esc(us.docTotal || 0)}</span></div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead><tr><th>Requirement</th><th>Current</th><th>Target</th><th>Status</th><th>Engineering Note</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5">No checks available</td></tr>'}</tbody>
            </table>
          </div>
          ${missingHtml}
          ${blockersHtml}
        </div>

        <div class="card">
          <div class="card-title">Final Package Gate</div>
          <div class="info-box">Release state: ${packReadyBadge} <span style="margin-left:8px">${_esc(packReadyLabel)}</span></div>
          <div class="form-hint">${_esc(packHint)}</div>
          <div class="btn-group" style="margin-top:10px">
            <button class="btn btn-primary btn-sm" id="uv-run-btn">Run Validator</button>
            <button class="btn btn-secondary btn-sm" id="uv-open-hybrid-btn">Open Hybrid Setup</button>
            <button class="btn btn-success btn-sm" id="uv-export-zip-btn" ${packState.ready ? '' : 'disabled'}>Generate Final Export Package ZIP</button>
            <button class="btn btn-secondary btn-sm" id="uv-export-json-btn" ${packState.ready ? '' : 'disabled'}>Export Final Package JSON</button>
          </div>
        </div>
      </div>
    `;
  }

  async function _refresh(container, toastLevel) {
    if (!container) return;
    if (typeof HybridSetup === 'undefined' || !HybridSetup) {
      container.innerHTML = '<div class="page"><div class="page-title">Utility Submission Package Validator</div><div class="warn-box">Hybrid module unavailable.</div></div>';
      return;
    }
    if (typeof HybridSetup.ensureCatalogLoaded === 'function') {
      await HybridSetup.ensureCatalogLoaded();
    }
    const vm = (typeof HybridSetup.getUtilitySubmissionViewModel === 'function')
      ? HybridSetup.getUtilitySubmissionViewModel()
      : null;
    const packState = (typeof HybridSetup.getFinalProjectPackState === 'function')
      ? HybridSetup.getFinalProjectPackState()
      : { ready: false, resultReady: false, strictPass: false, gateReason: 'Final package gate unavailable.' };
    if (!vm) {
      container.innerHTML = '<div class="page"><div class="page-title">Utility Submission Package Validator</div><div class="warn-box">Utility validator API unavailable.</div></div>';
      return;
    }

    _renderPage(container, vm, packState);

    const applyState = async (showToast) => {
      if (typeof HybridSetup.updateUtilitySubmissionState === 'function') {
        HybridSetup.updateUtilitySubmissionState(_readPatch(container, vm));
      }
      await _refresh(container);
      if (showToast) {
        const latest = typeof HybridSetup.getFinalProjectPackState === 'function' ? HybridSetup.getFinalProjectPackState() : { strictPass: false };
        App.toast(latest.strictPass ? 'Utility submission gate PASS' : 'Utility submission gate FAIL', latest.strictPass ? 'success' : 'warning');
      }
    };

    container.querySelectorAll('input[type="checkbox"], select').forEach(el => {
      el.addEventListener('change', () => { void applyState(false); });
    });

    const runBtn = container.querySelector('#uv-run-btn');
    if (runBtn) runBtn.addEventListener('click', () => { void applyState(true); });

    const openHybridBtn = container.querySelector('#uv-open-hybrid-btn');
    if (openHybridBtn) {
      openHybridBtn.addEventListener('click', () => {
        if (typeof App !== 'undefined' && App && typeof App.navigate === 'function') App.navigate('hybrid');
      });
    }

    const exportZipBtn = container.querySelector('#uv-export-zip-btn');
    if (exportZipBtn) {
      exportZipBtn.addEventListener('click', async () => {
        await applyState(false);
        if (typeof HybridSetup.exportFinalProjectPack === 'function') {
          await HybridSetup.exportFinalProjectPack('zip');
        }
      });
    }

    const exportJsonBtn = container.querySelector('#uv-export-json-btn');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        await applyState(false);
        if (typeof HybridSetup.exportFinalProjectPack === 'function') {
          await HybridSetup.exportFinalProjectPack('json');
        }
      });
    }

    if (toastLevel === 'loaded') {
      const cat = vm.catalog || {};
      if (cat.loadError) App.toast(`Validator loaded with catalog warning: ${cat.loadError}`, 'warning');
    }
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = '<div class="loading-screen"><div class="loading-icon">&#9881;</div><div>Loading utility validator...</div></div>';
    _refresh(container, 'loaded').catch(err => {
      container.innerHTML = `<div class="page"><div class="page-title">Utility Submission Package Validator</div><div class="warn-box">${_esc(err && err.message ? err.message : 'Failed to load validator')}</div></div>`;
    });
  }

  return { render };
})();

