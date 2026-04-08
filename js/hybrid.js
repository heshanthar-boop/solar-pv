/**
 * hybrid.js - Hybrid setup calculator (battery + PV + inverter sizing)
 */

const HybridSetup = (() => {
  const CHEMISTRY = {
    lifepo4: { label: 'LiFePO4', dod: 0.80, etaBatt: 0.95, note: 'High cycle life and high usable DoD.' },
    leadacid: { label: 'Lead-acid (AGM/GEL)', dod: 0.50, etaBatt: 0.85, note: 'Lower DoD recommended for life.' },
    tubular: { label: 'Tubular Lead-acid', dod: 0.60, etaBatt: 0.85, note: 'Common in Sri Lanka backup systems.' }
  };

  const DOD_TARGET = {
    lifepo4: { min: 0.70, max: 0.90 },
    leadacid: { min: 0.40, max: 0.60 },
    tubular: { min: 0.50, max: 0.70 },
  };

  const STANDARDS = [
    {
      id: 'iec62446',
      code: 'IEC 62446-1:2016',
      title: 'Commissioning Tests and Documentation',
      scope: 'Defines field-test and documentation baseline before energization.',
      points: [
        'Measure and verify string Voc against expected corrected values.',
        'Measure and record insulation resistance and earth continuity.',
        'Keep single-line diagram, labels, and as-built test records.'
      ],
      limits: [
        { p: 'Insulation resistance', v: '>= 1 megaohm @ 500V DC', n: 'DC+ to earth and DC- to earth separately.' },
        { p: 'Voc acceptance', v: 'about +/-2%', n: 'After temperature correction.' },
        { p: 'Isc acceptance', v: 'about +/-5%', n: 'After irradiance correction.' }
      ],
      calcs: [
        { n: 'Voc correction', f: 'Voc_T = Voc_STC x (1 + alphaVoc x (T - 25))', w: 'Expected field voltage.' },
        { n: 'Isc to STC', f: 'Isc_STC = Isc_meas / ((G/1000) x (1 + alphaIsc x (T - 25)))', w: 'Normalize test current.' },
        { n: 'IR pass/fail', f: 'PASS if IR >= 1 megaohm', w: 'Safety gate.' }
      ],
      k: ['commissioning', 'insulation', 'voc', 'isc']
    },
    {
      id: 'iec60364',
      code: 'IEC 60364-7-712:2017',
      title: 'Electrical Installations - PV Power Systems',
      scope: 'Wiring, isolation, protection, earthing, and cable sizing for PV/hybrid systems.',
      points: [
        'Use DC-rated isolators and overcurrent protection on PV circuits.',
        'Apply cable current factors and installation derating.',
        'Control voltage drop for stable MPPT and efficient operation.'
      ],
      limits: [
        { p: 'DC cable ampacity', v: '>= 1.25 x Isc', n: 'Before environmental derating factors.' },
        { p: 'Voltage drop targets', v: 'DC <= 1%, AC <= 3%', n: 'Common Sri Lanka engineering target.' },
        { p: 'Earth resistance target', v: '< 1 ohm', n: 'Practical target for surge/fault performance.' }
      ],
      calcs: [
        { n: 'Design current', f: 'I_design = 1.25 x Isc', w: 'Cable and fuse selection.' },
        { n: 'Voltage drop', f: 'V_drop = (2 x L x I x rho) / A', w: 'Cable CSA check.' },
        { n: 'Cable loss', f: 'P_loss = I^2 x R', w: 'Efficiency impact.' }
      ],
      k: ['cable', 'earthing', 'isolation', 'voltage drop']
    },
    {
      id: 'iec62109',
      code: 'IEC 62109-1/2',
      title: 'Safety of Power Converters',
      scope: 'Safety framework for inverter/charger hardware and protection behavior.',
      points: [
        'Converters need electrical and thermal protections.',
        'Grid-interactive models require anti-islanding behavior.',
        'Enclosure and installation class must suit environment.'
      ],
      limits: [
        { p: 'Outdoor enclosure (typical)', v: 'IP65 preferred', n: 'IP54 minimum for sheltered installations.' },
        { p: 'Voltage trip window (SL practice)', v: '207V-253V', n: 'Aligned with utility settings.' },
        { p: 'Frequency trip window (SL practice)', v: '49Hz-51Hz', n: 'Aligned with utility settings.' }
      ],
      calcs: [
        { n: 'Continuous sizing', f: 'P_cont = P_peak x safety_factor', w: 'Avoid overload trip.' },
        { n: 'Surge sizing', f: 'P_surge >= max(load_surge, 1.5 x P_cont)', w: 'Motor start reliability.' },
        { n: 'AC/DC ratio', f: 'ratio = P_inv_AC / P_pv_DC', w: 'Clipping and economics.' }
      ],
      k: ['inverter', 'converter', 'safety', 'anti-islanding']
    },
    {
      id: 'iec61427-62619',
      code: 'IEC 61427 / IEC 62619',
      title: 'Battery Performance and Safety',
      scope: 'Storage performance and safety reference for hybrid and backup systems.',
      points: [
        'Battery sizing must include DoD, efficiency, and reserve factors.',
        'Observe battery/BMS current limits and thermal requirements.',
        'Use chemistry-appropriate operational windows for lifetime.'
      ],
      limits: [
        { p: 'LiFePO4 design DoD', v: '70%-90%', n: 'Warranty curve from manufacturer is final.' },
        { p: 'Lead-acid design DoD', v: '40%-60%', n: 'Lower DoD generally improves life.' },
        { p: 'Charge C-rate (typical)', v: '<= 0.5C', n: 'Check exact battery datasheet.' }
      ],
      calcs: [
        { n: 'Battery energy sizing', f: 'E_nom = (E_day x autonomy x reserve) / (DoD x eta_batt x eta_inv x temp)', w: 'Main sizing equation.' },
        { n: 'Ah conversion', f: 'Ah = (kWh x 1000) / V_batt', w: 'Bank capacity in Ah.' },
        { n: 'C-rate estimate', f: 'C_rate = I_charge / Ah_bank', w: 'Charge stress check.' }
      ],
      k: ['battery', 'dod', 'c-rate', 'storage']
    },
    {
      id: 'sls1522',
      code: 'SLS 1522:2016',
      title: 'Sri Lanka PV Installation Code',
      scope: 'Sri Lanka code for PV installation, protection, earthing, and records.',
      points: [
        'DC SPD, DC isolator, and AC isolator are mandatory with correct ratings.',
        'Earthing and bonding must be verified and documented.',
        'Commissioning records are required for handover and utility process.'
      ],
      limits: [
        { p: 'SPD UC rating', v: '>= 1.2 x Voc_string_max', n: 'Use coldest-site string Voc.' },
        { p: 'Earthing target', v: '< 1 ohm', n: 'Measured and documented.' },
        { p: 'DC cable current basis', v: '>= 1.25 x Isc', n: 'Before derating.' }
      ],
      calcs: [
        { n: 'SPD selection', f: 'UC_min = 1.2 x Voc_string_max', w: 'SPD survivability.' },
        { n: 'String cold Voc', f: 'Voc_string = n x Voc_STC x (1 + alphaVoc x (Tmin - 25))', w: 'SPD and inverter max check.' },
        { n: 'Earthing verification', f: 'R_earth against project target (<1 ohm typical)', w: 'Safety/surge check.' }
      ],
      k: ['sls', '1522', 'spd', 'earthing', 'sri lanka']
    },
    {
      id: 'pucsl',
      code: 'PUCSL Rooftop Solar Guidelines',
      title: 'Sri Lanka Utility Interconnection Rules',
      scope: 'Utility-facing protection windows and compliance process for export-capable systems.',
      points: [
        'Use approved inverter settings and anti-islanding behavior.',
        'Protection windows must align with utility accepted ranges.',
        'Submit documents and obtain inspection/approval before export.'
      ],
      limits: [
        { p: 'Grid voltage window', v: '207V-253V', n: '230V +/-10% range.' },
        { p: 'Grid frequency window', v: '49Hz-51Hz', n: '50Hz +/-1Hz range.' },
        { p: 'Anti-islanding detect time', v: '<= 2 seconds', n: 'Reconnection delay typically >= 60s.' }
      ],
      calcs: [
        { n: 'Voltage compliance', f: 'PASS when 207 <= V_grid <= 253', w: 'Trip-window check.' },
        { n: 'Frequency compliance', f: 'PASS when 49 <= f_grid <= 51', w: 'Trip-window check.' },
        { n: 'Reconnection delay', f: 'delay >= 60s after stable return', w: 'Utility expectation.' }
      ],
      k: ['pucsl', 'grid code', 'voltage', 'frequency']
    },
    {
      id: 'sls1543',
      code: 'SLS 1543 / IEC 62109',
      title: 'Converter Safety (Sri Lanka Adoption)',
      scope: 'Sri Lanka-adopted inverter safety expectations for protection and enclosure.',
      points: [
        'Inverter protection settings should match approved utility profile.',
        'Thermal and fault protections should be active and validated.',
        'Installed model and documentation must match approved submission.'
      ],
      limits: [
        { p: 'Trip voltage', v: '207V-253V typical', n: 'Project utility profile governs.' },
        { p: 'Trip frequency', v: '49Hz-51Hz typical', n: 'Project utility profile governs.' },
        { p: 'Outdoor enclosure', v: 'IP65 preferred', n: 'Site exposure dependent.' }
      ],
      calcs: [
        { n: 'Thermal loading', f: 'loading = P_operating / P_rated', w: 'Overheating risk indicator.' },
        { n: 'Headroom check', f: 'P_rated >= P_peak x safety_factor', w: 'Operational margin.' },
        { n: 'Clipping check', f: 'high risk when PV DC much larger than inverter AC', w: 'Design optimization.' }
      ],
      k: ['sls 1543', 'trip', 'ip65', 'converter']
    },
    {
      id: 'sls1547',
      code: 'SLS 1547 / IEC 61727',
      title: 'Utility Interface Characteristics',
      scope: 'Grid interface quality metrics (THD, PF, reconnection) for grid-connected operation.',
      points: [
        'Keep harmonics and power factor within accepted limits.',
        'Prevent excessive voltage impact at point of connection.',
        'Apply reconnection delay after outages.'
      ],
      limits: [
        { p: 'Current THD', v: '<= 5%', n: 'At rated conditions.' },
        { p: 'Power factor', v: '>= 0.9 (unity preferred)', n: 'Utility/project dependent.' },
        { p: 'Reconnection delay', v: '>= 60 seconds', n: 'After stable voltage/frequency.' }
      ],
      calcs: [
        { n: 'THD check', f: 'PASS when THD <= 5%', w: 'Power quality compliance.' },
        { n: 'PF check', f: 'PASS when |PF| >= 0.9', w: 'Grid support compliance.' },
        { n: 'Voltage impact', f: 'DeltaV% = (V_poc - V_nom)/V_nom x 100', w: 'Weak-grid warning.' }
      ],
      k: ['sls 1547', 'thd', 'pf', 'reconnection']
    },
    {
      id: 'ceb-leco',
      code: 'CEB/LECO Approval Path (Sri Lanka Practice)',
      title: 'Export-Enabled Hybrid Utility Workflow',
      scope: 'Practical workflow checks before enabling grid export in Sri Lanka.',
      points: [
        'Submit SLD, protection settings, and equipment approvals with application.',
        'Use approved meter arrangement and accessible isolation points.',
        'Enable export only after utility inspection and final acceptance.'
      ],
      limits: [
        { p: 'Inverter status', v: 'Approved model/profile', n: 'Check latest accepted utility list.' },
        { p: 'Metering', v: 'Utility compliant bi-directional meter', n: 'Required for net-metering/net-accounting.' },
        { p: 'Submission quality', v: 'Complete package', n: 'Missing items usually delay energization.' }
      ],
      calcs: [
        { n: 'Readiness check', f: 'Ready if SLD + settings + reports + approvals complete', w: 'Submission quality gate.' },
        { n: 'Setting match', f: 'Commissioned inverter settings must equal submitted utility settings', w: 'Avoid rework at inspection.' },
        { n: 'Export gate', f: 'Export ON only after utility acceptance', w: 'Compliance control.' }
      ],
      sources: [
        {
          t: 'PUCSL Guidelines on Rooftop Solar PV Installation for Utility Providers (Revision 1, Sep 2022)',
          u: 'https://www.pucsl.gov.lk/wp-content/uploads/2022/10/Guidelines-on-Rooftop-Solar-PV-installation-for-Utility-Providers_Revision-1.pdf',
          n: 'Application package, process timeline, commissioning witness, agreement, and authorization flow.'
        },
        {
          t: 'CEB Net Metering/Net Accounting/Net Plus Addendum',
          u: 'https://ceb.lk/front_img/1608095391ADDENDEM.pdf',
          n: 'Written permission before parallel operation, meter clauses, and setting-change restrictions.'
        },
        {
          t: 'CEB Recommended Settings for Solar PV Inverters (2025-02-25)',
          u: 'https://www.ceb.lk/front_img/img_reports/1742277909Solar_Inverter_settings.pdf',
          n: 'Reference values for submitted vs commissioned profile matching.'
        }
      ],
      k: ['ceb', 'leco', 'approval', 'submission', 'export']
    }
  ];
  let stdQuery = '';

  function _esc(value) {
    if (typeof App !== 'undefined' && typeof App.escapeHTML === 'function') return App.escapeHTML(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render(container) {
    const s = App.state.hybridInputs || {
      dailyEnergy_kWh: 18, peakLoad_kW: 5, surgeLoad_kW: 8, autonomyDays: 1,
      batteryVoltage_V: 48, chemistry: 'lifepo4', dod: CHEMISTRY.lifepo4.dod, etaBatt: CHEMISTRY.lifepo4.etaBatt,
      etaInv: 0.93, tempDerate: 0.90, reserveFactor: 1.15, psh: 4.8, systemPR: 0.75,
      pvOversize: 1.15, inverterSafetyFactor: 1.25, chargeMargin: 1.25,
    };

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128267; Hybrid Setup Calculator</div>
        <div class="card">
          <div class="card-title">Load and Backup Target</div>
          <div class="form-row cols-2">
            <div class="form-group"><label class="form-label">Daily Energy (kWh/day)</label><input class="form-input" id="hy-e" type="number" min="0.1" step="0.1" value="${_esc(s.dailyEnergy_kWh)}" /></div>
            <div class="form-group"><label class="form-label">Autonomy (days)</label><input class="form-input" id="hy-auto" type="number" min="0.25" step="0.25" value="${_esc(s.autonomyDays)}" /></div>
            <div class="form-group"><label class="form-label">Peak Running Load (kW)</label><input class="form-input" id="hy-peak" type="number" min="0.1" step="0.1" value="${_esc(s.peakLoad_kW)}" /></div>
            <div class="form-group"><label class="form-label">Surge Load (kW)</label><input class="form-input" id="hy-surge" type="number" min="0.1" step="0.1" value="${_esc(s.surgeLoad_kW)}" /></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Battery Design Inputs</div>
          <div class="form-row cols-2">
            <div class="form-group"><label class="form-label">Battery Bus Voltage (V)</label><input class="form-input" id="hy-vbat" type="number" min="12" step="12" value="${_esc(s.batteryVoltage_V)}" /></div>
            <div class="form-group"><label class="form-label">Battery Chemistry</label><select class="form-select" id="hy-chem">${Object.entries(CHEMISTRY).map(([id, c]) => `<option value="${id}" ${id === s.chemistry ? 'selected' : ''}>${_esc(c.label)}</option>`).join('')}</select><div class="form-hint" id="hy-chem-note"></div></div>
            <div class="form-group"><label class="form-label">Design DoD (0-1)</label><input class="form-input" id="hy-dod" type="number" min="0.1" max="1" step="0.01" value="${_esc(s.dod)}" /></div>
            <div class="form-group"><label class="form-label">Battery Round-trip Efficiency (0-1)</label><input class="form-input" id="hy-etab" type="number" min="0.5" max="1" step="0.01" value="${_esc(s.etaBatt)}" /></div>
            <div class="form-group"><label class="form-label">Inverter Efficiency (0-1)</label><input class="form-input" id="hy-etai" type="number" min="0.5" max="1" step="0.01" value="${_esc(s.etaInv)}" /></div>
            <div class="form-group"><label class="form-label">Temperature Derate (0-1)</label><input class="form-input" id="hy-temp" type="number" min="0.5" max="1" step="0.01" value="${_esc(s.tempDerate)}" /></div>
            <div class="form-group"><label class="form-label">Reserve Factor</label><input class="form-input" id="hy-res" type="number" min="1" max="2" step="0.01" value="${_esc(s.reserveFactor)}" /></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">PV and Inverter Assumptions</div>
          <div class="form-row cols-2">
            <div class="form-group"><label class="form-label">Peak Sun Hours (PSH)</label><input class="form-input" id="hy-psh" type="number" min="1" step="0.1" value="${_esc(s.psh)}" /></div>
            <div class="form-group"><label class="form-label">System Performance Ratio (0-1)</label><input class="form-input" id="hy-pr" type="number" min="0.5" max="1" step="0.01" value="${_esc(s.systemPR)}" /></div>
            <div class="form-group"><label class="form-label">PV Oversize Factor</label><input class="form-input" id="hy-pv-over" type="number" min="1" max="2" step="0.01" value="${_esc(s.pvOversize)}" /></div>
            <div class="form-group"><label class="form-label">Inverter Safety Factor</label><input class="form-input" id="hy-inv-sf" type="number" min="1" max="2" step="0.01" value="${_esc(s.inverterSafetyFactor)}" /></div>
            <div class="form-group"><label class="form-label">Charge Current Margin</label><input class="form-input" id="hy-cc-margin" type="number" min="1" max="2" step="0.01" value="${_esc(s.chargeMargin)}" /></div>
          </div>
          <div class="btn-group"><button class="btn btn-primary" id="hy-calc-btn">Calculate Hybrid Setup</button></div>
        </div>
        <div id="hy-results" class="hidden"></div>
        <div id="hy-standards-host"></div>
      </div>
    `;

    container.querySelector('#hy-chem').addEventListener('change', () => _applyChemistryDefaults(container));
    container.querySelector('#hy-calc-btn').addEventListener('click', () => _calculate(container));
    _applyChemistryDefaults(container, false);
    _renderStandardsReference(container);
    if (App.state.hybridResult) _renderResults(container, App.state.hybridResult);
  }

  function _applyChemistryDefaults(container, overwriteInputs) {
    const overwrite = overwriteInputs !== false;
    const chemistryId = container.querySelector('#hy-chem').value;
    const c = CHEMISTRY[chemistryId] || CHEMISTRY.lifepo4;
    if (overwrite) {
      container.querySelector('#hy-dod').value = c.dod;
      container.querySelector('#hy-etab').value = c.etaBatt;
    }
    container.querySelector('#hy-chem-note').textContent = c.note;
  }

  function _v(container, id) { return parseFloat(container.querySelector(id).value); }

  function _calculate(container) {
    const inputs = {
      dailyEnergy_kWh: _v(container, '#hy-e'), autonomyDays: _v(container, '#hy-auto'),
      peakLoad_kW: _v(container, '#hy-peak'), surgeLoad_kW: _v(container, '#hy-surge'),
      batteryVoltage_V: _v(container, '#hy-vbat'), chemistry: container.querySelector('#hy-chem').value,
      dod: _v(container, '#hy-dod'), etaBatt: _v(container, '#hy-etab'), etaInv: _v(container, '#hy-etai'),
      tempDerate: _v(container, '#hy-temp'), reserveFactor: _v(container, '#hy-res'),
      psh: _v(container, '#hy-psh'), systemPR: _v(container, '#hy-pr'), pvOversize: _v(container, '#hy-pv-over'),
      inverterSafetyFactor: _v(container, '#hy-inv-sf'), chargeMargin: _v(container, '#hy-cc-margin'),
    };
    if (Object.values(inputs).some(v => typeof v === 'number' && Number.isNaN(v))) { App.toast('Please fill all numeric fields', 'error'); return; }

    const battery = PVCalc.batteryCapacity(inputs.dailyEnergy_kWh, inputs.autonomyDays, inputs.dod, inputs.etaBatt, inputs.etaInv, inputs.tempDerate, inputs.reserveFactor);
    const pv = PVCalc.hybridPVCapacity(inputs.dailyEnergy_kWh, inputs.psh, inputs.systemPR, inputs.pvOversize);
    const inverter = PVCalc.hybridInverterCapacity(inputs.peakLoad_kW, inputs.surgeLoad_kW, inputs.inverterSafetyFactor);
    const batteryAh = battery ? PVCalc.batteryAhAtVoltage(battery.requiredNominal_kWh, inputs.batteryVoltage_V) : null;
    const charge = pv ? PVCalc.hybridChargeCurrent(pv.recommended_kWp, inputs.batteryVoltage_V, inputs.chargeMargin) : null;
    if (!battery || !pv || !inverter || !batteryAh || !charge) { App.toast('Invalid inputs. Check fractions and positive values.', 'error'); return; }

    const warnings = [];
    if (inputs.batteryVoltage_V <= 48 && inverter.requiredContinuous_kW > 8) warnings.push('High power on low battery voltage can cause high DC current. Consider 96V architecture.');
    if (charge.current_A > 120) warnings.push('Estimated PV charge current is high. Consider higher battery bus voltage or multiple MPPT channels.');
    if (inputs.psh < 4.5) warnings.push('Low PSH assumption selected. Verify monsoon-season energy sufficiency.');

    const result = {
      date: typeof App.localDateISO === 'function' ? App.localDateISO() : new Date().toISOString().slice(0, 10),
      inputs, chemistryLabel: (CHEMISTRY[inputs.chemistry] || CHEMISTRY.lifepo4).label,
      battery, batteryAh, pv, inverter, charge, warnings,
    };
    App.state.hybridInputs = inputs;
    App.state.hybridResult = result;
    _renderResults(container, result);
    _renderStandardsReference(container);
    App.toast('Hybrid sizing completed', 'success');
  }

  function _renderResults(container, r) {
    const out = container.querySelector('#hy-results');
    out.classList.remove('hidden');
    const summary = _summaryText(r);
    const warningHtml = r.warnings.length ? `<div class="card">${r.warnings.map(w => `<div class="warn-box">${_esc(w)}</div>`).join('')}</div>` : '';
    out.innerHTML = `
      <div class="card">
        <div class="card-title">Sizing Summary (${_esc(r.date)})</div>
        <div class="result-grid">
          ${_box(`${r.battery.requiredNominal_kWh.toFixed(1)} kWh`, 'Battery Nominal Capacity')}
          ${_box(`${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V}V`, 'Battery Bank Equivalent')}
          ${_box(`${r.pv.recommended_kWp.toFixed(2)} kWp`, 'Recommended PV DC Size')}
          ${_box(`${r.inverter.suggestedNameplate_kW.toFixed(1)} kW`, 'Suggested Inverter Nameplate')}
          ${_box(`${r.inverter.requiredContinuous_kW.toFixed(2)} kW`, 'Required Continuous Inverter')}
          ${_box(`${r.inverter.requiredSurge_kW.toFixed(2)} kW`, 'Required Surge Inverter')}
          ${_box(`${r.charge.current_A.toFixed(1)} A`, 'Estimated Charge Current')}
          ${_box(`${(r.battery.totalEfficiency * 100).toFixed(1)}%`, 'Battery x Inverter x Temp Efficiency')}
        </div>
        <div class="btn-group" style="margin-top:10px">
          <button class="btn btn-secondary btn-sm" id="hy-copy-btn">Copy Design Summary</button>
          <button class="btn btn-secondary btn-sm" id="hy-print-btn">Print Learning Report</button>
          <button class="btn btn-success btn-sm" id="hy-pdf-btn">Export PDF</button>
          <button class="btn btn-secondary btn-sm" id="hy-docx-btn">Export DOCX</button>
        </div>
      </div>
      ${warningHtml}
    `;
    const copyBtn = out.querySelector('#hy-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (typeof App.copyText === 'function') App.copyText(summary);
        else window.prompt('Copy this summary:', summary);
      });
    }
    const printBtn = out.querySelector('#hy-print-btn');
    if (printBtn) printBtn.addEventListener('click', () => _printLearningReport(r));

    const pdfBtn = out.querySelector('#hy-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => _exportLearningPDF(r));

    const docxBtn = out.querySelector('#hy-docx-btn');
    if (docxBtn) docxBtn.addEventListener('click', () => _exportLearningDOCX(r));

    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _summaryText(r) {
    return [
      `Hybrid Setup Summary (${r.date})`,
      `Chemistry: ${r.chemistryLabel}`,
      `Battery nominal: ${r.battery.requiredNominal_kWh.toFixed(2)} kWh`,
      `Battery equivalent: ${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V}V`,
      `PV recommended: ${r.pv.recommended_kWp.toFixed(2)} kWp`,
      `Inverter continuous: ${r.inverter.requiredContinuous_kW.toFixed(2)} kW`,
      `Inverter surge: ${r.inverter.requiredSurge_kW.toFixed(2)} kW`,
      `Charge current: ${r.charge.current_A.toFixed(1)} A`,
      '',
      'References: IEC 60364-7-712, IEC 62109, IEC 62446-1, IEC 61427/62619, SLS 1522, PUCSL, SLS 1543, SLS 1547'
    ].join('\n');
  }

  function _box(value, label) { return `<div class="result-box"><div class="result-value">${_esc(value)}</div><div class="result-label">${_esc(label)}</div></div>`; }

  function _renderStandardsReference(container) {
    const host = container.querySelector('#hy-standards-host');
    if (!host) return;

    host.innerHTML = `
      <div class="card">
        <div class="card-title">Standards Reference</div>
        <div id="hy-std-count" class="info-box"></div>
        <div class="form-group">
          <label class="form-label">Search standards, keywords, limits</label>
          <input class="form-input" id="hy-std-search" value="${_esc(stdQuery)}" placeholder="IEC 62446, SLS 1522, anti-islanding, 207, THD, DoD..." />
        </div>
        <div id="hy-std-live"></div>
        <div id="hy-std-list"></div>
      </div>
    `;

    const input = host.querySelector('#hy-std-search');
    input.addEventListener('input', () => {
      stdQuery = String(input.value || '').trim().toLowerCase();
      _renderStandardList(host, App.state.hybridResult);
    });

    _renderStandardList(host, App.state.hybridResult);
  }

  function _renderStandardList(host, result) {
    const filtered = STANDARDS.filter(s => _matchStd(s, stdQuery));
    const countEl = host.querySelector('#hy-std-count');
    countEl.textContent = `${filtered.length} of ${STANDARDS.length} standards shown - IEC international and Sri Lanka practice references.`;

    host.querySelector('#hy-std-live').innerHTML = _liveFigurePanel(result);

    const listEl = host.querySelector('#hy-std-list');
    if (!filtered.length) {
      listEl.innerHTML = '<div class="warn-box">No match. Try: SPD, insulation, 207, 253, THD, DoD.</div>';
      return;
    }
    listEl.innerHTML = filtered.map((s, idx) => _stdCard(s, idx)).join('');
  }

  function _matchStd(s, q) {
    if (!q) return true;
    const hay = [
      s.code, s.title, s.scope,
      ...s.points,
      ...s.k,
      ...s.limits.map(x => `${x.p} ${x.v} ${x.n}`),
      ...s.calcs.map(x => `${x.n} ${x.f} ${x.w}`),
      ...(s.sources || []).map(x => `${x.t} ${x.n || ''}`)
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function _stdCard(s, idx) {
    return `
      <details class="card" ${idx === 0 && !stdQuery ? 'open' : ''}>
        <summary style="cursor:pointer;list-style:none">
          <div class="card-title" style="margin-bottom:6px">${_esc(s.code)}</div>
          <div class="fw-bold">${_esc(s.title)}</div>
          <div class="text-sm text-muted mt-4">${_esc(s.scope)}</div>
        </summary>
        <div class="mt-12">
          <div class="section-title">What This Standard Requires</div>
          ${s.points.map(p => `<div class="text-sm mt-4">&#8226; ${_esc(p)}</div>`).join('')}

          <div class="section-title">Key Limits and Figures</div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead><tr><th>Parameter</th><th>Limit / Value</th><th>Note</th></tr></thead>
              <tbody>
                ${s.limits.map(x => `<tr><td><strong>${_esc(x.p)}</strong></td><td>${_esc(x.v)}</td><td>${_esc(x.n)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>

          ${(s.sources || []).length ? `
            <div class="section-title">Primary Source Documents</div>
            <div style="overflow-x:auto">
              <table class="status-table">
                <thead><tr><th>Document</th><th>Scope</th></tr></thead>
                <tbody>
                  ${(s.sources || []).map(x => `<tr><td><a href="${_esc(x.u)}" target="_blank" rel="noopener noreferrer">${_esc(x.t)}</a></td><td>${_esc(x.n || '')}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="section-title">Related Calculations</div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead><tr><th>Calculation</th><th>Formula / Check</th><th>Purpose</th></tr></thead>
              <tbody>
                ${s.calcs.map(x => `<tr><td><strong>${_esc(x.n)}</strong></td><td><code>${_esc(x.f)}</code></td><td>${_esc(x.w)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    `;
  }

  function _liveFigurePanel(result) {
    if (!result) {
      return `<div class="warn-box">Run <strong>Calculate Hybrid Setup</strong> to show worked formulas and limit checks for your current design.</div>`;
    }

    const i = result.inputs;
    const acdc = result.inverter.suggestedNameplate_kW / result.pv.recommended_kWp;
    const cRate = result.charge.current_A / Math.max(result.batteryAh, 0.0001);
    const dodBand = DOD_TARGET[i.chemistry] || DOD_TARGET.lifepo4;

    const dodState = i.dod >= dodBand.min && i.dod <= dodBand.max ? 'pass' : 'warn';
    const acdcState = acdc >= 0.85 && acdc <= 1.05 ? 'pass' : (acdc >= 0.75 && acdc <= 1.2 ? 'warn' : 'fail');
    const cRateState = cRate <= 0.5 ? 'pass' : (cRate <= 0.7 ? 'warn' : 'fail');

    return `
      <div class="card" style="margin-top:8px">
        <div class="card-title">Worked Figures From Current Inputs</div>
        <div class="info-box">
          <code>E_nom = (${i.dailyEnergy_kWh.toFixed(2)} x ${i.autonomyDays.toFixed(2)} x ${i.reserveFactor.toFixed(2)}) / (${i.dod.toFixed(2)} x ${i.etaBatt.toFixed(2)} x ${i.etaInv.toFixed(2)} x ${i.tempDerate.toFixed(2)}) = ${result.battery.requiredNominal_kWh.toFixed(2)} kWh</code>
          <br><code>P_dc = ${i.dailyEnergy_kWh.toFixed(2)} / (${i.psh.toFixed(2)} x ${i.systemPR.toFixed(2)}) = ${result.pv.base_kWp.toFixed(2)} kWp</code> (recommended ${result.pv.recommended_kWp.toFixed(2)} kWp)
          <br><code>P_cont = ${i.peakLoad_kW.toFixed(2)} x ${i.inverterSafetyFactor.toFixed(2)} = ${result.inverter.requiredContinuous_kW.toFixed(2)} kW</code>
        </div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead><tr><th>Practical Check</th><th>Current</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><strong>Design DoD (${_esc(result.chemistryLabel)})</strong></td><td>${(i.dod * 100).toFixed(1)}%</td><td>${(dodBand.min * 100).toFixed(0)}%-${(dodBand.max * 100).toFixed(0)}%</td><td>${_statusBadge(dodState)}</td></tr>
              <tr><td><strong>AC/DC ratio</strong></td><td>${acdc.toFixed(2)}</td><td>0.85-1.05 (grid-coupled typical)</td><td>${_statusBadge(acdcState)}</td></tr>
              <tr><td><strong>Charge C-rate</strong></td><td>${cRate.toFixed(3)} C</td><td><= 0.50 C typical</td><td>${_statusBadge(cRateState)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function _statusBadge(state) {
    if (state === 'pass') return '<span class="status-badge badge-pass">PASS</span>';
    if (state === 'warn') return '<span class="status-badge badge-warn">CHECK</span>';
    return '<span class="status-badge badge-fail">FAIL</span>';
  }

  function _learningContext(r) {
    const i = r.inputs;
    const acdc = r.inverter.suggestedNameplate_kW / Math.max(r.pv.recommended_kWp, 0.0001);
    const cRate = r.charge.current_A / Math.max(r.batteryAh, 0.0001);
    const dodBand = DOD_TARGET[i.chemistry] || DOD_TARGET.lifepo4;

    const checks = [
      {
        check: `Design DoD (${r.chemistryLabel})`,
        value: `${(i.dod * 100).toFixed(1)}%`,
        target: `${(dodBand.min * 100).toFixed(0)}% - ${(dodBand.max * 100).toFixed(0)}%`,
        status: i.dod >= dodBand.min && i.dod <= dodBand.max ? 'pass' : 'warn',
        note: 'Cycle-life and warranty sensitivity check.'
      },
      {
        check: 'AC/DC ratio',
        value: acdc.toFixed(2),
        target: '0.85 - 1.05 typical',
        status: acdc >= 0.85 && acdc <= 1.05 ? 'pass' : (acdc >= 0.75 && acdc <= 1.2 ? 'warn' : 'fail'),
        note: 'Higher mismatch can increase clipping or cost inefficiency.'
      },
      {
        check: 'Charge C-rate',
        value: `${cRate.toFixed(3)} C`,
        target: '<= 0.50 C typical',
        status: cRate <= 0.5 ? 'pass' : (cRate <= 0.7 ? 'warn' : 'fail'),
        note: 'Validate against exact battery/BMS datasheet current limits.'
      },
      {
        check: 'Battery bus suitability',
        value: `${i.batteryVoltage_V.toFixed(0)}V @ ${r.inverter.requiredContinuous_kW.toFixed(2)}kW`,
        target: '48V+ for medium systems; 96V often preferred at higher power',
        status: (i.batteryVoltage_V >= 48 || r.inverter.requiredContinuous_kW <= 6) ? 'pass' : 'warn',
        note: 'Higher bus voltage reduces cable current and copper losses.'
      }
    ];

    const assumptions = [
      ['Daily load', `${i.dailyEnergy_kWh.toFixed(2)} kWh/day`, 'Measured/estimated AC energy demand.'],
      ['Autonomy', `${i.autonomyDays.toFixed(2)} day`, 'Battery support duration during low PV input.'],
      ['Battery chemistry', r.chemistryLabel, 'Defines typical DoD and efficiency behavior.'],
      ['DoD', `${(i.dod * 100).toFixed(1)}%`, 'Usable fraction of nominal battery energy.'],
      ['Battery efficiency', `${(i.etaBatt * 100).toFixed(1)}%`, 'Round-trip energy efficiency assumption.'],
      ['Inverter efficiency', `${(i.etaInv * 100).toFixed(1)}%`, 'AC conversion efficiency assumption.'],
      ['Temperature derate', `${(i.tempDerate * 100).toFixed(1)}%`, 'Capacity/performance reduction due to site temperature.'],
      ['Reserve factor', i.reserveFactor.toFixed(2), 'Cloud/aging/design reserve multiplier.'],
      ['Peak sun hours', `${i.psh.toFixed(2)} h/day`, 'Site irradiation assumption.'],
      ['System PR', `${(i.systemPR * 100).toFixed(1)}%`, 'Aggregate PV system performance ratio.'],
      ['PV oversize factor', i.pvOversize.toFixed(2), 'Monsoon/seasonal generation margin.'],
      ['Inverter safety factor', i.inverterSafetyFactor.toFixed(2), 'Continuous power design margin.'],
      ['Charge current margin', i.chargeMargin.toFixed(2), 'Controller/current headroom factor.'],
    ];

    const formulaRows = [
      ['Battery nominal energy', 'E_nom = (E_day x autonomy x reserve) / (DoD x eta_batt x eta_inv x temp)'],
      ['Battery Ah conversion', 'Ah = (kWh x 1000) / V_batt'],
      ['PV base sizing', 'P_dc = E_day / (PSH x PR)'],
      ['PV recommended sizing', 'P_dc_rec = P_dc x oversize_factor'],
      ['Inverter continuous', 'P_cont = P_peak x safety_factor'],
      ['Inverter surge', 'P_surge = max(load_surge, 1.5 x P_cont)'],
      ['Charge current estimate', 'I_charge = (P_dc_rec x 1000 / V_batt) x margin'],
      ['Charge C-rate estimate', 'C_rate = I_charge / Ah_bank'],
      ['AC/DC ratio', 'ratio = P_inv_AC / P_pv_DC']
    ];

    const workedSteps = [
      ['Battery energy sizing', `E_nom = (${i.dailyEnergy_kWh.toFixed(2)} x ${i.autonomyDays.toFixed(2)} x ${i.reserveFactor.toFixed(2)}) / (${i.dod.toFixed(2)} x ${i.etaBatt.toFixed(2)} x ${i.etaInv.toFixed(2)} x ${i.tempDerate.toFixed(2)}) = ${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
      ['Battery Ah conversion', `Ah = (${r.battery.requiredNominal_kWh.toFixed(2)} x 1000) / ${i.batteryVoltage_V.toFixed(0)} = ${r.batteryAh.toFixed(0)} Ah`],
      ['PV base sizing', `P_dc = ${i.dailyEnergy_kWh.toFixed(2)} / (${i.psh.toFixed(2)} x ${i.systemPR.toFixed(2)}) = ${r.pv.base_kWp.toFixed(2)} kWp`],
      ['PV recommended sizing', `P_dc_rec = ${r.pv.base_kWp.toFixed(2)} x ${i.pvOversize.toFixed(2)} = ${r.pv.recommended_kWp.toFixed(2)} kWp`],
      ['Inverter continuous', `P_cont = ${i.peakLoad_kW.toFixed(2)} x ${i.inverterSafetyFactor.toFixed(2)} = ${r.inverter.requiredContinuous_kW.toFixed(2)} kW`],
      ['Inverter surge', `P_surge = max(${i.surgeLoad_kW.toFixed(2)}, 1.5 x ${r.inverter.requiredContinuous_kW.toFixed(2)}) = ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
      ['Charge current', `I_charge = (${r.pv.recommended_kWp.toFixed(2)} x 1000 / ${i.batteryVoltage_V.toFixed(0)}) x ${i.chargeMargin.toFixed(2)} = ${r.charge.current_A.toFixed(1)} A`],
    ];

    const limitRows = [];
    const calcRows = [];
    const sourceRows = [];
    STANDARDS.forEach(s => {
      (s.limits || []).forEach(l => limitRows.push([s.code, l.p, l.v, l.n]));
      (s.calcs || []).forEach(c => calcRows.push([s.code, c.n, c.f, c.w]));
      (s.sources || []).forEach(src => sourceRows.push([s.code, src.t, src.u, src.n || '']));
    });

    const smartClauses = _selectSmartClauses(r, { acdc, cRate, dodBand });

    return { checks, assumptions, formulaRows, workedSteps, limitRows, calcRows, sourceRows, smartClauses, acdc, cRate };
  }

  function _statusFromRule(condPass, condWarn) {
    if (condPass) return 'pass';
    if (condWarn) return 'warn';
    return 'fail';
  }

  function _selectSmartClauses(r, metrics) {
    const i = r.inputs;
    const byId = STANDARDS.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
    const map = {};

    function add(id, reason) {
      if (!byId[id]) return;
      if (!map[id]) {
        map[id] = { std: byId[id], reasons: [] };
      }
      map[id].reasons.push(reason);
    }

    // Baseline references for every hybrid design in Sri Lanka practice.
    add('iec61427-62619', 'Battery storage is part of this design; battery performance/safety clauses apply.');
    add('iec60364', 'All hybrid designs require wiring, protection, and earthing checks.');
    add('sls1522', 'Sri Lanka installation code baseline applies.');

    // Dynamic rules from current values.
    if (i.dod < metrics.dodBand.min || i.dod > metrics.dodBand.max) {
      add('iec61427-62619', `Configured DoD ${(i.dod * 100).toFixed(1)}% is outside typical ${r.chemistryLabel} band ${Math.round(metrics.dodBand.min * 100)}%-${Math.round(metrics.dodBand.max * 100)}%.`);
    }
    if (metrics.cRate > 0.5) {
      add('iec61427-62619', `Estimated charge C-rate ${metrics.cRate.toFixed(3)}C exceeds common continuous target 0.50C.`);
    }

    const acdcState = _statusFromRule(metrics.acdc >= 0.85 && metrics.acdc <= 1.05, metrics.acdc >= 0.75 && metrics.acdc <= 1.2);
    if (acdcState !== 'pass') {
      add('iec62109', `AC/DC ratio ${metrics.acdc.toFixed(2)} is outside typical 0.85-1.05 range; converter behavior and clipping risk should be reviewed.`);
      add('sls1543', 'Sri Lanka converter safety/trip-profile alignment should be validated for this ratio.');
    }

    if (i.batteryVoltage_V <= 48 && r.inverter.requiredContinuous_kW > 8) {
      add('iec60364', `Low bus voltage (${i.batteryVoltage_V.toFixed(0)}V) with high power (${r.inverter.requiredContinuous_kW.toFixed(2)}kW) implies high DC current; cable/voltage-drop clauses are critical.`);
      add('sls1522', 'Sri Lanka cable ampacity and earthing checks become critical under high DC current.');
    }

    if (i.psh < 4.5) {
      add('pucsl', `Low PSH assumption (${i.psh.toFixed(2)} h/day) suggests conservative seasonal grid/import planning.`);
    }

    if (r.warnings && r.warnings.length) {
      add('pucsl', 'Design warnings present; utility protection and interface settings should be cross-checked.');
      add('sls1547', 'Power-quality and reconnection characteristics should be validated.');
    }

    if (metrics.acdc >= 0.80 && metrics.acdc <= 1.10) {
      add('ceb-leco', 'Sizing pattern is consistent with export-capable hybrid designs; utility approval workflow may apply if export is enabled.');
    }

    return Object.values(map).map(entry => {
      const s = entry.std;
      const clauses = [];
      (s.points || []).forEach(p => clauses.push({ type: 'Requirement', text: p }));
      (s.limits || []).forEach(l => clauses.push({ type: 'Limit', text: `${l.p}: ${l.v} (${l.n})` }));
      (s.calcs || []).forEach(c => clauses.push({ type: 'Calculation', text: `${c.n}: ${c.f} (${c.w})` }));
      return {
        id: s.id,
        code: s.code,
        title: s.title,
        reasons: entry.reasons,
        clauses,
      };
    });
  }

  function _safePart(text, fallback) {
    return String(text || fallback || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback;
  }

  function _reportBaseName(r) {
    return `SolarPV_HybridLearning_${_safePart(r.chemistryLabel, 'Hybrid')}_${_safePart(r.date, 'date')}`;
  }

  function _downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _buildLearningHTML(r) {
    const c = _learningContext(r);
    const assumptionsRows = c.assumptions.map(a => `<tr><td><strong>${_esc(a[0])}</strong></td><td>${_esc(a[1])}</td><td>${_esc(a[2])}</td></tr>`).join('');
    const formulaRows = c.formulaRows.map(f => `<tr><td><strong>${_esc(f[0])}</strong></td><td><code>${_esc(f[1])}</code></td></tr>`).join('');
    const workedRows = c.workedSteps.map(s => `<tr><td><strong>${_esc(s[0])}</strong></td><td><code>${_esc(s[1])}</code></td></tr>`).join('');
    const checksRows = c.checks.map(x => `<tr><td><strong>${_esc(x.check)}</strong></td><td>${_esc(x.value)}</td><td>${_esc(x.target)}</td><td>${_esc(x.status.toUpperCase())}</td><td>${_esc(x.note)}</td></tr>`).join('');
    const limitsRows = c.limitRows.map(l => `<tr><td>${_esc(l[0])}</td><td><strong>${_esc(l[1])}</strong></td><td>${_esc(l[2])}</td><td>${_esc(l[3])}</td></tr>`).join('');
    const sourceRows = c.sourceRows.map(s => `<tr><td>${_esc(s[0])}</td><td><strong>${_esc(s[1])}</strong></td><td><a href="${_esc(s[2])}" target="_blank" rel="noopener noreferrer">${_esc(s[2])}</a></td><td>${_esc(s[3])}</td></tr>`).join('');
    const calcRows = c.calcRows.map(k => `<tr><td>${_esc(k[0])}</td><td><strong>${_esc(k[1])}</strong></td><td><code>${_esc(k[2])}</code></td><td>${_esc(k[3])}</td></tr>`).join('');
    const smartRows = c.smartClauses
      .map(s => s.clauses.map(cl => `<tr><td>${_esc(s.code)}</td><td>${_esc(s.reasons.join(' | '))}</td><td>${_esc(cl.type)}</td><td>${_esc(cl.text)}</td></tr>`).join(''))
      .join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hybrid Learning Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    h1,h2 { margin: 0 0 8px 0; }
    h1 { font-size: 20px; color: #b45309; }
    h2 { margin-top: 20px; font-size: 14px; color: #1f2937; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .meta { margin: 8px 0 12px; color: #444; }
    .warn { border: 1px solid #f59e0b; background: #fffbeb; padding: 8px; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    code { font-family: Consolas, monospace; font-size: 11px; }
    .small { color: #555; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Hybrid Setup Learning Report</h1>
  <div class="meta">Generated: ${_esc(new Date().toLocaleString())} | Date tag: ${_esc(r.date)} | Chemistry: ${_esc(r.chemistryLabel)}</div>

  <h2>Summary Results</h2>
  <table>
    <tr><th>Item</th><th>Value</th></tr>
    <tr><td><strong>Battery nominal capacity</strong></td><td>${_esc(r.battery.requiredNominal_kWh.toFixed(2))} kWh</td></tr>
    <tr><td><strong>Battery bank equivalent</strong></td><td>${_esc(r.batteryAh.toFixed(0))} Ah @ ${_esc(r.inputs.batteryVoltage_V.toFixed(0))}V</td></tr>
    <tr><td><strong>Recommended PV DC size</strong></td><td>${_esc(r.pv.recommended_kWp.toFixed(2))} kWp</td></tr>
    <tr><td><strong>Inverter continuous / surge</strong></td><td>${_esc(r.inverter.requiredContinuous_kW.toFixed(2))} kW / ${_esc(r.inverter.requiredSurge_kW.toFixed(2))} kW</td></tr>
    <tr><td><strong>Estimated charge current</strong></td><td>${_esc(r.charge.current_A.toFixed(1))} A</td></tr>
  </table>

  <h2>Assumptions</h2>
  <table>
    <tr><th>Assumption</th><th>Value</th><th>Reason</th></tr>
    ${assumptionsRows}
  </table>

  <h2>Calculation Formulas</h2>
  <table>
    <tr><th>Calculation</th><th>Formula</th></tr>
    ${formulaRows}
  </table>

  <h2>Worked Steps (Substituted Values)</h2>
  <table>
    <tr><th>Step</th><th>Working</th></tr>
    ${workedRows}
  </table>

  <h2>Practical Checks</h2>
  <table>
    <tr><th>Check</th><th>Current</th><th>Target / Limit</th><th>Status</th><th>Note</th></tr>
    ${checksRows}
  </table>

  <h2>Auto-Attached Standard Clauses (Smart Filter)</h2>
  <table>
    <tr><th>Standard</th><th>Why Attached</th><th>Clause Type</th><th>Clause</th></tr>
    ${smartRows}
  </table>

  <h2>Standards Limits Reference</h2>
  <table>
    <tr><th>Standard</th><th>Parameter</th><th>Limit / Value</th><th>Note</th></tr>
    ${limitsRows}
  </table>

  <h2>Primary Source Documents</h2>
  <table>
    <tr><th>Standard</th><th>Document</th><th>Link</th><th>Scope</th></tr>
    ${sourceRows}
  </table>

  <h2>Standards Related Calculations</h2>
  <table>
    <tr><th>Standard</th><th>Calculation</th><th>Formula / Check</th><th>Purpose</th></tr>
    ${calcRows}
  </table>

  ${(r.warnings && r.warnings.length) ? `<h2>Warnings</h2><div class="warn">${r.warnings.map(w => _esc(w)).join('<br>')}</div>` : ''}
  <p class="small">Learning note: this report is for pre-design understanding and training. Final engineering must verify equipment datasheets, local authority rules, and project-specific protection settings.</p>
</body>
</html>`;
  }

  function _printLearningReport(r) {
    const html = _buildLearningHTML(r);
    const win = window.open('', '_blank');
    if (!win) {
      App.toast('Pop-up blocked. Allow pop-ups to print.', 'warning');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  }

  async function _exportLearningDOCX(r) {
    if (!window.docx) {
      App.toast('DOCX library not loaded. Check internet connection.', 'error');
      return;
    }

    const ctx = _learningContext(r);
    const {
      Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType
    } = window.docx;

    function p(text, opts) {
      return new Paragraph({ children: [new TextRun(String(text || ''))], ...(opts || {}) });
    }

    function heading(text, level) {
      return new Paragraph({ text, heading: level || HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });
    }

    function table(headers, rows) {
      const headRow = new TableRow({
        children: headers.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(h), bold: true })] })]
        }))
      });
      const bodyRows = rows.map(row => new TableRow({
        children: row.map(cell => new TableCell({ children: [p(String(cell ?? ''))] }))
      }));
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headRow, ...bodyRows]
      });
    }

    const content = [];
    content.push(new Paragraph({
      text: 'Hybrid Setup Learning Report',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT
    }));
    content.push(p(`Generated: ${new Date().toLocaleString()} | Date tag: ${r.date} | Chemistry: ${r.chemistryLabel}`));

    content.push(heading('Summary Results'));
    content.push(table(
      ['Item', 'Value'],
      [
        ['Battery nominal capacity', `${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
        ['Battery equivalent', `${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V.toFixed(0)}V`],
        ['Recommended PV DC size', `${r.pv.recommended_kWp.toFixed(2)} kWp`],
        ['Inverter continuous / surge', `${r.inverter.requiredContinuous_kW.toFixed(2)} kW / ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
        ['Estimated charge current', `${r.charge.current_A.toFixed(1)} A`],
      ]
    ));

    content.push(heading('Assumptions'));
    content.push(table(['Assumption', 'Value', 'Reason'], ctx.assumptions));

    content.push(heading('Calculation Formulas'));
    content.push(table(['Calculation', 'Formula'], ctx.formulaRows));

    content.push(heading('Worked Steps'));
    content.push(table(['Step', 'Substituted Working'], ctx.workedSteps));

    content.push(heading('Practical Checks'));
    content.push(table(
      ['Check', 'Current', 'Target', 'Status', 'Note'],
      ctx.checks.map(c => [c.check, c.value, c.target, c.status.toUpperCase(), c.note])
    ));

    content.push(heading('Auto-Attached Standard Clauses (Smart Filter)'));
    const smartRows = [];
    ctx.smartClauses.forEach(s => {
      s.clauses.forEach(cl => smartRows.push([s.code, s.reasons.join(' | '), cl.type, cl.text]));
    });
    content.push(table(['Standard', 'Why Attached', 'Clause Type', 'Clause'], smartRows));

    content.push(heading('Standards Limits Reference'));
    content.push(table(['Standard', 'Parameter', 'Limit / Value', 'Note'], ctx.limitRows));

    content.push(heading('Primary Source Documents'));
    content.push(table(['Standard', 'Document', 'Link', 'Scope'], ctx.sourceRows));

    content.push(heading('Standards Related Calculations'));
    content.push(table(['Standard', 'Calculation', 'Formula / Check', 'Purpose'], ctx.calcRows));

    if (r.warnings && r.warnings.length) {
      content.push(heading('Warnings'));
      r.warnings.forEach(w => content.push(p(`- ${w}`)));
    }

    content.push(p('Learning note: this report is for pre-design understanding and training. Final engineering must verify equipment datasheets, local authority rules, and project-specific protection settings.'));

    const doc = new Document({ sections: [{ children: content }] });
    const blob = await Packer.toBlob(doc);
    const filename = `${_reportBaseName(r)}.docx`;
    _downloadBlob(filename, blob);
    App.toast(`DOCX saved: ${filename}`, 'success');
  }

  function _exportLearningPDF(r) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    const ctx = _learningContext(r);
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    const pageW = 210;
    let y = 14;

    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, pageW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Hybrid Setup Learning Report', margin, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SolarPV Field Tool', pageW - margin, 10, { align: 'right' });

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()} | Date tag: ${r.date} | Chemistry: ${r.chemistryLabel}`, margin, 22);
    y = 27;

    function section(title) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y, pageW - margin * 2, 6, 'F');
      doc.setFontSize(8.5);
      doc.setTextColor(217, 119, 6);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), margin + 2, y + 4);
      y += 8;
      doc.setTextColor(17, 24, 39);
    }

    const summaryRows = [
      ['Battery nominal capacity', `${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
      ['Battery equivalent', `${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V.toFixed(0)}V`],
      ['Recommended PV DC size', `${r.pv.recommended_kWp.toFixed(2)} kWp`],
      ['Inverter continuous / surge', `${r.inverter.requiredContinuous_kW.toFixed(2)} kW / ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
      ['Estimated charge current', `${r.charge.current_A.toFixed(1)} A`]
    ];

    const autoTable = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null;
    if (!autoTable) {
      App.toast('PDF table plugin not loaded. Refresh and retry.', 'error');
      return;
    }

    section('Summary Results');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Item', 'Value']], body: summaryRows,
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Assumptions');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Assumption', 'Value', 'Reason']],
      body: ctx.assumptions,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Calculation Formulas');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Calculation', 'Formula']],
      body: ctx.formulaRows,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Worked Steps');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Step', 'Substituted Working']],
      body: ctx.workedSteps,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Practical Checks');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Check', 'Current', 'Target', 'Status', 'Note']],
      body: ctx.checks.map(c => [c.check, c.value, c.target, c.status.toUpperCase(), c.note]),
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 },
      didParseCell: h => {
        if (h.section !== 'body' || h.column.index !== 3) return;
        const st = String(h.cell.raw || '').toUpperCase();
        if (st === 'PASS') h.cell.styles.fillColor = [220, 252, 231];
        else if (st === 'CHECK') h.cell.styles.fillColor = [254, 249, 195];
        else h.cell.styles.fillColor = [254, 226, 226];
      }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Auto-Attached Standard Clauses');
    const smartRows = [];
    ctx.smartClauses.forEach(s => {
      s.clauses.forEach(cl => smartRows.push([s.code, s.reasons.join(' | '), cl.type, cl.text]));
    });
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Standard', 'Why Attached', 'Clause Type', 'Clause']],
      body: smartRows,
      styles: { fontSize: 6.7, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Standards Limits');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Standard', 'Parameter', 'Limit / Value', 'Note']],
      body: ctx.limitRows,
      styles: { fontSize: 6.8, cellPadding: 1.6 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Primary Source Documents');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Standard', 'Document', 'Link', 'Scope']],
      body: ctx.sourceRows,
      styles: { fontSize: 6.6, cellPadding: 1.4 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Standards Related Calculations');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Standard', 'Calculation', 'Formula / Check', 'Purpose']],
      body: ctx.calcRows,
      styles: { fontSize: 6.7, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });

    const filename = `${_reportBaseName(r)}.pdf`;
    doc.save(filename);
    App.toast(`PDF saved: ${filename}`, 'success');
  }

  return { render };
})();
