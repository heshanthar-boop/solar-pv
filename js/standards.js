/**
 * standards.js — Standards Reference & Quick-Check Calculators
 * All major IEC, SLS, PUCSL standards for PV design & inspection.
 * Each standard: what it says + interactive formula calculator with step-by-step working.
 */

const Standards = (() => {

  // -----------------------------------------------------------------------
  // STANDARDS DATA
  // -----------------------------------------------------------------------

  const STANDARDS = [
    {
      id: 'iec62446',
      code: 'IEC 62446-1:2016',
      title: 'Grid-Connected PV Systems — Commissioning Tests & Documentation',
      scope: 'Defines minimum documentation and tests required when commissioning a grid-tied PV system. Mandatory for any professional installation.',
      keyPoints: [
        'String Voc must be measured and compared to expected (temperature-corrected) value',
        'String Isc must be measured and compared to datasheet',
        'Insulation resistance: minimum 1 MΩ at 500V DC test voltage',
        'Continuity of protective earth conductors must be verified',
        'All strings, combiner boxes, inverters must be labelled',
        'As-built documentation: string layout, single-line diagram, component datasheets',
        'Functional test: inverter startup, shutdown, protection relay check',
      ],
      limits: [
        { param: 'Min Insulation Resistance', value: '1 MΩ', note: 'At 500V DC, DC+ and DC− to earth separately' },
        { param: 'Voc tolerance', value: '±2% of expected', note: 'After temperature correction' },
        { param: 'Isc tolerance', value: '±5% of expected', note: 'After irradiance correction' },
      ],
      calcs: ['ir_test', 'voc_check', 'isc_check']
    },
    {
      id: 'iec61215',
      code: 'IEC 61215:2021',
      title: 'PV Modules — Design Qualification & Type Approval',
      scope: 'Performance and durability qualification testing for terrestrial PV modules. Ensures modules can withstand field conditions over 25+ year lifetime.',
      keyPoints: [
        'Thermal cycling: -40°C to +85°C, 200 cycles',
        'Damp heat: 85°C / 85% RH for 1000 hours',
        'UV pre-conditioning: 15 kWh/m² UV exposure',
        'Mechanical load: 2400 Pa front and rear',
        'Hail impact: 25 mm hailstones at 23 m/s',
        'Maximum power degradation allowed: 5% after sequence A, 8% after sequence B',
        'Insulation test: 1000V + 2×Vmax for 1 minute',
      ],
      limits: [
        { param: 'Max power degradation', value: '≤5% (Seq A) / ≤8% (Seq B)', note: 'After complete test sequence' },
        { param: 'Insulation test voltage', value: '1000V + 2×Vsys_max', note: '1 minute duration' },
        { param: 'Mechanical load', value: '2400 Pa', note: 'Both front and rear' },
      ],
      calcs: ['insulation_test_voltage', 'power_degradation']
    },
    {
      id: 'iec61730',
      code: 'IEC 61730:2023',
      title: 'PV Module Safety Qualification',
      scope: 'Safety requirements for PV modules — construction (Part 1) and testing (Part 2). Covers protection against electrical shock, fire, and mechanical failure.',
      keyPoints: [
        'Module class: Class A (dangerous voltage/power), Class B (limited voltage/power), Class C (low voltage/power)',
        'Maximum system voltage must be marked on module label',
        'Earthing: all conductive accessible parts must be bonded to earth',
        'Bypass diodes must pass thermal test at Isc for 1 hour',
        'Reverse current overload: module must withstand 1.35 × Isc_max_series_fuse',
        'Wet leakage current: must not exceed 50 µA after wet conditioning',
        'Hot-spot endurance: 5 hours at worst-case hot-spot conditions',
      ],
      limits: [
        { param: 'Wet leakage current', value: '≤50 µA', note: 'After wet conditioning at Vmax' },
        { param: 'Reverse current overload', value: '1.35 × Isc × fuse rating', note: '1 hour duration' },
        { param: 'Frame earthing resistance', value: '< 0.1 Ω', note: 'Between any two earthed points on frame' },
      ],
      calcs: ['reverse_current', 'bypass_diode_check']
    },
    {
      id: 'iec60364',
      code: 'IEC 60364-7-712:2017',
      title: 'Electrical Installations — Solar PV Power Supply Systems',
      scope: 'Wiring rules, protection, and earthing requirements specifically for PV systems as part of building electrical installations.',
      keyPoints: [
        'DC circuits must be protected against overcurrent with string fuses or CBs',
        'String fuse rating: must not exceed module reverse current rating (Series Fuse Rating on datasheet)',
        'DC isolators required at inverter DC input (lockable)',
        'AC isolator required between inverter and grid connection',
        'Earthing: TN-S or TT system earthing for AC side',
        'Earth electrode resistance: target < 1 Ω for effective fault protection',
        'Cable sizing: DC cable must handle 1.25 × Isc continuous (derating factors apply)',
        'All outdoor DC cables must be UV-resistant and suitable for DC use',
      ],
      limits: [
        { param: 'Earth electrode resistance', value: '< 1 Ω', note: 'IEC 60364-5-54 reference' },
        { param: 'DC cable current capacity', value: '≥ 1.25 × Isc', note: 'Continuous current, apply derating' },
        { param: 'String fuse rating', value: '≤ Series Fuse Rating on module label', note: 'Never exceed module reverse current limit' },
      ],
      calcs: ['cable_sizing', 'string_fuse', 'earth_resistance']
    },
    {
      id: 'iec61643',
      code: 'IEC 61643-32:2019 / SLS 1522:2016',
      title: 'DC-Side Surge Protective Devices (SPD) — PV Systems',
      scope: 'Requirements for SPDs on the DC side of PV installations. SLS 1522 is the Sri Lankan equivalent. Both are mandatory in Sri Lanka per PUCSL guidelines.',
      keyPoints: [
        'SPD required at array combiner box and at inverter DC input',
        'SPD protection level (Up) must be less than inverter DC input withstand voltage',
        'SPD must be rated for DC voltage (UC ≥ 1.2 × Voc_max_string)',
        'SPD discharge current (In) minimum 5 kA, recommended 20 kA for exposed sites',
        'Type 2 SPD for most PV applications; Type 1+2 for locations with direct lightning risk',
        'SPD must be equipped with remote signalling or visual indication of failure',
        'Minimum isolation provided by disconnect switch integral or external to SPD',
      ],
      limits: [
        { param: 'SPD voltage rating (UC)', value: '≥ 1.2 × Voc_string_max', note: 'At lowest temperature' },
        { param: 'Min discharge current (In)', value: '≥ 5 kA', note: '20 kA recommended for exposed/rural' },
        { param: 'Protection level (Up)', value: '< inverter DC withstand', note: 'Typically ≤ 2.5 kV' },
      ],
      calcs: ['spd_uc_rating', 'spd_summary']
    },
    {
      id: 'iec61724',
      code: 'IEC 61724-1:2021',
      title: 'PV System Performance Monitoring & Analysis',
      scope: 'Defines performance metrics, measurement requirements, and reporting for PV power plants. PR is the key metric for commissioning acceptance and ongoing monitoring.',
      keyPoints: [
        'Performance Ratio (PR): normalised energy output accounting for irradiation and capacity',
        'PR > 80% generally expected for a well-performing new system in Sri Lanka',
        'Specific yield (kWh/kWp) varies: Sri Lanka typically 1300–1600 kWh/kWp/year',
        'Temperature-corrected PR removes the effect of ambient temperature on PR',
        'System availability: ratio of time system is operational vs available to operate',
        'Capacity factor: actual kWh / theoretical maximum kWh at full capacity 24/7',
      ],
      limits: [
        { param: 'Acceptable PR (new system)', value: '≥ 75%', note: 'Below 70% warrants full investigation' },
        { param: 'Sri Lanka specific yield', value: '1300–1600 kWh/kWp/year', note: 'Location-dependent' },
        { param: 'PR degradation rate', value: '≤ 0.5–0.7% per year', note: 'Typical mono-Si modules' },
      ],
      calcs: ['pr_calc', 'specific_yield', 'capacity_factor']
    },
    {
      id: 'iec62804',
      code: 'IEC TS 62804-1:2025',
      title: 'Potential-Induced Degradation (PID) Test Methods',
      scope: 'Defines test methods for detecting PID in PV modules. PID is a major degradation mechanism in tropical, high-humidity climates like Sri Lanka.',
      keyPoints: [
        'PID occurs when high negative voltage between module frame and cells drives leakage current',
        'Most vulnerable: p-type cells in negative-grounded or ungrounded systems',
        'N-type cells (TOPCon, HJT) generally more PID-resistant',
        'Prevention: negative grounding of array, PID recovery boxes, or positive ground systems',
        'Test voltage: system maximum voltage applied between frame and short-circuited module terminals',
        'Test duration: 96 hours at 60°C, 85% RH',
        'Pass criterion: Pmax degradation ≤ 5%',
      ],
      limits: [
        { param: 'PID test Pmax degradation', value: '≤ 5%', note: '96h at 60°C/85%RH' },
        { param: 'High-risk humidity', value: '> 60% RH ambient', note: 'Sri Lanka coastal: high PID risk' },
      ],
      calcs: ['pid_risk']
    },
    {
      id: 'iec62548',
      code: 'IEC 62548:2016',
      title: 'PV Array Design Requirements',
      scope: 'Requirements for the design of PV arrays including string sizing, protection, earthing, and labelling. The primary design standard for PV arrays.',
      keyPoints: [
        'Maximum string Voc must not exceed inverter or cable/component rating at minimum temperature',
        'String Voc at Tmin = Voc_stc × (1 + αVoc × (Tmin − 25))',
        'Minimum string Vmp must stay above MPPT minimum at maximum cell temperature',
        'Maximum reverse current per module must not exceed Series Fuse Rating × 1.35',
        'String fuse required if more than 3 strings are paralleled',
        'DC wiring must be polarised (+ and − clearly marked) throughout',
        'Array earth fault detection required for ungrounded systems',
      ],
      limits: [
        { param: 'String Voc at Tmin', value: '≤ inverter Vmax', note: 'Critical sizing constraint' },
        { param: 'String Vmp at Tmax_cell', value: '≥ inverter MPPT Vmin', note: 'Ensures MPPT tracking' },
        { param: 'String fuse required when', value: '> 3 strings in parallel', note: 'Per combiner MPPT' },
      ],
      calcs: ['string_voc_tmin', 'string_vmp_tmax', 'max_strings_no_fuse']
    },
    {
      id: 'pucsl',
      code: 'PUCSL Guidelines (Latest)',
      title: 'Sri Lanka — Rooftop Solar PV Installation Guidelines',
      scope: 'Public Utilities Commission of Sri Lanka mandatory guidelines for grid-connected rooftop solar. Applies to all net-metering and net-accounting solar installations in Sri Lanka.',
      keyPoints: [
        'System size limits: residential ≤ sanctioned load, commercial/industrial subject to PUCSL approval',
        'Mandatory use of CEB/LECO approved bi-directional meter for net accounting',
        'Anti-islanding protection mandatory — inverter must comply with IEC 62116',
        'Over/under voltage protection: disconnect at ±10% of nominal (230V)',
        'Over/under frequency protection: disconnect outside 49–51 Hz',
        'All equipment must be CE marked or carry equivalent approval',
        'Mandatory commissioning inspection by PUCSL-registered service provider',
        'SPD installation mandatory per SLS 1522',
        'System must carry public liability insurance',
        'Net metering: export to grid at buy-back tariff set by PUCSL',
      ],
      limits: [
        { param: 'Voltage tolerance', value: '230V ± 10% (207–253V)', note: 'Disconnect outside range' },
        { param: 'Frequency tolerance', value: '50 Hz ± 1 Hz (49–51 Hz)', note: 'Disconnect outside range' },
        { param: 'Max residential system', value: '≤ sanctioned load (kVA)', note: 'PUCSL approval for larger' },
      ],
      calcs: ['grid_voltage_check', 'system_size_check']
    },
    {
      id: 'iec62116',
      code: 'IEC 62116:2014',
      title: 'Anti-Islanding Protection for Grid-Connected Inverters',
      scope: 'Test procedure for verifying that grid-connected PV inverters disconnect from the grid when grid supply is lost. Mandatory in Sri Lanka per PUCSL.',
      keyPoints: [
        'Inverter must detect islanding within 2 seconds and disconnect',
        'Active anti-islanding methods: frequency shift, voltage shift, impedance monitoring',
        'Passive methods: rate of change of frequency (ROCOF), voltage vector shift',
        'Must not trip on normal grid disturbances (nuisance tripping)',
        'Must reconnect automatically after grid is stable for ≥ 60 seconds',
        'ROCOF protection setting: typically 0.5–1.0 Hz/s',
      ],
      limits: [
        { param: 'Islanding detection time', value: '≤ 2 seconds', note: 'From loss of grid to disconnection' },
        { param: 'Reconnection delay', value: '≥ 60 seconds', note: 'After grid returns to stable limits' },
        { param: 'ROCOF setting', value: '0.5–1.0 Hz/s', note: 'Typical Sri Lanka grid setting' },
      ],
      calcs: []
    },
    {
      id: 'sls1522',
      code: 'SLS 1522:2016',
      title: 'Code of Practice for Grid-Connected PV Systems (Sri Lanka)',
      scope: 'Sri Lanka Bureau of Standards mandatory code covering documentation, design, installation, testing, and commissioning of grid-connected PV systems. This is the primary Sri Lanka-specific PV installation standard.',
      keyPoints: [
        'All grid-connected PV systems in Sri Lanka must comply with this code',
        'SPD (Surge Protective Device) mandatory on DC side — UC ≥ 1.2 × Voc_max',
        'DC isolator: lockable, accessible, rated for DC current interruption',
        'AC isolator: between inverter AC output and grid connection point',
        'Earthing: all metallic parts of array structure must be bonded to earth',
        'Earth resistance: < 1 Ω for effective fault protection',
        'Cable sizing: DC cables rated for 1.25 × Isc continuous, UV-resistant, PV1-F or equivalent',
        'Inverter must carry CEB/LECO type approval for grid connection',
        'Anti-islanding protection mandatory (IEC 62116 compliant)',
        'Commissioning test record must be submitted to CEB/LECO with net-metering application',
        'Labels: string polarity, DC/AC isolation points, warning signs on all junction boxes',
      ],
      limits: [
        { param: 'SPD UC rating', value: '≥ 1.2 × Voc_string_max', note: 'DC side — both at combiner and inverter input' },
        { param: 'Earth resistance', value: '< 1 Ω', note: 'Fall-of-potential or clamp test method' },
        { param: 'DC cable type', value: 'PV1-F or TUV approved', note: 'UV-resistant, double insulation, rated 90°C' },
      ],
      calcs: ['spd_uc_rating', 'inverter_sizing', 'cable_vdrop', 'dc_fuse_sizing']
    },
    {
      id: 'sls1543',
      code: 'SLS 1543 / IEC 62109:2010',
      title: 'Safety of Power Converters for Use in PV Power Systems',
      scope: 'Safety requirements for inverters, charge controllers, and converters used in PV systems. Covers electrical safety, thermal limits, insulation, and protection. This standard is the basis for CEB/LECO inverter type approval in Sri Lanka.',
      keyPoints: [
        'Inverter must have CE marking or CEB/LECO type approval — SLS 1543 compliance required',
        'Over/under voltage protection: must trip at ±10% of nominal grid voltage (207–253V)',
        'Over/under frequency protection: must trip outside 49–51 Hz',
        'Anti-islanding: must detect and disconnect within 2 seconds (IEC 62116)',
        'DC injection: max 0.5% of rated current injected into AC grid',
        'Efficiency: rated inverter efficiency must be stated; CEC efficiency preferred metric',
        'Thermal protection: inverter must not exceed rated operating temperature range',
        'Enclosure: minimum IP65 for outdoor installation',
        'Ground fault detection: required for ungrounded (IT) DC systems',
        'Short-circuit and overcurrent protection integral or external must be provided',
      ],
      limits: [
        { param: 'Grid trip voltage', value: '207–253 V (230V ±10%)', note: 'Disconnect outside this range' },
        { param: 'Grid trip frequency', value: '49–51 Hz (50 Hz ±1 Hz)', note: 'Disconnect outside this range' },
        { param: 'Max DC injection', value: '≤ 0.5% of rated AC current', note: 'IEC 62109-2 requirement' },
        { param: 'Min enclosure rating', value: 'IP65 (outdoor)', note: 'IP54 minimum for sheltered installation' },
      ],
      calcs: ['grid_voltage_check', 'inverter_sizing']
    },
    {
      id: 'sls1547',
      code: 'SLS 1547 / IEC 61727:2004',
      title: 'Characteristics of the Utility Interface for PV Systems',
      scope: 'Defines the interface requirements between grid-connected PV systems and the utility grid. Sets limits for power quality, protection settings, and reconnection conditions. Referenced by PUCSL for all net-metering applications in Sri Lanka.',
      keyPoints: [
        'Defines interconnection technical requirements between PV system and CEB/LECO grid',
        'Voltage regulation: PV system must not cause grid voltage to exceed ±5% at point of connection',
        'Power factor: unity power factor preferred; inverters must not cause PF < 0.9',
        'Harmonics: THD of injected current must be ≤ 5% of fundamental',
        'DC injection: ≤ 1% of rated output current (or ≤ 0.5A, whichever is less)',
        'Reconnection: after grid outage, inverter must wait ≥ 60 seconds before reconnecting',
        'Reconnection window: grid must be within 230V ±5% and 50 Hz ±0.5 Hz before reconnecting',
        'Voltage unbalance: single-phase injection limited to avoid excessive unbalance on LV network',
      ],
      limits: [
        { param: 'Grid voltage impact', value: '±5% at POC', note: 'Point of Connection — check with CEB/LECO for large systems' },
        { param: 'Current THD', value: '≤ 5%', note: 'Of rated output current' },
        { param: 'Power factor', value: '≥ 0.9 lagging/leading', note: 'Unity preferred for residential' },
        { param: 'Reconnection delay', value: '≥ 60 seconds', note: 'After grid voltage/frequency return to normal' },
      ],
      calcs: ['grid_voltage_check', 'inverter_sizing']
    },
    {
      id: 'iec61853',
      code: 'IEC 61853:2011–2018',
      title: 'PV Module Performance Rating & Energy Evaluation',
      scope: 'Multi-part standard defining how module performance is rated across a matrix of irradiance and temperature conditions. Used for accurate energy yield prediction.',
      keyPoints: [
        'Defines NOCT (Nominal Operating Cell Temperature) test conditions: 800 W/m², 20°C ambient, 1 m/s wind',
        'Module temperature in field: T_cell = T_amb + (NOCT − 20) / 800 × G',
        'Low-light performance rated at 200 W/m² — important for cloudy climates',
        'Annual energy prediction uses climate dataset × module performance matrix',
        'Spectral correction factor (FSF) applied for different climates',
      ],
      limits: [
        { param: 'NOCT test conditions', value: '800 W/m², 20°C, 1 m/s wind', note: 'Module-only, no enclosure' },
        { param: 'Cell temp formula', value: 'T_amb + (NOCT − 20)/800 × G', note: 'IEC 61853 / IEC 61215' },
      ],
      calcs: ['cell_temp_noct']
    },
    {
      id: 'pv_degradation',
      code: 'IEC 61215 / SLS 1553 — PV Module Degradation',
      title: 'PV Module Power Degradation — Formulas, Benchmarks & Sri Lanka Requirements',
      scope: 'Covers how PV module power output degrades over time, applicable calculation formulas (linear and compound), industry benchmarks by technology type, and Sri Lanka-specific requirements under SLS 1553 / IEC 61215. Used for energy yield prediction, warranty assessment, and commissioning acceptance.',
      keyPoints: [
        'IEC 61215: modules must retain ≥95% of initial power after design qualification stress tests (simulating ~5–10 years)',
        'SLS 1553 (Sri Lanka) adopts IEC 61215 and IEC 61730 through SLSI — CEB/LECO grid connection requires valid IEC 61215 certificate',
        '25-year linear power guarantee common requirement in Sri Lanka: ≥80% of initial power at Year 25',
        'Linear degradation formula: P(n) = P₀ × (1 − LID) − P₀ × d × (n − 1)',
        'Compound degradation formula: P(n) = P₀ × (1 − LID) × (1 − d)^(n−1)',
        'LID (Light-Induced Degradation): initial Year 1 loss, typically 1.0–2.5% for crystalline silicon',
        'Annual degradation rate (d): 0.3–0.5% mono-Si, 0.5–0.8% poly-Si, 0.6–1.0% thin-film',
        'Sri Lanka tropical factors: high humidity/heat can cause PID and encapsulant browning; coastal sites risk salt mist corrosion of interconnects',
        'N-type modules (TOPCon, HJT) have lower LID and better long-term degradation performance',
      ],
      limits: [
        { param: 'Year 1 LID (mono-Si typical)', value: '1.0–2.5%', note: 'Light-Induced Degradation — occurs in first hours of sunlight exposure' },
        { param: 'Annual degradation — monocrystalline', value: '0.3–0.5%/year', note: 'Expected output at Year 25: 88–93%' },
        { param: 'Annual degradation — polycrystalline', value: '0.5–0.8%/year', note: 'Expected output at Year 25: 80–88%' },
        { param: 'Annual degradation — thin-film', value: '0.6–1.0%/year', note: 'Expected output at Year 25: 75–85%' },
        { param: 'Warranty minimum at Year 25 (SLS 1553)', value: '≥80% of initial power', note: '25-year linear guarantee standard in Sri Lanka' },
        { param: 'IEC 61215 stress test limit', value: '≤5% power loss', note: 'After Sequence A (or ≤8% Sequence B)' },
      ],
      calcs: ['linear_degradation', 'compound_degradation', 'warranty_check']
    },
  ];

  // -----------------------------------------------------------------------
  // RENDER MAIN PAGE
  // -----------------------------------------------------------------------

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128218; Standards Reference</div>

        <div class="info-box">
          ${STANDARDS.length} standards covered — IEC international &amp; Sri Lanka (PUCSL / SLS 1522 / SLS 1543 / SLS 1547).
          Each standard: summary, key limits, and interactive formula calculators with step-by-step working.
        </div>

        <!-- SEARCH -->
        <div class="form-group" style="margin-bottom:12px">
          <input type="search" class="form-input" id="std-search" placeholder="Search standards, keywords, limits..." />
        </div>

        <!-- STANDARDS LIST -->
        <div id="std-list">
          ${STANDARDS.map(s => _stdCard(s)).join('')}
        </div>
      </div>
    `;

    // Search filter
    container.querySelector('#std-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.std-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });

    // Expand/collapse
    container.querySelectorAll('.std-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.stdId;
        const body = container.querySelector('#std-body-' + id);
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        btn.textContent = isOpen ? '▼ Show details & calculators' : '▲ Hide';
      });
    });

    // Calc buttons
    container.querySelectorAll('.std-calc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stdId = btn.dataset.stdId;
        const calcId = btn.dataset.calcId;
        _showCalc(container, stdId, calcId);
      });
    });
  }

  function _stdCard(s) {
    const limitRows = s.limits.map(l => `
      <tr>
        <td style="font-weight:600">${l.param}</td>
        <td style="color:var(--primary);font-weight:700">${l.value}</td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${l.note}</td>
      </tr>`).join('');

    const pointsHtml = s.keyPoints.map(p => `<li>${p}</li>`).join('');

    const calcBtns = s.calcs.map(cId => `
      <button class="btn btn-secondary btn-sm std-calc-btn" data-std-id="${s.id}" data-calc-id="${cId}">
        &#128290; ${_calcLabel(cId)}
      </button>`).join('');

    return `
      <div class="std-card card" style="margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1">
            <div style="font-size:0.75rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.05em">${s.code}</div>
            <div style="font-weight:700;font-size:0.95rem;margin-top:2px">${s.title}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px">${s.scope}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm std-expand-btn" data-std-id="${s.id}" style="margin-top:10px;width:100%">
          ▼ Show details &amp; calculators
        </button>
        <div id="std-body-${s.id}" class="hidden" style="margin-top:12px">
          <div class="section-title">What This Standard Requires</div>
          <ul style="margin:0 0 12px 18px;font-size:0.83rem;line-height:1.7">
            ${pointsHtml}
          </ul>
          <div class="section-title">Key Limits &amp; Values</div>
          <div style="overflow-x:auto;margin-bottom:12px">
            <table class="status-table">
              <thead><tr><th>Parameter</th><th>Limit / Value</th><th>Note</th></tr></thead>
              <tbody>${limitRows}</tbody>
            </table>
          </div>
          ${s.calcs.length ? `
            <div class="section-title">Interactive Calculators</div>
            <div class="btn-group" style="flex-wrap:wrap">
              ${calcBtns}
            </div>
            <div id="calc-area-${s.id}" style="margin-top:12px"></div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function _calcLabel(id) {
    const labels = {
      ir_test:              'IR Test Check',
      voc_check:            'String Voc Check',
      isc_check:            'String Isc Check',
      insulation_test_voltage: 'Insulation Test Voltage',
      power_degradation:    'Power Degradation %',
      reverse_current:      'Reverse Current Check',
      bypass_diode_check:   'Bypass Diode Check',
      cable_sizing:         'DC Cable Sizing',
      string_fuse:          'String Fuse Rating',
      earth_resistance:     'Earth Resistance Check',
      spd_uc_rating:        'SPD Voltage Rating',
      spd_summary:          'SPD Selection Guide',
      pr_calc:              'Performance Ratio',
      specific_yield:       'Specific Yield',
      capacity_factor:      'Capacity Factor',
      pid_risk:             'PID Risk Assessment',
      string_voc_tmin:      'String Voc at Tmin',
      string_vmp_tmax:      'String Vmp at Tmax',
      max_strings_no_fuse:  'Max Strings (No Fuse)',
      grid_voltage_check:   'Grid Voltage Check',
      system_size_check:    'System Size Check',
      cell_temp_noct:       'Cell Temperature (NOCT)',
      inverter_sizing:      'Inverter Sizing (AC/DC Ratio)',
      cable_vdrop:          'Cable Voltage Drop',
      dc_fuse_sizing:       'DC Fuse Sizing',
      linear_degradation:   'Linear Degradation (Warranty)',
      compound_degradation: 'Compound Degradation (Realistic)',
      warranty_check:       'Warranty Power Check',
    };
    return labels[id] || id;
  }

  // -----------------------------------------------------------------------
  // CALCULATOR RENDERERS
  // -----------------------------------------------------------------------

  function _showCalc(container, stdId, calcId) {
    const area = container.querySelector('#calc-area-' + stdId);
    if (!area) return;

    const html = _buildCalcHtml(calcId);
    area.innerHTML = `
      <div class="card" style="border:2px solid var(--primary);background:var(--primary-bg)">
        <div class="card-title" style="color:var(--primary)">&#128290; ${_calcLabel(calcId)}</div>
        ${html}
      </div>
    `;

    // Wire calculate button
    const btn = area.querySelector('.calc-run-btn');
    if (btn) btn.addEventListener('click', () => _runCalc(area, calcId));
  }

  function _inp(id, label, placeholder, value, hint) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <input class="form-input" id="${id}" type="number" step="any" placeholder="${placeholder||''}" value="${value||''}" />
        ${hint ? `<div class="form-hint">${hint}</div>` : ''}
      </div>`;
  }

  function _buildCalcHtml(calcId) {
    const panels = DB.getAll();
    const pOpts = `<option value="">-- Select Panel (optional) --</option>` +
      panels.map(p => `<option value="${p.id}">${p.manufacturer} ${p.model}</option>`).join('');

    switch (calcId) {

      case 'ir_test': return `
        <div class="info-box">IEC 62446-1 Cl.5.3.3: IR ≥ 1 MΩ at 500V DC. Test DC+ to earth AND DC− to earth.</div>
        <div class="form-row cols-2">
          ${_inp('c-ir-pos', 'DC+ to Earth (MΩ)', '0.00', '', 'Measured with 500V DC insulation tester')}
          ${_inp('c-ir-neg', 'DC− to Earth (MΩ)', '0.00', '', 'Measured with 500V DC insulation tester')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'voc_check': return `
        <div class="info-box">IEC 62446-1: Measured Voc must be within ±2% of temperature-corrected expected value.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',   'Modules per String', '20', '20', 'Number of modules in this string')}
          ${_inp('c-tmod',   'Module Temp (°C)',   '55', '55', 'Back-of-panel temperature at time of test')}
          ${_inp('c-voc-m',  'Measured Voc (V)',   '',   '',   'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'isc_check': return `
        <div class="info-box">IEC 62446-1: Measured Isc must be within ±5% of irradiance-corrected expected value.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-irr',   'Irradiance (W/m²)', '900', '900', 'From reference cell or pyranometer')}
          ${_inp('c-tmod',  'Module Temp (°C)',  '55',  '55',  'Back-of-panel')}
          ${_inp('c-isc-m', 'Measured Isc (A)',  '',    '',    'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'insulation_test_voltage': return `
        <div class="info-box">IEC 61215 / IEC 61730: Test voltage = 1000V + 2 × Vsys_max for Class A modules.</div>
        ${_inp('c-vsys', 'System Maximum Voltage (V)', '1000', '1000', 'From inverter spec or design (e.g. 1000V or 1500V)')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'power_degradation': return `
        <div class="info-box">IEC 61215: Max allowed power degradation = 5% after sequence A, 8% after sequence B. Also useful for field annual degradation check.</div>
        <div class="form-row cols-2">
          ${_inp('c-p-initial', 'Initial Pmax (W)', '', '', 'Nameplate or commissioning measurement')}
          ${_inp('c-p-current', 'Current Pmax (W)', '', '', 'Measured today (corrected to STC)')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'reverse_current': return `
        <div class="info-box">IEC 61730 / IEC 62548: Max reverse current through any module = 1.35 × Series Fuse Rating. Exceeding this destroys bypass diodes.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-fuse',   'Series Fuse Rating (A)', '', '', 'From module datasheet / label')}
          ${_inp('c-nstr',   'Strings in Parallel',    '2', '2', 'Strings connected to same MPPT/combiner')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'bypass_diode_check': return `
        <div class="info-box">IEC 61730: Bypass diode thermally rated for Isc for 1 hour. Check if measured string Voc suggests a failed diode (Voc drops by ~Voc/3 per diode).</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',   'Modules per String', '20', '20', '')}
          ${_inp('c-voc-m',  'Measured String Voc (V)', '', '', 'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'cable_sizing': return `
        <div class="info-box">IEC 60364-7-712: DC cable must carry 1.25 × Isc continuously. Apply derating for temperature, grouping, and conduit.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nstr',     'Strings per Cable Run', '1', '1', 'Parallel strings on this cable')}
          ${_inp('c-derate',   'Derating Factor',       '0.82', '0.82', 'Temp + grouping derating. 0.82 typical for Sri Lanka outdoor.')}
          ${_inp('c-cabamp',   'Cable Ampacity (A)',     '', '', 'From cable datasheet for selected cross-section')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'string_fuse': return `
        <div class="info-box">IEC 62548 / IEC 60364-7-712: String fuse ≤ Series Fuse Rating on module label. Fuse also must be > 1.5 × Isc to avoid nuisance blowing.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        ${_inp('c-fuse-r',  'Series Fuse Rating on Module Label (A)', '', '', 'From datasheet — max reverse current')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'earth_resistance': return `
        <div class="info-box">IEC 60364-5-54 / PUCSL: Earth electrode resistance < 1 Ω. Measured with earth tester (3-pin fall-of-potential or clamp method).</div>
        ${_inp('c-re', 'Measured Earth Resistance (Ω)', '', '', 'From earth resistance tester (DET, Fluke etc.)')}
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'spd_uc_rating': return `
        <div class="info-box">IEC 61643-32 / SLS 1522: SPD continuous operating voltage UC ≥ 1.2 × Voc_string_max (at lowest temperature).</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',  'Modules per String', '20', '20', '')}
          ${_inp('c-tmin',  'Min Site Temp (°C)', '10', '10', 'Lowest ambient expected')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'spd_summary': return `
        <div class="info-box">SPD selection summary for a PV system. Shows required UC, recommended In, and type selection.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',   '20', '20', '')}
          ${_inp('c-tmin',    'Min Site Temp (°C)',    '10', '10', '')}
          ${_inp('c-vsys',    'System Voltage (V)',    '1000','1000','Inverter max DC input')}
        </div>
        <div class="form-group">
          <label class="form-label">Site Exposure</label>
          <select class="form-select" id="c-exposure">
            <option value="sheltered">Sheltered (urban, surrounded by buildings)</option>
            <option value="normal" selected>Normal (suburban, open area)</option>
            <option value="exposed">Exposed (rural, hilltop, coastal Sri Lanka)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Generate SPD Spec</button>
        <div id="calc-result"></div>`;

      case 'pr_calc': return `
        <div class="info-box">IEC 61724-1: PR = E_AC ÷ (H_poa × P_stc ÷ G_stc). Shows complete step-by-step calculation.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac',   'AC Energy Produced (kWh)', '', '', 'From inverter or CEB meter — same period as H_poa')}
          ${_inp('c-hpoa',  'POA Irradiation (kWh/m²)', '', '', 'Plane-of-array irradiation — same period')}
          ${_inp('c-pkwp',  'System DC Capacity (kWp)', '', '', 'Total array nameplate')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate PR</button>
        <div id="calc-result"></div>`;

      case 'specific_yield': return `
        <div class="info-box">Specific Yield (kWh/kWp) = annual AC energy ÷ system capacity. Sri Lanka typical: 1300–1600 kWh/kWp/year.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac-yr', 'Annual AC Energy (kWh)', '', '', 'From inverter annual log or CEB meter')}
          ${_inp('c-pkwp',   'System DC Capacity (kWp)', '', '', 'Total nameplate')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'capacity_factor': return `
        <div class="info-box">Capacity Factor = Actual kWh ÷ (kWp × 8760 hours). Typical PV: 15–22% in Sri Lanka.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac-yr', 'Annual AC Energy (kWh)', '', '', '')}
          ${_inp('c-pkwp',   'System DC Capacity (kWp)', '', '', '')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'pid_risk': return `
        <div class="info-box">IEC TS 62804: PID risk assessment for Sri Lanka conditions. High humidity + high system voltage = high risk.</div>
        <div class="form-row cols-2">
          ${_inp('c-vsys',   'String Voc at Tmin (V)', '', '', 'Highest voltage in string at coldest temp')}
          ${_inp('c-humid',  'Average Relative Humidity (%)', '80', '80', 'Sri Lanka coastal ~80–85%, hill country ~75%')}
        </div>
        <div class="form-group">
          <label class="form-label">Module Type</label>
          <select class="form-select" id="c-modtype">
            <option value="p-type">p-type (Mono-PERC, BSF) — Higher PID risk</option>
            <option value="n-type">N-type (TOPCon, HJT) — Lower PID risk</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">System Grounding</label>
          <select class="form-select" id="c-ground">
            <option value="none">Ungrounded (floating) — Higher risk</option>
            <option value="negative">Negative ground — Reduces PID for p-type</option>
            <option value="positive">Positive ground — Increases PID for p-type</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Assess Risk</button>
        <div id="calc-result"></div>`;

      case 'string_voc_tmin': return `
        <div class="info-box">IEC 62548: String Voc at Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25)). Must be ≤ inverter max DC input voltage.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',     '20',   '20',   '')}
          ${_inp('c-tmin',    'Min Site Temp (°C)',      '10',   '10',   'Sri Lanka default: 10°C')}
          ${_inp('c-vinvmax', 'Inverter Max DC (V)',     '1000', '1000', 'From inverter spec')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'string_vmp_tmax': return `
        <div class="info-box">IEC 62548: String Vmp at Tmax_cell = n × Vmp_stc × (1 + αVoc × (Tcell − 25)). Must be ≥ inverter MPPT minimum voltage.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',       '20',  '20',  '')}
          ${_inp('c-tamb',    'Max Ambient Temp (°C)',    '38',  '38',  'Hottest day ambient')}
          ${_inp('c-vmppt',   'Inverter MPPT Vmin (V)',   '200', '200', 'From inverter spec')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'max_strings_no_fuse': return `
        <div class="info-box">IEC 62548 Cl.9.4: String fuses are NOT required if the number of parallel strings ≤ 3 (when each string's Isc_max_reverse ≤ module fuse rating). For &gt; 3 strings, fuses are required.</div>
        ${_inp('c-nstr', 'Number of Parallel Strings', '', '', 'Strings connected to same MPPT input')}
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'grid_voltage_check': return `
        <div class="info-box">PUCSL / IEC 62116: Inverter must disconnect at ±10% of 230V (207–253V). Record measured grid voltage.</div>
        ${_inp('c-vgrid', 'Measured Grid Voltage (V)', '', '', 'L-N at point of connection')}
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'system_size_check': return `
        <div class="info-box">PUCSL: Residential system ≤ sanctioned load in kVA. Commercial requires separate approval for systems &gt; 100 kWp.</div>
        <div class="form-row cols-2">
          ${_inp('c-syssize',  'Proposed System Size (kWp)', '', '', 'DC nameplate capacity')}
          ${_inp('c-sanctioned','Sanctioned Load (kVA)',     '', '', 'From CEB/LECO connection')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'inverter_sizing': return `
        <div class="info-box">Sri Lanka / PUCSL rule: Inverter AC rating ≥ 0.85 × Array DC (kWp). Ratio 0.8–1.0 is typical. Below 0.8 causes clipping losses; above 1.0 wastes inverter capacity.</div>
        <div class="form-row cols-2">
          ${_inp('c-pdc',  'Array DC Capacity (kWp)', '', '', 'Total nameplate Wp ÷ 1000')}
          ${_inp('c-pac',  'Inverter AC Rating (kW)',  '', '', 'From inverter spec sheet')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'cable_vdrop': return `
        <div class="info-box">IEC 60364-7-712 / SLS 1522: VD = (2 × L × I × ρ) ÷ A. Limit: &lt;1% for DC string cables, &lt;3% for AC side. Use ρ = 0.0172 Ω·mm²/m for copper.</div>
        <div class="form-row cols-2">
          ${_inp('c-vdl',   'Cable Length one-way (m)', '', '', 'One-way run length — formula uses 2×L for return')}
          ${_inp('c-vdi',   'Current (A)', '', '', 'String Isc for DC; inverter output current for AC')}
          ${_inp('c-vda',   'Cable CSA (mm²)', '4', '4', 'Cross-sectional area: 4, 6, 10, 16 mm² etc.')}
          ${_inp('c-vdvn',  'Nominal Voltage (V)', '', '', 'String Vmp for DC; 230 for single-phase AC')}
        </div>
        <div class="form-group">
          <label class="form-label">Cable Type / Side</label>
          <select class="form-select" id="c-vdside">
            <option value="dc">DC String Cable (limit: &lt;1%)</option>
            <option value="ac">AC Side Cable (limit: &lt;3%)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'dc_fuse_sizing': return `
        <div class="info-box">IEC 62548 / SLS 1522: DC string fuse = 1.25 × 1.25 × Isc (double 1.25 factor — one for continuous current, one for fault tolerance). Must also be ≤ module Series Fuse Rating.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        ${_inp('c-fuse-r', 'Module Series Fuse Rating (A)', '', '', 'From module datasheet label — max reverse current')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'linear_degradation': return `
        <div class="info-box">IEC 61215 / SLS 1553 Linear Model: P(n) = P₀ × (1 − LID) − P₀ × d × (n − 1)<br>Used for warranty calculations. LID = Year 1 loss; d = annual degradation rate.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',   'Nameplate Power P₀ (W)',         '', '',    'Module or string STC power')}
          ${_inp('c-lid',  'LID — Year 1 loss (%)',          '2', '2',  'Typical: 1.0–2.5% for c-Si; ~0.5% for N-type')}
          ${_inp('c-drate','Annual Degradation d (%/year)',  '0.5','0.5','Mono: 0.3–0.5%, Poly: 0.5–0.8%, Thin-film: 0.6–1.0%')}
          ${_inp('c-nyear','Year n to calculate',            '25', '25', 'e.g. 10, 20, 25')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'compound_degradation': return `
        <div class="info-box">Compound Degradation Model: P(n) = P₀ × (1 − LID) × (1 − d)^(n−1)<br>More realistic than linear — loss compounds each year relative to prior year's output.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',   'Nameplate Power P₀ (W)',         '', '',    'Module or string STC power')}
          ${_inp('c-lid',  'LID — Year 1 loss (%)',          '2', '2',  'Typical: 1.0–2.5% for c-Si')}
          ${_inp('c-drate','Annual Degradation d (%/year)',  '0.5','0.5','Mono: 0.3–0.5%, Poly: 0.5–0.8%')}
          ${_inp('c-nyear','Year n to calculate',            '25', '25', '')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'warranty_check': return `
        <div class="info-box">SLS 1553 / Sri Lanka requirement: ≥80% of initial power at Year 25. Check if a measured or calculated output still meets the manufacturer's warranty claim.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',      'Original Rated Power P₀ (W)',    '', '', 'Nameplate at commissioning')}
          ${_inp('c-pmeas',   'Current Measured Power (W)',      '', '', 'STC-corrected field measurement')}
          ${_inp('c-nyear',   'Age of System (years)',           '', '', 'Years since commissioning')}
          ${_inp('c-wguarant','Warranty Guarantee at Year 25 (%)', '80', '80', 'Typically 80% per SLS 1553')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'cell_temp_noct': return `
        <div class="info-box">IEC 61853 / IEC 61215: T_cell = T_amb + (NOCT − 20) ÷ 800 × G. Used to calculate realistic operating temperature.</div>
        <div class="form-group">
          <label class="form-label">Select Module (for NOCT)</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-tamb', 'Ambient Temp (°C)', '35', '35', '')}
          ${_inp('c-girr', 'Irradiance (W/m²)', '1000', '1000', 'Use 800 for NOCT test conditions')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      default: return `<div class="text-muted">Calculator not implemented for: ${calcId}</div>`;
    }
  }

  // -----------------------------------------------------------------------
  // CALCULATION RUNNERS (step-by-step output)
  // -----------------------------------------------------------------------

  function _g(area, id) {
    const el = area.querySelector('#' + id);
    return el ? parseFloat(el.value) : NaN;
  }
  function _gs(area, id) {
    const el = area.querySelector('#' + id);
    return el ? el.value : '';
  }

  function _steps(steps, verdict, verdictCls) {
    return `
      <div style="margin-top:10px">
        <div class="section-title">Step-by-Step Calculation</div>
        <div style="font-family:monospace;font-size:0.82rem;background:var(--bg-3);border-radius:var(--radius);padding:12px;line-height:1.9;overflow-x:auto">
          ${steps.map(s => `<div>${s}</div>`).join('')}
        </div>
        <div class="result-box ${verdictCls}" style="margin-top:10px">
          <div class="result-value" style="font-size:1.3rem">${verdict}</div>
        </div>
      </div>`;
  }

  function _runCalc(area, calcId) {
    const result = area.querySelector('#calc-result');

    try {
      switch (calcId) {

        case 'ir_test': {
          const pos = _g(area, 'c-ir-pos');
          const neg = _g(area, 'c-ir-neg');
          const MIN = 1.0;
          const posOk = isNaN(pos) || pos >= MIN;
          const negOk = isNaN(neg) || neg >= MIN;
          const allOk = posOk && negOk;
          result.innerHTML = _steps([
            `Minimum IR per IEC 62446-1 = ${MIN} MΩ`,
            `DC+ to Earth: ${isNaN(pos)?'not entered':pos+' MΩ'} → ${isNaN(pos)?'N/A':pos>=MIN?'✓ PASS':'✗ FAIL'}`,
            `DC− to Earth: ${isNaN(neg)?'not entered':neg+' MΩ'} → ${isNaN(neg)?'N/A':neg>=MIN?'✓ PASS':'✗ FAIL'}`,
            allOk ? `Both ≥ 1 MΩ → System passes IEC 62446-1 insulation test` : `One or more < 1 MΩ → DO NOT ENERGISE. Find and rectify earth fault.`
          ], allOk ? '✓ PASS — Insulation OK' : '✗ FAIL — Earth Fault Suspected', allOk ? 'alert-safe' : 'alert-unsafe');
          break;
        }

        case 'voc_check': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const T = _g(area, 'c-tmod');
          const Vm = _g(area, 'c-voc-m');
          if (!panelId || isNaN(n) || isNaN(Vm)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_stc_str = p.Voc * n;
          const T_used = isNaN(T) ? 25 : T;
          const Voc_exp = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, T_used) * n;
          const dev = (Vm - Voc_exp) / Voc_exp * 100;
          const pass = Math.abs(dev) <= 2.0;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: String Voc at STC = n × Voc_stc = ${n} × ${p.Voc} = ${Voc_stc_str.toFixed(2)} V`,
            `Step 2: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C`,
            `Step 3: ΔT = T_module − 25 = ${T_used} − 25 = ${(T_used-25).toFixed(1)} °C`,
            `Step 4: Correction factor = 1 + αVoc × ΔT = 1 + ${p.coeffVoc.toFixed(4)} × ${(T_used-25).toFixed(1)} = ${(1+p.coeffVoc*(T_used-25)).toFixed(4)}`,
            `Step 5: Voc_expected = ${Voc_stc_str.toFixed(2)} × ${(1+p.coeffVoc*(T_used-25)).toFixed(4)} = ${Voc_exp.toFixed(2)} V`,
            `Step 6: Measured Voc = ${Vm} V`,
            `Step 7: Deviation = (${Vm} − ${Voc_exp.toFixed(2)}) ÷ ${Voc_exp.toFixed(2)} × 100 = ${dev>=0?'+':''}${dev.toFixed(2)} %`,
            `IEC 62446-1 limit: ±2.0%`,
            pass ? `${Math.abs(dev).toFixed(2)}% ≤ 2.0% → ✓ PASS` : `${Math.abs(dev).toFixed(2)}% > 2.0% → ✗ FAIL — check connections, module count, shading`
          ], `${dev>=0?'+':''}${dev.toFixed(2)}% — ${pass?'✓ PASS':'✗ FAIL'}`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'isc_check': {
          const panelId = _gs(area, 'c-panel');
          const G = _g(area, 'c-irr');
          const T = _g(area, 'c-tmod');
          const Im = _g(area, 'c-isc-m');
          if (!panelId || isNaN(G) || isNaN(Im)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const T_used = isNaN(T) ? 25 : T;
          const Isc_exp = PVCalc.iscCorrected(p.Isc, p.coeffIsc, T_used, G);
          const dev = (Im - Isc_exp) / Isc_exp * 100;
          const pass = Math.abs(dev) <= 5.0;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: Isc_stc = ${p.Isc} A, αIsc = +${(p.coeffIsc*100).toFixed(3)} %/°C`,
            `Step 2: Temp correction: Isc_temp = ${p.Isc} × (1 + ${p.coeffIsc.toFixed(5)} × (${T_used}−25)) = ${PVCalc.iscAtTemp(p.Isc,p.coeffIsc,T_used).toFixed(3)} A`,
            `Step 3: Irradiance correction: Isc_corr = Isc_temp × (G ÷ 1000) = ${PVCalc.iscAtTemp(p.Isc,p.coeffIsc,T_used).toFixed(3)} × (${G} ÷ 1000) = ${Isc_exp.toFixed(3)} A`,
            `Step 4: Measured Isc = ${Im} A`,
            `Step 5: Deviation = (${Im} − ${Isc_exp.toFixed(3)}) ÷ ${Isc_exp.toFixed(3)} × 100 = ${dev>=0?'+':''}${dev.toFixed(2)} %`,
            `IEC 62446-1 limit: ±5.0%`,
            pass ? `${Math.abs(dev).toFixed(2)}% ≤ 5.0% → ✓ PASS` : `${Math.abs(dev).toFixed(2)}% > 5.0% → ✗ FAIL — check shading, soiling, bypass diodes`
          ], `${dev>=0?'+':''}${dev.toFixed(2)}% — ${pass?'✓ PASS':'✗ FAIL'}`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'insulation_test_voltage': {
          const Vs = _g(area, 'c-vsys');
          if (isNaN(Vs)) { result.innerHTML = '<div class="danger-box">Enter system voltage</div>'; break; }
          const Vtest = 1000 + 2 * Vs;
          result.innerHTML = _steps([
            `IEC 61730 Cl.10.19 formula: V_test = 1000 V + 2 × V_sys_max`,
            `Step 1: V_sys_max = ${Vs} V`,
            `Step 2: V_test = 1000 + 2 × ${Vs} = 1000 + ${2*Vs} = ${Vtest} V`,
            `This test voltage is applied for 1 minute between all conductors shorted together and the module frame.`,
            `Module must not break down — leakage current must stay below manufacturer's rated limit.`
          ], `Required Test Voltage: ${Vtest} V DC (1 minute)`, 'alert-warn');
          break;
        }

        case 'power_degradation': {
          const Pi = _g(area, 'c-p-initial');
          const Pc = _g(area, 'c-p-current');
          if (isNaN(Pi) || isNaN(Pc)) { result.innerHTML = '<div class="danger-box">Enter both power values</div>'; break; }
          const deg = (Pi - Pc) / Pi * 100;
          const pass61215 = deg <= 5.0;
          result.innerHTML = _steps([
            `Step 1: Initial Pmax = ${Pi} W`,
            `Step 2: Current Pmax = ${Pc} W`,
            `Step 3: Degradation = (Initial − Current) ÷ Initial × 100`,
            `Step 4: Degradation = (${Pi} − ${Pc}) ÷ ${Pi} × 100 = ${deg.toFixed(2)} %`,
            `IEC 61215 limit: ≤5% (Sequence A), ≤8% (Sequence B)`,
            `Field annual degradation guidance: ≤0.5–0.7%/year for mono-Si`,
            deg <= 0 ? `Negative degradation — check measurement accuracy` : deg <= 5 ? `${deg.toFixed(2)}% ≤ 5% → Within IEC 61215 limit` : `${deg.toFixed(2)}% > 5% → Exceeds IEC 61215 Sequence A limit`
          ], `Degradation: ${deg.toFixed(2)}%`, deg<=5?'alert-safe':'alert-unsafe');
          break;
        }

        case 'reverse_current': {
          const panelId = _gs(area, 'c-panel');
          const fuse = _g(area, 'c-fuse');
          const nStr = _g(area, 'c-nstr');
          if (isNaN(fuse) || isNaN(nStr)) { result.innerHTML = '<div class="danger-box">Enter fuse rating and string count</div>'; break; }
          const p = panelId ? DB.getById(panelId) : null;
          const Isc = p ? p.Isc : NaN;
          const Irev_max = fuse * 1.35;
          const Irev_actual = isNaN(Isc) ? 'N/A' : ((nStr - 1) * Isc).toFixed(2);
          const pass = isNaN(Isc) ? null : (nStr - 1) * Isc <= Irev_max;
          result.innerHTML = _steps([
            p ? `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A` : 'No module selected',
            `Step 1: Series Fuse Rating = ${fuse} A`,
            `Step 2: Max reverse current (IEC 61730) = 1.35 × fuse = 1.35 × ${fuse} = ${Irev_max.toFixed(2)} A`,
            `Step 3: ${nStr} strings in parallel → reverse current through one string if it open-circuits:`,
            `         I_reverse = (${nStr} − 1) × Isc = (${nStr} − 1) × ${isNaN(Isc)?'?':Isc} = ${Irev_actual} A`,
            isNaN(Isc) ? 'Select module to complete check' : pass ? `${Irev_actual} A ≤ ${Irev_max.toFixed(2)} A → ✓ Module can withstand reverse current` : `${Irev_actual} A > ${Irev_max.toFixed(2)} A → ✗ String fuse REQUIRED to protect module`
          ], pass===null?'Select module to complete':pass?`✓ Safe — ${Irev_actual} A < ${Irev_max.toFixed(2)} A`:`✗ Fuse Required — ${Irev_actual} A exceeds limit`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'bypass_diode_check': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Vm = _g(area, 'c-voc-m');
          if (!panelId || isNaN(n) || isNaN(Vm)) { result.innerHTML = '<div class="danger-box">Select panel and enter values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_exp = p.Voc * n;
          const ratio = Vm / Voc_exp;
          const diode_drop = p.Voc / 3;
          let finding = 'No bypass diode failure pattern detected.';
          let cls = 'alert-safe';
          for (let k = 1; k <= Math.min(n * 3, 9); k++) {
            const exp_k = Voc_exp - k * diode_drop;
            if (Math.abs(Vm - exp_k) / Voc_exp < 0.05) {
              finding = `Voc matches pattern for ${k} failed bypass diode(s). Expected with ${k} diode(s) shorted: ${exp_k.toFixed(1)} V. Measured: ${Vm} V.`;
              cls = 'alert-unsafe';
              break;
            }
          }
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, Voc = ${p.Voc} V, ${n} modules/string`,
            `Step 1: Expected string Voc (STC) = ${n} × ${p.Voc} = ${Voc_exp.toFixed(1)} V`,
            `Step 2: Measured Voc = ${Vm} V (${(ratio*100).toFixed(1)}% of expected)`,
            `Step 3: Each bypass diode protects ~1/3 of module cells`,
            `         Diode dropout voltage ≈ Voc/3 = ${p.Voc}/3 = ${diode_drop.toFixed(2)} V per diode`,
            `Step 4: Check if measured Voc matches (n_modules × Voc) − k × (Voc/3) for k = 1,2,3...`,
            finding
          ], finding, cls);
          break;
        }

        case 'cable_sizing': {
          const panelId = _gs(area, 'c-panel');
          const nStr = _g(area, 'c-nstr');
          const derate = _g(area, 'c-derate');
          const cabAmp = _g(area, 'c-cabamp');
          const p = panelId ? DB.getById(panelId) : null;
          if (!p || isNaN(nStr) || isNaN(derate)) { result.innerHTML = '<div class="danger-box">Select module and fill fields</div>'; break; }
          const I_design = 1.25 * p.Isc * nStr;
          const I_cable_req = I_design / derate;
          const pass = !isNaN(cabAmp) && cabAmp * derate >= I_design;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A`,
            `Step 1: IEC 60364-7-712: Cable must carry 1.25 × Isc continuously`,
            `Step 2: Design current = 1.25 × Isc × strings = 1.25 × ${p.Isc} × ${nStr} = ${I_design.toFixed(2)} A`,
            `Step 3: Derating factor = ${derate} (temperature + grouping + conduit)`,
            `Step 4: Required cable ampacity = Design current ÷ derating = ${I_design.toFixed(2)} ÷ ${derate} = ${I_cable_req.toFixed(2)} A`,
            isNaN(cabAmp) ? `Enter cable ampacity to check if selected cable is adequate.` : pass ? `Selected cable: ${cabAmp} A × ${derate} derate = ${(cabAmp*derate).toFixed(2)} A ≥ ${I_design.toFixed(2)} A → ✓ Adequate` : `Selected cable: ${cabAmp} A × ${derate} derate = ${(cabAmp*derate).toFixed(2)} A < ${I_design.toFixed(2)} A → ✗ Undersized`
          ], isNaN(cabAmp) ? `Min cable ampacity needed: ${I_cable_req.toFixed(1)} A` : pass ? `✓ Cable adequate (${cabAmp}A rated)` : `✗ Cable undersized — need ≥${I_cable_req.toFixed(1)} A`, isNaN(cabAmp)?'alert-warn':pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'string_fuse': {
          const panelId = _gs(area, 'c-panel');
          const fuseR = _g(area, 'c-fuse-r');
          const p = panelId ? DB.getById(panelId) : null;
          if (!p && isNaN(fuseR)) { result.innerHTML = '<div class="danger-box">Select module or enter fuse rating</div>'; break; }
          const Isc = p ? p.Isc : NaN;
          const FR = isNaN(fuseR) ? null : fuseR;
          const min_fuse = isNaN(Isc) ? '?' : (1.5 * Isc).toFixed(1);
          const max_fuse = FR || '?';
          result.innerHTML = _steps([
            p ? `Module: ${p.manufacturer} ${p.model}, Isc = ${Isc} A` : 'No module selected',
            `Step 1: Min fuse rating (to avoid nuisance blowing) = 1.5 × Isc = 1.5 × ${isNaN(Isc)?'?':Isc} = ${min_fuse} A`,
            `Step 2: Max fuse rating (IEC 62548) = Series Fuse Rating on label = ${max_fuse} A`,
            `Step 3: Select a standard fuse rating between ${min_fuse} A and ${max_fuse} A`,
            `Standard fuse ratings: 10A, 12A, 15A, 16A, 20A, 25A`,
            `Common choice: 15A for modules with Isc ~10A, 20A for Isc ~13–15A`
          ], `Fuse range: ${min_fuse} A – ${max_fuse} A`, 'alert-warn');
          break;
        }

        case 'earth_resistance': {
          const Re = _g(area, 'c-re');
          if (isNaN(Re)) { result.innerHTML = '<div class="danger-box">Enter measured resistance</div>'; break; }
          const pass = Re < 1.0;
          result.innerHTML = _steps([
            `IEC 60364-5-54 / PUCSL requirement: Earth resistance < 1 Ω`,
            `Measured earth resistance = ${Re} Ω`,
            pass ? `${Re} Ω < 1 Ω → ✓ PASS — Earth electrode adequate` : `${Re} Ω ≥ 1 Ω → ✗ FAIL — Improve earth electrode (additional rods, deeper rod, bentonite treatment)`
          ], pass ? `✓ PASS — ${Re} Ω` : `✗ FAIL — ${Re} Ω (must be < 1 Ω)`, pass ? 'alert-safe' : 'alert-unsafe');
          break;
        }

        case 'spd_uc_rating': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          if (!panelId || isNaN(n) || isNaN(Tmin)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_tmin = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, Tmin) * n;
          const UC_min = 1.2 * Voc_tmin;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: Voc at Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25))`,
            `         = ${n} × ${p.Voc} × (1 + ${p.coeffVoc.toFixed(4)} × (${Tmin} − 25))`,
            `         = ${n} × ${p.Voc} × ${(1+p.coeffVoc*(Tmin-25)).toFixed(4)}`,
            `         = ${Voc_tmin.toFixed(1)} V`,
            `Step 2: UC_min (IEC 61643-32) = 1.2 × Voc_max = 1.2 × ${Voc_tmin.toFixed(1)} = ${UC_min.toFixed(1)} V`,
            `Step 3: Select SPD with UC ≥ ${UC_min.toFixed(0)} V (round up to next standard value)`,
            `Standard UC values: 600V, 800V, 1000V, 1200V, 1500V`
          ], `SPD UC ≥ ${UC_min.toFixed(0)} V`, 'alert-warn');
          break;
        }

        case 'spd_summary': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          const Vsys = _g(area, 'c-vsys');
          const exposure = _gs(area, 'c-exposure');
          if (!panelId || isNaN(n) || isNaN(Tmin)) { result.innerHTML = '<div class="danger-box">Select panel and enter values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_tmin = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, Tmin) * n;
          const UC_min = Math.ceil(1.2 * Voc_tmin / 100) * 100;
          const In_min = exposure === 'exposed' ? 20 : 10;
          const type = exposure === 'exposed' ? 'Type 1+2' : 'Type 2';
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, ${n} modules/string`,
            `String Voc at Tmin (${Tmin}°C) = ${Voc_tmin.toFixed(1)} V`,
            `Required UC = 1.2 × ${Voc_tmin.toFixed(1)} = ${(1.2*Voc_tmin).toFixed(1)} V → use UC = ${UC_min} V`,
            `System voltage = ${isNaN(Vsys)?'not entered':Vsys+' V'} → SPD voltage class must cover system voltage`,
            `Site exposure: ${exposure} → ${type} SPD, In ≥ ${In_min} kA`,
            `Required: SPD ${type}, UC ≥ ${UC_min} V, In ≥ ${In_min} kA`,
            `Install at: array combiner box AND inverter DC input`,
            `Both DC+ and DC− to earth — 2 SPD units per location (or combined unit)`,
            `SLS 1522:2016 compliance required for Sri Lanka grid-tied systems`
          ], `SPD: ${type}, UC ≥ ${UC_min} V, In ≥ ${In_min} kA`, 'alert-warn');
          break;
        }

        case 'pr_calc': {
          const E = _g(area, 'c-eac');
          const H = _g(area, 'c-hpoa');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(H) || isNaN(P) || H===0 || P===0) { result.innerHTML = '<div class="danger-box">Enter all three values</div>'; break; }
          const pr = E / (H * P);
          const pct = (pr * 100).toFixed(1);
          const cls = pr >= 0.80 ? 'alert-safe' : pr >= 0.70 ? 'alert-warn' : 'alert-unsafe';
          result.innerHTML = _steps([
            `IEC 61724-1 Formula: PR = E_AC ÷ (H_poa × P_stc ÷ G_stc)`,
            `Where G_stc = 1.0 kW/m² (standard reference irradiance)`,
            `Step 1: E_AC = ${E} kWh`,
            `Step 2: H_poa = ${H} kWh/m²`,
            `Step 3: P_stc = ${P} kWp`,
            `Step 4: Theoretical yield = H_poa × P_stc = ${H} × ${P} = ${(H*P).toFixed(1)} kWh`,
            `Step 5: PR = ${E} ÷ ${(H*P).toFixed(1)} = ${pr.toFixed(4)}`,
            `Step 6: PR = ${pct}%`,
            `Benchmark: ≥80% = Good, 70–80% = Acceptable, <70% = Poor`
          ], `PR = ${pct}% — ${pr>=0.80?'Good':pr>=0.70?'Acceptable':'Poor — Investigate'}`, cls);
          break;
        }

        case 'specific_yield': {
          const E = _g(area, 'c-eac-yr');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(P) || P===0) { result.innerHTML = '<div class="danger-box">Enter energy and capacity</div>'; break; }
          const sy = E / P;
          const cls = sy >= 1300 ? 'alert-safe' : sy >= 1000 ? 'alert-warn' : 'alert-unsafe';
          result.innerHTML = _steps([
            `Specific Yield = Annual AC Energy ÷ System DC Capacity`,
            `Step 1: Annual AC Energy = ${E} kWh`,
            `Step 2: System Capacity = ${P} kWp`,
            `Step 3: Specific Yield = ${E} ÷ ${P} = ${sy.toFixed(0)} kWh/kWp/year`,
            `Sri Lanka typical range: 1300–1600 kWh/kWp/year (location dependent)`,
            sy >= 1300 ? `${sy.toFixed(0)} kWh/kWp ≥ 1300 → Within expected range for Sri Lanka` :
            sy >= 1000 ? `${sy.toFixed(0)} kWh/kWp — Below typical Sri Lanka range. Check losses.` :
            `${sy.toFixed(0)} kWh/kWp — Very low. Significant losses or underperformance.`
          ], `Specific Yield: ${sy.toFixed(0)} kWh/kWp/year`, cls);
          break;
        }

        case 'capacity_factor': {
          const E = _g(area, 'c-eac-yr');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(P) || P===0) { result.innerHTML = '<div class="danger-box">Enter values</div>'; break; }
          const cf = E / (P * 8760) * 100;
          result.innerHTML = _steps([
            `Capacity Factor = Actual kWh ÷ (kWp × 8760 hours/year)`,
            `Step 1: Annual AC Energy = ${E} kWh`,
            `Step 2: System capacity = ${P} kWp`,
            `Step 3: Max theoretical energy = ${P} kWp × 8760 h = ${(P*8760).toFixed(0)} kWh`,
            `Step 4: CF = ${E} ÷ ${(P*8760).toFixed(0)} × 100 = ${cf.toFixed(1)}%`,
            `Typical PV in Sri Lanka: 15–22% capacity factor`
          ], `Capacity Factor: ${cf.toFixed(1)}%`, cf>=15?'alert-safe':'alert-warn');
          break;
        }

        case 'pid_risk': {
          const Vs = _g(area, 'c-vsys');
          const RH = _g(area, 'c-humid');
          const modType = _gs(area, 'c-modtype');
          const ground = _gs(area, 'c-ground');
          let risk = 0;
          const factors = [];
          if (!isNaN(Vs)) {
            if (Vs > 800) { risk += 2; factors.push(`High system voltage (${Vs}V > 800V) → High PID drive voltage`); }
            else if (Vs > 500) { risk += 1; factors.push(`Medium system voltage (${Vs}V)`); }
          }
          if (!isNaN(RH) && RH > 70) { risk += 2; factors.push(`High humidity (${RH}% > 70%) — typical Sri Lanka coastal`); }
          else if (!isNaN(RH) && RH > 60) { risk += 1; factors.push(`Moderate humidity (${RH}%)`); }
          if (modType === 'p-type') { risk += 1; factors.push(`p-type module — higher PID susceptibility`); }
          else { factors.push(`N-type module — naturally more PID resistant`); }
          if (ground === 'positive') { risk += 2; factors.push(`Positive grounding — INCREASES PID risk for p-type modules`); }
          else if (ground === 'negative') { risk -= 1; factors.push(`Negative grounding — reduces PID risk for p-type`); }
          else { risk += 1; factors.push(`Ungrounded system — moderate PID risk`); }
          const level = risk >= 4 ? 'HIGH' : risk >= 2 ? 'MODERATE' : 'LOW';
          const cls = risk >= 4 ? 'alert-unsafe' : risk >= 2 ? 'alert-warn' : 'alert-safe';
          const mitigation = risk >= 4
            ? 'Immediate action: verify module PID certification (IEC TS 62804), install negative grounding or PID recovery box. Consider N-type modules for replacement.'
            : risk >= 2 ? 'Recommended: annual IV curve check, monitor power loss trend. Consider PID recovery overnight grounding.'
            : 'Low risk. Standard monitoring sufficient.';
          result.innerHTML = _steps([
            `IEC TS 62804-1 PID Risk Assessment:`,
            ...factors,
            `Total risk score: ${risk}`,
            `Mitigation: ${mitigation}`
          ], `PID Risk: ${level}`, cls);
          break;
        }

        case 'string_voc_tmin': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          const Vmax = _g(area, 'c-vinvmax');
          if (!panelId || isNaN(n) || isNaN(Tmin) || isNaN(Vmax)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const factor = 1 + p.coeffVoc * (Tmin - 25);
          const Voc_tmin = p.Voc * factor * n;
          const pass = Voc_tmin <= Vmax;
          result.innerHTML = _steps([
            `IEC 62548 Formula: V_string_Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25))`,
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C = ${p.coeffVoc.toFixed(5)} /°C`,
            `Step 2: ΔT = Tmin − 25 = ${Tmin} − 25 = ${Tmin-25} °C`,
            `Step 3: Correction factor = 1 + ${p.coeffVoc.toFixed(5)} × ${Tmin-25} = ${factor.toFixed(5)}`,
            `Step 4: String Voc at Tmin = ${n} × ${p.Voc} × ${factor.toFixed(4)} = ${Voc_tmin.toFixed(2)} V`,
            `Step 5: Inverter max DC = ${Vmax} V`,
            pass ? `${Voc_tmin.toFixed(2)} V ≤ ${Vmax} V → ✓ SAFE — Will not damage inverter` : `${Voc_tmin.toFixed(2)} V > ${Vmax} V → ✗ EXCEEDS INVERTER LIMIT — Reduce to max ${Math.floor(Vmax/(p.Voc*factor))} modules/string`
          ], pass ? `✓ SAFE — ${Voc_tmin.toFixed(1)} V ≤ ${Vmax} V` : `✗ UNSAFE — ${Voc_tmin.toFixed(1)} V exceeds ${Vmax} V`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'string_vmp_tmax': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tamb = _g(area, 'c-tamb');
          const Vmppt = _g(area, 'c-vmppt');
          if (!panelId || isNaN(n) || isNaN(Tamb) || isNaN(Vmppt)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Tcell = PVCalc.cellTemp(Tamb, p.NOCT, 1000);
          const factor = 1 + p.coeffVoc * (Tcell - 25);
          const Vmp_tmax = p.Vmp * factor * n;
          const pass = Vmp_tmax >= Vmppt;
          result.innerHTML = _steps([
            `IEC 62548 / IEC 61853 Formula: V_string_Vmp_Tmax = n × Vmp_stc × (1 + αVoc × (Tcell_max − 25))`,
            `Module: ${p.manufacturer} ${p.model}, NOCT = ${p.NOCT}°C`,
            `Step 1: Cell temp at max ambient: Tcell = Tamb + (NOCT−20)/800 × G`,
            `         Tcell = ${Tamb} + (${p.NOCT}−20)/800 × 1000 = ${Tcell.toFixed(1)} °C`,
            `Step 2: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C`,
            `Step 3: Correction = 1 + ${p.coeffVoc.toFixed(5)} × (${Tcell.toFixed(1)}−25) = ${factor.toFixed(4)}`,
            `Step 4: String Vmp at Tcell_max = ${n} × ${p.Vmp} × ${factor.toFixed(4)} = ${Vmp_tmax.toFixed(2)} V`,
            `Step 5: MPPT minimum = ${Vmppt} V`,
            pass ? `${Vmp_tmax.toFixed(2)} V ≥ ${Vmppt} V → ✓ String stays within MPPT range` : `${Vmp_tmax.toFixed(2)} V < ${Vmppt} V → ✗ String drops below MPPT minimum — increase to min ${Math.ceil(Vmppt/(p.Vmp*factor))} modules/string`
          ], pass ? `✓ MPPT OK — ${Vmp_tmax.toFixed(1)} V ≥ ${Vmppt} V` : `✗ Below MPPT min — ${Vmp_tmax.toFixed(1)} V < ${Vmppt} V`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'max_strings_no_fuse': {
          const n = _g(area, 'c-nstr');
          if (isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter number of strings</div>'; break; }
          const fuse_req = n > 3;
          result.innerHTML = _steps([
            `IEC 62548 Cl.9.4.1: String fuses not required if parallel strings ≤ 3`,
            `(Condition: each module's max reverse current ≤ module Series Fuse Rating)`,
            `Number of parallel strings = ${n}`,
            fuse_req ? `${n} > 3 → String fuses ARE required` : `${n} ≤ 3 → String fuses not required (verify module reverse current rating still satisfied)`,
            `Note: Even if fuses are not required, string monitoring is recommended for fault detection.`
          ], fuse_req ? `✗ Fuses Required (${n} > 3 strings)` : `✓ Fuses Not Required (${n} ≤ 3 strings)`, fuse_req?'alert-warn':'alert-safe');
          break;
        }

        case 'grid_voltage_check': {
          const V = _g(area, 'c-vgrid');
          if (isNaN(V)) { result.innerHTML = '<div class="danger-box">Enter measured voltage</div>'; break; }
          const nominal = 230;
          const lo = 207, hi = 253;
          const pass = V >= lo && V <= hi;
          const dev = ((V - nominal) / nominal * 100).toFixed(1);
          result.innerHTML = _steps([
            `PUCSL / IEC 62116: Inverter must disconnect outside 230V ±10%`,
            `Acceptable range: ${lo} V to ${hi} V`,
            `Step 1: Measured voltage = ${V} V`,
            `Step 2: Deviation from nominal = (${V} − ${nominal}) ÷ ${nominal} × 100 = ${dev}%`,
            pass ? `${V} V is within ${lo}–${hi} V range → ✓ Normal` : `${V} V is outside ${lo}–${hi} V range → Inverter should trip. Notify CEB/LECO.`
          ], pass ? `✓ Normal — ${V} V (${dev>=0?'+':''}${dev}%)` : `✗ Out of Range — ${V} V`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'system_size_check': {
          const sys = _g(area, 'c-syssize');
          const sanc = _g(area, 'c-sanctioned');
          if (isNaN(sys) || isNaN(sanc)) { result.innerHTML = '<div class="danger-box">Enter both values</div>'; break; }
          const pass = sys <= sanc;
          result.innerHTML = _steps([
            `PUCSL Guidelines: Residential system ≤ sanctioned load`,
            `Step 1: Proposed system = ${sys} kWp`,
            `Step 2: Sanctioned load = ${sanc} kVA`,
            `Step 3: ${sys} kWp vs ${sanc} kVA`,
            pass ? `${sys} ≤ ${sanc} → ✓ Within PUCSL residential limit` : `${sys} > ${sanc} → Exceeds sanctioned load. Requires PUCSL special approval or load upgrade.`,
            sys > 100 ? `System > 100 kWp → Commercial/industrial approval process required` : ``
          ], pass ? `✓ Compliant — ${sys} kWp ≤ ${sanc} kVA` : `✗ Exceeds limit — approval required`, pass?'alert-safe':'alert-warn');
          break;
        }

        case 'cell_temp_noct': {
          const panelId = _gs(area, 'c-panel');
          const Tamb = _g(area, 'c-tamb');
          const G = _g(area, 'c-girr');
          if (isNaN(Tamb) || isNaN(G)) { result.innerHTML = '<div class="danger-box">Enter ambient temp and irradiance</div>'; break; }
          const NOCT = panelId ? (DB.getById(panelId)||{NOCT:44}).NOCT : 44;
          const Tcell = PVCalc.cellTemp(Tamb, NOCT, G);
          result.innerHTML = _steps([
            `IEC 61853 / IEC 61215 Formula: T_cell = T_amb + (NOCT − 20) ÷ 800 × G`,
            `Step 1: NOCT = ${NOCT}°C (from module datasheet)`,
            `Step 2: T_amb = ${Tamb}°C`,
            `Step 3: G = ${G} W/m²`,
            `Step 4: (NOCT − 20) ÷ 800 = (${NOCT} − 20) ÷ 800 = ${((NOCT-20)/800).toFixed(4)} °C·m²/W`,
            `Step 5: Temperature rise = ${((NOCT-20)/800).toFixed(4)} × ${G} = ${((NOCT-20)/800*G).toFixed(1)} °C`,
            `Step 6: T_cell = ${Tamb} + ${((NOCT-20)/800*G).toFixed(1)} = ${Tcell.toFixed(1)} °C`,
            `Note: NOCT test conditions = 800 W/m², 20°C ambient, 1 m/s wind`
          ], `T_cell = ${Tcell.toFixed(1)} °C`, Tcell > 70 ? 'alert-unsafe' : Tcell > 55 ? 'alert-warn' : 'alert-safe');
          break;
        }

        case 'linear_degradation': {
          const P0 = _g(area, 'c-p0');
          const LID = _g(area, 'c-lid') / 100;
          const d = _g(area, 'c-drate') / 100;
          const n = _g(area, 'c-nyear');
          if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const P1 = P0 * (1 - LID);
          const Pn = P1 - P0 * d * (n - 1);
          const pct = (Pn / P0) * 100;
          const meetsWarranty = pct >= 80;
          // Build year-by-year table for key years
          const keyYears = [1, 5, 10, 15, 20, 25].filter(y => y <= n + 1);
          if (!keyYears.includes(n)) keyYears.push(n);
          keyYears.sort((a,b)=>a-b);
          const tableRows = keyYears.map(y => {
            const py = y === 1 ? P1 : P1 - P0 * d * (y - 1);
            return `Year ${y}: ${py.toFixed(1)} W (${(py/P0*100).toFixed(1)}%)`;
          });
          result.innerHTML = _steps([
            `IEC 61215 / SLS 1553 Linear Formula: P(n) = P₀ × (1 − LID) − P₀ × d × (n − 1)`,
            `Step 1: P₀ = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/year, n = ${n}`,
            `Step 2: Year 1 output after LID: P₁ = ${P0} × (1 − ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
            `Step 3: Annual loss = P₀ × d = ${P0} × ${(d*100).toFixed(2)}% = ${(P0*d).toFixed(2)} W/year`,
            `Step 4: After ${n} years: P(${n}) = ${P1.toFixed(2)} − ${(P0*d).toFixed(2)} × (${n} − 1)`,
            `         = ${P1.toFixed(2)} − ${(P0*d*(n-1)).toFixed(2)} = ${Pn.toFixed(2)} W`,
            `Step 5: Retention = ${Pn.toFixed(2)} ÷ ${P0} × 100 = ${pct.toFixed(1)}%`,
            `── Year-by-year output ──`,
            ...tableRows,
            `SLS 1553 / 25-year warranty minimum: 80%`,
            meetsWarranty ? `${pct.toFixed(1)}% ≥ 80% at Year ${n} → ✓ Within warranty` : `${pct.toFixed(1)}% < 80% at Year ${n} → ✗ Below warranty threshold`
          ], `Year ${n}: ${Pn.toFixed(1)} W — ${pct.toFixed(1)}% of P₀ — ${meetsWarranty?'✓ OK':'✗ Below 80%'}`, meetsWarranty?'alert-safe':'alert-unsafe');
          break;
        }

        case 'compound_degradation': {
          const P0 = _g(area, 'c-p0');
          const LID = _g(area, 'c-lid') / 100;
          const d = _g(area, 'c-drate') / 100;
          const n = _g(area, 'c-nyear');
          if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const P1 = P0 * (1 - LID);
          const Pn = P1 * Math.pow(1 - d, n - 1);
          const pct = (Pn / P0) * 100;
          const meetsWarranty = pct >= 80;
          const keyYears = [1, 5, 10, 15, 20, 25].filter(y => y <= n + 1);
          if (!keyYears.includes(n)) keyYears.push(n);
          keyYears.sort((a,b)=>a-b);
          const tableRows = keyYears.map(y => {
            const py = P1 * Math.pow(1 - d, y - 1);
            return `Year ${y}: ${py.toFixed(1)} W (${(py/P0*100).toFixed(1)}%)`;
          });
          result.innerHTML = _steps([
            `Compound Formula: P(n) = P₀ × (1 − LID) × (1 − d)^(n−1)`,
            `Step 1: P₀ = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/year, n = ${n}`,
            `Step 2: Year 1 after LID: P₁ = ${P0} × (1 − ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
            `Step 3: Compound factor = (1 − ${(d*100).toFixed(2)}%)^(${n}−1) = ${(1-d).toFixed(5)}^${n-1} = ${Math.pow(1-d,n-1).toFixed(5)}`,
            `Step 4: P(${n}) = ${P1.toFixed(2)} × ${Math.pow(1-d,n-1).toFixed(5)} = ${Pn.toFixed(2)} W`,
            `Step 5: Retention = ${Pn.toFixed(2)} ÷ ${P0} × 100 = ${pct.toFixed(1)}%`,
            `── Year-by-year output ──`,
            ...tableRows,
            `Compound vs Linear difference at Year ${n}: ${Math.abs(Pn - (P1 - P0*d*(n-1))).toFixed(1)} W (compound is slightly ${Pn > (P1-P0*d*(n-1)) ? 'higher' : 'lower'})`,
            meetsWarranty ? `${pct.toFixed(1)}% ≥ 80% at Year ${n} → ✓ Within warranty` : `${pct.toFixed(1)}% < 80% → ✗ Below 80%`
          ], `Year ${n}: ${Pn.toFixed(1)} W — ${pct.toFixed(1)}% of P₀ — ${meetsWarranty?'✓ OK':'✗ Below 80%'}`, meetsWarranty?'alert-safe':'alert-unsafe');
          break;
        }

        case 'warranty_check': {
          const P0 = _g(area, 'c-p0');
          const Pm = _g(area, 'c-pmeas');
          const n = _g(area, 'c-nyear');
          const wg = _g(area, 'c-wguarant');
          if (isNaN(P0) || isNaN(Pm) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter P₀, current power, and age</div>'; break; }
          const actual_pct = (Pm / P0) * 100;
          const guarantee_pct = isNaN(wg) ? 80 : wg;
          // Linear interpolation of warranty limit at year n (assumes 100% → guarantee_pct over 25 years)
          const warranty_at_n = 100 - (100 - guarantee_pct) * (n / 25);
          const meetsNow = actual_pct >= warranty_at_n;
          const meetsEnd = actual_pct >= guarantee_pct;
          const annualDeg = n > 0 ? ((P0 - Pm) / P0 / n * 100) : 0;
          result.innerHTML = _steps([
            `SLS 1553 / Manufacturer warranty check`,
            `Step 1: Original rated power P₀ = ${P0} W`,
            `Step 2: Current measured power (STC-corrected) = ${Pm} W`,
            `Step 3: System age = ${n} years`,
            `Step 4: Actual retention = ${Pm} ÷ ${P0} × 100 = ${actual_pct.toFixed(1)}%`,
            `Step 5: Effective annual degradation rate = (${P0} − ${Pm}) ÷ ${P0} ÷ ${n} years = ${annualDeg.toFixed(3)}%/year`,
            `Step 6: Linear warranty limit at Year ${n} (interpolated to ${guarantee_pct}% at Year 25):`,
            `         = 100% − (100 − ${guarantee_pct}%) × ${n}/25 = ${warranty_at_n.toFixed(1)}%`,
            meetsNow ? `${actual_pct.toFixed(1)}% ≥ ${warranty_at_n.toFixed(1)}% → ✓ Currently within warranty limits` : `${actual_pct.toFixed(1)}% < ${warranty_at_n.toFixed(1)}% → ✗ Below warranty limit at Year ${n}`,
            `Projected at Year 25 (at current rate): ${(100 - annualDeg * 25).toFixed(1)}% — ${(100-annualDeg*25)>=80?'✓ Should meet 80% target':'✗ May not meet 80% target'}`
          ], meetsNow ? `✓ ${actual_pct.toFixed(1)}% — Warranty OK at Year ${n}` : `✗ ${actual_pct.toFixed(1)}% — Below warranty at Year ${n}`, meetsNow?'alert-safe':'alert-unsafe');
          break;
        }

        case 'inverter_sizing': {
          const Pdc = _g(area, 'c-pdc');
          const Pac = _g(area, 'c-pac');
          if (isNaN(Pdc) || isNaN(Pac)) { result.innerHTML = '<div class="danger-box">Enter both values</div>'; break; }
          const ratio = Pac / Pdc;
          const P_ac_min = 0.85 * Pdc;
          const pass = ratio >= 0.80;
          const optimal = ratio >= 0.85 && ratio <= 1.05;
          result.innerHTML = _steps([
            `Sri Lanka / PUCSL guideline: P_inverter_AC ≥ 0.85 × P_array_DC`,
            `Step 1: Array DC capacity = ${Pdc} kWp`,
            `Step 2: Inverter AC rating = ${Pac} kW`,
            `Step 3: Minimum required AC rating = 0.85 × ${Pdc} = ${P_ac_min.toFixed(2)} kW`,
            `Step 4: AC/DC ratio = ${Pac} ÷ ${Pdc} = ${ratio.toFixed(3)} (${(ratio*100).toFixed(1)}%)`,
            ratio < 0.80 ? `Ratio ${(ratio*100).toFixed(1)}% < 80% → ✗ Inverter significantly undersized — excessive clipping losses` :
            ratio <= 0.85 ? `Ratio ${(ratio*100).toFixed(1)}% — Borderline. Marginally undersized, minor clipping. Acceptable if DC/AC ratio intentional.` :
            ratio <= 1.05 ? `Ratio ${(ratio*100).toFixed(1)}% — ✓ Optimal sizing range (85–105%)` :
            `Ratio ${(ratio*100).toFixed(1)}% > 105% — Inverter oversized. Check cost justification.`,
            `Typical accepted range in Sri Lanka: 0.85–1.00 (inverter lightly undersized is common practice)`
          ], pass ? `✓ AC/DC Ratio: ${(ratio*100).toFixed(1)}% — ${optimal?'Optimal':'Acceptable'}` : `✗ Inverter Undersized — ${(ratio*100).toFixed(1)}%`, pass?(optimal?'alert-safe':'alert-warn'):'alert-unsafe');
          break;
        }

        case 'cable_vdrop': {
          const L = _g(area, 'c-vdl');
          const I = _g(area, 'c-vdi');
          const A = _g(area, 'c-vda');
          const Vn = _g(area, 'c-vdvn');
          const side = _gs(area, 'c-vdside');
          if (isNaN(L) || isNaN(I) || isNaN(A) || isNaN(Vn)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const rho = 0.0172; // copper Ω·mm²/m
          const VD = (2 * L * I * rho) / A;
          const VD_pct = (VD / Vn) * 100;
          const limit = side === 'dc' ? 1.0 : 3.0;
          const pass = VD_pct <= limit;
          result.innerHTML = _steps([
            `IEC 60364-7-712 / SLS 1522 Formula: VD = (2 × L × I × ρ) ÷ A`,
            `ρ (copper resistivity) = ${rho} Ω·mm²/m`,
            `Step 1: Cable length one-way L = ${L} m → total circuit length = 2 × ${L} = ${2*L} m`,
            `Step 2: Current I = ${I} A`,
            `Step 3: Cable cross-section A = ${A} mm²`,
            `Step 4: VD = (2 × ${L} × ${I} × ${rho}) ÷ ${A}`,
            `         = ${(2*L*I*rho).toFixed(4)} ÷ ${A}`,
            `         = ${VD.toFixed(3)} V`,
            `Step 5: Nominal voltage = ${Vn} V`,
            `Step 6: VD% = (${VD.toFixed(3)} ÷ ${Vn}) × 100 = ${VD_pct.toFixed(2)}%`,
            `Limit for ${side === 'dc' ? 'DC string' : 'AC side'} cables = ${limit}%`,
            pass ? `${VD_pct.toFixed(2)}% ≤ ${limit}% → ✓ Within limit` : `${VD_pct.toFixed(2)}% > ${limit}% → ✗ Exceeds limit — increase cable CSA`
          ], pass ? `✓ VD = ${VD.toFixed(2)} V (${VD_pct.toFixed(2)}%)` : `✗ VD too high: ${VD.toFixed(2)} V (${VD_pct.toFixed(2)}% > ${limit}%)`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'dc_fuse_sizing': {
          const panelId = _gs(area, 'c-panel');
          const fuseR = _g(area, 'c-fuse-r');
          if (!panelId) { result.innerHTML = '<div class="danger-box">Select module</div>'; break; }
          const p = DB.getById(panelId);
          const I_min = 1.25 * 1.25 * p.Isc;
          const I_max = isNaN(fuseR) ? null : fuseR;
          const stdFuses = [10, 12, 15, 16, 20, 25, 30, 32];
          const candidates = stdFuses.filter(f => f >= I_min && (I_max === null || f <= I_max));
          result.innerHTML = _steps([
            `IEC 62548 / SLS 1522 Formula: I_fuse = 1.25 × 1.25 × Isc`,
            `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A`,
            `Step 1: First 1.25 factor — continuous current derating (IEC 60364-7-712)`,
            `         I_cont = 1.25 × ${p.Isc} = ${(1.25*p.Isc).toFixed(2)} A`,
            `Step 2: Second 1.25 factor — fault tolerance / safety margin (IEC 62548)`,
            `         I_fuse_min = 1.25 × ${(1.25*p.Isc).toFixed(2)} = ${I_min.toFixed(2)} A`,
            `Step 3: Maximum fuse rating = Series Fuse Rating on module label = ${I_max !== null ? I_max + ' A' : 'not entered'}`,
            `Step 4: Select standard fuse ≥ ${I_min.toFixed(1)} A${I_max ? ' and ≤ ' + I_max + ' A' : ''}`,
            candidates.length > 0 ? `Suitable standard fuses: ${candidates.join('A, ')}A` : `No standard fuse fits — check module Series Fuse Rating is entered correctly`,
          ], candidates.length > 0 ? `Fuse: ${candidates[0]}A (minimum suitable)` : `Check Series Fuse Rating`, candidates.length>0?'alert-warn':'alert-unsafe');
          break;
        }

        default:
          result.innerHTML = '<div class="text-muted">Calculator not implemented.</div>';
      }
    } catch (e) {
      result.innerHTML = `<div class="danger-box">Error: ${e.message}</div>`;
    }
  }

  return { render };
})();
