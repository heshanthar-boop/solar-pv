/**
 * pv-calc.js — Pure PV Calculation Engine
 * No DOM access. All functions take plain numbers, return plain numbers.
 * Called by: sizing.js, temp-correct.js, field-test.js, fault.js
 *
 * Convention: all coefficients are decimal/°C (e.g. -0.0026), NOT %/°C
 */

const PVCalc = (() => {

  // --- THRESHOLDS (fault detection) ---
  const THRESH = {
    open_circuit_voc_ratio: 0.05,       // Voc < 5% of expected -> open circuit
    short_circuit_voc_ratio: 0.15,      // Voc < 15% of expected -> possible short
    bypass_diode_tolerance: 0.05,       // +/-5% match for bypass diode pattern
    shading_voc_low: 0.80,              // Voc 80-95% -> possible shading
    shading_voc_high: 0.96,
    mismatch_isc_ratio: 0.90,           // Isc < 90% while Voc is normal -> mismatch
  };

  const FIELD_TEST_PROFILES = {
    iec62446_2016: {
      id: 'iec62446_2016',
      label: 'IEC 62446-1:2016',
      vocTolPct: 2,
      iscTolPct: 5,
      note: 'Voc checked after temperature correction. Isc checked after irradiance and temperature correction.',
    },
    legacy_3_5: {
      id: 'legacy_3_5',
      label: 'Legacy profile (Voc +/-3%, Isc +/-5%)',
      vocTolPct: 3,
      iscTolPct: 5,
      note: 'Legacy tolerance retained for backward compatibility.',
    },
  };

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
        };
      }
    }
    const key = String(profile || 'iec62446_2016');
    return FIELD_TEST_PROFILES[key] || FIELD_TEST_PROFILES.iec62446_2016;
  }

  // -----------------------------------------------------------------------
  // TEMPERATURE & IRRADIANCE CORRECTIONS
  // -----------------------------------------------------------------------

  /**
   * Voc at a given cell temperature.
   * @param {number} Voc_stc  - STC Voc (V)
   * @param {number} coeff    - tempCoeffVoc (decimal/°C, negative for Si)
   * @param {number} T_cell   - cell temperature (°C)
   */
  function vocAtTemp(Voc_stc, coeff, T_cell) {
    return Voc_stc * (1 + coeff * (T_cell - 25));
  }

  /**
   * Vmp at a given cell temperature (uses Voc coefficient as approximation — standard practice).
   */
  function vmpAtTemp(Vmp_stc, coeff, T_cell) {
    return Vmp_stc * (1 + coeff * (T_cell - 25));
  }

  /**
   * Isc corrected for temperature only.
   */
  function iscAtTemp(Isc_stc, coeff, T_cell) {
    return Isc_stc * (1 + coeff * (T_cell - 25));
  }

  /**
   * Isc corrected for irradiance (linear with irradiance).
   */
  function iscAtIrradiance(Isc_stc, G_Wm2) {
    return Isc_stc * (G_Wm2 / 1000);
  }

  /**
   * Isc corrected for both irradiance and temperature.
   */
  function iscCorrected(Isc_stc, coeff, T_cell, G_Wm2) {
    return iscAtIrradiance(iscAtTemp(Isc_stc, coeff, T_cell), G_Wm2);
  }

  /**
   * Pmax corrected for temperature.
   */
  function pmaxAtTemp(Pmax_stc, coeff, T_cell) {
    return Pmax_stc * (1 + coeff * (T_cell - 25));
  }

  /**
   * Cell temperature from ambient using NOCT formula.
   * T_cell = T_amb + (NOCT - 20) / 800 * G
   * Standard G for NOCT test = 800 W/m²
   */
  function cellTemp(T_amb, NOCT, G_Wm2) {
    return T_amb + ((NOCT - 20) / 800) * G_Wm2;
  }

  // -----------------------------------------------------------------------
  // STRING SIZING
  // -----------------------------------------------------------------------

  /**
   * Maximum modules per string — based on Voc at minimum temperature (worst case for inverter).
   * @param {number} Voc_stc
   * @param {number} coeff       - coeffVoc (decimal/°C, negative)
   * @param {number} T_min       - minimum site temperature (°C)
   * @param {number} V_inv_max   - inverter absolute max DC input voltage (V)
   * @returns {number} floor integer
   */
  function maxModulesPerString(Voc_stc, coeff, T_min, V_inv_max) {
    const Voc_at_Tmin = vocAtTemp(Voc_stc, coeff, T_min);
    return Math.floor(V_inv_max / Voc_at_Tmin);
  }

  /**
   * Minimum modules per string — based on Vmp at maximum temperature (must stay above MPPT floor).
   * @param {number} Vmp_stc
   * @param {number} coeff       - coeffVoc (used for Vmp approximation)
   * @param {number} T_max       - maximum cell temperature (°C) — use cellTemp() result
   * @param {number} V_mppt_min  - inverter MPPT minimum voltage (V)
   * @returns {number} ceil integer
   */
  function minModulesPerString(Vmp_stc, coeff, T_max, V_mppt_min) {
    const Vmp_at_Tmax = vmpAtTemp(Vmp_stc, coeff, T_max);
    return Math.ceil(V_mppt_min / Vmp_at_Tmax);
  }

  /**
   * Maximum strings per MPPT — based on Isc at maximum temperature vs inverter current limit.
   */
  function maxStringsPerMPPT(Isc_stc, coeff, T_max, I_inv_max_per_mppt) {
    const Isc_at_Tmax = iscAtTemp(Isc_stc, coeff, T_max);
    return Math.floor(I_inv_max_per_mppt / Isc_at_Tmax);
  }

  /**
   * Full string sizing result for a given configuration.
   * @param {object} panel  - panel object from DB
   * @param {number} n_mod  - modules per string
   * @param {number} n_str  - strings per MPPT
   * @param {number} n_mppt - number of MPPTs used
   * @param {number} T_cell - cell temperature at STC-ish condition (use 25 for STC calcs)
   */
  function arrayParams(panel, n_mod, n_str, n_mppt, T_cell) {
    T_cell = T_cell || 25;
    const coeffVmp = Number.isFinite(panel.coeffVmp) ? panel.coeffVmp : panel.coeffVoc;
    const coeffImp = Number.isFinite(panel.coeffImp) ? panel.coeffImp : panel.coeffIsc;
    const strings_total = n_str * n_mppt;
    return {
      string_Voc: vocAtTemp(panel.Voc, panel.coeffVoc, T_cell) * n_mod,
      string_Vmp: vmpAtTemp(panel.Vmp, coeffVmp, T_cell) * n_mod,
      string_Isc: iscAtTemp(panel.Isc, panel.coeffIsc, T_cell),
      string_Imp: iscAtTemp(panel.Imp, coeffImp, T_cell),
      array_Voc: vocAtTemp(panel.Voc, panel.coeffVoc, T_cell) * n_mod,         // parallel strings don't add V
      array_Vmp: vmpAtTemp(panel.Vmp, coeffVmp, T_cell) * n_mod,
      array_Isc: iscAtTemp(panel.Isc, panel.coeffIsc, T_cell) * strings_total,
      array_Imp: iscAtTemp(panel.Imp, coeffImp, T_cell) * strings_total,
      array_Pmax_kW: (pmaxAtTemp(panel.Pmax, panel.coeffPmax, T_cell) * n_mod * strings_total) / 1000,
      total_modules: n_mod * strings_total,
    };
  }

  /**
   * Check if a sizing configuration is within inverter limits.
   * Returns array of violation objects [{param, value, limit, msg}] or [] if safe.
   */
  function checkSizingLimits(panel, n_mod, n_str, T_min, T_max_cell, inv) {
    const violations = [];
    const coeffVmp = Number.isFinite(panel.coeffVmp) ? panel.coeffVmp : panel.coeffVoc;
    const Voc_worst = vocAtTemp(panel.Voc, panel.coeffVoc, T_min) * n_mod;
    const Vmp_hot   = vmpAtTemp(panel.Vmp, coeffVmp, T_max_cell) * n_mod;
    const Vmp_cold  = vmpAtTemp(panel.Vmp, coeffVmp, T_min) * n_mod;
    const Isc_worst = iscAtTemp(panel.Isc, panel.coeffIsc, T_max_cell) * n_str;

    if (Voc_worst > inv.V_max) {
      violations.push({
        param: 'String Voc at T_min',
        value: Voc_worst.toFixed(1) + ' V',
        limit: inv.V_max + ' V',
        msg: `String Voc at ${T_min}°C = ${Voc_worst.toFixed(1)} V exceeds inverter max ${inv.V_max} V. Reduce to max ${Math.floor(inv.V_max / vocAtTemp(panel.Voc, panel.coeffVoc, T_min))} modules.`
      });
    }
    if (Vmp_hot < inv.V_mppt_min) {
      violations.push({
        param: 'String Vmp at T_max',
        value: Vmp_hot.toFixed(1) + ' V',
        limit: inv.V_mppt_min + ' V (MPPT min)',
        msg: `String Vmp at ${T_max_cell.toFixed(0)}°C cell = ${Vmp_hot.toFixed(1)} V is below MPPT minimum ${inv.V_mppt_min} V. Increase to min ${Math.ceil(inv.V_mppt_min / vmpAtTemp(panel.Vmp, coeffVmp, T_max_cell))} modules.`
      });
    }
    if (Vmp_cold > inv.V_mppt_max) {
      violations.push({
        param: 'String Vmp at T_min (MPPT max)',
        value: Vmp_cold.toFixed(1) + ' V',
        limit: inv.V_mppt_max + ' V',
        msg: `String Vmp at ${T_min}°C = ${Vmp_cold.toFixed(1)} V exceeds MPPT max ${inv.V_mppt_max} V. Reduce modules per string or use higher MPPT range inverter.`
      });
    }
    if (Isc_worst > inv.I_max_per_mppt) {
      violations.push({
        param: 'MPPT input current',
        value: Isc_worst.toFixed(2) + ' A',
        limit: inv.I_max_per_mppt + ' A',
        msg: `${n_str} strings × Isc at T_max = ${Isc_worst.toFixed(2)} A exceeds inverter MPPT limit ${inv.I_max_per_mppt} A. Reduce to max ${Math.floor(inv.I_max_per_mppt / iscAtTemp(panel.Isc, panel.coeffIsc, T_max_cell))} strings.`
      });
    }
    return violations;
  }

  // -----------------------------------------------------------------------
  // TEMPERATURE CORRECTION TABLE
  // -----------------------------------------------------------------------

  /**
   * Full correction table for both min and max temp.
   * @returns {object} with .min and .max sub-objects
   */
  function tempCorrectionTable(panel, T_min, T_max, G_Wm2) {
    G_Wm2 = G_Wm2 || 1000;
    const coeffVmp = Number.isFinite(panel.coeffVmp) ? panel.coeffVmp : panel.coeffVoc;
    const coeffImp = Number.isFinite(panel.coeffImp) ? panel.coeffImp : panel.coeffIsc;
    function row(T) {
      const Voc = vocAtTemp(panel.Voc, panel.coeffVoc, T);
      const Vmp = vmpAtTemp(panel.Vmp, coeffVmp, T);
      const Isc = iscCorrected(panel.Isc, panel.coeffIsc, T, G_Wm2);
      const Pmax = pmaxAtTemp(panel.Pmax, panel.coeffPmax, T) * (G_Wm2 / 1000);
      const Imp = iscAtTemp(panel.Imp, coeffImp, T) * (G_Wm2 / 1000);
      return {
        T, Voc, Vmp, Isc, Imp, Pmax,
        devVoc:  pct(Voc,  panel.Voc),
        devVmp:  pct(Vmp,  panel.Vmp),
        devIsc:  pct(Isc,  panel.Isc),
        devPmax: pct(Pmax, panel.Pmax),
      };
    }
    function pct(val, ref) { return ((val - ref) / ref * 100); }
    return { min: row(T_min), max: row(T_max), stc: row(25) };
  }

  // -----------------------------------------------------------------------
  // FIELD TEST → STC CORRECTION
  // -----------------------------------------------------------------------

  /**
   * Correct measured Voc back to STC conditions.
   * V_stc ≈ V_meas / (1 + coeffVoc * (T_cell - 25))
   */
  function correctVocToSTC(V_meas, coeffVoc, T_cell) {
    return V_meas / (1 + coeffVoc * (T_cell - 25));
  }

  /**
   * Correct measured Isc back to STC conditions.
   * I_stc ≈ I_meas / ((G/1000) * (1 + coeffIsc * (T_cell - 25)))
   */
  function correctIscToSTC(I_meas, coeffIsc, T_cell, G_Wm2) {
    const tempFactor = 1 + coeffIsc * (T_cell - 25);
    const irrFactor  = G_Wm2 / 1000;
    return I_meas / (tempFactor * irrFactor);
  }

  /**
   * Full string correction and comparison.
   * @param {object} panel          - panel from DB
   * @param {number} V_meas         - measured string Voc (V)
   * @param {number} I_meas         - measured string Isc (A)
   * @param {number} T_module       - module surface temperature (°C)
   * @param {number} G_Wm2          - irradiance at time of test (W/m²)
   * @param {number} n_modules      - modules in string
   * @returns {object}
   */
  function fieldTestString(panel, V_meas, I_meas, T_module, G_Wm2, n_modules, options) {
    const profile = getFieldTestProfile(options && (options.profileId || options.profile) ? (options.profileId || options.profile) : options);
    const Voc_corrected = correctVocToSTC(V_meas, panel.coeffVoc, T_module);
    const Isc_corrected = correctIscToSTC(I_meas, panel.coeffIsc, T_module, G_Wm2);

    const Voc_expected = panel.Voc * n_modules;
    const Isc_expected = panel.Isc;  // Isc is per-string (parallel strings not here)

    const devVoc = (Voc_corrected - Voc_expected) / Voc_expected * 100;
    const devIsc = (Isc_corrected - Isc_expected) / Isc_expected * 100;

    return {
      Voc_meas: V_meas,
      Isc_meas: I_meas,
      Voc_corrected,
      Isc_corrected,
      Voc_expected,
      Isc_expected,
      devVoc,
      devIsc,
      profileId: profile.id,
      profileLabel: profile.label,
      vocTolerancePct: profile.vocTolPct,
      iscTolerancePct: profile.iscTolPct,
      passVoc: Math.abs(devVoc) <= profile.vocTolPct,
      passIsc: Math.abs(devIsc) <= profile.iscTolPct,
    };
  }

  // -----------------------------------------------------------------------
  // FAULT DETECTION
  // -----------------------------------------------------------------------

  /**
   * Detect fault type from measured Voc/Isc vs expected.
   * @param {number} Voc_meas       - measured string Voc
   * @param {number} Isc_meas       - measured string Isc
   * @param {number} Voc_expected   - expected string Voc at STC (n_mod × panel.Voc)
   * @param {number} Isc_expected   - expected Isc (panel.Isc)
   * @param {number} n_modules      - modules in string
   * @param {object} panel          - panel from DB
   * @returns {{ fault: string, severity: string, detail: string }}
   */
  function detectFault(Voc_meas, Isc_meas, Voc_expected, Isc_expected, n_modules, panel) {
    const vRatio = Voc_meas / Voc_expected;
    const iRatio = Isc_expected > 0 ? Isc_meas / Isc_expected : 1;
    const T = THRESH;

    // Open circuit
    if (vRatio < T.open_circuit_voc_ratio) {
      return { fault: 'Open Circuit', severity: 'fault', detail: `Voc = ${Voc_meas.toFixed(1)} V (${(vRatio*100).toFixed(0)}% of expected). String open — check MC4 connectors, fuse, or string lead.` };
    }

    // Short circuit (very low Voc, not zero)
    if (vRatio < T.short_circuit_voc_ratio) {
      return { fault: 'Short / Ground Fault', severity: 'fault', detail: `Voc = ${Voc_meas.toFixed(1)} V (${(vRatio*100).toFixed(0)}% of expected). Possible string short or ground fault.` };
    }

    // Bypass diode fault — check if Voc matches dropping 1, 2, or 3 bypass diodes worth of Voc
    // Each module typically has 3 bypass diodes, each protecting n_cells/3 cells
    // A single failed diode shorts 1/3 of a module's cells
    const module_Voc = panel.Voc;
    for (let k = 1; k <= Math.min(n_modules * 3, 12); k++) {
      const diode_drop = (module_Voc / 3); // each bypass diode ≈ 1/3 module Voc
      const expected_with_k_diodes = Voc_expected - k * diode_drop;
      if (Math.abs(Voc_meas - expected_with_k_diodes) / Voc_expected < T.bypass_diode_tolerance) {
        return {
          fault: 'Bypass Diode Suspected',
          severity: 'warning',
          detail: `Voc matches pattern for ${k} failed bypass diode(s). Each diode shorts ~1/3 of a module. Voc = ${Voc_meas.toFixed(1)} V, expected with ${k} diode(s) shorted: ${expected_with_k_diodes.toFixed(1)} V.`
        };
      }
    }

    // Module-level bypass (entire module dropped out) — Voc matches (n-k)/n modules
    for (let k = 1; k <= Math.min(n_modules - 1, 5); k++) {
      const expected_minus_k = (n_modules - k) * module_Voc;
      if (Math.abs(Voc_meas - expected_minus_k) / Voc_expected < T.bypass_diode_tolerance) {
        return {
          fault: `${k} Module(s) Open/Bypassed`,
          severity: 'fault',
          detail: `Voc = ${Voc_meas.toFixed(1)} V matches ${n_modules - k} of ${n_modules} modules active. ${k} module(s) may be open-circuited or fully bypassed.`
        };
      }
    }

    // Shading (Voc in 80–96% range)
    if (vRatio >= T.shading_voc_low && vRatio < T.shading_voc_high) {
      if (iRatio < T.mismatch_isc_ratio) {
        return { fault: 'Shading / Soiling', severity: 'warning', detail: `Voc = ${(vRatio*100).toFixed(0)}% of expected, Isc low. Partial shading or heavy soiling suspected.` };
      }
      return { fault: 'Partial Shading', severity: 'warning', detail: `Voc = ${(vRatio*100).toFixed(0)}% of expected. Possible partial shading — Isc within limits.` };
    }

    // Current mismatch (Isc low while Voc is normal)
    if (iRatio < T.mismatch_isc_ratio && vRatio > T.shading_voc_high) {
      return { fault: 'Current Mismatch', severity: 'warning', detail: `Isc = ${(iRatio*100).toFixed(0)}% of expected while Voc is normal. Possible module mismatch, soiling, or degraded module.` };
    }

    // All good
    return { fault: 'OK', severity: 'ok', detail: `Voc: ${(vRatio*100).toFixed(1)}%, Isc: ${(iRatio*100).toFixed(1)}% of expected. Within limits.` };
  }

  // -----------------------------------------------------------------------
  // PERFORMANCE RATIO
  // -----------------------------------------------------------------------

  /**
   * Performance Ratio (PR) — IEC 61724-1
   * PR = E_AC / (H_poa * P_stc / G_stc)
   * @param {number} E_AC_kWh    - actual AC energy produced (kWh) over measurement period
   * @param {number} H_poa_kWh   - plane-of-array irradiation over same period (kWh/m²)
   * @param {number} P_stc_kWp   - nameplate DC capacity (kWp)
   * @param {number} G_stc       - STC irradiance (default 1.0 kW/m²)
   * @returns {number} PR as fraction (e.g. 0.80 = 80%)
   */
  function performanceRatio(E_AC_kWh, H_poa_kWh, P_stc_kWp, G_stc) {
    G_stc = G_stc || 1.0;  // kW/m²
    if (!H_poa_kWh || !P_stc_kWp) return null;
    return E_AC_kWh / (H_poa_kWh * P_stc_kWp / G_stc);
  }

  /**
   * Expected power output at given irradiance + temperature (for PR baseline).
   * P = P_stc * (G / G_stc) * (1 + coeffPmax * (T_cell - 25))
   */
  function expectedPower(P_stc, G_Wm2, T_cell, coeffPmax) {
    return P_stc * (G_Wm2 / 1000) * (1 + coeffPmax * (T_cell - 25));
  }

  /**
   * Insulation Resistance minimum per IEC 62446-1.
   * For systems ≤ 1000V: minimum 1 MΩ at 500V DC test voltage.
   * Returns 'pass' or 'fail' and the minimum value.
   */
  function irTestResult(measured_MOhm) {
    const MIN_IR = 1.0; // MΩ — IEC 62446-1
    return {
      pass: measured_MOhm >= MIN_IR,
      min: MIN_IR,
      measured: measured_MOhm,
      verdict: measured_MOhm >= MIN_IR ? 'PASS' : 'FAIL — Below 1 MΩ minimum (IEC 62446-1)'
    };
  }

  // -----------------------------------------------------------------------
  // HYBRID SYSTEM SIZING
  // -----------------------------------------------------------------------

  /**
   * Battery bank capacity sizing for hybrid/off-grid autonomy planning.
   *
   * Required nominal battery energy (kWh):
   *   E_nom = (E_day * N_autonomy * reserve) / (DoD * eta_batt * eta_inv * temp_derate)
   */
  function batteryCapacity(dailyEnergy_kWh, autonomyDays, dod, etaBatt, etaInv, tempDerate, reserveFactor) {
    if (
      !Number.isFinite(dailyEnergy_kWh) || dailyEnergy_kWh <= 0 ||
      !Number.isFinite(autonomyDays) || autonomyDays <= 0 ||
      !Number.isFinite(dod) || dod <= 0 || dod > 1 ||
      !Number.isFinite(etaBatt) || etaBatt <= 0 || etaBatt > 1 ||
      !Number.isFinite(etaInv) || etaInv <= 0 || etaInv > 1 ||
      !Number.isFinite(tempDerate) || tempDerate <= 0 || tempDerate > 1
    ) {
      return null;
    }

    const reserve = Number.isFinite(reserveFactor) && reserveFactor > 0 ? reserveFactor : 1.0;
    const requiredDelivered_kWh = dailyEnergy_kWh * autonomyDays * reserve;
    const requiredUsable_kWh = requiredDelivered_kWh / (etaBatt * etaInv * tempDerate);
    const requiredNominal_kWh = requiredUsable_kWh / dod;

    return {
      requiredDelivered_kWh,
      requiredUsable_kWh,
      requiredNominal_kWh,
      totalEfficiency: etaBatt * etaInv * tempDerate,
      dod,
      reserve,
    };
  }

  /**
   * Convert battery energy in kWh to ampere-hour at nominal DC bus voltage.
   */
  function batteryAhAtVoltage(energy_kWh, busVoltage_V) {
    if (!Number.isFinite(energy_kWh) || energy_kWh <= 0 || !Number.isFinite(busVoltage_V) || busVoltage_V <= 0) {
      return null;
    }
    return (energy_kWh * 1000) / busVoltage_V;
  }

  /**
   * PV DC capacity estimate for hybrid system energy balance.
   *
   * Base PV size:
   *   P_dc = E_day / (PSH * PR_sys)
   */
  function hybridPVCapacity(dailyEnergy_kWh, psh, systemPR, oversizeFactor) {
    if (
      !Number.isFinite(dailyEnergy_kWh) || dailyEnergy_kWh <= 0 ||
      !Number.isFinite(psh) || psh <= 0 ||
      !Number.isFinite(systemPR) || systemPR <= 0 || systemPR > 1
    ) {
      return null;
    }
    const oversize = Number.isFinite(oversizeFactor) && oversizeFactor > 0 ? oversizeFactor : 1.0;
    const base_kWp = dailyEnergy_kWh / (psh * systemPR);
    return {
      base_kWp,
      recommended_kWp: base_kWp * oversize,
      oversize,
    };
  }

  /**
   * Hybrid inverter sizing from peak and surge demand.
   */
  function hybridInverterCapacity(peakLoad_kW, surgeLoad_kW, safetyFactor) {
    if (!Number.isFinite(peakLoad_kW) || peakLoad_kW <= 0) return null;
    const factor = Number.isFinite(safetyFactor) && safetyFactor > 0 ? safetyFactor : 1.25;
    const surgeInput = Number.isFinite(surgeLoad_kW) && surgeLoad_kW > 0 ? surgeLoad_kW : peakLoad_kW * 1.5;
    const requiredContinuous_kW = peakLoad_kW * factor;
    const requiredSurge_kW = Math.max(surgeInput, requiredContinuous_kW * 1.5);

    return {
      requiredContinuous_kW,
      requiredSurge_kW,
      safetyFactor: factor,
      suggestedNameplate_kW: Math.ceil(requiredContinuous_kW * 2) / 2, // 0.5kW step
    };
  }

  /**
   * Approximate battery-side charge current from PV capacity.
   * I_charge ~= P_dc / V_batt * margin
   */
  function hybridChargeCurrent(pv_kWp, batteryVoltage_V, marginFactor) {
    if (
      !Number.isFinite(pv_kWp) || pv_kWp <= 0 ||
      !Number.isFinite(batteryVoltage_V) || batteryVoltage_V <= 0
    ) {
      return null;
    }
    const margin = Number.isFinite(marginFactor) && marginFactor > 0 ? marginFactor : 1.25;
    const current_A = (pv_kWp * 1000 / batteryVoltage_V) * margin;
    return {
      current_A,
      margin,
    };
  }

  // -----------------------------------------------------------------------
  // UTILITY
  // -----------------------------------------------------------------------

  function round2(n) { return Math.round(n * 100) / 100; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function pctStr(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

  return {
    vocAtTemp, vmpAtTemp, iscAtTemp, iscAtIrradiance, iscCorrected, pmaxAtTemp, cellTemp,
    maxModulesPerString, minModulesPerString, maxStringsPerMPPT, arrayParams, checkSizingLimits,
    tempCorrectionTable,
    correctVocToSTC, correctIscToSTC, fieldTestString,
    detectFault,
    performanceRatio, expectedPower, irTestResult,
    batteryCapacity, batteryAhAtVoltage, hybridPVCapacity, hybridInverterCapacity, hybridChargeCurrent,
    round2, round1, pctStr,
    THRESH,
    FIELD_TEST_PROFILES,
    getFieldTestProfile
  };
})();
