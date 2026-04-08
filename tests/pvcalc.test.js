const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModule } = require('./helpers/load-browser-module');

const PVCalc = loadBrowserModule('js/pv-calc.js', 'PVCalc');

const panel = {
  Voc: 49.8,
  Vmp: 41.3,
  Isc: 13.2,
  Imp: 12.6,
  Pmax: 545,
  coeffVoc: -0.0028,
  coeffIsc: 0.00045,
  coeffPmax: -0.0035,
  NOCT: 45,
};

test('Voc responds correctly to temperature changes', () => {
  const cold = PVCalc.vocAtTemp(panel.Voc, panel.coeffVoc, 0);
  const hot = PVCalc.vocAtTemp(panel.Voc, panel.coeffVoc, 65);
  assert.ok(cold > panel.Voc);
  assert.ok(hot < panel.Voc);
});

test('checkSizingLimits returns violations for unsafe string setup', () => {
  const inv = { V_max: 1100, V_mppt_min: 200, V_mppt_max: 850, I_max_per_mppt: 30 };
  const violations = PVCalc.checkSizingLimits(panel, 27, 4, 5, 70, inv);
  assert.ok(Array.isArray(violations));
  assert.ok(violations.length > 0);
});

test('checkSizingLimits returns no violation for conservative setup', () => {
  const inv = { V_max: 1100, V_mppt_min: 200, V_mppt_max: 850, I_max_per_mppt: 30 };
  const violations = PVCalc.checkSizingLimits(panel, 16, 2, 10, 65, inv);
  assert.equal(violations.length, 0);
});

test('fieldTestString passes when measured values are derived from STC expected', () => {
  const nModules = 16;
  const Tmod = 45;
  const G = 900;

  const VocExpected = panel.Voc * nModules;
  const IscExpected = panel.Isc;
  const VocMeas = VocExpected * (1 + panel.coeffVoc * (Tmod - 25));
  const IscMeas = IscExpected * (1 + panel.coeffIsc * (Tmod - 25)) * (G / 1000);

  const result = PVCalc.fieldTestString(panel, VocMeas, IscMeas, Tmod, G, nModules);
  assert.ok(Math.abs(result.devVoc) < 0.01);
  assert.ok(Math.abs(result.devIsc) < 0.01);
  assert.equal(result.passVoc, true);
  assert.equal(result.passIsc, true);
});

test('detectFault identifies open-circuit condition', () => {
  const fault = PVCalc.detectFault(5, 0.2, 800, 13, 16, panel);
  assert.equal(fault.severity, 'fault');
  assert.match(fault.fault, /Open Circuit/i);
});