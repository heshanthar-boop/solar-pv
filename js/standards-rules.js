/**
 * standards-rules.js
 * Single source of truth for standards-based limits and tolerance profiles.
 */

const StandardsRules = (() => {
  const RULESET_VERSION = '2026.04.09';

  const FIELD_TEST_PROFILES = Object.freeze({
    iec62446_2016: Object.freeze({
      id: 'iec62446_2016',
      label: 'IEC 62446-1:2016 + AMD1:2018',
      vocTolPct: 2,
      iscTolPct: 5,
      note: 'Voc after temperature correction, Isc after irradiance and temperature correction.',
      standardRef: 'IEC 62446-1:2016 + AMD1:2018'
    }),
    legacy_3_5: Object.freeze({
      id: 'legacy_3_5',
      label: 'Legacy profile (Voc +/-3%, Isc +/-5%)',
      vocTolPct: 3,
      iscTolPct: 5,
      note: 'Legacy tolerance retained for historical report compatibility.',
      standardRef: 'Legacy (non-default)'
    })
  });

  const DEFAULT_FIELD_TEST_PROFILE_ID = 'iec62446_2016';

  const LIMITS = Object.freeze({
    irTest: Object.freeze({
      minMOhm: 1.0,
      testVoltageV: 500,
      standardRef: 'IEC 62446-1:2016 + AMD1:2018 Cl. 5.3.3'
    }),
    earthing: Object.freeze({
      targetOhm: 1.0,
      standardRef: 'IEC 60364-5-54 / SLS 1522'
    }),
    gridWindow: Object.freeze({
      vNominal: 230,
      vMin: 207,
      vMax: 253,
      fNominal: 50,
      fMin: 49,
      fMax: 51,
      standardRef: 'PUCSL / IEC 62116 / utility profile'
    }),
    cableVoltageDropPct: Object.freeze({
      dc: 1.0,
      ac: 3.0,
      standardRef: 'IEC 60364-7-712 / SLS 1522'
    }),
    designFactors: Object.freeze({
      continuousCurrent: 1.25,
      fuseSafety: 1.25,
      spdUc: 1.2
    }),
    stringFuseNoFuseMaxParallel: 3
  });

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getFieldTestProfiles() {
    return _clone(FIELD_TEST_PROFILES);
  }

  function getDefaultFieldTestProfileId() {
    return DEFAULT_FIELD_TEST_PROFILE_ID;
  }

  function getFieldTestProfile(profile) {
    if (profile && typeof profile === 'object') {
      const vocTolPct = Number(profile.vocTolPct);
      const iscTolPct = Number(profile.iscTolPct);
      if (Number.isFinite(vocTolPct) && Number.isFinite(iscTolPct) && vocTolPct > 0 && iscTolPct > 0) {
        return {
          id: String(profile.id || 'custom'),
          label: String(profile.label || 'Custom profile'),
          vocTolPct,
          iscTolPct,
          note: String(profile.note || 'User-defined field-test acceptance profile.'),
          standardRef: String(profile.standardRef || 'Custom profile')
        };
      }
    }

    const profiles = FIELD_TEST_PROFILES;
    const key = String(profile || DEFAULT_FIELD_TEST_PROFILE_ID);
    const selected = profiles[key] || profiles[DEFAULT_FIELD_TEST_PROFILE_ID];
    return _clone(selected);
  }

  function getIRTestRule() {
    return _clone(LIMITS.irTest);
  }

  function getEarthingRule() {
    return _clone(LIMITS.earthing);
  }

  function getGridWindowRule() {
    return _clone(LIMITS.gridWindow);
  }

  function getCableVoltageDropLimits() {
    return _clone(LIMITS.cableVoltageDropPct);
  }

  function getDesignFactors() {
    return _clone(LIMITS.designFactors);
  }

  function getStringFuseNoFuseMaxParallel() {
    return Number(LIMITS.stringFuseNoFuseMaxParallel);
  }

  function getRulesVersion() {
    return RULESET_VERSION;
  }

  return {
    RULESET_VERSION,
    getRulesVersion,
    getFieldTestProfiles,
    getDefaultFieldTestProfileId,
    getFieldTestProfile,
    getIRTestRule,
    getEarthingRule,
    getGridWindowRule,
    getCableVoltageDropLimits,
    getDesignFactors,
    getStringFuseNoFuseMaxParallel
  };
})();

