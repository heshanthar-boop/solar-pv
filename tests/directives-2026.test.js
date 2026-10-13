const test=require('node:test');
const assert=require('node:assert/strict');
const {loadBrowserModule}=require('./helpers/load-browser-module');
const rules=loadBrowserModule('js/directives-2026.js','DirectiveRules');
const Financials=loadBrowserModule('js/financials.js','Financials',{DirectiveRules:rules});
const find=(input,id)=>rules.evaluate(input).checks.find(c=>c.id===id);
const fit=(patch={})=>rules.tariff({capacityKW:10,scheme:'net_accounting',applicant:'new_pv',clearanceDate:'2026-08-25',clearanceValid:true,...patch});

test('five-hour ratio uses usable energy / continuous power; exceptions stay in review',()=>{
  assert.equal(find({inverterKW:5,usableKwh:25},'five_hour').status,'pass');
  assert.equal(find({inverterKW:5,usableKwh:25,usableEnergyBasis:'estimate'},'five_hour').status,'review');
  assert.equal(find({inverterKW:5,usableKwh:30},'five_hour').status,'fail');
  assert.equal(find({inverterKW:5,usableKwh:30,energyException:true},'five_hour').status,'fail');
  assert.equal(find({inverterKW:5,usableKwh:30,energyException:true,exceptionRef:'CE-002'},'five_hour').status,'review');
});
test('aggregate identical inverter units never use surge power',()=>{
  const inverter=rules.INVERTER_REFERENCES[0];
  assert.equal(find({inverter,inverterKW:10,inverterCount:2,usableKwh:50},'model_rating').status,'pass');
  assert.equal(find({inverter,inverterKW:10,inverterCount:1,usableKwh:50},'model_rating').status,'fail');
  assert.equal(find({inverter,inverterKW:5,inverterCount:1,phase:3},'model_phase').status,'fail');
  assert.equal(find({inverter,inverterKW:5,inverterCount:1,phase:1},'model_phase').status,'pass');
});
test('IP54, efficiency class, telemetry and CELL density boundaries',()=>{
  for(const [ip,status] of [['IP53','fail'],['IP54','pass'],['IPX4','review']]) assert.equal(find({inverterKW:5,usableKwh:20,batteryIP:ip},'ip').status,status);
  assert.equal(find({inverterKW:5,usableKwh:20,rtePct:85},'rte').status,'pass');
  assert.equal(find({inverterKW:5,usableKwh:20,rtePct:89.9,performanceClass:'premium'},'rte').status,'fail');
  for(const [v,status] of [[11.9,'fail'],[12,'pass']]) assert.equal(find({inverterKW:5,usableKwh:20,logMonths:v},'retention').status,status);
  for(const [v,status] of [[149.9,'fail'],[150,'pass']]) assert.equal(find({inverterKW:5,usableKwh:20,cellDensity:v},'cell_density').status,status);
});
test('cycle claims need the specified DoD, C-rate and retained capacity',()=>{
  const p={inverterKW:5,usableKwh:20,cycles:6000,cycleDod:80,cycleRate:0.5,retentionPct:80,testTempC:25};
  assert.equal(find(p,'cycle_life').status,'pass');
  assert.equal(find({...p,category:'commercial'},'cycle_life').status,'fail');
  assert.equal(find({...p,cycleRate:0.2},'cycle_life').status,'review');
  assert.equal(find({...p,cycleDod:null},'cycle_life').status,'review');
});
test('residential >5kW scope and >7kW single-phase interconnection are distinct',()=>{
  assert.equal(find({inverterKW:6,usableKwh:20,phase:1},'res_scope').status,'review');
  assert.equal(find({inverterKW:7,usableKwh:20,phase:1},'phase'),undefined);
  assert.equal(find({inverterKW:7.01,usableKwh:20,phase:1},'phase').status,'fail');
  assert.equal(find({inverterKW:7.01,usableKwh:20,phase:1,phaseException:true,phaseExceptionRef:'DL-001'},'phase').status,'review');
});
test('Sungrow per-MPPT currents, cold voltage and battery-dependent startup are enforced',()=>{
  const p={inverter:rules.INVERTER_REFERENCES[0],inverterKW:5,pvKW:6.54,panel:{Pmax:545,Voc:49.8,Vmp:41.7,Imp:13.07,Isc:13.93,coeffVoc:-0.0028,coeffIsc:0.00048},modulesPerString:6,mpptsUsed:2,stringsPerMppt:1,tMinC:10,tCellMaxC:70};
  assert.equal(find(p,'mppt_current').status,'pass');
  for(const id of ['mppt_current','mppt_isc','mppt_strings']) assert.equal(find({...p,stringsPerMppt:2},id).status,'fail');
  assert.equal(find({...p,usableKwh:20,batteryMinV:40,modulesPerString:7},'mg_startup').status,'fail');
  assert.equal(find({...p,modulesPerString:10},'string_voc').status,'fail');
});
test('Huawei declared usable energy is not DoD-derated again, and incompatible Sungrow fails',()=>{
  const battery=rules.BATTERY_REFERENCES.find(b=>b.model==='LUNA2000-7-S1');
  assert.equal(battery.usableEnergy_kWh,6.9);
  assert.equal(battery.nominalV,null);assert.equal(battery.capacityAh,null);assert.equal(battery.continuousDischarge_A,null);
  const p={inverter:rules.INVERTER_REFERENCES[0],battery,inverterKW:5,usableKwh:6.9,batteryMinV:350,batteryMaxV:560};
  assert.equal(find(p,'battery_window').status,'fail');assert.equal(find(p,'huawei_pair').status,'fail');
  assert.equal(find(p,'model_usable').status,'pass');assert.equal(find({...p,usableKwh:6.9*0.8},'model_usable').status,'fail');
});
test('catalogue reference does not create approval / certificate evidence',()=>{
  const out=rules.evaluate({inverter:rules.INVERTER_REFERENCES[0],inverterKW:5,usableKwh:20});
  assert.equal(out.canRelease,false);
  for(const id of ['productRegistered','accreditedCertificates']) assert.equal(out.checks.find(c=>c.id===id).status,'review');
});
for(const [capacity,rate] of [[10,23.11],[10.001,19.15],[40,19.15],[40.001,17.11],[250,17.11],[250.001,15.81],[1000,15.81],[1000.001,15.81]])
  test(`new PV feed-in band at ${capacity} contracted AC kW`,()=>assert.equal(fit({capacityKW:capacity}).baseRate,rate));
