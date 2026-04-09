const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModule } = require('./helpers/load-browser-module');

const HybridSetup = loadBrowserModule('js/hybrid.js', 'HybridSetup', {
  App: { state: {}, escapeHTML: (v) => String(v ?? '') },
  PVCalc: {},
  DB: {},
});

function allSubmissionTrue() {
  return {
    utilityDocSld: true,
    utilityDocProtectionSettings: true,
    utilityDocEquipmentApprovals: true,
    utilityDocCommissioningReport: true,
    utilityDocInterconnectionForm: true,
    utilityMeterReady: true,
    utilityIsolationAccessible: true,
    utilitySettingsMatched: true,
    utilityFinalAcceptance: true,
  };
}

test('utility submission strict gate fails when required evidence is missing', () => {
  const evalGate = HybridSetup.__test.evaluateUtilitySubmission;
  const profile = { id: 'ceb_2025', label: 'CEB Settings (2025)', exportEnabled: true };
  const out = evalGate(
    {
      exportMode: 'export',
      utilityDocSld: false,
      utilityDocProtectionSettings: false,
      utilityDocEquipmentApprovals: false,
      utilityDocCommissioningReport: false,
      utilityDocInterconnectionForm: false,
      utilityMeterReady: false,
      utilityIsolationAccessible: false,
      utilitySettingsMatched: false,
      utilityFinalAcceptance: false,
    },
    profile,
    null
  );

  assert.equal(out.applicable, true);
  assert.equal(out.strictPass, false);
  assert.equal(out.docTotal, 5);
  assert.equal(out.missingDocuments.length, 5);
  assert.ok(out.blockers.length > 0);
  assert.ok(out.blockers.some((x) => /Inverter model selection/i.test(x)));
});

test('utility submission strict gate passes when all docs and gates are complete', () => {
  const evalGate = HybridSetup.__test.evaluateUtilitySubmission;
  const profile = { id: 'ceb_2025', label: 'CEB Settings (2025)', exportEnabled: true };
  const inverter = { manufacturer: 'Demo', model: 'INV-6K' };
  const out = evalGate(
    { exportMode: 'export', ...allSubmissionTrue() },
    profile,
    inverter
  );

  assert.equal(out.applicable, true);
  assert.equal(out.strictPass, true);
  assert.equal(out.docProvided, out.docTotal);
  assert.equal(out.blockers.length, 0);
});

test('project pack includes SLD, BOM, settings sheet, and compliance checklist', () => {
  const evalGate = HybridSetup.__test.evaluateUtilitySubmission;
  const buildPack = HybridSetup.__test.buildProjectPack;
  const profile = {
    id: 'ceb_2025',
    label: 'CEB Settings (2025)',
    exportEnabled: true,
    utility: 'CEB',
    voltageWindow: 'Configured',
    frequencyWindow: 'Configured',
    reconnect_s: 600
  };
  const inverter = {
    manufacturer: 'Demo',
    model: 'INV-6K',
    acRated_kW: 6,
    surge_kW: 9,
    surge_s: 10,
    batteryBus_V: 48,
    mpptCount: 2,
    utilityListed: { ceb_2025: true },
    listingSource: { ceb_2025: 'Official list ref' },
    datasheetRev: 'Rev A'
  };
  const battery = {
    manufacturer: 'Demo',
    model: 'BAT-5K',
    nominalV: 51.2,
    capacityAh: 100,
    datasheetRev: 'Rev B'
  };
  const panel = {
    manufacturer: 'Demo',
    model: 'PV-550',
    Pmax: 550,
    Voc: 49.8,
    Isc: 13.2,
    datasheetRev: 'Rev C'
  };
  const submission = evalGate({ exportMode: 'export', ...allSubmissionTrue() }, profile, inverter);
  const result = {
    date: '2026-04-09',
    chemistryLabel: 'LiFePO4',
    badges: ['Catalogue-backed', 'Datasheet-backed'],
    battery: {
      requiredNominal_kWh: 20,
      requiredUsable_kWh: 16,
      totalEfficiency: 0.8
    },
    batteryAh: 420,
    pv: { recommended_kWp: 6.6 },
    inverter: { requiredContinuous_kW: 6.1, requiredSurge_kW: 9.2 },
    charge: { current_A: 122.4 },
    inputs: {
      exportMode: 'export',
      utilityProfile: 'ceb_2025',
      modulesPerString: 11,
      stringsPerMppt: 1,
      batteryParallel: 2,
      batteryVoltage_V: 48,
      dailyEnergy_kWh: 18,
      autonomyDays: 1,
      psh: 4.8,
      systemPR: 0.75,
      pvOversize: 1.15,
      inverterSafetyFactor: 1.25,
      chargeMargin: 1.25,
      ...allSubmissionTrue()
    },
    warnings: [],
    catalogue: {
      inverterModel: inverter,
      batteryModel: battery,
      panelModel: panel,
      profile,
      summary: { pass: 10, warn: 1, fail: 0 },
      checks: [
        {
          check: 'Inverter AC continuous capability',
          value: '6.10kW',
          target: '<= 6.00kW',
          status: 'warn',
          note: 'Near inverter rating.',
          source: 'Inverter datasheet'
        }
      ],
      utilitySubmission: submission
    }
  };

  const pack = buildPack(result);
  assert.equal(pack.format, 'solarpv.project-pack.v1');
  assert.ok(typeof pack.sld.mermaid === 'string' && pack.sld.mermaid.includes('graph LR'));
  assert.ok(Array.isArray(pack.bom) && pack.bom.length >= 6);
  assert.ok(Array.isArray(pack.settingsSheet) && pack.settingsSheet.some((row) => row[0] === 'Utility profile'));
  assert.ok(Array.isArray(pack.complianceChecklist) && pack.complianceChecklist.length >= 2);
});
