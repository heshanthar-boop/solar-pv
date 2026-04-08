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