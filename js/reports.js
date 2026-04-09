/**
 * reports.js — PDF Generation via jsPDF + autotable
 * Generates field inspection report PDF.
 */

const Reports = (() => {
  const PRIMARY = [217, 119, 6];      // #d97706 amber
  const DARK    = [17, 24, 39];       // #111827
  const MUTED   = [107, 114, 128];    // #6b7280
  const SUCCESS = [22, 163, 74];      // #16a34a
  const DANGER  = [220, 38, 38];      // #dc2626
  const WARN    = [202, 138, 4];      // #ca8a04
  const BG_OK   = [220, 252, 231];
  const BG_WARN = [254, 249, 195];
  const BG_FAIL = [254, 226, 226];

  const MARGIN = 15;
  const PAGE_W = 210;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  function _defaultFieldProfile() {
    if (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getFieldTestProfile === 'function') {
      return StandardsRules.getFieldTestProfile();
    }
    if (typeof PVCalc !== 'undefined' && PVCalc && typeof PVCalc.getFieldTestProfile === 'function') {
      return PVCalc.getFieldTestProfile();
    }
    return { vocTolPct: 2, iscTolPct: 5, label: 'IEC 62446-1:2016 + AMD1:2018' };
  }

  function _irRule() {
    if (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getIRTestRule === 'function') {
      return StandardsRules.getIRTestRule();
    }
    return { minMOhm: 1.0 };
  }

  function _standardsAuditMeta(options) {
    const requestedProfileId = (options && options.profileId)
      ? String(options.profileId)
      : (
          typeof App !== 'undefined' && App && App.state && App.state.fieldTestProfileId
            ? String(App.state.fieldTestProfileId)
            : undefined
        );

    let profile = null;
    if (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getFieldTestProfile === 'function') {
      profile = StandardsRules.getFieldTestProfile(requestedProfileId);
    } else if (typeof PVCalc !== 'undefined' && PVCalc && typeof PVCalc.getFieldTestProfile === 'function') {
      profile = PVCalc.getFieldTestProfile(requestedProfileId);
    }
    if (!profile || typeof profile !== 'object') {
      profile = { id: 'iec62446_2016', label: 'IEC 62446-1:2016 + AMD1:2018' };
    }

    const rulesVersion = (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getRulesVersion === 'function')
      ? String(StandardsRules.getRulesVersion())
      : (
          typeof StandardsRules !== 'undefined' && StandardsRules && StandardsRules.RULESET_VERSION
            ? String(StandardsRules.RULESET_VERSION)
            : 'legacy'
        );

    return {
      profileId: String(profile.id || requestedProfileId || 'default'),
      profileLabel: String(profile.label || 'IEC 62446-1 profile'),
      rulesVersion,
    };
  }

  function _doc() {
    return new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  function _addHeader(doc, title, subtitle, auditMeta) {
    // Color bar
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, PAGE_W, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLAR PV FIELD INSPECTION REPORT', MARGIN, 11);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Heshan Engineering Solution', PAGE_W - MARGIN, 11, { align: 'right' });

    // Title block
    doc.setTextColor(...DARK);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, MARGIN, 26);

    if (subtitle) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(subtitle, MARGIN, 31);
    }

    const audit = auditMeta || _standardsAuditMeta();
    let dividerY = 34;
    if (audit && audit.profileLabel) {
      const auditLine = `Standards profile: ${audit.profileLabel} [${audit.profileId}] | Ruleset version: ${audit.rulesVersion}`;
      const auditLines = doc.splitTextToSize(auditLine, CONTENT_W);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(auditLines, MARGIN, 35);
      dividerY = 35 + (auditLines.length * 3.2);
    }

    // Divider
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, dividerY, PAGE_W - MARGIN, dividerY);

    return dividerY + 4; // return y cursor
  }

  function _addFooter(doc) {
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Page ${i} of ${pages}`, PAGE_W / 2, 291, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 291);
      doc.text('SolarPV Field Tool — Heshan Engineering Solution', PAGE_W - MARGIN, 291, { align: 'right' });
    }
  }

  function _sectionTitle(doc, y, text) {
    doc.setFillColor(245, 245, 245);
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text(text.toUpperCase(), MARGIN + 3, y + 5);
    return y + 10;
  }

  function _kv(doc, y, label, value, labelW) {
    labelW = labelW || 55;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED);
    doc.text(label + ':', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.text(String(value || '—'), MARGIN + labelW, y);
    return y + 5.5;
  }

  // -----------------------------------------------------------------------
  // MAIN REPORT
  // -----------------------------------------------------------------------

  function generateInspection(session) {
    if (!window.jspdf) { App.toast('PDF library not loaded. Check internet connection.', 'error'); return; }

    const doc = _doc();
    const site = session.site;
    const irMinMOhm = Number(_irRule().minMOhm || 1);

    const inspType = { commissioning: 'Commissioning (IEC 62446-1)', periodic: 'Periodic / Annual', fault: 'Fault Investigation' };
    let y = _addHeader(
      doc,
      site.projectName || 'Solar PV Inspection',
      `${site.siteLocation || ''}  |  ${site.date}  |  ${inspType[site.inspectionType] || 'Inspection'}  |  Inspector: ${site.inspector || '—'}`
    );

    // --- SITE INFO ---
    y = _sectionTitle(doc, y, 'Site Information');
    y = _kv(doc, y, 'Project Name',     site.projectName);
    y = _kv(doc, y, 'Site Location',    site.siteLocation);
    if (site.gpsCoords) y = _kv(doc, y, 'GPS Coordinates', site.gpsCoords);
    y = _kv(doc, y, 'Inspection Type',  inspType[site.inspectionType] || site.inspectionType);
    y = _kv(doc, y, 'Inspection Date',  site.date);
    y = _kv(doc, y, 'Inspector',        site.inspector);
    y = _kv(doc, y, 'System Capacity',  site.systemCapacity ? site.systemCapacity + ' kWp' : '—');
    y = _kv(doc, y, 'Inverter Model',   site.inverterModel);
    y = _kv(doc, y, 'Weather',          site.weather);
    y = _kv(doc, y, 'Irradiance',       site.irradiance ? site.irradiance + ' W/m²' : '—');
    y = _kv(doc, y, 'Ambient Temp',     site.ambientTemp ? site.ambientTemp + ' °C' : '—');
    y += 2;

    if (site.notes) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
      doc.text('General Observations:', MARGIN, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
      const lines = doc.splitTextToSize(site.notes, CONTENT_W);
      doc.text(lines, MARGIN, y); y += lines.length * 4.5 + 4;
    }

    // --- SYSTEM CHECKS (IEC 62446-1 / PUCSL) ---
    const sc = session.systemChecks || {};
    if (Object.values(sc).some(v => v !== '' && v !== false)) {
      if (y > 220) { doc.addPage(); y = 20; }
      y = _sectionTitle(doc, y, 'System Checks — IEC 62446-1 / PUCSL');

      function scRow(label, val) {
        if (!val) return;
        const color = val === 'Pass' ? SUCCESS : val === 'Fail' ? DANGER : DARK;
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED);
        doc.text(label + ':', MARGIN, y);
        doc.setFont('helvetica', val === 'Pass' || val === 'Fail' ? 'bold' : 'normal');
        doc.setTextColor(...color);
        doc.text(String(val), MARGIN + 65, y);
        doc.setTextColor(...DARK);
        y += 5.5;
      }

      scRow('SPD — DC Side (IEC 61643-32 / SLS 1522)',  sc.spd_dc);
      scRow('SPD — AC Side',                            sc.spd_ac);
      scRow('Earthing Continuity (IEC 60364-7-712)',    sc.earthing_cont);
      if (sc.earthing_resistance) scRow('Earth Resistance',  sc.earthing_resistance + ' Ω');
      scRow('Cable Condition',                          sc.cable_condition);
      scRow('UV-Resistant Cables',                      sc.cable_uv);
      scRow('Cable Routing / Support',                  sc.cable_routing);
      scRow('Module Mounting / Structure (IEC 61730)',  sc.array_mounting);
      scRow('Module Labelling',                         sc.module_labelling);
      scRow('String / Combiner Labelling',              sc.string_labelling);
      scRow('Inverter Display / Alarms',                sc.inverter_display);
      scRow('Grid Connection Approval',                 sc.grid_connection);
      if (sc.ir_array)    scRow('Array IR Test (DC to Earth)',  sc.ir_array + ' MΩ — ' + (parseFloat(sc.ir_array) >= irMinMOhm ? 'PASS' : `FAIL < ${irMinMOhm} MΩ`));
      if (sc.pr_measured) scRow('Performance Ratio (Measured)', sc.pr_measured + '%');
      if (sc.pr_expected) scRow('Performance Ratio (Expected)', sc.pr_expected + '%');

      y += 2;
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(sc.commissioning_ok ? SUCCESS : MUTED));
      doc.text('Commissioning Tests Complete (IEC 62446-1): ' + (sc.commissioning_ok ? 'YES' : 'NO'), MARGIN, y); y += 5.5;
      doc.setTextColor(...(sc.pucsl_compliant ? SUCCESS : MUTED));
      doc.text('PUCSL Guidelines Compliance Confirmed: ' + (sc.pucsl_compliant ? 'YES' : 'NO'), MARGIN, y); y += 8;
      doc.setTextColor(...DARK);
    }

    // --- SUMMARY ---
    const totalStrings = session.strings.length;
    const faultStrings = session.strings.filter(s =>
      s.visual && (s.visual.hotspot || s.visual.crack || s.visual.connector || s.visual.earthing || s.visual.delamination || s.visual.jbox || s.visual.frame)
    ).length;
    const soiledStrings = session.strings.filter(s => s.visual && s.visual.soiling).length;
    const irFails = session.strings.filter(s => s.IR !== '' && s.IR !== undefined && parseFloat(s.IR) < irMinMOhm).length;

    y = _sectionTitle(doc, y, 'Inspection Summary');
    y = _kv(doc, y, 'Total Strings Inspected', totalStrings);
    y = _kv(doc, y, 'Strings with Visual Defects', faultStrings + (faultStrings > 0 ? ' !' : ' OK'));
    y = _kv(doc, y, 'Strings with Heavy Soiling', soiledStrings);
    if (irFails > 0) y = _kv(doc, y, `Strings with IR < ${irMinMOhm} MΩ (FAIL)`, irFails + ' — DO NOT ENERGISE');
    y += 3;

    // --- STRING TABLE ---
    if (session.strings.length > 0) {
      y = _sectionTitle(doc, y, 'String Measurement & Visual Inspection');

      const rows = session.strings.map(s => {
        const v = s.visual || {};
        const hasDefect = v.hotspot || v.crack || v.connector || v.earthing || v.delamination || v.jbox || v.frame;
        const defects = [
          v.hotspot      ? 'Hotspot'       : null,
          v.crack        ? 'Crack'         : null,
          v.soiling      ? 'Soiling'       : null,
          v.delamination ? 'Delamination'  : null,
          v.yellowing    ? 'Yellowing'     : null,
          v.jbox         ? 'J-Box'         : null,
          v.connector    ? 'MC4'           : null,
          v.earthing     ? 'Earthing'      : null,
          v.frame        ? 'Frame'         : null,
        ].filter(Boolean).join(', ');

        const irVal = s.IR !== '' && s.IR !== undefined ? parseFloat(s.IR) : null;
        const irFail = irVal !== null && irVal < irMinMOhm;

        return {
          label: s.label,
          Voc: s.Voc !== '' ? parseFloat(s.Voc).toFixed(1) : '—',
          Isc: s.Isc !== '' ? parseFloat(s.Isc).toFixed(2) : '—',
          IR: irVal !== null ? irVal.toFixed(2) + (irFail ? ' FAIL' : ' OK') : '—',
          defects: defects || 'None',
          notes: s.notes || '',
          _hasDefect: hasDefect || irFail,
          _soiling: v.soiling && !hasDefect
        };
      });

      doc.autoTable({
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['String', 'Voc (V)', 'Isc (A)', 'IR (MΩ)', 'Visual Defects', 'Notes']],
        body: rows.map(r => [r.label, r.Voc, r.Isc, r.IR, r.defects, r.notes]),
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: PRIMARY, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 20, fontStyle: 'bold' },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 50 },
          5: { cellWidth: 'auto' }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const row = rows[data.row.index];
            if (row._hasDefect) data.cell.styles.fillColor = BG_FAIL;
            else if (row._soiling) data.cell.styles.fillColor = BG_WARN;
          }
        },
        alternateRowStyles: { fillColor: [249, 250, 251] }
      });

      y = doc.lastAutoTable.finalY + 6;
    }

    // --- DEFECT SUMMARY ---
    const defectStrings = session.strings.filter(s =>
      s.visual.hotspot || s.visual.crack || s.visual.soiling || s.visual.connector || s.visual.earthing
    );

    if (defectStrings.length) {
      // Check if we need a new page
      if (y > 240) { doc.addPage(); y = 20; }
      y = _sectionTitle(doc, y, 'Defects Requiring Attention');

      defectStrings.forEach(s => {
        const items = [];
        if (s.visual.hotspot)   items.push('Hotspot detected — infrared verification recommended');
        if (s.visual.crack)     items.push('Physical crack/damage — module replacement required');
        if (s.visual.soiling)   items.push('Heavy soiling — cleaning required to restore performance');
        if (s.visual.connector) items.push('MC4 connector issue — inspect and re-terminate');
        if (s.visual.earthing)  items.push('Earthing/bonding issue — check continuity and connections');

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...DARK);
        doc.text(s.label + ':', MARGIN, y);
        y += 4.5;

        items.forEach(item => {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...DANGER);
          doc.text('  • ' + item, MARGIN, y);
          y += 4.5;
        });

        if (s.notes) {
          doc.setTextColor(...MUTED);
          doc.text('  Note: ' + s.notes, MARGIN, y);
          y += 4.5;
        }
        y += 2;
      });
    }

    // --- SIGNATURE ---
    if (y > 250) { doc.addPage(); y = 20; }
    y += 8;
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN + 70, y);
    doc.line(PAGE_W - MARGIN - 70, y, PAGE_W - MARGIN, y);
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text('Inspector Signature', MARGIN, y);
    doc.text('Client / Site Representative', PAGE_W - MARGIN - 70, y);
    y += 4;
    doc.text(site.inspector || '', MARGIN, y);
    doc.text(site.date || '', MARGIN + 40, y);

    _addFooter(doc);

    const filename = `SolarPV_Inspection_${(site.projectName || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}_${(site.date || '').replace(/-/g, '')}.pdf`;
    doc.save(filename);
    App.toast('PDF saved: ' + filename, 'success');
  }

  function _csvCell(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function _downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function _fmt(value, digits) {
    return (typeof value === 'number' && isFinite(value)) ? value.toFixed(digits) : String(value ?? '');
  }

  function _projectLabel() {
    try {
      const raw = localStorage.getItem('solarpv_settings');
      if (!raw) return '';
      const settings = JSON.parse(raw);
      return settings.company || '';
    } catch (_) {
      return '';
    }
  }

  function _filePart(text, fallback) {
    return String(text || fallback || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback;
  }

  function downloadFieldTestCSV(data) {
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      App.toast('No field test results to export', 'warning');
      return;
    }

    const header = [
      'String',
      'Voc_measured_V',
      'Voc_corrected_STC_V',
      'Voc_expected_STC_V',
      'Voc_deviation_percent',
      'Voc_status',
      'Isc_measured_A',
      'Isc_corrected_STC_A',
      'Isc_expected_STC_A',
      'Isc_deviation_percent',
      'Isc_status',
    ];

    const rows = data.results.map(r => ([
      r.label,
      _fmt(r.Voc_meas, 1),
      _fmt(r.Voc_corrected, 1),
      _fmt(r.Voc_expected, 1),
      _fmt(r.devVoc, 2),
      r.passVoc ? 'PASS' : 'FAIL',
      _fmt(r.Isc_meas, 2),
      _fmt(r.Isc_corrected, 2),
      _fmt(r.Isc_expected, 2),
      _fmt(r.devIsc, 2),
      r.passIsc ? 'PASS' : 'FAIL',
    ]));

    const csv = [header, ...rows]
      .map(row => row.map(_csvCell).join(','))
      .join('\n');
    const filename = `SolarPV_FieldTest_${_filePart(data.panel && data.panel.model, 'Report')}_${_filePart(data.date, 'date')}.csv`;
    _downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
    App.toast('CSV saved: ' + filename, 'success');
  }

  function downloadFaultCSV(data) {
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      App.toast('No fault-check results to export', 'warning');
      return;
    }

    const header = [
      'String',
      'Voc_measured_V',
      'Voc_percent',
      'Isc_measured_A',
      'Isc_percent',
      'Severity',
      'Fault',
      'Detail',
    ];

    const rows = data.results.map(r => {
      if (r.skipped) return [r.label, '', '', '', '', 'SKIPPED', 'No Data', 'No measurement entered'];
      const vPct = data.Voc_exp > 0 ? (r.Voc / data.Voc_exp) * 100 : null;
      const iPct = data.Isc_exp > 0 ? (r.Isc / data.Isc_exp) * 100 : null;
      return [
        r.label,
        _fmt(r.Voc, 1),
        vPct !== null ? vPct.toFixed(1) : '',
        _fmt(r.Isc, 2),
        iPct !== null ? iPct.toFixed(1) : '',
        (r.severity || '').toUpperCase(),
        r.fault || '',
        r.detail || '',
      ];
    });

    const csv = [header, ...rows]
      .map(row => row.map(_csvCell).join(','))
      .join('\n');
    const filename = `SolarPV_FaultCheck_${_filePart(data.panel && data.panel.model, 'Report')}_${_filePart(data.date, 'date')}.csv`;
    _downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
    App.toast('CSV saved: ' + filename, 'success');
  }

  function generateFieldTest(data) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      App.toast('No field test results to export', 'warning');
      return;
    }

    const doc = _doc();
    const panelName = data.panel ? `${data.panel.manufacturer} ${data.panel.model}` : 'Unknown panel';
    const subtitle = `Date: ${data.date || '-'} | Panel: ${panelName} | Company: ${_projectLabel() || '-'}`;
    let y = _addHeader(doc, 'Field Test vs STC', subtitle, _standardsAuditMeta({ profileId: data.profileId }));

    y = _sectionTitle(doc, y, 'Test Conditions');
    y = _kv(doc, y, 'Modules per String', data.n_mod);
    y = _kv(doc, y, 'Irradiance', `${data.G} W/m2`);
    y = _kv(doc, y, 'Module Temperature', `${data.T_mod} C`);
    y = _kv(doc, y, 'Total Strings', data.results.length);
    y += 2;

    const failCount = data.results.filter(r => !r.passVoc || !r.passIsc).length;
    const profile = _defaultFieldProfile();
    const vocTol = Number(data.tolerances && Number.isFinite(Number(data.tolerances.vocPct)) ? data.tolerances.vocPct : profile.vocTolPct);
    const iscTol = Number(data.tolerances && Number.isFinite(Number(data.tolerances.iscPct)) ? data.tolerances.iscPct : profile.iscTolPct);
    y = _sectionTitle(doc, y, 'Summary');
    y = _kv(doc, y, 'Overall Status', failCount === 0 ? 'PASS' : `${failCount} String(s) Fail`);
    y = _kv(doc, y, 'Pass Criteria', `Voc +/-${vocTol.toFixed(1)}%, Isc +/-${iscTol.toFixed(1)}%`);
    y += 2;

    const rows = data.results.map(r => ({
      label: r.label,
      vocM: r.Voc_meas.toFixed(1),
      vocC: r.Voc_corrected.toFixed(1),
      vocE: r.Voc_expected.toFixed(1),
      vocD: `${r.devVoc >= 0 ? '+' : ''}${r.devVoc.toFixed(2)}% ${r.passVoc ? 'PASS' : 'FAIL'}`,
      iscM: r.Isc_meas.toFixed(2),
      iscC: r.Isc_corrected.toFixed(2),
      iscE: r.Isc_expected.toFixed(2),
      iscD: `${r.devIsc >= 0 ? '+' : ''}${r.devIsc.toFixed(2)}% ${r.passIsc ? 'PASS' : 'FAIL'}`,
      _bad: !r.passVoc || !r.passIsc,
    }));

    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['String', 'Voc Meas', 'Voc Corr', 'Voc Exp', 'Voc Dev', 'Isc Meas', 'Isc Corr', 'Isc Exp', 'Isc Dev']],
      body: rows.map(r => [r.label, r.vocM, r.vocC, r.vocE, r.vocD, r.iscM, r.iscC, r.iscE, r.iscD]),
      styles: { fontSize: 7.2, cellPadding: 2.2 },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      didParseCell: (ctx) => {
        if (ctx.section === 'body') {
          const row = rows[ctx.row.index];
          if (row && row._bad) ctx.cell.styles.fillColor = BG_FAIL;
        }
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    _addFooter(doc);
    const filename = `SolarPV_FieldTest_${_filePart(data.panel && data.panel.model, 'Report')}_${_filePart(data.date, 'date')}.pdf`;
    doc.save(filename);
    App.toast('PDF saved: ' + filename, 'success');
  }

  function generateFault(data) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      App.toast('No fault-check results to export', 'warning');
      return;
    }

    const doc = _doc();
    const panelName = data.panel ? `${data.panel.manufacturer} ${data.panel.model}` : 'Unknown panel';
    const subtitle = `Date: ${data.date || '-'} | Panel: ${panelName} | Company: ${_projectLabel() || '-'}`;
    let y = _addHeader(doc, 'String Fault Check Report', subtitle);

    const validRows = data.results.filter(r => !r.skipped);
    const faultCount = validRows.filter(r => r.severity === 'fault').length;
    const warnCount = validRows.filter(r => r.severity === 'warning').length;

    y = _sectionTitle(doc, y, 'Reference');
    y = _kv(doc, y, 'Expected Voc', `${_fmt(data.Voc_exp, 1)} V`);
    y = _kv(doc, y, 'Expected Isc', `${_fmt(data.Isc_exp, 2)} A`);
    y = _kv(doc, y, 'Modules per String', data.n_mod);
    y += 2;

    y = _sectionTitle(doc, y, 'Summary');
    y = _kv(doc, y, 'Strings Evaluated', validRows.length);
    y = _kv(doc, y, 'Faults', faultCount);
    y = _kv(doc, y, 'Warnings', warnCount);
    y += 2;

    const rows = data.results.map(r => {
      if (r.skipped) {
        return { label: r.label, voc: '-', vPct: '-', isc: '-', iPct: '-', status: 'SKIPPED', fault: 'No Data', detail: 'No measurement entered', _severity: 'skip' };
      }
      const vPct = data.Voc_exp > 0 ? (r.Voc / data.Voc_exp) * 100 : 0;
      const iPct = data.Isc_exp > 0 ? (r.Isc / data.Isc_exp) * 100 : 0;
      return {
        label: r.label,
        voc: r.Voc.toFixed(1),
        vPct: `${vPct.toFixed(1)}%`,
        isc: r.Isc.toFixed(2),
        iPct: `${iPct.toFixed(1)}%`,
        status: String(r.severity || '').toUpperCase(),
        fault: r.fault || '',
        detail: r.detail || '',
        _severity: r.severity || 'ok',
      };
    });

    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['String', 'Voc', 'Voc %', 'Isc', 'Isc %', 'Status', 'Fault Type', 'Detail']],
      body: rows.map(r => [r.label, r.voc, r.vPct, r.isc, r.iPct, r.status, r.fault, r.detail]),
      styles: { fontSize: 7.0, cellPadding: 2.0 },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      didParseCell: (ctx) => {
        if (ctx.section !== 'body') return;
        const row = rows[ctx.row.index];
        if (!row) return;
        if (row._severity === 'fault') ctx.cell.styles.fillColor = BG_FAIL;
        else if (row._severity === 'warning') ctx.cell.styles.fillColor = BG_WARN;
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    _addFooter(doc);
    const filename = `SolarPV_FaultCheck_${_filePart(data.panel && data.panel.model, 'Report')}_${_filePart(data.date, 'date')}.pdf`;
    doc.save(filename);
    App.toast('PDF saved: ' + filename, 'success');
  }

  function downloadYieldCSV(data) {
    if (!data || !Array.isArray(data.monthly) || data.monthly.length === 0) {
      App.toast('No yield results to export', 'warning');
      return;
    }

    const header = [
      'Month',
      'GHI_kWh_m2_day',
      'H_poa_kWh_m2_day',
      'AmbientTemp_C',
      'CellTemp_C',
      'PR_percent',
      'DailyEnergy_kWh',
      'MonthlyEnergy_kWh',
    ];

    const rows = data.monthly.map(m => ([
      m.monthName,
      _fmt(m.GHI, 2),
      _fmt(m.H_poa, 2),
      _fmt(m.T_amb, 1),
      _fmt(m.T_cell, 1),
      _fmt((m.PR || 0) * 100, 1),
      _fmt(m.E_day, 2),
      _fmt(m.E_mon, 0),
    ]));

    const summary = data.summary || {};
    rows.push([
      'ANNUAL',
      _fmt(data.monthly.reduce((s, m) => s + (m.GHI || 0) * (m.days || 0), 0), 0),
      _fmt(summary.H_poa_annual, 0),
      '',
      _fmt(summary.T_cell_avg, 1),
      _fmt((summary.PR_avg || 0) * 100, 1),
      _fmt((summary.E_annual || 0) / 365, 2),
      _fmt(summary.E_annual, 0),
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(_csvCell).join(','))
      .join('\n');

    const locationName = data.location && data.location.name ? data.location.name : 'Location';
    const filename = `SolarPV_Yield_${_filePart(locationName, 'Location')}_${_filePart(data.date, 'date')}.csv`;
    _downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
    App.toast('CSV saved: ' + filename, 'success');
  }

  function generateYield(data) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    if (!data || !Array.isArray(data.monthly) || data.monthly.length === 0) {
      App.toast('No yield results to export', 'warning');
      return;
    }

    const doc = _doc();
    const locName = data.location && data.location.name ? data.location.name : 'Unknown location';
    const subtitle = `Date: ${data.date || '-'} | Location: ${locName} | Company: ${_projectLabel() || '-'}`;
    let y = _addHeader(doc, 'Yield Estimator Report', subtitle);

    const summary = data.summary || {};
    const system = data.system || {};
    const dcac = data.dcac || {};

    y = _sectionTitle(doc, y, 'System Inputs');
    y = _kv(doc, y, 'DC Capacity', `${_fmt(system.P_dc, 2)} kWp`);
    y = _kv(doc, y, 'AC Inverter', `${_fmt(system.P_ac, 2)} kW`);
    y = _kv(doc, y, 'Tilt / Azimuth', `${_fmt(system.tilt, 1)}° / ${_fmt(system.azimuth, 1)}°`);
    y = _kv(doc, y, 'NOCT', `${_fmt(system.NOCT, 1)} °C`);
    y = _kv(doc, y, 'DC/AC Ratio', _fmt(dcac.ratio, 2));
    y += 2;

    y = _sectionTitle(doc, y, 'Annual Summary');
    y = _kv(doc, y, 'Annual Energy', `${_fmt(summary.E_annual, 0)} kWh`);
    y = _kv(doc, y, 'Specific Yield', `${_fmt(summary.SY_annual, 0)} kWh/kWp`);
    y = _kv(doc, y, 'Average PR', `${_fmt((summary.PR_avg || 0) * 100, 1)} %`);
    y = _kv(doc, y, 'Annual POA Irradiance', `${_fmt(summary.H_poa_annual, 0)} kWh/m2`);
    y = _kv(doc, y, 'Average Cell Temp', `${_fmt(summary.T_cell_avg, 1)} °C`);
    y += 2;

    const rows = data.monthly.map(m => ([
      m.monthName,
      _fmt(m.GHI, 2),
      _fmt(m.H_poa, 2),
      _fmt(m.T_amb, 1),
      _fmt(m.T_cell, 1),
      _fmt((m.PR || 0) * 100, 1),
      _fmt(m.E_day, 2),
      _fmt(m.E_mon, 0),
    ]));

    rows.push([
      'ANNUAL',
      _fmt(data.monthly.reduce((s, m) => s + (m.GHI || 0) * (m.days || 0), 0), 0),
      _fmt(summary.H_poa_annual, 0),
      '',
      _fmt(summary.T_cell_avg, 1),
      _fmt((summary.PR_avg || 0) * 100, 1),
      _fmt((summary.E_annual || 0) / 365, 2),
      _fmt(summary.E_annual, 0),
    ]);

    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Month', 'GHI', 'H_poa', 'T_amb', 'T_cell', 'PR %', 'E/day', 'E/month']],
      body: rows,
      styles: { fontSize: 7.2, cellPadding: 2.2 },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      didParseCell: (ctx) => {
        if (ctx.section === 'body' && ctx.row.index === rows.length - 1) {
          ctx.cell.styles.fillColor = [245, 245, 245];
          ctx.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    _addFooter(doc);
    const filename = `SolarPV_Yield_${_filePart(locName, 'Location')}_${_filePart(data.date, 'date')}.pdf`;
    doc.save(filename);
    App.toast('PDF saved: ' + filename, 'success');
  }

  return {
    generateInspection,
    generateFieldTest,
    generateFault,
    downloadFieldTestCSV,
    downloadFaultCSV,
    downloadYieldCSV,
    generateYield,
  };
})();
