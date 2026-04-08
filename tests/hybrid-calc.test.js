const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModule } = require('./helpers/load-browser-module');

const PVCalc = loadBrowserModule('js/pv-calc.js', 'PVCalc');

test('batteryCapacity returns nominal and usable energy targets', () => {
  const out = PVCalc.batteryCapacity(18, 1, 0.8, 0.95, 0.93, 0.9, 1.15);
  assert.ok(out);
  assert.ok(out.requiredNominal_kWh > out.requiredUsable_kWh);
  assert.ok(out.requiredUsable_kWh > out.requiredDelivered_kWh);
  assert.ok(Math.abs(out.requiredDelivered_kWh - 20.7) < 1e-9);
});

test('batteryCapacity rejects invalid depth-of-discharge values', () => {
  assert.equal(PVCalc.batteryCapacity(10, 1, 1.2, 0.9, 0.9, 0.9, 1.1), null);
  assert.equal(PVCalc.batteryCapacity(10, 1, 0, 0.9, 0.9, 0.9, 1.1), null);
});

test('hybridPVCapacity computes base and recommended kWp', () => {
  const out = PVCalc.hybridPVCapacity(18, 4.8, 0.75, 1.15);
  assert.ok(out);
  assert.ok(Math.abs(out.base_kWp - 5) < 1e-9);
  assert.ok(Math.abs(out.recommended_kWp - 5.75) < 1e-9);
});

test('hybridInverterCapacity sizes continuous and surge requirements', () => {
  const out = PVCalc.hybridInverterCapacity(5, 8, 1.25);
  assert.ok(out);
  assert.ok(Math.abs(out.requiredContinuous_kW - 6.25) < 1e-9);
  assert.ok(out.requiredSurge_kW >= 9.375);
  assert.ok(Math.abs(out.suggestedNameplate_kW - 6.5) < 1e-9);
});

test('hybridChargeCurrent estimates battery-side current with margin', () => {
  const out = PVCalc.hybridChargeCurrent(5.75, 48, 1.25);
  assert.ok(out);
  assert.ok(Math.abs(out.current_A - (5.75 * 1000 / 48 * 1.25)) < 1e-9);
});

test('batteryAhAtVoltage converts kWh to Ah correctly', () => {
  const ah = PVCalc.batteryAhAtVoltage(12, 48);
  assert.ok(Math.abs(ah - 250) < 1e-9);
});