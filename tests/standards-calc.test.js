const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModule } = require('./helpers/load-browser-module');

const StandardsCalc = loadBrowserModule('js/standards-calc.js', 'StandardsCalc');

test('performanceRatio computes percentage and quality band', () => {
  const out = StandardsCalc.performanceRatio(420, 50, 10);
  assert.ok(out);
  assert.ok(Math.abs(out.pr - 0.84) < 1e-9);
  assert.equal(out.band, 'good');
});

test('specificYield classifies common Sri Lanka range', () => {
  const out = StandardsCalc.specificYield(14500, 10);
  assert.ok(out);
  assert.equal(out.value, 1450);
  assert.equal(out.band, 'high');
});

test('inverterSizing returns ratio and recommended minimum', () => {
  const out = StandardsCalc.inverterSizing(12, 10.5);
  assert.ok(out);
  assert.ok(out.pass);
  assert.ok(out.optimal);
  assert.equal(out.minRecommended, 10.2);
});

test('cableVoltageDrop enforces side-specific limits', () => {
  const dc = StandardsCalc.cableVoltageDrop(40, 12, 4, 600, 'dc');
  const ac = StandardsCalc.cableVoltageDrop(40, 12, 4, 230, 'ac');

  assert.ok(dc);
  assert.ok(ac);
  assert.ok(dc.dropPercent < ac.dropPercent);
  assert.equal(typeof dc.pass, 'boolean');
  assert.equal(typeof ac.pass, 'boolean');
});

test('cableSizeSelector selects larger CSA for aluminum than copper', () => {
  const common = {
    systemType: 'ac1p',
    insulation: 'xlpe',
    installMethod: 'conduit_wall',
    ambient_C: 35,
    groupedCircuits: 1,
    lengthOneWay_m: 35,
    nominal_V: 230,
    current_A: 42,
    continuousFactor: 1.25,
    dropLimit_pct: 3.0,
  };
  const cu = StandardsCalc.cableSizeSelector({ ...common, material: 'cu' });
  const al = StandardsCalc.cableSizeSelector({ ...common, material: 'al' });
  assert.ok(cu);
  assert.ok(al);
  assert.ok(al.selectedCSA_mm2 >= cu.selectedCSA_mm2);
});

test('cableSizeSelector increases CSA when cable length increases', () => {
  const shortRun = StandardsCalc.cableSizeSelector({
    systemType: 'dc',
    material: 'cu',
    insulation: 'xlpe',
    installMethod: 'rooftop_sun',
    ambient_C: 45,
    groupedCircuits: 2,
    lengthOneWay_m: 12,
    nominal_V: 120,
    current_A: 50,
    continuousFactor: 1.25,
    dropLimit_pct: 1.0,
  });
  const longRun = StandardsCalc.cableSizeSelector({
    systemType: 'dc',
    material: 'cu',
    insulation: 'xlpe',
    installMethod: 'rooftop_sun',
    ambient_C: 45,
    groupedCircuits: 2,
    lengthOneWay_m: 60,
    nominal_V: 120,
    current_A: 50,
    continuousFactor: 1.25,
    dropLimit_pct: 1.0,
  });
  assert.ok(shortRun);
  assert.ok(longRun);
  assert.ok(longRun.selectedCSA_mm2 >= shortRun.selectedCSA_mm2);
  assert.ok(longRun.requiredAreaByVdrop_mm2 > shortRun.requiredAreaByVdrop_mm2);
});

test('cableSizeSelector derives AC 3-phase current from power input', () => {
  const out = StandardsCalc.cableSizeSelector({
    systemType: 'ac3p',
    material: 'cu',
    insulation: 'xlpe',
    installMethod: 'conduit_wall',
    ambient_C: 35,
    groupedCircuits: 1,
    lengthOneWay_m: 25,
    nominal_V: 400,
    load_kW: 18,
    powerFactor: 0.9,
    continuousFactor: 1.25,
    dropLimit_pct: 3.0,
  });
  assert.ok(out);
  assert.equal(out.currentSource, 'derived_from_power');
  assert.ok(out.I_load_A > 0);
  assert.ok(out.selectedCSA_mm2 >= 1.5);
});


test('cableSizeSelector uses catalogue profile metadata', () => {
  const out = StandardsCalc.cableSizeSelector({
    systemType: 'ac1p',
    cableConstruction: 'multi_core_non_armoured',
    material: 'cu',
    insulation: 'xlpe',
    installMethod: 'closed_tube',
    ambient_C: 35,
    groupedCircuits: 1,
    lengthOneWay_m: 30,
    nominal_V: 230,
    current_A: 35,
    continuousFactor: 1.25,
    dropLimit_pct: 3.0,
  });
  assert.ok(out);
  assert.equal(typeof out.catalogProfile, 'string');
  assert.equal(typeof out.tableMethod, 'string');
  assert.ok(Array.isArray(out.sourceRefs));
  assert.ok(out.sourceRefs.length > 0);
});

test('cableSizeSelector increases CSA for buried duct grouping severity', () => {
  const base = {
    systemType: 'ac3p',
    cableConstruction: 'multi_core_armoured',
    material: 'cu',
    insulation: 'xlpe',
    installMethod: 'buried_duct',
    ambient_C: 35,
    groundTemp_C: 30,
    groupedCircuits: 2,
    buriedSpacing: '0.5m',
    lengthOneWay_m: 60,
    nominal_V: 400,
    current_A: 120,
    continuousFactor: 1.25,
    dropLimit_pct: 2.5,
  };

  const spaced = StandardsCalc.cableSizeSelector(base);
  const touching = StandardsCalc.cableSizeSelector({ ...base, buriedSpacing: 'touching', groupedCircuits: 4 });
  assert.ok(spaced);
  assert.ok(touching);
  assert.ok(touching.selectedCSA_mm2 >= spaced.selectedCSA_mm2);
});

test('stringVocAtTmin detects inverter overvoltage risk', () => {
  const out = StandardsCalc.stringVocAtTmin(49.5, -0.0028, 28, 5, 1100);
  assert.ok(out);
  assert.equal(out.pass, false);
  assert.ok(out.voc > 1100);
});

test('stringVmpAtTmax reports minimum modules needed for MPPT floor', () => {
  const out = StandardsCalc.stringVmpAtTmax(41.2, -0.0028, 45, 38, 8, 300, 1000);
  assert.ok(out);
  assert.equal(out.pass, false);
  assert.ok(out.minModules > 8);
});

