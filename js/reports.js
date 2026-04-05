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

  function _doc() {
    return new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  function _addHeader(doc, title, subtitle) {
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

    // Divider
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);

    return 38; // return y cursor
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
      if (sc.ir_array)    scRow('Array IR Test (DC to Earth)',  sc.ir_array + ' MΩ — ' + (parseFloat(sc.ir_array) >= 1 ? 'PASS' : 'FAIL < 1 MΩ'));
      if (sc.pr_measured) scRow('Performance Ratio (Measured)', sc.pr_measured + '%');
      if (sc.pr_expected) scRow('Performance Ratio (Expected)', sc.pr_expected + '%');

      y += 2;
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.setTextColor(sc.commissioning_ok ? ...SUCCESS : ...MUTED);
      doc.text('Commissioning Tests Complete (IEC 62446-1): ' + (sc.commissioning_ok ? 'YES' : 'NO'), MARGIN, y); y += 5.5;
      doc.setTextColor(sc.pucsl_compliant ? ...SUCCESS : ...MUTED);
      doc.text('PUCSL Guidelines Compliance Confirmed: ' + (sc.pucsl_compliant ? 'YES' : 'NO'), MARGIN, y); y += 8;
      doc.setTextColor(...DARK);
    }

    // --- SUMMARY ---
    const totalStrings = session.strings.length;
    const faultStrings = session.strings.filter(s =>
      s.visual && (s.visual.hotspot || s.visual.crack || s.visual.connector || s.visual.earthing || s.visual.delamination || s.visual.jbox || s.visual.frame)
    ).length;
    const soiledStrings = session.strings.filter(s => s.visual && s.visual.soiling).length;
    const irFails = session.strings.filter(s => s.IR !== '' && s.IR !== undefined && parseFloat(s.IR) < 1).length;

    y = _sectionTitle(doc, y, 'Inspection Summary');
    y = _kv(doc, y, 'Total Strings Inspected', totalStrings);
    y = _kv(doc, y, 'Strings with Visual Defects', faultStrings + (faultStrings > 0 ? ' !' : ' OK'));
    y = _kv(doc, y, 'Strings with Heavy Soiling', soiledStrings);
    if (irFails > 0) y = _kv(doc, y, 'Strings with IR < 1 MΩ (FAIL)', irFails + ' — DO NOT ENERGISE');
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
        const irFail = irVal !== null && irVal < 1;

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

  return { generateInspection };
})();
