/** Sri Lanka RTSPV/BESS decision-support rules. Facts are versioned and source-linked. */
const DirectiveRules = (() => {
  const VERSION = '2026.10.13';
  const SOURCES = {
    framework: { title: 'PUCSL RTSPV/BESS framework and technical specification', date: '2026-08-03', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/08/Regulatory-Frameworks-for-RTSPV-BESS_20260731.pdf' },
    standards: { title: 'SLSI / PUCSL BESS standards list', date: '2026-10', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/10/BESS_Standards_SLSI-and-PUCSL.pdf' },
    slsPresentation: { title: 'SLSI: Way forward in standardization for BESS', date: '2026-07-16', file: '04 SLS  PPT_2026-07-16_MOD.pdf', kind: 'Technical workshop explanation; use published framework for governing requirements' },
    tariffs: { title: 'Approved feed-in tariffs, Annex 2', date: '2026-08-25', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/08/Annex-2-Summary-of-Approved-Feed-in-Tariffs.pdf' },
    decision: { title: 'PUCSL August 2026 FIT decision and implementation conditions', date: '2026-08-25', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/08/Full-Final-Decision-on-Feed-in-Tariffs-August-2026.pdf' },
    interconnection: { title: 'RTSPV/BESS interconnection guidelines', date: '2026', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/08/Guidelines-on-Interconnection-and-Operation-of-RTSPV-and-BESS-for-DLs-and-Prosumers-1.pdf' },
    schemes: { title: 'PUCSL two-meter scheme clarification', date: '2026-09-08', url: 'https://www.pucsl.gov.lk/wp-content/uploads/2026/09/PUC-EER-2026_EDL_31.pdf' },
    registration: { title: 'SLSEA product registration form SBS/AD/F2/2026 HB', file: 'Application for New Product Registration and PV Hybrid Inverter and BESS Additions-206-new.pdf', url: 'https://energy.gov.lk/en/soorya-bala-sangramaya' },
    provider: { title: 'SLSEA registered service-provider terms, SLSEA/RES/1-2025', file: 'terms-and-conditions-as-a-registered-solar-photovoltaic-service-provider-slsea (1).pdf', url: 'https://energy.gov.lk/en/soorya-bala-sangramaya' },
    sungrow: { title: 'Sungrow MG5RL/MG6RL product training', date: '2025-09-25', file: 'Product Training on MG5&6RL-2025.9.25(1).pdf', kind: 'Manufacturer reference' },
    huawei: { title: 'Huawei Residential & C&I PV+ESS Highlights', date: '2026-02', file: 'Residential & C&I PV+ESS Highlights.pdf', kind: 'Manufacturer reference' },
    quality: { title: 'CEA BESS Quality Risks, 2024 findings / May 2025 report', date: '2025-05', file: 'CEA_ESS_2024 Quality Risks Report_2025.pdf', kind: 'Advisory quality evidence' },
  };
  const BESS_STANDARDS = [
    ['SLS 1839-1:2026', 'IEC 62619:2022', 'Lithium cell / battery safety'],
    ['SLS 1839-2:2026', 'IEC 63056:2020', 'Electrical energy storage safety'],
    ['SLS 1839-3:2026', 'IEC 62620:2023', 'Industrial lithium battery performance'],
    ['SLS 1840-1:2026', 'IEC 63330 (2024)', 'Repurposed batteries; apply only when repurposed'],
    ['SLS IEC 61427:2026', 'IEC 61427-1:2013 / -2:2015', 'Off-grid / on-grid renewable storage testing'],
    ['SLS 1838-1:2026', 'IEC 63115 (2020)', 'NiMH; separate chemistry scope'],
    ['SLS IEC 62485', 'IEC 62485-5:2020', 'Stationary lithium battery installation safety'],
  ];
  const INVERTER_REFERENCES = ['MG5RL', 'MG6RL'].map((model, i) => ({
    id: `sungrow_${model.toLowerCase()}`, manufacturer: 'Sungrow', model, topology: 'hybrid',
    acRated_kW: 5 + i, surge_kW: (5 + i) * 2, surge_s: 10, phase: 1, batteryBus_V: 48,
    maxCharge_A: i ? 135 : 120, maxDischarge_A: i ? 135 : 120,
    maxPv_kW: i ? 12 : 10, usablePv_kW: i ? 9.6 : 8,
    maxDcVoc_V: 500, mpptMin_V: 40, mpptMax_V: 425, mpptRatedMin_V: 230,
    mpptCount: 2, stringsPerMppt: 1, maxCurrentPerMppt_A: 20, maxIscPerMppt_A: 25,
    batteryMinV: 40, batteryMaxV: 60, ipRating: 'IP65', efficiencyPct: 96.7,
    supportedProfiles: ['offgrid', 'ceb_2025', 'leco_2025'], utilityListed: { ceb_2025: false, leco_2025: false },
    datasheetRev: 'Supplied MG5/6RL training, pp. 4-6, 22-28', sourceConfidence: 'manufacturer-reference',
    note: 'Reference specifications only. AFCI is optional; verify fitted protection, firmware, battery protocol and current SLSEA/DL approval.'
  }));
  const BATTERY_REFERENCES = [
    ...[5,10,15].map((energy, i) => ({ id: `huawei_luna_s0_${energy}`, manufacturer: 'Huawei', model: `LUNA2000-${energy}-S0`, usableEnergy_kWh: energy, nominalV: 450, capacityAh: null, maxPower_kW: i ? 5 : 2.5, batteryMinV: 350, batteryMaxV: 560, ipRating: 'IP66', maxParallel: 2, sourcePage: 4 })),
    ...[6.9,13.8,20.7].map((energy, i) => ({ id: `huawei_luna_s1_${i+1}`, manufacturer: 'Huawei', model: `LUNA2000-${[7,14,21][i]}-S1`, usableEnergy_kWh: energy, nominalV: null, capacityAh: null, maxPower_kW: [3.5,7,10.5][i], batteryMinV: 350, batteryMaxV: 560, ipRating: 'IP66', maxParallel: 4, sourcePage: 5 })),
  ].map(b => ({ ...b, chemistry: 'lifepo4', recommendedDod: null, continuousCharge_A: null, continuousDischarge_A: null, batteryMin3V:600, batteryMax3V:980, nominalV3: b.sourcePage===4?600:null, tempMinC: -20, tempMaxC: 55, datasheetRev: `Supplied Huawei highlights p. ${b.sourcePage}`, note: 'Manufacturer reference only. Declared usable energy at beginning of life. Ah and continuous-current ratings are not supplied and are not inferred. 350-560V single-phase / 600-980V three-phase. Use a compatible Huawei inverter and verify local approval; cycle-test evidence is not inferred.' }));
  const EVIDENCE = [
    { key: 'providerRegistered', label: 'Active SLSEA provider registration and competent team', source: 'provider', clause: 'pp. 1-2; framework pp. 5-6', scope: 'all' },
    { key: 'productRegistered', label: 'Exact inverter / BESS models registered with SLSEA', source: 'registration', clause: 'pp. 2, 4; interconnection 4.5', scope: 'all' },
    { key: 'accreditedCertificates', label: 'Accredited type-test certificates, datasheets and manufacturer authorization', source: 'registration', clause: 'pp. 2, 4', scope: 'all' },
    { key: 'engineerDeclaration', label: 'Signed ECSL Chartered Electrical Engineer declaration', source: 'framework', clause: 'pp. 18, 21-22', scope: 'all' },
    { key: 'batteryStandards', label: 'IEC 62619 / 63056 / 62620 or corresponding SLS test evidence, plus transport and EMC evidence', source: 'standards', clause: 'p. 1; technical specification 3.1.4', scope: 'battery' },
    { key: 'batteryDeclaration', label: 'Manufacturer declaration: rated/usable Ah and kWh, voltage range, charge/discharge currents, temperature range, thermal/fire characteristics, cycles and efficiency', source: 'framework', clause: '3.1.1; SLSI presentation p. 7', scope: 'battery' },
    { key: 'repurposingEvidence', label: 'Repurposed battery assessment to SLS 1840-1 / IEC 63330', source: 'standards', clause: 'p. 1', scope: 'repurposed' },
    { key: 'protectionVerified', label: 'DC/AC isolation and overcurrent protection, Type 2 SPDs, earthing and coordinated RCD selection', source: 'framework', clause: 'pp. 17-18, 3.6', scope: 'battery' },
    { key: 'fireEsdVerified', label: 'Scale-appropriate fire/thermal measures and accessible labelled external ESD tested for battery isolation, stopped charge/discharge and breaker trips', source: 'framework', clause: '3.4 / 3.4.1; SLSI presentation pp. 11-12', scope: 'battery' },
    { key: 'installationVerified', label: 'Permitted location, ventilation, OEM clearances, IP54 enclosure, C4 corrosion protection, weather-protected rated cables in steel conduit/trunking and applicable BS 7671 installation review', source: 'framework', clause: 'pp. 11, 15, 18; SLSI presentation p. 10', scope: 'battery' },
    { key: 'bmsVerified', label: 'BMS cell voltage/current/temperature, SoC/SoH, fault isolation, event logs, protective shutdown, compatible communications and secure remote access', source: 'framework', clause: 'pp. 13, 19-20; SLSI presentation p. 9', scope: 'battery' },
    { key: 'oemCompatibility', label: 'OEM-confirmed inverter/battery pairing, communication protocol and installed firmware', source: 'registration', clause: 'Exact model datasheets; Sungrow p. 24 / Huawei pp. 4-5', scope: 'battery' },
    { key: 'bessTrainingVerified', label: 'BESS / hybrid inverter installer training certificate', source: 'registration', clause: 'Annex 02, item 4 (PDF p. 4)', scope: 'battery' },
    { key: 'roofBoundaryVerified', label: 'Functional roof / boundary, independent roof anchoring and safe meter/isolator access verified', source: 'interconnection', clause: '4.19-4.22', scope: 'roof' },
    { key: 'handoverVerified', label: 'Design/SLD/protection study, commissioning/as-built/O&M records, annual tests and recycling plan', source: 'framework', clause: 'pp. 18-20, 3.7 / 5 / 6', scope: 'battery' },
    { key: 'gridClearance', label: 'Valid written DL grid clearance / interconnection agreement', source: 'interconnection', clause: 'Ch. 3 / Ch. 11', scope: 'grid' },
    { key: 'dlSettings', label: 'Project-specific DL-approved protection, ride-through and Volt-VAR / Volt-Watt settings', source: 'interconnection', clause: '4.8 / 4.23-4.25', scope: 'grid' },
    { key: 'backfeedVerified', label: 'External back-feed protection and accessible lockable IP65 PCC isolation', source: 'interconnection', clause: '4.11 / 10.5', scope: 'gridBattery' },
    { key: 'monitoringVerified', label: 'DL-approved real-time monitoring/control or approved fallback', source: 'interconnection', clause: '4.23-4.25 / 10.8 / 11.8', scope: 'grid' },
    { key: 'commissioningAccepted', label: 'Accepted testing plan, calibrated tests and written DL commissioning acceptance', source: 'interconnection', clause: 'Ch. 5', scope: 'grid' },
    { key: 'sppaVerified', label: 'Signed SPPA / BESS addendum and approved two-meter arrangement', source: 'decision', clause: 'Annex 3, sections 4-7', scope: 'export' },
    { key: 'licenceVerified', label: 'Applicable generation licence or documented exemption confirmed', source: 'framework', clause: 'p. 5; FIT Annex 3, 3(c) / interconnection 11.4', scope: 'licence' },
  ];
  function num(v) { return v === '' || v === null || v === undefined || typeof v === 'boolean' ? NaN : Number(v); }
  function fmt(v, d=2) { return Number.isFinite(v) ? v.toFixed(d) : 'Not declared'; }
  function normalize(input={}) {
    return { ...input, connection: ['grid_export','zero_export','offgrid'].includes(input.connection) ? input.connection : 'grid_export', phase: num(input.phase) === 1 ? 1 : 3, category: ['residential','commercial','industrial'].includes(input.category) ? input.category : 'residential', evidence: input.evidence || {} };
  }
  function evaluate(input={}) {
    const p = normalize(input), checks = [], advisory = [];
    const inverter = p.inverter || {}, battery = p.battery || {}, panel = p.panel || {};
    const pac = num(p.inverterKW), usable = num(p.usableKwh), pv = num(p.pvKW), units = num(p.inverterCount ?? 1);
    const hasBattery = usable > 0 || !!battery.id || p.bessInstalled === true, grid = p.connection !== 'offgrid';
    const add = (id, label, status, actual, target, source, clause, note='') => checks.push({id,label,status,actual,target,source,clause,note});
    if (p.installation && p.installation!=='rooftop') add('rtspv_scope','Installation / regulatory workflow scope','review',p.installation,'This release checks RTSPV/BESS. Power plants need their applicable licensing, grid-code and SPPA workflow.','framework','PDF p. 4; FIT Annex 2 pp. 1-2');
    const numeric = (id,label,value,accept,target,source,clause) => add(id,label,Number.isFinite(value) ? (accept(value) ? 'pass' : 'fail') : 'review',fmt(value),target,source,clause);
    if (grid&&(!p.installation||p.installation==='rooftop')) {
      const height=num(p.mountHeightM);
      numeric('mount_height','PV support height above the roof',height,v=>v>=0,'Declare site-measured support height; >1 m needs structural certification','interconnection','4.19-4.20');
      if(height>1||p.roofSlab===true) add('structural_certificate','Roof-slab / elevated-support structural certification',p.evidence.structuralCertified===true&&String(p.evidenceRef||'').trim().length>2?'pass':'review',p.evidence.structuralCertified===true?'Evidence declared':'Not recorded','Chartered Structural Engineer / applicable accredited certification body evidence','interconnection','4.19-4.20');
    }
    numeric('rated_power','Continuous inverter power',pac,v=>v>0,'Positive manufacturer continuous rating (kW)','framework','Technical specification 1');
    numeric('inverter_units','Identical inverter unit count',units,v=>Number.isInteger(v)&&v>=1,'Positive integer','framework','Aggregate rated continuous inverter power');
    const modelRating = num(inverter.acRated_kW)*units;
    if (Number.isFinite(modelRating)) numeric('model_rating','Selected inverter rating',pac,v=>Math.abs(v-modelRating)<0.011,`${fmt(modelRating)} kW from selected model`,'registration','Technical datasheet');
    if ([1,3].includes(num(inverter.phase))&&units===1) numeric('model_phase','Selected inverter phase',p.phase,v=>v===num(inverter.phase),`${inverter.phase===1?'Single':'Three'}-phase selected inverter`,'registration','Manufacturer phase configuration');
    if(num(inverter.phase)===1&&units>1&&p.phase===3) add('phase_topology','Multiple single-phase inverters on three-phase','review',`${units} single-phase units`,'Verify OEM-supported topology, phase allocation and DL-approved arrangement','registration','Exact inverter and interconnection configuration');
    const maxPV = num(inverter.maxPv_kW)*units;
    if (maxPV > 0) numeric('max_pv','PV array versus manufacturer input limit',pv,v=>v>0&&v<=maxPV,`<= ${fmt(maxPV)} kWp`,'registration','Inverter datasheet');
    const rawChem=String(battery.id?battery.chemistry||'':p.chemistry||'').toLowerCase();
    const declaredChem=rawChem==='unknown'?'':rawChem;
    const otherChem=declaredChem&&!/^(lifepo4|li-ion|lithium|lfp)$/.test(declaredChem);
    if(hasBattery&&otherChem){add('other_chemistry','Battery chemistry / technical-specification scope','review',declaredChem,'This lithium-BESS specification is not automatically applied to other chemistries; review separate applicable rules','framework','Technical specification 1');if(/^MG[56]RL$/i.test(inverter.model||''))add('mg_chemistry','MG battery technology compatibility','fail',declaredChem,'Li-ion battery per manufacturer reference','sungrow','p. 4');}
    if (hasBattery && !otherChem) {
      numeric('usable_energy','Declared installed usable battery energy',usable,v=>v>0,'Positive manufacturer usable energy; no nominal/usable substitution','framework','Technical specification 1');
      const batteryUnits=num(p.batteryUnits ?? 1);
      numeric('battery_units','Installed battery unit count',batteryUnits,v=>Number.isInteger(v)&&v>=1,'Positive integer; verify supported stack/parallel arrangement','registration','Exact battery and inverter datasheets');
      if(battery.usableEnergy_kWh>0) numeric('model_usable','Usable energy versus selected battery units',usable,v=>Math.abs(v-battery.usableEnergy_kWh*batteryUnits)<0.03,`${fmt(battery.usableEnergy_kWh*batteryUnits)} kWh manufacturer-declared usable energy`,'huawei','pp. 4-5');
      const powerCap=Math.min(pac,battery.maxPower_kW>0?battery.maxPower_kW*batteryUnits:pac);
      numeric('charge_power','Declared continuous battery charge power',num(p.chargeKW),v=>v>0&&v<=powerCap,`>0 and <=${fmt(powerCap)} kW; verify current/voltage limits too`,'registration','Manufacturer continuous power ratings');
      numeric('discharge_power','Declared continuous battery discharge power',num(p.dischargeKW),v=>v>0&&v<=powerCap,`>0 and <=${fmt(powerCap)} kW; verify current/voltage limits too`,'registration','Manufacturer continuous power ratings');
      add('chemistry','BESS technical-specification chemistry scope',/^(lifepo4|li-ion|lithium|lfp)$/i.test(declaredChem)?'pass':'review',declaredChem || 'Not declared','Lithium-based fixed BESS; other chemistries require separate applicable rules','framework','Technical specification 1 / 3.1.1');
      const hours = pac > 0 ? usable / pac : NaN;
      const exception = p.energyException === true && String(p.exceptionRef || '').trim().length > 2;
      add('five_hour','Usable battery / continuous inverter ratio',p.usableEnergyBasis==='estimate'?'review':Number.isFinite(hours) ? (hours<=5?'pass':exception?'review':'fail'):'review',`${fmt(hours)} h (${fmt(usable)} kWh / ${fmt(pac)} kW)`,'<= 5 h, or documented Chartered Electrical Engineer assessment','framework','PDF pp. 10-11, scope',p.usableEnergyBasis==='estimate'?'V × Ah × DoD is an energy estimate. Enter the manufacturer-declared usable energy before confirming this limit.':exception&&hours>5?'Exception recorded; the app cannot approve the technical assessment.':'Use aggregate connected continuous inverter rating and manufacturer usable energy, not surge power.');
      if (p.category==='residential' && p.phase===1 && pac>5) add('res_scope','Residential single-phase specification scope','review',`${fmt(pac)} kW`,'Up to 5 kW; verify classification / utility approval for larger ratings','framework','PDF p. 10');
      if (p.category==='residential' && p.phase===3 && pac>40 || p.category==='commercial' && (pac<=40 || pac>1000) || p.category==='industrial' && pac<=1000) add('category_scope','Declared BESS installation category','review',`${p.category}, ${fmt(pac)} kW`,'Residential: <=40 kW three-phase; commercial: >40 to 1000 kW; industrial: >1000 kW','framework','PDF p. 10');
      if (grid && pac>7 && p.phase!==3) add('phase','BESS grid-connection phase',p.phaseException===true&&String(p.phaseExceptionRef||'').trim()?'review':'fail',`${fmt(pac)} kW, single-phase`,'Above 7 kW: three-phase, unless DL/Commission alternative is documented','interconnection','10.11');
      numeric('dc_voltage','BESS nominal DC voltage',num(p.batteryVoltage ?? battery.nominalV),v=>v>0&&v<=1500,'>0 and <=1500 V within specification scope','framework','PDF p. 10');
      const ip = String(p.batteryIP || battery.ipRating || '').toUpperCase().match(/^IP(\d)(\d)$/);
      add('ip','Battery module/pack ingress protection',ip?(+ip[1]>=5&&+ip[2]>=4?'pass':'fail'):'review',ip?ip[0]:'Not declared','At least IP54 (separate installation enclosure evidence also required)','framework','3.1.1 / 3.3');
      numeric('rte','Declared battery round-trip efficiency',num(p.rtePct),v=>v>=(p.performanceClass==='premium'?90:85)&&v<=100,p.performanceClass==='premium'?'>=90% premium':'>=85% standard','framework','3.1.2(c)');
      numeric('cell_density','Cell gravimetric energy density',num(p.cellDensity),v=>v>=150,'>=150 Wh/kg; accredited cell report, not pack-weight arithmetic','framework','3.1.2(d)');
      const minCycles = p.category==='residential'?6000:8000, cycles = num(p.cycles);
      const conditions = Math.abs(num(p.cycleDod)-80)<0.01 && Math.abs(num(p.cycleRate)-0.5)<0.001 && num(p.retentionPct)>=80 && num(p.testTempC)>=20 && num(p.testTempC)<=30;
      add('cycle_life','Cycle-life qualification',!Number.isFinite(cycles)?'review':cycles<minCycles?'fail':conditions?'pass':'review',`${fmt(cycles,0)} cycles; DoD ${fmt(num(p.cycleDod))}%; ${fmt(num(p.cycleRate))}C; retention ${fmt(num(p.retentionPct))}%; ${fmt(num(p.testTempC))}°C`,`${minCycles} cycles at 80% DoD, 0.5C, >=80% retention, 25±5°C unless authority specifies otherwise`,'framework','3.1.1 note / 3.1.2(a)-(b)','Different test conditions require engineering evidence; cycle-life claims are not extrapolated.');
      numeric('retention','BESS logging retention',num(p.logMonths),v=>v>=12,'>=12 months of non-volatile on-site records','framework','4.0(d)');
      const invMin=num(inverter.batteryMinV), invMax=num(inverter.batteryMaxV);
      const batMin=num(p.batteryMinV ?? battery.batteryMinV), batMax=num(p.batteryMaxV ?? battery.batteryMaxV);
      if (invMin>0&&invMax>0) add('battery_window','Battery operating-voltage compatibility',Number.isFinite(batMin)&&Number.isFinite(batMax)?(batMin>=invMin&&batMax<=invMax&&batMin<batMax?'pass':'fail'):'review',`${fmt(batMin)}-${fmt(batMax)} V`,`${fmt(invMin)}-${fmt(invMax)} V inverter window`,'sungrow','p. 4; use exact battery/inverter datasheets');
      if (battery.manufacturer==='Huawei') {
        const family=/^SUN2000-(?:2|3|3\.68|4|4\.6|5|6)KTL-L1$|^SUN2000-(?:3|4|5|6|8|10)KTL-M[01]$|^SUN2000-(?:12|15|17|20|25)K-MB0$|^SUN2000-(?:8|10)K-LC0$/i.test(inverter.model||'');
        const verified=p.evidence.oemCompatibility===true&&String(p.evidenceRef||'').trim().length>2;
        add('huawei_pair','Huawei battery/inverter ecosystem',inverter.manufacturer!=='Huawei'?'fail':family&&verified?'pass':'review',`${battery.model||'LUNA'} + ${inverter.manufacturer||'unselected'} ${inverter.model||''}`,'Exact SUN2000 family, firmware and regional availability evidence required','huawei','pp. 4-5 and compatibility footnotes','Compatible-family references are conditional; certification and installed firmware are not inferred from a brochure.');
        const low=p.phase===3?battery.batteryMin3V:battery.batteryMinV, high=p.phase===3?battery.batteryMax3V:battery.batteryMaxV;
        add('huawei_interface','Huawei BESS interface for selected phase',num(p.batteryMinV)===low&&num(p.batteryMaxV)===high?'pass':'review',`${fmt(num(p.batteryMinV))}-${fmt(num(p.batteryMaxV))} V`,`${low}-${high} V for selected phase`,'huawei','pp. 4-5');
      }
      if (/^MG[56]RL$/i.test(inverter.model||'')&&units>1) add('mg_parallel','MG parallel battery architecture','review',`${units} inverters`,'Separate supported battery connections and verified master/slave configuration; shared battery-bank topology is not inferred','sungrow','pp. 13-15, 55');
      if (grid&&pac>50) add('utility_telemetry','BESS >50 kW utility communications hardware',p.evidence.telemetryHardware===true&&String(p.evidenceRef||'').trim().length>2?'pass':'review',p.evidence.telemetryHardware===true?'Hardware evidence declared':'Not confirmed','Monitoring/control hardware capability required; an operating fallback alone does not establish it','framework','3.5');
      advisory.push({source:'quality',clause:'pp. 4-5, 8-10, 15',note:'Advisory QA: verify fire sensors/actuators, thermal system, wiring/torque and measured capacity through FAT/SAT. Record, correct and re-inspect unresolved major/critical findings. CEA sample findings are not a universal defect probability.'});
      advisory.push({source:'slsPresentation',clause:'pp. 6, 8, 13',note:'SLSI workshop guidance confirms the 5-hour sizing criterion and permits greater storage with engineering justification. The 6 kW inverter / 20 kWh battery / 2 kW export diagram is a proposed illustration, not a blanket approval or export limit. Use this project’s DL clearance. The published specification and slide 8 state 25±5°C for performance tests.'});
    }
    const approved=num(p.approvedExportKW);
    if (grid) {
      numeric('export_capacity','Approved export capacity',approved,v=>v>=0, 'Enter contracted/approved AC export capacity in kW; zero for captive export restriction','interconnection','11.3 / framework 3.5');
      if (p.connection==='zero_export' && approved!==0) add('zero_export_capacity','Zero-export setpoint',Number.isFinite(approved)?'fail':'review',fmt(approved),'0 kW','interconnection','Ch. 11');
      if (approved>=0 && (pac>approved||p.connection==='zero_export')) add('export_limiter','Export limitation and dynamic control',p.evidence.exportLimiter===true?'pass':'review',p.evidence.exportLimiter===true?'Evidence declared':'Not confirmed','Configurable limiter, dynamic power management and utility-accessible control','framework','3.5');
    }
    const n=num(p.modulesPerString), strings=num(p.stringsPerMppt), cold=num(p.tMinC), hot=num(p.tCellMaxC);
    if (n>0 && panel.Voc>0 && inverter.maxDcVoc_V>0) {
      numeric('module_count','Modules per string',n,v=>Number.isInteger(v)&&v>=1,'Positive whole-module count','registration','PV string configuration');
      numeric('string_count','Strings per MPPT',strings,v=>Number.isInteger(v)&&v>=1,'Positive integer','registration','PV string configuration');
      const voc=n*panel.Voc*(1+Number(panel.coeffVoc||0)*(cold-25));
      const vmpHot=n*panel.Vmp*(1+Number(panel.coeffVmp ?? panel.coeffVoc ?? 0)*(hot-25));
      const vmpCold=n*panel.Vmp*(1+Number(panel.coeffVmp ?? panel.coeffVoc ?? 0)*(cold-25));
      numeric('string_voc','Cold string Voc',voc,v=>v>0&&v<inverter.maxDcVoc_V,`<${inverter.maxDcVoc_V} V absolute input limit`,'registration','Selected panel / inverter datasheets');
      numeric('mppt_hot','Hot string Vmp',vmpHot,v=>v>=inverter.mpptMin_V&&v<=inverter.mpptMax_V,`${inverter.mpptMin_V}-${inverter.mpptMax_V} V MPPT window`,'registration','Selected panel / inverter datasheets');
      if(inverter.mpptRatedMin_V>0&&vmpHot<inverter.mpptRatedMin_V)add('rated_mppt_voltage','Full-rated-power MPPT voltage','review',fmt(vmpHot),`Rated-power range starts at ${inverter.mpptRatedMin_V} V; obtain manufacturer derating data below it`,'sungrow','p. 4');
      numeric('mppt_cold','Cold string Vmp',vmpCold,v=>v>=inverter.mpptMin_V&&v<=inverter.mpptMax_V,`${inverter.mpptMin_V}-${inverter.mpptMax_V} V MPPT window`,'registration','Selected panel / inverter datasheets');
      numeric('mppt_current','MPPT operating current',num(panel.Imp)*strings,v=>v>0&&v<=inverter.maxCurrentPerMppt_A,`<=${inverter.maxCurrentPerMppt_A} A per MPPT`,'registration','Selected datasheets; input and short-circuit limits differ');
      if (inverter.maxIscPerMppt_A>0) numeric('mppt_isc','Hot MPPT short-circuit current at STC irradiance',num(panel.Isc)*(1+Number(panel.coeffIsc||0)*(hot-25))*strings,v=>v>0&&v<=inverter.maxIscPerMppt_A,`<=${inverter.maxIscPerMppt_A} A per MPPT`,'sungrow','p. 4; review elevated irradiance/bifacial gain separately');
      if (inverter.stringsPerMppt>0) numeric('mppt_strings','Strings per MPPT',strings,v=>Number.isInteger(v)&&v>0&&v<=inverter.stringsPerMppt,`<=${inverter.stringsPerMppt} per MPPT`,'sungrow','p. 4');
      const used=num(p.mpptsUsed);
      numeric('used_mppts','Used MPPT count',used,v=>Number.isInteger(v)&&v>=1&&v<=num(inverter.mpptCount)*units,`1 to ${num(inverter.mpptCount)*units} across connected units`,'registration','Selected inverter datasheet');
      const configured = n * strings * used * num(panel.Pmax) / 1000;
      if (Number.isFinite(configured)&&Math.abs(configured-pv)>0.02) add('array_layout','Array power versus entered string layout','review',`${fmt(configured)} kWp wired / ${fmt(pv)} kWp entered`,'Reconcile panel count, used MPPTs and PV array rating','registration','Component design calculation');
      if (/^MG[56]RL$/i.test(inverter.model||'')&&hasBattery) {
        const batMin=num(p.batteryMinV);
        numeric('mg_startup','MG5/6RL battery/PV startup relationship',voc,v=>batMin>0&&v<=9*batMin,`Voc <=9 x declared battery lower operating voltage (${fmt(batMin)} V)`,'sungrow','p. 22','');
      }
    } else add('string_layout','PV string electrical checks','review','String configuration or model limits incomplete','Declare modules/string, strings/MPPT and temperature extremes','registration','Selected datasheets');
    if (grid) add('inverter_functions','LVRT, AFCI, Volt-VAR and Volt-Watt functions',p.evidence.gridFunctions===true?'pass':'review',p.evidence.gridFunctions===true?'Fitted functions verified':'Not verified','Verify installed/commissioned functions; optional AFCI is not assumed fitted','framework','3.2.2');
    for (const e of EVIDENCE) {
      const relevant = e.scope==='all'||e.scope==='battery'&&hasBattery&&!otherChem||e.scope==='repurposed'&&hasBattery&&p.repurposed===true||e.scope==='grid'&&grid||e.scope==='gridBattery'&&grid&&hasBattery||e.scope==='export'&&p.connection==='grid_export'||e.scope==='licence'&&grid&&pac>=100||e.scope==='roof'&&grid&&(!p.installation||p.installation==='rooftop');
      if (!relevant) continue;
      const confirmed=p.evidence[e.key]===true&&String(p.evidenceRef||'').trim().length>2&&(e.key!=='dlSettings'||String(p.dlSettingsRef||'').trim().length>2);
      add(e.key,e.label,confirmed?'pass':'review',confirmed?'User-declared evidence reference supplied':'Evidence / reference missing','Verify applicable documentary and site evidence',e.source,e.clause,'This records the reviewer’s declaration; it does not independently verify a certificate or confer approval.');
    }
    const counts=checks.reduce((a,c)=>(a[c.status]++,a),{pass:0,fail:0,review:0});
    return {version:VERSION,inputs:p,checks,advisory,counts,status:counts.fail?'blocked':counts.review?'review':'checks_complete',canRelease:counts.fail===0&&counts.review===0,capacity:{maxUsableKwh:pac>0?5*pac:null,requiredInverterKW:hasBattery?usable/5:null},sources:SOURCES};
  }
  function tariff(input={}) {
    const p=input, capacity=num(p.capacityKW), scheme=p.scheme||'net_accounting', applicant=p.applicant||'new_pv';
    const messages=[], start='2026-08-25';
    const result={version:VERSION,source:'decision',clause:'Table 6 / Annex 3',effectiveFrom:start,scheme,applicant,capacityKW:capacity,priorityWindow:'17:30-21:30',priorityYears:15,exportCapPer30Days:applicant==='new_pv'?null:capacity*123,baseRate:null,priorityRate:null,status:'eligible',messages};
    if (scheme==='zero_export'||scheme==='offgrid') {result.baseRate=result.priorityRate=0;result.exportCapPer30Days=null;messages.push('No grid-export remuneration under this operating mode.');return result;}
    if (p.installation && p.installation!=='rooftop' && applicant!=='legacy') {
      result.status='review';
      result.plantComponents=p.installation==='floating'?{base:23.58,om:3.92,priorityBase:53.28,priorityOm:4.36}:{base:18,om:2.72,priorityBase:47.08,priorityOm:3.02};
      messages.push('Power-plant FIT components are separate from rooftop bands. The 12-month FX/CCPI adjustment and annual O&M component escalation need the signed SPPA / plant model; this prosumer projection does not assume them.');return result;
    }
    if (p.billingClass==='bulk'&&['net_accounting','net_metering'].includes(scheme)&&!applicant.includes('bess')) {result.status='review';messages.push('Bulk PV-only settlement needs daytime import/export quantities or a DL-approved alternative under interconnection 6.6. The retail monthly-net model is not substituted.');}
    if (!(capacity>0)) { result.status='review'; messages.push('Contracted AC capacity is required; PV DC kWp does not determine the tariff band.'); return result; }
    if (scheme==='zero_export'||scheme==='offgrid'||scheme==='net_metering') { result.baseRate=0; result.priorityRate=0; result.exportCapPer30Days=null; messages.push(scheme==='net_metering'?'Net metering banks/offsets units; surplus has no cash feed-in payment.':'No grid-export remuneration under this operating mode.'); return result; }
    if (applicant==='legacy') {
      const old=num(p.existingRate);
      if (!(old>=0)) {result.status='review';messages.push('Enter the rate from the signed existing SPPA.');}
      else result.baseRate=result.priorityRate=old;
      result.exportCapPer30Days=null; return result;
    }
    const parsedDate=new Date(`${p.clearanceDate}T00:00:00Z`);
    const validDate=Number.isFinite(parsedDate.getTime())&&parsedDate.toISOString().slice(0,10)===p.clearanceDate;
    if (validDate&&p.clearanceDate>VERSION.replace(/\./g,'-')) {result.status='review';messages.push('Future clearance date: reverify the tariff in force at the actual clearance date.');}
    if (!validDate||p.clearanceDate<start||p.clearanceValid!==true) {result.status='review';messages.push('The new decision requires valid grid clearance dated on/after 25 August 2026. Earlier agreements need their signed rate.');}
    if (p.clearanceExtended===true) {result.status='review';messages.push('An extension uses the tariff at approval, capped by the original clearance tariff when the new tariff is higher; verify both decision dates.');}
    if (applicant==='new_pv') {result.baseRate=result.priorityRate=capacity<=10?23.11:capacity<=40?19.15:capacity<=250?17.11:15.81;result.band=capacity<=10?'Up to 10 kW':capacity<=40?'>10 to 40 kW':capacity<=250?'>40 to 250 kW':'>250 kW';return result;}
    if (capacity<=250) {result.status='unavailable';messages.push('This decision sets no BESS-inclusive priority tariff at or below 250 kW. Do not apply a large-system BESS tariff.');return result;}
    if (applicant==='new_bess') {result.baseRate=15.81;result.priorityRate=capacity<=1000?45.53:42.49;}
    else if (applicant==='retrofit_bess') {
      const old=num(p.existingRate), remaining=num(p.remainingYears);
      if (!(old>=0)||!(remaining>0)) {result.status='review';messages.push('Existing-SPPA rate and unexpired agreement years are required for retrofit BESS.');}
      if (old>=0) {result.baseRate=old;result.priorityRate=(capacity<=1000?33.51:30.27)+old/0.95;}
      result.priorityYears=Number.isFinite(remaining)?Math.min(15,remaining):15;
      result.contractLimitYears=remaining;
    } else {result.status='review';messages.push('Select an applicable new or existing prosumer category.');}
    if (capacity<=1000&&p.taxConcession!==true) {result.status='review';messages.push('The >250 to 1000 kW rates assume the Bonded Warehouse tax concession; confirm applicability.');}
    if (!(num(p.usableKwh)>0)) {result.status='review';messages.push('A BESS-inclusive tariff needs a declared installed battery and a separate approved agreement.');}
    messages.push('123 kWh/kW per 30-day billing-cycle payable cap supersedes the older interconnection example. Priority window may be revised by the Commission.');
    return result;
  }
  function revenue(periods, terms, year=1) {
    let amount=0,paid=0,unpaid=0,priorityPaid=0;
    if (!terms||terms.status!=='eligible'||terms.baseRate===null) return {amount:null,paidKwh:0,unpaidKwh:0,priorityPaidKwh:0};
    if (terms.contractLimitYears && year-1>=terms.contractLimitYears) return {amount:0,paidKwh:0,unpaidKwh:periods.reduce((s,p)=>s+Math.max(0,num(p.otherKwh)||0)+Math.max(0,num(p.priorityKwh)||0),0),priorityPaidKwh:0};
    for(const period of periods) {
      const off=Math.max(0,num(period.otherKwh)||0), peak=Math.max(0,num(period.priorityKwh)||0), total=off+peak;
      // Conservative pro-rata allocation: no invented priority for the payable cap.
      const cap=terms.exportCapPer30Days===null?total:Math.max(0,terms.exportCapPer30Days)*(num(period.days)||30)/30;
      const factor=total>0?Math.min(1,cap/total):1;
      const contractFraction=terms.contractLimitYears?Math.max(0,Math.min(1,terms.contractLimitYears-(year-1))):1;
      const priorityFraction=Math.max(0,Math.min(1,(terms.priorityYears-(year-1))/Math.max(contractFraction,1e-9)));
      const peakRate=terms.baseRate+priorityFraction*(terms.priorityRate-terms.baseRate);
      amount+=(off*terms.baseRate+peak*peakRate)*factor;
      paid+=total*factor; unpaid+=total*(1-factor); priorityPaid+=peak*factor;
    }
    const fraction=terms.contractLimitYears?Math.max(0,Math.min(1,terms.contractLimitYears-(year-1))):1;
    return {amount:amount*fraction,paidKwh:paid*fraction,unpaidKwh:unpaid*fraction,priorityPaidKwh:priorityPaid*fraction};
  }
  function dispatch(monthly, annualLoad, options={}) {
    const usable=Math.max(0,num(options.usableKwh)||0), chargeMax=Math.max(0,num(options.chargeKW)||0), dischargeMax=Math.max(0,num(options.dischargeKW)||0);
    const rte=num(options.rtePct)/100, eta=usable>0?Math.sqrt(Number.isFinite(rte)&&rte>0&&rte<=1?rte:0.9):1;
    const mode=options.mode||'self_consumption', profile=options.profile||'res_evening';
    const pvWeights=Array.from({length:48},(_,i)=>Math.max(0,Math.sin(Math.PI*((i+.5)/2-6)/12))*((i+.5)/2>=6&&(i+.5)/2<=18?1:0));
    const loadWeights=Array.from({length:48},(_,i)=>{const h=(i+.5)/2;return profile==='commercial'?(h>=8&&h<18?3:0.7):profile==='industrial'?1:profile==='res_day'?(h>=7&&h<19?2:1):(h>=17&&h<23?3:h>=6&&h<9?1.5:0.7);});
    const sum=a=>a.reduce((s,v)=>s+v,0), pvSum=sum(pvWeights), loadSum=sum(loadWeights), out=[];
    for(const [monthIndex,m] of monthly.entries()) {
      const days=num(m.days)||30, dailyPv=Math.max(0,num(m.E_mon)||0)/days;
      const seasonalLoad=num(options.monthlyLoadKwh?.[monthIndex]);
      const dailyLoad=Number.isFinite(seasonalLoad)?Math.max(0,seasonalLoad)/days:Math.max(0,num(annualLoad)||0)/365;
      let soc=0;
      let day;
      // Warm up repeated typical days; only the final day is counted (cyclic SOC).
      for(let cycle=0;cycle<8;cycle++) {
        day={month:m.month,monthName:m.monthName,days,pvKwh:0,selfKwh:0,importKwh:0,exportKwh:0,priorityKwh:0,otherKwh:0,batteryLossKwh:0,curtailedKwh:0,chargedKwh:0,dischargedKwh:0};
        const startSoc=soc;
        for(let i=0;i<48;i++) {
          const h=(i+.5)/2, priority=h>=17.5&&h<21.5;
          const rawGeneration=dailyPv*pvWeights[i]/pvSum, pvPower=num(options.pvPowerKW);
          const generation=pvPower>0?Math.min(rawGeneration,pvPower*0.5):rawGeneration, load=dailyLoad*loadWeights[i]/loadSum;
          const direct=mode==='net_plus'?0:Math.min(generation,load);
          let surplus=generation-direct, deficit=load-direct, discharged=0;
          if(usable>0&&h<17.5) {
            const charge=Math.min(surplus,chargeMax*0.5,(usable-soc)/eta);
            soc+=charge*eta;surplus-=charge;day.chargedKwh+=charge;day.batteryLossKwh+=charge*(1-eta);
          }
          const mayDischarge=usable>0&&(mode==='priority_export'?priority:mode==='net_plus'?priority:(!surplus&&deficit>0));
          if(mayDischarge) {
            const demand=mode==='priority_export'||mode==='net_plus'?Infinity:deficit;
            discharged=Math.min(soc*eta,dischargeMax*0.5,demand);
            soc-=discharged/eta;day.dischargedKwh+=discharged;day.batteryLossKwh+=discharged/eta-discharged;
          }
          const batteryToLoad=mode==='net_plus'?0:Math.min(deficit,discharged);
          deficit-=batteryToLoad;
          const rawExport=surplus+discharged-batteryToLoad;
          const exportLimit=num(options.exportKW);
          const exported=Number.isFinite(exportLimit)&&exportLimit>=0?Math.min(rawExport,exportLimit*0.5):rawExport;
          day.pvKwh+=rawGeneration;day.selfKwh+=direct+batteryToLoad;day.importKwh+=deficit;day.exportKwh+=exported;day.curtailedKwh+=rawExport-exported+rawGeneration-generation;
          if(priority) day.priorityKwh+=exported; else day.otherKwh+=exported;
        }
        day.socDeltaKwh=soc-startSoc;
      }
      for(const key of ['pvKwh','selfKwh','importKwh','exportKwh','priorityKwh','otherKwh','batteryLossKwh','curtailedKwh','chargedKwh','dischargedKwh','socDeltaKwh']) day[key]*=days;
      out.push(day);
    }
    const total={};
    for(const key of ['pvKwh','selfKwh','importKwh','exportKwh','priorityKwh','otherKwh','batteryLossKwh','curtailedKwh','chargedKwh','dischargedKwh','socDeltaKwh']) total[key]=out.reduce((s,r)=>s+r[key],0);
    return {monthly:out,total,method:'48 half-hour steps on a repeated typical day per month; PV-only charging, cyclic SOC, separate charge/discharge power and round-trip losses. Planning estimate, not measured annual dispatch.'};
  }
  function settle(periods, terms, year=1, initialBankKwh=0) {
    const scheme=terms.scheme, payable=[], physical=periods.reduce((s,p)=>s+Math.max(0,num(p.otherKwh)||0)+Math.max(0,num(p.priorityKwh)||0),0);
    let bank=Math.max(0,num(initialBankKwh)||0), offset=0, excluded=0;
    for(const p of periods) {
      let other=Math.max(0,num(p.otherKwh)||0), priority=Math.max(0,num(p.priorityKwh)||0), imports=Math.max(0,num(p.importKwh)||0), total=other+priority;
      if(scheme==='zero_export'||scheme==='offgrid'||terms.status==='expired') {payable.push({...p,otherKwh:0,priorityKwh:0});continue;}
      if(scheme==='net_metering') {
        const available=bank+total, used=Math.min(available,imports);
        offset+=used;bank=available-used;payable.push({...p,otherKwh:0,priorityKwh:0});continue;
      }
      if(scheme==='net_accounting') {
        if(terms.exportCapPer30Days!==null) {
          const limit=terms.exportCapPer30Days*(num(p.days)||30)/30;
          const eligible=Math.min(total,limit);
          // Conservative estimate where contractual allocation is not supplied:
          // retain ordinary-rate units first under the cap, then offset priority units first.
          const low=Math.min(other,eligible), high=Math.min(priority,Math.max(0,eligible-low));
          excluded+=total-eligible;other=low;priority=high;total=eligible;
        }
        const used=Math.min(total,imports), peakUsed=Math.min(priority,used);
        priority-=peakUsed;other-=used-peakUsed;offset+=used;
      }
      payable.push({...p,otherKwh:other,priorityKwh:priority});
    }
    const income=scheme==='net_metering'||scheme==='zero_export'||scheme==='offgrid'||terms.status==='expired'?{amount:0,paidKwh:0,unpaidKwh:0,priorityPaidKwh:0}:revenue(payable,terms,year);
    return {...income,physicalExportKwh:physical,offsetKwh:offset,bankedKwh:scheme==='net_metering'?bank:0,unpaidKwh:(income.unpaidKwh||0)+excluded,payablePeriods:payable,method:'Retail monthly net settlement. For BESS Net Accounting, conservative cap/offset allocation is used until the DL/SPPA time-band allocation is confirmed.'};
  }
  return {VERSION,SOURCES,BESS_STANDARDS,INVERTER_REFERENCES,BATTERY_REFERENCES,EVIDENCE,evaluate,tariff,revenue,dispatch,settle};
})();
