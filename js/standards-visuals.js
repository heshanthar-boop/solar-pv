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
  Object.assign(LESSONS, {
    cables:{title:'Cables & connectors',icon:'wirecalc',source:'interconnection',steps:[
      ['Declare the PV cable','PV cable suitability is a product requirement. SLS 1542 is listed against EN 50618 in the SLSEA source.','Confirm the exact cable certificate, voltage, temperature and environmental ratings.'],
      ['Size for the installed route','Current capacity changes with temperature, grouping and installation method. Voltage drop is a separate check.','Use the applicable conductor design and corrected current; do not infer a cable size from a picture.'],
      ['Use a specified mating pair','SLS 1637 covers PV DC connector safety. Similar appearance does not establish electrical or mechanical compatibility.','Use the OEM-specified pairing and termination evidence. PV can remain live in daylight.'],
      ['Protect and inspect the route','Verify the permitted routing, mechanical protection, identification, sealing and accessibility.','Installation evidence must cover the actual site and applicable current requirements.'] ]},
    lightning:{title:'Lightning & earthing',icon:'fault',source:'interconnection',steps:[
      ['Assess the site risk','SLS 1472 is the listed lightning-protection reference; risk assessment determines the required measures.','Exposure, structure and incoming services matter. The drawing does not supply universal distances.'],
      ['Coordinate external and internal protection','External LPS handles its designed lightning path; SPDs limit transient stress through coordinated protective branches.','SLS 1473 is surge protection. It is distinct from the LPS and from series overcurrent protection.'],
      ['Verify the LPS components','SLS 1496 covers relevant lightning-protection components such as connectors, conductors and electrodes.','Exact parts, corrosion/environment, bonds and the designed separation require assessment.'],
      ['Inspect and document the installation','Verification checks the installed arrangement and protective continuity, not just a product label.','Earthing acceptance comes from the coordinated design and applicable procedure; a universal 1 Ω verdict is not inferred.'] ]},
    batterySafety:{title:'BESS safety & scope',icon:'hybrid',source:'framework',steps:[
      ['Check the battery evidence','Cell/pack safety, performance, renewable-storage testing and OEM pairing address different questions.','For the 2026 lithium BESS specification, cycle claims need the specified DoD, C-rate, retention and ambient evidence.'],
      ['Check the installed environment','Pack/enclosure IP evidence, ventilation, corrosion, protected wiring and thermal/fire measures cover the installation.','Verify the minimum IP54 criteria where applicable and the OEM clearances; pack certification is not an installation inspection.'],
      ['Verify BMS and shutdown actions','BMS alarms and protective actions use declared OEM conditions. The external ESD isolates battery transfer and relevant breakers.','No universal alarm temperature is invented here. Test the accepted response; daylight PV may remain live.'],
      ['Check chemistry and second-life scope','New stationary lithium, NiMH and repurposed batteries have different standard scopes.','A different chemistry certificate or new-battery brochure does not establish second-life suitability.'] ]}
  });
  const STANDARD_TOPICS = {
    iec62446:'testing',iec61215:'quality',iec61730:'protection',iec60364:'protection',iec61643:'protection',iec62305:'protection',iec60269_6:'protection',iec61724:'monitoring',iec62804:'conditions',iec62548:'array',pucsl:'approval',ceb_leco_approval:'grid',iec62116:'grid',sls1522:'array',sl_supporting_pack:'quality',sls1543:'protection',sls1547:'grid',iec61853:'conditions',pv_degradation:'conditions'
  };
  if(typeof SriLankaStandards!=='undefined')SriLankaStandards.getRecords().forEach(r=>STANDARD_TOPICS[r.id]=r.lesson);
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
      <div class="sv-header"><div><p class="eyebrow">VISUAL LEARNING · PV + BESS</p><h2 tabindex="-1">See how Sri Lankan PV requirements fit together.</h2><p class="sv-subtitle">Follow the equipment layout. Replay the story. Open the associated requirement and source.</p></div><span class="sv-offline">${icon('standards')}Works offline</span></div>
      ${compact?'':`<div class="sv-topics" role="group" aria-label="Choose an illustrated topic">${Object.entries(LESSONS).map(([key,l])=>`<button type="button" data-sv-topic-button="${key}" aria-pressed="${key===topic}">${icon(l.icon)}<span>${esc(l.title)}</span></button>`).join('')}</div>`}
      <p class="sv-context" data-sv-context hidden></p>
      <div class="sv-player" data-sv-player></div>
      <div class="sv-controls"><button type="button" class="btn btn-secondary btn-sm" data-sv-story>Play story</button><button type="button" class="btn btn-secondary btn-sm" data-sv-play aria-pressed="false">Play animation</button><div class="sv-step-controls"><button type="button" class="btn btn-secondary btn-sm" data-sv-prev aria-label="Previous illustration step">← Previous</button><span data-sv-count></span><button type="button" class="btn btn-secondary btn-sm" data-sv-next aria-label="Next illustration step">Next →</button></div></div>
      <p class="sv-caption">Illustrative equipment and example quantities. Particles show average energy-transfer direction, not electrons or instantaneous AC current. Playback duration is not a protection trip time. Use the approved project design and exact equipment evidence.</p>
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
  function diagram(topic,step,state){return PVLearningScenes.scene(topic,step,state);}
  function ledgerHtml(state){
    if(!['energy','grid'].includes(state.topic))return `<div class="rpv-legend"><span class="dc">PV DC / conversion</span><span class="ac">AC energy</span><span class="battery">Battery / EPS</span><span class="feedback">Control or data</span></div>`;
    const p=PVLearningScenes.powerScenario(state.step,state.topic==='grid',state),f=v=>`${v.toFixed(2)} kW`;
    const values=[['PV delivered DC',p.pvDelivered],['Served general loads',p.servedGeneral],['Critical EPS loads',p.eps],[p.dcBatteryIn>0?'Battery stored DC':'Battery drawn DC',p.dcBatteryIn||p.dcBatteryOut],['Utility import',p.imports],['Utility export',p.exports],['Conversion losses',p.losses],['Curtailed PV potential',p.curtailed]];
    const input=p.pvAvailable+p.dcBatteryOut+p.imports,accounted=p.loads+p.dcBatteryIn+p.exports+p.losses+p.curtailed;
    return `<div class="rpv-power-ledger">${values.map(([label,value])=>`<div><span>${label}</span><strong>${f(value)}</strong></div>`).join('')}</div><p class="rpv-balance">Available-power budget: ${f(input)} = ${f(accounted)} accounted for. ${p.unserved?`${f(p.unserved)} general-load demand is unserved.`:''}</p><div class="rpv-state-tags"><span>${p.contactorClosed?'Inverter grid port connected':'Inverter grid port isolated'}</span><span>${p.gridPresent?'Utility supply present':'Utility supply absent'}</span>${state.topic==='energy'&&state.step===3?'<span>Zero export: PCC remains connected</span>':''}</div><div class="rpv-legend"><span class="dc">PV DC</span><span class="ac">AC energy</span><span class="battery">Battery / EPS</span><span class="feedback">Control or data</span></div>`;
  }
  function slider(id,key,label,value,min,max,unit,step=1) {return `<label class="sv-slider" for="${id}-${key}"><span>${label}<output data-sv-value="${key}">${value} ${unit}</output></span><input type="range" id="${id}-${key}" data-sv-input="${key}" data-sv-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"/><span class="sv-range-ends"><span>${min} ${unit}</span><span>${max} ${unit}</span></span></label>`;}
  function sourceLink(topic) {const key=LESSONS[topic].source,s=typeof DirectiveRules!=='undefined'?DirectiveRules.SOURCES[key]:null;return s?.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Read the source document ↗</a>`:'';}
  function bind(container) {
    container.querySelectorAll('[data-sv-root]').forEach(root=>{
      if(root.dataset.svBound)return;
      root.dataset.svBound='true';
      const reduced=typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      const state={topic:LESSONS[root.dataset.svTopic]?root.dataset.svTopic:'energy',step:0,power:5,energy:20,imports:300,exports:400,paused:reduced,autoplay:false};
      root._svState=state;
      const paintDiagram=()=>{
        root.querySelector('[data-sv-diagram]').innerHTML=diagram(state.topic,state.step,state);
        PVLearningScenes.setPaused(root,state.paused);
        const ledger=root.querySelector('[data-rpv-ledger]');if(ledger)ledger.innerHTML=ledgerHtml(state);
        const status=root.querySelector('[data-sv-storage-status]');
        if(status){const s=storageState(state.power,state.energy);status.className=`sv-example-status ${s.status==='assessment'?'sv-example-review':''}`;status.textContent=s.status==='within'?`Within the 5-hour criterion · ${s.hours.toFixed(1)} hours`:`Engineering assessment required · ${s.hours.toFixed(1)} hours`;}
      };
      const paint=()=>{
        const l=LESSONS[state.topic],step=l.steps[state.step],id=root.dataset.svId;
        root.dataset.svTopic=state.topic;
        root.dataset.svPaused=String(state.paused);
        root.querySelectorAll('[data-sv-topic-button]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.svTopicButton===state.topic)));
        root.querySelector('[data-sv-player]').innerHTML=`<div class="sv-scene"><div class="sv-scene-title"><span>${icon(l.icon)}${esc(l.title)}</span><span>STEP ${state.step+1} OF ${l.steps.length}</span></div><div class="rpv-view"><button type="button" class="rpv-zoom" data-rpv-zoom aria-expanded="false">Enlarge diagram</button><div data-sv-diagram tabindex="0" role="region" aria-label="Scrollable illustration"></div></div><div data-rpv-ledger></div>${state.topic==='storage'?`<div class="sv-example-inputs">${slider(id,'power','Continuous inverter power',state.power,1,40,'kW')}${slider(id,'energy','Declared usable battery energy',state.energy,0,200,'kWh')}</div><p data-sv-storage-status class="sv-example-status"></p>`:state.topic==='energy'?`<div class="sv-example-inputs">${slider(id,'pvDC','Available PV DC power',PVLearningScenes.powerScenario(state.step,false,state).pvAvailable,0,12,'kW',0.1)}${slider(id,'loadKW','General load demand',PVLearningScenes.powerScenario(state.step,false,state).generalRequested,0,10,'kW',0.1)}</div>`:state.topic==='settlement'?`<div class="sv-example-inputs">${slider(id,'imports','Billing-period import',state.imports,0,1000,'kWh')}${slider(id,'exports','Billing-period export',state.exports,0,1000,'kWh')}</div>`:''}</div><div class="sv-explanation"><p class="eyebrow">THE IDEA</p><h3 aria-live="polite">${esc(step[0])}</h3><p>${esc(step[1])}</p><div class="sv-check"><strong>What to check</strong><p>${esc(step[2])}</p></div><ol class="sv-steps">${l.steps.map((s,i)=>`<li><button type="button" data-sv-step="${i}" aria-current="${state.step===i?'step':'false'}"><span>${i+1}</span>${esc(s[0])}</button></li>`).join('')}</ol><div class="sv-source">${sourceLink(state.topic)}<span>Exact conditions remain in the requirement tables.</span></div></div>`;
        root.querySelector('[data-sv-count]').textContent=`${state.step+1} / ${l.steps.length}`;
        root.querySelector('[data-sv-prev]').disabled=state.step===0;
        root.querySelector('[data-sv-next]').disabled=state.step===l.steps.length-1;
        const play=root.querySelector('[data-sv-play]');play.textContent=reduced?'Reduced motion enabled':state.paused?'Play animation':'Pause animation';play.disabled=reduced;play.setAttribute('aria-pressed',String(!state.paused));
        paintDiagram();
        const story=root.querySelector('[data-sv-story]');story.textContent=state.autoplay?'Pause story':'Play story';story.disabled=reduced;
        if(state.topic==='energy'&&state.step===2)root.querySelector('[data-sv-input="pvDC"]').disabled=true;
      };
      root._svPaint=paint;
      let storyTimer;
      const stopStory=()=>{state.autoplay=false;clearTimeout(storyTimer);};
      root._svStopStory=stopStory;
      const advanceStory=()=>{clearTimeout(storyTimer);storyTimer=setTimeout(()=>{if(!root.isConnected||!state.autoplay)return;if(document.hidden){advanceStory();return;}if(state.step===LESSONS[state.topic].steps.length-1){stopStory();paint();return;}state.step++;delete state.pvDC;delete state.loadKW;paint();advanceStory();},8000);};
      root.addEventListener('click',e=>{
        const b=e.target.closest('button');if(!b)return;
        if(b.hasAttribute('data-rpv-zoom')){const view=b.closest('.rpv-view');const zoom=view.classList.toggle('rpv-zoomed');b.textContent=zoom?'Show overview':'Enlarge diagram';b.setAttribute('aria-expanded',String(zoom));return;}
        if(b.hasAttribute('data-sv-story')){if(state.autoplay){stopStory();paint();}else{state.autoplay=true;state.paused=false;if(state.step===3)state.step=0;delete state.pvDC;delete state.loadKW;paint();advanceStory();}return;}
        if(b.hasAttribute('data-sv-topic-button')){state.topic=b.dataset.svTopicButton;state.step=0;root.querySelector('[data-sv-context]').hidden=true;}
        else if(b.hasAttribute('data-sv-step'))state.step=Number(b.dataset.svStep);
        else if(b.hasAttribute('data-sv-prev'))state.step=Math.max(0,state.step-1);
        else if(b.hasAttribute('data-sv-next'))state.step=Math.min(LESSONS[state.topic].steps.length-1,state.step+1);
        else if(b.hasAttribute('data-sv-play')){stopStory();root.querySelector('[data-sv-story]').textContent='Play story';state.paused=!state.paused;PVLearningScenes.setPaused(root,state.paused);root.dataset.svPaused=String(state.paused);b.textContent=state.paused?'Play animation':'Pause animation';b.setAttribute('aria-pressed',String(!state.paused));return;}
        else return;
        stopStory();delete state.pvDC;delete state.loadKW;
        paint();
        // Repainted step buttons keep keyboard focus on the chosen step.
        if(b.hasAttribute('data-sv-step'))root.querySelector(`[data-sv-step="${state.step}"]`).focus();
      });
      root.addEventListener('input',e=>{
        const key=e.target.dataset.svInput;if(!key)return;
        e.stopPropagation();
        state[key]=Number(e.target.value);
        root.querySelector(`[data-sv-value="${key}"]`).textContent=`${state[key]} ${e.target.dataset.svUnit}`;
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
        root._svStopStory();root._svState.topic='batterySafety';root._svState.step=[0,1,0,3,0,3,1][index]??0;root._svPaint();
        const context=root.querySelector('[data-sv-context]'),ref=DirectiveRules.BESS_STANDARDS[index];context.hidden=false;context.textContent=`${ref[0]} / ${ref[1]}: ${ref[2]}. Check the source guide for applicability; this lesson illustrates its broader concept.`;
        root.scrollIntoView({block:'start',behavior:'auto'});root.querySelector('h2').focus({preventScroll:true});
      });
    });
  }
  function showForStandard(container,standard) {
    const root=container.querySelector('[data-sv-root]');if(!root)return;
    root._svStopStory();root._svState.topic=standard.lesson||STANDARD_TOPICS[standard.id]||'approval';root._svState.step=standard.lessonStep??0;root._svPaint();
    const context=root.querySelector('[data-sv-context]');context.hidden=false;context.textContent=`Related concept for ${standard.code}: ${standard.title}. Use the detailed requirement table for its exact scope and limits.`;
    root.scrollIntoView({block:'start',behavior:'auto'});root.querySelector('h2').focus({preventScroll:true});
  }
  return {hub,help,bind,showForStandard,LESSONS,STANDARD_TOPICS,storageState,settlementExample};
})();
