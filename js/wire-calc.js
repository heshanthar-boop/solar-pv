/**
 * wire-calc.js - Advanced AC/DC wire sizing calculator
 * Includes environmental derating, standards references, and printable reports.
 */

const WireCalc = (() => {
  const PURPOSES = {
    dc_pv: {
      label: 'DC PV String / Combiner Run',
      defaultSystem: 'dc',
      defaultVoltage: 600,
      defaultDropLimit: 1.0,
      note: 'IEC 60364-7-712 / SLS 1522: keep PV DC voltage drop conservative (commonly <= 1%).'
    },
    dc_battery: {
      label: 'DC Battery / Inverter Run',
      defaultSystem: 'dc',
      defaultVoltage: 48,
      defaultDropLimit: 2.0,
      note: 'Battery circuits often use stricter voltage-drop control due to high current.'
    },
    ac_final: {
      label: 'AC Final Circuit',
      defaultSystem: 'ac1p',
      defaultVoltage: 230,
      defaultDropLimit: 3.0,
      note: 'IEC practice: many final AC circuits are checked around <= 3% voltage drop.'
    },
    ac_feeder: {
      label: 'AC Feeder / Main Submain',
      defaultSystem: 'ac3p',
      defaultVoltage: 400,
      defaultDropLimit: 2.5,
      note: 'For long feeders, stricter limits are often used to keep end-of-line voltage stable.'
    }
  };

  const STANDARDS = [
    {
      code: 'IEC 60364-5-52',
      title: 'Selection and erection of wiring systems',
      checks: 'Current-carrying capacity with installation method, temperature, and grouping correction factors.'
    },
    {
      code: 'IEC 60364-7-712',
      title: 'PV power supply systems',
      checks: 'PV DC-side wiring and practical voltage-drop control; correct isolation and protection coordination.'
    },
    {
      code: 'SLS 1522:2016',
      title: 'Sri Lanka grid-connected PV code',
      checks: 'PV cable suitability (UV-resistant, PV-rated where required), installation quality, and commissioning records.'
    },
    {
      code: 'IEC 60364-5-54',
      title: 'Earthing arrangements and protective conductors',
      checks: 'Protective earth conductor sizing and continuity verification.'
    }
  ];

  const BREAKER_STEPS_A = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400];
  const STD_CSA = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

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

  function _n(container, id) {
    const el = container.querySelector(id);
    return el ? parseFloat(el.value) : NaN;
  }

  function _s(container, id) {
    const el = container.querySelector(id);
    return el ? String(el.value || '') : '';
  }

  function _stdCSA(csa) {
    const need = Number(csa);
    if (!Number.isFinite(need) || need <= 0) return null;
    for (let i = 0; i < STD_CSA.length; i += 1) {
      if (STD_CSA[i] >= need) return STD_CSA[i];
    }
    return STD_CSA[STD_CSA.length - 1];
  }

  function _peCSA(phaseCSA) {
    if (!Number.isFinite(phaseCSA) || phaseCSA <= 0) return null;
    if (phaseCSA <= 16) return _stdCSA(phaseCSA);
    if (phaseCSA <= 35) return 16;
    return _stdCSA(phaseCSA / 2);
  }

  function _breakerSuggestion(designCurrentA) {
    const i = Number(designCurrentA);
    if (!Number.isFinite(i) || i <= 0) return null;
    for (let k = 0; k < BREAKER_STEPS_A.length; k += 1) {
      if (BREAKER_STEPS_A[k] >= i) return BREAKER_STEPS_A[k];
    }
    return BREAKER_STEPS_A[BREAKER_STEPS_A.length - 1];
  }

  function _cableTypeHint(systemType, material, insulation, installMethod) {
    if (systemType === 'dc') {
      if (material === 'al') {
        return 'DC PV runs are commonly copper; if aluminum is used, verify all lugs/connectors and corrosion controls.';
      }
      return insulation === 'xlpe'
        ? 'Use PV-rated UV-resistant DC cable (for example PV1-F / equivalent) for outdoor PV runs.'
        : 'PVC on exposed PV DC runs is generally not preferred; confirm UV and temperature suitability.';
    }
    if (installMethod === 'buried_direct' || installMethod === 'buried_duct') {
      return 'Use cable suitable for direct burial or in suitable ducts with moisture/mechanical protection.';
    }
    if (installMethod === 'rooftop_open') {
      return 'Use UV/heat-resistant insulation and support method suitable for rooftop temperature and weather exposure.';
    }
    return insulation === 'xlpe'
      ? 'XLPE is commonly selected for better temperature margin.'
      : 'PVC is acceptable in many indoor/protected runs within its temperature limits.';
  }

  function _purposeOptionHTML(selected) {
    return Object.keys(PURPOSES).map((k) =>
      `<option value="${k}" ${selected === k ? 'selected' : ''}>${_esc(PURPOSES[k].label)}</option>`
    ).join('');
  }

  function render(container) {
    const s = Object.assign({
      purpose: 'dc_pv',
      systemType: 'dc',
      cableConstruction: 'multi_core_non_armoured',
      material: 'cu',
      insulation: 'xlpe',
      installMethod: 'closed_tube',
      lengthOneWay_m: 30,
      nominal_V: 600,
      current_A: '',
      load_kW: '',
      powerFactor: 0.95,
      ambient_C: 35,
      groundTemp_C: 20,
      groupedCircuits: 1,
      buriedSpacing: 'touching',
      continuousFactor: 1.25,
      dropLimit_pct: 1.0,
    }, App.state.wireInputs || {});

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128268; Wire Calculation (AC/DC)</div>

        <div class="card">
          <div class="card-title">Circuit Context</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Calculation Purpose</label>
              <select class="form-select" id="wc-purpose">${_purposeOptionHTML(s.purpose)}</select>
              <div class="form-hint" id="wc-purpose-hint"></div>
            </div>
            <div class="form-group">
              <label class="form-label">System Type</label>
              <select class="form-select" id="wc-system">
                <option value="dc" ${s.systemType === 'dc' ? 'selected' : ''}>DC 2-wire</option>
                <option value="ac1p" ${s.systemType === 'ac1p' ? 'selected' : ''}>AC 1-phase</option>
                <option value="ac3p" ${s.systemType === 'ac3p' ? 'selected' : ''}>AC 3-phase</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Electrical Inputs</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Nominal Voltage (V)</label>
              <input class="form-input" id="wc-v" type="number" step="any" value="${_esc(s.nominal_V)}" />
            </div>
            <div class="form-group">
              <label class="form-label">One-way Length (m)</label>
              <input class="form-input" id="wc-l" type="number" step="any" value="${_esc(s.lengthOneWay_m)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Load Current (A) [optional]</label>
              <input class="form-input" id="wc-i" type="number" step="any" value="${_esc(s.current_A)}" />
              <div class="form-hint">If blank, current is derived from power and voltage.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Load Power (kW) [optional]</label>
              <input class="form-input" id="wc-p" type="number" step="any" value="${_esc(s.load_kW)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Power Factor (AC)</label>
              <input class="form-input" id="wc-pf" type="number" step="0.01" min="0.1" max="1" value="${_esc(s.powerFactor)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Continuous Load Factor</label>
              <input class="form-input" id="wc-cf" type="number" step="0.01" min="1" value="${_esc(s.continuousFactor)}" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Environment and Installation</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Cable Construction</label>
              <select class="form-select" id="wc-construction">
                <option value="multi_core_non_armoured" ${s.cableConstruction === 'multi_core_non_armoured' ? 'selected' : ''}>Multicore non-armoured (home/commercial)</option>
                <option value="multi_core_armoured" ${s.cableConstruction === 'multi_core_armoured' ? 'selected' : ''}>Multicore armoured (buried/industrial feeder)</option>
              </select>
              <div class="form-hint">Catalogue-backed rows include Kelani Tables E, F, and H.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Conductor Material</label>
              <select class="form-select" id="wc-mat">
                <option value="cu" ${s.material === 'cu' ? 'selected' : ''}>Copper (Cu)</option>
                <option value="al" ${s.material === 'al' ? 'selected' : ''}>Aluminum (Al)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Insulation</label>
              <select class="form-select" id="wc-ins">
                <option value="xlpe" ${s.insulation === 'xlpe' ? 'selected' : ''}>XLPE / 90C</option>
                <option value="pvc" ${s.insulation === 'pvc' ? 'selected' : ''}>PVC / 70C</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Install Method / Place</label>
              <select class="form-select" id="wc-install">
                <option value="closed_tube" ${s.installMethod === 'closed_tube' ? 'selected' : ''}>Closed conduit/tube/trunking</option>
                <option value="open_air" ${s.installMethod === 'open_air' ? 'selected' : ''}>Open air / perforated tray</option>
                <option value="clipped_direct" ${s.installMethod === 'clipped_direct' ? 'selected' : ''}>Clipped direct on wall/structure</option>
                <option value="buried_direct" ${s.installMethod === 'buried_direct' ? 'selected' : ''}>Buried direct in ground</option>
                <option value="buried_duct" ${s.installMethod === 'buried_duct' ? 'selected' : ''}>Buried in duct</option>
                <option value="rooftop_open" ${s.installMethod === 'rooftop_open' ? 'selected' : ''}>Rooftop open-air route</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Ambient Air Temperature (C)</label>
              <input class="form-input" id="wc-temp" type="number" step="any" value="${_esc(s.ambient_C)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Ground Temperature (C)</label>
              <input class="form-input" id="wc-gtemp" type="number" step="any" value="${_esc(s.groundTemp_C)}" />
              <div class="form-hint">Used for buried methods (Z-02 correction).</div>
            </div>
            <div class="form-group">
              <label class="form-label">Loaded Circuits / Ducts Grouped</label>
              <input class="form-input" id="wc-group" type="number" min="1" step="1" value="${_esc(s.groupedCircuits)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Buried Spacing</label>
              <select class="form-select" id="wc-bspacing">
                <option value="touching" ${s.buriedSpacing === 'touching' ? 'selected' : ''}>Touching</option>
                <option value="one_d" ${s.buriedSpacing === 'one_d' ? 'selected' : ''}>One cable diameter</option>
                <option value="0.125m" ${s.buriedSpacing === '0.125m' ? 'selected' : ''}>0.125 m</option>
                <option value="0.25m" ${s.buriedSpacing === '0.25m' ? 'selected' : ''}>0.25 m</option>
                <option value="0.5m" ${s.buriedSpacing === '0.5m' ? 'selected' : ''}>0.5 m</option>
                <option value="1.0m" ${s.buriedSpacing === '1.0m' ? 'selected' : ''}>1.0 m</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Voltage Drop Limit (%)</label>
              <input class="form-input" id="wc-drop" type="number" step="0.1" value="${_esc(s.dropLimit_pct)}" />
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary btn-block" id="wc-calc-btn">Calculate Wire Size</button>
          </div>
        </div>

        <div id="wc-results" class="hidden"></div>
      </div>
    `;

    const purposeEl = container.querySelector('#wc-purpose');
    purposeEl.addEventListener('change', () => _applyPurposeDefaults(container));
    _applyPurposeDefaults(container, true);

    container.querySelector('#wc-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#wc-calc-btn'), () => _calculate(container));
    });

    if (App.state.wireResult) {
      _renderResults(container, App.state.wireResult);
    }
  }

  function _applyPurposeDefaults(container, initOnly) {
    const purpose = _s(container, '#wc-purpose');
    const cfg = PURPOSES[purpose] || PURPOSES.dc_pv;
    const hint = container.querySelector('#wc-purpose-hint');
    if (hint) hint.textContent = cfg.note;

    const system = container.querySelector('#wc-system');
    if (system) {
      if (!initOnly || !system.value) {
        system.value = cfg.defaultSystem;
      } else if (system.value === 'dc' && cfg.defaultSystem !== 'dc') {
        system.value = cfg.defaultSystem;
      }
    }

    const drop = container.querySelector('#wc-drop');
    if (drop && (!String(drop.value || '').trim() || !initOnly)) {
      drop.value = String(cfg.defaultDropLimit);
    }

    const v = container.querySelector('#wc-v');
    if (v && (!String(v.value || '').trim() || !initOnly)) {
      v.value = String(cfg.defaultVoltage);
    }
  }

  function _calculate(container) {
    const purpose = _s(container, '#wc-purpose');
    const cfg = PURPOSES[purpose] || PURPOSES.dc_pv;

    const inputs = {
      purpose,
      systemType: _s(container, '#wc-system'),
      cableConstruction: _s(container, '#wc-construction'),
      material: _s(container, '#wc-mat'),
      insulation: _s(container, '#wc-ins'),
      installMethod: _s(container, '#wc-install'),
      lengthOneWay_m: _n(container, '#wc-l'),
      nominal_V: _n(container, '#wc-v'),
      current_A: _n(container, '#wc-i'),
      load_kW: _n(container, '#wc-p'),
      powerFactor: _n(container, '#wc-pf'),
      ambient_C: _n(container, '#wc-temp'),
      groundTemp_C: _n(container, '#wc-gtemp'),
      groupedCircuits: _n(container, '#wc-group'),
      buriedSpacing: _s(container, '#wc-bspacing'),
      continuousFactor: _n(container, '#wc-cf'),
      dropLimit_pct: _n(container, '#wc-drop')
    };

    if (isNaN(inputs.dropLimit_pct)) inputs.dropLimit_pct = cfg.defaultDropLimit;

    const selector = (typeof StandardsCalc !== 'undefined' && StandardsCalc && typeof StandardsCalc.cableSizeSelector === 'function')
      ? StandardsCalc.cableSizeSelector(inputs)
      : null;

    if (!selector) {
      App.toast('Enter current, or load power + voltage (and PF for AC).', 'error');
      return;
    }

    const peCSA = _peCSA(selector.selectedCSA_mm2);
    const breakerA = _breakerSuggestion(selector.designCurrent_A);
    const cableType = _cableTypeHint(selector.systemType, selector.material, selector.insulation, selector.installMethod);

    const warnings = Array.isArray(selector.warnings) ? selector.warnings.slice() : [];
    if (selector.selectedCSA_mm2 >= 240) warnings.push('Large conductor size selected. Validate routing, bending radius, and termination hardware.');
    if (selector.factors.ambient_C > 50) warnings.push('High ambient temperature input. Confirm final ampacity with manufacturer tables.');
    if (selector.material === 'al' && selector.systemType === 'dc') warnings.push('Aluminum in DC PV circuits needs strict connector compatibility and corrosion control.');

    App.state.wireInputs = inputs;
    App.state.wireResult = {
      date: App.localDateISO(new Date()),
      timestamp: new Date().toLocaleString(),
      purposeLabel: cfg.label,
      inputs,
      selector,
      peCSA,
      breakerA,
      cableType,
      warnings,
      standards: STANDARDS
    };

    _renderResults(container, App.state.wireResult);
  }

  function _renderResults(container, r) {
    const out = container.querySelector('#wc-results');
    out.classList.remove('hidden');

    const s = r.selector;
    const pass = s.ampacityPass && s.vdropPass;
    const cls = pass ? 'alert-safe' : 'alert-warn';
    const limitDriver = s.limitedBy === 'ampacity' ? 'Ampacity/Thermal' : 'Voltage Drop';
    const coeffText = Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? `${s.selectedVdropCoeff_mV_per_A_m.toFixed(3)} mV/A/m` : 'N/A';

    const checks = [
      ['Design current', `${s.designCurrent_A.toFixed(2)} A`, `<= ${s.selectedAllowableCurrent_A.toFixed(2)} A allowed`, s.ampacityPass ? 'PASS' : 'FAIL'],
      ['Voltage drop', `${s.selectedVdrop_pct.toFixed(2)}%`, `<= ${s.dropLimit_pct.toFixed(2)}% limit`, s.vdropPass ? 'PASS' : 'FAIL'],
      ['Catalogue profile', s.catalogProfileLabel || 'N/A', s.tableMethodLabel || 'Table method', 'INFO'],
      ['Limiting criterion', limitDriver, 'Higher of ampacity or drop requirement', 'INFO'],
      ['Suggested breaker', r.breakerA ? `${r.breakerA} A` : 'N/A', 'Select final protection by fault level and cable standard', 'INFO'],
      ['Suggested PE conductor', r.peCSA ? `${r.peCSA} mm2` : 'N/A', 'IEC 60364-5-54 simplified sizing guide', 'INFO']
    ];

    const steps = [
      `System: ${_esc(s.systemType)} | Material: ${_esc(s.material.toUpperCase())} | Insulation: ${_esc(s.insulation.toUpperCase())}`,
      `Catalogue row set: ${_esc(s.catalogProfileLabel || s.catalogProfile || 'N/A')} (${_esc(s.tableMethodLabel || '-')})`,
      `Load current source: ${_esc(s.currentSource)}; I_load = ${s.I_load_A.toFixed(2)} A`,
      `Design current = I_load x continuous factor = ${s.I_load_A.toFixed(2)} x ${s.factors.continuousFactor.toFixed(2)} = ${s.designCurrent_A.toFixed(2)} A`,
      `Derating factors: Temperature ${s.tempFactor.toFixed(2)} (${_esc(s.tempFactorSource || 'table')}), Grouping ${s.groupFactor.toFixed(2)} (${_esc(s.groupFactorSource || 'table')}) => combined ${s.totalDerating.toFixed(3)}`,
      `Required base ampacity = ${s.requiredBaseAmpacity_A.toFixed(2)} A => CSA by ampacity = ${s.ampacityRequiredCSA_mm2} mm2`,
      `Required area by voltage-drop = ${s.requiredAreaByVdrop_mm2.toFixed(2)} mm2 => standard ${s.vdropRequiredCSA_mm2} mm2`,
      `Recommended standard CSA = ${s.selectedCSA_mm2} mm2 (${limitDriver} controlled)`,
      `With selected CSA: allowable current ${s.selectedAllowableCurrent_A.toFixed(2)} A, drop ${s.selectedVdrop_V.toFixed(2)} V (${s.selectedVdrop_pct.toFixed(2)}%), coeff ${coeffText}`
    ];

    const standardsRows = r.standards.map((x) =>
      `<tr><td><strong>${_esc(x.code)}</strong></td><td>${_esc(x.title)}</td><td>${_esc(x.checks)}</td></tr>`
    ).join('');

    const checksRows = checks.map((c) =>
      `<tr><td><strong>${_esc(c[0])}</strong></td><td>${_esc(c[1])}</td><td>${_esc(c[2])}</td><td>${_esc(c[3])}</td></tr>`
    ).join('');

    out.innerHTML = `
      <div class="card">
        <div class="result-box ${cls}" style="margin-bottom:10px">
          <div class="result-value">${pass ? '&#10003;' : '&#9888;'} Recommended Cable: ${_esc(String(s.selectedCSA_mm2))} mm2</div>
          <div class="result-label">${_esc(r.purposeLabel)} | ${_esc(s.material.toUpperCase())} | ${_esc(s.systemType.toUpperCase())} | ${_esc(r.timestamp)}</div>
        </div>
        <div class="result-grid">
          <div class="result-box"><div class="result-value">${s.selectedCSA_mm2} mm2</div><div class="result-label">Selected Phase Conductor</div></div>
          <div class="result-box"><div class="result-value">${s.designCurrent_A.toFixed(1)} A</div><div class="result-label">Design Current</div></div>
          <div class="result-box"><div class="result-value">${s.selectedVdrop_pct.toFixed(2)}%</div><div class="result-label">Voltage Drop</div></div>
          <div class="result-box"><div class="result-value">${r.breakerA || 'N/A'} A</div><div class="result-label">Breaker Suggestion</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Calculation Checks</div>
        <table class="status-table">
          <thead><tr><th>Check</th><th>Current</th><th>Target</th><th>Status</th></tr></thead>
          <tbody>${checksRows}</tbody>
        </table>
        <div class="info-box" style="margin-top:8px">${_esc(r.cableType)}</div>
      </div>

      <div class="card">
        <div class="card-title">Step-by-Step Working</div>
        <div style="font-family:monospace;font-size:0.82rem;background:var(--bg-3);border-radius:var(--radius);padding:12px;line-height:1.8;overflow-x:auto">
          ${steps.map((x) => `<div>${_esc(x)}</div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Standards to Check</div>
        <table class="status-table">
          <thead><tr><th>Standard</th><th>Scope</th><th>What To Verify</th></tr></thead>
          <tbody>${standardsRows}</tbody>
        </table>
      </div>

      ${Array.isArray(s.sourceRefs) && s.sourceRefs.length ? `<div class="card"><div class="card-title">Catalogue References Used</div>${s.sourceRefs.map((x) => `<div class="info-box">${_esc(x)}</div>`).join('')}</div>` : ''}

      ${r.warnings.length ? `<div class="card"><div class="card-title">Warnings</div>${r.warnings.map((w) => `<div class="warn-box">${_esc(w)}</div>`).join('')}</div>` : ''}

      <div class="btn-group">
        <button class="btn btn-secondary" id="wc-copy-btn">Copy Summary</button>
        <button class="btn btn-primary" id="wc-print-btn">Print</button>
        <button class="btn btn-secondary" id="wc-pdf-btn">Export PDF</button>
        <button class="btn btn-secondary" id="wc-docx-btn">Export DOCX</button>
        <button class="btn btn-secondary" id="wc-schedule-btn">&#128203; Add to Cable Schedule</button>
      </div>
    `;

    const copyBtn = out.querySelector('#wc-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => App.copyText(_summaryText(r)));

    const printBtn = out.querySelector('#wc-print-btn');
    if (printBtn) printBtn.addEventListener('click', () => _printReport(r));

    const pdfBtn = out.querySelector('#wc-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => _exportPDF(r));

    const docxBtn = out.querySelector('#wc-docx-btn');
    if (docxBtn) docxBtn.addEventListener('click', () => _exportDOCX(r));

    const scheduleBtn = out.querySelector('#wc-schedule-btn');
    if (scheduleBtn) {
      scheduleBtn.addEventListener('click', () => {
        if (typeof CableSchedule === 'undefined' || typeof CableSchedule.addFromWireResult !== 'function') {
          App.toast('Cable schedule module not loaded', 'error');
          return;
        }
        if (CableSchedule.addFromWireResult(r)) {
          App.toast('Added to cable schedule', 'success');
        } else {
          App.toast('Could not add to cable schedule', 'error');
        }
      });
    }
  }

  function _summaryText(r) {
    const s = r.selector;
    return [
      `Wire Calculation Report (${r.date})`,
      `Purpose: ${r.purposeLabel}`,
      `Selected cable: ${s.selectedCSA_mm2} mm2 ${s.material.toUpperCase()} (${s.systemType.toUpperCase()})`,
      `Catalogue profile/method: ${s.catalogProfileLabel || s.catalogProfile || 'N/A'} / ${s.tableMethodLabel || 'N/A'}`,
      `Design current: ${s.designCurrent_A.toFixed(2)} A`,
      `Allowable current: ${s.selectedAllowableCurrent_A.toFixed(2)} A`,
      `Voltage drop: ${s.selectedVdrop_pct.toFixed(2)}% (limit ${s.dropLimit_pct.toFixed(2)}%), coeff ${Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? s.selectedVdropCoeff_mV_per_A_m.toFixed(3) : 'N/A'} mV/A/m`,
      `Suggested breaker: ${r.breakerA || 'N/A'} A`,
      `Suggested PE conductor: ${r.peCSA || 'N/A'} mm2`,
      `Limiting criterion: ${s.limitedBy === 'ampacity' ? 'Ampacity/Thermal' : 'Voltage Drop'}`,
      '',
      'Standards: IEC 60364-5-52, IEC 60364-7-712, IEC 60364-5-54, SLS 1522'
    ].join('\n');
  }

  function _stepLines(r) {
    const s = r.selector;
    return [
      `Step 0: Catalogue profile = ${s.catalogProfileLabel || s.catalogProfile || 'N/A'}, ${s.tableMethodLabel || 'table method not set'}`,
      `Step 1: Determine load current source -> ${s.currentSource === 'entered_current' ? 'Entered current value' : 'Derived from load power/voltage/PF'}`,
      `Step 2: I_load = ${s.I_load_A.toFixed(2)} A`,
      `Step 3: Design current = I_load x continuous factor = ${s.I_load_A.toFixed(2)} x ${s.factors.continuousFactor.toFixed(2)} = ${s.designCurrent_A.toFixed(2)} A`,
      `Step 4: Apply derating factors -> Temp ${s.tempFactor.toFixed(2)} (${s.tempFactorSource || 'table'}) x Group ${s.groupFactor.toFixed(2)} (${s.groupFactorSource || 'table'}) = ${s.totalDerating.toFixed(3)}`,
      `Step 5: Required base ampacity = ${s.requiredBaseAmpacity_A.toFixed(2)} A`,
      `Step 6: CSA by ampacity = ${s.ampacityRequiredCSA_mm2} mm2`,
      `Step 7: CSA by voltage drop = ${s.requiredAreaByVdrop_mm2.toFixed(2)} mm2 -> standard ${s.vdropRequiredCSA_mm2} mm2`,
      `Step 8: Select larger requirement => ${s.selectedCSA_mm2} mm2 (${s.limitedBy === 'ampacity' ? 'Ampacity/Thermal limited' : 'Voltage-drop limited'})`,
      `Step 9: Verify selected cable -> Allowable current ${s.selectedAllowableCurrent_A.toFixed(2)} A, Voltage drop ${s.selectedVdrop_pct.toFixed(2)}%, table coeff ${Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? s.selectedVdropCoeff_mV_per_A_m.toFixed(3) : 'N/A'} mV/A/m`,
    ];
  }

  function _buildReportHTML(r) {
    const s = r.selector;
    const audit = _standardsAuditMeta();
    const steps = _stepLines(r).map((x) => `<div>${_esc(x)}</div>`).join('');
    const standardsRows = r.standards.map((x) =>
      `<tr><td>${_esc(x.code)}</td><td>${_esc(x.title)}</td><td>${_esc(x.checks)}</td></tr>`
    ).join('');

    return `
      <div class="card">
        <div class="card-title">Wire Calculation Report</div>
        <div class="info-box">Generated: ${_esc(r.timestamp)} | Purpose: ${_esc(r.purposeLabel)}</div>
        <div class="info-box">Standards profile: ${_esc(audit.profileLabel)} [${_esc(audit.profileId)}] | Ruleset version: ${_esc(audit.rulesVersion)}</div>
        <table class="status-table">
          <thead><tr><th>Item</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td><strong>Selected cable</strong></td><td>${_esc(String(s.selectedCSA_mm2))} mm2 ${_esc(s.material.toUpperCase())}</td></tr>
            <tr><td><strong>Catalogue profile</strong></td><td>${_esc(s.catalogProfileLabel || s.catalogProfile || 'N/A')}</td></tr>
            <tr><td><strong>Table method</strong></td><td>${_esc(s.tableMethodLabel || 'N/A')}</td></tr>
            <tr><td><strong>System type</strong></td><td>${_esc(s.systemType.toUpperCase())}</td></tr>
            <tr><td><strong>Design current</strong></td><td>${s.designCurrent_A.toFixed(2)} A</td></tr>
            <tr><td><strong>Allowable current</strong></td><td>${s.selectedAllowableCurrent_A.toFixed(2)} A</td></tr>
            <tr><td><strong>Voltage drop</strong></td><td>${s.selectedVdrop_pct.toFixed(2)}% (limit ${s.dropLimit_pct.toFixed(2)}%), coeff ${Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? s.selectedVdropCoeff_mV_per_A_m.toFixed(3) : 'N/A'} mV/A/m</td></tr>
            <tr><td><strong>Suggested breaker</strong></td><td>${r.breakerA || 'N/A'} A</td></tr>
            <tr><td><strong>Suggested PE conductor</strong></td><td>${r.peCSA || 'N/A'} mm2</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Standards Reference</div>
        <table class="status-table">
          <thead><tr><th>Standard</th><th>Scope</th><th>Check</th></tr></thead>
          <tbody>${standardsRows}</tbody>
        </table>
      </div>

      ${Array.isArray(s.sourceRefs) && s.sourceRefs.length ? `<div class="card"><div class="card-title">Catalogue References Used</div>${s.sourceRefs.map((x) => `<div class="info-box">${_esc(x)}</div>`).join('')}</div>` : ''}

      <div class="card">
        <div class="card-title">Step-by-Step Calculation</div>
        <div style="font-family:monospace;font-size:0.82rem;background:var(--bg-3);border-radius:var(--radius);padding:12px;line-height:1.8;overflow-x:auto">
          ${steps}
        </div>
      </div>

      ${r.warnings.length ? `<div class="card"><div class="card-title">Warnings</div>${r.warnings.map((w) => `<div class="warn-box">${_esc(w)}</div>`).join('')}</div>` : ''}

      <div class="info-box">Pre-design guide only. Final cable/protection selection must be checked against manufacturer datasheets and local authority/utility requirements.</div>
    `;
  }

  function _standardsAuditMeta() {
    const requestedProfileId = (typeof App !== 'undefined' && App && App.state && App.state.fieldTestProfileId)
      ? String(App.state.fieldTestProfileId)
      : undefined;

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
      rulesVersion
    };
  }

  function _printReport(r) {
    App.printHTML('Wire Calculation Report', _buildReportHTML(r), {
      meta: `Purpose: ${r.purposeLabel} | Date: ${r.date}`
    });
  }

  function _exportPDF(r) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
      App.toast('PDF table plugin not loaded.', 'error');
      return;
    }

    const s = r.selector;
    const audit = _standardsAuditMeta();
    const margin = 12;
    const pageW = 210;

    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, pageW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Wire Calculation Report', margin, 10);

    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${r.timestamp} | Purpose: ${r.purposeLabel}`, margin, 22);
    const auditLine = `Standards profile: ${audit.profileLabel} [${audit.profileId}] | Ruleset version: ${audit.rulesVersion}`;
    const auditLines = doc.splitTextToSize(auditLine, pageW - (margin * 2));
    doc.setFontSize(8);
    doc.text(auditLines, margin, 26);
    const firstTableY = 26 + (auditLines.length * 4) + 2;

    doc.autoTable({
      startY: firstTableY,
      margin: { left: margin, right: margin },
      head: [['Item', 'Value']],
      body: [
        ['Selected cable', `${s.selectedCSA_mm2} mm2 ${s.material.toUpperCase()} (${s.systemType.toUpperCase()})`],
        ['Catalogue profile', `${s.catalogProfileLabel || s.catalogProfile || 'N/A'}`],
        ['Table method', `${s.tableMethodLabel || 'N/A'}`],
        ['Design current', `${s.designCurrent_A.toFixed(2)} A`],
        ['Allowable current', `${s.selectedAllowableCurrent_A.toFixed(2)} A`],
        ['Voltage drop', `${s.selectedVdrop_pct.toFixed(2)}% (limit ${s.dropLimit_pct.toFixed(2)}%), coeff ${Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? s.selectedVdropCoeff_mV_per_A_m.toFixed(3) : 'N/A'} mV/A/m`],
        ['Suggested breaker', `${r.breakerA || 'N/A'} A`],
        ['Suggested PE conductor', `${r.peCSA || 'N/A'} mm2`],
        ['Limiting criterion', s.limitedBy === 'ampacity' ? 'Ampacity/Thermal' : 'Voltage Drop'],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] }
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5,
      margin: { left: margin, right: margin },
      head: [['Standard', 'Scope', 'Check']],
      body: r.standards.map((x) => [x.code, x.title, x.checks]),
      styles: { fontSize: 7.3, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] }
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5,
      margin: { left: margin, right: margin },
      head: [['Step-by-step calculation']],
      body: _stepLines(r).map((x) => [x]),
      styles: { fontSize: 7.1, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] }
    });

    if (r.warnings.length) {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 5,
        margin: { left: margin, right: margin },
        head: [['Warnings']],
        body: r.warnings.map((w) => [w]),
        styles: { fontSize: 7.3, cellPadding: 1.8 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255] }
      });
    }

    const file = `Wire_Calc_${r.date}.pdf`;
    doc.save(file);
    App.toast(`PDF saved: ${file}`, 'success');
  }

  async function _exportDOCX(r) {
    if (!window.docx) {
      App.toast('DOCX library not loaded. Check internet connection.', 'error');
      return;
    }

    const s = r.selector;
    const audit = _standardsAuditMeta();
    const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } = window.docx;

    function p(text, bold) {
      return new Paragraph({
        children: [new TextRun({ text: String(text || ''), bold: !!bold })]
      });
    }

    function table(headers, rows) {
      const h = new TableRow({
        children: headers.map((x) => new TableCell({ children: [p(x, true)] }))
      });
      const b = rows.map((row) => new TableRow({
        children: row.map((x) => new TableCell({ children: [p(x, false)] }))
      }));
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [h, ...b]
      });
    }

    const blocks = [];
    blocks.push(new Paragraph({ text: 'Wire Calculation Report', heading: HeadingLevel.HEADING_1 }));
    blocks.push(p(`Generated: ${r.timestamp}`));
    blocks.push(p(`Purpose: ${r.purposeLabel}`));
    blocks.push(p(`Standards profile: ${audit.profileLabel} [${audit.profileId}] | Ruleset version: ${audit.rulesVersion}`));

    blocks.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }));
    blocks.push(table(['Item', 'Value'], [
      ['Selected cable', `${s.selectedCSA_mm2} mm2 ${s.material.toUpperCase()} (${s.systemType.toUpperCase()})`],
      ['Catalogue profile', `${s.catalogProfileLabel || s.catalogProfile || 'N/A'}`],
      ['Table method', `${s.tableMethodLabel || 'N/A'}`],
      ['Design current', `${s.designCurrent_A.toFixed(2)} A`],
      ['Allowable current', `${s.selectedAllowableCurrent_A.toFixed(2)} A`],
      ['Voltage drop', `${s.selectedVdrop_pct.toFixed(2)}% (limit ${s.dropLimit_pct.toFixed(2)}%), coeff ${Number.isFinite(s.selectedVdropCoeff_mV_per_A_m) ? s.selectedVdropCoeff_mV_per_A_m.toFixed(3) : 'N/A'} mV/A/m`],
      ['Suggested breaker', `${r.breakerA || 'N/A'} A`],
      ['Suggested PE conductor', `${r.peCSA || 'N/A'} mm2`],
      ['Limiting criterion', s.limitedBy === 'ampacity' ? 'Ampacity/Thermal' : 'Voltage Drop'],
    ]));

    blocks.push(new Paragraph({ text: 'Standards Reference', heading: HeadingLevel.HEADING_2 }));
    blocks.push(table(['Standard', 'Scope', 'Check'], r.standards.map((x) => [x.code, x.title, x.checks])));

    blocks.push(new Paragraph({ text: 'Step-by-Step Calculation', heading: HeadingLevel.HEADING_2 }));
    blocks.push(table(['Calculation Step'], _stepLines(r).map((x) => [x])));

    if (r.warnings.length) {
      blocks.push(new Paragraph({ text: 'Warnings', heading: HeadingLevel.HEADING_2 }));
      r.warnings.forEach((w) => blocks.push(p(`- ${w}`)));
    }

    blocks.push(p('Pre-design guide only. Final design must be checked against product datasheets and approved local requirements.'));

    const doc = new Document({ sections: [{ children: blocks }] });
    const blob = await Packer.toBlob(doc);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wire_Calc_${r.date}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.toast(`DOCX saved: Wire_Calc_${r.date}.docx`, 'success');
  }

  return { render };
})();
