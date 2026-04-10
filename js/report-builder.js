/**
 * report-builder.js — Combined Site Report Builder
 * Assembles cover page + selected modules into one PDF.
 * Pulls from: active project, inspection sessions, checklists, field test results.
 */

var ReportBuilder = (() => {
  const PRIMARY = [217, 119, 6];
  const DARK    = [17, 24, 39];
  const MUTED   = [107, 114, 128];
  const SUCCESS = [22, 163, 74];
  const DANGER  = [220, 38, 38];
  const WARN    = [202, 138, 4];
  const MARGIN  = 15;
  const PAGE_W  = 210;
  const CW      = PAGE_W - MARGIN * 2;

  function _esc(v) {
    return typeof App !== 'undefined' ? App.escapeHTML(v) : String(v ?? '');
  }

  function _settings() {
    try { return JSON.parse(localStorage.getItem('solarpv_settings') || '{}'); } catch { return {}; }
  }

  function _sessions() {
    try { return JSON.parse(localStorage.getItem('solarpv_sessions') || '[]'); } catch { return []; }
  }

  function _checklists() {
    try { return JSON.parse(localStorage.getItem('solarpv_checklists_v1') || '[]'); } catch { return []; }
  }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  function render(container) {
    const proj = typeof App !== 'undefined' && typeof App.getProject === 'function' ? App.getProject() : {};
    const settings = _settings();
    const sessions = _sessions();
    const checklists = _checklists();

    const sessionOpts = sessions.map((s, i) =>
      `<option value="${i}">${_esc(s.site.projectName || 'Inspection')} — ${_esc(s.site.date || '')} (${_esc(s.site.inspector || '')})</option>`
    ).join('');
    const checklistOpts = checklists.map((c, i) =>
      `<option value="${i}">${_esc(c.projectName || 'Checklist')} — ${_esc(c.date || '')} (${_esc(c.systemType || '')})</option>`
    ).join('');

    const hasFieldTest = typeof App !== 'undefined' && App.state && App.state.fieldTestResults;
    const hasFault = typeof App !== 'undefined' && App.state && App.state.faultCheckResults;
    const hasYield = typeof App !== 'undefined' && App.state && App.state.yieldResults;

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128196; Report Builder</div>

        <div class="card" style="border-left:4px solid var(--primary)">
          <div class="card-title">Report Details</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Report Title</label>
              <input class="form-input" id="rb-title" value="${_esc(proj.name ? proj.name + ' — Site Report' : 'Solar PV Site Report')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Prepared By</label>
              <input class="form-input" id="rb-engineer" value="${_esc(settings.inspectorName || '')}" placeholder="Engineer name" />
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Company</label>
              <input class="form-input" id="rb-company" value="${_esc(settings.company || 'Heshan Engineering Solution')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Report Date</label>
              <input class="form-input" id="rb-date" type="date" value="${typeof App !== 'undefined' ? App.localDateISO() : new Date().toISOString().slice(0,10)}" />
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Client</label>
              <input class="form-input" id="rb-client" value="${_esc(proj.client || '')}" placeholder="Client name" />
            </div>
            <div class="form-group">
              <label class="form-label">Site Address</label>
              <input class="form-input" id="rb-site" value="${_esc(proj.siteAddress || '')}" placeholder="Site location" />
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">System Size (kWp)</label>
              <input class="form-input" id="rb-kwp" type="number" min="0" step="0.1" value="${_esc(proj.systemKwp || '')}" placeholder="e.g. 10.5" />
            </div>
            <div class="form-group">
              <label class="form-label">System Type</label>
              <input class="form-input" id="rb-systype" value="${_esc(proj.systemType || 'Grid-Tie')}" placeholder="Grid-Tie / Hybrid / Off-Grid" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Select Sections to Include</div>

          <div class="rb-section-row">
            <label class="rb-section-label">
              <input type="checkbox" id="rb-inc-inspection" ${sessions.length ? 'checked' : 'disabled'} />
              <span>&#128203; Inspection Log</span>
            </label>
            ${sessions.length ? `
            <select class="form-select rb-section-select" id="rb-sel-inspection" style="margin-top:6px">${sessionOpts}</select>` :
            `<span class="text-muted" style="font-size:0.8rem">No saved inspections</span>`}
          </div>

          <div class="rb-section-row">
            <label class="rb-section-label">
              <input type="checkbox" id="rb-inc-checklist" ${checklists.length ? 'checked' : 'disabled'} />
              <span>&#9989; Commissioning Checklist</span>
            </label>
            ${checklists.length ? `
            <select class="form-select rb-section-select" id="rb-sel-checklist" style="margin-top:6px">${checklistOpts}</select>` :
            `<span class="text-muted" style="font-size:0.8rem">No saved checklists</span>`}
          </div>

          <div class="rb-section-row">
            <label class="rb-section-label">
              <input type="checkbox" id="rb-inc-fieldtest" ${hasFieldTest ? 'checked' : 'disabled'} />
              <span>&#128202; Field Test Results</span>
            </label>
            ${!hasFieldTest ? `<span class="text-muted" style="font-size:0.8rem">Run Field Test vs STC first</span>` : ''}
          </div>

          <div class="rb-section-row">
            <label class="rb-section-label">
              <input type="checkbox" id="rb-inc-fault" ${hasFault ? 'checked' : 'disabled'} />
              <span>&#9888; Fault Check Results</span>
            </label>
            ${!hasFault ? `<span class="text-muted" style="font-size:0.8rem">Run Fault Checker first</span>` : ''}
          </div>

          <div class="rb-section-row">
            <label class="rb-section-label">
              <input type="checkbox" id="rb-inc-yield" ${hasYield ? 'checked' : 'disabled'} />
              <span>&#9728; Yield Estimate</span>
            </label>
            ${!hasYield ? `<span class="text-muted" style="font-size:0.8rem">Run Yield Estimator first</span>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="btn-group">
            <button class="btn btn-primary" id="rb-generate-btn">&#128196; Generate Combined PDF</button>
          </div>
          <div class="text-muted mt-8" style="font-size:0.8rem">Cover page is always included. Selected sections are appended in order.</div>
        </div>
      </div>`;

    container.querySelector('#rb-generate-btn').addEventListener('click', () => {
      const opts = {
        title:    container.querySelector('#rb-title').value.trim(),
        engineer: container.querySelector('#rb-engineer').value.trim(),
        company:  container.querySelector('#rb-company').value.trim(),
        date:     container.querySelector('#rb-date').value,
        client:   container.querySelector('#rb-client').value.trim(),
        site:     container.querySelector('#rb-site').value.trim(),
        kwp:      container.querySelector('#rb-kwp').value.trim(),
        sysType:  container.querySelector('#rb-systype').value.trim(),
      };

      const incInspection = container.querySelector('#rb-inc-inspection') && container.querySelector('#rb-inc-inspection').checked;
      const incChecklist  = container.querySelector('#rb-inc-checklist')  && container.querySelector('#rb-inc-checklist').checked;
      const incFieldTest  = container.querySelector('#rb-inc-fieldtest')  && container.querySelector('#rb-inc-fieldtest').checked;
      const incFault      = container.querySelector('#rb-inc-fault')      && container.querySelector('#rb-inc-fault').checked;
      const incYield      = container.querySelector('#rb-inc-yield')      && container.querySelector('#rb-inc-yield').checked;

      const selInspIdx = container.querySelector('#rb-sel-inspection') ? parseInt(container.querySelector('#rb-sel-inspection').value) : 0;
      const selCkIdx   = container.querySelector('#rb-sel-checklist')  ? parseInt(container.querySelector('#rb-sel-checklist').value)  : 0;

      const session   = incInspection && sessions[selInspIdx] ? sessions[selInspIdx] : null;
      const checklist = incChecklist  && checklists[selCkIdx] ? checklists[selCkIdx] : null;
      const ftResults = incFieldTest  ? (App.state && App.state.fieldTestResults) : null;
      const faultRes  = incFault      ? (App.state && App.state.faultCheckResults) : null;
      const yieldRes  = incYield      ? (App.state && App.state.yieldResults) : null;

      _generateCombinedPDF(opts, { session, checklist, ftResults, faultRes, yieldRes });
    });
  }

  // -----------------------------------------------------------------------
  // PDF GENERATION
  // -----------------------------------------------------------------------

  function _generateCombinedPDF(opts, sections) {
    if (typeof window.jspdf === 'undefined') {
      if (typeof App !== 'undefined') App.toast('PDF library not loaded', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ---- COVER PAGE ----
    _coverPage(doc, opts, sections);

    // ---- INSPECTION SECTION ----
    if (sections.session) {
      doc.addPage();
      _inspectionSection(doc, sections.session);
    }

    // ---- CHECKLIST SECTION ----
    if (sections.checklist) {
      doc.addPage();
      _checklistSection(doc, sections.checklist);
    }

    // ---- FIELD TEST SECTION ----
    if (sections.ftResults) {
      doc.addPage();
      _fieldTestSection(doc, sections.ftResults);
    }

    // ---- FAULT SECTION ----
    if (sections.faultRes) {
      doc.addPage();
      _faultSection(doc, sections.faultRes);
    }

    // ---- YIELD SECTION ----
    if (sections.yieldRes) {
      doc.addPage();
      _yieldSection(doc, sections.yieldRes);
    }

    // ---- PAGE NUMBERS ----
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(`Page ${i} of ${total}`, PAGE_W / 2, 291, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 291);
      doc.text(`${opts.company || 'SolarPV Field Tool'}`, PAGE_W - MARGIN, 291, { align: 'right' });
    }

    const slug = (opts.title || 'report').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    doc.save(`${slug}_${opts.date || 'nodate'}.pdf`);
    if (typeof App !== 'undefined') App.toast('Combined report exported', 'success');
  }

  function _coverPage(doc, opts, sections) {
    // Full amber header band
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, PAGE_W, 60, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(opts.company || 'Heshan Engineering Solution', MARGIN, 16);

    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(opts.title || 'Solar PV Site Report', CW);
    doc.text(titleLines, MARGIN, 30);

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(opts.date || new Date().toLocaleDateString(), MARGIN, 30 + titleLines.length * 7 + 4);

    // Project info block
    let y = 72;
    doc.setTextColor(...DARK);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Project Information', MARGIN, y); y += 8;
    doc.setLineWidth(0.3); doc.setDrawColor(...PRIMARY);
    doc.line(MARGIN, y, MARGIN + CW, y); y += 6;

    const infoRows = [
      ['Project / Site', opts.title || '-'],
      ['Client', opts.client || '-'],
      ['Site Address', opts.site || '-'],
      ['System Size', opts.kwp ? opts.kwp + ' kWp' : '-'],
      ['System Type', opts.sysType || '-'],
      ['Prepared By', opts.engineer || '-'],
      ['Date', opts.date || '-'],
    ];
    infoRows.forEach(([label, value]) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
      doc.text(label, MARGIN, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
      doc.text(String(value).slice(0, 80), MARGIN + 48, y);
      y += 7;
    });

    // Sections included
    y += 4;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text('Report Contents', MARGIN, y); y += 8;
    doc.setLineWidth(0.3); doc.setDrawColor(...PRIMARY);
    doc.line(MARGIN, y, MARGIN + CW, y); y += 6;

    const contents = [
      ['Cover Page', true],
      ['Inspection Log', !!sections.session],
      ['Commissioning Checklist', !!sections.checklist],
      ['Field Test Results', !!sections.ftResults],
      ['Fault Checker Results', !!sections.faultRes],
      ['Yield Estimate', !!sections.yieldRes],
    ];
    contents.forEach(([name, included]) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.setTextColor(...(included ? SUCCESS : MUTED));
      doc.text(included ? '✓  ' + name : '○  ' + name + '  (not included)', MARGIN + 4, y);
      y += 7;
    });
  }

  function _sectionHeader(doc, title, y) {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, y - 2, PAGE_W, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(title, MARGIN, y + 6);
    return y + 18;
  }

  function _kv(doc, y, label, value, labelW) {
    labelW = labelW || 55;
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
    doc.text(label + ':', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    doc.text(String(value || '—').slice(0, 90), MARGIN + labelW, y);
    return y + 5.5;
  }

  function _subTitle(doc, y, text) {
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN, y, CW, 7, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PRIMARY);
    doc.text(text.toUpperCase(), MARGIN + 3, y + 5);
    return y + 10;
  }

  function _inspectionSection(doc, session) {
    const site = session.site || {};
    let y = _sectionHeader(doc, '📋 Inspection Log', 14);

    y = _kv(doc, y, 'Project', site.projectName);
    y = _kv(doc, y, 'Location', site.siteLocation);
    y = _kv(doc, y, 'Date', site.date);
    y = _kv(doc, y, 'Inspector', site.inspector);
    y = _kv(doc, y, 'Type', site.inspectionType);
    y = _kv(doc, y, 'System', site.systemCapacity ? site.systemCapacity + ' kWp' : '—');
    y = _kv(doc, y, 'Inverter', site.inverterModel);
    if (site.irradiance) y = _kv(doc, y, 'Irradiance', site.irradiance + ' W/m²');
    if (site.ambientTemp) y = _kv(doc, y, 'Ambient Temp', site.ambientTemp + ' °C');
    if (site.notes) { y += 3; y = _kv(doc, y, 'Notes', site.notes); }
    y += 4;

    // System checks
    const sc = session.systemChecks || {};
    const checks = [
      ['DC SPD', sc.spd_dc], ['AC SPD', sc.spd_ac], ['Earthing Continuity', sc.earthing_cont],
      ['Earthing Resistance', sc.earthing_resistance], ['Cable Condition', sc.cable_condition],
      ['Cable UV Rating', sc.cable_uv], ['Array Mounting', sc.array_mounting],
      ['Module Labelling', sc.module_labelling], ['Inverter Display', sc.inverter_display],
      ['Grid Connection', sc.grid_connection], ['IR Array', sc.ir_array],
    ].filter(([, v]) => v);

    if (checks.length) {
      y = _subTitle(doc, y, 'System Checks');
      checks.forEach(([label, val]) => {
        if (y > 270) { doc.addPage(); y = 20; }
        y = _kv(doc, y, label, val);
      });
      y += 3;
    }

    // Strings
    if (session.strings && session.strings.length) {
      y = _subTitle(doc, y, 'String Test Results');
      if (typeof doc.autoTable === 'function') {
        const rows = session.strings.map(s => [
          s.label || '-', s.Voc || '-', s.Isc || '-', s.IR || '-',
          Object.entries(s.visual || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || '—',
        ]);
        doc.autoTable({
          startY: y, margin: { left: MARGIN, right: MARGIN },
          head: [['String', 'Voc (V)', 'Isc (A)', 'IR (MΩ)', 'Visual Issues']],
          body: rows,
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [249, 250, 251] },
        });
      }
    }
  }

  function _checklistSection(doc, ck) {
    let y = _sectionHeader(doc, '✅ Commissioning Checklist', 14);

    y = _kv(doc, y, 'Project', ck.projectName);
    y = _kv(doc, y, 'System Type', ck.systemType);
    y = _kv(doc, y, 'Engineer', ck.engineer);
    y = _kv(doc, y, 'Date', ck.date);
    if (ck.systemKwp) y = _kv(doc, y, 'System', ck.systemKwp + ' kWp');
    y += 4;

    // Progress
    const SYSTEM_TYPE_SECTIONS = {
      'grid-tie': ['dc','inverter','ac','documentation'],
      'hybrid':   ['dc','inverter','ac','hybrid','documentation'],
      'off-grid': ['dc','inverter','hybrid','documentation'],
      'ground-mount': ['dc','inverter','ac','documentation'],
    };
    const SECTIONS_META = {
      dc: 15, inverter: 9, ac: 9, hybrid: 9, documentation: 8
    };
    const sks = SYSTEM_TYPE_SECTIONS[ck.systemType] || SYSTEM_TYPE_SECTIONS['grid-tie'];
    const totalItems = sks.reduce((n, sk) => n + (SECTIONS_META[sk] || 0), 0);
    const checkedItems = Object.values(ck.items || {}).filter(v => v && v.checked).length;
    const pct = totalItems > 0 ? Math.round(checkedItems / totalItems * 100) : 0;

    doc.setFillColor(229, 231, 235);
    doc.roundedRect(MARGIN, y, CW, 5, 2, 2, 'F');
    const fillW = Math.max(0, CW * pct / 100);
    doc.setFillColor(...(pct === 100 ? SUCCESS : PRIMARY));
    if (fillW > 0) doc.roundedRect(MARGIN, y, fillW, 5, 2, 2, 'F');
    doc.setFontSize(8); doc.setTextColor(...DARK);
    doc.text(`${checkedItems} / ${totalItems} items complete (${pct}%)`, MARGIN, y + 9);
    y += 14;

    // Items table
    if (typeof doc.autoTable === 'function') {
      const rows = Object.entries(ck.items || {}).map(([id, state]) => {
        const ts = state.ts ? new Date(state.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return [state.checked ? '✓' : '○', id.replace(/_/g, ' '), state.note || '', ts];
      });
      doc.autoTable({
        startY: y, margin: { left: MARGIN, right: MARGIN },
        head: [['', 'Item', 'Note', 'Time']],
        body: rows,
        styles: { fontSize: 7.2, cellPadding: 2 },
        headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 3: { cellWidth: 16 } },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: ctx => {
          if (ctx.section === 'body' && ctx.column.index === 0) {
            ctx.cell.styles.textColor = ctx.row.raw[0] === '✓' ? SUCCESS : MUTED;
            ctx.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }
  }

  function _fieldTestSection(doc, ftResults) {
    let y = _sectionHeader(doc, '📊 Field Test vs STC', 14);
    doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'italic');
    doc.text('Field test results from current session (IEC 62446-1 tolerance evaluation)', MARGIN, y);
    y += 8;

    if (typeof doc.autoTable === 'function' && ftResults && ftResults.strings) {
      const rows = ftResults.strings.map(s => [
        s.label || '-',
        s.Voc_field != null ? s.Voc_field.toFixed(2) : '-',
        s.Voc_corr != null ? s.Voc_corr.toFixed(2) : '-',
        s.Voc_pass != null ? (s.Voc_pass ? 'PASS' : 'FAIL') : '-',
        s.Isc_field != null ? s.Isc_field.toFixed(2) : '-',
        s.Isc_corr != null ? s.Isc_corr.toFixed(2) : '-',
        s.Isc_pass != null ? (s.Isc_pass ? 'PASS' : 'FAIL') : '-',
      ]);
      doc.autoTable({
        startY: y, margin: { left: MARGIN, right: MARGIN },
        head: [['String', 'Voc Field', 'Voc STC', 'Voc', 'Isc Field', 'Isc STC', 'Isc']],
        body: rows,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: ctx => {
          if (ctx.section === 'body' && (ctx.column.index === 3 || ctx.column.index === 6)) {
            const v = ctx.cell.raw;
            if (v === 'PASS') ctx.cell.styles.textColor = SUCCESS;
            if (v === 'FAIL') { ctx.cell.styles.textColor = DANGER; ctx.cell.styles.fontStyle = 'bold'; }
          }
        },
      });
    } else {
      doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
      doc.text('Field test data not available in current format.', MARGIN, y + 8);
    }
  }

  function _faultSection(doc, faultRes) {
    let y = _sectionHeader(doc, '⚠ Fault Checker Results', 14);
    doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'italic');
    doc.text('String fault pattern analysis from current session', MARGIN, y);
    y += 8; doc.setFont('helvetica', 'normal');

    if (typeof doc.autoTable === 'function' && faultRes && faultRes.strings) {
      const rows = faultRes.strings.map(s => [
        s.label || '-',
        s.status || '-',
        s.faults && s.faults.length ? s.faults.join(', ') : 'None detected',
      ]);
      doc.autoTable({
        startY: y, margin: { left: MARGIN, right: MARGIN },
        head: [['String', 'Status', 'Detected Issues']],
        body: rows,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: ctx => {
          if (ctx.section === 'body' && ctx.column.index === 1) {
            const v = String(ctx.cell.raw).toLowerCase();
            if (v.includes('fault') || v.includes('fail')) ctx.cell.styles.textColor = DANGER;
            else if (v.includes('warn')) ctx.cell.styles.textColor = WARN;
            else ctx.cell.styles.textColor = SUCCESS;
            ctx.cell.styles.fontStyle = 'bold';
          }
        },
      });
    } else {
      doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text('Fault data not available.', MARGIN, y + 8);
    }
  }

  function _yieldSection(doc, yieldRes) {
    let y = _sectionHeader(doc, '☀ Yield Estimate', 14);

    if (yieldRes && yieldRes.summary) {
      const s = yieldRes.summary;
      y = _kv(doc, y, 'Annual Yield', s.E_annual ? Math.round(s.E_annual) + ' kWh/yr' : '—');
      y = _kv(doc, y, 'Avg Daily Yield', s.E_annual ? (s.E_annual / 365).toFixed(1) + ' kWh/day' : '—');
      y = _kv(doc, y, 'Performance Ratio', s.PR_avg ? (s.PR_avg * 100).toFixed(1) + '%' : '—');
      y = _kv(doc, y, 'Annual GHI', s.GHI_annual ? Math.round(s.GHI_annual) + ' kWh/m²' : '—');
      y += 4;
    }

    if (typeof doc.autoTable === 'function' && yieldRes && yieldRes.monthly) {
      const rows = yieldRes.monthly.map(m => [
        m.month || '-',
        m.GHI != null ? m.GHI.toFixed(1) : '-',
        m.E_month != null ? Math.round(m.E_month) : '-',
        m.PR != null ? (m.PR * 100).toFixed(1) + '%' : '-',
      ]);
      doc.autoTable({
        startY: y, margin: { left: MARGIN, right: MARGIN },
        head: [['Month', 'GHI (kWh/m²)', 'Yield (kWh)', 'PR %']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2.2 },
        headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });
    } else {
      doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text('Yield data not available.', MARGIN, y + 8);
    }
  }

  return { render };
})();
