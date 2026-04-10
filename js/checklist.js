/**
 * checklist.js — Pre-Energisation Commissioning Checklist
 * Configurable per system type. Timestamped sign-off. PDF export.
 * IEC 62446-1 / PUCSL guideline aligned.
 */

const Checklist = (() => {
  const STORAGE_KEY = 'solarpv_checklists_v1';

  function _esc(v) {
    return typeof App !== 'undefined' ? App.escapeHTML(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // -----------------------------------------------------------------------
  // CHECKLIST DEFINITIONS
  // -----------------------------------------------------------------------

  const SECTIONS = {
    dc: {
      label: 'DC Array & Wiring',
      icon: '☀',
      items: [
        { id: 'dc_module_clean',     text: 'Modules clean, undamaged, no cracks or delamination' },
        { id: 'dc_module_labelled',  text: 'All modules and strings clearly labelled' },
        { id: 'dc_mounting_secure',  text: 'Mounting structure secure, bolts torqued, anti-corrosion applied' },
        { id: 'dc_tilt_verified',    text: 'Array tilt and orientation matches design' },
        { id: 'dc_cable_uv',         text: 'DC cables UV-rated, no physical damage or kinks' },
        { id: 'dc_cable_routing',    text: 'DC cables routed away from sharp edges, conduit secured' },
        { id: 'dc_connectors_mc4',   text: 'MC4 connectors fully seated, no exposed conductors' },
        { id: 'dc_polarity_verified',text: 'String polarity verified before inverter connection' },
        { id: 'dc_voc_measured',     text: 'String Voc measured and within ±5% of STC-corrected value' },
        { id: 'dc_isc_measured',     text: 'String Isc measured and within ±10% of STC-corrected value' },
        { id: 'dc_ir_pass',          text: 'DC insulation resistance ≥1 MΩ (IEC 62446-1)' },
        { id: 'dc_spd_installed',    text: 'DC surge protection device (SPD) installed and rated correctly' },
        { id: 'dc_fuses_rated',      text: 'String fuses / combiner box rated per design, installed correctly' },
        { id: 'dc_earthing',         text: 'Array frame earthing complete, continuity <1 Ω' },
        { id: 'dc_disconnect',       text: 'DC isolator / disconnect switch installed, operates correctly' },
      ]
    },
    inverter: {
      label: 'Inverter & Protection',
      icon: '⚡',
      items: [
        { id: 'inv_mounting',        text: 'Inverter mounted on non-combustible surface, ventilation clearance maintained' },
        { id: 'inv_cable_entry',     text: 'Cable entry glands sealed, no exposed conductors at terminals' },
        { id: 'inv_dc_input_check',  text: 'DC input voltage within inverter rated range (check Voc vs max input)' },
        { id: 'inv_settings_loaded', text: 'Grid profile settings programmed (CEB/LECO voltage, frequency, reconnect delay)' },
        { id: 'inv_anti_islanding',  text: 'Anti-islanding protection verified or confirmed per inverter spec' },
        { id: 'inv_display_ok',      text: 'Inverter display shows normal startup, no fault codes' },
        { id: 'inv_ac_breaker',      text: 'AC output breaker / disconnect rated and installed' },
        { id: 'inv_export_limit',    text: 'Export limit set if required by utility approval' },
        { id: 'inv_label',           text: 'Inverter data label visible, serial number recorded' },
      ]
    },
    ac: {
      label: 'AC & Grid Connection',
      icon: '🔌',
      items: [
        { id: 'ac_cable_sized',      text: 'AC output cable sized per wire calculation, rated for full AC current' },
        { id: 'ac_mcb_rated',        text: 'Dedicated MCB in consumer unit rated correctly, labelled "Solar PV"' },
        { id: 'ac_rcd_present',      text: 'RCD / ELCB present on AC circuit as required' },
        { id: 'ac_spd_installed',    text: 'AC surge protection device installed at DB entry' },
        { id: 'ac_earthing',         text: 'AC system earthing connected, earth electrode resistance measured' },
        { id: 'ac_voltage_measure',  text: 'AC output voltage and frequency within CEB/LECO limits' },
        { id: 'ac_power_factor',     text: 'Power factor verified ≥0.95 at rated output (if required)' },
        { id: 'ac_meter_installed',  text: 'Bi-directional/export energy meter installed and connected' },
        { id: 'ac_isolation_test',   text: 'AC side insulation resistance confirmed before energisation' },
      ]
    },
    hybrid: {
      label: 'Battery & Hybrid',
      icon: '🔋',
      items: [
        { id: 'bat_mounting',        text: 'Battery rack/enclosure secure, ventilated, protected from direct sunlight' },
        { id: 'bat_soc_initial',     text: 'Battery initial SOC confirmed before commissioning' },
        { id: 'bat_bms_online',      text: 'BMS communicating with inverter, no fault codes' },
        { id: 'bat_cable_size',      text: 'Battery cables sized for peak discharge current, fused correctly' },
        { id: 'bat_polarity',        text: 'Battery polarity verified before connection' },
        { id: 'bat_temp_sensor',     text: 'Battery temperature sensor installed and reading correctly' },
        { id: 'bat_charge_params',   text: 'Charge voltage and current limits set per battery spec' },
        { id: 'bat_discharge_cut',   text: 'Low SOC cutoff and reconnect thresholds programmed' },
        { id: 'bat_mode_set',        text: 'Operating mode set (self-consumption / backup / TOU) and verified' },
      ]
    },
    documentation: {
      label: 'Documentation & Sign-Off',
      icon: '📋',
      items: [
        { id: 'doc_design_on_site',  text: 'As-built drawings or design documents available on site' },
        { id: 'doc_serial_numbers',  text: 'All module and inverter serial numbers recorded' },
        { id: 'doc_test_results',    text: 'Field test results (Voc, Isc, IR, PR) recorded in test log' },
        { id: 'doc_photos_taken',    text: 'Site photos taken: array, inverter, DB, earthing, labels' },
        { id: 'doc_utility_approval',text: 'Utility approval / NIC certificate available if grid-tie' },
        { id: 'doc_warranty_cards',  text: 'Module and inverter warranty cards / registration completed' },
        { id: 'doc_client_handover', text: 'Client handover: operation manual, emergency isolation explained' },
        { id: 'doc_monitoring_setup',text: 'Monitoring app/portal configured, client access verified' },
      ]
    }
  };

  const SYSTEM_TYPE_SECTIONS = {
    'grid-tie':    ['dc', 'inverter', 'ac', 'documentation'],
    'hybrid':      ['dc', 'inverter', 'ac', 'hybrid', 'documentation'],
    'off-grid':    ['dc', 'inverter', 'hybrid', 'documentation'],
    'ground-mount':['dc', 'inverter', 'ac', 'documentation'],
  };

  // -----------------------------------------------------------------------
  // STORAGE
  // -----------------------------------------------------------------------

  function _loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  function _saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function _newChecklist(systemType) {
    const proj = typeof App !== 'undefined' && typeof App.getProject === 'function' ? App.getProject() : {};
    const settings = (() => { try { return JSON.parse(localStorage.getItem('solarpv_settings') || '{}'); } catch { return {}; } })();
    const sectionKeys = SYSTEM_TYPE_SECTIONS[systemType] || SYSTEM_TYPE_SECTIONS['grid-tie'];
    const items = {};
    sectionKeys.forEach(sk => {
      SECTIONS[sk].items.forEach(item => {
        items[item.id] = { checked: false, note: '', ts: null };
      });
    });
    return {
      id: 'ck_' + Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      systemType,
      projectName: proj.name || '',
      client: proj.client || '',
      siteAddress: proj.siteAddress || '',
      systemKwp: proj.systemKwp || '',
      engineer: settings.inspectorName || '',
      company: settings.company || '',
      date: typeof App !== 'undefined' ? App.localDateISO() : new Date().toISOString().slice(0, 10),
      items
    };
  }

  function _saveChecklist(ck) {
    ck.updatedAt = new Date().toISOString();
    const list = _loadAll();
    const idx = list.findIndex(c => c.id === ck.id);
    if (idx >= 0) list[idx] = ck;
    else list.unshift(ck);
    _saveAll(list);
  }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  let _current = null;
  let _saveTimer = null;

  function _debounceSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { if (_current) _saveChecklist(_current); }, 1000);
  }

  function render(container) {
    const list = _loadAll();
    if (!_current) {
      container.innerHTML = _renderListView(list);
      _bindListEvents(container);
    } else {
      container.innerHTML = _renderChecklistView(_current);
      _bindChecklistEvents(container);
    }
  }

  function _renderListView(list) {
    const proj = typeof App !== 'undefined' && typeof App.getProject === 'function' ? App.getProject() : {};
    const recentRows = list.slice(0, 8).map(ck => {
      const sectionKeys = SYSTEM_TYPE_SECTIONS[ck.systemType] || [];
      const totalItems = sectionKeys.reduce((n, sk) => n + (SECTIONS[sk] ? SECTIONS[sk].items.length : 0), 0);
      const checkedItems = Object.values(ck.items || {}).filter(v => v && v.checked).length;
      const pct = totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0;
      return `
        <tr>
          <td><strong>${_esc(ck.projectName || 'Untitled')}</strong><br><span class="text-muted" style="font-size:0.75rem">${_esc(ck.date)} &bull; ${_esc(ck.systemType)}</span></td>
          <td>${_esc(ck.engineer || '-')}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="ck-progress-bar"><div class="ck-progress-fill" style="width:${pct}%"></div></div>
              <span style="font-size:0.8rem;font-weight:700;min-width:36px">${pct}%</span>
            </div>
          </td>
          <td><button class="btn btn-sm btn-secondary ck-open-btn" data-id="${_esc(ck.id)}">Open</button></td>
        </tr>`;
    }).join('');

    const typeOptions = Object.keys(SYSTEM_TYPE_SECTIONS).map(k =>
      `<option value="${k}" ${(proj.systemType || 'grid-tie') === k ? 'selected' : ''}>${k.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`
    ).join('');

    return `
      <div class="page">
        <div class="page-title">&#9989; Commissioning Checklist</div>
        <div class="card">
          <div class="card-title">New Checklist</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">System Type</label>
              <select class="form-select" id="ck-new-type">${typeOptions}</select>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end">
              <button class="btn btn-primary btn-block" id="ck-new-btn">+ New Checklist</button>
            </div>
          </div>
        </div>
        ${list.length ? `
        <div class="card">
          <div class="card-title">Saved Checklists</div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead><tr><th>Project</th><th>Engineer</th><th>Progress</th><th></th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
          ${list.length > 8 ? `<div class="text-muted mt-8" style="font-size:0.8rem">Showing 8 of ${list.length} checklists.</div>` : ''}
        </div>` : ''}
      </div>`;
  }

  function _bindListEvents(container) {
    const newBtn = container.querySelector('#ck-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        const type = container.querySelector('#ck-new-type').value;
        _current = _newChecklist(type);
        render(container);
      });
    }
    container.querySelectorAll('.ck-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const list = _loadAll();
        const found = list.find(c => c.id === id);
        if (found) { _current = found; render(container); }
      });
    });
  }

  function _renderChecklistView(ck) {
    const sectionKeys = SYSTEM_TYPE_SECTIONS[ck.systemType] || SYSTEM_TYPE_SECTIONS['grid-tie'];
    const totalItems = sectionKeys.reduce((n, sk) => n + SECTIONS[sk].items.length, 0);
    const checkedItems = Object.values(ck.items || {}).filter(v => v && v.checked).length;
    const pct = totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0;
    const allDone = checkedItems === totalItems;

    const sectionsHtml = sectionKeys.map(sk => {
      const sec = SECTIONS[sk];
      const secChecked = sec.items.filter(item => ck.items[item.id] && ck.items[item.id].checked).length;
      const itemsHtml = sec.items.map(item => {
        const state = ck.items[item.id] || { checked: false, note: '', ts: null };
        const tsText = state.ts ? new Date(state.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="ck-item ${state.checked ? 'ck-item-done' : ''}" data-id="${_esc(item.id)}">
            <label class="ck-item-label">
              <input type="checkbox" class="ck-checkbox" data-id="${_esc(item.id)}" ${state.checked ? 'checked' : ''} />
              <span class="ck-item-text">${_esc(item.text)}</span>
              ${tsText ? `<span class="ck-item-ts">${_esc(tsText)}</span>` : ''}
            </label>
            <input type="text" class="ck-item-note form-input" data-id="${_esc(item.id)}"
              placeholder="Note (optional)" value="${_esc(state.note || '')}"
              style="margin-top:6px;font-size:0.82rem;min-height:36px;padding:6px 10px" />
          </div>`;
      }).join('');
      return `
        <div class="card">
          <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>${sec.icon} ${_esc(sec.label)}</span>
            <span style="font-size:0.78rem;font-weight:600;color:${secChecked === sec.items.length ? 'var(--success)' : 'var(--text-muted)'}">${secChecked}/${sec.items.length}</span>
          </div>
          <div class="ck-items">${itemsHtml}</div>
        </div>`;
    }).join('');

    return `
      <div class="page">
        <div class="page-title">&#9989; Commissioning Checklist</div>

        <div class="card" style="border-left:4px solid ${allDone ? 'var(--success)' : 'var(--primary)'}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div class="ck-progress-bar" style="flex:1">
              <div class="ck-progress-fill" style="width:${pct}%;background:${allDone ? 'var(--success)' : 'var(--primary)'}"></div>
            </div>
            <span style="font-size:1.1rem;font-weight:800;color:${allDone ? 'var(--success)' : 'var(--primary)'}">${pct}%</span>
          </div>
          <div style="font-size:0.82rem;color:var(--text-secondary)">${checkedItems} of ${totalItems} items complete &bull; ${_esc(ck.systemType)} system</div>
          ${ck.projectName ? `<div style="font-size:0.85rem;font-weight:700;margin-top:4px">${_esc(ck.projectName)}${ck.client ? ' — ' + _esc(ck.client) : ''}</div>` : ''}
        </div>

        <div class="card">
          <div class="card-title">Header</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Engineer</label>
              <input class="form-input ck-header-field" id="ck-engineer" value="${_esc(ck.engineer)}" placeholder="Your name" />
            </div>
            <div class="form-group">
              <label class="form-label">Date</label>
              <input class="form-input ck-header-field" id="ck-date" type="date" value="${_esc(ck.date)}" />
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Project Name</label>
              <input class="form-input ck-header-field" id="ck-proj" value="${_esc(ck.projectName)}" placeholder="Site / project ID" />
            </div>
            <div class="form-group">
              <label class="form-label">System (kWp)</label>
              <input class="form-input ck-header-field" id="ck-kwp" value="${_esc(ck.systemKwp)}" placeholder="e.g. 10.5" />
            </div>
          </div>
        </div>

        ${sectionsHtml}

        <div class="card">
          <div class="btn-group">
            <button class="btn btn-primary" id="ck-pdf-btn">&#128196; Export PDF</button>
            <button class="btn btn-secondary" id="ck-back-btn">&#8592; All Checklists</button>
            <button class="btn btn-danger btn-sm" id="ck-delete-btn">Delete</button>
          </div>
          ${allDone ? '<div class="info-box mt-8" style="margin-bottom:0">&#9989; All items complete — ready for sign-off.</div>' : ''}
        </div>
      </div>`;
  }

  function _bindChecklistEvents(container) {
    // Checkbox toggle
    container.querySelectorAll('.ck-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (!_current.items[id]) _current.items[id] = { checked: false, note: '', ts: null };
        _current.items[id].checked = cb.checked;
        _current.items[id].ts = cb.checked ? new Date().toISOString() : null;
        // Update row style
        const row = container.querySelector(`.ck-item[data-id="${id}"]`);
        if (row) row.classList.toggle('ck-item-done', cb.checked);
        _debounceSave();
        // Refresh progress without full re-render
        _refreshProgress(container);
      });
    });

    // Note input
    container.querySelectorAll('.ck-item-note').forEach(inp => {
      inp.addEventListener('input', () => {
        const id = inp.dataset.id;
        if (!_current.items[id]) _current.items[id] = { checked: false, note: '', ts: null };
        _current.items[id].note = inp.value;
        _debounceSave();
      });
    });

    // Header fields
    container.querySelectorAll('.ck-header-field').forEach(inp => {
      inp.addEventListener('input', () => {
        if (inp.id === 'ck-engineer') _current.engineer = inp.value;
        if (inp.id === 'ck-date') _current.date = inp.value;
        if (inp.id === 'ck-proj') _current.projectName = inp.value;
        if (inp.id === 'ck-kwp') _current.systemKwp = inp.value;
        _debounceSave();
      });
    });

    // Back
    const backBtn = container.querySelector('#ck-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
      if (_current) _saveChecklist(_current);
      _current = null;
      render(container);
    });

    // Delete
    const deleteBtn = container.querySelector('#ck-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (!confirm('Delete this checklist? Cannot be undone.')) return;
      const list = _loadAll().filter(c => c.id !== _current.id);
      _saveAll(list);
      _current = null;
      render(container);
      if (typeof App !== 'undefined') App.toast('Checklist deleted');
    });

    // PDF export
    const pdfBtn = container.querySelector('#ck-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => _exportPDF(_current));
  }

  function _refreshProgress(container) {
    const ck = _current;
    const sectionKeys = SYSTEM_TYPE_SECTIONS[ck.systemType] || [];
    const totalItems = sectionKeys.reduce((n, sk) => n + SECTIONS[sk].items.length, 0);
    const checkedItems = Object.values(ck.items || {}).filter(v => v && v.checked).length;
    const pct = totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0;

    // Update section counters
    sectionKeys.forEach(sk => {
      const sec = SECTIONS[sk];
      const secDone = sec.items.filter(i => ck.items[i.id] && ck.items[i.id].checked).length;
      // find card-title with that section label
      const titles = container.querySelectorAll('.card-title');
      titles.forEach(t => {
        if (t.textContent.includes(sec.label)) {
          const span = t.querySelector('span:last-child');
          if (span) {
            span.textContent = `${secDone}/${sec.items.length}`;
            span.style.color = secDone === sec.items.length ? 'var(--success)' : 'var(--text-muted)';
          }
        }
      });
    });
  }

  // -----------------------------------------------------------------------
  // PDF EXPORT
  // -----------------------------------------------------------------------

  function _exportPDF(ck) {
    if (typeof window.jspdf === 'undefined') {
      if (typeof App !== 'undefined') App.toast('PDF library not loaded', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    let y = margin;

    const W = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('COMMISSIONING CHECKLIST', margin, 14);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('SolarPV Field Tool', W - margin, 14, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y = 28;

    // Project info table
    const infoRows = [
      ['Project', ck.projectName || '-', 'Client', ck.client || '-'],
      ['Site', ck.siteAddress || '-', 'System', (ck.systemKwp ? ck.systemKwp + ' kWp' : '-') + ' ' + (ck.systemType || '')],
      ['Engineer', ck.engineer || '-', 'Company', ck.company || '-'],
      ['Date', ck.date || '-', 'Generated', new Date().toLocaleDateString()],
    ];

    const colW = (W - margin * 2) / 4;
    infoRows.forEach(row => {
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128);
      doc.text(row[0], margin + 2, y + 4.5);
      doc.text(row[2], margin + colW * 2 + 2, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
      doc.text(String(row[1]).slice(0, 35), margin + colW + 1, y + 4.5);
      doc.text(String(row[3]).slice(0, 35), margin + colW * 3 + 1, y + 4.5);
      y += 7;
    });
    y += 4;

    // Progress
    const sectionKeys = SYSTEM_TYPE_SECTIONS[ck.systemType] || [];
    const totalItems = sectionKeys.reduce((n, sk) => n + SECTIONS[sk].items.length, 0);
    const checkedItems = Object.values(ck.items || {}).filter(v => v && v.checked).length;
    const pct = totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0;

    doc.setFillColor(229, 231, 235);
    doc.roundedRect(margin, y, W - margin * 2, 5, 2, 2, 'F');
    const fillW = Math.max(0, (W - margin * 2) * pct / 100);
    doc.setFillColor(pct === 100 ? 22 : 217, pct === 100 ? 163 : 119, pct === 100 ? 74 : 6);
    if (fillW > 0) doc.roundedRect(margin, y, fillW, 5, 2, 2, 'F');
    doc.setFontSize(8); doc.setTextColor(0);
    doc.text(`${checkedItems} / ${totalItems} items complete (${pct}%)`, margin, y + 8.5);
    y += 13;

    // Sections
    sectionKeys.forEach(sk => {
      const sec = SECTIONS[sk];
      if (y > 265) { doc.addPage(); y = margin; }

      doc.setFillColor(55, 65, 81);
      doc.rect(margin, y, W - margin * 2, 7, 'F');
      doc.setTextColor(255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(`${sec.label}`, margin + 3, y + 4.8);
      const secDone = sec.items.filter(i => ck.items[i.id] && ck.items[i.id].checked).length;
      doc.text(`${secDone}/${sec.items.length}`, W - margin - 3, y + 4.8, { align: 'right' });
      y += 7;

      doc.setTextColor(0); doc.setFont('helvetica', 'normal');
      sec.items.forEach((item, idx) => {
        if (y > 270) { doc.addPage(); y = margin; }
        const state = ck.items[item.id] || { checked: false, note: '' };
        const bg = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
        doc.setFillColor(...bg);
        const rowH = state.note ? 11 : 7;
        doc.rect(margin, y, W - margin * 2, rowH, 'F');

        // Checkbox symbol
        doc.setFontSize(9);
        doc.setTextColor(state.checked ? 22 : 156, state.checked ? 163 : 163, state.checked ? 74 : 175);
        doc.text(state.checked ? '✓' : '○', margin + 2, y + 4.8);

        // Item text
        doc.setTextColor(0); doc.setFontSize(8);
        const lines = doc.splitTextToSize(item.text, W - margin * 2 - 20);
        doc.text(lines[0], margin + 7, y + 4.8);

        // Timestamp
        if (state.ts) {
          const tsText = new Date(state.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          doc.setFontSize(7); doc.setTextColor(107, 114, 128);
          doc.text(tsText, W - margin - 2, y + 4.8, { align: 'right' });
        }

        if (state.note) {
          doc.setFontSize(7); doc.setTextColor(107, 114, 128);
          doc.text('Note: ' + state.note.slice(0, 80), margin + 7, y + 9.5);
        }
        doc.setTextColor(0);
        y += rowH;
      });
      y += 4;
    });

    // Footer on last page
    doc.setFontSize(8); doc.setTextColor(156, 163, 175);
    doc.text(`Generated: ${new Date().toLocaleString()} | SolarPV Field Tool`, margin, 290);

    const projSlug = (ck.projectName || 'checklist').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    doc.save(`commissioning_${projSlug}_${ck.date || 'nodate'}.pdf`);
    if (typeof App !== 'undefined') App.toast('PDF exported', 'success');
  }

  return { render };
})();
