/**
 * standards-calc.js - Pure calculator helpers used by standards workflows.
 * No DOM dependencies. Intended for reuse and unit testing.
 */

const StandardsCalc = (() => {
  function performanceRatio(E_ac_kWh, H_poa_kWhm2, P_stc_kWp) {
    if (!Number.isFinite(E_ac_kWh) || !Number.isFinite(H_poa_kWhm2) || !Number.isFinite(P_stc_kWp) || H_poa_kWhm2 <= 0 || P_stc_kWp <= 0) {
      return null;
    }
    const pr = E_ac_kWh / (H_poa_kWhm2 * P_stc_kWp);
    return {
      pr,
      percent: pr * 100,
      band: pr >= 0.8 ? 'good' : pr >= 0.7 ? 'acceptable' : 'poor',
    };
  }

  function specificYield(annualEnergy_kWh, systemSize_kWp) {
    if (!Number.isFinite(annualEnergy_kWh) || !Number.isFinite(systemSize_kWp) || systemSize_kWp <= 0) {
      return null;
    }
    const value = annualEnergy_kWh / systemSize_kWp;
    return {
      value,
      band: value >= 1300 ? 'high' : value >= 1000 ? 'mid' : 'low',
    };
  }

  function inverterSizing(Pdc_kWp, Pac_kW) {
    if (!Number.isFinite(Pdc_kWp) || !Number.isFinite(Pac_kW) || Pdc_kWp <= 0 || Pac_kW <= 0) {
      return null;
    }
    const ratio = Pac_kW / Pdc_kWp;
    const minRecommended = 0.85 * Pdc_kWp;
    const pass = ratio >= 0.8;
    const optimal = ratio >= 0.85 && ratio <= 1.05;
    return {
      ratio,
      minRecommended,
      pass,
      optimal,
    };
  }

  function cableVoltageDrop(lengthOneWay_m, current_A, area_mm2, nominal_V, side) {
    if (
      !Number.isFinite(lengthOneWay_m) ||
      !Number.isFinite(current_A) ||
      !Number.isFinite(area_mm2) ||
      !Number.isFinite(nominal_V) ||
      area_mm2 <= 0 ||
      nominal_V <= 0
    ) {
      return null;
    }

    const rho = 0.0172; // copper Ohm*mm^2/m
    const dropV = (2 * lengthOneWay_m * current_A * rho) / area_mm2;
    const dropPercent = (dropV / nominal_V) * 100;
    const limitPercent = side === 'dc' ? 1.0 : 3.0;
    return {
      dropV,
      dropPercent,
      limitPercent,
      pass: dropPercent <= limitPercent,
      rho,
    };
  }

  function stringVocAtTmin(panelVoc_stc, coeffVoc, nModules, Tmin_C, inverterVmax) {
    if (
      !Number.isFinite(panelVoc_stc) ||
      !Number.isFinite(coeffVoc) ||
      !Number.isFinite(nModules) ||
      !Number.isFinite(Tmin_C) ||
      !Number.isFinite(inverterVmax) ||
      nModules <= 0
    ) {
      return null;
    }
    const factor = 1 + coeffVoc * (Tmin_C - 25);
    const voc = nModules * panelVoc_stc * factor;
    return {
      voc,
      factor,
      pass: voc <= inverterVmax,
      maxModules: Math.floor(inverterVmax / (panelVoc_stc * factor)),
    };
  }

  function stringVmpAtTmax(panelVmp_stc, coeffVoc, NOCT, Tamb_C, nModules, mpptVmin, irradiance_Wm2) {
    if (
      !Number.isFinite(panelVmp_stc) ||
      !Number.isFinite(coeffVoc) ||
      !Number.isFinite(NOCT) ||
      !Number.isFinite(Tamb_C) ||
      !Number.isFinite(nModules) ||
      !Number.isFinite(mpptVmin) ||
      nModules <= 0
    ) {
      return null;
    }
    const G = Number.isFinite(irradiance_Wm2) ? irradiance_Wm2 : 1000;
    const tCell = Tamb_C + ((NOCT - 20) / 800) * G;
    const factor = 1 + coeffVoc * (tCell - 25);
    const vmp = nModules * panelVmp_stc * factor;
    return {
      vmp,
      tCell,
      factor,
      pass: vmp >= mpptVmin,
      minModules: Math.ceil(mpptVmin / (panelVmp_stc * factor)),
    };
  }

  return {
    performanceRatio,
    specificYield,
    inverterSizing,
    cableVoltageDrop,
    stringVocAtTmin,
    stringVmpAtTmax,
  };
})();

