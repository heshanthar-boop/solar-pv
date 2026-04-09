/**
 * inverter-catalog.js - Grid inverter catalogue loader + schema validation
 */

const InverterCatalog = (() => {
  const CATALOG_URL = './data/grid-inverters.json';

  const state = {
    loaded: false,
    loading: false,
    loadError: '',
    version: '',
    source: '',
    totalRows: 0,
    validRows: 0,
    rejectedRows: 0,
    rows: [],
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

  function _numOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function _normalizeUrl(value) {
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

  function _normalizeInverter(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const manufacturer = _cleanText(raw.manufacturer, 80);
    const model = _cleanText(raw.model, 140);
    const id = _cleanId(raw.id || `${manufacturer}_${model}`);
    if (!manufacturer || !model || !id) return null;

    const acRated_kW = _numOrNull(raw.acRated_kW);
    if (!Number.isFinite(acRated_kW) || acRated_kW <= 0 || acRated_kW > 500) return null;

    const maxDcVoc_V = _numOrNull(raw.maxDcVoc_V);
    const mpptMin_V = _numOrNull(raw.mpptMin_V);
    const mpptMax_V = _numOrNull(raw.mpptMax_V);
    const mpptCount = _numOrNull(raw.mpptCount);
    const maxCurrentPerMppt_A = _numOrNull(raw.maxCurrentPerMppt_A);

    if (Number.isFinite(maxDcVoc_V) && (maxDcVoc_V <= 0 || maxDcVoc_V > 2000)) return null;
    if (Number.isFinite(mpptMin_V) && (mpptMin_V < 0 || mpptMin_V > 1500)) return null;
    if (Number.isFinite(mpptMax_V) && (mpptMax_V < 0 || mpptMax_V > 1500)) return null;
    if (Number.isFinite(mpptMin_V) && Number.isFinite(mpptMax_V) && mpptMin_V > mpptMax_V) return null;
    if (Number.isFinite(mpptCount) && (mpptCount < 0 || mpptCount > 16)) return null;
    if (Number.isFinite(maxCurrentPerMppt_A) && (maxCurrentPerMppt_A < 0 || maxCurrentPerMppt_A > 1000)) return null;

    const topologyRaw = _cleanText(raw.topology || 'grid-tie', 32).toLowerCase();
    const topology = topologyRaw || 'grid-tie';

    return {
      id,
      manufacturer,
      model,
      topology,
      acRated_kW: Number(acRated_kW.toFixed(3)),
      maxDcVoc_V: Number.isFinite(maxDcVoc_V) ? Number(maxDcVoc_V.toFixed(2)) : null,
      mpptMin_V: Number.isFinite(mpptMin_V) ? Number(mpptMin_V.toFixed(2)) : null,
      mpptMax_V: Number.isFinite(mpptMax_V) ? Number(mpptMax_V.toFixed(2)) : null,
      mpptCount: Number.isFinite(mpptCount) ? Math.round(mpptCount) : null,
      maxCurrentPerMppt_A: Number.isFinite(maxCurrentPerMppt_A) ? Number(maxCurrentPerMppt_A.toFixed(2)) : null,
      datasheetUrl: _normalizeUrl(raw.datasheetUrl),
      datasheetRev: _cleanText(raw.datasheetRev, 120),
      sourceConfidence: _cleanText(raw.sourceConfidence || '', 20).toLowerCase() || 'unknown',
      listingSource: _cleanText(raw.listingSource || '', 240),
    };
  }

  function _extractRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object' && Array.isArray(payload.inverters)) return payload.inverters;
    return [];
  }

  async function ensureLoaded() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    state.loadError = '';
    try {
      if (typeof fetch !== 'function') throw new Error('Fetch API unavailable');
      let payload = null;
      try {
        const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
        if (res && res.ok) payload = await res.json();
      } catch (_) {}
      if (!payload) {
        try {
          const absolute = (typeof window !== 'undefined' && window.location)
            ? new URL(CATALOG_URL, window.location.href).toString()
            : CATALOG_URL;
          const res2 = await fetch(absolute, { cache: 'no-cache' });
          if (res2 && res2.ok) payload = await res2.json();
        } catch (_) {}
      }
      if (!payload) {
        if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
          throw new Error(`Cannot load ${CATALOG_URL} from file://. Start app with launch.bat (http://localhost:8090).`);
        }
        throw new Error(`Failed to load ${CATALOG_URL}`);
      }
      const rows = _extractRows(payload);
      const normalized = rows.map(_normalizeInverter).filter(Boolean);
      normalized.sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));

      state.version = payload && typeof payload === 'object' ? _cleanText(payload.version, 40) : '';
      state.source = payload && typeof payload === 'object' ? _cleanText(payload.source, 240) : '';
      state.totalRows = rows.length;
      state.validRows = normalized.length;
      state.rejectedRows = Math.max(0, rows.length - normalized.length);
      state.rows = normalized;
    } catch (err) {
      state.loadError = err && err.message ? err.message : 'Grid inverter catalog load failed';
      state.rows = [];
      state.totalRows = 0;
      state.validRows = 0;
      state.rejectedRows = 0;
    } finally {
      state.loaded = true;
      state.loading = false;
    }
  }

  function getAll() {
    return (state.rows || []).slice();
  }

  function getGridInverters() {
    return getAll().filter(x => x.topology !== 'hybrid');
  }

  function getById(id) {
    const key = _cleanId(id || '');
    if (!key) return null;
    return (state.rows || []).find(x => x.id === key) || null;
  }

  function getState() {
    return {
      loaded: state.loaded,
      loading: state.loading,
      loadError: state.loadError,
      version: state.version,
      source: state.source,
      totalRows: state.totalRows,
      validRows: state.validRows,
      rejectedRows: state.rejectedRows,
    };
  }

  return { ensureLoaded, getAll, getGridInverters, getById, getState };
})();
