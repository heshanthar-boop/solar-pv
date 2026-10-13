const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {loadBrowserModule}=require('./helpers/load-browser-module');
const visuals=loadBrowserModule('js/standards-visuals.js','StandardsVisuals');
const rules=loadBrowserModule('js/directives-2026.js','DirectiveRules');

test('every reference standard has a relevant illustrated lesson',()=>{
  const data=fs.readFileSync('js/standards.js','utf8').split('function render(container)')[0];
  const ids=[...data.matchAll(/id: '([^']+)'/g)].map(m=>m[1]);
  assert.equal(ids.length,19);
  for(const id of ids)assert.ok(visuals.LESSONS[visuals.STANDARD_TOPICS[id]],`Missing lesson for ${id}`);
});
test('battery illustration agrees with the governing five-hour check at boundaries',()=>{
  for(const [power,energy] of [[5,25],[5,25.1],[6,30],[6,30.1],[10,50]]){
    const state=visuals.storageState(power,energy);
    const check=rules.evaluate({inverterKW:power,usableKwh:energy}).checks.find(c=>c.id==='five_hour');
    assert.equal(state.status==='within',check.status==='pass');
    assert.equal(state.hours,energy/power);
    assert.ok(state.fill<=1);
  }
  assert.equal(visuals.storageState(null,20).status,'review');
  assert.equal(visuals.storageState(5,null).status,'review');
});
test('billing illustrations match retail unit banking, offset-before-surplus and gross export',()=>{
  for(const [imports,exports] of [[300,400],[600,400],[0,400],[400,0]]){
    for(const [step,scheme] of [[1,'net_metering'],[2,'net_accounting'],[3,'net_plus']]){
      const example=visuals.settlementExample(imports,exports,step);
      const terms=rules.tariff({scheme,applicant:'new_pv',capacityKW:5,clearanceDate:'2026-08-25',clearanceValid:true});
      const real=rules.settle([{days:30,importKwh:imports,otherKwh:exports,priorityKwh:0}],terms);
      assert.equal(example.offset,real.offsetKwh);
      assert.equal(example.banked,real.bankedKwh);
      assert.equal(example.paidUnits,real.paidKwh);
      assert.ok(example.remainingImport>=0);
    }
  }
});
