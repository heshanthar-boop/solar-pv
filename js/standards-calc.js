/**
 * standards-calc.js - Pure calculator helpers used by standards workflows.
 * No DOM dependencies. Intended for reuse and unit testing.
 */

const StandardsCalc = (() => {
  const STANDARD_CSA_MM2 = [
    1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
    380, 400, 480, 500, 600, 630, 740, 800, 960, 1000, 1200
  ];

  function _nextStdCSA(required_mm2, csaList) {
    const list = Array.isArray(csaList) && csaList.length ? csaList : STANDARD_CSA_MM2;
    if (!Number.isFinite(required_mm2) || required_mm2 <= 0) return null;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] >= required_mm2) return list[i];
    }
    return list[list.length - 1];
  }

  const INSTALL_ALIASES = {
    conduit_wall: 'closed_tube',
    air_tray: 'open_air',
    buried_ground: 'buried_direct',
    rooftop_sun: 'rooftop_open',
    closed_tube: 'closed_tube',
    open_air: 'open_air',
    clipped_direct: 'clipped_direct',
    buried_direct: 'buried_direct',
    buried_duct: 'buried_duct',
    rooftop_open: 'rooftop_open',
  };

  const TEMP_FACTORS = {
    air: {
      pvc: [
        [25, 1.03], [30, 1.00], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.50]
      ],
      xlpe: [
        [25, 1.02], [30, 1.00], [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [55, 0.76], [60, 0.71],
        [65, 0.65], [70, 0.58], [75, 0.50], [80, 0.41]
      ],
    },
    ground: {
      pvc: [
        [10, 1.10], [15, 1.05], [20, 1.00], [25, 0.95], [30, 0.89], [35, 0.84], [40, 0.77], [45, 0.71],
        [50, 0.63], [55, 0.55], [60, 0.45]
      ],
      xlpe: [
        [10, 1.07], [15, 1.04], [20, 1.00], [25, 0.96], [30, 0.93], [35, 0.89], [40, 0.85], [45, 0.80],
        [50, 0.76], [55, 0.71], [60, 0.65], [65, 0.60]
      ],
    }
  };

  const GROUP_FACTORS_Z03 = {
    bunched:       { 1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 10: 0.45, 11: 0.41, 12: 0.38 },
    wall_single:   { 1: 1.00, 2: 0.85, 3: 0.79, 4: 0.75, 5: 0.73, 6: 0.72, 7: 0.72, 8: 0.71, 9: 0.70, 10: 0.70, 11: 0.70, 12: 0.70 },
    tray_single:   { 1: 1.00, 2: 0.88, 3: 0.82, 4: 0.77, 5: 0.75, 6: 0.73, 7: 0.73, 8: 0.72, 9: 0.72, 10: 0.72, 11: 0.72, 12: 0.72 },
  };

  const GROUP_FACTORS_Z04 = {
    touching: { 2: 0.75, 3: 0.65, 4: 0.60, 5: 0.55, 6: 0.50 },
    one_d:    { 2: 0.80, 3: 0.70, 4: 0.60, 5: 0.55, 6: 0.55 },
    '0.125m': { 2: 0.85, 3: 0.75, 4: 0.70, 5: 0.65, 6: 0.60 },
    '0.25m':  { 2: 0.90, 3: 0.80, 4: 0.75, 5: 0.70, 6: 0.70 },
    '0.5m':   { 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.80, 6: 0.80 },
  };

  const GROUP_FACTORS_Z05 = {
    touching: { 2: 0.85, 3: 0.75, 4: 0.70, 5: 0.65, 6: 0.60 },
    '0.25m':  { 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.80, 6: 0.80 },
    '0.5m':   { 2: 0.95, 3: 0.90, 4: 0.85, 5: 0.85, 6: 0.80 },
    '1.0m':   { 2: 0.95, 3: 0.95, 4: 0.90, 5: 0.90, 6: 0.90 },
  };

  function _normalizeInstallMethod(input) {
    return INSTALL_ALIASES[input] || 'closed_tube';
  }

  function _tempFactorTable(insulation, tempC, basis) {
    const ins = insulation === 'pvc' ? 'pvc' : 'xlpe';
    const mode = basis === 'ground' ? 'ground' : 'air';
    const table = TEMP_FACTORS[mode][ins] || TEMP_FACTORS.air.xlpe;
    if (!Number.isFinite(tempC)) return 1.0;
    if (tempC <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i += 1) {
      if (tempC <= table[i][0]) return table[i][1];
    }
    return table[table.length - 1][1];
  }

  function _lookupFactorMap(map, circuits) {
    const n = Number.isFinite(circuits) ? Math.max(1, Math.round(circuits)) : 1;
    const keys = Object.keys(map).map((k) => Number(k)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!keys.length) return 1.0;
    if (n <= keys[0]) return map[keys[0]];
    const cap = Math.min(n, keys[keys.length - 1]);
    return map[cap] || map[String(cap)] || map[keys[keys.length - 1]];
  }

  function _groupFactorGeneral(installMethod, groupedCircuits) {
    const key = (installMethod === 'open_air' || installMethod === 'rooftop_open')
      ? 'tray_single'
      : (installMethod === 'clipped_direct' ? 'wall_single' : 'bunched');
    return _lookupFactorMap(GROUP_FACTORS_Z03[key], groupedCircuits);
  }

  function _groupFactorBuried(groupedCircuits, spacingKey, inDuct) {
    const n = Number.isFinite(groupedCircuits) ? Math.max(1, Math.round(groupedCircuits)) : 1;
    if (n <= 1) return 1.0;
    const key = spacingKey || 'touching';
    const table = inDuct ? GROUP_FACTORS_Z05 : GROUP_FACTORS_Z04;
    const map = table[key] || table.touching;
    return _lookupFactorMap(map, n);
  }

  const MULTICORE_PVC_ROWS = [
    [1,   11, 10, 13, 11.5, 15, 13.5, 17, 14.5, 44, 44, 38],
    [1.5, 14, 13, 16.5, 15, 19.5, 17.5, 22, 18.5, 29, 29, 25],
    [2.5, 18.5, 17.5, 23, 20, 27, 24, 30, 25, 18, 18, 15],
    [4,   25, 23, 30, 27, 36, 32, 40, 34, 11, 11, 9.5],
    [6,   32, 29, 38, 34, 46, 41, 51, 43, 7.3, 7.3, 6.4],
    [10,  43, 39, 52, 46, 63, 57, 70, 60, 4.4, 4.4, 3.8],
    [16,  57, 52, 69, 62, 85, 76, 94, 80, 2.8, 2.8, 2.4],
    [25,  75, 68, 90, 80, 112, 96, 119, 101, 1.75, 1.75, 1.5],
    [35,  92, 83, 111, 99, 138, 119, 148, 126, 1.25, 1.25, 1.1],
    [50,  110, 99, 133, 118, 168, 144, 180, 153, 0.93, 0.94, 0.81],
    [70,  139, 125, 168, 149, 213, 184, 232, 196, 0.63, 0.65, 0.57],
    [95,  167, 150, 201, 179, 258, 223, 282, 238, 0.46, 0.50, 0.43],
    [120, 192, 172, 232, 206, 299, 259, 328, 276, 0.36, 0.41, 0.35],
    [150, 219, 196, 258, 225, 344, 299, 379, 319, 0.29, 0.34, 0.29],
    [185, 248, 223, 294, 255, 392, 341, 434, 364, 0.23, 0.29, 0.25],
    [240, 291, 261, 344, 297, 461, 403, 514, 430, 0.18, 0.24, 0.21],
    [300, 334, 298, 394, 339, 530, 464, 593, 497, 0.145, 0.21, 0.185],
    [400, null, null, 470, 402, 634, 557, 715, 597, 0.105, 0.185, 0.160],
  ];

  const MULTICORE_XLPE_ROWS = [
    [1,   14.5, 13, 17, 15, 19, 17, 21, 18, 46, 46, 40],
    [1.5, 18.5, 16.5, 22, 19.5, 24, 22, 26, 23, 31, 31, 27],
    [2.5, 25, 22, 30, 26, 33, 30, 36, 32, 19, 19, 16],
    [4,   33, 30, 40, 35, 45, 40, 49, 42, 12, 12, 10],
    [6,   42, 38, 51, 44, 58, 52, 63, 54, 7.9, 7.9, 6.8],
    [10,  57, 51, 69, 60, 80, 71, 86, 75, 4.7, 4.7, 4.0],
    [16,  76, 68, 91, 80, 107, 96, 115, 100, 2.9, 2.9, 2.5],
    [25,  99, 89, 119, 105, 138, 119, 149, 127, 1.85, 1.9, 1.65],
    [35,  121, 109, 146, 128, 171, 147, 185, 158, 1.35, 1.35, 1.15],
    [50,  145, 130, 175, 154, 209, 179, 225, 192, 0.98, 1.00, 0.87],
    [70,  183, 164, 221, 194, 269, 229, 289, 246, 0.67, 0.69, 0.60],
    [95,  220, 197, 265, 233, 328, 278, 352, 298, 0.49, 0.52, 0.45],
    [120, 253, 227, 305, 268, 382, 322, 410, 346, 0.39, 0.42, 0.37],
    [150, 290, 259, 334, 307, 441, 371, 473, 399, 0.31, 0.35, 0.30],
    [185, 329, 295, 384, 340, 506, 424, 542, 456, 0.25, 0.29, 0.26],
    [240, 386, 346, 459, 398, 599, 500, 641, 538, 0.195, 0.24, 0.21],
    [300, 442, 396, 532, 455, 693, 576, 741, 621, 0.15, 0.21, 0.18],
    [400, null, null, 625, 536, 803, 667, 865, 741, 0.12, 0.19, 0.165],
  ];

  const MULTICORE_XLPE_ARMOURED_ROWS = [
    [1.5, 25, 21, 27, 23, 29, 25, 31, 31, 27],
    [2.5, 33, 28, 36, 31, 39, 33, 19, 19, 16],
    [4,   43, 36, 49, 42, 52, 44, 12, 12, 10],
    [6,   53, 44, 62, 53, 66, 56, 7.9, 7.9, 6.8],
    [10,  71, 58, 85, 73, 90, 78, 4.7, 4.7, 4.0],
    [16,  91, 75, 110, 94, 115, 99, 2.9, 2.9, 2.5],
    [25,  116, 96, 146, 124, 152, 131, 1.85, 1.90, 1.65],
    [35,  139, 115, 180, 154, 188, 162, 1.35, 1.35, 1.15],
    [50,  164, 135, 219, 187, 228, 197, 0.98, 1.00, 0.87],
    [70,  203, 167, 279, 238, 291, 251, 0.67, 0.69, 0.60],
    [95,  239, 197, 338, 289, 354, 304, 0.49, 0.52, 0.45],
    [120, 271, 223, 392, 335, 410, 353, 0.39, 0.42, 0.37],
    [150, 306, 251, 451, 386, 472, 406, 0.31, 0.35, 0.30],
    [185, 343, 281, 515, 441, 539, 463, 0.25, 0.29, 0.26],
    [240, 395, 324, 607, 520, 636, 546, 0.195, 0.24, 0.21],
    [300, 446, 365, 698, 599, 732, 628, 0.155, 0.21, 0.185],
    [400, null, null, 787, 673, 847, 728, 0.120, 0.190, 0.165],
  ];

  function _mkMcRow(v) {
    return {
      csa: v[0],
      ampacity: {
        a: { single: v[1], three: v[2] },
        b: { single: v[3], three: v[4] },
        c: { single: v[5], three: v[6] },
        e: { single: v[7], three: v[8] },
      },
      vdrop: { dc: v[9], ac1p: v[10], ac3p: v[11] },
    };
  }

  function _mkMcArmRow(v) {
    return {
      csa: v[0],
      ampacity: {
        d: { single: v[1], three: v[2] },
        c: { single: v[3], three: v[4] },
        e: { single: v[5], three: v[6] },
      },
      vdrop: { dc: v[7], ac1p: v[8], ac3p: v[9] },
    };
  }

  const CATALOGUE_PROFILES = {
    mc_pvc_non_armoured: {
      id: 'mc_pvc_non_armoured',
      label: 'Multicore PVC non-armoured (Kelani Table E)',
      baseMaterial: 'cu',
      baseInsulation: 'pvc',
      installToMethod: {
        closed_tube: 'b',
        open_air: 'e',
        clipped_direct: 'c',
        rooftop_open: 'e',
      },
      rows: MULTICORE_PVC_ROWS.map(_mkMcRow),
      sourceRefs: ['Kelani Table E (catalog p.70)', 'Kelani Z-01/Z-03 (catalog p.54)'],
    },
    mc_xlpe_non_armoured: {
      id: 'mc_xlpe_non_armoured',
      label: 'Multicore XLPE non-armoured (Kelani Table F)',
      baseMaterial: 'cu',
      baseInsulation: 'xlpe',
      installToMethod: {
        closed_tube: 'b',
        open_air: 'e',
        clipped_direct: 'c',
        rooftop_open: 'e',
      },
      rows: MULTICORE_XLPE_ROWS.map(_mkMcRow),
      sourceRefs: ['Kelani Table F (catalog p.71)', 'Kelani Z-01/Z-03 (catalog p.54)'],
    },
    mc_xlpe_armoured: {
      id: 'mc_xlpe_armoured',
      label: 'Multicore XLPE armoured (Kelani Table H)',
      baseMaterial: 'cu',
      baseInsulation: 'xlpe',
      installToMethod: {
        closed_tube: 'c',
        open_air: 'e',
        clipped_direct: 'c',
        rooftop_open: 'e',
        buried_direct: 'd',
        buried_duct: 'd',
      },
      rows: MULTICORE_XLPE_ARMOURED_ROWS.map(_mkMcArmRow),
      sourceRefs: ['Kelani Table H (catalog p.73)', 'Kelani Z-01/Z-02/Z-04/Z-05 (catalog p.54-55)'],
    },
  };

  function _pickProfile(material, insulation, cableConstruction, installMethod, explicitProfile) {
    if (explicitProfile && CATALOGUE_PROFILES[explicitProfile]) {
      return { profile: CATALOGUE_PROFILES[explicitProfile], warnings: [] };
    }
    const warnings = [];
    if (installMethod === 'buried_direct' || installMethod === 'buried_duct' || cableConstruction === 'multi_core_armoured') {
      if (cableConstruction !== 'multi_core_armoured') {
        warnings.push('Buried routes are evaluated with armoured multicore table set (Kelani Table H).');
      }
      return { profile: CATALOGUE_PROFILES.mc_xlpe_armoured, warnings };
    }
    if (insulation === 'pvc') return { profile: CATALOGUE_PROFILES.mc_pvc_non_armoured, warnings };
    return { profile: CATALOGUE_PROFILES.mc_xlpe_non_armoured, warnings };
  }

  function _resolveMethod(profile, installMethod) {
    const method = profile.installToMethod[installMethod];
    if (typeof method === 'string') return method;
    return profile.installToMethod.open_air || profile.installToMethod.closed_tube || null;
  }

  function _materialAdjust(profile, requestedMaterial) {
    if (requestedMaterial === profile.baseMaterial) {
      return { ampacityFactor: 1.0, vdropFactor: 1.0, note: null };
    }
    if (requestedMaterial === 'al' && profile.baseMaterial === 'cu') {
      return {
        ampacityFactor: 0.80,
        vdropFactor: 0.028264 / 0.017241,
        note: 'Aluminium result uses conservative conversion from copper table values for this profile.',
      };
    }
    return { ampacityFactor: 1.0, vdropFactor: 1.0, note: null };
  }

  function _ampacityFromRow(row, methodKey, systemType) {
    const method = row.ampacity[methodKey];
    if (!method) return null;
    if (systemType === 'ac3p') return Number.isFinite(method.three) ? method.three : null;
    return Number.isFinite(method.single) ? method.single : null;
  }

  function _vdropFromRow(row, systemType) {
    if (systemType === 'ac3p') return row.vdrop.ac3p;
    if (systemType === 'ac1p') return row.vdrop.ac1p;
    return row.vdrop.dc;
  }

  function _deriveCurrent(systemType, currentA, loadkW, voltageV, powerFactor) {
    if (Number.isFinite(currentA) && currentA > 0) {
      return { value: currentA, source: 'entered_current' };
    }
    if (!Number.isFinite(loadkW) || loadkW <= 0 || !Number.isFinite(voltageV) || voltageV <= 0) return null;
    const pf = Number.isFinite(powerFactor) && powerFactor > 0 ? powerFactor : 0.95;
    if (systemType === 'ac3p') {
      return { value: (loadkW * 1000) / (Math.sqrt(3) * voltageV * pf), source: 'derived_from_power' };
    }
    if (systemType === 'ac1p') {
      return { value: (loadkW * 1000) / (voltageV * pf), source: 'derived_from_power' };
    }
    return { value: (loadkW * 1000) / voltageV, source: 'derived_from_power' };
  }

  function cableSizeSelector(opts) {
    const options = opts || {};
    const systemType = options.systemType || 'dc'; // dc, ac1p, ac3p
    const material = options.material || 'cu'; // cu, al
    const insulation = options.insulation || 'xlpe'; // pvc, xlpe
    const cableConstruction = options.cableConstruction || 'multi_core_non_armoured';
    const installMethod = _normalizeInstallMethod(options.installMethod || 'closed_tube');
    const buriedSpacing = String(options.buriedSpacing || 'touching');
    const lengthOneWay_m = Number(options.lengthOneWay_m);
    const nominal_V = Number(options.nominal_V);
    const current_A = Number(options.current_A);
    const load_kW = Number(options.load_kW);
    const powerFactor = Number(options.powerFactor);
    const ambient_C = Number.isFinite(Number(options.ambient_C)) ? Number(options.ambient_C) : 30;
    const groundTemp_C = Number.isFinite(Number(options.groundTemp_C)) ? Number(options.groundTemp_C) : ambient_C;
    const groupedCircuits = Number.isFinite(Number(options.groupedCircuits)) ? Number(options.groupedCircuits) : 1;
    const continuousFactor = Number.isFinite(Number(options.continuousFactor)) ? Number(options.continuousFactor) : 1.25;
    const dropLimit_pct = Number.isFinite(Number(options.dropLimit_pct))
      ? Number(options.dropLimit_pct)
      : (systemType === 'dc' ? 1.0 : 3.0);

    if (!Number.isFinite(lengthOneWay_m) || lengthOneWay_m <= 0 || !Number.isFinite(nominal_V) || nominal_V <= 0) {
      return null;
    }

    const iOut = _deriveCurrent(systemType, current_A, load_kW, nominal_V, powerFactor);
    if (!iOut || !Number.isFinite(iOut.value) || iOut.value <= 0) return null;
    const I_load = iOut.value;

    const picked = _pickProfile(material, insulation, cableConstruction, installMethod, options.catalogProfile);
    const profile = picked.profile;
    const warnings = picked.warnings.slice();
    const materialAdj = _materialAdjust(profile, material);
    if (materialAdj.note) warnings.push(materialAdj.note);

    const methodDirect = profile.installToMethod[installMethod];
    const methodKey = _resolveMethod(profile, installMethod);
    if (!methodDirect) {
      warnings.push(`Install condition "${installMethod}" is not directly tabulated in ${profile.label}; fallback Method ${String(methodKey || '').toUpperCase()} is used.`);
    }

    const isBuried = installMethod === 'buried_direct' || installMethod === 'buried_duct';
    const tempBasis = isBuried ? 'ground' : 'air';
    const tempInput_C = isBuried ? groundTemp_C : ambient_C;
    const tempFactor = _tempFactorTable(insulation, tempInput_C, tempBasis);
    const groupFactor = isBuried
      ? _groupFactorBuried(groupedCircuits, buriedSpacing, installMethod === 'buried_duct')
      : _groupFactorGeneral(installMethod, groupedCircuits);
    const installFactor = 1.0;
    const totalDerating = tempFactor * groupFactor;

    const designCurrent_A = I_load * Math.max(continuousFactor, 1.0);
    const requiredBaseAmpacity_A = designCurrent_A / Math.max(totalDerating, 0.01);

    const rows = profile.rows.slice().sort((a, b) => a.csa - b.csa);
    const profileCsa = rows.map((r) => r.csa);

    let ampacityRequiredCSA_mm2 = null;
    for (let i = 0; i < rows.length; i += 1) {
      const baseA = _ampacityFromRow(rows[i], methodKey, systemType);
      if (!Number.isFinite(baseA)) continue;
      if (baseA * materialAdj.ampacityFactor >= requiredBaseAmpacity_A) {
        ampacityRequiredCSA_mm2 = rows[i].csa;
        break;
      }
    }
    if (!Number.isFinite(ampacityRequiredCSA_mm2)) {
      ampacityRequiredCSA_mm2 = profileCsa[profileCsa.length - 1];
      warnings.push('Ampacity requirement exceeds top row in selected catalogue profile.');
    }

    const rho20 = material === 'al' ? 0.028264 : 0.017241; // ohm mm2 / m
    const alpha = material === 'al' ? 0.00403 : 0.00393;
    const maxConductorTemp = insulation === 'pvc' ? 70 : 90;
    const estimatedConductorTemp = Math.min(maxConductorTemp, Math.max(25, tempInput_C + 20));
    const rhoAtTemp = rho20 * (1 + alpha * (estimatedConductorTemp - 20));

    const vdAllowed_V = nominal_V * (dropLimit_pct / 100);
    const vdCoeffFormula = systemType === 'ac3p' ? Math.sqrt(3) : 2.0;
    const requiredAreaByVdrop_mm2 = (vdCoeffFormula * lengthOneWay_m * I_load * rhoAtTemp) / Math.max(vdAllowed_V, 0.001);
    const vdAllowedCoeff_mV_per_A_m = (vdAllowed_V * 1000) / Math.max(I_load * lengthOneWay_m, 0.001);

    let vdropRequiredCSA_mm2 = null;
    for (let i = 0; i < rows.length; i += 1) {
      const coeff = _vdropFromRow(rows[i], systemType);
      if (!Number.isFinite(coeff)) continue;
      if ((coeff * materialAdj.vdropFactor) <= vdAllowedCoeff_mV_per_A_m) {
        vdropRequiredCSA_mm2 = rows[i].csa;
        break;
      }
    }
    if (!Number.isFinite(vdropRequiredCSA_mm2)) {
      vdropRequiredCSA_mm2 = profileCsa[profileCsa.length - 1];
      warnings.push('Voltage-drop requirement exceeds top row in selected catalogue profile.');
    }

    const minPracticalCSA = material === 'al' ? (systemType === 'dc' ? 25 : 16) : (systemType === 'dc' ? 4 : 1.5);
    const selectedCSA_mm2 = _nextStdCSA(Math.max(minPracticalCSA, ampacityRequiredCSA_mm2, vdropRequiredCSA_mm2), profileCsa)
      || profileCsa[profileCsa.length - 1];

    const selectedRow = rows.find((r) => r.csa >= selectedCSA_mm2) || rows[rows.length - 1];
    const selectedBaseAmpacity_A = (_ampacityFromRow(selectedRow, methodKey, systemType) || 0) * materialAdj.ampacityFactor;
    const selectedAllowableCurrent_A = selectedBaseAmpacity_A * totalDerating;
    const selectedVdropCoeff_mV_per_A_m = (_vdropFromRow(selectedRow, systemType) || 0) * materialAdj.vdropFactor;
    const selectedVdrop_V = (selectedVdropCoeff_mV_per_A_m * I_load * lengthOneWay_m) / 1000;
    const selectedVdrop_pct = (selectedVdrop_V / nominal_V) * 100;

    return {
      systemType,
      material,
      insulation,
      installMethod,
      cableConstruction,
      currentSource: iOut.source,
      I_load_A: I_load,
      designCurrent_A,
      lengthOneWay_m,
      nominal_V,
      dropLimit_pct,
      tempFactor,
      groupFactor,
      installFactor,
      totalDerating,
      requiredBaseAmpacity_A,
      ampacityRequiredCSA_mm2,
      requiredAreaByVdrop_mm2,
      vdropRequiredCSA_mm2,
      selectedCSA_mm2,
      selectedBaseAmpacity_A,
      selectedAllowableCurrent_A,
      selectedVdrop_V,
      selectedVdrop_pct,
      selectedVdropCoeff_mV_per_A_m,
      vdropAllowedCoeff_mV_per_A_m: vdAllowedCoeff_mV_per_A_m,
      ampacityPass: selectedAllowableCurrent_A >= designCurrent_A,
      vdropPass: selectedVdrop_pct <= dropLimit_pct,
      rho20,
      rhoAtTemp,
      estimatedConductorTemp,
      catalogProfile: profile.id,
      catalogProfileLabel: profile.label,
      tableMethod: methodKey,
      tableMethodLabel: `Method ${String(methodKey || '').toUpperCase()}`,
      temperatureBasis: tempBasis,
      temperatureInput_C: tempInput_C,
      tempFactorSource: tempBasis === 'ground' ? 'Kelani Z-02 (ground temperature)' : 'Kelani Z-01 (ambient air temperature)',
      groupFactorSource: isBuried
        ? (installMethod === 'buried_duct' ? 'Kelani Z-05 (buried ducts)' : 'Kelani Z-04 (buried direct)')
        : 'Kelani Z-03 (air/conduit/tray grouping)',
      buriedSpacing,
      sourceRefs: profile.sourceRefs.slice(),
      warnings,
      factors: {
        continuousFactor,
        ambient_C,
        groundTemp_C,
        groupedCircuits,
      },
      standardsChecklist: [
        'Kelani catalogue table method used for base ampacity and mV/A/m voltage-drop values.',
        'Kelani Z-01/Z-02 temperature factor and Z-03/Z-04/Z-05 grouping factor applied by selected condition.',
        'IEC 60364-5-52: apply installation method, temperature, and grouping correction factors for current-carrying capacity.',
        'IEC 60364-7-712 / SLS 1522: keep PV DC voltage drop conservative (commonly <= 1%) and use PV-rated UV-resistant DC cable.',
        'IEC 60364-5-54: verify protective earthing/bonding conductor sizing and continuity.',
        'PUCSL/SLS practice: final cable and protection device selection must match approved equipment datasheets and utility rules.',
      ],
      limitedBy: ampacityRequiredCSA_mm2 >= vdropRequiredCSA_mm2 ? 'ampacity' : 'voltage_drop',
    };
  }

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
    cableSizeSelector,
    stringVocAtTmin,
    stringVmpAtTmax,
  };
})();
