/**
 * yield-estimator.js â€” PV Energy Yield Estimator
 *
 * Engineering model: E_daily = P_dc Ã— H_poa Ã— PR
 *
 * PR = Î·_inv Ã— (1 - L_temp) Ã— (1 - L_cable) Ã— (1 - L_soiling) Ã— (1 - L_mismatch)
 *
 * L_temp = gamma Ã— (T_cell_avg - 25)  [positive value when T_cell > 25]
 * T_cell_avg = T_amb_avg + k Ã— (H_poa / daylight_h)  [NOCT-derived, energy-weighted]
 *
 * Irradiance model:
 *   MODE 1 (Static): Regional GHI dataset for Sri Lanka, corrected to POA using
 *                    isotropic sky model with monthly diffuse fraction.
 *   MODE 2 (Hourly): Sinusoidal G(t) = G_peak Ã— sin(Ï€Ã—t/T_day), hourly integration
 *                    with hourly temperature profile for improved accuracy.
 *
 * Tilt correction (isotropic sky model, Liu-Jordan):
 *   H_poa = H_beam Ã— R_b + H_diff Ã— (1+cos beta)/2 + H_gh Ã— Ï Ã— (1-cos beta)/2
 *
 * Assumptions (explicitly stated in UI):
 * - Isotropic diffuse sky model (conservative vs Hay-Davies for low-latitude sites)
 * - NOCT formula for cell temperature (IEC 61215 test conditions)
 * - Monthly mean ambient temperature; no hourly TMY weather file
 * - Diffuse fraction K_d from Erbs model (empirical) using clearness index K_t
 * - Ground reflectance Ï = 0.20 (grass/concrete default)
 * - No inter-row shading, no module-level soiling variation
 * - Inverter operates at constant efficiency (user-input, or 96.5% default)
 * - No LID modeled separately (use PR soiling/other to account if needed)
 *
 * Model error:
 * - vs measured yield: Â±8â€“15% (daily), Â±5â€“10% (annual average)
 * - Suitable for: pre-design feasibility, orientation/tilt comparison
 * - NOT suitable for: bankable energy reports, financial models requiring P90
 */

