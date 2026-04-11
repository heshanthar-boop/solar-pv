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

  const CATALOG_NONE = '__none__';
  const CATALOG_PATHS = {
    inverter: './data/hybrid-inverters.json',
    battery: './data/hybrid-batteries.json',
  };
  const CATALOG_OVERRIDE_KEY = 'solarpv_hybrid_catalog_overrides_v1';

  const catalogState = {
    loaded: false,
    loading: false,
    loadError: '',
    storeRevision: '',
    inverterMeta: null,
    batteryMeta: null,
    baseInverters: [],
    baseBatteries: [],
    inverters: [],
    batteries: [],
  };

  const UTILITY_PROFILES = {
    offgrid: {
      id: 'offgrid',
      label: 'No Export / Off-Grid',
      exportEnabled: false,
      utility: 'N/A',
      voltageWindow: 'N/A',
      frequencyWindow: 'N/A',
      reconnect_s: 0
    },
    ceb_2025: {
      id: 'ceb_2025',
      label: 'CEB Settings (2025)',
      exportEnabled: true,
      utility: 'CEB',
      voltageWindow: 'Sustained OV <=1.06 pu (<1MW), <=1.05 pu (>=1MW)',
      frequencyWindow: '47-52Hz run, reconnect 49.5-50.5Hz',
      reconnect_s: 600
    },
    leco_2025: {
      id: 'leco_2025',
      label: 'LECO Settings (2025)',
      exportEnabled: true,
      utility: 'LECO',
      voltageWindow: '0.94-1.06 pu (<1MW), 0.95-1.05 pu (>=1MW) reconnect gate',
      frequencyWindow: '47-52Hz run, reconnect 49.5-50.5Hz',
      reconnect_s: 600
    }
  };

  const UTILITY_SUBMISSION_DOCS = [
    {
      key: 'utilityDocSld',
      inputId: 'hy-util-doc-sld',
      label: 'Single-line diagram (SLD) attached',
      note: 'SLD should include meter point, protection devices, and isolation locations.'
    },
    {
      key: 'utilityDocProtectionSettings',
      inputId: 'hy-util-doc-settings',
      label: 'Protection settings sheet attached',
      note: 'Submitted inverter protection settings must be documented and signed.'
    },
    {
      key: 'utilityDocEquipmentApprovals',
      inputId: 'hy-util-doc-approvals',
      label: 'Equipment approvals/datasheets attached',
      note: 'Include inverter model approvals and key datasheets used in submission.'
    },
    {
      key: 'utilityDocCommissioningReport',
      inputId: 'hy-util-doc-commissioning',
      label: 'Commissioning/test report attached',
      note: 'Attach measured commissioning evidence before final export request.'
    },
    {
      key: 'utilityDocInterconnectionForm',
      inputId: 'hy-util-doc-application',
      label: 'Utility interconnection application complete',
      note: 'Submission should include all required utility forms and declarations.'
    },
  ];

  const UTILITY_SUBMISSION_GATES = [
    {
      key: 'utilityMeterReady',
      inputId: 'hy-util-gate-meter',
      label: 'Utility-compliant bi-directional metering arrangement confirmed',
      note: 'Net-metering/net-accounting metering arrangement must be in place.',
      blocker: 'Utility-compliant bidirectional metering arrangement is not confirmed.'
    },
    {
      key: 'utilityIsolationAccessible',
      inputId: 'hy-util-gate-isolation',
      label: 'Accessible AC/DC isolation points confirmed',
      note: 'Isolation points must be accessible for utility inspection and operation.',
      blocker: 'Accessible isolation points are not confirmed.'
    },
    {
      key: 'utilitySettingsMatched',
      inputId: 'hy-util-gate-settings-match',
      label: 'Commissioned settings match submitted settings',
      note: 'Commissioned inverter settings should match submitted profile values exactly.',
      blocker: 'Commissioned inverter settings are not confirmed as matching submitted settings.'
    },
    {
      key: 'utilityFinalAcceptance',
      inputId: 'hy-util-gate-acceptance',
      label: 'Utility final inspection/acceptance recorded',
      note: 'Grid export should be enabled only after formal utility acceptance.',
      blocker: 'Utility final acceptance is not recorded.'
    },
  ];

  const UTILITY_SUBMISSION_ITEMS = [...UTILITY_SUBMISSION_DOCS, ...UTILITY_SUBMISSION_GATES];
  const UTILITY_SUBMISSION_KEYS = UTILITY_SUBMISSION_ITEMS.map(item => item.key);

  const STANDARDS = [
    {
      id: 'iec62446',
      code: 'IEC 62446-1:2016 + AMD1:2018',
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
      code: 'IEC 60364-7-712:2025',
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
      code: 'IEC 61427-1/-2 / IEC 62619:2022',
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
        { p: 'Sustained OV (<1MW)', v: '10-min avg <= 1.06 pu; trip <= 3 s if exceeded', n: 'CEB recommended inverter settings (2025-02-25).' },
        { p: 'Sustained OV (>=1MW)', v: '10-min avg <= 1.05 pu; trip <= 3 s if exceeded', n: 'CEB recommended inverter settings (2025-02-25).' },
        { p: 'Emergency voltage trip (<1MW)', v: 'OV2 1.20/0.16s; OV1 1.15/2s; UV1 0.70/10s; UV2 0.45/0.32s', n: 'Protection setpoint check at commissioning.' },
        { p: 'Emergency voltage trip (>=1MW)', v: 'OV2 1.20/0.16s; OV1 1.15/5s; UV1 0.70/21s; UV2 0.45/5s', n: 'Protection setpoint check at commissioning.' },
        { p: 'Reconnect gate (<1MW)', v: '0.94 < V < 1.06, 49.5 < f < 50.5, delay >= 600 s', n: 'Service enable criteria from utility profile.' },
        { p: 'Reconnect gate (>=1MW)', v: '0.95 < V < 1.05, 49.5 < f < 50.5, delay >= 600 s', n: 'Service enable criteria from utility profile.' },
        { p: 'Enter-service ramp', v: 'Linear ramp over 900 s (nameplate/900s)', n: 'Limits step change at reconnection.' },
        { p: 'Retail service class (LECO SSC)', v: '1ph 15A/30A; 3ph 30A/60A', n: 'Use as early feasibility class before formal utility study.' },
        { p: 'Retail meter accuracy (LECO SSC)', v: 'Within +/-2.5%', n: 'Meter test acceptance threshold.' }
      ],
      calcs: [
        { n: 'Readiness check', f: 'Ready if SLD + settings + reports + approvals complete', w: 'Submission quality gate.' },
        { n: 'Setting match', f: 'Commissioned inverter settings must equal submitted utility settings', w: 'Avoid rework at inspection.' },
        { n: 'Export gate', f: 'Export ON only after utility acceptance', w: 'Compliance control.' }
      ],
      sources: [
        {
          t: 'CEB Standards / Specifications Portal',
          u: 'https://www.ceb.lk/standard-spec/en',
          n: 'Primary CEB portal for published standards/specification documents and utility references.'
        },
        {
          t: 'LECO Official Portal',
          u: 'https://www.leco.lk/index_e.php',
          n: 'LECO utility portal and service pages used for project-level interconnection coordination.'
        },
        {
          t: 'PUCSL Guidelines on Rooftop Solar PV Installation for Utility Providers (Revision 1, Sep 2022)',
          u: 'https://www.pucsl.gov.lk/wp-content/uploads/2022/10/Guidelines-on-Rooftop-Solar-PV-installation-for-Utility-Providers_Revision-01.pdf',
          n: 'Application package, process timeline, commissioning witness, agreement, and authorization flow.'
        },
        {
          t: 'PUCSL Guidelines on Rooftop Solar PV Installation for Service Providers (2024)',
          u: 'https://www.pucsl.gov.lk/wp-content/uploads/2024/09/Guidelines-on-Rooftop-Solar-PV-installation-for-Service-Providers.pdf',
          n: 'Latest publicly posted PUCSL service-provider guidance update.'
        },
        {
          t: 'CEB Net Metering/Net Accounting/Net Plus Addendum',
          u: 'https://ceb.lk/front_img/1608095391ADDENDEM.pdf',
          n: 'Written permission before parallel operation, meter clauses, and setting-change restrictions.'
        },
        {
          t: 'CEB Recommended Settings for Solar PV Inverters (2025-02-25)',
          u: 'https://www.ceb.lk/front_img/img_reports/1742277909Solar_Inverter_settings.pdf',
          n: 'Numeric voltage/frequency trip windows, reconnect delay (600 s), and service-ramp settings.'
        },
        {
          t: 'CEB Grid Connection Code (Published July 2024)',
          u: 'https://www.ceb.lk/front_img/img_reports/1723552921Grid_Connection_Code_for_publishing_in_CEB_web.pdf',
          n: 'LVRT/frequency capability context for DER and power park operation.'
        },
        {
          t: 'LECO Supply Services Code (March 2015, Rev 00)',
          u: 'https://www.pucsl.gov.lk/wp-content/uploads/2020/11/Supply-Services-Code-LECO-E.pdf',
          n: 'Service categories, connection process and metering/service limits used in practical utility readiness checks.'
        }
      ],
      k: ['ceb', 'leco', 'approval', 'submission', 'export']
    }
  ];
  function _esc(value) {
    if (typeof App !== 'undefined' && typeof App.escapeHTML === 'function') return App.escapeHTML(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (fallback ?? 0);
  }

  function _bool(v, fallback) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no') return false;
    }
    return !!fallback;
  }

  function _cleanText(v, maxLen) {
    const s = String(v ?? '').trim();
    return maxLen ? s.slice(0, maxLen) : s;
  }

  function _cleanId(v) {
    return _cleanText(v, 120)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function _catalogInverters() {
    return Array.isArray(catalogState.inverters) ? catalogState.inverters : [];
  }

  function _catalogBatteries() {
    return Array.isArray(catalogState.batteries) ? catalogState.batteries : [];
  }

  function _normalizeInverter(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = _cleanId(raw.id);
    const manufacturer = _cleanText(raw.manufacturer, 80);
    const model = _cleanText(raw.model, 120);
    if (!id || !manufacturer || !model) return null;
    const supportedProfilesRaw = Array.isArray(raw.supportedProfiles) ? raw.supportedProfiles : [];
    const supportedProfiles = Array.from(new Set(supportedProfilesRaw
      .map(x => String(x || '').trim())
      .filter(Boolean)
      .filter(x => UTILITY_PROFILES[x] || x === 'offgrid')));
    if (!supportedProfiles.length) supportedProfiles.push('offgrid');

    const utilityListedRaw = raw.utilityListed && typeof raw.utilityListed === 'object' ? raw.utilityListed : {};
    const utilityListed = {};
    Object.keys(UTILITY_PROFILES).forEach(profileId => {
      if (profileId === 'offgrid') return;
      utilityListed[profileId] = utilityListedRaw[profileId] === true;
    });

    const listingSourceRaw = raw.listingSource && typeof raw.listingSource === 'object' ? raw.listingSource : {};
    const listingSource = {};
    Object.keys(utilityListed).forEach(profileId => {
      listingSource[profileId] = _cleanText(listingSourceRaw[profileId] || '', 240);
    });

    return {
      id,
      manufacturer,
      model,
      acRated_kW: _num(raw.acRated_kW, 0),
      surge_kW: _num(raw.surge_kW, 0),
      surge_s: _num(raw.surge_s, 0),
      batteryBus_V: _num(raw.batteryBus_V, 48),
      maxCharge_A: _num(raw.maxCharge_A, 0),
      maxDischarge_A: _num(raw.maxDischarge_A, 0),
      maxPv_kW: _num(raw.maxPv_kW, 0),
      mpptMin_V: _num(raw.mpptMin_V, 0),
      mpptMax_V: _num(raw.mpptMax_V, 0),
      maxDcVoc_V: _num(raw.maxDcVoc_V, 0),
      mpptCount: Math.max(0, Math.round(_num(raw.mpptCount, 0))),
      maxCurrentPerMppt_A: _num(raw.maxCurrentPerMppt_A, 0),
      supportedProfiles,
      utilityListed,
      listingSource,
      datasheetRev: _cleanText(raw.datasheetRev, 120),
      datasheetUrl: _cleanText(raw.datasheetUrl, 300),
      note: _cleanText(raw.note, 240),
    };
  }

  function _normalizeBattery(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = _cleanId(raw.id);
    const manufacturer = _cleanText(raw.manufacturer, 80);
    const model = _cleanText(raw.model, 120);
    if (!id || !manufacturer || !model) return null;
    return {
      id,
      manufacturer,
      model,
      chemistry: _cleanText(raw.chemistry || 'lifepo4', 32).toLowerCase(),
      nominalV: _num(raw.nominalV, 48),
      capacityAh: _num(raw.capacityAh, 0),
      recommendedDod: _num(raw.recommendedDod, 0.8),
      continuousCharge_A: _num(raw.continuousCharge_A, 0),
      continuousDischarge_A: _num(raw.continuousDischarge_A, 0),
      peakDischarge_A: _num(raw.peakDischarge_A, 0),
      peakDuration_s: _num(raw.peakDuration_s, 0),
      tempMinC: _num(raw.tempMinC, 0),
      tempMaxC: _num(raw.tempMaxC, 50),
      datasheetRev: _cleanText(raw.datasheetRev, 120),
      datasheetUrl: _cleanText(raw.datasheetUrl, 300),
      note: _cleanText(raw.note, 240),
    };
  }

  function _cloneInverter(inv) {
    return {
      ...inv,
      supportedProfiles: Array.isArray(inv.supportedProfiles) ? inv.supportedProfiles.slice() : [],
      utilityListed: inv.utilityListed && typeof inv.utilityListed === 'object' ? { ...inv.utilityListed } : {},
      listingSource: inv.listingSource && typeof inv.listingSource === 'object' ? { ...inv.listingSource } : {},
    };
  }

  function _cloneBattery(bat) {
    return { ...bat };
  }

  function _loadCatalogOverrides() {
    try {
      const raw = localStorage.getItem(CATALOG_OVERRIDE_KEY);
      if (!raw) return { utilityListed: {}, listingSource: {} };
      const parsed = JSON.parse(raw);
      const utilityListed = parsed && typeof parsed.utilityListed === 'object' ? parsed.utilityListed : {};
      const listingSource = parsed && typeof parsed.listingSource === 'object' ? parsed.listingSource : {};
      return { utilityListed, listingSource };
    } catch (_) {
      return { utilityListed: {}, listingSource: {} };
    }
  }

  function _saveCatalogOverrides(overrides) {
    const safe = overrides && typeof overrides === 'object' ? overrides : { utilityListed: {}, listingSource: {} };
    localStorage.setItem(CATALOG_OVERRIDE_KEY, JSON.stringify({
      utilityListed: safe.utilityListed || {},
      listingSource: safe.listingSource || {},
      updatedAt: new Date().toISOString(),
    }));
  }

  function _clearCatalogOverrides() {
    localStorage.removeItem(CATALOG_OVERRIDE_KEY);
  }

  function _normalizeOverridesInput(input) {
    const out = { utilityListed: {}, listingSource: {} };
    if (!input || typeof input !== 'object') return out;

    if (Array.isArray(input.inverters)) {
      input.inverters.forEach(row => {
        const id = _cleanId(row && row.id);
        if (!id) return;
        const flags = {};
        const sources = {};
        Object.keys(UTILITY_PROFILES).forEach(pid => {
          if (pid === 'offgrid') return;
          if (typeof row[pid] === 'boolean') flags[pid] = row[pid];
          if (row.utilityListed && typeof row.utilityListed[pid] === 'boolean') flags[pid] = row.utilityListed[pid];
          if (row.listingSource && row.listingSource[pid]) sources[pid] = _cleanText(row.listingSource[pid], 240);
        });
        if (Object.keys(flags).length) out.utilityListed[id] = flags;
        if (Object.keys(sources).length) out.listingSource[id] = sources;
      });
    }

    if (input.utilityListed && typeof input.utilityListed === 'object') {
      Object.keys(input.utilityListed).forEach(rawId => {
        const id = _cleanId(rawId);
        const val = input.utilityListed[rawId];
        if (!id || !val || typeof val !== 'object') return;
        const flags = {};
        Object.keys(UTILITY_PROFILES).forEach(pid => {
          if (pid === 'offgrid') return;
          if (typeof val[pid] === 'boolean') flags[pid] = val[pid];
        });
        if (Object.keys(flags).length) out.utilityListed[id] = flags;
      });
    }

    if (input.listingSource && typeof input.listingSource === 'object') {
      Object.keys(input.listingSource).forEach(rawId => {
        const id = _cleanId(rawId);
        const val = input.listingSource[rawId];
        if (!id || !val || typeof val !== 'object') return;
        const refs = {};
        Object.keys(UTILITY_PROFILES).forEach(pid => {
          if (pid === 'offgrid') return;
          if (val[pid]) refs[pid] = _cleanText(val[pid], 240);
        });
        if (Object.keys(refs).length) out.listingSource[id] = refs;
      });
    }

    return out;
  }

  function _parseBoolToken(token) {
    const t = String(token ?? '').trim().toLowerCase();
    if (!t) return null;
    if (['1', 'true', 'yes', 'y', 'listed', 'pass', 'approved'].includes(t)) return true;
    if (['0', 'false', 'no', 'n', 'not_listed', 'fail', 'rejected'].includes(t)) return false;
    return null;
  }

  function _parseOverrideCSV(text) {
    const rows = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (rows.length < 2) return { utilityListed: {}, listingSource: {} };
    const head = rows[0].split(',').map(h => _cleanId(h));
    const idxId = head.indexOf('id');
    const idxCeb = head.indexOf('ceb_2025');
    const idxLeco = head.indexOf('leco_2025');
    const idxCebSrc = head.indexOf('ceb_source');
    const idxLecoSrc = head.indexOf('leco_source');
    if (idxId < 0) throw new Error('CSV must include id column');
    const out = { utilityListed: {}, listingSource: {} };
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',').map(c => c.trim());
      const id = _cleanId(cols[idxId]);
      if (!id) continue;
      const flags = {};
      const refs = {};
      if (idxCeb >= 0) {
        const b = _parseBoolToken(cols[idxCeb]);
        if (typeof b === 'boolean') flags.ceb_2025 = b;
      }
      if (idxLeco >= 0) {
        const b = _parseBoolToken(cols[idxLeco]);
        if (typeof b === 'boolean') flags.leco_2025 = b;
      }
      if (idxCebSrc >= 0 && cols[idxCebSrc]) refs.ceb_2025 = _cleanText(cols[idxCebSrc], 240);
      if (idxLecoSrc >= 0 && cols[idxLecoSrc]) refs.leco_2025 = _cleanText(cols[idxLecoSrc], 240);
      if (Object.keys(flags).length) out.utilityListed[id] = flags;
      if (Object.keys(refs).length) out.listingSource[id] = refs;
    }
    return out;
  }

  function _mergeOverrides(base, next) {
    const out = {
      utilityListed: { ...(base && base.utilityListed ? base.utilityListed : {}) },
      listingSource: { ...(base && base.listingSource ? base.listingSource : {}) },
    };
    const src = next && typeof next === 'object' ? next : {};
    Object.keys(src.utilityListed || {}).forEach(id => {
      out.utilityListed[id] = { ...(out.utilityListed[id] || {}), ...(src.utilityListed[id] || {}) };
    });
    Object.keys(src.listingSource || {}).forEach(id => {
      out.listingSource[id] = { ...(out.listingSource[id] || {}), ...(src.listingSource[id] || {}) };
    });
    return out;
  }

  function _normalizeStandardsAudit(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const profileId = _cleanText(raw.profileId || raw.profile || '', 64);
    const profileLabel = _cleanText(raw.profileLabel || raw.profileName || '', 160);
    const rulesetVersion = _cleanText(raw.rulesetVersion || raw.rulesVersion || '', 64);
    if (!profileId && !profileLabel && !rulesetVersion) return null;
    return { profileId, profileLabel, rulesetVersion };
  }

  function _utilityOverrideRecordCount(overrides) {
    const ids = new Set();
    const safe = overrides && typeof overrides === 'object' ? overrides : {};
    Object.keys(safe.utilityListed || {}).forEach(id => ids.add(id));
    Object.keys(safe.listingSource || {}).forEach(id => ids.add(id));
    return ids.size;
  }

  function _utilityImportReport(meta, overrides) {
    const m = meta && typeof meta === 'object' ? meta : {};
    return {
      sourceFormat: _cleanText(m.sourceFormat || '', 24) || 'unknown',
      format: _cleanText(m.format || '', 64),
      schemaVersion: _cleanText(m.schemaVersion || m.version || '', 64),
      exportedAt: _cleanText(m.exportedAt || '', 64),
      standardsAudit: _normalizeStandardsAudit(m.standardsAudit),
      records: _utilityOverrideRecordCount(overrides),
    };
  }

  function _utilityImportReportSuffix(report) {
    if (!report || typeof report !== 'object') return '';
    const parts = [];
    if (report.records > 0) parts.push(`${report.records} records`);
    if (report.standardsAudit) {
      const a = report.standardsAudit;
      const profile = a.profileLabel || a.profileId;
      const rule = a.rulesetVersion;
      if (profile && rule) parts.push(`Std: ${profile} @ ${rule}`);
      else if (profile) parts.push(`Std: ${profile}`);
      else if (rule) parts.push(`Ruleset: ${rule}`);
    }
    return parts.length ? ` (${parts.join(' | ')})` : '';
  }

  function _applyOverridesToCatalog() {
    const overrides = _loadCatalogOverrides();
    const inverters = (catalogState.baseInverters || []).map(_cloneInverter);
    const batteries = (catalogState.baseBatteries || []).map(_cloneBattery);
    inverters.forEach(inv => {
      const flag = overrides.utilityListed && overrides.utilityListed[inv.id];
      if (flag && typeof flag === 'object') {
        Object.keys(UTILITY_PROFILES).forEach(pid => {
          if (pid === 'offgrid') return;
          if (typeof flag[pid] === 'boolean') inv.utilityListed[pid] = flag[pid];
        });
      }
      const refs = overrides.listingSource && overrides.listingSource[inv.id];
      if (refs && typeof refs === 'object') {
        Object.keys(UTILITY_PROFILES).forEach(pid => {
          if (pid === 'offgrid') return;
          if (refs[pid]) inv.listingSource[pid] = _cleanText(refs[pid], 240);
        });
      }
    });
    catalogState.inverters = _sortByName(inverters);
    catalogState.batteries = _sortByName(batteries);
  }

  async function _loadCatalogJSON(url) {
    if (typeof fetch !== 'function') throw new Error('Fetch API unavailable');
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res && res.ok) return res.json();
    } catch (_) {}
    try {
      const absolute = (typeof window !== 'undefined' && window.location)
        ? new URL(url, window.location.href).toString()
        : url;
      const res2 = await fetch(absolute, { cache: 'no-cache' });
      if (res2 && res2.ok) return res2.json();
    } catch (_) {}
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      throw new Error(`Cannot load ${url} from file://. Start app with launch.bat (http://localhost:8090).`);
    }
    throw new Error(`Failed to load ${url}`);
  }

  function _extractRows(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object' && Array.isArray(payload[key])) return payload[key];
    return [];
  }

  function _sortByName(list) {
    return (list || []).slice().sort((a, b) => String(`${a.manufacturer} ${a.model}`).localeCompare(`${b.manufacturer} ${b.model}`));
  }

  async function _syncCatalogFromStore(forceRefresh) {
    if (typeof CatalogStore === 'undefined' || !CatalogStore || typeof CatalogStore.ensureLoaded !== 'function') {
      return false;
    }

    await CatalogStore.ensureLoaded();
    const storeState = typeof CatalogStore.getState === 'function' ? CatalogStore.getState() : null;
    if (storeState && storeState.loadError) {
      throw new Error(storeState.loadError);
    }

    const revisionRaw = typeof CatalogStore.getRevision === 'function'
      ? CatalogStore.getRevision()
      : (storeState && storeState.revision ? storeState.revision : '');
    const revision = _cleanText(revisionRaw || '', 80);

    if (
      !forceRefresh
      && catalogState.loaded
      && revision
      && revision === catalogState.storeRevision
      && Array.isArray(catalogState.baseInverters)
      && catalogState.baseInverters.length
      && Array.isArray(catalogState.baseBatteries)
      && catalogState.baseBatteries.length
    ) {
      return true;
    }

    const inverterRows = (typeof CatalogStore.getInvertersByTopology === 'function'
      ? CatalogStore.getInvertersByTopology('hybrid')
      : ((typeof CatalogStore.getAllInverters === 'function' ? CatalogStore.getAllInverters() : [])
        .filter(x => _cleanText(x && x.topology, 40).toLowerCase() === 'hybrid')))
      .map(_normalizeInverter)
      .filter(Boolean);

    const batteryRows = (typeof CatalogStore.getAllBatteries === 'function' ? CatalogStore.getAllBatteries() : [])
      .map(_normalizeBattery)
      .filter(Boolean);

    catalogState.baseInverters = _sortByName(inverterRows);
    catalogState.baseBatteries = _sortByName(batteryRows);
    catalogState.storeRevision = revision;

    const version = _cleanText(revision || '', 40) || 'local';
    catalogState.inverterMeta = { version, source: 'Unified database catalog' };
    catalogState.batteryMeta = { version, source: 'Unified database catalog' };

    _applyOverridesToCatalog();
    return true;
  }

  async function _ensureCatalogLoaded(container) {
    if (catalogState.loading) return;

    if (catalogState.loaded) {
      const prevRevision = catalogState.storeRevision || '';
      try {
        await _syncCatalogFromStore(false);
        if (
          prevRevision !== (catalogState.storeRevision || '')
          && container
          && typeof container === 'object'
          && typeof container.isConnected === 'boolean'
          && container.isConnected
          && typeof App !== 'undefined'
          && App
          && App.state
          && App.state.currentPage === 'hybrid'
        ) {
          render(container);
        }
      } catch (err) {
        catalogState.loadError = err && err.message ? err.message : 'Catalog sync failed';
      }
      return;
    }

    catalogState.loading = true;
    catalogState.loadError = '';
    try {
      let loadedFromStore = false;
      try {
        loadedFromStore = await _syncCatalogFromStore(true);
      } catch (storeErr) {
        catalogState.loadError = storeErr && storeErr.message ? storeErr.message : 'Catalog store sync failed';
      }

      if (!loadedFromStore || !catalogState.baseInverters.length || !catalogState.baseBatteries.length) {
        const [inverterPayload, batteryPayload] = await Promise.all([
          _loadCatalogJSON(CATALOG_PATHS.inverter),
          _loadCatalogJSON(CATALOG_PATHS.battery),
        ]);
        const inverters = _extractRows(inverterPayload, 'inverters')
          .map(_normalizeInverter)
          .filter(Boolean);
        const batteries = _extractRows(batteryPayload, 'batteries')
          .map(_normalizeBattery)
          .filter(Boolean);
        catalogState.inverterMeta = (inverterPayload && typeof inverterPayload === 'object' && !Array.isArray(inverterPayload))
          ? { version: _cleanText(inverterPayload.version, 40), source: _cleanText(inverterPayload.source, 240) }
          : null;
        catalogState.batteryMeta = (batteryPayload && typeof batteryPayload === 'object' && !Array.isArray(batteryPayload))
          ? { version: _cleanText(batteryPayload.version, 40), source: _cleanText(batteryPayload.source, 240) }
          : null;
        catalogState.baseInverters = _sortByName(inverters);
        catalogState.baseBatteries = _sortByName(batteries);
        _applyOverridesToCatalog();
      }
    } catch (err) {
      catalogState.loadError = err && err.message ? err.message : 'Catalog load failed';
      catalogState.baseInverters = [];
      catalogState.baseBatteries = [];
      catalogState.inverters = [];
      catalogState.batteries = [];
    } finally {
      catalogState.loading = false;
      catalogState.loaded = true;
      if (
        container &&
        typeof container === 'object' &&
        typeof container.isConnected === 'boolean' &&
        container.isConnected &&
        typeof App !== 'undefined' &&
        App &&
        App.state &&
        App.state.currentPage === 'hybrid'
      ) {
        render(container);
      }
    }
  }

  function _lookupById(list, id) {
    const key = String(id || '');
    if (!key || key === CATALOG_NONE) return null;
    return list.find(x => x.id === key) || null;
  }

  function _getInverter(id) {
    return _lookupById(_catalogInverters(), id);
  }

  function _getBattery(id) {
    return _lookupById(_catalogBatteries(), id);
  }

  function _getPanel(id) {
    if (String(id || '') === CATALOG_NONE) return null;
    if (typeof DB === 'undefined' || !DB || typeof DB.getById !== 'function') return null;
    return DB.getById(id) || null;
  }

  function _panelList() {
    if (typeof DB === 'undefined' || !DB || typeof DB.getAll !== 'function') return [];
    const list = DB.getAll() || [];
    return list
      .filter(p => !p._deleted)
      .slice()
      .sort((a, b) => String(`${a.manufacturer} ${a.model}`).localeCompare(`${b.manufacturer} ${b.model}`));
  }

  function _modelOption(value, label, selected) {
    return `<option value="${_esc(value)}" ${value === selected ? 'selected' : ''}>${_esc(label)}</option>`;
  }

  function _profileById(id) {
    const key = String(id || 'offgrid');
    return UTILITY_PROFILES[key] || UTILITY_PROFILES.offgrid;
  }

  function _badgeChip(text, cls) {
    return `<span class="status-badge ${_esc(cls)}" style="margin-right:6px">${_esc(text)}</span>`;
  }

  function _defaultInputs() {
    return {
      dailyEnergy_kWh: 18, peakLoad_kW: 5, surgeLoad_kW: 8, autonomyDays: 1,
      batteryVoltage_V: 48, chemistry: 'lifepo4', dod: CHEMISTRY.lifepo4.dod, etaBatt: CHEMISTRY.lifepo4.etaBatt,
      etaInv: 0.93, tempDerate: 0.90, reserveFactor: 1.15, psh: 4.8, systemPR: 0.75,
      pvOversize: 1.15, inverterSafetyFactor: 1.25, chargeMargin: 1.25,
      inverterModelId: CATALOG_NONE, batteryModelId: CATALOG_NONE, batteryParallel: 1,
      panelId: CATALOG_NONE, modulesPerString: 0, stringsPerMppt: 1,
      siteTmin_C: 10, cellTmax_C: 70, surgeDuration_s: 5,
      exportMode: 'no_export', utilityProfile: 'offgrid',
      utilityDocSld: false,
      utilityDocProtectionSettings: false,
      utilityDocEquipmentApprovals: false,
      utilityDocCommissioningReport: false,
      utilityDocInterconnectionForm: false,
      utilityMeterReady: false,
      utilityIsolationAccessible: false,
      utilitySettingsMatched: false,
      utilityFinalAcceptance: false,
    };
  }

  function _normalizeHybridInputState(raw) {
    const defaults = _defaultInputs();
    const out = { ...defaults, ...(raw || {}) };
    out.exportMode = out.exportMode === 'export' ? 'export' : 'no_export';
    out.utilityProfile = UTILITY_PROFILES[out.utilityProfile] ? out.utilityProfile : 'offgrid';
    out.inverterModelId = _cleanText(out.inverterModelId || CATALOG_NONE, 120) || CATALOG_NONE;
    out.batteryModelId = _cleanText(out.batteryModelId || CATALOG_NONE, 120) || CATALOG_NONE;
    out.panelId = _cleanText(out.panelId || CATALOG_NONE, 120) || CATALOG_NONE;
    UTILITY_SUBMISSION_KEYS.forEach(key => { out[key] = _bool(out[key], defaults[key]); });
    return out;
  }

  function render(container) {
    _ensureCatalogLoaded(container);
    const s = _normalizeHybridInputState(App.state.hybridInputs || {});
    const inverterCatalog = _catalogInverters();
    const batteryCatalog = _catalogBatteries();
    const loadingLabel = catalogState.loading && !catalogState.loaded
      ? 'Loading inverter/battery catalog...'
      : (catalogState.loadError
        ? `Catalog load fallback: ${catalogState.loadError}`
        : `Catalog loaded: ${inverterCatalog.length} inverters, ${batteryCatalog.length} batteries`);
    const panelOptions = [_modelOption(CATALOG_NONE, '(Optional) Select panel model for MPPT checks', s.panelId)]
      .concat(_panelList().map(p => _modelOption(p.id, `${p.manufacturer} ${p.model} (${p.Pmax}W)`, s.panelId)))
      .join('');
    const inverterOptions = [_modelOption(CATALOG_NONE, '(Optional) Select inverter model', s.inverterModelId)]
      .concat(inverterCatalog.map(inv => _modelOption(inv.id, `${inv.manufacturer} ${inv.model}`, s.inverterModelId)))
      .join('');
    const batteryOptions = [_modelOption(CATALOG_NONE, '(Optional) Select battery model', s.batteryModelId)]
      .concat(batteryCatalog.map(b => _modelOption(b.id, `${b.manufacturer} ${b.model}`, s.batteryModelId)))
      .join('');
    const profileOptions = Object.values(UTILITY_PROFILES)
      .map(p => _modelOption(p.id, p.label, s.utilityProfile))
      .join('');
    const utilityChecklistHtml = UTILITY_SUBMISSION_ITEMS
      .map(item => `
        <label class="checkbox-item ${s[item.key] ? 'checked' : ''}">
          <input type="checkbox" id="${_esc(item.inputId)}" ${s[item.key] ? 'checked' : ''} />
          <span>${_esc(item.label)}</span>
        </label>
      `)
      .join('');

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
        </div>
        <div class="card">
          <div class="card-title">Catalogue-Backed Validation (Phase 2)</div>
          <div class="info-box">${_esc(loadingLabel)}</div>
          <div class="btn-group" style="margin-top:8px">
            <button class="btn btn-secondary btn-sm" id="hy-utility-manager-btn">Utility List Manager</button>
            <button class="btn btn-secondary btn-sm" id="hy-open-validator-btn">Open Utility Validator Screen</button>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Inverter Model</label>
              <select class="form-select" id="hy-inv-model">${inverterOptions}</select>
              <div class="form-hint" id="hy-inv-hint"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Battery Model</label>
              <select class="form-select" id="hy-bat-model">${batteryOptions}</select>
              <div class="form-hint" id="hy-bat-hint"></div>
            </div>
            <div class="form-group"><label class="form-label">Parallel Battery Strings</label><input class="form-input" id="hy-bat-par" type="number" min="1" step="1" value="${_esc(s.batteryParallel)}" /></div>
            <div class="form-group"><label class="form-label">Required Surge Duration (s)</label><input class="form-input" id="hy-surge-sec" type="number" min="0.5" max="30" step="0.5" value="${_esc(s.surgeDuration_s)}" /></div>
            <div class="form-group"><label class="form-label">Panel Model (for MPPT checks)</label><select class="form-select" id="hy-panel-model">${panelOptions}</select></div>
            <div class="form-group"><label class="form-label">Modules per String</label><input class="form-input" id="hy-mod-str" type="number" min="0" step="1" value="${_esc(s.modulesPerString)}" /></div>
            <div class="form-group"><label class="form-label">Strings per MPPT</label><input class="form-input" id="hy-str-mppt" type="number" min="1" step="1" value="${_esc(s.stringsPerMppt)}" /></div>
            <div class="form-group"><label class="form-label">Site Tmin for Voc Check (&deg;C)</label><input class="form-input" id="hy-tmin" type="number" min="-20" max="30" step="1" value="${_esc(s.siteTmin_C)}" /></div>
            <div class="form-group"><label class="form-label">Cell Tmax for MPPT Check (&deg;C)</label><input class="form-input" id="hy-tmax-cell" type="number" min="30" max="95" step="1" value="${_esc(s.cellTmax_C)}" /></div>
            <div class="form-group">
              <label class="form-label">Export Mode</label>
              <select class="form-select" id="hy-export-mode">
                <option value="no_export" ${s.exportMode === 'no_export' ? 'selected' : ''}>No Export / Backup Priority</option>
                <option value="export" ${s.exportMode === 'export' ? 'selected' : ''}>Export Enabled (Utility Approval)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Target Utility Profile</label>
              <select class="form-select" id="hy-utility-profile">${profileOptions}</select>
              <div class="form-hint" id="hy-profile-hint"></div>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Utility Submission Package Validator (Strict Export Gate)</label>
              <div class="checkbox-grid" id="hy-utility-checklist">${utilityChecklistHtml}</div>
              <div class="form-hint" id="hy-submission-hint"></div>
            </div>
          </div>
          <div class="btn-group"><button class="btn btn-primary" id="hy-calc-btn">Calculate Hybrid Setup</button></div>
        </div>
        <div id="hy-results" class="hidden"></div>
      </div>
    `;

    container.querySelector('#hy-chem').addEventListener('change', () => _applyChemistryDefaults(container));
    container.querySelector('#hy-inv-model').addEventListener('change', () => _updateCatalogueHints(container));
    container.querySelector('#hy-bat-model').addEventListener('change', () => _updateCatalogueHints(container));
    container.querySelector('#hy-export-mode').addEventListener('change', () => _updateCatalogueHints(container));
    container.querySelector('#hy-utility-profile').addEventListener('change', () => _updateCatalogueHints(container));
    container.querySelectorAll('#hy-utility-checklist input[type="checkbox"]').forEach(el => {
      el.addEventListener('change', () => _updateCatalogueHints(container));
    });
    const utilityMgrBtn = container.querySelector('#hy-utility-manager-btn');
    if (utilityMgrBtn) utilityMgrBtn.addEventListener('click', () => _openUtilityListManager(container));
    const openValidatorBtn = container.querySelector('#hy-open-validator-btn');
    if (openValidatorBtn) {
      openValidatorBtn.addEventListener('click', () => {
        if (typeof App !== 'undefined' && App && typeof App.navigate === 'function') {
          App.navigate('utilityvalidator');
        }
      });
    }
    container.querySelector('#hy-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#hy-calc-btn'), () => _calculate(container));
    });
    _bindChecklistVisualState(container, '#hy-utility-checklist');
    _applyChemistryDefaults(container, false);
    _updateCatalogueHints(container);
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

  function _updateCatalogueHints(container) {
    const inv = _getInverter(container.querySelector('#hy-inv-model').value);
    const bat = _getBattery(container.querySelector('#hy-bat-model').value);
    const profile = _profileById(container.querySelector('#hy-utility-profile').value);
    const exportMode = container.querySelector('#hy-export-mode').value;

    const invHint = container.querySelector('#hy-inv-hint');
    if (invHint) {
      if (!inv) {
        invHint.textContent = catalogState.loading
          ? 'Loading inverter catalog...'
          : 'No inverter selected. Result will include heuristic checks only.';
      } else {
        const listedText = profile && profile.id !== 'offgrid'
          ? (inv.utilityListed && inv.utilityListed[profile.id] === true ? 'LISTED' : 'NOT LISTED')
          : 'N/A';
        invHint.textContent = `${inv.acRated_kW.toFixed(1)}kW AC, surge ${inv.surge_kW.toFixed(1)}kW/${inv.surge_s}s, battery ${inv.batteryBus_V}V, MPPT ${inv.mpptMin_V}-${inv.mpptMax_V}V, ${profile.utility} status: ${listedText}`;
      }
    }

    const batHint = container.querySelector('#hy-bat-hint');
    if (batHint) {
      if (!bat) {
        batHint.textContent = catalogState.loading
          ? 'Loading battery catalog...'
          : 'No battery selected. Current checks use calculated equivalent Ah only.';
      } else {
        const moduleKWh = (bat.nominalV * bat.capacityAh) / 1000;
        batHint.textContent = `${moduleKWh.toFixed(2)}kWh module, ${bat.continuousDischarge_A}A continuous discharge, ${bat.peakDischarge_A}A peak/${bat.peakDuration_s}s`;
      }
    }

    const profileHint = container.querySelector('#hy-profile-hint');
    if (profileHint) {
      if (exportMode !== 'export') {
        profileHint.textContent = 'Export disabled. Utility profile kept for documentation only.';
      } else {
        profileHint.textContent = `${profile.utility}: V ${profile.voltageWindow}, f ${profile.frequencyWindow}, reconnect >= ${profile.reconnect_s}s`;
      }
    }

    const submissionHint = container.querySelector('#hy-submission-hint');
    if (submissionHint) {
      const submissionInputs = _readUtilitySubmissionInputs(container);
      submissionHint.textContent = _submissionChecklistHint(submissionInputs, exportMode);
    }
  }

  function _collectUtilityManagerState() {
    const body = document.getElementById('modal-body');
    const rows = body ? Array.from(body.querySelectorAll('tr[data-inverter-id]')) : [];
    const utilityListed = {};
    const listingSource = {};
    rows.forEach(row => {
      const id = _cleanId(row.getAttribute('data-inverter-id') || '');
      if (!id) return;
      const ceb = row.querySelector('input[data-profile="ceb_2025"]');
      const leco = row.querySelector('input[data-profile="leco_2025"]');
      const cebSrc = row.querySelector('input[data-source-profile="ceb_2025"]');
      const lecoSrc = row.querySelector('input[data-source-profile="leco_2025"]');
      utilityListed[id] = {
        ceb_2025: !!(ceb && ceb.checked),
        leco_2025: !!(leco && leco.checked),
      };
      const refs = {};
      if (cebSrc && cebSrc.value.trim()) refs.ceb_2025 = _cleanText(cebSrc.value, 240);
      if (lecoSrc && lecoSrc.value.trim()) refs.leco_2025 = _cleanText(lecoSrc.value, 240);
      if (Object.keys(refs).length) listingSource[id] = refs;
    });
    return { utilityListed, listingSource };
  }

  function _openUtilityListManager(container) {
    if (!catalogState.loaded || catalogState.loading) {
      _ensureCatalogLoaded(container);
      App.toast('Loading utility catalog. Try again in a moment.', 'warning');
      return;
    }
    const inverters = _catalogInverters();
    if (!inverters.length) {
      App.toast('No inverter catalog data loaded', 'error');
      return;
    }

    const rows = inverters.map(inv => {
      const cebListed = !!(inv.utilityListed && inv.utilityListed.ceb_2025);
      const lecoListed = !!(inv.utilityListed && inv.utilityListed.leco_2025);
      const cebSrc = inv.listingSource && inv.listingSource.ceb_2025 ? inv.listingSource.ceb_2025 : '';
      const lecoSrc = inv.listingSource && inv.listingSource.leco_2025 ? inv.listingSource.leco_2025 : '';
      return `
        <tr data-inverter-id="${_esc(inv.id)}">
          <td><strong>${_esc(inv.manufacturer)} ${_esc(inv.model)}</strong><br><span class="text-muted">${_esc(inv.id)}</span></td>
          <td><input type="checkbox" data-profile="ceb_2025" ${cebListed ? 'checked' : ''} /></td>
          <td><input class="form-input" data-source-profile="ceb_2025" value="${_esc(cebSrc)}" placeholder="Listing source / ref" /></td>
          <td><input type="checkbox" data-profile="leco_2025" ${lecoListed ? 'checked' : ''} /></td>
          <td><input class="form-input" data-source-profile="leco_2025" value="${_esc(lecoSrc)}" placeholder="Listing source / ref" /></td>
        </tr>
      `;
    }).join('');

    const bodyHtml = `
      <div class="info-box">Manage strict utility-list tagging used by export PASS/FAIL checks. Save writes local overrides on this device.</div>
      <div class="btn-group" style="margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="hy-ulm-export">Export Utility JSON</button>
        <button class="btn btn-secondary btn-sm" id="hy-ulm-import">Import JSON/CSV</button>
        <button class="btn btn-danger btn-sm" id="hy-ulm-reset">Reset Local Overrides</button>
      </div>
      <div style="overflow-x:auto; margin-top:10px">
        <table class="status-table">
          <thead>
            <tr>
              <th>Inverter</th>
              <th>CEB Listed</th>
              <th>CEB Source</th>
              <th>LECO Listed</th>
              <th>LECO Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="text-sm text-muted mt-8">CSV import columns: <code>id,ceb_2025,leco_2025,ceb_source,leco_source</code></div>
    `;

    App.showModal('Utility List Manager', bodyHtml, [
      { label: 'Close', cls: 'btn-secondary', action: 'close' },
      {
        label: 'Save',
        cls: 'btn-primary',
        action: () => {
          const overrides = _collectUtilityManagerState();
          _saveCatalogOverrides(overrides);
          _applyOverridesToCatalog();
          App.toast('Utility listing overrides saved', 'success');
          render(container);
        }
      }
    ]);

    const modalBody = document.getElementById('modal-body');
    const exportBtn = modalBody.querySelector('#hy-ulm-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const snap = _collectUtilityManagerState();
        const payload = {
          format: 'solarpv.utility.overrides',
          schemaVersion: '2026.04.09',
          version: '2026-04-08',
          exportedAt: new Date().toISOString(),
          standardsAudit: _standardsAuditMeta(),
          utilityListed: snap.utilityListed,
          listingSource: snap.listingSource,
          inverters: _catalogInverters().map(inv => ({
            id: inv.id,
            manufacturer: inv.manufacturer,
            model: inv.model,
            utilityListed: snap.utilityListed[inv.id] || { ceb_2025: false, leco_2025: false },
            listingSource: snap.listingSource[inv.id] || {},
          })),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        _downloadBlob(`utility_list_overrides_${(typeof App.localDateISO === 'function' ? App.localDateISO() : 'date')}.json`, blob);
        App.toast('Utility list JSON exported', 'success');
      });
    }

    const importBtn = modalBody.querySelector('#hy-ulm-import');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json,.csv,text/csv,application/json';
        picker.onchange = e => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            try {
              const text = String(ev.target && ev.target.result ? ev.target.result : '');
              const isCsv = file.name.toLowerCase().endsWith('.csv');
              let imported = null;
              let importReport = null;
              if (isCsv) {
                imported = _parseOverrideCSV(text);
                importReport = _utilityImportReport({ sourceFormat: 'csv' }, imported);
              } else {
                const parsed = JSON.parse(text);
                imported = _normalizeOverridesInput(parsed);
                importReport = _utilityImportReport({
                  sourceFormat: Array.isArray(parsed) ? 'array' : 'envelope',
                  format: parsed && typeof parsed === 'object' ? parsed.format : '',
                  schemaVersion: parsed && typeof parsed === 'object' ? (parsed.schemaVersion || parsed.version) : '',
                  exportedAt: parsed && typeof parsed === 'object' ? parsed.exportedAt : '',
                  standardsAudit: parsed && typeof parsed === 'object' ? parsed.standardsAudit : null
                }, imported);
              }
              const merged = _mergeOverrides(_loadCatalogOverrides(), imported);
              _saveCatalogOverrides(merged);
              _applyOverridesToCatalog();
              if (typeof App !== 'undefined' && App && typeof App.addImportHistory === 'function') {
                App.addImportHistory({
                  source: 'Utility Override Import',
                  fileName: file && file.name ? file.name : '',
                  sourceFormat: importReport && importReport.sourceFormat ? importReport.sourceFormat : (isCsv ? 'csv' : 'array'),
                  format: importReport && importReport.format ? importReport.format : '',
                  schemaVersion: importReport && importReport.schemaVersion ? importReport.schemaVersion : '',
                  exportedAt: importReport && importReport.exportedAt ? importReport.exportedAt : '',
                  standardsAudit: importReport && importReport.standardsAudit ? importReport.standardsAudit : null,
                  ok: true,
                  records: importReport && Number.isFinite(Number(importReport.records)) ? importReport.records : 0,
                  error: ''
                });
              }
              App.toast(`Utility list import applied${_utilityImportReportSuffix(importReport)}`, 'success');
              App.closeModal();
              _openUtilityListManager(container);
              render(container);
            } catch (err) {
              if (typeof App !== 'undefined' && App && typeof App.addImportHistory === 'function') {
                App.addImportHistory({
                  source: 'Utility Override Import',
                  fileName: file && file.name ? file.name : '',
                  sourceFormat: file && file.name && file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'unknown',
                  ok: false,
                  error: err && err.message ? err.message : 'invalid file'
                });
              }
              App.toast(`Import failed: ${err && err.message ? err.message : 'invalid file'}`, 'error');
            }
          };
          reader.readAsText(file);
        };
        picker.click();
      });
    }

    const resetBtn = modalBody.querySelector('#hy-ulm-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('Clear local utility-list overrides and revert to catalog JSON defaults?')) return;
        _clearCatalogOverrides();
        _applyOverridesToCatalog();
        App.toast('Utility listing overrides reset', 'success');
        App.closeModal();
        _openUtilityListManager(container);
        render(container);
      });
    }
  }

  function openUtilityManager(container) {
    const host = container || document.getElementById('main-content');
    if (!host) return false;
    if (!catalogState.loaded) {
      if (!catalogState.loading) _ensureCatalogLoaded(host);
      let attempts = 0;
      const waitAndOpen = () => {
        if (catalogState.loading && attempts < 40) {
          attempts += 1;
          setTimeout(waitAndOpen, 100);
          return;
        }
        _openUtilityListManager(host);
      };
      waitAndOpen();
      return true;
    }
    _openUtilityListManager(host);
    return true;
  }

  function getCatalogSummary() {
    return {
      loaded: !!catalogState.loaded,
      loading: !!catalogState.loading,
      loadError: catalogState.loadError || '',
      inverterCount: _catalogInverters().length,
      batteryCount: _catalogBatteries().length,
      storeRevision: catalogState.storeRevision || '',
      inverterVersion: catalogState.inverterMeta && catalogState.inverterMeta.version ? catalogState.inverterMeta.version : '',
      batteryVersion: catalogState.batteryMeta && catalogState.batteryMeta.version ? catalogState.batteryMeta.version : '',
      inverterSource: catalogState.inverterMeta && catalogState.inverterMeta.source ? catalogState.inverterMeta.source : '',
      batterySource: catalogState.batteryMeta && catalogState.batteryMeta.source ? catalogState.batteryMeta.source : '',
    };
  }

  async function ensureCatalogLoaded() {
    await _ensureCatalogLoaded(null);
  }

  function getUtilitySubmissionViewModel() {
    const inputs = _normalizeHybridInputState((typeof App !== 'undefined' && App && App.state) ? App.state.hybridInputs : {});
    const profile = _profileById(inputs.utilityProfile);
    const inverterModel = _getInverter(inputs.inverterModelId);
    const us = _evaluateUtilitySubmission(inputs, profile, inverterModel);

    return {
      inputs,
      profile,
      inverterModel,
      utilitySubmission: us,
      summaryHint: _submissionChecklistHint(inputs, inputs.exportMode),
      profiles: Object.values(UTILITY_PROFILES).map(p => ({
        id: p.id,
        label: p.label,
        utility: p.utility,
        exportEnabled: !!p.exportEnabled,
        voltageWindow: p.voltageWindow,
        frequencyWindow: p.frequencyWindow,
        reconnect_s: p.reconnect_s
      })),
      inverters: _catalogInverters().map(inv => ({
        id: inv.id,
        manufacturer: inv.manufacturer,
        model: inv.model,
        acRated_kW: inv.acRated_kW,
        utilityListed: inv.utilityListed && typeof inv.utilityListed === 'object' ? { ...inv.utilityListed } : {}
      })),
      docs: UTILITY_SUBMISSION_DOCS.map(item => ({
        key: item.key,
        label: item.label,
        note: item.note,
        checked: inputs[item.key] === true
      })),
      gates: UTILITY_SUBMISSION_GATES.map(item => ({
        key: item.key,
        label: item.label,
        note: item.note,
        blocker: item.blocker,
        checked: inputs[item.key] === true
      })),
      catalog: getCatalogSummary(),
      resultReady: !!((typeof App !== 'undefined' && App && App.state && App.state.hybridResult)
        && App.state.hybridResult.inputs
        && App.state.hybridResult.battery
        && App.state.hybridResult.pv
        && App.state.hybridResult.inverter),
    };
  }

  function updateUtilitySubmissionState(patch) {
    const current = _normalizeHybridInputState((typeof App !== 'undefined' && App && App.state) ? App.state.hybridInputs : {});
    const next = _normalizeHybridInputState({ ...current, ...(patch || {}) });
    if (typeof App !== 'undefined' && App && App.state) {
      App.state.hybridInputs = next;
    }
    return getUtilitySubmissionViewModel();
  }

  function getFinalProjectPackState() {
    const vm = getUtilitySubmissionViewModel();
    const us = vm.utilitySubmission || {};
    const ready = vm.resultReady && (!us.applicable || us.strictPass === true);
    return {
      ready,
      resultReady: !!vm.resultReady,
      strictPass: !us.applicable || us.strictPass === true,
      applicable: !!us.applicable,
      docProvided: us.docProvided || 0,
      docTotal: us.docTotal || UTILITY_SUBMISSION_DOCS.length,
      blockers: Array.isArray(us.blockers) ? us.blockers.slice() : [],
      missingDocuments: Array.isArray(us.missingDocuments) ? us.missingDocuments.slice() : [],
      gateReason: _utilityGateFailureText(us),
    };
  }

  async function exportFinalProjectPack(format) {
    return _attemptFinalProjectPackExport(format, null);
  }

  function _v(container, id) { return parseFloat(container.querySelector(id).value); }
  function _checked(container, id) {
    const el = container.querySelector(id);
    return !!(el && el.checked);
  }

  function _readUtilitySubmissionInputs(container) {
    const out = {};
    UTILITY_SUBMISSION_ITEMS.forEach(item => {
      out[item.key] = _checked(container, `#${item.inputId}`);
    });
    return out;
  }

  function _bindChecklistVisualState(container, rootSelector) {
    const root = container.querySelector(rootSelector);
    if (!root) return;
    const items = Array.from(root.querySelectorAll('.checkbox-item'));
    items.forEach(item => {
      const input = item.querySelector('input[type="checkbox"]');
      if (!input) return;
      const sync = () => item.classList.toggle('checked', !!input.checked);
      input.addEventListener('change', sync);
      sync();
    });
  }

  function _submissionChecklistHint(inputs, exportMode) {
    if (exportMode !== 'export') return 'Export mode is OFF. Checklist is optional until export path is selected.';
    const docProvided = UTILITY_SUBMISSION_DOCS.filter(item => inputs[item.key] === true).length;
    const gateConfirmed = UTILITY_SUBMISSION_GATES.filter(item => inputs[item.key] === true).length;
    const docTotal = UTILITY_SUBMISSION_DOCS.length;
    const gateTotal = UTILITY_SUBMISSION_GATES.length;
    const remaining = (docTotal - docProvided) + (gateTotal - gateConfirmed);
    if (remaining <= 0) return 'Submission package and utility gates are complete for strict export release.';
    return `Submission readiness: documents ${docProvided}/${docTotal}, gates ${gateConfirmed}/${gateTotal}. Remaining blockers: ${remaining}.`;
  }

  function _calculate(container) {
    const utilityInputs = _readUtilitySubmissionInputs(container);
    const inputs = {
      dailyEnergy_kWh: _v(container, '#hy-e'), autonomyDays: _v(container, '#hy-auto'),
      peakLoad_kW: _v(container, '#hy-peak'), surgeLoad_kW: _v(container, '#hy-surge'),
      batteryVoltage_V: _v(container, '#hy-vbat'), chemistry: container.querySelector('#hy-chem').value,
      dod: _v(container, '#hy-dod'), etaBatt: _v(container, '#hy-etab'), etaInv: _v(container, '#hy-etai'),
      tempDerate: _v(container, '#hy-temp'), reserveFactor: _v(container, '#hy-res'),
      psh: _v(container, '#hy-psh'), systemPR: _v(container, '#hy-pr'), pvOversize: _v(container, '#hy-pv-over'),
      inverterSafetyFactor: _v(container, '#hy-inv-sf'), chargeMargin: _v(container, '#hy-cc-margin'),
      inverterModelId: container.querySelector('#hy-inv-model').value,
      batteryModelId: container.querySelector('#hy-bat-model').value,
      batteryParallel: _v(container, '#hy-bat-par'),
      surgeDuration_s: _v(container, '#hy-surge-sec'),
      panelId: container.querySelector('#hy-panel-model').value,
      modulesPerString: _v(container, '#hy-mod-str'),
      stringsPerMppt: _v(container, '#hy-str-mppt'),
      siteTmin_C: _v(container, '#hy-tmin'),
      cellTmax_C: _v(container, '#hy-tmax-cell'),
      exportMode: container.querySelector('#hy-export-mode').value,
      utilityProfile: container.querySelector('#hy-utility-profile').value,
      ...utilityInputs,
    };
    if (Object.values(inputs).some(v => typeof v === 'number' && Number.isNaN(v))) { App.toast('Please fill all numeric fields', 'error'); return; }

    inputs.batteryParallel = Math.max(1, Math.round(inputs.batteryParallel));
    inputs.modulesPerString = Math.max(0, Math.round(inputs.modulesPerString));
    inputs.stringsPerMppt = Math.max(1, Math.round(inputs.stringsPerMppt));

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

    const catalogue = _evaluateCatalogueChecks(inputs, { battery, pv, inverter, batteryAh, charge });
    if (catalogue.summary.fail > 0) warnings.push(`${catalogue.summary.fail} catalogue hard-limit checks failed. Review catalogue check table.`);
    if (catalogue.summary.warn > 0) warnings.push(`${catalogue.summary.warn} catalogue checks require engineering review.`);
    if (catalogue.approvalRequired) warnings.push('Export mode selected: utility acceptance is required before enabling grid export.');
    if (catalogue.utilitySubmission && catalogue.utilitySubmission.applicable && !catalogue.utilitySubmission.strictPass) {
      const us = catalogue.utilitySubmission;
      if (us.missingDocuments.length) warnings.push(`Utility submission missing documents: ${us.missingDocuments.join('; ')}.`);
      if (us.gateBlockers.length) warnings.push(`Utility submission blockers: ${us.gateBlockers.join('; ')}.`);
    }

    const result = {
      date: typeof App.localDateISO === 'function' ? App.localDateISO() : new Date().toISOString().slice(0, 10),
      inputs, chemistryLabel: (CHEMISTRY[inputs.chemistry] || CHEMISTRY.lifepo4).label,
      battery, batteryAh, pv, inverter, charge, warnings,
      catalogue,
      badges: catalogue.badges,
    };
    App.state.hybridInputs = inputs;
    App.state.hybridResult = result;
    _renderResults(container, result);
    App.toast('Hybrid sizing completed', 'success');
  }

  function _evaluateUtilitySubmission(inputs, profile, inverterModel) {
    const applicable = inputs.exportMode === 'export';
    if (!applicable) {
      return {
        applicable: false,
        checks: [],
        missingDocuments: [],
        gateBlockers: [],
        blockers: [],
        strictPass: true,
        docProvided: 0,
        docTotal: UTILITY_SUBMISSION_DOCS.length,
      };
    }

    const checks = [];
    const missingDocuments = [];
    UTILITY_SUBMISSION_DOCS.forEach(item => {
      const ok = inputs[item.key] === true;
      if (!ok) missingDocuments.push(item.label);
      checks.push({
        check: `Submission document: ${item.label}`,
        value: ok ? 'Provided' : 'Missing',
        target: 'Provided',
        status: ok ? 'pass' : 'fail',
        note: item.note,
        source: 'CEB/LECO workflow'
      });
    });

    const gateBlockers = [];
    UTILITY_SUBMISSION_GATES.forEach(item => {
      const ok = inputs[item.key] === true;
      if (!ok) gateBlockers.push(item.blocker || `${item.label} is not confirmed.`);
      checks.push({
        check: `Submission gate: ${item.label}`,
        value: ok ? 'Confirmed' : 'Not confirmed',
        target: 'Confirmed before export enablement',
        status: ok ? 'pass' : 'fail',
        note: item.note,
        source: 'CEB/LECO workflow'
      });
    });

    if (!profile.exportEnabled) {
      gateBlockers.push('Selected utility profile is not export-enabled for grid export.');
    }
    if (!inverterModel) {
      gateBlockers.push('Inverter model selection is required for utility submission and approval checks.');
    }

    const blockers = [
      ...missingDocuments.map(label => `Missing required document: ${label}`),
      ...gateBlockers
    ];
    const strictPass = blockers.length === 0;
    const docProvided = UTILITY_SUBMISSION_DOCS.length - missingDocuments.length;

    checks.push({
      check: 'Utility submission strict release gate',
      value: strictPass ? 'PASS' : 'FAIL',
      target: `${UTILITY_SUBMISSION_DOCS.length}/${UTILITY_SUBMISSION_DOCS.length} required docs + all gates confirmed`,
      status: strictPass ? 'pass' : 'fail',
      note: strictPass
        ? 'Submission package is complete for utility export release workflow.'
        : 'Resolve missing documents/blockers before enabling export.',
      source: 'CEB/LECO workflow'
    });

    return {
      applicable: true,
      checks,
      missingDocuments,
      gateBlockers,
      blockers,
      strictPass,
      docProvided,
      docTotal: UTILITY_SUBMISSION_DOCS.length,
    };
  }

  function _statusByLimit(actual, limit, warnMargin) {
    const margin = Number.isFinite(warnMargin) ? warnMargin : 0.10;
    if (!Number.isFinite(actual) || !Number.isFinite(limit) || limit <= 0) return 'warn';
    if (actual <= limit) return 'pass';
    if (actual <= limit * (1 + margin)) return 'warn';
    return 'fail';
  }

  function _evaluateCatalogueChecks(inputs, base) {
    const checks = [];
    const inverterModel = _getInverter(inputs.inverterModelId);
    const batteryModel = _getBattery(inputs.batteryModelId);
    const panelModel = _getPanel(inputs.panelId);
    const profile = _profileById(inputs.utilityProfile);
    const utilitySubmission = _evaluateUtilitySubmission(inputs, profile, inverterModel);

    const reqContDischargeA = (base.inverter.requiredContinuous_kW * 1000) / Math.max(inputs.batteryVoltage_V * Math.max(inputs.etaInv, 0.1), 1);
    const reqSurgeDischargeA = (base.inverter.requiredSurge_kW * 1000) / Math.max(inputs.batteryVoltage_V * Math.max(inputs.etaInv, 0.1), 1);

    function add(check, value, target, status, note, source) {
      checks.push({
        check,
        value: String(value ?? ''),
        target: String(target ?? ''),
        status: status === 'pass' || status === 'warn' || status === 'fail' ? status : 'warn',
        note: String(note || ''),
        source: String(source || 'Catalogue')
      });
    }

    if (inverterModel) {
      add(
        'Inverter AC continuous capability',
        `${base.inverter.requiredContinuous_kW.toFixed(2)} kW`,
        `<= ${inverterModel.acRated_kW.toFixed(2)} kW (${inverterModel.manufacturer} ${inverterModel.model})`,
        _statusByLimit(base.inverter.requiredContinuous_kW, inverterModel.acRated_kW, 0.05),
        'Continuous load must remain within inverter AC rating.',
        'Inverter datasheet'
      );
      const surgePowerState = _statusByLimit(base.inverter.requiredSurge_kW, inverterModel.surge_kW, 0.05);
      const surgeTimeState = _statusByLimit(inputs.surgeDuration_s, inverterModel.surge_s, 0);
      const surgeState = surgePowerState === 'fail' || surgeTimeState === 'fail'
        ? 'fail'
        : (surgePowerState === 'warn' || surgeTimeState === 'warn' ? 'warn' : 'pass');
      add(
        'Inverter surge capability',
        `${base.inverter.requiredSurge_kW.toFixed(2)} kW for ${inputs.surgeDuration_s.toFixed(1)} s`,
        `<= ${inverterModel.surge_kW.toFixed(2)} kW for ${inverterModel.surge_s.toFixed(1)} s`,
        surgeState,
        'Surge power and duration must both be met.',
        'Inverter datasheet'
      );
      add(
        'Inverter charge current limit',
        `${base.charge.current_A.toFixed(1)} A`,
        `<= ${inverterModel.maxCharge_A.toFixed(1)} A`,
        _statusByLimit(base.charge.current_A, inverterModel.maxCharge_A, 0.05),
        'PV charge current estimate compared with inverter charger limit.',
        'Inverter datasheet'
      );
      add(
        'Inverter battery discharge current limit',
        `${reqContDischargeA.toFixed(1)} A`,
        `<= ${inverterModel.maxDischarge_A.toFixed(1)} A`,
        _statusByLimit(reqContDischargeA, inverterModel.maxDischarge_A, 0.05),
        'Continuous battery-side current implied by inverter output.',
        'Inverter datasheet'
      );
      const busMismatch = Math.abs(inputs.batteryVoltage_V - inverterModel.batteryBus_V);
      add(
        'Inverter vs design battery bus',
        `${inputs.batteryVoltage_V.toFixed(0)} V`,
        `${inverterModel.batteryBus_V.toFixed(0)} V nominal`,
        busMismatch <= 4 ? 'pass' : (busMismatch <= 8 ? 'warn' : 'fail'),
        'Large voltage mismatch usually indicates incompatible inverter battery class.',
        'Inverter datasheet'
      );
    } else {
      add(
        'Inverter model selection',
        'Not selected',
        'Select inverter to enforce AC/surge/charger/MPPT hard limits',
        'warn',
        'Without selected inverter this result remains heuristic.',
        'Workflow'
      );
    }

    if (batteryModel) {
      const moduleNominal_kWh = (batteryModel.nominalV * batteryModel.capacityAh) / 1000;
      const installedNominal_kWh = moduleNominal_kWh * inputs.batteryParallel;
      const installedUsable_kWh = installedNominal_kWh * Math.min(inputs.dod, batteryModel.recommendedDod);
      const chargeLimit_A = batteryModel.continuousCharge_A * inputs.batteryParallel;
      const dischargeLimit_A = batteryModel.continuousDischarge_A * inputs.batteryParallel;
      const peakLimit_A = batteryModel.peakDischarge_A * inputs.batteryParallel;
      const chemistryState = batteryModel.chemistry === inputs.chemistry ? 'pass' : 'warn';
      const batBusDelta = Math.abs(inputs.batteryVoltage_V - batteryModel.nominalV);
      const peakState = (reqSurgeDischargeA <= peakLimit_A && inputs.surgeDuration_s <= batteryModel.peakDuration_s)
        ? 'pass'
        : ((reqSurgeDischargeA <= peakLimit_A * 1.05 && inputs.surgeDuration_s <= batteryModel.peakDuration_s * 1.2) ? 'warn' : 'fail');

      add(
        'Battery nominal energy (selected modules)',
        `${installedNominal_kWh.toFixed(2)} kWh (${inputs.batteryParallel} parallel)`,
        `>= ${base.battery.requiredNominal_kWh.toFixed(2)} kWh`,
        installedNominal_kWh >= base.battery.requiredNominal_kWh ? 'pass' : (installedNominal_kWh >= base.battery.requiredNominal_kWh * 0.9 ? 'warn' : 'fail'),
        'Installed nominal battery energy should cover computed nominal requirement.',
        'Battery datasheet'
      );
      add(
        'Battery usable energy at configured DoD',
        `${installedUsable_kWh.toFixed(2)} kWh`,
        `>= ${base.battery.requiredUsable_kWh.toFixed(2)} kWh`,
        installedUsable_kWh >= base.battery.requiredUsable_kWh ? 'pass' : (installedUsable_kWh >= base.battery.requiredUsable_kWh * 0.9 ? 'warn' : 'fail'),
        'Uses selected battery module and configured design DoD.',
        'Battery datasheet'
      );
      add(
        'Battery continuous charge current',
        `${base.charge.current_A.toFixed(1)} A`,
        `<= ${chargeLimit_A.toFixed(1)} A`,
        _statusByLimit(base.charge.current_A, chargeLimit_A, 0.05),
        'Charge current should respect BMS and battery continuous rating.',
        'Battery datasheet'
      );
      add(
        'Battery continuous discharge current',
        `${reqContDischargeA.toFixed(1)} A`,
        `<= ${dischargeLimit_A.toFixed(1)} A`,
        _statusByLimit(reqContDischargeA, dischargeLimit_A, 0.05),
        'Continuous inverter demand translated to battery current.',
        'Battery datasheet'
      );
      add(
        'Battery peak/BMS discharge current',
        `${reqSurgeDischargeA.toFixed(1)} A for ${inputs.surgeDuration_s.toFixed(1)} s`,
        `<= ${peakLimit_A.toFixed(1)} A for ${batteryModel.peakDuration_s.toFixed(1)} s`,
        peakState,
        'Peak current and peak duration must both remain within battery/BMS limits.',
        'Battery datasheet'
      );
      add(
        'Battery chemistry profile match',
        `${batteryModel.chemistry} battery with ${inputs.chemistry} design profile`,
        'Prefer chemistry-specific design profile',
        chemistryState,
        'Mismatch does not always fail but requires manual review.',
        'Design practice'
      );
      add(
        'Battery nominal voltage match',
        `${inputs.batteryVoltage_V.toFixed(0)} V design`,
        `${batteryModel.nominalV.toFixed(1)} V battery`,
        batBusDelta <= 4 ? 'pass' : (batBusDelta <= 8 ? 'warn' : 'fail'),
        'Large mismatch indicates wrong battery class or bus selection.',
        'Battery datasheet'
      );
    } else {
      add(
        'Battery model selection',
        'Not selected',
        'Select battery to enforce BMS current/energy limits',
        'warn',
        'Without selected battery, Ah and C-rate checks are heuristic only.',
        'Workflow'
      );
    }

    if (inverterModel && panelModel && inputs.modulesPerString > 0 && inputs.stringsPerMppt > 0) {
      if (inverterModel.mpptCount > 0 && inverterModel.maxDcVoc_V > 0) {
        const coeffVmp = Number.isFinite(panelModel.coeffVmp) ? panelModel.coeffVmp : panelModel.coeffVoc;
        const stringVocCold = PVCalc.vocAtTemp(panelModel.Voc, panelModel.coeffVoc, inputs.siteTmin_C) * inputs.modulesPerString;
        const stringVmpHot = PVCalc.vmpAtTemp(panelModel.Vmp, coeffVmp, inputs.cellTmax_C) * inputs.modulesPerString;
        const stringVmpCold = PVCalc.vmpAtTemp(panelModel.Vmp, coeffVmp, inputs.siteTmin_C) * inputs.modulesPerString;
        const mpptIscHot = PVCalc.iscAtTemp(panelModel.Isc, panelModel.coeffIsc, inputs.cellTmax_C) * inputs.stringsPerMppt;
        const pvByString_kWp = (panelModel.Pmax * inputs.modulesPerString * inputs.stringsPerMppt * inverterModel.mpptCount) / 1000;

        add(
          'String Voc at Tmin',
          `${stringVocCold.toFixed(1)} V`,
          `<= ${inverterModel.maxDcVoc_V.toFixed(1)} V`,
          _statusByLimit(stringVocCold, inverterModel.maxDcVoc_V, 0.02),
          'Protect inverter DC input from over-voltage at cold temperature.',
          'Panel + inverter datasheet'
        );
        add(
          'String Vmp at Tmax (MPPT min)',
          `${stringVmpHot.toFixed(1)} V`,
          `>= ${inverterModel.mpptMin_V.toFixed(1)} V`,
          stringVmpHot >= inverterModel.mpptMin_V ? 'pass' : (stringVmpHot >= inverterModel.mpptMin_V * 0.95 ? 'warn' : 'fail'),
          'Maintain MPPT tracking at high cell temperature.',
          'Panel + inverter datasheet'
        );
        add(
          'String Vmp at Tmin (MPPT max)',
          `${stringVmpCold.toFixed(1)} V`,
          `<= ${inverterModel.mpptMax_V.toFixed(1)} V`,
          _statusByLimit(stringVmpCold, inverterModel.mpptMax_V, 0.02),
          'Keep operating voltage within MPPT tracking range.',
          'Panel + inverter datasheet'
        );
        add(
          'MPPT input current',
          `${mpptIscHot.toFixed(2)} A`,
          `<= ${inverterModel.maxCurrentPerMppt_A.toFixed(2)} A`,
          _statusByLimit(mpptIscHot, inverterModel.maxCurrentPerMppt_A, 0.02),
          'Per-MPPT short-circuit current limit check.',
          'Panel + inverter datasheet'
        );
        if (inverterModel.maxPv_kW > 0) {
          add(
            'PV DC size against inverter PV limit',
            `${pvByString_kWp.toFixed(2)} kWp`,
            `<= ${inverterModel.maxPv_kW.toFixed(2)} kWp`,
            _statusByLimit(pvByString_kWp, inverterModel.maxPv_kW, 0.05),
            'Approximate DC size from selected panel/string layout.',
            'Panel + inverter datasheet'
          );
        }
      } else {
        add(
          'MPPT checks availability',
          `${inverterModel.manufacturer} ${inverterModel.model}`,
          'Inverter with explicit MPPT/DC input limits',
          'warn',
          'Selected inverter profile does not include direct MPPT limits (external MPPT architecture).',
          'Inverter datasheet'
        );
      }
    } else if (inverterModel && panelModel) {
      add(
        'MPPT check inputs',
        `Modules/string=${inputs.modulesPerString}, strings/MPPT=${inputs.stringsPerMppt}`,
        'Enter modules/string and strings/MPPT for MPPT limit checks',
        'warn',
        'Panel selected but string configuration incomplete.',
        'Workflow'
      );
    } else {
      add(
        'MPPT checks',
        'Panel or inverter not selected',
        'Select both panel and inverter for voltage/current window checks',
        'warn',
        'Without both models, MPPT checks remain unavailable.',
        'Workflow'
      );
    }

    if (utilitySubmission.applicable) {
      utilitySubmission.checks.forEach(ch => {
        add(ch.check, ch.value, ch.target, ch.status, ch.note, ch.source);
      });
    }

    let approvalRequired = false;
    if (inputs.exportMode === 'export') {
      add(
        'Utility profile selection',
        profile.label,
        'Export profile required for grid-export hybrid',
        profile.exportEnabled ? 'pass' : 'fail',
        'Profile should be export-enabled when export mode is selected.',
        'PUCSL/CEB/LECO practice'
      );
      if (inverterModel) {
        const supportsProfile = (inverterModel.supportedProfiles || []).includes(profile.id);
        add(
          'Inverter profile compatibility',
          `${inverterModel.manufacturer} ${inverterModel.model}`,
          `${profile.label} supported`,
          supportsProfile ? 'pass' : 'fail',
          'Submitted and commissioned inverter setting profile must match.',
          'Utility workflow'
        );
        const isListed = !!(inverterModel.utilityListed && inverterModel.utilityListed[profile.id] === true);
        const listingRef = inverterModel.listingSource && inverterModel.listingSource[profile.id]
          ? inverterModel.listingSource[profile.id]
          : 'No listing reference in imported utility list';
        const utilityState = isListed ? 'pass' : 'fail';
        approvalRequired = utilityState !== 'pass';
        add(
          'Utility approval listing status',
          isListed ? 'Listed' : 'Not listed',
          'Listed/approved model for chosen utility process',
          utilityState,
          `Strict check against imported utility list. ${listingRef}`,
          'Utility workflow'
        );
      } else {
        approvalRequired = true;
        add(
          'Utility approval readiness',
          'No inverter selected',
          'Select inverter and verify approval profile',
          'fail',
          'Export-enabled workflow cannot be completed without inverter selection.',
          'Utility workflow'
        );
      }
    } else if (inputs.utilityProfile !== 'offgrid') {
      add(
        'Utility profile in no-export mode',
        profile.label,
        'Off-grid/no-export profile',
        'warn',
        'No-export mode is usually documented with off-grid/zero-export profile.',
        'Workflow'
      );
    }
    if (utilitySubmission.applicable && !utilitySubmission.strictPass) approvalRequired = true;

    const summary = checks.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, { pass: 0, warn: 0, fail: 0 });

    const badges = [];
    const pushBadge = (name) => { if (!badges.includes(name)) badges.push(name); };
    if (inverterModel || batteryModel || panelModel) pushBadge('Catalogue-backed');
    else pushBadge('Heuristic');
    if (
      (panelModel && panelModel.datasheetUrl) ||
      (inverterModel && inverterModel.datasheetRev) ||
      (batteryModel && batteryModel.datasheetRev)
    ) {
      pushBadge('Datasheet-backed');
    }
    if (inputs.exportMode === 'export' && (approvalRequired || summary.fail > 0)) {
      pushBadge('Approval required');
    }
    if (!badges.length) pushBadge('Heuristic');

    return {
      inverterModel,
      batteryModel,
      panelModel,
      profile,
      checks,
      summary,
      approvalRequired,
      utilitySubmission,
      badges,
      metrics: {
        reqContDischargeA,
        reqSurgeDischargeA,
      },
    };
  }

  function _utilityGateFailureText(us) {
    if (!us || !us.applicable) return '';
    const parts = [];
    if (Array.isArray(us.missingDocuments) && us.missingDocuments.length) {
      parts.push(`Missing documents: ${us.missingDocuments.join('; ')}`);
    }
    if (Array.isArray(us.gateBlockers) && us.gateBlockers.length) {
      parts.push(`Gate blockers: ${us.gateBlockers.join('; ')}`);
    }
    if (!parts.length && Array.isArray(us.blockers) && us.blockers.length) {
      parts.push(`Blockers: ${us.blockers.join('; ')}`);
    }
    return parts.join(' | ');
  }

  function _composeProjectPackContext(sourceResult) {
    const base = sourceResult || (typeof App !== 'undefined' && App && App.state ? App.state.hybridResult : null);
    if (!base) {
      return {
        ok: false,
        error: 'Run Hybrid Setup calculation first to generate design outputs before exporting final package.',
      };
    }

    const stateInputs = (typeof App !== 'undefined' && App && App.state) ? (App.state.hybridInputs || {}) : {};
    const inputs = _normalizeHybridInputState({ ...(base.inputs || {}), ...stateInputs });
    const profile = _profileById(inputs.utilityProfile);
    const inverterModel = _getInverter(inputs.inverterModelId);
    const us = _evaluateUtilitySubmission(inputs, profile, inverterModel);

    const catBase = base.catalogue && typeof base.catalogue === 'object'
      ? base.catalogue
      : { checks: [], summary: { pass: 0, warn: 0, fail: 0 } };
    const catalogue = {
      ...catBase,
      profile,
      utilitySubmission: us,
    };

    const result = {
      ...base,
      inputs,
      catalogue,
    };

    return {
      ok: true,
      result,
      utilitySubmission: us,
      canRelease: !us.applicable || us.strictPass === true,
      gateReason: _utilityGateFailureText(us),
    };
  }

  async function _attemptFinalProjectPackExport(format, sourceResult) {
    const ctx = _composeProjectPackContext(sourceResult);
    if (!ctx.ok) {
      App.toast(ctx.error, 'warning');
      return { ok: false, error: ctx.error };
    }

    const us = ctx.utilitySubmission || {};
    if (us.applicable && !us.strictPass) {
      const reason = ctx.gateReason || 'Utility submission strict gate is FAIL.';
      App.toast(`Final export blocked: ${reason}`, 'error');
      return { ok: false, blocked: true, error: reason };
    }

    if (format === 'print') _printProjectPack(ctx.result);
    else if (format === 'pdf') _exportProjectPackPDF(ctx.result);
    else if (format === 'docx') await _exportProjectPackDOCX(ctx.result);
    else if (format === 'zip') await _exportProjectPackBundleZIP(ctx.result);
    else if (format === 'json') _exportProjectPackJSON(ctx.result);
    else {
      const err = `Unknown final package format: ${String(format || '')}`;
      App.toast(err, 'error');
      return { ok: false, error: err };
    }
    return { ok: true };
  }

  function _renderResults(container, r) {
    const out = container.querySelector('#hy-results');
    out.classList.remove('hidden');
    const packGate = _composeProjectPackContext(r);
    const packBlocked = !!(packGate.ok && packGate.utilitySubmission && packGate.utilitySubmission.applicable && !packGate.utilitySubmission.strictPass);
    const packBlockHint = packBlocked
      ? _utilityGateFailureText(packGate.utilitySubmission) || 'Utility submission strict gate must be PASS before final export package generation.'
      : '';
    const summary = _summaryText(r);
    const warnings = Array.isArray(r.warnings) ? r.warnings : [];
    const warningHtml = warnings.length ? `<div class="card">${warnings.map(w => `<div class="warn-box">${_esc(w)}</div>`).join('')}</div>` : '';
    const badgeHtml = (r.badges || []).length ? `<div class="info-box" style="margin-bottom:10px">${(r.badges || []).map(b => _badgeChip(b, b === 'Approval required' ? 'badge-fail' : (b === 'Heuristic' ? 'badge-warn' : 'badge-pass'))).join('')}</div>` : '';
    const packGateHtml = packBlocked
      ? `<div class="warn-box" style="margin-top:8px"><strong>Final package export blocked:</strong> ${_esc(packBlockHint)}</div>`
      : '';
    const catalogueCard = _catalogueChecksCard(r);
    const utilityCard = _utilitySubmissionCard(r);
    out.innerHTML = `
      <div class="card">
        <div class="card-title">Sizing Summary (${_esc(r.date)})</div>
        ${badgeHtml}
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
          <button class="btn btn-secondary btn-sm" id="hy-pack-print-btn" ${packBlocked ? 'disabled' : ''}>Print Project Pack</button>
          <button class="btn btn-secondary btn-sm" id="hy-pack-pdf-btn" ${packBlocked ? 'disabled' : ''}>Export Project Pack PDF</button>
          <button class="btn btn-secondary btn-sm" id="hy-pack-docx-btn" ${packBlocked ? 'disabled' : ''}>Export Project Pack DOCX</button>
          <button class="btn btn-secondary btn-sm" id="hy-pack-zip-btn" ${packBlocked ? 'disabled' : ''}>Export Project Pack ZIP</button>
          <button class="btn btn-secondary btn-sm" id="hy-pack-json-btn" ${packBlocked ? 'disabled' : ''}>Export Project Pack JSON</button>
        </div>
        ${packGateHtml}
      </div>
      ${catalogueCard}
      ${utilityCard}
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

    const packPrintBtn = out.querySelector('#hy-pack-print-btn');
    if (packPrintBtn) packPrintBtn.addEventListener('click', () => { void _attemptFinalProjectPackExport('print', r); });

    const packPdfBtn = out.querySelector('#hy-pack-pdf-btn');
    if (packPdfBtn) packPdfBtn.addEventListener('click', () => { void _attemptFinalProjectPackExport('pdf', r); });

    const packDocxBtn = out.querySelector('#hy-pack-docx-btn');
    if (packDocxBtn) packDocxBtn.addEventListener('click', () => { void _attemptFinalProjectPackExport('docx', r); });

    const packZipBtn = out.querySelector('#hy-pack-zip-btn');
    if (packZipBtn) packZipBtn.addEventListener('click', () => { void _attemptFinalProjectPackExport('zip', r); });

    const packJsonBtn = out.querySelector('#hy-pack-json-btn');
    if (packJsonBtn) packJsonBtn.addEventListener('click', () => { void _attemptFinalProjectPackExport('json', r); });

    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _summaryText(r) {
    const cat = r.catalogue || {};
    const us = cat.utilitySubmission || {};
    const inv = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const bat = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const pan = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
    const pass = cat.summary ? cat.summary.pass : 0;
    const warn = cat.summary ? cat.summary.warn : 0;
    const fail = cat.summary ? cat.summary.fail : 0;
    const utilityGate = us.applicable
      ? `${us.strictPass ? 'PASS' : 'FAIL'} (${us.docProvided || 0}/${us.docTotal || 0} docs, ${(us.blockers || []).length} blockers)`
      : 'N/A (no-export mode)';
    return [
      `Hybrid Setup Summary (${r.date})`,
      `Chemistry: ${r.chemistryLabel}`,
      `Badges: ${(r.badges || ['Heuristic']).join(', ')}`,
      `Battery nominal: ${r.battery.requiredNominal_kWh.toFixed(2)} kWh`,
      `Battery equivalent: ${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V}V`,
      `PV recommended: ${r.pv.recommended_kWp.toFixed(2)} kWp`,
      `Inverter continuous: ${r.inverter.requiredContinuous_kW.toFixed(2)} kW`,
      `Inverter surge: ${r.inverter.requiredSurge_kW.toFixed(2)} kW`,
      `Charge current: ${r.charge.current_A.toFixed(1)} A`,
      `Selected inverter: ${inv}`,
      `Selected battery: ${bat}`,
      `Selected panel: ${pan}`,
      `Catalogue checks: PASS ${pass}, CHECK ${warn}, FAIL ${fail}`,
      `Utility submission gate: ${utilityGate}`,
      '',
      'References: IEC 60364-7-712:2025, IEC 62109, IEC 62446-1:2016+AMD1:2018, IEC 61427-1/-2, IEC 62619:2022, SLS 1522, PUCSL, SLS 1543, SLS 1547, CEB inverter settings (2025-02-25), CEB Grid Connection Code (2024)'
    ].join('\n');
  }

  function _box(value, label) { return `<div class="result-box"><div class="result-value">${_esc(value)}</div><div class="result-label">${_esc(label)}</div></div>`; }

  function _catalogueChecksCard(r) {
    const cat = r.catalogue;
    if (!cat || !Array.isArray(cat.checks) || !cat.checks.length) return '';
    const rows = cat.checks.map(ch => `
      <tr>
        <td><strong>${_esc(ch.check)}</strong></td>
        <td>${_esc(ch.value)}</td>
        <td>${_esc(ch.target)}</td>
        <td>${_statusBadge(ch.status)}</td>
        <td>${_esc(ch.note)}</td>
      </tr>
    `).join('');
    const sum = cat.summary || { pass: 0, warn: 0, fail: 0 };
    return `
      <div class="card" style="margin-top:8px">
        <div class="card-title">Catalogue and Compliance Checks</div>
        <div class="info-box">
          PASS ${sum.pass || 0} | CHECK ${sum.warn || 0} | FAIL ${sum.fail || 0}
          ${(cat.profile && cat.profile.id !== 'offgrid') ? ` | Profile: ${_esc(cat.profile.label)}` : ''}
        </div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead><tr><th>Check</th><th>Current</th><th>Limit / Target</th><th>Status</th><th>Engineering Note</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function _utilitySubmissionCard(r) {
    const cat = r.catalogue || {};
    const us = cat.utilitySubmission;
    if (!us || !us.applicable) {
      return `
        <div class="card" style="margin-top:8px">
          <div class="card-title">Utility Submission Validator</div>
          <div class="info-box">Not active for this run because export mode is OFF.</div>
        </div>
      `;
    }
    const rows = (us.checks || []).map(ch => `
      <tr>
        <td><strong>${_esc(ch.check)}</strong></td>
        <td>${_esc(ch.value)}</td>
        <td>${_esc(ch.target)}</td>
        <td>${_statusBadge(ch.status)}</td>
        <td>${_esc(ch.note)}</td>
      </tr>
    `).join('');
    const missing = Array.isArray(us.missingDocuments) ? us.missingDocuments : [];
    const blockers = Array.isArray(us.blockers) ? us.blockers : [];
    const missingHtml = missing.length
      ? `<div class="warn-box"><strong>Missing Required Documents:</strong> ${_esc(missing.join(' | '))}</div>`
      : '<div class="info-box">All required documents are marked as provided.</div>';
    const blockerHtml = blockers.length
      ? `<div class="warn-box"><strong>Blocking Conditions:</strong> ${_esc(blockers.join(' | '))}</div>`
      : '<div class="info-box">No submission blockers detected.</div>';
    const gateBadge = us.strictPass ? _statusBadge('pass') : _statusBadge('fail');
    return `
      <div class="card" style="margin-top:8px">
        <div class="card-title">Utility Submission Validator</div>
        <div class="info-box">
          Strict export gate: ${gateBadge}
          <span style="margin-left:8px">Documents ${_esc(us.docProvided || 0)}/${_esc(us.docTotal || 0)}</span>
        </div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead><tr><th>Requirement</th><th>Current</th><th>Target</th><th>Status</th><th>Engineering Note</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${missingHtml}
        ${blockerHtml}
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
    const batteryParallel = Math.max(1, Math.round(_num(i.batteryParallel, 1)));
    const surgeDuration_s = _num(i.surgeDuration_s, 5);
    const siteTmin_C = _num(i.siteTmin_C, 10);
    const cellTmax_C = _num(i.cellTmax_C, 70);
    const exportMode = i.exportMode === 'export' ? 'export' : 'no_export';
    const cat = r.catalogue || { checks: [], summary: { pass: 0, warn: 0, fail: 0 } };
    const invName = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const batName = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const panName = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
    const utilitySubmission = cat.utilitySubmission || {
      applicable: false,
      checks: [],
      missingDocuments: [],
      gateBlockers: [],
      blockers: [],
      strictPass: true,
      docProvided: 0,
      docTotal: UTILITY_SUBMISSION_DOCS.length,
    };
    const utilityGate = utilitySubmission.applicable
      ? (utilitySubmission.strictPass ? 'PASS' : 'FAIL')
      : 'N/A (no-export mode)';
    const utilityRows = utilitySubmission.applicable
      ? (utilitySubmission.checks || []).map(ch => [ch.check, ch.value, ch.target, String(ch.status || '').toUpperCase(), ch.note || ''])
      : [['Utility submission validator', 'N/A', 'Export mode required', 'N/A', 'No-export workflow selected.']];
    const utilityStatusRows = utilitySubmission.applicable
      ? [
          ['Missing required documents', utilitySubmission.missingDocuments.length ? utilitySubmission.missingDocuments.join('; ') : 'None'],
          ['Submission blockers', utilitySubmission.blockers.length ? utilitySubmission.blockers.join('; ') : 'None'],
          ['Strict export gate', utilityGate]
        ]
      : [
          ['Missing required documents', 'Not applicable'],
          ['Submission blockers', 'Not applicable'],
          ['Strict export gate', utilityGate]
        ];

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
    cat.checks.forEach(ch => {
      checks.push({
        check: ch.check,
        value: ch.value,
        target: ch.target,
        status: ch.status,
        note: `${ch.note}${ch.source ? ` (${ch.source})` : ''}`
      });
    });

    const assumptions = [
      ['Result badges', (r.badges || []).join(', '), 'Classification of calculation evidence and approval status.'],
      ['Inverter model', invName, 'Used for AC/surge, battery current, and MPPT checks.'],
      ['Battery model', batName, 'Used for usable kWh and BMS current checks.'],
      ['Panel model for MPPT checks', panName, 'Used for string voltage/current checks.'],
      ['Battery parallel strings', `${batteryParallel} string(s)`, 'Multiplier applied to battery kWh and current limits.'],
      ['Surge duration requirement', `${surgeDuration_s.toFixed(1)} s`, 'Compared against inverter and battery peak-duration limits.'],
      ['Export mode', exportMode === 'export' ? 'Export enabled' : 'No export', 'Determines utility approval check path.'],
      ['Utility profile', cat.profile ? cat.profile.label : 'Off-grid', 'Submitted and commissioned profile match target.'],
      ['Utility submission gate', utilityGate, 'Strict PASS/FAIL blocker gate for export-enabled utility workflow.'],
      ['Utility submission docs', `${utilitySubmission.docProvided || 0}/${utilitySubmission.docTotal || 0}`, 'Required CEB/LECO package document completeness.'],
      ['Utility blocker count', `${(utilitySubmission.blockers || []).length}`, 'Must be zero before export enablement.'],
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
      ['Battery-side discharge current', 'I_discharge = (P_inv x 1000) / (V_batt x eta_inv)'],
      ['Charge C-rate estimate', 'C_rate = I_charge / Ah_bank'],
      ['AC/DC ratio', 'ratio = P_inv_AC / P_pv_DC'],
      ['String Voc at Tmin', 'Voc_string = n x Voc_STC x (1 + alphaVoc x (Tmin - 25))'],
      ['String Vmp at Tmax', 'Vmp_string = n x Vmp_STC x (1 + alphaVmp x (Tmax_cell - 25))'],
      ['MPPT Isc at Tmax', 'Isc_mppt = strings_per_mppt x Isc_STC x (1 + alphaIsc x (Tmax_cell - 25))']
    ];

    const workedSteps = [
      ['Battery energy sizing', `E_nom = (${i.dailyEnergy_kWh.toFixed(2)} x ${i.autonomyDays.toFixed(2)} x ${i.reserveFactor.toFixed(2)}) / (${i.dod.toFixed(2)} x ${i.etaBatt.toFixed(2)} x ${i.etaInv.toFixed(2)} x ${i.tempDerate.toFixed(2)}) = ${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
      ['Battery Ah conversion', `Ah = (${r.battery.requiredNominal_kWh.toFixed(2)} x 1000) / ${i.batteryVoltage_V.toFixed(0)} = ${r.batteryAh.toFixed(0)} Ah`],
      ['PV base sizing', `P_dc = ${i.dailyEnergy_kWh.toFixed(2)} / (${i.psh.toFixed(2)} x ${i.systemPR.toFixed(2)}) = ${r.pv.base_kWp.toFixed(2)} kWp`],
      ['PV recommended sizing', `P_dc_rec = ${r.pv.base_kWp.toFixed(2)} x ${i.pvOversize.toFixed(2)} = ${r.pv.recommended_kWp.toFixed(2)} kWp`],
      ['Inverter continuous', `P_cont = ${i.peakLoad_kW.toFixed(2)} x ${i.inverterSafetyFactor.toFixed(2)} = ${r.inverter.requiredContinuous_kW.toFixed(2)} kW`],
      ['Inverter surge', `P_surge = max(${i.surgeLoad_kW.toFixed(2)}, 1.5 x ${r.inverter.requiredContinuous_kW.toFixed(2)}) = ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
      ['Charge current', `I_charge = (${r.pv.recommended_kWp.toFixed(2)} x 1000 / ${i.batteryVoltage_V.toFixed(0)}) x ${i.chargeMargin.toFixed(2)} = ${r.charge.current_A.toFixed(1)} A`],
      ['Continuous discharge current', `I_discharge = (${r.inverter.requiredContinuous_kW.toFixed(2)} x 1000) / (${i.batteryVoltage_V.toFixed(0)} x ${i.etaInv.toFixed(2)}) = ${(cat.metrics && Number.isFinite(cat.metrics.reqContDischargeA)) ? cat.metrics.reqContDischargeA.toFixed(1) : 'n/a'} A`],
      ['Surge discharge current', `I_surge = (${r.inverter.requiredSurge_kW.toFixed(2)} x 1000) / (${i.batteryVoltage_V.toFixed(0)} x ${i.etaInv.toFixed(2)}) = ${(cat.metrics && Number.isFinite(cat.metrics.reqSurgeDischargeA)) ? cat.metrics.reqSurgeDischargeA.toFixed(1) : 'n/a'} A`],
    ];
    if (cat.panelModel && i.modulesPerString > 0 && i.stringsPerMppt > 0 && cat.inverterModel) {
      const panel = cat.panelModel;
      const coeffVmp = Number.isFinite(panel.coeffVmp) ? panel.coeffVmp : panel.coeffVoc;
      const vocCold = PVCalc.vocAtTemp(panel.Voc, panel.coeffVoc, siteTmin_C) * i.modulesPerString;
      const vmpHot = PVCalc.vmpAtTemp(panel.Vmp, coeffVmp, cellTmax_C) * i.modulesPerString;
      const iscHot = PVCalc.iscAtTemp(panel.Isc, panel.coeffIsc, cellTmax_C) * i.stringsPerMppt;
      workedSteps.push(['String Voc at Tmin', `Voc_string = ${panel.Voc.toFixed(2)} x (1 + ${panel.coeffVoc.toFixed(5)} x (${siteTmin_C.toFixed(1)} - 25)) x ${i.modulesPerString} = ${vocCold.toFixed(1)} V`]);
      workedSteps.push(['String Vmp at Tmax', `Vmp_string = ${panel.Vmp.toFixed(2)} x (1 + ${coeffVmp.toFixed(5)} x (${cellTmax_C.toFixed(1)} - 25)) x ${i.modulesPerString} = ${vmpHot.toFixed(1)} V`]);
      workedSteps.push(['MPPT Isc at Tmax', `Isc_mppt = ${panel.Isc.toFixed(2)} x (1 + ${panel.coeffIsc.toFixed(5)} x (${cellTmax_C.toFixed(1)} - 25)) x ${i.stringsPerMppt} = ${iscHot.toFixed(2)} A`]);
    }

    const limitRows = [];
    const calcRows = [];
    const sourceRows = [];
    STANDARDS.forEach(s => {
      (s.limits || []).forEach(l => limitRows.push([s.code, l.p, l.v, l.n]));
      (s.calcs || []).forEach(c => calcRows.push([s.code, c.n, c.f, c.w]));
      (s.sources || []).forEach(src => sourceRows.push([s.code, src.t, src.u, src.n || '']));
    });

    const smartClauses = _selectSmartClauses(r, { acdc, cRate, dodBand });

    return {
      checks,
      assumptions,
      formulaRows,
      workedSteps,
      limitRows,
      calcRows,
      sourceRows,
      smartClauses,
      utilityRows,
      utilityStatusRows,
      utilityGate,
      acdc,
      cRate
    };
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

    if (r.catalogue && r.catalogue.summary && r.catalogue.summary.fail > 0) {
      add('iec62109', `Catalogue hard-limit failures detected (${r.catalogue.summary.fail}); converter and protection limits must be corrected before release.`);
      add('iec60364', 'Hard-limit failures may indicate wiring/current or voltage-window non-compliance.');
    }

    if (r.catalogue && r.catalogue.checks && r.catalogue.checks.some(ch => ch.check.toLowerCase().includes('mppt') && ch.status === 'fail')) {
      add('iec60364', 'MPPT window/current failures detected; string design and inverter matching must be revised.');
      add('sls1522', 'Sri Lanka installation acceptance requires string voltages/currents to stay inside inverter limits.');
    }

    if (r.inputs.exportMode === 'export') {
      add('ceb-leco', 'Export-enabled design path selected; utility submission and acceptance gates apply.');
      add('pucsl', 'Grid export requires approved settings profile and interconnection process compliance.');
      if (r.catalogue && r.catalogue.approvalRequired) {
        add('ceb-leco', 'Current configuration still needs explicit utility approval confirmation before export enablement.');
      }
      const us = r.catalogue && r.catalogue.utilitySubmission ? r.catalogue.utilitySubmission : null;
      if (us && !us.strictPass) {
        if (Array.isArray(us.missingDocuments) && us.missingDocuments.length) {
          add('ceb-leco', `Utility submission documents missing: ${us.missingDocuments.join(', ')}.`);
        }
        if (Array.isArray(us.gateBlockers) && us.gateBlockers.length) {
          add('ceb-leco', `Utility gate blockers present: ${us.gateBlockers.join(', ')}.`);
        }
      }
    } else if (metrics.acdc >= 0.80 && metrics.acdc <= 1.10) {
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

  function _projectPackBaseName(r) {
    return `SolarPV_ProjectPack_${_safePart(r.chemistryLabel, 'Hybrid')}_${_safePart(r.date, 'date')}`;
  }

  function _estimateInstalledModuleCount(r) {
    const cat = r.catalogue || {};
    const panel = cat.panelModel || null;
    const inv = cat.inverterModel || null;
    const i = r.inputs || {};
    const modulesPerString = Math.max(0, Math.round(_num(i.modulesPerString, 0)));
    const stringsPerMppt = Math.max(0, Math.round(_num(i.stringsPerMppt, 0)));
    const mpptCount = Math.max(1, Math.round(_num(inv && inv.mpptCount, 1)));
    if (modulesPerString > 0 && stringsPerMppt > 0) {
      return modulesPerString * stringsPerMppt * mpptCount;
    }
    if (panel && Number.isFinite(panel.Pmax) && panel.Pmax > 0) {
      return Math.max(1, Math.ceil((r.pv.recommended_kWp * 1000) / panel.Pmax));
    }
    return 0;
  }

  function _buildProjectPack(r) {
    const cat = r.catalogue || {};
    const i = r.inputs || {};
    const inv = cat.inverterModel || null;
    const bat = cat.batteryModel || null;
    const panel = cat.panelModel || null;
    const profile = cat.profile || _profileById(i.utilityProfile);
    const us = cat.utilitySubmission || {
      applicable: false,
      checks: [],
      missingDocuments: [],
      gateBlockers: [],
      blockers: [],
      strictPass: true,
      docProvided: 0,
      docTotal: UTILITY_SUBMISSION_DOCS.length
    };
    const audit = _standardsAuditMeta();
    const exportedAt = new Date().toISOString();
    const moduleCount = _estimateInstalledModuleCount(r);
    const modulesPerString = Math.max(0, Math.round(_num(i.modulesPerString, 0)));
    const stringsPerMppt = Math.max(0, Math.round(_num(i.stringsPerMppt, 0)));
    const mpptCount = Math.max(1, Math.round(_num(inv && inv.mpptCount, 1)));
    const stringCount = modulesPerString > 0 && stringsPerMppt > 0 ? stringsPerMppt * mpptCount : 0;
    const batteryParallel = Math.max(1, Math.round(_num(i.batteryParallel, 1)));
    const batteryModuleKWh = bat ? (bat.nominalV * bat.capacityAh) / 1000 : 0;
    const batteryInstalledNominal_kWh = batteryModuleKWh > 0 ? batteryModuleKWh * batteryParallel : 0;
    const utilityListed = !!(inv && profile && profile.id !== 'offgrid' && inv.utilityListed && inv.utilityListed[profile.id] === true);
    const utilityListingRef = inv && profile && inv.listingSource && inv.listingSource[profile.id]
      ? String(inv.listingSource[profile.id])
      : '';
    const topology = i.exportMode === 'export' ? 'Grid-Tied Hybrid (Export-Enabled)' : 'Hybrid (No Export / Backup Priority)';

    const summary = {
      date: r.date,
      exportedAt,
      topology,
      chemistry: r.chemistryLabel,
      badges: r.badges || [],
      requiredBatteryNominal_kWh: Number(r.battery.requiredNominal_kWh.toFixed(3)),
      requiredBatteryUsable_kWh: Number(r.battery.requiredUsable_kWh.toFixed(3)),
      batteryEquivalent_Ah: Number(r.batteryAh.toFixed(1)),
      recommendedPv_kWp: Number(r.pv.recommended_kWp.toFixed(3)),
      inverterContinuous_kW: Number(r.inverter.requiredContinuous_kW.toFixed(3)),
      inverterSurge_kW: Number(r.inverter.requiredSurge_kW.toFixed(3)),
      estimatedCharge_A: Number(r.charge.current_A.toFixed(2)),
      utilityProfile: profile ? profile.label : 'Off-grid',
      strictUtilityGate: us.applicable ? (us.strictPass ? 'PASS' : 'FAIL') : 'N/A',
      catalogueSummary: {
        pass: cat.summary && Number.isFinite(cat.summary.pass) ? cat.summary.pass : 0,
        warn: cat.summary && Number.isFinite(cat.summary.warn) ? cat.summary.warn : 0,
        fail: cat.summary && Number.isFinite(cat.summary.fail) ? cat.summary.fail : 0,
      }
    };

    const sld = {
      title: 'Single-Line Diagram (Auto-Generated Pre-Design)',
      topology,
      mermaid: [
        'graph LR',
        `PV["PV Array${moduleCount > 0 ? `\\n~${moduleCount} modules` : ''}"] --> DC["DC Isolator + DC SPD"]`,
        `DC --> INV["Hybrid Inverter${inv ? `\\n${inv.manufacturer} ${inv.model}` : ''}"]`,
        `BAT["Battery Bank${bat ? `\\n${bat.manufacturer} ${bat.model} x${batteryParallel}` : ''}"] --> INV`,
        'INV --> AC["Main AC DB / Essential Loads"]',
        i.exportMode === 'export'
          ? `GRID["${profile && profile.utility ? profile.utility : 'Utility'} Meter / Grid"] <--> AC`
          : 'GRID["Grid (Import Priority / No Export)"] --> AC',
      ].join('\n'),
      notes: [
        'Diagram is a pre-design representation. Final SLD must be project-specific and utility-approved.',
        'Protection, conductor sizes, breaker/fuse coordination, and earthing must be finalized in detailed design.',
      ]
    };

    const bom = [];
    function addBom(item, qty, spec, note, source) {
      bom.push({ item, qty, spec, note, source });
    }
    if (panel) {
      addBom(
        'PV module',
        moduleCount || 'TBD',
        `${panel.manufacturer} ${panel.model} (${panel.Pmax}W, Voc ${panel.Voc}V, Isc ${panel.Isc}A)`,
        moduleCount > 0 ? 'Derived from string layout and selected inverter MPPT count.' : 'Provide string layout to finalize quantity.',
        panel.datasheetRev ? `Panel datasheet (${panel.datasheetRev})` : 'Panel database'
      );
    } else {
      addBom('PV module', 'TBD', 'Model not selected', 'Select module to produce datasheet-backed BOM.', 'Workflow');
    }
    addBom(
      'Hybrid inverter',
      1,
      inv ? `${inv.manufacturer} ${inv.model} (${inv.acRated_kW}kW AC, ${inv.batteryBus_V}V battery bus)` : 'Model not selected',
      inv ? 'Selected model from inverter catalog.' : 'Select inverter model for strict compatibility checks.',
      inv && inv.datasheetRev ? `Inverter datasheet (${inv.datasheetRev})` : 'Inverter catalog'
    );
    if (bat) {
      addBom(
        'Battery module',
        batteryParallel,
        `${bat.manufacturer} ${bat.model} (${bat.nominalV}V, ${bat.capacityAh}Ah, ${batteryModuleKWh.toFixed(2)}kWh/module)`,
        `Installed nominal energy approx. ${batteryInstalledNominal_kWh.toFixed(2)}kWh.`,
        bat.datasheetRev ? `Battery datasheet (${bat.datasheetRev})` : 'Battery catalog'
      );
    } else {
      addBom('Battery module', 'TBD', 'Model not selected', 'Select battery model for BMS-limited current and energy checks.', 'Workflow');
    }
    addBom('DC isolator', 1, 'PV DC rated isolator (voltage/current per final design)', 'Required near inverter/DC interface.', 'IEC 60364-7-712 / SLS 1522');
    addBom('AC isolator', 1, 'AC rated isolator near inverter output', 'Required for safe maintenance and utility access.', 'IEC 60364-7-712 / SLS 1522');
    addBom('DC SPD', 1, 'Type II PV SPD, UC >= 1.2 x cold string Voc', 'Select exact MCOV from final string Voc.', 'SLS 1522 / IEC 61643-32');
    addBom('AC SPD', 1, 'Type II AC SPD at main board/inverter AC interface', 'Coordinate with earthing and board architecture.', 'IEC 60364 / SLS 1522');
    if (stringCount > 1) {
      addBom('String fuses', stringCount, 'PV fuse-links coordinated to string Isc and reverse current', 'Confirm fuse-link class and selectivity in detailed design.', 'IEC 60269-6');
      addBom('PV combiner box', 1, `${stringCount} string inputs (estimated)`, 'Required when strings are paralleled before inverter input.', 'IEC 60364-7-712');
    }
    addBom('Earthing and bonding set', 1, 'Earth electrode, conductors, clamps, bonding links', 'Finalize conductor size with adiabatic and fault-current checks.', 'IEC 60364 / SLS 1522 / IEC 62305');

    const settingsSheet = [
      ['Export mode', i.exportMode === 'export' ? 'Export enabled' : 'No export'],
      ['Utility profile', profile ? profile.label : 'Off-grid'],
      ['Utility voltage window', profile ? profile.voltageWindow : 'N/A'],
      ['Utility frequency window', profile ? profile.frequencyWindow : 'N/A'],
      ['Utility reconnect delay', profile ? `${profile.reconnect_s}s` : 'N/A'],
      ['Inverter model', inv ? `${inv.manufacturer} ${inv.model}` : 'Not selected'],
      ['Utility listing status', i.exportMode === 'export' ? (utilityListed ? 'LISTED' : 'NOT LISTED') : 'N/A'],
      ['Listing reference', utilityListingRef || 'N/A'],
      ['Commissioned settings match submitted settings', i.utilitySettingsMatched ? 'YES' : 'NO'],
      ['Strict utility submission gate', us.applicable ? (us.strictPass ? 'PASS' : 'FAIL') : 'N/A'],
      ['Design battery bus', `${_num(i.batteryVoltage_V, 0).toFixed(0)}V`],
      ['Inverter continuous requirement', `${r.inverter.requiredContinuous_kW.toFixed(2)}kW`],
      ['Inverter surge requirement', `${r.inverter.requiredSurge_kW.toFixed(2)}kW`],
      ['Estimated charge current', `${r.charge.current_A.toFixed(1)}A`],
    ];
    UTILITY_SUBMISSION_ITEMS.forEach(item => {
      settingsSheet.push([`Submission item: ${item.label}`, i[item.key] === true ? 'YES' : 'NO']);
    });

    const complianceChecklist = [];
    function addCompliance(area, requirement, status, evidence, note) {
      complianceChecklist.push({ area, requirement, status, evidence, note });
    }
    addCompliance(
      'Catalogue checks',
      'All critical catalogue checks pass',
      (cat.summary && cat.summary.fail > 0) ? 'FAIL' : ((cat.summary && cat.summary.warn > 0) ? 'CHECK' : 'PASS'),
      `PASS ${cat.summary && cat.summary.pass ? cat.summary.pass : 0} | CHECK ${cat.summary && cat.summary.warn ? cat.summary.warn : 0} | FAIL ${cat.summary && cat.summary.fail ? cat.summary.fail : 0}`,
      'Resolve FAIL items before release.'
    );
    addCompliance(
      'Utility submission',
      'Strict utility gate before export enablement',
      us.applicable ? (us.strictPass ? 'PASS' : 'FAIL') : 'N/A',
      us.applicable
        ? `Docs ${us.docProvided || 0}/${us.docTotal || 0}; blockers ${(us.blockers || []).length}`
        : 'No-export workflow',
      us.applicable && !us.strictPass ? (us.blockers || []).join(' | ') : 'No blockers recorded.'
    );
    (cat.checks || []).forEach(ch => {
      addCompliance(
        'Detailed check',
        ch.check,
        String(ch.status || '').toUpperCase(),
        `${ch.value} vs ${ch.target}`,
        ch.note
      );
    });
    (r.warnings || []).forEach(w => {
      addCompliance('Design warning', 'Engineering warning', 'CHECK', 'Warning generated by calculator', w);
    });

    return {
      format: 'solarpv.project-pack.v1',
      meta: {
        module: 'hybrid',
        generatedAt: exportedAt,
        dateTag: r.date,
        standardsProfileId: audit.profileId,
        standardsProfileLabel: audit.profileLabel,
        standardsRulesVersion: audit.rulesVersion,
      },
      summary,
      sld,
      bom,
      settingsSheet,
      complianceChecklist,
      assumptions: {
        dailyEnergy_kWh: _num(i.dailyEnergy_kWh, 0),
        autonomyDays: _num(i.autonomyDays, 0),
        psh: _num(i.psh, 0),
        systemPR: _num(i.systemPR, 0),
        pvOversize: _num(i.pvOversize, 0),
        inverterSafetyFactor: _num(i.inverterSafetyFactor, 0),
        chargeMargin: _num(i.chargeMargin, 0),
      }
    };
  }

  function _buildProjectPackHTML(r) {
    const pack = _buildProjectPack(r);
    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => `<tr><td><strong>${_esc(k)}</strong></td><td>${_esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</td></tr>`)
      .join('');
    const bomRows = (pack.bom || [])
      .map(row => `<tr><td>${_esc(row.item)}</td><td>${_esc(row.qty)}</td><td>${_esc(row.spec)}</td><td>${_esc(row.note)}</td><td>${_esc(row.source)}</td></tr>`)
      .join('');
    const settingsRows = (pack.settingsSheet || [])
      .map(row => `<tr><td>${_esc(row[0])}</td><td>${_esc(row[1])}</td></tr>`)
      .join('');
    const complianceRows = (pack.complianceChecklist || [])
      .map(row => `<tr><td>${_esc(row.area)}</td><td>${_esc(row.requirement)}</td><td>${_esc(row.status)}</td><td>${_esc(row.evidence)}</td><td>${_esc(row.note)}</td></tr>`)
      .join('');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hybrid Project Pack</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 20px; font-size: 12px; }
    h1,h2 { margin: 0 0 8px 0; }
    h1 { font-size: 20px; color: #b45309; }
    h2 { margin-top: 18px; font-size: 14px; color: #1f2937; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    pre { background: #f8fafc; border: 1px solid #e5e7eb; padding: 10px; white-space: pre-wrap; }
    .meta { color: #4b5563; margin-bottom: 10px; }
    .note { border: 1px solid #fde68a; background: #fffbeb; padding: 8px; margin-top: 8px; color: #92400e; }
  </style>
</head>
<body>
  <h1>Hybrid Project Pack</h1>
  <div class="meta">Generated: ${_esc(pack.meta.generatedAt)} | Date tag: ${_esc(pack.meta.dateTag)} | Rules: ${_esc(pack.meta.standardsRulesVersion)}</div>
  <div class="meta">Standards profile: ${_esc(pack.meta.standardsProfileLabel)} [${_esc(pack.meta.standardsProfileId)}]</div>

  <h2>Summary</h2>
  <table><tr><th>Item</th><th>Value</th></tr>${summaryRows}</table>

  <h2>Auto-Generated Single-Line Diagram (Pre-Design)</h2>
  <pre>${_esc(pack.sld.mermaid)}</pre>
  ${(pack.sld.notes || []).map(n => `<div class="note">${_esc(n)}</div>`).join('')}

  <h2>Bill of Materials (Preliminary)</h2>
  <table>
    <tr><th>Item</th><th>Qty</th><th>Specification</th><th>Design Note</th><th>Source</th></tr>
    ${bomRows}
  </table>

  <h2>Settings Sheet</h2>
  <table><tr><th>Setting</th><th>Value</th></tr>${settingsRows}</table>

  <h2>Compliance Checklist</h2>
  <table>
    <tr><th>Area</th><th>Requirement</th><th>Status</th><th>Evidence</th><th>Action/Note</th></tr>
    ${complianceRows}
  </table>
</body>
</html>`;
  }

  function _printProjectPack(r) {
    const html = _buildProjectPackHTML(r);
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

  function _exportProjectPackJSON(r) {
    const pack = _buildProjectPack(r);
    const filename = `${_projectPackBaseName(r)}.json`;
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    _downloadBlob(filename, blob);
    App.toast(`Project pack JSON saved: ${filename}`, 'success');
  }

  async function _exportProjectPackDOCX(r) {
    if (!window.docx) {
      App.toast('DOCX library not loaded. Check internet connection.', 'error');
      return;
    }
    const pack = _buildProjectPack(r);
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

    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    const bomRows = (pack.bom || [])
      .map(row => [row.item, row.qty, row.spec, row.note, row.source]);
    const settingsRows = (pack.settingsSheet || [])
      .map(row => [row[0], row[1]]);
    const complianceRows = (pack.complianceChecklist || [])
      .map(row => [row.area, row.requirement, row.status, row.evidence, row.note]);
    const sldRows = [
      ['Title', pack.sld && pack.sld.title ? pack.sld.title : 'Single-Line Diagram'],
      ['Topology', pack.sld && pack.sld.topology ? pack.sld.topology : 'N/A'],
      ['Mermaid (pre-design)', pack.sld && pack.sld.mermaid ? pack.sld.mermaid : 'N/A'],
    ];
    const sldNoteRows = (pack.sld && Array.isArray(pack.sld.notes) ? pack.sld.notes : [])
      .map((note, idx) => [`Note ${idx + 1}`, note]);

    const content = [];
    content.push(new Paragraph({
      text: 'Hybrid Project Pack',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT
    }));
    content.push(p(`Generated: ${pack.meta.generatedAt} | Date tag: ${pack.meta.dateTag} | Rules: ${pack.meta.standardsRulesVersion}`));
    content.push(p(`Standards profile: ${pack.meta.standardsProfileLabel} [${pack.meta.standardsProfileId}]`));

    content.push(heading('Summary'));
    content.push(table(['Item', 'Value'], summaryRows));

    content.push(heading('Single-Line Diagram (Pre-Design)'));
    content.push(table(['Field', 'Value'], sldRows));
    if (sldNoteRows.length) {
      content.push(table(['SLD note', 'Detail'], sldNoteRows));
    }

    content.push(heading('Bill of Materials (Preliminary)'));
    content.push(table(['Item', 'Qty', 'Specification', 'Design note', 'Source'], bomRows));

    content.push(heading('Settings Sheet'));
    content.push(table(['Setting', 'Value'], settingsRows));

    content.push(heading('Compliance Checklist'));
    content.push(table(['Area', 'Requirement', 'Status', 'Evidence', 'Action/Note'], complianceRows));

    content.push(p('Project-pack note: this output is pre-design guidance and must be finalized with project drawings, protection coordination, and utility-approved documentation.'));

    const doc = new Document({ sections: [{ children: content }] });
    const blob = await Packer.toBlob(doc);
    const filename = `${_projectPackBaseName(r)}.docx`;
    _downloadBlob(filename, blob);
    App.toast(`Project pack DOCX saved: ${filename}`, 'success');
  }

  function _exportProjectPackPDF(r) {
    if (!window.jspdf) {
      App.toast('PDF library not loaded. Check internet connection.', 'error');
      return;
    }
    const pack = _buildProjectPack(r);
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    const pageW = 210;
    let y = 14;

    const autoTable = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null;
    if (!autoTable) {
      App.toast('PDF table plugin not loaded. Refresh and retry.', 'error');
      return;
    }

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

    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, pageW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Hybrid Project Pack', margin, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SolarPV Field Tool', pageW - margin, 10, { align: 'right' });

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(8.5);
    doc.text(`Generated: ${pack.meta.generatedAt} | Date tag: ${pack.meta.dateTag} | Rules: ${pack.meta.standardsRulesVersion}`, margin, 22);
    const profileLine = `Standards profile: ${pack.meta.standardsProfileLabel} [${pack.meta.standardsProfileId}]`;
    const profileLines = doc.splitTextToSize(profileLine, pageW - (margin * 2));
    doc.text(profileLines, margin, 26);
    y = 26 + (profileLines.length * 4) + 1;

    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    const sldRows = [
      ['Title', pack.sld && pack.sld.title ? pack.sld.title : 'Single-Line Diagram'],
      ['Topology', pack.sld && pack.sld.topology ? pack.sld.topology : 'N/A'],
      ['Mermaid (pre-design)', pack.sld && pack.sld.mermaid ? pack.sld.mermaid : 'N/A'],
    ];
    const sldNoteRows = (pack.sld && Array.isArray(pack.sld.notes) ? pack.sld.notes : [])
      .map((note, idx) => [`Note ${idx + 1}`, note]);
    const bomRows = (pack.bom || [])
      .map(row => [row.item, String(row.qty ?? ''), row.spec, row.note, row.source]);
    const settingsRows = (pack.settingsSheet || [])
      .map(row => [String(row[0] ?? ''), String(row[1] ?? '')]);
    const complianceRows = (pack.complianceChecklist || [])
      .map(row => [row.area, row.requirement, row.status, row.evidence, row.note]);

    section('Summary');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Item', 'Value']],
      body: summaryRows,
      styles: { fontSize: 7.2, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Single-Line Diagram (Pre-Design)');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Field', 'Value']],
      body: sldRows,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;
    if (sldNoteRows.length) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['SLD note', 'Detail']],
        body: sldNoteRows,
        styles: { fontSize: 7.0, cellPadding: 1.8 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    section('Bill of Materials (Preliminary)');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Item', 'Qty', 'Specification', 'Design note', 'Source']],
      body: bomRows,
      styles: { fontSize: 6.8, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Settings Sheet');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Setting', 'Value']],
      body: settingsRows,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Compliance Checklist');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Area', 'Requirement', 'Status', 'Evidence', 'Action/Note']],
      body: complianceRows,
      styles: { fontSize: 6.8, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });

    const filename = `${_projectPackBaseName(r)}.pdf`;
    doc.save(filename);
    App.toast(`Project pack PDF saved: ${filename}`, 'success');
  }

  function _csvCell(value) {
    const s = String(value ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function _csvFromRows(headers, rows) {
    const out = [];
    out.push(headers.map(_csvCell).join(','));
    (rows || []).forEach(row => {
      out.push((row || []).map(_csvCell).join(','));
    });
    return `${out.join('\n')}\n`;
  }

  function _projectPackCsvFiles(pack, baseName) {
    const base = String(baseName || 'project_pack');
    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    const bomRows = (pack.bom || []).map(row => [row.item, row.qty, row.spec, row.note, row.source]);
    const settingsRows = (pack.settingsSheet || []).map(row => [row[0], row[1]]);
    const complianceRows = (pack.complianceChecklist || []).map(row => [row.area, row.requirement, row.status, row.evidence, row.note]);
    return {
      [`${base}_summary.csv`]: _csvFromRows(['Item', 'Value'], summaryRows),
      [`${base}_bom.csv`]: _csvFromRows(['Item', 'Qty', 'Specification', 'Design note', 'Source'], bomRows),
      [`${base}_settings.csv`]: _csvFromRows(['Setting', 'Value'], settingsRows),
      [`${base}_compliance.csv`]: _csvFromRows(['Area', 'Requirement', 'Status', 'Evidence', 'Action/Note'], complianceRows),
    };
  }

  function _downloadProjectPackCsvFiles(pack, baseName) {
    const files = _projectPackCsvFiles(pack, baseName);
    Object.keys(files).forEach(file => {
      _downloadBlob(file, new Blob([files[file]], { type: 'text/csv;charset=utf-8' }));
    });
  }

  async function _buildProjectPackDOCXBlob(pack) {
    if (!window.docx) throw new Error('DOCX library not loaded');
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

    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    const bomRows = (pack.bom || [])
      .map(row => [row.item, row.qty, row.spec, row.note, row.source]);
    const settingsRows = (pack.settingsSheet || [])
      .map(row => [row[0], row[1]]);
    const complianceRows = (pack.complianceChecklist || [])
      .map(row => [row.area, row.requirement, row.status, row.evidence, row.note]);
    const sldRows = [
      ['Title', pack.sld && pack.sld.title ? pack.sld.title : 'Single-Line Diagram'],
      ['Topology', pack.sld && pack.sld.topology ? pack.sld.topology : 'N/A'],
      ['Mermaid (pre-design)', pack.sld && pack.sld.mermaid ? pack.sld.mermaid : 'N/A'],
    ];
    const sldNoteRows = (pack.sld && Array.isArray(pack.sld.notes) ? pack.sld.notes : [])
      .map((note, idx) => [`Note ${idx + 1}`, note]);

    const content = [];
    content.push(new Paragraph({
      text: 'Hybrid Project Pack',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT
    }));
    content.push(p(`Generated: ${pack.meta.generatedAt} | Date tag: ${pack.meta.dateTag} | Rules: ${pack.meta.standardsRulesVersion}`));
    content.push(p(`Standards profile: ${pack.meta.standardsProfileLabel} [${pack.meta.standardsProfileId}]`));

    content.push(heading('Summary'));
    content.push(table(['Item', 'Value'], summaryRows));
    content.push(heading('Single-Line Diagram (Pre-Design)'));
    content.push(table(['Field', 'Value'], sldRows));
    if (sldNoteRows.length) content.push(table(['SLD note', 'Detail'], sldNoteRows));
    content.push(heading('Bill of Materials (Preliminary)'));
    content.push(table(['Item', 'Qty', 'Specification', 'Design note', 'Source'], bomRows));
    content.push(heading('Settings Sheet'));
    content.push(table(['Setting', 'Value'], settingsRows));
    content.push(heading('Compliance Checklist'));
    content.push(table(['Area', 'Requirement', 'Status', 'Evidence', 'Action/Note'], complianceRows));
    content.push(p('Project-pack note: this output is pre-design guidance and must be finalized with project drawings, protection coordination, and utility-approved documentation.'));

    const doc = new Document({ sections: [{ children: content }] });
    return Packer.toBlob(doc);
  }

  function _buildProjectPackPDFBlob(pack) {
    if (!window.jspdf) throw new Error('PDF library not loaded');
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 12;
    const pageW = 210;
    let y = 14;
    const autoTable = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : null;
    if (!autoTable) throw new Error('PDF table plugin not loaded');

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

    doc.setFillColor(217, 119, 6);
    doc.rect(0, 0, pageW, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Hybrid Project Pack', margin, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SolarPV Field Tool', pageW - margin, 10, { align: 'right' });

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(8.5);
    doc.text(`Generated: ${pack.meta.generatedAt} | Date tag: ${pack.meta.dateTag} | Rules: ${pack.meta.standardsRulesVersion}`, margin, 22);
    const profileLine = `Standards profile: ${pack.meta.standardsProfileLabel} [${pack.meta.standardsProfileId}]`;
    const profileLines = doc.splitTextToSize(profileLine, pageW - (margin * 2));
    doc.text(profileLines, margin, 26);
    y = 26 + (profileLines.length * 4) + 1;

    const summaryRows = Object.entries(pack.summary || {})
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    const sldRows = [
      ['Title', pack.sld && pack.sld.title ? pack.sld.title : 'Single-Line Diagram'],
      ['Topology', pack.sld && pack.sld.topology ? pack.sld.topology : 'N/A'],
      ['Mermaid (pre-design)', pack.sld && pack.sld.mermaid ? pack.sld.mermaid : 'N/A'],
    ];
    const sldNoteRows = (pack.sld && Array.isArray(pack.sld.notes) ? pack.sld.notes : [])
      .map((note, idx) => [`Note ${idx + 1}`, note]);
    const bomRows = (pack.bom || [])
      .map(row => [row.item, String(row.qty ?? ''), row.spec, row.note, row.source]);
    const settingsRows = (pack.settingsSheet || [])
      .map(row => [String(row[0] ?? ''), String(row[1] ?? '')]);
    const complianceRows = (pack.complianceChecklist || [])
      .map(row => [row.area, row.requirement, row.status, row.evidence, row.note]);

    section('Summary');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Item', 'Value']],
      body: summaryRows,
      styles: { fontSize: 7.2, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Single-Line Diagram (Pre-Design)');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Field', 'Value']],
      body: sldRows,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;
    if (sldNoteRows.length) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['SLD note', 'Detail']],
        body: sldNoteRows,
        styles: { fontSize: 7.0, cellPadding: 1.8 },
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    section('Bill of Materials (Preliminary)');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Item', 'Qty', 'Specification', 'Design note', 'Source']],
      body: bomRows,
      styles: { fontSize: 6.8, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Settings Sheet');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Setting', 'Value']],
      body: settingsRows,
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;

    section('Compliance Checklist');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Area', 'Requirement', 'Status', 'Evidence', 'Action/Note']],
      body: complianceRows,
      styles: { fontSize: 6.8, cellPadding: 1.5 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    return doc.output('blob');
  }

  async function _exportProjectPackBundleZIP(r) {
    const pack = _buildProjectPack(r);
    const base = _projectPackBaseName(r);
    if (!window.JSZip) {
      _downloadBlob(`${base}.json`, new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
      _downloadProjectPackCsvFiles(pack, base);
      _exportProjectPackPDF(r);
      _exportProjectPackDOCX(r);
      App.toast('ZIP runtime unavailable. Downloaded project-pack files individually.', 'warning');
      return;
    }

    const zip = new window.JSZip();
    zip.file(`${base}.json`, JSON.stringify(pack, null, 2));
    zip.file(`${base}_sld.mmd`, String((pack.sld && pack.sld.mermaid) || ''));
    const csvFiles = _projectPackCsvFiles(pack, base);
    Object.keys(csvFiles).forEach(name => zip.file(name, csvFiles[name]));

    const notes = [];
    try {
      const pdfBlob = _buildProjectPackPDFBlob(pack);
      zip.file(`${base}.pdf`, pdfBlob);
    } catch (err) {
      notes.push(`PDF not attached: ${err && err.message ? err.message : 'unknown error'}`);
    }
    try {
      const docxBlob = await _buildProjectPackDOCXBlob(pack);
      zip.file(`${base}.docx`, docxBlob);
    } catch (err) {
      notes.push(`DOCX not attached: ${err && err.message ? err.message : 'unknown error'}`);
    }
    if (notes.length) zip.file(`${base}_bundle_notes.txt`, notes.join('\n'));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipName = `${base}_bundle.zip`;
    _downloadBlob(zipName, zipBlob);
    App.toast(`Project pack ZIP saved: ${zipName}`, 'success');
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
    const cat = r.catalogue || { summary: { pass: 0, warn: 0, fail: 0 } };
    const audit = _standardsAuditMeta();
    const invName = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const batName = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const panName = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
    const assumptionsRows = c.assumptions.map(a => `<tr><td><strong>${_esc(a[0])}</strong></td><td>${_esc(a[1])}</td><td>${_esc(a[2])}</td></tr>`).join('');
    const formulaRows = c.formulaRows.map(f => `<tr><td><strong>${_esc(f[0])}</strong></td><td><code>${_esc(f[1])}</code></td></tr>`).join('');
    const workedRows = c.workedSteps.map(s => `<tr><td><strong>${_esc(s[0])}</strong></td><td><code>${_esc(s[1])}</code></td></tr>`).join('');
    const checksRows = c.checks.map(x => `<tr><td><strong>${_esc(x.check)}</strong></td><td>${_esc(x.value)}</td><td>${_esc(x.target)}</td><td>${_esc(x.status.toUpperCase())}</td><td>${_esc(x.note)}</td></tr>`).join('');
    const utilityRows = (c.utilityRows || []).map(x => `<tr><td><strong>${_esc(x[0])}</strong></td><td>${_esc(x[1])}</td><td>${_esc(x[2])}</td><td>${_esc(x[3])}</td><td>${_esc(x[4])}</td></tr>`).join('');
    const utilityStatusRows = (c.utilityStatusRows || []).map(x => `<tr><td><strong>${_esc(x[0])}</strong></td><td>${_esc(x[1])}</td></tr>`).join('');
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
  <div class="meta">Standards profile: ${_esc(audit.profileLabel)} [${_esc(audit.profileId)}] | Ruleset version: ${_esc(audit.rulesVersion)}</div>

  <h2>Summary Results</h2>
  <table>
    <tr><th>Item</th><th>Value</th></tr>
    <tr><td><strong>Result badges</strong></td><td>${_esc((r.badges || ['Heuristic']).join(', '))}</td></tr>
    <tr><td><strong>Battery nominal capacity</strong></td><td>${_esc(r.battery.requiredNominal_kWh.toFixed(2))} kWh</td></tr>
    <tr><td><strong>Battery bank equivalent</strong></td><td>${_esc(r.batteryAh.toFixed(0))} Ah @ ${_esc(r.inputs.batteryVoltage_V.toFixed(0))}V</td></tr>
    <tr><td><strong>Recommended PV DC size</strong></td><td>${_esc(r.pv.recommended_kWp.toFixed(2))} kWp</td></tr>
    <tr><td><strong>Inverter continuous / surge</strong></td><td>${_esc(r.inverter.requiredContinuous_kW.toFixed(2))} kW / ${_esc(r.inverter.requiredSurge_kW.toFixed(2))} kW</td></tr>
    <tr><td><strong>Estimated charge current</strong></td><td>${_esc(r.charge.current_A.toFixed(1))} A</td></tr>
    <tr><td><strong>Selected inverter</strong></td><td>${_esc(invName)}</td></tr>
    <tr><td><strong>Selected battery</strong></td><td>${_esc(batName)}</td></tr>
    <tr><td><strong>Selected panel</strong></td><td>${_esc(panName)}</td></tr>
    <tr><td><strong>Utility profile</strong></td><td>${_esc(cat.profile ? cat.profile.label : 'Off-grid')}</td></tr>
    <tr><td><strong>Catalogue checks</strong></td><td>PASS ${_esc(cat.summary.pass)} | CHECK ${_esc(cat.summary.warn)} | FAIL ${_esc(cat.summary.fail)}</td></tr>
    <tr><td><strong>Utility submission gate</strong></td><td>${_esc(c.utilityGate)}</td></tr>
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

  <h2>Utility Submission Validator</h2>
  <table>
    <tr><th>Requirement</th><th>Current</th><th>Target</th><th>Status</th><th>Note</th></tr>
    ${utilityRows}
  </table>
  <table>
    <tr><th>Gate Item</th><th>Status</th></tr>
    ${utilityStatusRows}
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
    const cat = r.catalogue || { summary: { pass: 0, warn: 0, fail: 0 } };
    const audit = _standardsAuditMeta();
    const invName = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const batName = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const panName = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
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
    content.push(p(`Standards profile: ${audit.profileLabel} [${audit.profileId}] | Ruleset version: ${audit.rulesVersion}`));

    content.push(heading('Summary Results'));
    content.push(table(
      ['Item', 'Value'],
      [
        ['Result badges', `${(r.badges || ['Heuristic']).join(', ')}`],
        ['Battery nominal capacity', `${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
        ['Battery equivalent', `${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V.toFixed(0)}V`],
        ['Recommended PV DC size', `${r.pv.recommended_kWp.toFixed(2)} kWp`],
        ['Inverter continuous / surge', `${r.inverter.requiredContinuous_kW.toFixed(2)} kW / ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
        ['Estimated charge current', `${r.charge.current_A.toFixed(1)} A`],
        ['Selected inverter', invName],
        ['Selected battery', batName],
        ['Selected panel', panName],
        ['Utility profile', cat.profile ? cat.profile.label : 'Off-grid'],
        ['Catalogue checks', `PASS ${cat.summary.pass} | CHECK ${cat.summary.warn} | FAIL ${cat.summary.fail}`],
        ['Utility submission gate', ctx.utilityGate],
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

    content.push(heading('Utility Submission Validator'));
    content.push(table(
      ['Requirement', 'Current', 'Target', 'Status', 'Note'],
      ctx.utilityRows || []
    ));
    content.push(table(
      ['Gate Item', 'Status'],
      ctx.utilityStatusRows || []
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
    const cat = r.catalogue || { summary: { pass: 0, warn: 0, fail: 0 } };
    const audit = _standardsAuditMeta();
    const invName = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const batName = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const panName = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
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
    const auditLine = `Standards profile: ${audit.profileLabel} [${audit.profileId}] | Ruleset version: ${audit.rulesVersion}`;
    const auditLines = doc.splitTextToSize(auditLine, pageW - (margin * 2));
    doc.setFontSize(8);
    doc.text(auditLines, margin, 26);
    y = 26 + (auditLines.length * 4) + 1;

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
      ['Result badges', `${(r.badges || ['Heuristic']).join(', ')}`],
      ['Battery nominal capacity', `${r.battery.requiredNominal_kWh.toFixed(2)} kWh`],
      ['Battery equivalent', `${r.batteryAh.toFixed(0)} Ah @ ${r.inputs.batteryVoltage_V.toFixed(0)}V`],
      ['Recommended PV DC size', `${r.pv.recommended_kWp.toFixed(2)} kWp`],
      ['Inverter continuous / surge', `${r.inverter.requiredContinuous_kW.toFixed(2)} kW / ${r.inverter.requiredSurge_kW.toFixed(2)} kW`],
      ['Estimated charge current', `${r.charge.current_A.toFixed(1)} A`],
      ['Selected inverter', invName],
      ['Selected battery', batName],
      ['Selected panel', panName],
      ['Utility profile', cat.profile ? cat.profile.label : 'Off-grid'],
      ['Catalogue checks', `PASS ${cat.summary.pass} | CHECK ${cat.summary.warn} | FAIL ${cat.summary.fail}`],
      ['Utility submission gate', ctx.utilityGate]
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

    section('Utility Submission Validator');
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Requirement', 'Current', 'Target', 'Status', 'Note']],
      body: ctx.utilityRows || [],
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
    });
    y = doc.lastAutoTable.finalY + 4;
    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [['Gate Item', 'Status']],
      body: ctx.utilityStatusRows || [],
      styles: { fontSize: 7.0, cellPadding: 1.8 },
      headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8 }
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

  return {
    render,
    openUtilityManager,
    getCatalogSummary,
    ensureCatalogLoaded,
    getUtilitySubmissionViewModel,
    updateUtilitySubmissionState,
    getFinalProjectPackState,
    exportFinalProjectPack,
    __test: {
      evaluateUtilitySubmission: _evaluateUtilitySubmission,
      buildProjectPack: _buildProjectPack,
      projectPackCsvFiles: _projectPackCsvFiles,
      composeProjectPackContext: _composeProjectPackContext,
    }
  };
})();
