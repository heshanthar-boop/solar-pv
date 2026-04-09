/**
 * catalog-store.js - Unified inverter/battery catalog storage (seed + editable local DB)
 */

const CatalogStore = (() => {
  const STORAGE_INVERTERS = 'solarpv_catalog_inverters_v1';
  const STORAGE_BATTERIES = 'solarpv_catalog_batteries_v1';
  const STORAGE_META = 'solarpv_catalog_meta_v1';

  const PATH_GRID_INVERTERS = './data/grid-inverters.json';
  const PATH_HYBRID_INVERTERS = './data/hybrid-inverters.json';
  const PATH_HYBRID_BATTERIES = './data/hybrid-batteries.json';

  const state = {
    loaded: false,
    loading: false,
    loadError: '',
    revision: '',
    inverters: [],
    batteries: [],
    seed: {
      gridInverters: 0,
      hybridInverters: 0,
      batteries: 0,
    },
  };

  function _cleanText(value, maxLen) {
    const s = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    return maxLen ? s.slice(0, maxLen) : s;
  }

  function _cleanId(value) {
    return _cleanText(value, 120)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function _safeUrl(value) {
    const cleaned = _cleanText(value, 400);
    if (!cleaned) return '';
    try {
      const u = new URL(cleaned);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.toString();
    } catch (_) {
      return '';
    }
  }

  function _num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  const LK_GRID_INVERTER_PATTERNS = [
    { mfr: /^ABB\/FIMER$/i, model: /^(UNO-DM-|PVS-|TRIO-)/i },
    { mfr: /^KACO New Energy$/i, model: /blueplanet/i },
    { mfr: /^Solis \(Ginlong\)$/i, model: /^(S6-GR1P|S5-GR3P|S5-GC|S6-GC|Solis-100K-EHV-5G|Solis-125K-EHV-5G|Solis-125K1-EHV-5G)/i },
    { mfr: /^SOFAR$/i, model: /^SOFAR\s.*G3/i },
    { mfr: /^Fronius$/i, model: /^(Primo|Symo|Eco|Primo\sGEN24|GEN24)/i },
    { mfr: /^Growatt$/i, model: /^(MIN|MID)/i },
    { mfr: /^Afore$/i, model: /^(HNS|BNT)/i },
    { mfr: /^Sungrow$/i, model: /^SG60KU-M$/i },
  ];

  const LK_HYBRID_INVERTER_BRANDS = [
    /^Deye$/i,
    /^SOFAR$/i,
    /^Solis \(Ginlong\)$/i,
    /^GoodWe$/i,
    /^KACO New Energy$/i,
    /^Victron$/i,
    /^Growatt$/i,
    /^Fronius$/i,
    /^Sungrow$/i,
  ];

  function _isSriLankaGridInverter(row) {
    const manufacturer = _cleanText(row && row.manufacturer, 120);
    const model = _cleanText(row && row.model, 180);
    if (!manufacturer || !model) return false;
    if (/\bUS\b|\bUSH\b|\b208\b|\b240\b|\b277\b|\b480\b|\bAUS\b/i.test(model)) return false;
    return LK_GRID_INVERTER_PATTERNS.some(rule => rule.mfr.test(manufacturer) && rule.model.test(model));
  }

  function _isSriLankaHybridInverter(row) {
    const manufacturer = _cleanText(row && row.manufacturer, 120);
    return LK_HYBRID_INVERTER_BRANDS.some(rx => rx.test(manufacturer));
  }

  function _isSriLankaInverter(row) {
    const topology = _cleanText(row && row.topology, 32).toLowerCase();
    if (topology === 'hybrid') return _isSriLankaHybridInverter(row);
    return _isSriLankaGridInverter(row);
  }

  function _isLegacyGlobalInverter(row) {
    const note = _cleanText(row && row.note, 260).toLowerCase();
    const datasheetUrl = _safeUrl(row && row.datasheetUrl).toLowerCase();
    const datasheetRev = _cleanText(row && row.datasheetRev, 200).toLowerCase();
    if (note.includes('cec/sam')) return true;
    if (datasheetUrl.includes('raw.githubusercontent.com/nrel/sam')) return true;
    if (datasheetRev.includes('cec inverters.csv')) return true;
    return false;
  }

  function _pruneLegacyGlobalInverters(rows) {
    const src = Array.isArray(rows) ? rows : [];
    return src.filter(row => {
      if (_isSriLankaInverter(row)) return true;
      return !_isLegacyGlobalInverter(row);
    });
  }

  function _currentStandardsAudit() {
    const requestedProfileId = (typeof App !== 'undefined' && App && App.state && App.state.fieldTestProfileId)
      ? String(App.state.fieldTestProfileId)
      : undefined;

    let profile = null;
    if (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getFieldTestProfile === 'function') {
      profile = StandardsRules.getFieldTestProfile(requestedProfileId);
    } else if (typeof PVCalc !== 'undefined' && PVCalc && typeof PVCalc.getFieldTestProfile === 'function') {
      profile = PVCalc.getFieldTestProfile(requestedProfileId);
    }
    if (!profile || typeof profile !== 'object') {
      profile = { id: 'iec62446_2016', label: 'IEC 62446-1:2016 + AMD1:2018' };
    }

    const rulesetVersion = (typeof StandardsRules !== 'undefined' && StandardsRules && typeof StandardsRules.getRulesVersion === 'function')
      ? String(StandardsRules.getRulesVersion())
      : (
          typeof StandardsRules !== 'undefined' && StandardsRules && StandardsRules.RULESET_VERSION
            ? String(StandardsRules.RULESET_VERSION)
            : 'legacy'
        );

    return {
      profileId: _cleanText(profile.id || requestedProfileId || 'default', 64),
      profileLabel: _cleanText(profile.label || 'IEC 62446-1 profile', 160),
      rulesetVersion: _cleanText(rulesetVersion, 64),
    };
  }

  function _normalizeStandardsAudit(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const profileId = _cleanText(raw.profileId || raw.profile || '', 64);
    const profileLabel = _cleanText(raw.profileLabel || raw.profileName || '', 160);
    const rulesetVersion = _cleanText(raw.rulesetVersion || raw.rulesVersion || '', 64);
    if (!profileId && !profileLabel && !rulesetVersion) return null;
    return { profileId, profileLabel, rulesetVersion };
  }

  function _extractImportEnvelope(parsed, kind) {
    const fallbackKey = kind === 'batteries' ? 'batteries' : 'inverters';
    if (Array.isArray(parsed)) {
      return { items: parsed, sourceFormat: 'array', meta: null };
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('JSON root must be an array or object with items[]');
    }
    const items = Array.isArray(parsed.items)
      ? parsed.items
      : (Array.isArray(parsed[fallbackKey]) ? parsed[fallbackKey] : null);
    if (!Array.isArray(items)) {
      throw new Error('JSON root must be an array or object with items[]');
    }
    return {
      items,
      sourceFormat: 'envelope',
      meta: {
        format: _cleanText(parsed.format || '', 64),
        schemaVersion: _cleanText(parsed.schemaVersion || parsed.version || '', 64),
        exportedAt: _cleanText(parsed.exportedAt || '', 64),
        standardsAudit: _normalizeStandardsAudit(parsed.standardsAudit || (parsed.meta && parsed.meta.standardsAudit)),
      }
    };
  }

  function _normalizeInverter(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const manufacturer = _cleanText(raw.manufacturer, 80);
    const model = _cleanText(raw.model, 140);
    const id = _cleanId(raw.id || `${manufacturer}_${model}`);
    if (!manufacturer || !model || !id) return null;

    const acRated_kW = _num(raw.acRated_kW, NaN);
    const surge_kW = _num(raw.surge_kW, 0);
    const surge_s = _num(raw.surge_s, 0);
    const batteryBus_V = _num(raw.batteryBus_V, 0);
    const maxCharge_A = _num(raw.maxCharge_A, 0);
    const maxDischarge_A = _num(raw.maxDischarge_A, 0);
    const maxPv_kW = _num(raw.maxPv_kW, 0);
    const maxDcVoc_V = _num(raw.maxDcVoc_V, 0);
    const mpptMin_V = _num(raw.mpptMin_V, 0);
    const mpptMax_V = _num(raw.mpptMax_V, 0);
    const mpptCount = Math.max(0, Math.round(_num(raw.mpptCount, 0)));
    const maxCurrentPerMppt_A = _num(raw.maxCurrentPerMppt_A, 0);

    if (!Number.isFinite(acRated_kW) || acRated_kW <= 0 || acRated_kW > 2000) return null;
    if (surge_kW < 0 || surge_kW > 5000) return null;
    if (surge_s < 0 || surge_s > 120) return null;
    if (batteryBus_V < 0 || batteryBus_V > 1500) return null;
    if (maxCharge_A < 0 || maxCharge_A > 5000) return null;
    if (maxDischarge_A < 0 || maxDischarge_A > 5000) return null;
    if (maxPv_kW < 0 || maxPv_kW > 5000) return null;
    if (maxDcVoc_V < 0 || maxDcVoc_V > 2500) return null;
    if (mpptMin_V < 0 || mpptMin_V > 2000) return null;
    if (mpptMax_V < 0 || mpptMax_V > 2000) return null;
    if (mpptMax_V > 0 && mpptMin_V > mpptMax_V) return null;
    if (mpptCount < 0 || mpptCount > 16) return null;
    if (maxCurrentPerMppt_A < 0 || maxCurrentPerMppt_A > 1000) return null;

    const topology = _cleanText(raw.topology || ((batteryBus_V > 0 || maxCharge_A > 0 || maxDischarge_A > 0) ? 'hybrid' : 'grid-tie'), 32).toLowerCase();
    const supportedProfilesRaw = Array.isArray(raw.supportedProfiles) ? raw.supportedProfiles : ['offgrid', 'ceb_2025', 'leco_2025'];
    const supportedProfiles = Array.from(new Set(supportedProfilesRaw.map(x => _cleanText(x, 32).toLowerCase()).filter(Boolean)));
    const utilityListedRaw = raw.utilityListed && typeof raw.utilityListed === 'object' ? raw.utilityListed : {};
    const listingSourceRaw = raw.listingSource && typeof raw.listingSource === 'object' ? raw.listingSource : {};

    return {
      id,
      manufacturer,
      model,
      topology,
      acRated_kW: Number(acRated_kW.toFixed(3)),
      surge_kW: Number(surge_kW.toFixed(3)),
      surge_s: Number(surge_s.toFixed(3)),
      batteryBus_V: Number(batteryBus_V.toFixed(3)),
      maxCharge_A: Number(maxCharge_A.toFixed(3)),
      maxDischarge_A: Number(maxDischarge_A.toFixed(3)),
      maxPv_kW: Number(maxPv_kW.toFixed(3)),
      maxDcVoc_V: Number(maxDcVoc_V.toFixed(3)),
      mpptMin_V: Number(mpptMin_V.toFixed(3)),
      mpptMax_V: Number(mpptMax_V.toFixed(3)),
      mpptCount,
      maxCurrentPerMppt_A: Number(maxCurrentPerMppt_A.toFixed(3)),
      supportedProfiles,
      utilityListed: {
        ceb_2025: utilityListedRaw.ceb_2025 === true,
        leco_2025: utilityListedRaw.leco_2025 === true,
      },
      listingSource: {
        ceb_2025: _cleanText(listingSourceRaw.ceb_2025, 240),
        leco_2025: _cleanText(listingSourceRaw.leco_2025, 240),
      },
      datasheetRev: _cleanText(raw.datasheetRev, 120),
      datasheetUrl: _safeUrl(raw.datasheetUrl),
      sourceConfidence: _cleanText(raw.sourceConfidence || '', 20).toLowerCase() || 'unknown',
      note: _cleanText(raw.note, 240),
    };
  }

  function _normalizeBattery(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const manufacturer = _cleanText(raw.manufacturer, 80);
    const model = _cleanText(raw.model, 120);
    const id = _cleanId(raw.id || `${manufacturer}_${model}`);
    if (!manufacturer || !model || !id) return null;

    const nominalV = _num(raw.nominalV, NaN);
    const capacityAh = _num(raw.capacityAh, NaN);
    const recommendedDod = _num(raw.recommendedDod, 0.8);
    const continuousCharge_A = _num(raw.continuousCharge_A, 0);
    const continuousDischarge_A = _num(raw.continuousDischarge_A, 0);
    const peakDischarge_A = _num(raw.peakDischarge_A, 0);
    const peakDuration_s = _num(raw.peakDuration_s, 0);
    const tempMinC = _num(raw.tempMinC, 0);
    const tempMaxC = _num(raw.tempMaxC, 50);

    if (!Number.isFinite(nominalV) || nominalV <= 0 || nominalV > 1500) return null;
    if (!Number.isFinite(capacityAh) || capacityAh <= 0 || capacityAh > 100000) return null;
    if (!Number.isFinite(recommendedDod) || recommendedDod <= 0 || recommendedDod > 1) return null;
    if (continuousCharge_A < 0 || continuousCharge_A > 5000) return null;
    if (continuousDischarge_A < 0 || continuousDischarge_A > 5000) return null;
    if (peakDischarge_A < 0 || peakDischarge_A > 10000) return null;
    if (peakDuration_s < 0 || peakDuration_s > 600) return null;
    if (!Number.isFinite(tempMinC) || !Number.isFinite(tempMaxC) || tempMinC > tempMaxC) return null;

    return {
      id,
      manufacturer,
      model,
      chemistry: _cleanText(raw.chemistry || 'lifepo4', 32).toLowerCase(),
      nominalV: Number(nominalV.toFixed(3)),
      capacityAh: Number(capacityAh.toFixed(3)),
      recommendedDod: Number(recommendedDod.toFixed(4)),
      continuousCharge_A: Number(continuousCharge_A.toFixed(3)),
      continuousDischarge_A: Number(continuousDischarge_A.toFixed(3)),
      peakDischarge_A: Number(peakDischarge_A.toFixed(3)),
      peakDuration_s: Number(peakDuration_s.toFixed(3)),
      tempMinC: Number(tempMinC.toFixed(3)),
      tempMaxC: Number(tempMaxC.toFixed(3)),
      datasheetRev: _cleanText(raw.datasheetRev, 120),
      datasheetUrl: _safeUrl(raw.datasheetUrl),
      note: _cleanText(raw.note, 240),
    };
  }

  function _loadLocalArray(key, normalizer) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(normalizer).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function _saveLocalArray(key, rows) {
    localStorage.setItem(key, JSON.stringify(rows));
  }

  function _loadMeta() {
    try {
      const raw = localStorage.getItem(STORAGE_META);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function _saveMeta(meta) {
    localStorage.setItem(STORAGE_META, JSON.stringify(meta));
  }

  async function _fetchJson(url) {
    if (typeof fetch !== 'function') throw new Error('Fetch API unavailable');
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res && res.ok) return res.json();
    } catch (_) {}

    try {
      const absolute = (typeof window !== 'undefined' && window.location)
        ? new URL(url, window.location.href).toString()
        : url;
      const res2 = await fetch(absolute, { cache: 'no-cache' });
      if (res2 && res2.ok) return res2.json();
    } catch (_) {}

    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      throw new Error(`Cannot load ${url} from file://. Start app with launch.bat (http://localhost:8090).`);
    }
    throw new Error(`Failed to load ${url}`);
  }

  function _extractRows(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object' && Array.isArray(payload[key])) return payload[key];
    return [];
  }

  function _setRevision() {
    state.revision = new Date().toISOString();
    const meta = _loadMeta() || {};
    _saveMeta({ ...meta, revision: state.revision, updatedAt: state.revision });
  }

  function _mergeUnique(items, normalizer) {
    const map = {};
    (items || []).forEach(raw => {
      const n = normalizer(raw);
      if (!n || !n.id) return;
      map[n.id] = n;
    });
    return Object.values(map).sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
  }

  async function _loadBundledCatalogs() {
    const [gridPayload, hybridPayload, batteryPayload] = await Promise.all([
      _fetchJson(PATH_GRID_INVERTERS),
      _fetchJson(PATH_HYBRID_INVERTERS),
      _fetchJson(PATH_HYBRID_BATTERIES),
    ]);
    const gridRows = _extractRows(gridPayload, 'inverters').map(x => ({ ...x, topology: x.topology || 'grid-tie' }));
    const hybridRows = _extractRows(hybridPayload, 'inverters').map(x => ({ ...x, topology: 'hybrid' }));
    const batteryRows = _extractRows(batteryPayload, 'batteries');

    return {
      inverters: _mergeUnique(gridRows.concat(hybridRows), _normalizeInverter).filter(_isSriLankaInverter),
      batteries: _mergeUnique(batteryRows, _normalizeBattery),
      seed: {
        gridInverters: gridRows.length,
        hybridInverters: hybridRows.length,
        batteries: batteryRows.length,
      },
    };
  }

  async function ensureLoaded() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    state.loadError = '';
    let inverters = [];
    let batteries = [];
    try {
      const localInvertersRaw = _loadLocalArray(STORAGE_INVERTERS, _normalizeInverter);
      const localInverters = _pruneLegacyGlobalInverters(localInvertersRaw);
      const localBatteries = _loadLocalArray(STORAGE_BATTERIES, _normalizeBattery);
      inverters = localInverters;
      batteries = localBatteries;

      if (localInverters.length !== localInvertersRaw.length) {
        _saveLocalArray(STORAGE_INVERTERS, localInverters);
      }

      let bundled = null;
      try {
        bundled = await _loadBundledCatalogs();
        state.seed = { ...bundled.seed };
      } catch (bundleErr) {
        // Non-fatal if local data exists; fatal only on first-run with empty local DB.
        if (!localInverters.length || !localBatteries.length) throw bundleErr;
      }

      if (!localInverters.length || !localBatteries.length) {
        if (!bundled) throw new Error('Bundled catalogs unavailable');
        inverters = bundled.inverters;
        batteries = bundled.batteries;
        _saveLocalArray(STORAGE_INVERTERS, inverters);
        _saveLocalArray(STORAGE_BATTERIES, batteries);
        _setRevision();
      } else if (bundled) {
        // Keep user overrides, but merge in newly bundled defaults by id when available.
        const mergedInverters = _mergeUnique(bundled.inverters.concat(localInverters), _normalizeInverter);
        const mergedBatteries = _mergeUnique(bundled.batteries.concat(localBatteries), _normalizeBattery);
        const changed = mergedInverters.length !== localInvertersRaw.length || mergedBatteries.length !== localBatteries.length;
        inverters = mergedInverters;
        batteries = mergedBatteries;
        if (changed) {
          _saveLocalArray(STORAGE_INVERTERS, inverters);
          _saveLocalArray(STORAGE_BATTERIES, batteries);
          _setRevision();
        } else {
          const meta = _loadMeta();
          state.revision = _cleanText(meta && meta.revision, 80);
        }
      } else {
        const meta = _loadMeta();
        state.revision = _cleanText(meta && meta.revision, 80);
      }

      state.inverters = inverters;
      state.batteries = batteries;
    } catch (err) {
      state.loadError = err && err.message ? err.message : 'Catalog load failed';
      // Preserve whatever local data was available instead of blanking UI on fetch issues.
      state.inverters = Array.isArray(inverters) ? inverters : [];
      state.batteries = Array.isArray(batteries) ? batteries : [];
    } finally {
      state.loading = false;
      state.loaded = true;
    }
  }

  async function resetToBundledDefaults() {
    state.loading = true;
    state.loadError = '';
    try {
      const bundled = await _loadBundledCatalogs();
      state.inverters = bundled.inverters;
      state.batteries = bundled.batteries;
      state.seed = { ...bundled.seed };
      _saveLocalArray(STORAGE_INVERTERS, state.inverters);
      _saveLocalArray(STORAGE_BATTERIES, state.batteries);
      _setRevision();
      state.loaded = true;
      return {
        ok: true,
        inverterCount: state.inverters.length,
        batteryCount: state.batteries.length,
        seed: { ...state.seed },
        revision: state.revision,
      };
    } catch (err) {
      state.loadError = err && err.message ? err.message : 'Failed to reset catalog defaults';
      return { ok: false, error: state.loadError };
    } finally {
      state.loading = false;
    }
  }

  function getRevision() {
    return state.revision || '';
  }

  function getState() {
    return {
      loaded: state.loaded,
      loading: state.loading,
      loadError: state.loadError,
      revision: state.revision,
      inverterCount: state.inverters.length,
      batteryCount: state.batteries.length,
      seed: { ...state.seed },
    };
  }

  function getAllInverters() {
    return state.inverters.slice();
  }

  function getInvertersByTopology(topology) {
    const t = _cleanText(topology || '', 32).toLowerCase();
    if (!t) return getAllInverters();
    return state.inverters.filter(x => _cleanText(x.topology, 32).toLowerCase() === t);
  }

  function getAllBatteries() {
    return state.batteries.slice();
  }

  function upsertInverter(raw) {
    const n = _normalizeInverter(raw);
    if (!n) return null;
    const map = {};
    state.inverters.forEach(x => { map[x.id] = x; });
    map[n.id] = n;
    state.inverters = Object.values(map).sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
    _saveLocalArray(STORAGE_INVERTERS, state.inverters);
    _setRevision();
    return n;
  }

  function removeInverter(id) {
    const key = _cleanId(id || '');
    if (!key) return;
    state.inverters = state.inverters.filter(x => x.id !== key);
    _saveLocalArray(STORAGE_INVERTERS, state.inverters);
    _setRevision();
  }

  function upsertBattery(raw) {
    const n = _normalizeBattery(raw);
    if (!n) return null;
    const map = {};
    state.batteries.forEach(x => { map[x.id] = x; });
    map[n.id] = n;
    state.batteries = Object.values(map).sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
    _saveLocalArray(STORAGE_BATTERIES, state.batteries);
    _setRevision();
    return n;
  }

  function removeBattery(id) {
    const key = _cleanId(id || '');
    if (!key) return;
    state.batteries = state.batteries.filter(x => x.id !== key);
    _saveLocalArray(STORAGE_BATTERIES, state.batteries);
    _setRevision();
  }

  function exportInvertersJSON() {
    const payload = {
      format: 'solarpv.catalog.inverters',
      schemaVersion: '2026.04.09',
      exportedAt: new Date().toISOString(),
      standardsAudit: _currentStandardsAudit(),
      items: state.inverters,
    };
    return JSON.stringify(payload, null, 2);
  }

  function exportBatteriesJSON() {
    const payload = {
      format: 'solarpv.catalog.batteries',
      schemaVersion: '2026.04.09',
      exportedAt: new Date().toISOString(),
      standardsAudit: _currentStandardsAudit(),
      items: state.batteries,
    };
    return JSON.stringify(payload, null, 2);
  }

  function importInvertersJSON(text) {
    const report = {
      ok: false,
      total: 0,
      added: 0,
      updated: 0,
      rejected: 0,
      error: '',
      sourceFormat: '',
      format: '',
      schemaVersion: '',
      exportedAt: '',
      standardsAudit: null
    };
    try {
      const parsed = JSON.parse(String(text || ''));
      const env = _extractImportEnvelope(parsed, 'inverters');
      const arr = env.items;
      report.sourceFormat = env.sourceFormat;
      if (env.meta) {
        report.format = env.meta.format || '';
        report.schemaVersion = env.meta.schemaVersion || '';
        report.exportedAt = env.meta.exportedAt || '';
        report.standardsAudit = env.meta.standardsAudit || null;
      }
      report.total = arr.length;
      const map = {};
      state.inverters.forEach(x => { map[x.id] = x; });
      arr.forEach(raw => {
        const n = _normalizeInverter(raw);
        if (!n) {
          report.rejected++;
          return;
        }
        if (!_isSriLankaInverter(n) && _isLegacyGlobalInverter(n)) {
          report.rejected++;
          return;
        }
        if (map[n.id]) report.updated++;
        else report.added++;
        map[n.id] = n;
      });
      state.inverters = Object.values(map).sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
      _saveLocalArray(STORAGE_INVERTERS, state.inverters);
      _setRevision();
      report.ok = true;
      return report;
    } catch (err) {
      report.error = err && err.message ? err.message : 'Invalid JSON file';
      return report;
    }
  }

  function importBatteriesJSON(text) {
    const report = {
      ok: false,
      total: 0,
      added: 0,
      updated: 0,
      rejected: 0,
      error: '',
      sourceFormat: '',
      format: '',
      schemaVersion: '',
      exportedAt: '',
      standardsAudit: null
    };
    try {
      const parsed = JSON.parse(String(text || ''));
      const env = _extractImportEnvelope(parsed, 'batteries');
      const arr = env.items;
      report.sourceFormat = env.sourceFormat;
      if (env.meta) {
        report.format = env.meta.format || '';
        report.schemaVersion = env.meta.schemaVersion || '';
        report.exportedAt = env.meta.exportedAt || '';
        report.standardsAudit = env.meta.standardsAudit || null;
      }
      report.total = arr.length;
      const map = {};
      state.batteries.forEach(x => { map[x.id] = x; });
      arr.forEach(raw => {
        const n = _normalizeBattery(raw);
        if (!n) {
          report.rejected++;
          return;
        }
        if (map[n.id]) report.updated++;
        else report.added++;
        map[n.id] = n;
      });
      state.batteries = Object.values(map).sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
      _saveLocalArray(STORAGE_BATTERIES, state.batteries);
      _setRevision();
      report.ok = true;
      return report;
    } catch (err) {
      report.error = err && err.message ? err.message : 'Invalid JSON file';
      return report;
    }
  }

  return {
    ensureLoaded,
    getState,
    getRevision,
    getAllInverters,
    getInvertersByTopology,
    getAllBatteries,
    upsertInverter,
    removeInverter,
    upsertBattery,
    removeBattery,
    exportInvertersJSON,
    exportBatteriesJSON,
    importInvertersJSON,
    importBatteriesJSON,
    resetToBundledDefaults,
  };
})();