const YieldEstimator = (() => {
  function _esc(value) {
    if (typeof App !== 'undefined' && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _localDateISO() {
    if (typeof App !== 'undefined' && typeof App.localDateISO === 'function') {
      return App.localDateISO();
    }
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // =========================================================================
  // STATIC DATA â€” Sri Lanka district coverage (all 25 districts)
  // Source basis: NASA POWER monthly means (~2005â€“2020) cross-checked to
  // PVGIS Sri Lanka trends. Districts are mapped to nearest climate profile.
  // =========================================================================

    const SL_CLIMATE_PROFILES = {
    colombo: {
      T_amb: [28.5, 29.2, 30.1, 30.8, 30.0, 28.8, 28.2, 28.2, 28.5, 28.6, 28.3, 28.0],
      GHI:   [5.30, 5.80, 6.20, 6.00, 5.40, 4.60, 4.50, 4.60, 4.70, 4.80, 4.70, 4.90],
      Kt:    [0.55, 0.57, 0.58, 0.54, 0.49, 0.43, 0.42, 0.43, 0.44, 0.45, 0.46, 0.50],
    },
    kandy: {
      T_amb: [26.5, 27.3, 28.3, 28.8, 28.0, 26.8, 26.2, 26.3, 26.8, 27.0, 26.8, 26.4],
      GHI:   [5.10, 5.60, 6.00, 5.80, 5.20, 4.20, 4.10, 4.30, 4.50, 4.60, 4.50, 4.70],
      Kt:    [0.53, 0.55, 0.56, 0.52, 0.47, 0.39, 0.38, 0.40, 0.42, 0.43, 0.44, 0.48],
    },
    galle: {
      T_amb: [28.2, 28.8, 29.5, 30.0, 29.5, 28.2, 27.8, 27.8, 28.0, 28.2, 28.0, 27.8],
      GHI:   [5.50, 5.90, 6.30, 6.10, 5.30, 4.40, 4.40, 4.60, 4.80, 4.90, 4.80, 5.00],
      Kt:    [0.56, 0.58, 0.59, 0.55, 0.48, 0.41, 0.41, 0.43, 0.45, 0.46, 0.47, 0.51],
    },
    anuradhapura: {
      T_amb: [27.8, 29.5, 31.5, 33.0, 32.5, 30.5, 29.5, 29.5, 29.8, 30.0, 29.5, 28.0],
      GHI:   [5.60, 6.30, 6.90, 7.00, 6.30, 5.60, 5.50, 5.60, 5.40, 5.20, 5.00, 5.20],
      Kt:    [0.57, 0.61, 0.64, 0.63, 0.57, 0.52, 0.51, 0.52, 0.51, 0.49, 0.50, 0.53],
    },
    jaffna: {
      T_amb: [27.5, 29.0, 31.0, 32.5, 31.5, 30.0, 29.0, 29.0, 29.2, 29.5, 29.0, 27.8],
      GHI:   [5.70, 6.50, 7.10, 7.20, 6.50, 5.80, 5.80, 5.90, 5.60, 5.30, 5.10, 5.30],
      Kt:    [0.58, 0.63, 0.66, 0.65, 0.59, 0.54, 0.54, 0.55, 0.53, 0.50, 0.51, 0.54],
    },
    trincomalee: {
      T_amb: [27.0, 28.5, 30.5, 32.0, 31.5, 30.0, 29.0, 28.8, 28.5, 28.5, 28.0, 27.2],
      GHI:   [5.80, 6.60, 7.20, 7.10, 6.20, 5.40, 5.50, 5.70, 5.50, 5.10, 5.00, 5.40],
      Kt:    [0.59, 0.64, 0.67, 0.64, 0.56, 0.50, 0.51, 0.53, 0.52, 0.48, 0.50, 0.55],
    },
    batticaloa: {
      T_amb: [27.5, 28.8, 30.2, 31.5, 30.8, 29.5, 28.8, 28.5, 28.5, 28.5, 28.0, 27.5],
      GHI:   [5.60, 6.30, 6.90, 6.80, 5.90, 5.20, 5.30, 5.50, 5.30, 5.00, 4.90, 5.20],
      Kt:    [0.57, 0.61, 0.64, 0.61, 0.53, 0.48, 0.49, 0.51, 0.50, 0.47, 0.49, 0.53],
    },
    hambantota: {
      T_amb: [28.5, 29.0, 29.8, 30.5, 30.0, 29.0, 28.5, 28.5, 28.8, 29.0, 28.8, 28.5],
      GHI:   [5.70, 6.20, 6.80, 6.80, 6.00, 5.00, 5.00, 5.20, 5.30, 5.20, 5.10, 5.30],
      Kt:    [0.58, 0.60, 0.63, 0.61, 0.54, 0.46, 0.46, 0.49, 0.50, 0.49, 0.50, 0.54],
    },
  };

  const SL_DISTRICT_LOCATIONS = [
    { id: 'ampara',        name: 'Ampara District (Eastern)',              lat: 7.2975, lon: 81.6820, climate: 'batticaloa' },
    { id: 'anuradhapura',  name: 'Anuradhapura District (North Central)',  lat: 8.3114, lon: 80.4037, climate: 'anuradhapura' },
    { id: 'badulla',       name: 'Badulla District (Uva)',                 lat: 6.9895, lon: 81.0550, climate: 'kandy' },
    { id: 'batticaloa',    name: 'Batticaloa District (Eastern)',          lat: 7.7170, lon: 81.7000, climate: 'batticaloa' },
    { id: 'colombo',       name: 'Colombo District (Western)',             lat: 6.9271, lon: 79.8612, climate: 'colombo' },
    { id: 'galle',         name: 'Galle District (Southern)',              lat: 6.0535, lon: 80.2210, climate: 'galle' },
    { id: 'gampaha',       name: 'Gampaha District (Western)',             lat: 7.0873, lon: 79.9994, climate: 'colombo' },
    { id: 'hambantota',    name: 'Hambantota District (Southern)',         lat: 6.1241, lon: 81.1185, climate: 'hambantota' },
    { id: 'jaffna',        name: 'Jaffna District (Northern)',             lat: 9.6615, lon: 80.0255, climate: 'jaffna' },
    { id: 'kalutara',      name: 'Kalutara District (Western)',            lat: 6.5854, lon: 79.9607, climate: 'colombo' },
    { id: 'kandy',         name: 'Kandy District (Central)',               lat: 7.2906, lon: 80.6337, climate: 'kandy' },
    { id: 'kegalle',       name: 'Kegalle District (Sabaragamuwa)',        lat: 7.2513, lon: 80.3464, climate: 'kandy' },
    { id: 'kilinochchi',   name: 'Kilinochchi District (Northern)',        lat: 9.3803, lon: 80.3770, climate: 'jaffna' },
    { id: 'kurunegala',    name: 'Kurunegala District (North Western)',    lat: 7.4863, lon: 80.3647, climate: 'anuradhapura' },
    { id: 'mannar',        name: 'Mannar District (Northern)',             lat: 8.9800, lon: 79.9042, climate: 'jaffna' },
    { id: 'matale',        name: 'Matale District (Central)',              lat: 7.4675, lon: 80.6234, climate: 'kandy' },
    { id: 'matara',        name: 'Matara District (Southern)',             lat: 5.9549, lon: 80.5549, climate: 'galle' },
    { id: 'monaragala',    name: 'Monaragala District (Uva)',              lat: 6.8728, lon: 81.3497, climate: 'hambantota' },
    { id: 'mullaitivu',    name: 'Mullaitivu District (Northern)',         lat: 9.2671, lon: 80.8128, climate: 'jaffna' },
    { id: 'nuwara_eliya',  name: 'Nuwara Eliya District (Central)',        lat: 6.9497, lon: 80.7891, climate: 'kandy' },
    { id: 'polonnaruwa',   name: 'Polonnaruwa District (North Central)',   lat: 7.9403, lon: 81.0188, climate: 'anuradhapura' },
    { id: 'puttalam',      name: 'Puttalam District (North Western)',      lat: 8.0362, lon: 79.8283, climate: 'anuradhapura' },
    { id: 'ratnapura',     name: 'Ratnapura District (Sabaragamuwa)',      lat: 6.6828, lon: 80.3992, climate: 'kandy' },
    { id: 'trincomalee',   name: 'Trincomalee District (Eastern)',         lat: 8.5874, lon: 81.2152, climate: 'trincomalee' },
    { id: 'vavuniya',      name: 'Vavuniya District (Northern)',           lat: 8.7514, lon: 80.4971, climate: 'anuradhapura' },
  ];

  const SL_LOCATIONS = SL_DISTRICT_LOCATIONS.map((d) => {
    const climate = SL_CLIMATE_PROFILES[d.climate] || SL_CLIMATE_PROFILES.colombo;
    return {
      id: d.id,
      name: d.name,
      lat: d.lat,
      lon: d.lon,
      climateProfile: d.climate,
      T_amb: climate.T_amb.slice(),
      GHI: climate.GHI.slice(),
      Kt: climate.Kt.slice(),
    };
  });
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

  // =========================================================================
  // CORE PHYSICS â€” IRRADIANCE MODEL
  // =========================================================================

  /**
   * Decompose GHI into beam and diffuse using Erbs correlation.
   * Reference: Erbs, Klein, Duffie (1982), Solar Energy.
   * Kt = clearness index (GHI / H_extraterrestrial_horizontal)
   * Returns diffuse fraction K_d.
   *
   * Valid for daily Kt values 0.17â€“0.80.
   * Error: Â±0.05â€“0.08 K_d for individual days; better on monthly means.
   */
  function erbsDiffuseFraction(Kt) {
    if (Kt <= 0.22) return 1.0 - 0.09 * Kt;
    if (Kt <= 0.80) return 0.9511 - 0.1604*Kt + 4.388*Kt*Kt - 16.638*Kt*Kt*Kt + 12.336*Kt*Kt*Kt*Kt;
    return 0.165;
  }

  /**
   * Plane-of-array irradiance from GHI using isotropic sky model (Liu-Jordan 1963).
   *
   * H_poa = H_beam Ã— R_b + H_diff Ã— (1 + cos beta)/2 + H_gh Ã— Ï Ã— (1 - cos beta)/2
   *
   * R_b = beam tilt factor â€” ratio of beam on tilted vs horizontal surface.
   * For Sri Lanka (latitude phi â‰ˆ 6â€“10Â°N), optimal tilt is typically phi to phi+5Â°.
   * Facing NORTH is correct in Sri Lanka (southern hemisphere orientation above equator
   * is wrong here â€” Sri Lanka is NORTH of equator, panels face SOUTH toward equator).
   *
   * Simplified R_b for monthly average (Hottel & Woertz approximation):
   *   R_b = cos(phi - beta) / cos(phi)   [for due-south facing, southern hemisphere facing]
   *   R_b = cos(phi - beta) / cos(phi)   [for due-north facing in northern hemisphere]
   *   More precisely: R_b = cos(delta)cos(phi-beta)cos(omega_s') + sin(delta)sin(phi-beta)
   *                         â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   *                         cos(delta)cos(phi)cos(omega_s) + sin(delta)sin(phi)
   *   where delta = declination, omega_s = sunset hour angle
   *
   * For this tool, we use the simplified monthly R_b lookup which is accurate
   * to Â±3â€“5% for tilts up to 30Â° at Sri Lanka latitudes.
   *
   * @param {number} GHI     - horizontal global irradiance (kWh/mÂ²/day)
   * @param {number} Kt      - clearness index (dimensionless)
   * @param {number} tilt    - panel tilt from horizontal (degrees)
   * @param {number} azimuth - panel azimuth: 0=South, +90=West, -90=East (for north-facing phi hemisphere)
   * @param {number} lat     - site latitude (degrees N)
   * @param {number} month   - 1-12
   * @param {number} rho     - ground reflectance (default 0.20)
   * @returns {object} { H_poa, H_beam_h, H_diff_h, R_b }
   */
  function ghi_to_poa(GHI, Kt, tilt, azimuth, lat, month, rho) {
    rho = rho || 0.20;
    const beta = tilt * Math.PI / 180;
    const phi = lat  * Math.PI / 180;

    // Diffuse fraction
    const Kd  = erbsDiffuseFraction(Kt);
    const H_diff = GHI * Kd;
    const H_beam = GHI * (1 - Kd);

    // Solar declination for mid-month
    const dayOfYear = [17,47,75,105,135,162,198,228,258,288,318,344][month - 1];
    const delta = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);

    // Sunset hour angle on horizontal surface
    const cosomega_s = -Math.tan(phi) * Math.tan(delta);
    const omega_s = Math.acos(Math.max(-1, Math.min(1, cosomega_s)));

    // Sunset hour angle on tilted surface (due-south facing = azimuth 0)
    // For non-south facing, azimuth adjustment reduces R_b
    const az_rad = azimuth * Math.PI / 180;
    const phi_eff = phi - beta * Math.cos(az_rad);   // effective latitude approximation for azimuth adjustment
    const cosomega_s2 = -Math.tan(phi_eff) * Math.tan(delta);
    const omega_s2 = Math.acos(Math.max(-1, Math.min(1, cosomega_s2)));
    const omega_ss = Math.min(omega_s, omega_s2);

    // Beam tilt factor R_b (Klein 1977 / Hottel-Woertz monthly mean)
    const num = Math.cos(delta)*Math.cos(phi-beta)*Math.sin(omega_ss) + omega_ss*Math.sin(delta)*Math.sin(phi-beta);
    const den = Math.cos(delta)*Math.cos(phi)*Math.sin(omega_s)  + omega_s *Math.sin(delta)*Math.sin(phi);
    const R_b = den > 0.001 ? Math.max(0, num / den) : 1.0;

    // Isotropic sky model
    const H_poa = H_beam * R_b
                + H_diff * (1 + Math.cos(beta)) / 2
                + GHI    * rho * (1 - Math.cos(beta)) / 2;

    return { H_poa, H_beam_h: H_beam, H_diff_h: H_diff, R_b, Kd };
  }

  // =========================================================================
  // CORE PHYSICS â€” TEMPERATURE MODEL
  // =========================================================================

  /**
   * Energy-weighted average cell temperature for daily yield calculation.
   *
   * T_cell_avg = T_amb_avg + k Ã— G_eff_avg
   *
   * G_eff_avg = H_poa / daylight_h Ã— 1000   [W/mÂ², average over daylight hours]
   * k = (NOCT - 20) / 800   [Â°CÂ·mÂ²/W, Ross coefficient]
   *
   * Daylight hours: approximated from sunrise/sunset for latitude and month.
   * Equation: T_day = 2/Ï€ Ã— arccos(-tan(phi)Ã—tan(delta)) Ã— 24/Ï€  (radians version)
   *
   * Note: T_cell_avg is the irradiance-weighted cell temperature. At low irradiance
   * (morning/evening), T_cell is lower than at peak. This approximation assumes
   * irradiance-proportional weighting, which is captured by using G_eff_avg
   * rather than peak G. Error: Â±2â€“4Â°C vs detailed hourly model.
   */
  function avgCellTemp(T_amb_avg, NOCT, H_poa_kWh, lat, month) {
    const phi  = lat * Math.PI / 180;
    const dayOfYear = [17,47,75,105,135,162,198,228,258,288,318,344][month - 1];
    const delta  = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
    const cosomega = -Math.tan(phi) * Math.tan(delta);
    const omega_s = Math.acos(Math.max(-1, Math.min(1, cosomega)));
    const daylight_h = 2 * omega_s * 12 / Math.PI;   // hours

    const k = (NOCT - 20) / 800;   // Ross coefficient
    const G_avg_Wm2 = (H_poa_kWh * 1000) / Math.max(daylight_h, 1);

    return { T_cell: T_amb_avg + k * G_avg_Wm2, daylight_h, G_avg_Wm2, k };
  }

  // =========================================================================
  // CORE PHYSICS â€” PERFORMANCE RATIO
  // =========================================================================

  /**
   * Compute performance ratio components.
   *
   * All loss factors input as fractions (0â€“1).
   *
   * L_temp: temperature power loss fraction.
   *   L_temp = max(0, gamma Ã— (T_cell_avg - 25))
   *   gamma = -coeffPmax (positive value, e.g. 0.003 = 0.3%/Â°C)
   *   Note: this is only the ADDITIONAL loss above STC; at T_cell=25Â°C, L_temp=0.
   *
   * L_inv: inverter loss fraction = 1 - Î·_inv
   *
   * Returns individual losses and composite PR.
   */
  function computePR(T_cell_avg, coeffPmax_perDegC, eta_inv, L_cable, L_soiling, L_mismatch, L_other) {
    const gamma      = Math.abs(coeffPmax_perDegC);
    const L_temp = Math.max(0, gamma * (T_cell_avg - 25));
    const L_inv  = 1 - eta_inv;
    const PR     = (1 - L_temp) * (1 - L_inv) * (1 - L_cable) * (1 - L_soiling) * (1 - L_mismatch) * (1 - L_other);
    return {
      PR,
      L_temp,
      L_inv,
      L_cable,
      L_soiling,
      L_mismatch,
      L_other,
      losses_total: 1 - PR,
    };
  }

  // =========================================================================
  // CORE PHYSICS â€” ENERGY YIELD
  // =========================================================================

  /**
   * Daily energy yield.
   *
   * E_daily = P_dc_kWp Ã— H_poa Ã— PR
   *
   * This is the IEC 61724-1 definition.
   * H_poa in kWh/mÂ²/day, P_dc in kWp.
   *
   * @returns {number} kWh/day
   */
  function dailyEnergy(P_dc_kWp, H_poa, PR) {
    return P_dc_kWp * H_poa * PR;
  }

  /**
   * Full monthly simulation for all 12 months.
   *
   * @param {object} loc       - location from SL_LOCATIONS
   * @param {number} P_dc_kWp  - array DC capacity
   * @param {number} NOCT      - module NOCT (Â°C)
   * @param {number} coeffPmax - module Pmax temperature coefficient (decimal/Â°C, negative)
   * @param {number} tilt      - panel tilt from horizontal (Â°)
   * @param {number} azimuth   - panel azimuth (0=South)
   * @param {object} losses    - { eta_inv, L_cable, L_soiling, L_mismatch, L_other }
   * @param {number} rho       - ground reflectance (default 0.20)
   * @returns {Array} 12-element array of monthly results
   */
  function simulateMonthly(loc, P_dc_kWp, NOCT, coeffPmax, tilt, azimuth, losses, rho) {
    rho = rho || 0.20;
    const results = [];

    for (let m = 1; m <= 12; m++) {
      const i = m - 1;
      const GHI = loc.GHI[i];
      const Kt  = loc.Kt[i];
      const T_amb = loc.T_amb[i];

      // POA irradiance
      const poa = ghi_to_poa(GHI, Kt, tilt, azimuth, loc.lat, m, rho);

      // Cell temperature
      const tempResult = avgCellTemp(T_amb, NOCT, poa.H_poa, loc.lat, m);

      // PR â€” coeffPmax is stored as negative decimal (e.g. -0.0035); computePR handles sign internally
      const prResult = computePR(
        tempResult.T_cell,
        coeffPmax,
        losses.eta_inv,
        losses.L_cable,
        losses.L_soiling,
        losses.L_mismatch,
        losses.L_other || 0
      );

      // Daily & monthly energy
      const E_day  = dailyEnergy(P_dc_kWp, poa.H_poa, prResult.PR);
      const E_mon  = E_day * DAYS_IN_MONTH[i];
      // Specific yield (kWh/kWp/day)
      const SY_day = E_day / P_dc_kWp;

      results.push({
        month: m,
        monthName: MONTHS[i],
        days: DAYS_IN_MONTH[i],
        GHI,
        Kt,
        T_amb,
        H_poa: poa.H_poa,
        R_b: poa.R_b,
        Kd: poa.Kd,
        T_cell: tempResult.T_cell,
        daylight_h: tempResult.daylight_h,
        PR: prResult.PR,
        L_temp: prResult.L_temp,
        L_inv: prResult.L_inv,
        L_cable: prResult.L_cable,
        L_soiling: prResult.L_soiling,
        L_mismatch: prResult.L_mismatch,
        E_day,
        E_mon,
        SY_day,
      });
    }
    return results;
  }

  // =========================================================================
  // HOURLY SINUSOIDAL SIMULATION (Mode 2)
  // =========================================================================

  /**
   * Hourly energy simulation using sinusoidal irradiance profile.
   *
   * G(t) = G_peak Ã— sin(Ï€ Ã— (t - t_sunrise) / T_day)  [W/mÂ²]
   *
   * where G_peak is derived from daily H_poa:
   *   H_poa = âˆ«G(t)dt = G_peak Ã— T_day Ã— 2/Ï€   â†’ G_peak = H_poa Ã— 1000 Ã— Ï€/(2Ã—T_day)
   *
   * Temperature varies sinusoidally:
   *   T_amb(t) = T_avg + Î”T Ã— sin(Ï€Ã—(t - t_sunrise - T_day/2) / T_day)
   *   Î”T_day â‰ˆ 8â€“12Â°C diurnal range (default 10Â°C for Sri Lanka)
   *
   * Inverter cut-in: no output below 5% of rated irradiance.
   *
   * @param {object}  month_data   - one row from simulateMonthly() result
   * @param {number}  P_dc_kWp     - DC capacity
   * @param {number}  NOCT         - module NOCT
   * @param {number}  coeffPmax    - decimal/Â°C (negative)
   * @param {object}  losses       - { eta_inv, L_cable, L_soiling, L_mismatch }
   * @param {number}  diurnal_dT   - temperature diurnal range (Â°C), default 10
   * @returns {Array} 24-element hourly result [{hour, G_Wm2, T_cell, P_kW, E_kWh}]
   */
  function simulateHourly(month_data, P_dc_kWp, NOCT, coeffPmax, losses, diurnal_dT) {
    diurnal_dT = diurnal_dT || 10;
    const T_day = month_data.daylight_h;
    const t_sr  = 12 - T_day / 2;   // sunrise hour (solar time, ~local time for SL)
    const H_poa = month_data.H_poa;

    // G_peak from energy balance
    const G_peak = (H_poa * 1000 * Math.PI) / (2 * T_day);
    const k = (NOCT - 20) / 800;
    const gamma = Math.abs(coeffPmax);
    const G_cutin = G_peak * 0.05;  // 5% cut-in threshold

    const hourly = [];
    for (let h = 0; h < 24; h++) {
      const t_solar = h + 0.5;  // mid-point of hour
      const t_from_sr = t_solar - t_sr;

      let G = 0;
      if (t_from_sr > 0 && t_from_sr < T_day) {
        G = G_peak * Math.sin(Math.PI * t_from_sr / T_day);
      }
      G = Math.max(0, G);

      // Below cut-in: no inverter output
      const active = G >= G_cutin;

      // Hourly ambient temperature (sinusoidal diurnal model)
      // Peak temperature at ~14:00 solar, min at sunrise
      const t_peak_T = t_sr + T_day * 0.6;  // peak temp ~60% of daylight after sunrise
      const T_phase  = ((t_solar - t_peak_T) / 12) * Math.PI;
      const T_amb_h  = month_data.T_amb + diurnal_dT * 0.5 * Math.sin(T_phase);

      // Cell temperature
      const T_cell_h = T_amb_h + k * G;

      // Temperature loss
      const L_temp_h = Math.max(0, gamma * (T_cell_h - 25));

      // Effective PR this hour
      const PR_h = active
        ? (1 - L_temp_h) * losses.eta_inv * (1 - losses.L_cable) * (1 - losses.L_soiling) * (1 - losses.L_mismatch)
        : 0;

      // Power and energy
      const P_kW  = P_dc_kWp * (G / 1000) * PR_h;
      const E_kWh = P_kW * 1.0;  // 1-hour step

      hourly.push({ hour: h, G_Wm2: G, T_amb: T_amb_h, T_cell: T_cell_h, PR: PR_h, P_kW, E_kWh, active });
    }
    return hourly;
  }

  // =========================================================================
  // DC/AC RATIO CHECK
  // =========================================================================

  /**
   * Check DC/AC (inverter loading) ratio.
   * Acceptable range: 1.0â€“1.4 (Sri Lanka typical: 1.1â€“1.3)
   * Below 1.0: inverter oversized (economic waste, no energy risk)
   * Above 1.4: significant clipping loss, may exceed inverter AC rating
   *
   * Clipping loss estimate (simplified):
   * If P_dc_peak > P_ac_rated, clipping occurs when array operates above AC limit.
   * Estimated annual clipping loss â‰ˆ f(DC/AC ratio, H_annual, T_avg)
   * Reference: NREL "Inverter Loading Ratio and Clipping in PV Systems"
   */
  function checkDCACRatio(P_dc_kWp, P_ac_kW) {
    const ratio = P_dc_kWp / P_ac_kW;
    let status, cls, msg;

    // Rough clipping loss estimate: at SL peak irradiance conditions,
    // fraction of time P_dc > P_ac â‰ˆ proportional to ratio-1 Ã— clearness
    // This is a conservative empirical estimate, not a full simulation
    let clip_est = 0;
    if (ratio > 1.0) {
      // Very rough: clipping fraction â‰ˆ 0.5% per 0.1 ratio above 1.15
      clip_est = Math.max(0, (ratio - 1.15) * 5);
    }

    if (ratio < 0.90) {
      status = 'Inverter significantly oversized';
      cls = 'alert-warn';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Economic waste, inverter oversized. Reduce inverter rating or add panels.`;
    } else if (ratio < 1.0) {
      status = 'Borderline â€” slight oversizing';
      cls = 'alert-warn';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Near unity. Minimal clipping risk but inverter slightly large.`;
    } else if (ratio <= 1.15) {
      status = 'Optimal â€” no significant clipping';
      cls = 'alert-safe';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Good range. Negligible clipping in Sri Lanka conditions.`;
    } else if (ratio <= 1.30) {
      status = 'Acceptable â€” minor clipping';
      cls = 'alert-safe';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Standard oversizing. Estimated clipping loss ~${clip_est.toFixed(1)}%.`;
    } else if (ratio <= 1.45) {
      status = 'High oversizing â€” moderate clipping';
      cls = 'alert-warn';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Significant clipping at peak irradiance. Est. loss ~${clip_est.toFixed(1)}%. Verify with detailed simulation.`;
    } else {
      status = 'Excessive oversizing â€” high clipping loss';
      cls = 'alert-unsafe';
      msg = `DC/AC = ${ratio.toFixed(2)} â€” Very high. Likely exceeds inverter thermal rating. Estimated clipping ~${clip_est.toFixed(1)}%.`;
    }

    return { ratio, clip_est, status, cls, msg };
  }

  // =========================================================================
  // OPTIMAL TILT FINDER
  // =========================================================================

  /**
   * Find tilt angle that maximises annual H_poa for given location and azimuth.
   * Brute-force search from 0â€“45Â° in 1Â° steps.
   */
  function findOptimalTilt(loc, azimuth) {
    let best = { tilt: 0, H_annual: 0 };
    for (let tilt = 0; tilt <= 45; tilt++) {
      let H_ann = 0;
      for (let m = 1; m <= 12; m++) {
        const i = m - 1;
        const poa = ghi_to_poa(loc.GHI[i], loc.Kt[i], tilt, azimuth, loc.lat, m, 0.20);
        H_ann += poa.H_poa * DAYS_IN_MONTH[i];
      }
      if (H_ann > best.H_annual) best = { tilt, H_annual: H_ann };
    }
    return best;
  }

  // =========================================================================
  // UI RENDERER
  // =========================================================================

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${_esc(p.Pmax)}W)</option>`
    ).join('');

    const locationOptions = SL_LOCATIONS.map(l =>
      `<option value="${_esc(l.id)}">${_esc(l.name)}</option>`
    ).join('');

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#9728; Yield Estimator</div>

        <div class="info-box">
          Monthly energy yield model. Accuracy: Â±8â€“15% vs measured. Suitable for pre-design estimation.
          NOT suitable for bankable energy reports or financial P90 analysis.
        </div>

        <!-- SYSTEM INPUTS -->
        <div class="card">
          <div class="card-title">System Configuration</div>

          <div class="form-group">
            <label class="form-label">Module (from Panel DB)</label>
            <select class="form-select" id="ye-panel">
              <option value="">-- Select module (or enter specs manually below) --</option>
              ${panelOptions}
            </select>
          </div>

          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Array DC Capacity (kWp)</label>
              <input class="form-input" id="ye-pkwp" type="number" step="0.1" placeholder="e.g. 10.0" />
            </div>
            <div class="form-group">
              <label class="form-label">Inverter AC Rating (kW)</label>
              <input class="form-input" id="ye-pac" type="number" step="0.1" placeholder="e.g. 8.0" />
            </div>
            <div class="form-group">
              <label class="form-label">NOCT (Â°C)</label>
              <input class="form-input" id="ye-noct" type="number" value="45" />
              <div class="form-hint">Panel datasheet, typically 42â€“47Â°C</div>
            </div>
            <div class="form-group">
              <label class="form-label">Pmax Temp Coeff (%/Â°C)</label>
              <input class="form-input" id="ye-coeff" type="number" step="0.01" value="-0.35" />
              <div class="form-hint">Negative. e.g. -0.35 for TOPCon, -0.38 for PERC</div>
            </div>
          </div>
        </div>

        <!-- LOCATION & TILT -->
        <div class="card">
          <div class="card-title">Location &amp; Array Geometry</div>

          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Location</label>
              <select class="form-select" id="ye-loc">
                ${locationOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Tilt Angle (Â°)</label>
              <input class="form-input" id="ye-tilt" type="number" value="10" min="0" max="90" />
              <div class="form-hint">0 = horizontal, 90 = vertical. SL optimal: ~7â€“12Â°</div>
            </div>
            <div class="form-group">
              <label class="form-label">Azimuth (Â°)</label>
              <input class="form-input" id="ye-azimuth" type="number" value="0" min="-180" max="180" />
              <div class="form-hint">0 = South (correct for Sri Lanka). +90=West, -90=East</div>
            </div>
            <div class="form-group">
              <label class="form-label">Ground Reflectance</label>
              <select class="form-select" id="ye-rho">
                <option value="0.10">Gravel / dark tile (0.10)</option>
                <option value="0.20" selected>Grass / concrete (0.20)</option>
                <option value="0.30">Light concrete / sand (0.30)</option>
                <option value="0.40">Limestone / white surface (0.40)</option>
              </select>
            </div>
          </div>

          <!-- PVGIS live fetch -->
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <div style="font-size:0.82rem;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">&#127758; PVGIS Live Data (optional — overrides bundled GHI)</div>
            <div class="form-row cols-2">
              <div class="form-group">
                <label class="form-label">Latitude (°N)</label>
                <input class="form-input" id="ye-lat" type="number" step="0.0001" placeholder="e.g. 7.2" />
              </div>
              <div class="form-group">
                <label class="form-label">Longitude (°E)</label>
                <input class="form-input" id="ye-lon" type="number" step="0.0001" placeholder="e.g. 79.9" />
              </div>
            </div>
            <div class="btn-group" style="gap:8px">
              <button class="btn btn-secondary btn-sm" id="ye-gps-btn">&#127991; Use GPS</button>
              <button class="btn btn-secondary btn-sm" id="ye-pvgis-btn">&#9729; Fetch PVGIS Data</button>
            </div>
            <div id="ye-pvgis-status" style="margin-top:6px;font-size:0.8rem"></div>
          </div>

          <button class="btn btn-secondary btn-sm" style="margin-top:8px" id="ye-opt-tilt-btn">Find Optimal Tilt for Location</button>
          <div id="ye-opt-tilt-result" style="margin-top:6px"></div>
        </div>

        <!-- LOSS PARAMETERS -->
        <div class="card">
          <div class="card-title">Loss Parameters</div>
          <div class="info-box" style="margin-bottom:10px">
            PR = (1&minus;L_temp) &times; &eta;_inv &times; (1&minus;L_cable) &times; (1&minus;L_soiling) &times; (1&minus;L_mismatch) &times; (1&minus;L_other)<br>
            L_temp is computed automatically from NOCT and site temperature. Adjust others here.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Inverter Efficiency &eta;_inv (%)</label>
              <input class="form-input" id="ye-einv" type="number" step="0.1" value="96.5" min="90" max="99.5" />
              <div class="form-hint">TOPCon string inverter: 97â€“98.5%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Cable / Wiring Loss (%)</label>
              <input class="form-input" id="ye-lcable" type="number" step="0.1" value="1.5" min="0" max="5" />
              <div class="form-hint">Typical design target: 1.0â€“2.0%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Soiling Loss (%)</label>
              <input class="form-input" id="ye-lsoil" type="number" step="0.1" value="2.0" min="0" max="10" />
              <div class="form-hint">SL tropical: 2â€“4%. High dust/bird: 4â€“6%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Mismatch Loss (%)</label>
              <input class="form-input" id="ye-lmis" type="number" step="0.1" value="1.5" min="0" max="5" />
              <div class="form-hint">Standard: 1â€“2%. High mismatch string: 2â€“4%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Other Losses (%)</label>
              <input class="form-input" id="ye-lother" type="number" step="0.1" value="0.5" min="0" max="5" />
              <div class="form-hint">Degradation yr1 LID, arc, availability etc.</div>
            </div>
          </div>
        </div>

        <!-- CALCULATE -->
        <div class="card">
          <div class="btn-group">
            <button class="btn btn-primary btn-block" id="ye-calc-btn">&#9728; Run Yield Simulation</button>
          </div>
        </div>

        <!-- RESULTS -->
        <div id="ye-results" class="hidden"></div>

        <!-- HOURLY PROFILE -->
        <div id="ye-hourly" class="hidden"></div>

        <!-- ASSUMPTIONS -->
        <div class="card" style="margin-top:12px">
          <div class="card-title">&#128218; Model Assumptions &amp; Limitations</div>
          <div style="font-size:0.80rem;color:var(--text-secondary);line-height:1.7">
            <strong>Irradiance model:</strong> Liu-Jordan isotropic sky (GHI decomposed by Erbs correlation).
            R_b computed by Klein 1977 monthly mean formula. POA = beamÃ—R_b + diffuseÃ—(1+cosbeta)/2 + reflectedÃ—ÏÃ—(1-cosbeta)/2.<br>
            <strong>Cell temperature:</strong> NOCT formula (IEC 61215), energy-weighted daily mean.<br>
            <strong>Temperature loss:</strong> Linear gamma(T_cell âˆ’ 25), only above 25Â°C.<br>
            <strong>GHI data:</strong> NASA POWER monthly means, ~2005â€“2020 average. Not TMY.<br>
            <strong>Model suitable for:</strong> Pre-design orientation/tilt comparison, system sizing feasibility, approximate kWh/year estimate.<br>
            <strong>NOT suitable for:</strong> Bankable energy reports, P50/P90 analysis, inter-row shading, bifacial yield, roof with complex geometry.<br>
            <strong>Expected accuracy:</strong> Â±8â€“15% vs measured annual yield. Monthly error can be Â±15â€“25%.
          </div>
        </div>
      </div>
    `;

    // Wire up events
    container.querySelector('#ye-panel').addEventListener('change', () => _fillFromPanel(container));
    container.querySelector('#ye-opt-tilt-btn').addEventListener('click', () => _findOptimalTilt(container));
    container.querySelector('#ye-calc-btn').addEventListener('click', () => _runSimulation(container));
    container.querySelector('#ye-gps-btn').addEventListener('click', () => _useGPS(container));
    container.querySelector('#ye-pvgis-btn').addEventListener('click', () => _fetchPVGIS(container));

    // Pre-fill lat/lon from project if available
    const proj = (typeof App !== 'undefined') ? App.getProject() : null;
    if (proj && proj.lat) container.querySelector('#ye-lat').value = proj.lat;
    if (proj && proj.lon) container.querySelector('#ye-lon').value = proj.lon;

    // Pre-select location matching project if possible
    if (proj && proj.siteAddress) {
      const lower = proj.siteAddress.toLowerCase();
      const match = SL_LOCATIONS.find(l => lower.includes(l.id.replace('_', ' ')) || lower.includes(l.climateProfile));
      if (match) container.querySelector('#ye-loc').value = match.id;
    }
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================

  function _fillFromPanel(container) {
    const id = container.querySelector('#ye-panel').value;
    if (!id) return;
    const p = DB.getById(id);
    if (!p) return;
    container.querySelector('#ye-noct').value  = p.NOCT;
    container.querySelector('#ye-coeff').value = (p.coeffPmax * 100).toFixed(3);
    App.toast(`Loaded ${p.manufacturer} ${p.model}`, 'success');
  }

  function _findOptimalTilt(container) {
    const locId   = container.querySelector('#ye-loc').value;
    const azimuth = parseFloat(container.querySelector('#ye-azimuth').value) || 0;
    const loc     = SL_LOCATIONS.find(l => l.id === locId);
    if (!loc) return;

    const best = findOptimalTilt(loc, azimuth);
    const div  = container.querySelector('#ye-opt-tilt-result');
    div.innerHTML = `
      <div class="info-box">
        Optimal tilt for <strong>${_esc(loc.name)}</strong> (azimuth ${_esc(azimuth)}Â°):
        <strong>${_esc(best.tilt)}Â°</strong> â€” Annual POA = ${_esc(best.H_annual.toFixed(0))} kWh/mÂ²/yr.
        <button class="btn btn-secondary btn-sm" style="margin-left:8px" id="ye-apply-tilt">Apply</button>
      </div>`;
    div.querySelector('#ye-apply-tilt').addEventListener('click', () => {
      container.querySelector('#ye-tilt').value = best.tilt;
      App.toast(`Tilt set to ${best.tilt}Â°`, 'success');
    });
  }

  function _runSimulation(container) {
    const locId     = container.querySelector('#ye-loc').value;
    const P_dc      = parseFloat(container.querySelector('#ye-pkwp').value);
    const P_ac      = parseFloat(container.querySelector('#ye-pac').value);
    const NOCT      = parseFloat(container.querySelector('#ye-noct').value);
    const coeffRaw  = parseFloat(container.querySelector('#ye-coeff').value);
    const tilt      = parseFloat(container.querySelector('#ye-tilt').value);
    const azimuth   = parseFloat(container.querySelector('#ye-azimuth').value) || 0;
    const rho       = parseFloat(container.querySelector('#ye-rho').value);
    const eta_inv   = parseFloat(container.querySelector('#ye-einv').value) / 100;
    const L_cable   = parseFloat(container.querySelector('#ye-lcable').value) / 100;
    const L_soiling = parseFloat(container.querySelector('#ye-lsoil').value) / 100;
    const L_mismatch= parseFloat(container.querySelector('#ye-lmis').value) / 100;
    const L_other   = parseFloat(container.querySelector('#ye-lother').value) / 100;

    if ([P_dc, P_ac, NOCT, coeffRaw, tilt].some(isNaN)) {
      App.toast('Fill all system inputs', 'error'); return;
    }

    // Use PVGIS live data if fetched, otherwise fall back to bundled static data
    const loc = container._pvgisLoc || SL_LOCATIONS.find(l => l.id === locId);
    if (!loc) { App.toast('Select location', 'error'); return; }
    if (container._pvgisLoc) App.toast('Using PVGIS live data for simulation', 'info');

    // coeffPmax stored as %/Â°C in input (e.g. -0.35), convert to decimal/Â°C
    const coeffPmax = coeffRaw / 100;

    const losses = { eta_inv, L_cable, L_soiling, L_mismatch, L_other };
    const monthly = simulateMonthly(loc, P_dc, NOCT, coeffPmax, tilt, azimuth, losses, rho);
    const dcac    = checkDCACRatio(P_dc, P_ac);

    const summary = {
      E_annual: monthly.reduce((s, m) => s + m.E_mon, 0),
      H_poa_annual: monthly.reduce((s, m) => s + m.H_poa * m.days, 0),
      PR_avg: monthly.reduce((s, m) => s + m.PR * m.days, 0) / 365,
      SY_annual: monthly.reduce((s, m) => s + m.E_mon, 0) / P_dc,
      T_cell_avg: monthly.reduce((s, m) => s + m.T_cell * m.days, 0) / 365,
      L_temp_avg: monthly.reduce((s, m) => s + m.L_temp * m.days, 0) / 365,
    };

    App.state.yieldResults = {
      date: _localDateISO(),
      location: { id: loc.id, name: loc.name, lat: loc.lat, lon: loc.lon },
      system: { P_dc, P_ac, NOCT, coeffPmax, tilt, azimuth, rho },
      losses,
      monthly,
      dcac,
      summary,
    };

    _renderResults(container, monthly, dcac, loc, P_dc, P_ac, NOCT, coeffPmax, losses, tilt, azimuth);
  }

  // =========================================================================
  // RESULTS RENDERER
  // =========================================================================

  function _renderResults(container, monthly, dcac, loc, P_dc, P_ac, NOCT, coeffPmax, losses, tilt, azimuth) {
    const E_annual     = monthly.reduce((s, m) => s + m.E_mon, 0);
    const H_poa_annual = monthly.reduce((s, m) => s + m.H_poa * m.days, 0);
    const PR_avg       = monthly.reduce((s, m) => s + m.PR * m.days, 0) / 365;
    const SY_annual    = E_annual / P_dc;   // specific yield kWh/kWp/yr

    // Annual averages for display
    const T_cell_avg   = monthly.reduce((s, m) => s + m.T_cell * m.days, 0) / 365;
    const L_temp_avg   = monthly.reduce((s, m) => s + m.L_temp * m.days, 0) / 365;

    // Summary boxes
    const pr_cls = PR_avg >= 0.78 ? 'alert-safe' : PR_avg >= 0.70 ? 'alert-warn' : 'alert-unsafe';

    const resultsDiv = container.querySelector('#ye-results');
    resultsDiv.classList.remove('hidden');

    resultsDiv.innerHTML = `
      <!-- DC/AC RATIO -->
      <div class="card">
        <div class="card-title">DC/AC Ratio Check</div>
        <div class="result-box ${dcac.cls}" style="margin-bottom:8px">
          <div class="result-value">DC/AC = ${dcac.ratio.toFixed(2)}</div>
          <div class="result-label">${dcac.status}</div>
        </div>
        <div class="info-box" style="font-size:0.82rem">${dcac.msg}</div>
      </div>

      <!-- ANNUAL SUMMARY -->
      <div class="card">
        <div class="card-title">&#128200; Annual Summary â€” ${_esc(loc.name)}</div>
        <div class="result-grid">
          ${_rbox(E_annual.toFixed(0) + ' kWh', 'Annual Energy')}
          ${_rbox(SY_annual.toFixed(0) + ' kWh/kWp', 'Specific Yield')}
          ${_rbox((PR_avg * 100).toFixed(1) + '%', 'Average PR', pr_cls)}
          ${_rbox(H_poa_annual.toFixed(0) + ' kWh/mÂ²', 'Annual POA Irrad.')}
          ${_rbox(T_cell_avg.toFixed(1) + ' Â°C', 'Avg Cell Temp')}
          ${_rbox((L_temp_avg * 100).toFixed(1) + '%', 'Avg Temp Loss')}
        </div>
        <div class="info-box" style="margin-top:8px;font-size:0.80rem">
          System: ${_esc(P_dc)} kWp DC / ${_esc(P_ac)} kW AC &bull; Tilt ${_esc(tilt)}Â° / Azimuth ${_esc(azimuth)}Â° &bull; NOCT ${_esc(NOCT)}Â°C
        </div>
        <div class="btn-group" style="margin-top:10px;flex-wrap:wrap;gap:6px">
          <button class="btn btn-secondary btn-sm" id="ye-print-btn">&#128424; Print</button>
          <button class="btn btn-secondary btn-sm" id="ye-csv-btn">&#128190; Export CSV</button>
          <button class="btn btn-success btn-sm" id="ye-pdf-btn">&#128196; Export PDF</button>
          <button class="btn btn-primary btn-sm" id="ye-to-financials-btn">&#128176; Financial Analysis &#8250;</button>
        </div>
        <div id="ye-financials-hint" style="margin-top:6px;font-size:0.8rem;color:var(--text-muted)">
          &#9989; ${E_annual.toFixed(0)} kWh/yr &bull; ${P_dc} kWp — ready to feed into Financial Analysis
        </div>
      </div>

      <!-- LOSS BREAKDOWN -->
      <div class="card">
        <div class="card-title">Loss Breakdown (Annual Averages)</div>
        ${_lossBreakdown(monthly, losses, L_temp_avg)}
      </div>

      <!-- MONTHLY TABLE -->
      <div class="card">
        <div class="card-title">Monthly Yield Breakdown</div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>GHI<br><small>kWh/mÂ²</small></th>
                <th>H_poa<br><small>kWh/mÂ²</small></th>
                <th>T_amb<br><small>Â°C</small></th>
                <th>T_cell<br><small>Â°C</small></th>
                <th>PR<br><small>%</small></th>
                <th>E/day<br><small>kWh</small></th>
                <th>E/month<br><small>kWh</small></th>
              </tr>
            </thead>
            <tbody>
              ${monthly.map(m => `
                <tr>
                  <td><strong>${m.monthName}</strong></td>
                  <td>${m.GHI.toFixed(2)}</td>
                  <td>${m.H_poa.toFixed(2)}</td>
                  <td>${m.T_amb.toFixed(1)}</td>
                  <td>${m.T_cell.toFixed(1)}</td>
                  <td>${(m.PR * 100).toFixed(1)}</td>
                  <td>${m.E_day.toFixed(2)}</td>
                  <td><strong>${m.E_mon.toFixed(0)}</strong></td>
                </tr>`).join('')}
              <tr style="font-weight:700;background:var(--bg-3)">
                <td>ANNUAL</td>
                <td>${monthly.reduce((s,m)=>s+m.GHI*m.days,0).toFixed(0)}</td>
                <td>${H_poa_annual.toFixed(0)}</td>
                <td>â€”</td>
                <td>${T_cell_avg.toFixed(1)}</td>
                <td>${(PR_avg*100).toFixed(1)}</td>
                <td>${(E_annual/365).toFixed(2)}</td>
                <td>${E_annual.toFixed(0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- BAR CHART -->
      <div class="card">
        <div class="card-title">Monthly Energy Chart (kWh)</div>
        ${_barChart(monthly)}
      </div>

      <!-- HOURLY SIMULATION SECTION -->
      <div class="card">
        <div class="card-title">&#9201; Hourly Profile Simulation</div>
        <div class="info-box" style="margin-bottom:8px">
          Sinusoidal irradiance model with hourly temperature variation.
          G(t) = G_peak Ã— sin(Ï€Ã—t/T_day). Select a month to view hourly profile.
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Month</label>
            <select class="form-select" id="ye-hr-month">
              ${MONTHS.map((mn,i)=>`<option value="${i}">${mn}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Diurnal Temp Range (Â°C)</label>
            <input class="form-input" id="ye-hr-dt" type="number" value="10" min="4" max="20" />
            <div class="form-hint">SL typical: 8â€“12Â°C</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="ye-hr-btn">Plot Hourly Profile</button>
        <div id="ye-hourly-chart" style="margin-top:10px"></div>
      </div>
    `;

    // Wire hourly simulation button
    container.querySelector('#ye-hr-btn').addEventListener('click', () => {
      const mIdx    = parseInt(container.querySelector('#ye-hr-month').value);
      const dT      = parseFloat(container.querySelector('#ye-hr-dt').value) || 10;
      const mData   = monthly[mIdx];
      const coeffPmax_pct = coeffPmax;  // already in decimal/Â°C
      const hourly  = simulateHourly(mData, P_dc, NOCT, coeffPmax_pct, losses, dT);
      _renderHourlyChart(container.querySelector('#ye-hourly-chart'), hourly, mData.monthName);
    });
    container.querySelector('#ye-to-financials-btn').addEventListener('click', () => {
      App.navigate('financials');
      App.toast('Yield data loaded into Financial Analysis', 'success');
    });

    container.querySelector('#ye-csv-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.downloadYieldCSV !== 'function') {
        App.toast('CSV export not available', 'error');
        return;
      }
      Reports.downloadYieldCSV(App.state.yieldResults);
    });

    container.querySelector('#ye-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ye-results', 'Yield Estimator Report', container);
        return;
      }
      window.print();
    });

    container.querySelector('#ye-pdf-btn').addEventListener('click', () => {
      if (typeof Reports === 'undefined' || typeof Reports.generateYield !== 'function') {
        App.toast('PDF export not available', 'error');
        return;
      }
      Reports.generateYield(App.state.yieldResults);
    });


    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================================
  // CHART HELPERS
  // =========================================================================

  function _barChart(monthly) {
    const maxE   = Math.max(...monthly.map(m => m.E_mon));
    const W=340, H=160, PL=46, PR=10, PT=14, PB=30;
    const cW=W-PL-PR, cH=H-PT-PB;
    const bw = cW / 12;
    const gap = 2;

    const bars = monthly.map((m, i) => {
      const h = (m.E_mon / maxE) * cH;
      const x = PL + i * bw + gap / 2;
      const y = PT + cH - h;
      const shade = m.E_mon / maxE;
      // Colour: high yield = orange (#d97706), low = muted
      const r = Math.round(217 * shade + 100 * (1 - shade));
      const g = Math.round(119 * shade + 100 * (1 - shade));
      const b = Math.round(6 * shade + 120 * (1 - shade));
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw-gap).toFixed(1)}" height="${h.toFixed(1)}" fill="rgb(${r},${g},${b})" rx="2"/>
        <text x="${(x+(bw-gap)/2).toFixed(1)}" y="${(PT+cH+12).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${m.monthName.slice(0,3)}</text>
        <text x="${(x+(bw-gap)/2).toFixed(1)}" y="${(y-2).toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--text-secondary)">${m.E_mon.toFixed(0)}</text>`;
    }).join('');

    const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(f => {
      const val = maxE * f;
      const y   = PT + cH - f * cH;
      return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${PL+cW}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
        <text x="${PL-3}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">${val.toFixed(0)}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:700px;display:block;margin:0 auto">
      ${yTicks}
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
      <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
      ${bars}
      <text x="${PL-32}" y="${PT+cH/2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" transform="rotate(-90,${PL-32},${PT+cH/2})">kWh/month</text>
    </svg>`;
  }

  function _renderHourlyChart(div, hourly, monthName) {
    const maxG = Math.max(...hourly.map(h => h.G_Wm2));
    const maxP = Math.max(...hourly.map(h => h.P_kW), 0.001);
    const W=340, H=180, PL=46, PR=46, PT=14, PB=30;
    const cW=W-PL-PR, cH=H-PT-PB;

    const gPath  = hourly.map((h, i) => {
      const x = PL + (i / 23) * cW;
      const y = PT + cH - (h.G_Wm2 / (maxG || 1)) * cH;
      return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const pPath  = hourly.map((h, i) => {
      const x = PL + (i / 23) * cW;
      const y = PT + cH - (h.P_kW / maxP) * cH;
      return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const xTicks = [0,6,12,18,23].map(h => {
      const x = PL + (h/23)*cW;
      return `<text x="${x.toFixed(1)}" y="${PT+cH+12}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${h}:00</text>`;
    }).join('');

    const E_total = hourly.reduce((s,h) => s + h.E_kWh, 0);

    div.innerHTML = `
      <div class="info-box" style="margin-bottom:6px;font-size:0.80rem">
        <strong>${_esc(monthName)}</strong> â€” Daily total: ${_esc(E_total.toFixed(2))} kWh &bull; Peak irradiance: ${_esc(maxG.toFixed(0))} W/mÂ² &bull; Peak power: ${_esc(maxP.toFixed(2))} kW
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:700px;display:block;margin:0 auto">
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <line x1="${PL+cW}" y1="${PT}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1"/>
        <path d="${gPath}" fill="none" stroke="#d97706" stroke-width="2" opacity="0.7"/>
        <path d="${pPath}" fill="none" stroke="#16a34a" stroke-width="2"/>
        ${xTicks}
        <text x="${PL-3}" y="${PT+4}" text-anchor="end" font-size="7" fill="#d97706">${maxG.toFixed(0)}</text>
        <text x="${PL-3}" y="${PT+cH}" text-anchor="end" font-size="7" fill="#d97706">0</text>
        <text x="${PL+cW+3}" y="${PT+4}" text-anchor="start" font-size="7" fill="#16a34a">${maxP.toFixed(1)}</text>
        <text x="${PL+cW+3}" y="${PT+cH}" text-anchor="start" font-size="7" fill="#16a34a">0</text>
        <line x1="60" y1="10" x2="74" y2="10" stroke="#d97706" stroke-width="2"/>
        <text x="77" y="13" font-size="7" fill="var(--text-secondary)">G_poa (W/mÂ²)</text>
        <line x1="140" y1="10" x2="154" y2="10" stroke="#16a34a" stroke-width="2"/>
        <text x="157" y="13" font-size="7" fill="var(--text-secondary)">AC Power (kW)</text>
      </svg>
      <div style="overflow-x:auto;margin-top:8px">
        <table class="status-table" style="font-size:0.76rem">
          <thead>
            <tr><th>Hour</th><th>G (W/mÂ²)</th><th>T_amb (Â°C)</th><th>T_cell (Â°C)</th><th>PR</th><th>P (kW)</th></tr>
          </thead>
          <tbody>
            ${hourly.filter(h => h.G_Wm2 > 1).map(h =>
              `<tr>
                <td>${h.hour}:00</td>
                <td>${h.G_Wm2.toFixed(0)}</td>
                <td>${h.T_amb.toFixed(1)}</td>
                <td>${h.T_cell.toFixed(1)}</td>
                <td>${(h.PR*100).toFixed(1)}%</td>
                <td>${h.P_kW.toFixed(3)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function _lossBreakdown(monthly, losses, L_temp_avg) {
    // Weighted average losses
    const totalDays = 365;
    const PR_avg  = monthly.reduce((s,m) => s + m.PR * m.days, 0) / totalDays;

    const items = [
      { label: 'Temperature Loss (L_temp)',   val: L_temp_avg * 100,           color: '#dc2626' },
      { label: 'Inverter Loss (1âˆ’Î·_inv)',      val: (1-losses.eta_inv) * 100,   color: '#d97706' },
      { label: 'Cable / Wiring Loss',          val: losses.L_cable * 100,       color: '#0284c7' },
      { label: 'Soiling Loss',                 val: losses.L_soiling * 100,     color: '#7c3aed' },
      { label: 'Mismatch Loss',                val: losses.L_mismatch * 100,    color: '#0891b2' },
      { label: 'Other Losses',                 val: (losses.L_other || 0) * 100, color: '#64748b' },
    ];
    const total = items.reduce((s,i) => s + i.val, 0);
    const maxVal = Math.max(...items.map(i => i.val), 0.1);

    return `
      <div class="result-box ${PR_avg >= 0.78 ? 'alert-safe' : 'alert-warn'}" style="margin-bottom:10px">
        <div class="result-value">Composite PR = ${(PR_avg*100).toFixed(1)}%</div>
        <div class="result-label">Total losses = ${total.toFixed(1)}% (note: multiplicative, not additive)</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${items.map(it => `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:0.76rem;min-width:160px;color:var(--text-secondary)">${it.label}</span>
            <div style="flex:1;background:var(--bg-3);border-radius:4px;height:16px;overflow:hidden">
              <div style="width:${(it.val/maxVal*100).toFixed(1)}%;height:16px;background:${it.color};border-radius:4px"></div>
            </div>
            <span style="font-size:0.76rem;min-width:42px;text-align:right;color:var(--text-secondary)">${it.val.toFixed(2)}%</span>
          </div>`).join('')}
      </div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">
        L_temp is dynamic (varies monthly with irradiance &amp; temperature). Values shown are annual weighted averages.
        Composite PR = Î·_inv Ã— (1âˆ’L_temp) Ã— (1âˆ’L_cable) Ã— (1âˆ’L_soiling) Ã— (1âˆ’L_mismatch) Ã— (1âˆ’L_other).
      </div>`;
  }

  function _rbox(value, label, cls) {
    return `<div class="result-box ${cls||''}"><div class="result-value">${_esc(value)}</div><div class="result-label">${_esc(label)}</div></div>`;
  }

  // =========================================================================
  // PVGIS API INTEGRATION
  // Source: https://re.jrc.ec.europa.eu/api/v5_2/ (EU JRC, free, CORS-enabled)
  // Endpoint: /seriescalc gives monthly radiation stats
  // No API key required. Rate-limited but adequate for single-user tool.
  // =========================================================================

  // Store PVGIS-fetched data per lat/lon key
  const _pvgisCache = {};

  function _useGPS(container) {
    if (!navigator.geolocation) {
      App.toast('GPS not available', 'error'); return;
    }
    const btn = container.querySelector('#ye-gps-btn');
    btn.disabled = true; btn.textContent = '⏳ Getting GPS…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        container.querySelector('#ye-lat').value = pos.coords.latitude.toFixed(5);
        container.querySelector('#ye-lon').value = pos.coords.longitude.toFixed(5);
        btn.disabled = false; btn.textContent = '📍 Use GPS';
        App.toast('Location set from GPS', 'success');
      },
      err => {
        btn.disabled = false; btn.textContent = '📍 Use GPS';
        App.toast('GPS error: ' + err.message, 'error');
      },
      { timeout: 10000 }
    );
  }

  /**
   * Fetch monthly irradiance from PVGIS v5.2 API.
   * API returns PVGIS-ERA5 or PVGIS-SARAH2 dataset (auto-selected by region).
   * For Sri Lanka, PVGIS-ERA5 is used.
   *
   * Endpoint: GET https://re.jrc.ec.europa.eu/api/v5_2/MRcalc
   *   ?lat=LAT&lon=LON&startyear=2005&endyear=2020&outputformat=json&horirrad=1&mr_dni=1
   *
   * Response: outputs.monthly.fixed[m].H(h)_m = monthly mean daily irradiation (Wh/m²)
   *
   * We extract: H_h (horizontal global) = GHI, T2m = ambient temperature
   * Then recompute Kt from extraterrestrial H0.
   */
  async function _fetchPVGIS(container) {
    const lat = parseFloat(container.querySelector('#ye-lat').value);
    const lon = parseFloat(container.querySelector('#ye-lon').value);
    const statusEl = container.querySelector('#ye-pvgis-status');

    if (isNaN(lat) || isNaN(lon)) {
      statusEl.innerHTML = '<span style="color:var(--danger)">Enter latitude and longitude first, or use GPS.</span>';
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      statusEl.innerHTML = '<span style="color:var(--danger)">Invalid coordinates.</span>';
      return;
    }

    const cacheKey = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (_pvgisCache[cacheKey]) {
      _applyPVGISToSim(container, _pvgisCache[cacheKey], lat, lon);
      return;
    }

    const btn = container.querySelector('#ye-pvgis-btn');
    btn.disabled = true;
    statusEl.innerHTML = '<span style="color:var(--info)">⏳ Fetching PVGIS data…</span>';

    // PVGIS v5.2 MRcalc — monthly radiation statistics
    // horirrad=1: horizontal irradiance, mr_dni=1: DNI
    // T2m included by default in meteo output
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/MRcalc?lat=${lat}&lon=${lon}&startyear=2005&endyear=2020&outputformat=json&horirrad=1&mr_dni=1&browser=0`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();

      // Parse PVGIS monthly output
      // json.outputs.monthly: array of {month, H_h, H_d, H_i_opt, T2m, ...}
      // H_h = global horiz irrad (Wh/m²/day monthly mean)
      // T2m = 2m air temp (°C monthly mean)
      const monthly = json.outputs && json.outputs.monthly;
      if (!monthly || monthly.length < 12) throw new Error('Unexpected PVGIS response format');

      const GHI_pvgis  = [];
      const T_pvgis    = [];
      const Kt_pvgis   = [];

      // Extraterrestrial horizontal irradiance H0 for Kt calculation
      // H0 = (24/π) × I_sc × (1 + 0.033cos(360n/365)) × (cosφcosδsinωs + ωs sinφsinδ)
      // Simplified: use fixed monthly H0 for Sri Lanka latitude range
      // Source: Duffie & Beckman Table 1.10.1 (interpolated for phi=7°N)
      const H0_SL_kWh = [9.6,10.3,11.0,10.9,10.4,10.0,10.1,10.4,10.6,10.3,9.8,9.5]; // kWh/m²/day

      monthly.forEach((row, i) => {
        const H_h_kWh = row['H(h)_m'] / 1000; // Wh → kWh
        const T2m = row['T2m'];
        const Kt  = Math.min(0.85, H_h_kWh / (H0_SL_kWh[i] || 10.0));
        GHI_pvgis.push(parseFloat(H_h_kWh.toFixed(2)));
        T_pvgis.push(parseFloat((T2m || 28).toFixed(1)));
        Kt_pvgis.push(parseFloat(Kt.toFixed(3)));
      });

      const pvgisData = { lat, lon, GHI: GHI_pvgis, T_amb: T_pvgis, Kt: Kt_pvgis, source: 'PVGIS-ERA5 (2005-2020)' };
      _pvgisCache[cacheKey] = pvgisData;
      _applyPVGISToSim(container, pvgisData, lat, lon);

    } catch (err) {
      btn.disabled = false;
      const msg = err.name === 'TimeoutError' ? 'Request timed out. Check internet connection.' : err.message;
      statusEl.innerHTML = `<span style="color:var(--danger)">⚠ PVGIS fetch failed: ${_esc(msg)}. Bundled data will be used.</span>`;
    }
  }

  function _applyPVGISToSim(container, data, lat, lon) {
    const btn = container.querySelector('#ye-pvgis-btn');
    btn.disabled = false;

    // Inject PVGIS data as a synthetic location object, stored on container for _runSimulation to use
    container._pvgisLoc = {
      id: 'pvgis_live',
      name: `PVGIS Live (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`,
      lat, lon,
      GHI: data.GHI,
      T_amb: data.T_amb,
      Kt: data.Kt,
      climateProfile: 'pvgis',
    };

    const annualGHI = data.GHI.reduce((s, v, i) => s + v * DAYS_IN_MONTH[i], 0).toFixed(0);
    const statusEl = container.querySelector('#ye-pvgis-status');
    statusEl.innerHTML = `
      <div class="info-box" style="margin-top:4px">
        ✅ <strong>PVGIS data loaded</strong> — Annual GHI: <strong>${annualGHI} kWh/m²/yr</strong>
        &bull; Source: ${_esc(data.source)}
        &bull; Monthly GHI: ${data.GHI.map(v => v.toFixed(1)).join(', ')} kWh/m²/day
        <br><span style="font-size:0.75rem;color:var(--text-muted)">PVGIS data will override bundled values when you click Run Simulation.</span>
      </div>`;
    App.toast('PVGIS data loaded — ' + annualGHI + ' kWh/m²/yr', 'success');
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    render,
    // expose physics for testing / external use
    ghi_to_poa,
    avgCellTemp,
    computePR,
    dailyEnergy,
    simulateMonthly,
    simulateHourly,
    checkDCACRatio,
    findOptimalTilt,
    SL_LOCATIONS,
  };

})();


