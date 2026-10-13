const test=require('node:test');
const assert=require('node:assert/strict');
const {loadBrowserModule}=require('./helpers/load-browser-module');
const scenes=loadBrowserModule('js/pv-learning-scenes.js','PVLearningScenes');
const registry=loadBrowserModule('js/sri-lanka-standards.js','SriLankaStandards');

test('illustrated energy budgets conserve power and respect continuous inverter rating',()=>{
  for(const pvDC of [0,.1,3,6,12])for(const loadKW of [0,.2,2.5,4,10])for(let step=0;step<4;step++){
    const p=scenes.powerScenario(step,false,{pvDC,loadKW});
    assert.ok(Math.abs(p.balanceError)<1e-9,JSON.stringify(p));
    assert.ok(p.acGridOutput<=p.ratedAC+1e-9);
    assert.ok(p.curtailed>=-1e-9);assert.ok(p.imports>=0);assert.ok(p.exports>=0);
    assert.ok(!(p.imports>0&&p.exports>0));
  }
});
test('zero export retains utility connection and can still import',()=>{
  const surplus=scenes.powerScenario(3,false,{pvDC:6,loadKW:2.5});
  assert.equal(surplus.exports,0);assert.equal(surplus.contactorClosed,true);assert.ok(surplus.curtailed>0);
  const shortfall=scenes.powerScenario(3,false,{pvDC:0,loadKW:5});
  assert.equal(shortfall.imports,5);assert.equal(shortfall.exports,0);assert.equal(shortfall.gridPresent,true);
});
test('outage and isolated backup never feed the utility or energise general loads',()=>{
  for(const step of [1,2]){
    const p=scenes.powerScenario(step,true);
    assert.equal(p.contactorClosed,false);assert.equal(p.exports,0);assert.equal(p.acGridOutput,0);assert.equal(p.servedGeneral,0);assert.equal(p.imports,0);
    assert.ok(Math.abs(p.balanceError)<1e-9);
  }
  assert.equal(scenes.powerScenario(2,true).eps,1.5);
  const waiting=scenes.powerScenario(3,true);
  assert.equal(waiting.gridPresent,true);assert.equal(waiting.contactorClosed,false);assert.equal(waiting.exports,0);
});
test('SLSEA mappings keep documentation, SPD, module safety and connector scopes distinct',()=>{
  const entries=registry.getRecords(),get=id=>entries.find(r=>r.id===id);
  assert.match(get('sls1522').title,/documentation/i);
  assert.match(get('sls1473').title,/surge/i);
  assert.match(get('sls1553').title,/module safety/i);
  assert.match(get('sls1637').title,/connector/i);
  assert.match(get('sls1544').title,/qualification/i);
  assert.match(get('sls1472').title,/lightning/i);
});
test('IR comparison handles voltage-band boundaries and missing evidence without false passes',()=>{
  for(const [v,t,min] of [[119.9,250,.5],[120,500,1],[500,500,1],[500.1,1000,1]]){
    const r=registry.irCheck(v,t,min,min);assert.equal(r.status,'within');assert.equal(r.minimum,min);
    assert.equal(registry.irCheck(v,t,min-.01,min).status,'below');
    assert.equal(registry.irCheck(v,t,null,min).status,'review');
    assert.equal(registry.irCheck(v,t+1,min,min).status,'review');
  }
  assert.equal(registry.irCheck(null,500,1,1).status,'review');
  assert.equal(registry.irCheck(Infinity,1000,1,1).status,'review');
});
test('reverse-current assessment uses actual design current and rejects other fault sources',()=>{
  assert.equal(registry.reverseCurrent(3,14,25).status,'protection_required');
  assert.equal(registry.reverseCurrent(4,5,20).status,'within_bound');
  assert.equal(registry.reverseCurrent(2,14,25,true).status,'review');
  assert.equal(registry.reverseCurrent(2.5,14,25).status,'review');
});
