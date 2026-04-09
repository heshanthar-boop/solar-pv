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
    const res = await fetch(url);
    if (!res || !res.ok) throw new Error(`Failed to load ${url}`);
    return res.json();
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

  function render(container) {
    _ensureCatalogLoaded(container);
    const defaults = {
      dailyEnergy_kWh: 18, peakLoad_kW: 5, surgeLoad_kW: 8, autonomyDays: 1,
      batteryVoltage_V: 48, chemistry: 'lifepo4', dod: CHEMISTRY.lifepo4.dod, etaBatt: CHEMISTRY.lifepo4.etaBatt,
      etaInv: 0.93, tempDerate: 0.90, reserveFactor: 1.15, psh: 4.8, systemPR: 0.75,
      pvOversize: 1.15, inverterSafetyFactor: 1.25, chargeMargin: 1.25,
      inverterModelId: CATALOG_NONE, batteryModelId: CATALOG_NONE, batteryParallel: 1,
      panelId: CATALOG_NONE, modulesPerString: 0, stringsPerMppt: 1,
      siteTmin_C: 10, cellTmax_C: 70, surgeDuration_s: 5,
      exportMode: 'no_export', utilityProfile: 'offgrid',
    };
    const s = { ...defaults, ...(App.state.hybridInputs || {}) };
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
    const utilityMgrBtn = container.querySelector('#hy-utility-manager-btn');
    if (utilityMgrBtn) utilityMgrBtn.addEventListener('click', () => _openUtilityListManager(container));
    container.querySelector('#hy-calc-btn').addEventListener('click', () => _calculate(container));
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
          version: '2026-04-08',
          exportedAt: new Date().toISOString(),
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
              const imported = file.name.toLowerCase().endsWith('.csv')
                ? _parseOverrideCSV(text)
                : _normalizeOverridesInput(JSON.parse(text));
              const merged = _mergeOverrides(_loadCatalogOverrides(), imported);
              _saveCatalogOverrides(merged);
              _applyOverridesToCatalog();
              App.toast('Utility list import applied', 'success');
              App.closeModal();
              _openUtilityListManager(container);
              render(container);
            } catch (err) {
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
      badges,
      metrics: {
        reqContDischargeA,
        reqSurgeDischargeA,
      },
    };
  }

  function _renderResults(container, r) {
    const out = container.querySelector('#hy-results');
    out.classList.remove('hidden');
    const summary = _summaryText(r);
    const warnings = Array.isArray(r.warnings) ? r.warnings : [];
    const warningHtml = warnings.length ? `<div class="card">${warnings.map(w => `<div class="warn-box">${_esc(w)}</div>`).join('')}</div>` : '';
    const badgeHtml = (r.badges || []).length ? `<div class="info-box" style="margin-bottom:10px">${(r.badges || []).map(b => _badgeChip(b, b === 'Approval required' ? 'badge-fail' : (b === 'Heuristic' ? 'badge-warn' : 'badge-pass'))).join('')}</div>` : '';
    const catalogueCard = _catalogueChecksCard(r);
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
        </div>
      </div>
      ${catalogueCard}
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
    const cat = r.catalogue || {};
    const inv = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const bat = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const pan = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
    const pass = cat.summary ? cat.summary.pass : 0;
    const warn = cat.summary ? cat.summary.warn : 0;
    const fail = cat.summary ? cat.summary.fail : 0;
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
      '',
      'References: IEC 60364-7-712, IEC 62109, IEC 62446-1, IEC 61427/62619, SLS 1522, PUCSL, SLS 1543, SLS 1547, CEB inverter settings (2025-02-25), CEB Grid Connection Code (2024)'
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
    const invName = cat.inverterModel ? `${cat.inverterModel.manufacturer} ${cat.inverterModel.model}` : 'Not selected';
    const batName = cat.batteryModel ? `${cat.batteryModel.manufacturer} ${cat.batteryModel.model}` : 'Not selected';
    const panName = cat.panelModel ? `${cat.panelModel.manufacturer} ${cat.panelModel.model}` : 'Not selected';
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
    const cat = r.catalogue || { summary: { pass: 0, warn: 0, fail: 0 } };
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
    const cat = r.catalogue || { summary: { pass: 0, warn: 0, fail: 0 } };
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
      ['Catalogue checks', `PASS ${cat.summary.pass} | CHECK ${cat.summary.warn} | FAIL ${cat.summary.fail}`]
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

  return { render, openUtilityManager, getCatalogSummary };
})();