test('BESS tariff >250kW, tax concession and 1000kW boundaries',()=>{
  for(const usableKwh of [undefined,null,'',0]) assert.equal(fit({capacityKW:300,applicant:'new_bess',usableKwh,taxConcession:true}).status,'review');
  assert.equal(fit({capacityKW:250,applicant:'new_bess',usableKwh:1000,taxConcession:true}).status,'unavailable');
  assert.equal(fit({capacityKW:250.1,applicant:'new_bess',usableKwh:1000}).status,'review');
  const a=fit({capacityKW:1000,applicant:'new_bess',usableKwh:4000,taxConcession:true});
  assert.equal(a.priorityRate,45.53);assert.equal(a.baseRate,15.81);assert.equal(a.status,'eligible');
  assert.equal(fit({capacityKW:1000.1,applicant:'new_bess',usableKwh:5000}).priorityRate,42.49);
});
test('earlier, invalid and extended clearance dates cannot silently select the new FIT',()=>{
  for(const date of ['2026-08-24','2026-13-03','2026-02-30','']) assert.equal(fit({clearanceDate:date}).status,'review');
  assert.equal(fit({clearanceValid:false}).status,'review');assert.equal(fit({clearanceExtended:true}).status,'review');assert.equal(fit().status,'eligible');
});
test('retrofit R1/0.95 formula and unexpired associated agreement',()=>{
  const t=fit({capacityKW:300,applicant:'retrofit_bess',existingRate:20,remainingYears:8,usableKwh:1200,taxConcession:true});
  assert.ok(Math.abs(t.priorityRate-(33.51+20/0.95))<1e-9);assert.equal(t.priorityYears,8);
  assert.equal(rules.revenue([{days:30,priorityKwh:100,otherKwh:0}],t,9).amount,0);
});
test('net-metered surplus banks units without cash income; zero percent remains zero',()=>{
  const t=fit({scheme:'net_metering'}),s=Financials.annualSavings(10000,300,0,25,{scheme:'net_metering',terms:t});
  assert.equal(t.baseRate,0);assert.equal(s.self_consumed,0);assert.equal(s.savings_export,0);assert.equal(s.unit_offset,3600);assert.ok(Math.abs(s.banked_units-6400)<1e-6);assert.equal(s.total,90000);
});
test('self-consumption cannot exceed the actual load; current import tariff is required',()=>{
  assert.equal(Financials.annualSavings(20000,300,65,25,{scheme:'net_accounting',terms:fit()}).self_consumed,3600);
  assert.throws(()=>Financials.annualSavings(10000,300,65,0),/current bill/);
});
test('123 kWh/kW 30-day payable cap is pro-rata and differs from physical export',()=>{
  const t=fit({capacityKW:300,applicant:'new_bess',usableKwh:1200,taxConcession:true}),r=rules.revenue([{days:30,priorityKwh:36900,otherKwh:36900}],t);
  assert.equal(t.exportCapPer30Days,36900);assert.equal(r.paidKwh,36900);assert.equal(r.unpaidKwh,36900);assert.equal(r.priorityPaidKwh,18450);assert.equal(r.amount,18450*(45.53+15.81));
});
test('priority premium ends after 15 years; FIT is fixed and SPPA expiry ends cash exports',()=>{
  const terms=fit({capacityKW:300,applicant:'new_bess',usableKwh:1200,taxConcession:true});
  assert.equal(rules.revenue([{days:30,priorityKwh:100,otherKwh:0}],terms,16).amount,1581);
  const p=Financials.projectCashflows({capex:0,solarKwh:1000,load:100,selfUse:0,tariffOvr:25,life:3,disc:0,esc:10,deg:0,om:0,contractYears:2,fit:{scheme:'net_plus',applicant:'new_pv'},terms:fit()});
  assert.ok(Math.abs(p.cashflows[1]-23110)<1e-6);assert.ok(Math.abs(p.cashflows[2]-23110)<1e-6);assert.equal(p.cashflows[3],0);
});
test('typical-day dispatch conserves energy including losses, SOC and curtailment',()=>{
  const months=Array.from({length:12},(_,i)=>({month:i+1,days:[31,28,31,30,31,30,31,31,30,31,30,31][i],E_mon:1000}));
  const d=rules.dispatch(months,8000,{usableKwh:10,rtePct:90,chargeKW:2,dischargeKW:2,pvPowerKW:5,exportKW:1,profile:'res_evening'}).total;
  assert.ok(Math.abs(d.pvKwh-d.selfKwh-d.exportKwh-d.curtailedKwh-d.batteryLossKwh-d.socDeltaKwh)<1e-6);
  assert.ok(Math.abs(d.importKwh+d.selfKwh-8000)<1e-6);assert.ok(d.batteryLossKwh>0);assert.ok(d.curtailedKwh>0);
});
test('zero export cannot sell; zero PV cannot discharge invented battery energy',()=>{
  assert.equal(rules.dispatch([{days:30,E_mon:1000}],8000,{usableKwh:10,rtePct:90,chargeKW:2,dischargeKW:2,exportKW:0}).total.exportKwh,0);
  const d=rules.dispatch([{days:30,E_mon:0}],8000,{usableKwh:10,rtePct:90,chargeKW:2,dischargeKW:2,exportKW:5}).total;
  assert.equal(d.dischargedKwh,0);assert.equal(d.exportKwh,0);assert.equal(d.batteryLossKwh,0);
});
test('priority discharge is bounded by four hours of continuous power',()=>{
  assert.ok(rules.dispatch([{days:30,E_mon:9000}],0,{usableKwh:100,rtePct:90,chargeKW:100,dischargeKW:2,exportKW:100,mode:'priority_export'}).total.dischargedKwh<=30*4*2+1e-8);
});
test('old export checklist and zero-export mode cannot bypass 2026 evidence',()=>{
  const Hybrid=loadBrowserModule('js/hybrid.js','HybridSetup',{DirectiveRules:rules,App:{state:{},escapeHTML:v=>String(v)},PVCalc:{},DB:{}});
  const yes={exportMode:'export',utilityDocSld:true,utilityDocProtectionSettings:true,utilityDocEquipmentApprovals:true,utilityDocCommissioningReport:true,utilityDocInterconnectionForm:true,utilityMeterReady:true,utilityIsolationAccessible:true,utilitySettingsMatched:true,utilityFinalAcceptance:true};
  const r=Hybrid.__test.evaluateUtilitySubmission(yes,{id:'ceb_2025',exportEnabled:true},{acRated_kW:5,manufacturer:'Demo',model:'INV'});
  assert.equal(r.strictPass,false);assert.ok(r.directiveReview);assert.ok(r.blockers.some(b=>/2026/.test(b)));
  const z=Hybrid.__test.evaluateUtilitySubmission({exportMode:'no_export'},{id:'offgrid',exportEnabled:false},null);
  assert.equal(z.applicable,true);assert.equal(z.strictPass,false);
});

