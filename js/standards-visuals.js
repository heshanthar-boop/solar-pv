/** Offline SVG lessons. Concept illustrations share no state with project calculations. */
const StandardsVisuals = (() => {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const LESSONS = {
    energy: {title:'Energy flow',icon:'yield',intro:'Follow electricity from sunlight to your home, battery and utility.',source:'interconnection',steps:[
      ['Use sunlight first','During daylight, solar energy can serve the connected loads. Moving lines show direction, not measured power.','Check the actual load profile and inverter conversion limits.'],
      ['Store the surplus','Available solar energy can charge a compatible battery within its continuous power and current limits.','Usable kWh describes stored energy; kW describes the rate of charging or discharging.'],
      ['Use stored energy at night','The battery can support loads when solar production falls. A grid-connected site imports any remaining shortfall.','Backup operation needs its correctly isolated circuit and sufficient energy and power.'],
      ['Respect the export limit','An approved export limiter restricts power sent to the utility. Excess energy may be stored or curtailed.','Zero export still needs the applicable grid clearance, protection and control evidence.'] ]},
    storage: {title:'Battery sizing',icon:'hybrid',intro:'Change the two sliders and watch the energy-to-power relationship.',source:'framework',steps:[
      ['Start with continuous power','Use the connected inverter’s continuous kW rating. A short surge rating is a different capability.','Confirm the exact inverter model and installed unit count.'],
      ['Use declared usable energy','Use manufacturer-declared usable kWh. Nominal energy and V × Ah × DoD estimates do not replace that declaration.','Do not apply DoD a second time to already declared usable energy.'],
      ['Compare energy with power','The standard criterion is usable kWh ≤ 5 × continuous inverter kW. The quotient has units of hours.','A 5 kW inverter gives a 25 kWh standard-criterion maximum.'],
      ['Record a justified exception','More than five hours requires a documented Chartered Electrical Engineer assessment for review.','Passing this single sizing criterion does not approve the complete installation.'] ]},
    array: {title:'PV strings & roof',icon:'systemdesigner',intro:'See why series, parallel, temperature and mounting are checked separately.',source:'interconnection',steps:[
      ['Series adds voltage','Panels connected in series add their voltages. The string must stay inside the inverter’s permitted voltage range.','Check cold Voc and hot/cold Vmp against the exact datasheets.'],
      ['Parallel adds current','Parallel strings add their currents at the tracker. Operating-current and short-circuit limits are separate checks.','Confirm each MPPT’s limits and allowed strings; do not use a total current as a per-tracker value.'],
      ['Match the equipment','Panel count, connected trackers and inverter input ratings must agree with the proposed array.','Reconcile the wired module power with the entered DC array kWp.'],
      ['Check the supporting roof','The roof, anchors, access and installation boundary form part of the design.','Roof-slab installations or supports more than 1 m above the roof need applicable structural certification.'] ]},
    protection: {title:'Protection layers',icon:'fault',intro:'Different protective devices perform different jobs.',source:'framework',steps:[
      ['Use coordinated protection','Isolation, overcurrent devices, earthing, SPDs and the appropriate RCD selection work together.','Use an approved design and coordinated device ratings.'],
      ['Divert a transient','A correctly selected SPD helps limit a transient overvoltage through the designed protective path.','An SPD does not replace an isolator, overcurrent protection or lightning risk assessment.'],
      ['Interrupt a fault','Overcurrent protection interrupts the affected circuit; isolation provides the designed separation.','Verify the device, conductor and fault-rating coordination.'],
      ['Verify emergency shutdown','The external ESD must be visible and accessible. Its tested response isolates the battery, stops charging/discharging and trips the relevant breakers.','Fire measures depend on installation scale and applicable requirements; the animation is not an operating procedure.'] ]},
    grid: {title:'Grid & islanding',icon:'utilityvalidator',intro:'Backup power and utility export use distinct, verified operating arrangements.',source:'interconnection',steps:[
      ['Normal grid connection','The inverter operates with the utility under the project’s approved protection and control settings.','Use the actual DL-approved schedule; old reference presets do not grant approval.'],
      ['Utility supply is lost','Anti-islanding protection prevents the inverter from sustaining an unintended utility island.','Confirm type-test evidence and the accepted commissioning checks.'],
      ['An isolated backup circuit','A compatible hybrid can supply a designed backup circuit after the required isolation. It must not energise the disconnected utility.','Confirm transfer/isolation arrangements and the OEM-supported topology.'],
      ['Return under approved conditions','Grid-connected operation resumes only under the approved settings and interconnection arrangement.','Do not infer universal trip or reconnection times from this illustration.'] ]},
    testing: {title:'Tests & handover',icon:'fieldtest',intro:'A certificate, a site measurement and written acceptance answer different questions.',source:'interconnection',steps:[
      ['Inspect before testing','Confirm equipment, labels, protective conductors, isolation and the as-built layout against the approved design.','Competent personnel follow an accepted test plan and safe test procedure.'],
      ['Check insulation and continuity','Appropriate insulation and protective-conductor tests help identify installation defects.','Test voltages and acceptance limits come from the applicable procedure and system.'],
      ['Compare measured performance','Compare string measurements with the model’s datasheet and relevant temperature or irradiance correction.','Record conditions, calibrated instruments and results; one reading does not establish all performance.'],
      ['Complete the handover','Commissioning results, settings, drawings and O&M information form the evidence pack.','A completed drawing or animation is not a test result or written utility acceptance.'] ]},
    quality: {title:'Equipment & quality',icon:'database',intro:'Follow qualification evidence from the exact product to its installed system.',source:'standards',steps:[
      ['Qualify the exact product','Module qualification, electrical safety and inverter safety cover different product characteristics.','Confirm exact model, certificate scope, accredited report and current registration.'],
      ['Verify battery performance','Cycle life depends on the declared DoD, C-rate, retained capacity and test ambient. Battery efficiency and cell energy density need their own evidence.','Residential: 6000 cycles; commercial/industrial: 8000, at the specified conditions.'],
      ['Check installation conditions','Ingress, ventilation, clearances, corrosion, protected wiring and thermal/fire measures cover the installed environment.','Minimum IP54 applies to the pack/module and the required installation enclosure; enclosure evidence is separate.'],
      ['Check chemistry and second life','Stationary lithium safety, renewable storage testing, NiMH and repurposing standards have distinct scopes.','A repurposed battery needs its applicable assessment. A new-battery brochure or different chemistry standard is not a substitute.'] ]},
    conditions: {title:'Heat, shade & ageing',icon:'temp',intro:'The same panel behaves differently as its conditions change.',source:null,steps:[
      ['Cold can raise voltage','Lower cell temperature generally raises PV open-circuit voltage.','Use the manufacturer’s voltage coefficient and the site’s cold design temperature.'],
      ['Heat reduces output','Higher cell temperature generally reduces voltage and power for conventional crystalline PV modules.','Use the selected module’s coefficients and thermal model.'],
      ['Shade changes the string','Uneven irradiance can constrain string current and cause mismatch or bypass-diode behaviour.','Study the layout and shading pattern; this picture does not predict a numerical loss.'],
      ['Track long-term change','Ageing and stress can change output over time. PID is a specific degradation mechanism requiring appropriate evidence.','Separate a measured fault, a warranty assumption and a documented degradation trend.'] ]},
    monitoring: {title:'Monitoring & BMS',icon:'pr',intro:'Measurements explain what happened; retained records help explain why.',source:'framework',steps:[
      ['Measure the right quantities','PV monitoring records energy and relevant irradiance/temperature. BMS monitoring includes voltage, current, temperature, SoC and SoH.','Verify sensors, compatible communications and event logging.'],
      ['Compare with a reference','Compare delivered output with a reference that accounts for conditions and system size.','Performance ratio is not simply the inverter’s conversion efficiency.'],
      ['Investigate a change','A drop can reflect weather, shade, clipping, equipment limits or a fault.','Use measurements and inspections before deciding which cause applies.'],
      ['Keep useful records','BESS on-site non-volatile parameters, events and alarms require at least 12 months of retention.','Above 50 kW BESS, utility communication hardware capability is an additional requirement.'] ]},
    settlement: {title:'Meters & billing',icon:'financials',intro:'Physical energy flow and payment eligibility are different calculations.',source:'schemes',steps:[
      ['Read both energy directions','This simple retail example starts with no historical banked units. Import and export occur at different times during one billing period.','Meter arrangement alone does not decide the commercial scheme.'],
      ['Net Metering: bank units','Export offsets imports; remaining surplus becomes unit credit in this simplified example. It is not paid as cash.','Existing credit ledgers, validity and the applicable agreement must be considered in a real bill.'],
      ['Net Accounting: offset first','Offset billing-period imports before identifying cash-eligible surplus.','Apply the signed scheme, eligible tariff and any BESS payable cap/time-band conditions separately.'],
      ['Net Plus: separate settlement','Generation export is settled separately from the load’s import bill.','Use the approved gross-export arrangement. Bulk PV-only daytime metering needs its own quantities; this illustration is a retail example.'] ]},
    approval: {title:'Evidence & approval',icon:'checklist',intro:'Follow a project from requirements through installation and ongoing maintenance.',source:'framework',steps:[
      ['Gather the design evidence','Collect exact product declarations, registration, provider competence, compatibility and the engineering design.','A model preset is a reference, not a conformity certificate.'],
      ['Review the project','Check sizing, electrical limits, roof/supports, protection and project-specific approvals.','Unknown values stay marked for review. Documented exceptions need assessment.'],
      ['Commission and obtain acceptance','Complete the accepted tests and provide settings, drawings, reports and the required written acceptance.','A checklist declaration records evidence; the app does not independently issue utility approval.'],
      ['Maintain and document','Keep as-built/O&M records, scheduled inspections, event logs and the end-of-life/recycling plan.','The system lifecycle continues after installation and commissioning.'] ]},
  };
  const STANDARD_TOPICS = {
    iec62446:'testing',iec61215:'quality',iec61730:'protection',iec60364:'protection',iec61643:'protection',iec62305:'protection',iec60269_6:'protection',iec61724:'monitoring',iec62804:'conditions',iec62548:'array',pucsl:'approval',ceb_leco_approval:'grid',iec62116:'grid',sls1522:'array',sl_supporting_pack:'quality',sls1543:'protection',sls1547:'grid',iec61853:'conditions',pv_degradation:'conditions'
  };
  let sequence=0;
  function storageState(power,energy) {
    if(power===null||energy===null||power===''||energy==='')return {status:'review',hours:null,max:null,fill:0};
    const p=Number(power),e=Number(energy);
    if(!Number.isFinite(p)||!Number.isFinite(e)||p<=0||e<0)return {status:'review',hours:null,max:null,fill:0};
    return {status:e<=5*p?'within':'assessment',hours:e/p,max:5*p,fill:Math.min(1,e/(5*p))};
  }
  function settlementExample(imports,exports,step) {
    const i=Number(imports),e=Number(exports);
    if(!Number.isFinite(i)||!Number.isFinite(e)||i<0||e<0)return null;
    const offset=step===1||step===2?Math.min(i,e):0;
    return {offset,remainingImport:i-offset,banked:step===1?Math.max(0,e-i):0,paidUnits:step===2?Math.max(0,e-i):step===3?e:0};
  }
  function icon(name){return typeof WorkspaceUI!=='undefined'?WorkspaceUI.icon(name):'';}
  function hub(topic='energy',compact=false) {
    const id=`sv-${++sequence}`;
    return `<section class="sv-hub card ${compact?'sv-compact':''}" data-sv-root data-sv-topic="${esc(topic)}" data-sv-id="${id}" data-sv-paused="true" aria-label="Animated standards guide">
      <div class="sv-header"><div><p class="eyebrow">VISUAL LEARNING · PV + BESS</p><h2 tabindex="-1">Understand the standards, one step at a time.</h2><p class="sv-subtitle">Follow the illustration. Try an example. Then check the exact requirement.</p></div><span class="sv-offline">${icon('standards')}Works offline</span></div>
      ${compact?'':`<div class="sv-topics" role="group" aria-label="Choose an illustrated topic">${Object.entries(LESSONS).map(([key,l])=>`<button type="button" data-sv-topic-button="${key}" aria-pressed="${key===topic}">${icon(l.icon)}<span>${esc(l.title)}</span></button>`).join('')}</div>`}
      <p class="sv-context" data-sv-context hidden></p>
      <div class="sv-player" data-sv-player></div>
      <div class="sv-controls"><button type="button" class="btn btn-secondary btn-sm" data-sv-play aria-pressed="false">Play animation</button><div class="sv-step-controls"><button type="button" class="btn btn-secondary btn-sm" data-sv-prev aria-label="Previous illustration step">← Previous</button><span data-sv-count></span><button type="button" class="btn btn-secondary btn-sm" data-sv-next aria-label="Next illustration step">Next →</button></div></div>
      <p class="sv-caption">Concept illustration. The project calculators and source-linked requirements determine the actual design review. Line movement indicates direction, not measured power.</p>
      ${compact?'':`<details class="sv-glossary"><summary>Plain-English terms: kW, kWh, MPPT, BMS and more</summary><dl>${[
        ['kW · power','How quickly energy is delivered. Continuous kW is the rating a device can sustain under its stated conditions.'],
        ['kWh · energy','How much energy is stored or used. 1 kW sustained for 1 hour equals 1 kWh.'],
        ['MPPT','Maximum power point tracking: an inverter input controller that finds an operating point for the connected PV strings.'],
        ['Voc / Vmp','Voc is the open-circuit voltage. Vmp is the voltage at the module’s maximum-power operating point.'],
        ['BMS / SoC / SoH','Battery management system / state of charge / state of health. These describe battery supervision, current charge and condition.'],
        ['DoD / round-trip efficiency','Depth of discharge is the share of battery capacity used. Round-trip efficiency compares energy discharged with energy charged.'],
        ['SPD / ESD','Surge protective device / emergency shutdown. Their purposes differ; one does not replace the other.'],
        ['DL / SPPA','Distribution licensee (the utility) / standard power purchase agreement. Use the project’s actual approvals and signed agreement.']
      ].map(([term,meaning])=>`<div><dt>${esc(term)}</dt><dd>${esc(meaning)}</dd></div>`).join('')}</dl></details>`}
    </section>`;
  }
  function help(topic) {return `<details class="sv-help"><summary>${icon(LESSONS[topic]?.icon||'standards')}See an animated explanation</summary>${hub(topic,true)}</details>`;}
  function path(d,active=true,extra=''){return `<path d="${d}" class="sv-wire ${active?'sv-flow':''} ${extra}" ${active?'data-sv-arrow':''}/>`;}
  function node(x,y,type,label,sub='',cls='') {
    const symbols={pv:'<path d="M-36-22h72l9 44h-90zM-18-22l-4 44M0-22v44M18-22l4 44M-39-7h78M-42 8h84"/>',battery:'<rect x="-30" y="-31" width="60" height="62" rx="6"/><path d="M-12-31v-6h24v6"/><path d="M-18-15h36v30h-36z" class="sv-charge"/>',inverter:'<rect x="-30" y="-34" width="60" height="68" rx="7"/><path d="M-18-19h36v12h-36zM-19 12c12-26 26 26 38 0"/>',home:'<path d="m-39-3 39-31L39-3M-29-9v42h58V-9M-7 33V9H7v24"/>',grid:'<path d="m0-37-24 72M0-37l24 72M-32-13h64M-39 8h78M-16-13l30 21M16-13-30 21M-14 8l36 27M14 8l-36 27"/>',meter:'<rect x="-34" y="-30" width="68" height="60" rx="8"/><path d="M-24 1a24 24 0 0 1 48 0M0 1l12-15M-18 18h36"/>',shield:'<path d="M0-37-30-24V0C-30 21 0 35 0 35S30 21 30 0v-24zM-14-1l10 10L17-15"/>',report:'<rect x="-28" y="-36" width="56" height="72" rx="5"/><path d="M-16-19h32M-16-5h32M-16 9h23M-16 23h17"/>',sensor:'<circle r="30"/><path d="M-15 0h8l6-17L6 17l6-17h8"/>'};
    return `<g transform="translate(${x} ${y})" class="sv-node ${cls}"><rect x="-72" y="-62" width="144" height="142" rx="18" class="sv-node-bg"/><g class="sv-symbol">${symbols[type]||symbols.report}</g><text y="57" text-anchor="middle" class="sv-node-label">${esc(label)}</text>${sub?`<text y="101" text-anchor="middle" class="sv-node-sub">${esc(sub)}</text>`:''}</g>`;
  }
  function svg(body,label) {const id=`sv-arrow-${++sequence}`;return `<svg class="sv-diagram" viewBox="0 0 900 410" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><defs><marker id="${id}" markerWidth="5" markerHeight="5" refX="4" refY="2" orient="auto"><path d="M0 0 4 2 0 4Z" fill="context-stroke"/></marker></defs>${body.replaceAll('data-sv-arrow',`marker-end="url(#${id})"`)}</svg>`;}
  function energyDiagram(step,gridTopic=false) {
    const night=step===2,limited=step===3&&!gridTopic,disconnected=gridTopic&&(step===1||step===2);
    let wires=path('M197 130H358',!night&&!disconnected);
    wires+=path('M502 130H673',!disconnected||step===2);
    wires+=night?path('M155 242V225H430V210',true,'sv-battery-flow'):path('M430 210V225H155V242',step===1,'sv-battery-flow');
    wires+=path(night&&!gridTopic?'M673 304H577V151H503':'M503 151H577V304H673',!limited&&!disconnected,'sv-grid-flow');
    return svg(`<text x="44" y="38" class="sv-diagram-note">${gridTopic?(disconnected?'UTILITY PATH ISOLATED':'APPROVED GRID ARRANGEMENT'):night?'NIGHT · STORED ENERGY':limited?'ZERO EXPORT · LIMITER ACTIVE':'DAYLIGHT · SOLAR ENERGY'}</text>${wires}${node(125,130,'pv','Solar PV',night?'No solar at night':'DC energy',night?'sv-muted':'')}${node(430,130,'inverter','Inverter','Conversion & control')}${node(745,130,'home','Loads','Local consumption')}${node(155,304,'battery','Battery',night?'Discharging':step===1?'Charging':'Usable storage')}${node(745,304,'grid','Utility',disconnected?'Disconnected':limited?'Export restricted':'Import / export',disconnected||limited?'sv-muted':'')}${limited||disconnected?`<g class="sv-stop" transform="translate(577 226)"><circle r="24"/><path d="M-11-11 11 11M-11 11 11-11"/></g>`:''}`,LESSONS[gridTopic?'grid':'energy'].steps[step][1]);
  }
  function storageDiagram(power,energy) {
    const s=storageState(power,energy),color=s.status==='assessment'?'sv-amber':'';
    return svg(`<text x="45" y="38" class="sv-diagram-note">USABLE ENERGY / CONTINUOUS POWER</text>${node(151,175,'inverter','Inverter',`${power} kW continuous`)}${path('M223 175H367',true)}<g transform="translate(420 89)" class="${color}"><rect width="394" height="173" rx="24" class="sv-storage-shell"/><rect x="394" y="59" width="14" height="55" rx="4" class="sv-storage-terminal"/><rect x="12" y="12" width="${370*s.fill}" height="149" rx="14" class="sv-storage-fill sv-breathe"/>${[1,2,3,4].map(i=>`<path d="M${12+74*i} 13v147" class="sv-storage-divider"/>`).join('')}<text x="197" y="98" text-anchor="middle" class="sv-storage-value">${energy} kWh</text></g><text x="617" y="293" text-anchor="middle" class="sv-node-sub">Standard-criterion maximum: ${s.max} kWh</text><text x="450" y="362" text-anchor="middle" class="sv-big-equation">${energy} kWh ÷ ${power} kW = ${s.hours?.toFixed(1)} hours</text>`,'Battery usable energy compared with five times continuous inverter power');
  }
  function arrayDiagram(step) {
    const panel=(x,y)=>`<g transform="translate(${x} ${y})" class="sv-panel"><rect width="102" height="65" rx="5"/><path d="M25 0v65M51 0v65M77 0v65M0 22h102M0 44h102"/></g>`;
    const row=y=>`${panel(75,y)}${panel(220,y)}${panel(365,y)}${path(`M177 ${y+33}H220`,true)}${path(`M322 ${y+33}H365`,true)}`;
    return svg(`<text x="45" y="38" class="sv-diagram-note">${['SERIES · VOLTAGES ADD','PARALLEL · CURRENTS ADD','MATCH STRINGS TO EACH TRACKER','ROOF · ANCHORS · ACCESS'][step]}</text>${row(112)}${step===1?row(265):''}${path('M467 145H600V177H652',true)}${step===1?path('M467 298H600V177',true):''}${node(724,177,'inverter','Inverter','Check each MPPT')}${step===3?`<path d="M55 211H520M115 177v34M405 177v34M92 213v118h380V213" class="sv-structure"/><text x="282" y="355" text-anchor="middle" class="sv-node-sub">Structural evidence is separate from PV electrical checks</text>`:`<text x="267" y="${step===1?377:258}" text-anchor="middle" class="sv-big-equation">${step===0?'Vstring = V1 + V2 + V3':step===1?'Itracker = Istring 1 + Istring 2':'Cold Voc · hot Vmp · operating A · short-circuit A'}</text>`}`,LESSONS.array.steps[step][1]);
  }
  function protectionDiagram(step) {
    const interrupted=step>=2;
    return svg(`<text x="45" y="38" class="sv-diagram-note">${['LAYERED PROTECTION','SPD · DESIGNED PROTECTIVE PATH','AFFECTED CIRCUIT INTERRUPTED','EMERGENCY SHUTDOWN VERIFIED'][step]}</text>${node(126,171,step===3?'battery':'pv',step===3?'BESS':'PV array')}${path('M198 171H338',!interrupted)}${node(410,171,'shield',step===1?'SPD':step===3?'ESD / isolation':'Protection')}${path('M483 171H650',!interrupted)}${node(722,171,'inverter','Inverter')}${path('M410 251V326',step===1,'sv-earth-flow')}<path d="M379 326h62M389 340h42M400 354h20" class="sv-structure"/><text x="410" y="389" text-anchor="middle" class="sv-node-sub">${step===1?'Designed earthing / bonding path':interrupted?'Charge / discharge and affected energy path stopped':'Protective conductors and coordinated devices'}</text>${step===1?`<path d="m408 52-21 39h22l-8 30 32-43h-23l15-26z" class="sv-lightning sv-breathe"/>`:''}${interrupted?`<g class="sv-stop" transform="translate(550 171)"><circle r="25"/><path d="M-10 10 10-10"/></g>`:''}`,LESSONS.protection.steps[step][1]);
  }
  function processDiagram(topic,step) {
    const sets={testing:[['pv','Inspect'],['meter','Test'],['sensor','Compare'],['report','Record']],quality:[['shield','Exact model'],['battery','Performance'],['home','Installation'],['report','Scope evidence']],approval:[['report','Design'],['shield','Review'],['meter','Commission'],['report','O&M records']]};
    const parts=sets[topic];
    return svg(`<text x="45" y="38" class="sv-diagram-note">${topic==='approval'?'SYSTEM LIFECYCLE':topic==='quality'?'PRODUCT + INSTALLATION EVIDENCE':'INSPECTION + MEASUREMENT + RECORDS'}</text>${parts.map(([type,label],i)=>`${i<3?path(`M${172+i*204} 165H${230+i*204}`,i<=step):''}${node(101+i*204,165,type,label,`STEP ${i+1}`,i===step?'sv-selected':'sv-muted')}<circle cx="${101+i*204}" cy="320" r="19" class="sv-stage-dot ${i===step?'sv-breathe':''}"/><text x="${101+i*204}" y="326" text-anchor="middle" class="sv-stage-number">${i+1}</text>`).join('')}`,LESSONS[topic].steps[step][1]);
  }
  function conditionsDiagram(step) {
    const high=step===0,hot=step===1;
    return svg(`<text x="45" y="38" class="sv-diagram-note">${['COLD CELLS · CHECK VOLTAGE','HOT CELLS · CHECK OUTPUT','UNEVEN SHADE · MISMATCH','AGEING / STRESS · VERIFY THE CAUSE'][step]}</text>${node(150,175,'pv','PV module',step===2?'Uneven irradiance':'Conditions matter')}<g transform="translate(342 75)"><rect x="0" y="0" width="34" height="165" rx="17" class="sv-thermometer"/><rect x="8" y="${hot?15:100}" width="18" height="${hot?140:55}" rx="9" class="sv-temperature ${hot?'sv-hot':'sv-cold'} sv-breathe"/><circle cx="17" cy="179" r="30" class="sv-temperature ${hot?'sv-hot':'sv-cold'}"/></g><g transform="translate(465 107)"><text y="-18" class="sv-node-sub">Relative voltage / output illustration</text><rect width="315" height="40" rx="8" class="sv-meter-track"/><rect width="${high?295:step===2?145:step===3?175:200}" height="40" rx="8" class="sv-storage-fill"/><text y="77" class="sv-node-sub">No percentage loss is inferred here</text></g>${step===2?'<rect x="91" y="113" width="118" height="70" rx="12" class="sv-shade"/>':''}<text x="450" y="357" text-anchor="middle" class="sv-big-equation">Use datasheet coefficients + measured site conditions</text>`,LESSONS.conditions.steps[step][1]);
  }
  function monitoringDiagram(step) {
    return svg(`<text x="45" y="38" class="sv-diagram-note">MONITOR · COMPARE · INVESTIGATE · RETAIN</text>${node(134,179,step===0?'sensor':'battery',step===0?'Sensors':'BMS','Parameters + events')}${path('M207 179H313',true)}<g transform="translate(330 83)"><rect width="478" height="230" rx="16" class="sv-node-bg"/><path d="M35 186H449M35 36v150" class="sv-chart-axis"/><path d="M35 161 88 123 141 107 194 75 247 68 300 89 353 115 406 138" class="sv-chart-reference"/><path d="M35 174 88 137 141 122 194 87 247 81 300 ${step===2?163:103} 353 ${step===2?165:130} 406 156" class="sv-chart-measured sv-breathe"/><text x="37" y="216" class="sv-node-sub">Illustrative trend · not project telemetry</text></g><text x="450" y="370" text-anchor="middle" class="sv-big-equation">${step===3?'BESS local records: at least 12 months':'Conditions + measurements help explain a change'}</text>`,LESSONS.monitoring.steps[step][1]);
  }
  function settlementDiagram(step,imports,exports) {
    const r=settlementExample(imports,exports,step);
    return svg(`<text x="45" y="38" class="sv-diagram-note">${['BILLING-PERIOD IMPORT + EXPORT','NET METERING · UNITS','NET ACCOUNTING · SURPLUS','NET PLUS · SEPARATE IMPORT BILL'][step]}</text>${node(118,161,'home','Site')}${path('M190 143H355',true,'sv-battery-flow')}${path('M355 180H190',true,'sv-grid-flow')}${node(427,161,'meter','Meter',`${imports} in / ${exports} out`)}${path('M499 161H663',true)}${node(736,161,'grid','Utility')}<g class="sv-billing-labels"><text x="450" y="326" text-anchor="middle" class="sv-big-equation">${step===0?'Energy totals do not automatically equal cash income':step===1?`${r.offset} kWh offset · ${r.banked} kWh banked`:step===2?`${r.offset} kWh offset · ${r.paidUnits} kWh cash-eligible surplus`:`${r.paidUnits} kWh export · ${imports} kWh import bill`}</text><text x="450" y="370" text-anchor="middle" class="sv-node-sub">${step===1?'Cash export: zero in Net Metering':'Eligibility, tariff, caps and signed agreement apply'}</text></g>`,LESSONS.settlement.steps[step][1]);
  }
  function diagram(topic,step,state) {
    if(topic==='energy'||topic==='grid')return energyDiagram(step,topic==='grid');
    if(topic==='storage')return storageDiagram(state.power,state.energy);
    if(topic==='array')return arrayDiagram(step);
    if(topic==='protection')return protectionDiagram(step);
    if(topic==='conditions')return conditionsDiagram(step);
    if(topic==='monitoring')return monitoringDiagram(step);
    if(topic==='settlement')return settlementDiagram(step,state.imports,state.exports);
    return processDiagram(topic,step);
  }
  function slider(id,key,label,value,min,max,unit) {return `<label class="sv-slider" for="${id}-${key}"><span>${label}<output data-sv-value="${key}">${value} ${unit}</output></span><input type="range" id="${id}-${key}" data-sv-input="${key}" min="${min}" max="${max}" step="1" value="${value}" aria-label="${label}"/><span class="sv-range-ends"><span>${min} ${unit}</span><span>${max} ${unit}</span></span></label>`;}
  function sourceLink(topic) {const key=LESSONS[topic].source,s=typeof DirectiveRules!=='undefined'?DirectiveRules.SOURCES[key]:null;return s?.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Read the source document ↗</a>`:'';}
  function bind(container) {
    container.querySelectorAll('[data-sv-root]').forEach(root=>{
      if(root.dataset.svBound)return;
      root.dataset.svBound='true';
      const reduced=typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      const state={topic:LESSONS[root.dataset.svTopic]?root.dataset.svTopic:'energy',step:0,power:5,energy:20,imports:300,exports:400,paused:reduced};
      root._svState=state;
      const paintDiagram=()=>{
        root.querySelector('[data-sv-diagram]').innerHTML=diagram(state.topic,state.step,state);
        const status=root.querySelector('[data-sv-storage-status]');
        if(status){const s=storageState(state.power,state.energy);status.className=`sv-example-status ${s.status==='assessment'?'sv-example-review':''}`;status.textContent=s.status==='within'?`Within the 5-hour criterion · ${s.hours.toFixed(1)} hours`:`Engineering assessment required · ${s.hours.toFixed(1)} hours`;}
      };
      const paint=()=>{
        const l=LESSONS[state.topic],step=l.steps[state.step],id=root.dataset.svId;
        root.dataset.svTopic=state.topic;
        root.dataset.svPaused=String(state.paused);
        root.querySelectorAll('[data-sv-topic-button]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.svTopicButton===state.topic)));
        root.querySelector('[data-sv-player]').innerHTML=`<div class="sv-scene"><div class="sv-scene-title"><span>${icon(l.icon)}${esc(l.title)}</span><span>STEP ${state.step+1} OF ${l.steps.length}</span></div><div data-sv-diagram tabindex="0" role="region" aria-label="Scrollable illustration"></div>${state.topic==='storage'?`<div class="sv-example-inputs">${slider(id,'power','Continuous inverter power',state.power,1,40,'kW')}${slider(id,'energy','Declared usable battery energy',state.energy,0,200,'kWh')}</div><p data-sv-storage-status class="sv-example-status"></p>`:state.topic==='settlement'?`<div class="sv-example-inputs">${slider(id,'imports','Billing-period import',state.imports,0,1000,'kWh')}${slider(id,'exports','Billing-period export',state.exports,0,1000,'kWh')}</div>`:''}</div><div class="sv-explanation"><p class="eyebrow">THE IDEA</p><h3 aria-live="polite">${esc(step[0])}</h3><p>${esc(step[1])}</p><div class="sv-check"><strong>What to check</strong><p>${esc(step[2])}</p></div><ol class="sv-steps">${l.steps.map((s,i)=>`<li><button type="button" data-sv-step="${i}" aria-current="${state.step===i?'step':'false'}"><span>${i+1}</span>${esc(s[0])}</button></li>`).join('')}</ol><div class="sv-source">${sourceLink(state.topic)}<span>Exact conditions remain in the requirement tables.</span></div></div>`;
        root.querySelector('[data-sv-count]').textContent=`${state.step+1} / ${l.steps.length}`;
        root.querySelector('[data-sv-prev]').disabled=state.step===0;
        root.querySelector('[data-sv-next]').disabled=state.step===l.steps.length-1;
        const play=root.querySelector('[data-sv-play]');play.textContent=reduced?'Reduced motion enabled':state.paused?'Play animation':'Pause animation';play.disabled=reduced;play.setAttribute('aria-pressed',String(!state.paused));
        paintDiagram();
      };
      root._svPaint=paint;
      root.addEventListener('click',e=>{
        const b=e.target.closest('button');if(!b)return;
        if(b.hasAttribute('data-sv-topic-button')){state.topic=b.dataset.svTopicButton;state.step=0;root.querySelector('[data-sv-context]').hidden=true;}
        else if(b.hasAttribute('data-sv-step'))state.step=Number(b.dataset.svStep);
        else if(b.hasAttribute('data-sv-prev'))state.step=Math.max(0,state.step-1);
        else if(b.hasAttribute('data-sv-next'))state.step=Math.min(LESSONS[state.topic].steps.length-1,state.step+1);
        else if(b.hasAttribute('data-sv-play')){state.paused=!state.paused;root.dataset.svPaused=String(state.paused);b.textContent=state.paused?'Play animation':'Pause animation';b.setAttribute('aria-pressed',String(!state.paused));return;}
        else return;
        paint();
        // Repainted step buttons keep keyboard focus on the chosen step.
        if(b.hasAttribute('data-sv-step'))root.querySelector(`[data-sv-step="${state.step}"]`).focus();
      });
      root.addEventListener('input',e=>{
        const key=e.target.dataset.svInput;if(!key)return;
        e.stopPropagation();
        state[key]=Number(e.target.value);
        root.querySelector(`[data-sv-value="${key}"]`).textContent=`${state[key]} ${key==='power'?'kW':'kWh'}`;
        paintDiagram();
      });
      root.addEventListener('change',e=>e.stopPropagation());
      paint();
    });
    container.querySelectorAll('[data-sv-bess-reference]').forEach(btn=>{
      if(btn.dataset.svBound)return;btn.dataset.svBound='true';
      btn.addEventListener('click',()=>{
        const root=container.querySelector('[data-sv-root]'),index=Number(btn.dataset.svBessReference);
        if(!root||typeof DirectiveRules==='undefined')return;
        root._svState.topic='quality';root._svState.step=[0,0,1,3,1,3,2][index]??0;root._svPaint();
        const context=root.querySelector('[data-sv-context]'),ref=DirectiveRules.BESS_STANDARDS[index];context.hidden=false;context.textContent=`${ref[0]} / ${ref[1]}: ${ref[2]}. Check the source guide for applicability; this lesson illustrates its broader concept.`;
        root.scrollIntoView({block:'start',behavior:'auto'});root.querySelector('h2').focus({preventScroll:true});
      });
    });
  }
  function showForStandard(container,standard) {
    const root=container.querySelector('[data-sv-root]');if(!root)return;
    root._svState.topic=STANDARD_TOPICS[standard.id]||'approval';root._svState.step=0;root._svPaint();
    const context=root.querySelector('[data-sv-context]');context.hidden=false;context.textContent=`Related concept for ${standard.code}: ${standard.title}. Use the detailed requirement table for its exact scope and limits.`;
    root.scrollIntoView({block:'start',behavior:'auto'});root.querySelector('h2').focus({preventScroll:true});
  }
  return {hub,help,bind,showForStandard,LESSONS,STANDARD_TOPICS,storageState,settlementExample};
})();
