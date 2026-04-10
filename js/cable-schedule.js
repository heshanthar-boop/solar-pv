/**
 * cable-schedule.js — DC/AC Cable Schedule
 * Collect wire calc results into a structured panel schedule table.
 * Supports manual entry, import from last wire-calc result, CSV export, and PDF export.
 */

var CableSchedule = (() => {
  const STORE_KEY = 'solarpv_cable_schedule_v1';

  /* ------------------------------------------------------------------ */
  /* Persistence                                                          */
  /* ------------------------------------------------------------------ */

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) { return []; }
  }

  function _save(rows) {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  function _esc(v) {
    if (typeof App !== 'undefined' && typeof App.escapeHTML === 'function') return App.escapeHTML(v);
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function _systemLabel(s) {
    if (!s) return '';
    if (s === 'dc') return 'DC';
    if (s === 'ac1p') return 'AC 1Ø';
    if (s === 'ac3p') return 'AC 3Ø';
    return s.toUpperCase();
  }

  /* ------------------------------------------------------------------ */
  /* Convert a wire-calc result to a schedule row                        */
  /* ------------------------------------------------------------------ */

  function _fromWireResult(r) {
    if (!r || !r.selector) return null;
    const s = r.selector;
    return {
      id: _uid(),
      label: r.inputs.purpose ? (r.purposeLabel || r.inputs.purpose) : 'Circuit',
      from: '',
      to: '',
      systemType: s.systemType || '',
      material: s.material || 'cu',
      csa: s.selectedCSA_mm2 != null ? String(s.selectedCSA_mm2) : '',
      peCsa: r.peCSA != null ? String(r.peCSA) : '',
      length_m: s.factors && s.factors.lengthOneWay_m != null ? String(s.factors.lengthOneWay_m) : (r.inputs ? String(r.inputs.lengthOneWay_m || '') : ''),
      current_A: s.designCurrent_A != null ? s.designCurrent_A.toFixed(1) : '',
      breakerA: r.breakerA != null ? String(r.breakerA) : '',
      vdrop_pct: s.selectedVdrop_pct != null ? s.selectedVdrop_pct.toFixed(2) : '',
      voltage: r.inputs ? String(r.inputs.nominal_V || '') : '',
      notes: '',
    };
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  function render(container) {
    let rows = _load();

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128268; Cable Schedule</div>

        <div class="card">
          <div class="card-title">Schedule Entries</div>
          <div style="overflow-x:auto" id="cs-table-wrap">
            <!-- rendered by _renderTable -->
          </div>
          <div class="btn-group" style="margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" id="cs-add-row">+ Add Row</button>
            <button class="btn btn-secondary btn-sm" id="cs-import-last">&#8595; Import Last Wire Calc</button>
            <button class="btn btn-secondary btn-sm" id="cs-clear-all">&#128465; Clear All</button>
          </div>
        </div>

        <div class="card" id="cs-summary-card">
          <!-- summary rendered below -->
        </div>

        <div class="btn-group" style="margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="cs-csv-btn">&#128190; Export CSV</button>
          <button class="btn btn-success btn-sm" id="cs-pdf-btn">&#128196; Export PDF</button>
        </div>
      </div>
    `;

    function _renderTable() {
      rows = _load();
      const wrap = container.querySelector('#cs-table-wrap');
      if (!rows.length) {
        wrap.innerHTML = '<div class="text-muted text-sm">No entries yet. Add rows manually or import from Wire Calc.</div>';
        _renderSummary();
        return;
      }
      wrap.innerHTML = `
        <table class="status-table" style="min-width:700px">
          <thead>
            <tr>
              <th style="min-width:100px">Label / Circuit</th>
              <th>From</th>
              <th>To</th>
              <th>System</th>
              <th>Cond.</th>
              <th>CSA (mm&sup2;)</th>
              <th>PE (mm&sup2;)</th>
              <th>Length (m)</th>
              <th>I<sub>des</sub> (A)</th>
              <th>Voltage (V)</th>
              <th>V-drop %</th>
              <th>Breaker (A)</th>
              <th>Notes</th>
              <th style="width:36px"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr data-cs-row="${i}">
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;min-width:90px" data-row="${i}" data-field="label" value="${_esc(row.label)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;min-width:70px" data-row="${i}" data-field="from" value="${_esc(row.from)}" placeholder="DB-A" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;min-width:70px" data-row="${i}" data-field="to" value="${_esc(row.to)}" placeholder="Inv-1" /></td>
                <td>
                  <select class="form-select cs-cell" style="padding:4px 6px;font-size:0.78rem;min-height:36px" data-row="${i}" data-field="systemType">
                    <option value="dc" ${row.systemType === 'dc' ? 'selected' : ''}>DC</option>
                    <option value="ac1p" ${row.systemType === 'ac1p' ? 'selected' : ''}>AC 1Ø</option>
                    <option value="ac3p" ${row.systemType === 'ac3p' ? 'selected' : ''}>AC 3Ø</option>
                  </select>
                </td>
                <td>
                  <select class="form-select cs-cell" style="padding:4px 6px;font-size:0.78rem;min-height:36px" data-row="${i}" data-field="material">
                    <option value="cu" ${row.material === 'cu' ? 'selected' : ''}>Cu</option>
                    <option value="al" ${row.material === 'al' ? 'selected' : ''}>Al</option>
                  </select>
                </td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:70px" type="number" step="any" data-row="${i}" data-field="csa" value="${_esc(row.csa)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:60px" type="number" step="any" data-row="${i}" data-field="peCsa" value="${_esc(row.peCsa)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:70px" type="number" step="any" data-row="${i}" data-field="length_m" value="${_esc(row.length_m)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:65px" type="number" step="any" data-row="${i}" data-field="current_A" value="${_esc(row.current_A)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:65px" type="number" step="any" data-row="${i}" data-field="voltage" value="${_esc(row.voltage)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:60px" type="number" step="any" data-row="${i}" data-field="vdrop_pct" value="${_esc(row.vdrop_pct)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;width:65px" type="number" step="any" data-row="${i}" data-field="breakerA" value="${_esc(row.breakerA)}" /></td>
                <td><input class="form-input cs-cell" style="padding:4px 6px;font-size:0.78rem;min-width:80px" data-row="${i}" data-field="notes" value="${_esc(row.notes)}" placeholder="Remark…" /></td>
                <td><button class="btn btn-danger btn-sm" style="padding:3px 7px" data-cs-del="${i}">&#10005;</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      wrap.querySelectorAll('.cs-cell').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.row, 10);
          rows[idx][inp.dataset.field] = inp.value;
          _save(rows);
          _renderSummary();
        });
      });
      wrap.querySelectorAll('[data-cs-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          rows.splice(parseInt(btn.dataset.csDel, 10), 1);
          _save(rows);
          _renderTable();
        });
      });

      _renderSummary();
    }

    function _renderSummary() {
      rows = _load();
      const card = container.querySelector('#cs-summary-card');
      if (!rows.length) { card.innerHTML = ''; return; }

      const dcRows = rows.filter(r => r.systemType === 'dc');
      const acRows = rows.filter(r => r.systemType !== 'dc');

      function _buildSummarySection(label, subset) {
        if (!subset.length) return '';
        return `
          <div style="margin-bottom:10px">
            <div class="text-sm fw-bold" style="margin-bottom:4px">${_esc(label)}</div>
            <table class="status-table">
              <thead>
                <tr>
                  <th>Label</th><th>From</th><th>To</th><th>Conductor</th>
                  <th>CSA (mm&sup2;)</th><th>PE (mm&sup2;)</th><th>Len (m)</th>
                  <th>I<sub>des</sub> (A)</th><th>V-drop%</th><th>Breaker (A)</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${subset.map(r => {
                  const vdrop = parseFloat(r.vdrop_pct);
                  const vdropCls = !isNaN(vdrop) && vdrop > 3 ? 'text-danger fw-bold' : (!isNaN(vdrop) && vdrop > 1 ? 'text-warning fw-bold' : '');
                  return `<tr>
                    <td><strong>${_esc(r.label)}</strong></td>
                    <td>${_esc(r.from)}</td>
                    <td>${_esc(r.to)}</td>
                    <td>${_esc((r.material || 'Cu').toUpperCase())} ${_esc(_systemLabel(r.systemType))}</td>
                    <td>${_esc(r.csa)}</td>
                    <td>${_esc(r.peCsa)}</td>
                    <td>${_esc(r.length_m)}</td>
                    <td>${_esc(r.current_A)}</td>
                    <td class="${vdropCls}">${_esc(r.vdrop_pct)}${r.vdrop_pct ? '%' : ''}</td>
                    <td>${_esc(r.breakerA)}</td>
                    <td class="text-muted text-sm">${_esc(r.notes)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-title">Schedule Summary</div>
        ${_buildSummarySection('DC Circuits', dcRows)}
        ${_buildSummarySection('AC Circuits', acRows)}
      `;
    }

    // Initial render
    _renderTable();

    // Add empty row
    container.querySelector('#cs-add-row').addEventListener('click', () => {
      rows = _load();
      rows.push({
        id: _uid(), label: 'Circuit ' + (rows.length + 1),
        from: '', to: '', systemType: 'dc', material: 'cu',
        csa: '', peCsa: '', length_m: '', current_A: '',
        voltage: '', vdrop_pct: '', breakerA: '', notes: ''
      });
      _save(rows);
      _renderTable();
    });

    // Import from last wire calc result
    container.querySelector('#cs-import-last').addEventListener('click', () => {
      const wr = App.state.wireResult;
      if (!wr) { App.toast('No wire calc result in session. Run Wire Calc first.', 'error'); return; }
      const row = _fromWireResult(wr);
      if (!row) { App.toast('Could not read wire calc result', 'error'); return; }
      rows = _load();
      rows.push(row);
      _save(rows);
      _renderTable();
      App.toast('Imported: ' + row.label, 'success');
    });

    // Clear all
    container.querySelector('#cs-clear-all').addEventListener('click', () => {
      if (!rows.length) return;
      App.showModal(
        'Clear Cable Schedule',
        '<p>Delete all ' + rows.length + ' row(s)? This cannot be undone.</p>',
        [
          { label: 'Clear All', cls: 'btn-danger', action: () => { _save([]); rows = []; _renderTable(); } },
          { label: 'Cancel', cls: 'btn-secondary', action: 'close' }
        ]
      );
    });

    // CSV export
    container.querySelector('#cs-csv-btn').addEventListener('click', () => {
      const data = _load();
      if (!data.length) { App.toast('No data to export', 'error'); return; }
      const header = ['Label', 'From', 'To', 'System', 'Conductor', 'CSA (mm2)', 'PE CSA (mm2)', 'Length (m)', 'Design I (A)', 'Voltage (V)', 'V-drop (%)', 'Breaker (A)', 'Notes'];
      const csvRows = data.map(r => [
        r.label, r.from, r.to, _systemLabel(r.systemType), (r.material || 'CU').toUpperCase(),
        r.csa, r.peCsa, r.length_m, r.current_A, r.voltage, r.vdrop_pct, r.breakerA, r.notes
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
      const csv = [header.join(','), ...csvRows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'cable_schedule.csv'; a.click();
      URL.revokeObjectURL(url);
      App.toast('CSV downloaded', 'success');
    });

    // PDF export
    container.querySelector('#cs-pdf-btn').addEventListener('click', () => _exportPDF(_load()));
  }

  function _exportPDF(rows) {
    if (!rows.length) { App.toast('No data to export', 'error'); return; }
    if (typeof jspdf === 'undefined' || !jspdf.jsPDF) { App.toast('PDF library not loaded', 'error'); return; }
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const settings = (() => { try { return JSON.parse(localStorage.getItem('solarpv_settings')) || {}; } catch (e) { return {}; } })();
    const company = settings.company || 'Solar PV Field Tool';
    const proj = (typeof App !== 'undefined' && typeof App.getProject === 'function') ? App.getProject() : null;

    // Header band
    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, 297, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DC / AC Cable Schedule', 10, 9);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(company, 297 - 10, 9, { align: 'right' });

    // Project info
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    let infoY = 20;
    if (proj && proj.name) {
      doc.text(`Project: ${proj.name}${proj.client ? ' | Client: ' + proj.client : ''}${proj.siteAddress ? ' | Site: ' + proj.siteAddress : ''}`, 10, infoY);
      infoY += 5;
    }
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 10, infoY);
    infoY += 6;

    const dcRows = rows.filter(r => r.systemType === 'dc');
    const acRows = rows.filter(r => r.systemType !== 'dc');

    const columns = [
      { header: 'Label', dataKey: 'label' },
      { header: 'From', dataKey: 'from' },
      { header: 'To', dataKey: 'to' },
      { header: 'System', dataKey: 'systemType' },
      { header: 'Cond.', dataKey: 'material' },
      { header: 'CSA\n(mm²)', dataKey: 'csa' },
      { header: 'PE\n(mm²)', dataKey: 'peCsa' },
      { header: 'Length\n(m)', dataKey: 'length_m' },
      { header: 'Ides\n(A)', dataKey: 'current_A' },
      { header: 'V\n(V)', dataKey: 'voltage' },
      { header: 'V-drop\n(%)', dataKey: 'vdrop_pct' },
      { header: 'Breaker\n(A)', dataKey: 'breakerA' },
      { header: 'Notes', dataKey: 'notes' },
    ];

    function _tableData(subset) {
      return subset.map(r => ({
        label: r.label, from: r.from, to: r.to,
        systemType: _systemLabel(r.systemType),
        material: (r.material || 'cu').toUpperCase(),
        csa: r.csa, peCsa: r.peCsa, length_m: r.length_m,
        current_A: r.current_A, voltage: r.voltage,
        vdrop_pct: r.vdrop_pct ? r.vdrop_pct + '%' : '',
        breakerA: r.breakerA, notes: r.notes
      }));
    }

    let yPos = infoY;

    function _addSection(title, subset) {
      if (!subset.length) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(title, 10, yPos);
      yPos += 4;

      doc.autoTable({
        startY: yPos,
        columns,
        body: _tableData(subset),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { notes: { cellWidth: 30 } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.dataKey === 'vdrop_pct') {
            const v = parseFloat(data.cell.raw);
            if (!isNaN(v) && v > 3) { data.cell.styles.textColor = [185, 28, 28]; data.cell.styles.fontStyle = 'bold'; }
          }
        },
        margin: { left: 10, right: 10 },
      });
      yPos = doc.lastAutoTable.finalY + 8;
    }

    _addSection('DC Circuits', dcRows);
    _addSection('AC Circuits', acRows);

    // Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Page ${i} of ${totalPages}`, 297 - 10, 205, { align: 'right' });
    }

    doc.save('cable_schedule.pdf');
    App.toast('PDF saved', 'success');
  }

  /* Public: called from wire-calc.js result panel */
  function addFromWireResult(r) {
    const row = _fromWireResult(r);
    if (!row) return false;
    const rows = _load();
    rows.push(row);
    _save(rows);
    return true;
  }

  return { render, addFromWireResult };
})();