test('Hybrid review uses the entered performance declaration and nominal voltage',()=>{
  const Hybrid=loadBrowserModule('js/hybrid.js','HybridSetup',{DirectiveRules:rules,App:{state:{},escapeHTML:v=>String(v)},PVCalc:{},DB:{}});
  const r=Hybrid.__test.evaluateUtilitySubmission({exportMode:'no_export',batteryVoltage_V:48,etaBatt:0.98,chemistry:'lifepo4',directivePolicy:{connection:'zero_export',phase:1,installedUsableKwh:20,batteryVoltage:1600,rtePct:84}}, {id:'offgrid',exportEnabled:false}, rules.INVERTER_REFERENCES[0]).directiveReview;
  assert.equal(r.checks.find(c=>c.id==='rte').status,'fail');
  assert.equal(r.checks.find(c=>c.id==='dc_voltage').status,'fail');
});

test('complete declared evidence can finish review without claiming authority approval',()=>{
  const p={inverter:rules.INVERTER_REFERENCES[0],inverterKW:5,inverterCount:1,batteryUnits:1,pvKW:6.54,panel:{Pmax:545,Voc:49.8,Vmp:41.7,Imp:13.07,Isc:13.93,coeffVoc:-0.0028,coeffIsc:0.00048},modulesPerString:6,mpptsUsed:2,stringsPerMppt:1,tMinC:10,tCellMaxC:70,usableKwh:20,chemistry:'lifepo4',phase:1,batteryVoltage:48,batteryMinV:40,batteryMaxV:60,batteryIP:'IP54',rtePct:90,cycles:6000,cycleDod:80,cycleRate:0.5,retentionPct:80,testTempC:25,cellDensity:150,logMonths:12,chargeKW:5,dischargeKW:5,approvedExportKW:5,evidenceRef:'Evidence-pack-001',evidence:Object.fromEntries(rules.EVIDENCE.map(e=>[e.key,true]))};
  p.evidence.gridFunctions=true;
  p.dlSettingsRef='DL-2026-001';p.mountHeightM=0.5;p.tCellMaxC=45;
  const r=rules.evaluate(p);
  assert.deepEqual(Array.from(r.checks.filter(c=>c.status!=='pass').map(c=>c.id)),[]);
  assert.equal(r.canRelease,true);assert.equal(r.status,'checks_complete');
  assert.equal(rules.evaluate({...p,evidenceRef:''}).canRelease,false);
});
test('seasonal monthly load totals remain aligned with the energy-balance table',()=>{
  const d=rules.dispatch([{days:28,E_mon:500},{days:31,E_mon:1500}],12000,{monthlyLoadKwh:[1000,700],exportKW:2});
  assert.ok(Math.abs(d.total.importKwh+d.total.selfKwh-1700)<1e-8);
});
test('fractional remaining term uses a partial final year rather than a full extra year',()=>{
  const t=fit({capacityKW:300,applicant:'retrofit_bess',existingRate:20,remainingYears:8.5,usableKwh:1200,taxConcession:true});
  assert.ok(rules.revenue([{days:30,priorityKwh:0,otherKwh:100}],t,9).amount===1000);
});
test('IRR is not invented when there is no root or cash flows change signs twice',()=>{
  assert.equal(Financials.irr([-100,0,0]),null);
  assert.equal(Financials.irr([-100,300,-200]),null);
  assert.ok(Math.abs(Financials.irr([-100,110])-10)<1e-5);
});
test('power-plant component tariffs are not silently treated as rooftop bands',()=>{
  const r=fit({installation:'ground'});
  assert.equal(r.status,'review');assert.equal(r.baseRate,null);assert.equal(r.plantComponents.base,18);assert.equal(r.plantComponents.om,2.72);
  assert.equal(fit({installation:'floating'}).plantComponents.priorityBase,53.28);
});
test('Net Accounting first offsets billing-period imports; physical export is not automatically paid',()=>{
  const t=fit();
  const r=rules.settle([{days:30,otherKwh:400,priorityKwh:0,importKwh:600}],t);
  assert.equal(r.offsetKwh,400);assert.equal(r.amount,0);assert.equal(r.paidKwh,0);
  const s=Financials.annualSavings(10000,1000,60,30,{scheme:'net_accounting',terms:t});
  assert.equal(s.savings_export,0);assert.ok(Math.abs(s.unit_offset-4000)<1e-6);assert.ok(Math.abs(s.total-300000)<1e-6);
});
test('Net Accounting BESS cap/offset allocation does not invent priority payment',()=>{
  const t=fit({capacityKW:300,applicant:'new_bess',usableKwh:1200,taxConcession:true});
  const r=rules.settle([{days:30,otherKwh:1000,priorityKwh:500,importKwh:800}],t);
  assert.equal(r.offsetKwh,800);assert.equal(r.priorityPaidKwh,0);assert.equal(r.paidKwh,700);assert.equal(r.amount,700*15.81);
});
test('Net Metering only carries credits forward, not backward from a later billing period',()=>{
  const t=fit({scheme:'net_metering'}),r=rules.settle([{days:30,otherKwh:0,priorityKwh:0,importKwh:100},{days:30,otherKwh:200,priorityKwh:0,importKwh:0}],t);
  assert.equal(r.offsetKwh,0);assert.equal(r.bankedKwh,200);assert.equal(r.amount,0);
});
test('bulk PV-only daytime netting is not replaced by the retail settlement model',()=>{
  assert.equal(fit({billingClass:'bulk'}).status,'review');
});
test('lithium-only limits are not falsely imposed on a known lead-acid battery',()=>{
  const r=rules.evaluate({inverterKW:5,usableKwh:20,chemistry:'lead_acid',cellDensity:40,cycles:1000});
  assert.equal(r.checks.find(c=>c.id==='other_chemistry').status,'review');
  assert.equal(r.checks.find(c=>c.id==='cell_density'),undefined);assert.equal(r.checks.find(c=>c.id==='cycle_life'),undefined);assert.equal(r.canRelease,false);
});
test('catalogue loading keeps the new MG references unapproved and preserves electrical metadata',async()=>{
  const fs=require('node:fs'),saved={};
  const c=loadBrowserModule('js/catalog-store.js','CatalogStore',{localStorage:{getItem:k=>saved[k]||null,setItem:(k,v)=>{saved[k]=v;}},fetch:async path=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))})});
  await c.ensureLoaded();
  const model=c.getAllInverters().find(i=>i.model==='MG5RL');
  assert.ok(model);assert.equal(model.phase,1);assert.equal(model.maxIscPerMppt_A,25);assert.equal(model.mpptRatedMin_V,230);assert.equal(model.utilityListed.ceb_2025,false);assert.equal(model.sourceConfidence,'manufacturer-reference');
});
