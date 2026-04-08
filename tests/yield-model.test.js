const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModule } = require('./helpers/load-browser-module');

const YieldEstimator = loadBrowserModule('js/yield-estimator.js', 'YieldEstimator');

const losses = {
  eta_inv: 0.965,
  L_cable: 0.02,
  L_soiling: 0.03,
  L_mismatch: 0.02,
  L_other: 0.01,
};

test('simulateMonthly returns 12 months with positive energy', () => {
  const loc = YieldEstimator.SL_LOCATIONS[0];
  const monthly = YieldEstimator.simulateMonthly(loc, 10, 45, -0.0035, 10, 0, losses, 0.2);

  assert.equal(monthly.length, 12);
  const annual = monthly.reduce((sum, m) => sum + m.E_mon, 0);
  assert.ok(annual > 0);
  monthly.forEach(m => {
    assert.ok(m.H_poa > 0);
    assert.ok(m.PR > 0);
    assert.ok(m.E_day > 0);
  });
});

test('checkDCACRatio classifies near-unity ratio as optimal', () => {
  const ratio = YieldEstimator.checkDCACRatio(10, 10);
  assert.ok(ratio.ratio >= 1);
  assert.match(ratio.status, /Optimal/i);
});

test('checkDCACRatio flags excessive oversizing', () => {
  const ratio = YieldEstimator.checkDCACRatio(18, 10);
  assert.ok(ratio.ratio > 1.45);
  assert.match(ratio.status, /Excessive/i);
});

test('findOptimalTilt returns a tilt inside expected search bounds', () => {
  const loc = YieldEstimator.SL_LOCATIONS[0];
  const best = YieldEstimator.findOptimalTilt(loc, 0);
  assert.ok(best.tilt >= 0 && best.tilt <= 45);
  assert.ok(best.H_annual > 0);
});

test('simulateHourly returns 24 points and non-zero daytime energy', () => {
  const loc = YieldEstimator.SL_LOCATIONS[2];
  const monthly = YieldEstimator.simulateMonthly(loc, 8, 44, -0.0034, 12, 0, losses, 0.2);
  const hourly = YieldEstimator.simulateHourly(monthly[3], 8, 44, -0.0034, losses, 10);

  assert.equal(hourly.length, 24);
  const totalDay = hourly.reduce((sum, row) => sum + row.E_kWh, 0);
  assert.ok(totalDay > 0);
});