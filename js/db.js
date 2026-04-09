/**
 * db.js - Unified local database (PV modules + inverter/battery catalogs)
 * PV module records are localStorage-backed and used across sizing/hybrid checks.
 * Temperature coefficients stored as decimal fractions (e.g. -0.0026 per C, NOT -0.26%/C)
 */

const DB = (() => {
  const STORAGE_KEY = 'solarpv_panels';
  const MAX_IMPORT_PANELS = 1500;
  const PV_SEED_PATH = './data/pv-modules.json';
  const DB_TABS = ['pv', 'inverter', 'battery'];
  let _activeTab = 'pv';
  let _seedAttempted = false;
  let _lastImportReport = null;

  // --- PRELOADED PANELS ---
  // Typical 2023/2024 datasheet values. Coefficients as decimal/C.
  const PRELOADED = [
    {
      id: 'jinko_tiger_neo_580', manufacturer: 'Jinko Solar', model: 'Tiger Neo N-type 580W',
      Pmax: 580, Voc: 49.80, Vmp: 42.00, Isc: 14.67, Imp: 13.81,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 43, cells: 72, preloaded: true,
      note: 'N-type TOPCon bifacial'
    },
    {
      id: 'jinko_tiger_pro_530', manufacturer: 'Jinko Solar', model: 'Tiger Pro 72HC 530W',
      Pmax: 530, Voc: 49.50, Vmp: 41.30, Isc: 13.67, Imp: 12.83,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono-PERC bifacial'
    },
    {
      id: 'longi_himo6_580', manufacturer: 'LONGi', model: 'Hi-MO 6 580W',
      Pmax: 580, Voc: 50.20, Vmp: 42.10, Isc: 14.52, Imp: 13.78,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 43, cells: 72, preloaded: true,
      note: 'HPBC technology'
    },
    {
      id: 'longi_himox6_490', manufacturer: 'LONGi', model: 'Hi-MO X6 490W',
      Pmax: 490, Voc: 43.60, Vmp: 36.40, Isc: 14.23, Imp: 13.46,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 44, cells: 60, preloaded: true,
      note: 'Mono PERC'
    },
    {
      id: 'canadian_hiku7_660', manufacturer: 'Canadian Solar', model: 'HiKu7 CS7N 660W',
      Pmax: 660, Voc: 56.00, Vmp: 47.20, Isc: 14.96, Imp: 13.98,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 43, cells: 78, preloaded: true,
      note: 'Mono-PERC bifacial'
    },
    {
      id: 'canadian_hihero_430', manufacturer: 'Canadian Solar', model: 'HiHero 430W',
      Pmax: 430, Voc: 40.10, Vmp: 33.80, Isc: 13.72, Imp: 12.72,
      coeffVoc: -0.00258, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 42, cells: 54, preloaded: true,
      note: 'HJT'
    },
    {
      id: 'trina_vertex_s_430', manufacturer: 'Trina Solar', model: 'Vertex S+ 430W',
      Pmax: 430, Voc: 41.40, Vmp: 34.80, Isc: 13.23, Imp: 12.36,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 43, cells: 54, preloaded: true,
      note: 'Mono-PERC'
    },
    {
      id: 'trina_vertex_670', manufacturer: 'Trina Solar', model: 'Vertex 670W',
      Pmax: 670, Voc: 57.00, Vmp: 47.80, Isc: 15.05, Imp: 14.02,
      coeffVoc: -0.0025, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 43, cells: 78, preloaded: true,
      note: 'Mono-PERC bifacial'
    },
    {
      id: 'ja_jam72s30_545', manufacturer: 'JA Solar', model: 'JAM72S30 545W',
      Pmax: 545, Voc: 49.80, Vmp: 41.70, Isc: 13.93, Imp: 13.07,
      coeffVoc: -0.0028, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 43, cells: 72, preloaded: true,
      note: 'Mono-PERC'
    },
    {
      id: 'ja_jam54s30_415', manufacturer: 'JA Solar', model: 'JAM54S30 415W',
      Pmax: 415, Voc: 37.70, Vmp: 31.40, Isc: 13.93, Imp: 13.21,
      coeffVoc: -0.0028, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 43, cells: 54, preloaded: true,
      note: 'Mono-PERC'
    },
    {
      id: 'risen_titan_610', manufacturer: 'Risen Energy', model: 'Titan 610W',
      Pmax: 610, Voc: 51.36, Vmp: 43.24, Isc: 14.98, Imp: 14.11,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0034,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono-PERC bifacial'
    },
    {
      id: 'suntech_ultra_v_560', manufacturer: 'Suntech', model: 'Ultra V 560W',
      Pmax: 560, Voc: 49.60, Vmp: 41.80, Isc: 14.22, Imp: 13.40,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0034,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono-PERC'
    },
    {
      id: 'solarworld_sw350xl_mono', manufacturer: 'SolarWorld', model: 'Sunmodule SW 350 XL mono',
      Pmax: 350, Voc: 48.00, Vmp: 38.40, Isc: 9.82, Imp: 9.17,
      coeffVoc: -0.0029, coeffIsc: 0.00040, coeffPmax: -0.0043,
      NOCT: 46, cells: 72, preloaded: true,
      note: 'Mono-Si, Q1/2017, IEC 1000V, Series Fuse 25A'
    },
    {
      id: 'astronergy_chsm72n_580', manufacturer: 'Astronergy', model: 'CHSM72N(DG)F-HC-580',
      Pmax: 580, Voc: 52.30, Vmp: 43.95, Isc: 13.98, Imp: 13.20,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0034,
      NOCT: 41, cells: 72, preloaded: true,
      note: 'N-type HJT bifacial, NMOT 41C, 1500V system, Series Fuse 25A'
    },
    {
      id: 'ja_jam72d00_365bp', manufacturer: 'JA Solar', model: 'JAM72D00-365/BP',
      Pmax: 365, Voc: 48.15, Vmp: 40.25, Isc: 9.74, Imp: 9.07,
      coeffVoc: -0.0028, coeffIsc: 0.00048, coeffPmax: -0.0037,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono bifacial PERC, IEC 61215/61730'
    },
    {
      id: 'jinko_jkm530_72hl4v', manufacturer: 'Jinko Solar', model: 'JKM520-540M-72HL4-V',
      Pmax: 530, Voc: 49.32, Vmp: 41.38, Isc: 13.60, Imp: 12.81,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono-PERC, 520-540W range, IEC 1500V'
    },
    {
      id: 'jinko_jkm525_72hl4_bdvp', manufacturer: 'Jinko Solar', model: 'JKM515-535M-72HL4-BDVP',
      Pmax: 525, Voc: 49.56, Vmp: 41.48, Isc: 13.47, Imp: 12.66,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0035,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Tiger Pro mono bifacial PERC, 515-535W range, IEC 1500V'
    },
    {
      id: 'risen_rsm144_9_535m', manufacturer: 'Risen Energy', model: 'RSM144-9-525-545M',
      Pmax: 535, Voc: 49.68, Vmp: 41.80, Isc: 13.60, Imp: 12.80,
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0034,
      NOCT: 45, cells: 72, preloaded: true,
      note: 'Mono-PERC half-cell, 525-545W range'
    },
    {
      id: 'trina_vertex_n_neg19rc_610', manufacturer: 'Trina Solar', model: 'Vertex N TSM-NEG19RC.20 610W',
      Pmax: 610, Voc: 47.90, Vmp: 39.84, Isc: 16.12, Imp: 15.31,
      coeffVoc: -0.0025, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 42, cells: 66, preloaded: true,
      note: 'N-type TOPCon bifacial, 595-625W range mid, IEC 1500V, Series Fuse 35A'
    },
    {
      id: 'astronergy_chsm78n_640', manufacturer: 'Astronergy', model: 'CHSM78N(DG)F-BH 640W',
      Pmax: 640, Voc: 52.80, Vmp: 44.50, Isc: 15.35, Imp: 14.38,
      coeffVoc: -0.0025, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 42, cells: 78, preloaded: true,
      note: 'ASTRO N5, N-type HJT bifacial, 625-650W range, IEC 1500V, Series Fuse 35A'
    },
    {
      id: 'trina_tsm620neg19rc', manufacturer: 'Trina Solar', model: 'TSM-620NEG19RC.20',
      Pmax: 620, Voc: 48.50, Vmp: 40.24, Isc: 16.26, Imp: 15.41,
      coeffVoc: -0.0025, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 42, cells: 66, preloaded: true,
      note: 'N-type TOPCon bifacial, IEC 1500V, Series Fuse 35A'
    },
    {
      id: 'astronergy_chsm66rn_620', manufacturer: 'Astronergy', model: 'CHSM66RN(DG)F-BH-620',
      Pmax: 620, Voc: 49.04, Vmp: 41.56, Isc: 16.11, Imp: 14.92,
      coeffVoc: -0.0025, coeffIsc: 0.00048, coeffPmax: -0.0030,
      NOCT: 42, cells: 66, preloaded: true,
      note: 'N-type HJT bifacial 620W STC / 683.6W BNPI, 1500V system, Series Fuse 35A'
    }
  ];

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

  function _cleanText(value, maxLen) {
    if (typeof value !== 'string') value = String(value ?? '');
    return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen || 120);
  }

  function _toFiniteNumber(value) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function _normalizeISODate(value) {
    if (!value) return null;
    const ms = Date.parse(String(value));
    if (isNaN(ms)) return null;
    return new Date(ms).toISOString();
  }

  function _normalizeCoeff(value, min, max, fallback) {
    let n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) return fallback;
    // Accept both decimal form (-0.0026) and percent form (-0.26)
    if (Math.abs(n) > 0.05) n = n / 100;
    if (n < min || n > max) return fallback;
    return n;
  }

  function _normalizeBoundedNumber(value, min, max, fallback) {
    const n = _toFiniteNumber(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < min || n > max) return fallback;
    return n;
  }

  function _normalizeURL(value) {
    const cleaned = _cleanText(value || '', 400);
    if (!cleaned) return '';
    try {
      const u = new URL(cleaned);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.toString();
    } catch (_) {
      return '';
    }
  }

  function _normalizePanel(input, options) {
    const opts = options || {};
    if (!input || typeof input !== 'object') return null;
    const existing = opts.existing && typeof opts.existing === 'object' ? opts.existing : null;
    const nowISO = opts.nowISO || new Date().toISOString();

    const manufacturer = _cleanText(input.manufacturer, 80);
    const model = _cleanText(input.model, 120);
    if (!manufacturer || !model) return null;

    const Pmax = _toFiniteNumber(input.Pmax);
    const Voc = _toFiniteNumber(input.Voc);
    const Vmp = _toFiniteNumber(input.Vmp);
    const Isc = _toFiniteNumber(input.Isc);
    const Imp = _toFiniteNumber(input.Imp);
    const NOCT = _toFiniteNumber(input.NOCT);
    const NMOTraw = _toFiniteNumber(input.NMOT);
    const cellsRaw = _toFiniteNumber(input.cells);

    if (![Pmax, Voc, Vmp, Isc, Imp, NOCT].every(Number.isFinite)) return null;
    if (Pmax <= 0 || Voc <= 0 || Vmp <= 0 || Isc <= 0 || Imp <= 0) return null;
    if (Vmp > Voc || Imp > Isc) return null;
    if (NOCT < 20 || NOCT > 80) return null;

    const coeffVoc = _normalizeCoeff(input.coeffVoc, -0.02, 0, -0.0026);
    const coeffIsc = _normalizeCoeff(input.coeffIsc, 0, 0.01, 0.00048);
    const coeffPmax = _normalizeCoeff(input.coeffPmax, -0.02, 0, -0.0030);
    const coeffVmp = _normalizeCoeff(input.coeffVmp, -0.02, 0, coeffVoc);
    const coeffImp = _normalizeCoeff(input.coeffImp, -0.01, 0.01, coeffIsc);
    const NMOT = Number.isFinite(NMOTraw) ? NMOTraw : NOCT;
    if (NMOT < 20 || NMOT > 80) return null;

    const seriesFuseA = _normalizeBoundedNumber(input.seriesFuseA, 1, 100, null);
    const maxSystemV = _normalizeBoundedNumber(input.maxSystemV, 100, 2000, 1500);
    const datasheetUrl = _normalizeURL(input.datasheetUrl || (existing && existing.datasheetUrl));
    const datasheetRev = _cleanText(input.datasheetRev || '', 80);
    const tolerancePlusPct = _normalizeBoundedNumber(input.tolerancePlusPct, 0, 10, 0);
    const toleranceMinusPct = _normalizeBoundedNumber(input.toleranceMinusPct, 0, 10, 0);

    let id = _cleanText(input.id || '', 80).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
    if (!id) id = generateId(manufacturer, model);

    const cells = Number.isFinite(cellsRaw) ? Math.round(cellsRaw) : 60;
    if (cells < 1 || cells > 300) return null;

    const createdAt = _normalizeISODate(input.createdAt)
      || _normalizeISODate(existing && existing.createdAt)
      || nowISO;
    const updatedAt = _normalizeISODate(input.updatedAt)
      || _normalizeISODate(existing && existing.updatedAt)
      || createdAt;

    return {
      id,
      manufacturer,
      model,
      Pmax: Number(Pmax.toFixed(3)),
      Voc: Number(Voc.toFixed(3)),
      Vmp: Number(Vmp.toFixed(3)),
      Isc: Number(Isc.toFixed(3)),
      Imp: Number(Imp.toFixed(3)),
      coeffVoc: Number(coeffVoc.toFixed(6)),
      coeffIsc: Number(coeffIsc.toFixed(6)),
      coeffPmax: Number(coeffPmax.toFixed(6)),
      coeffVmp: Number(coeffVmp.toFixed(6)),
      coeffImp: Number(coeffImp.toFixed(6)),
      NOCT: Number(NOCT.toFixed(2)),
      NMOT: Number(NMOT.toFixed(2)),
      seriesFuseA: Number.isFinite(seriesFuseA) ? Number(seriesFuseA.toFixed(2)) : null,
      maxSystemV: Number(maxSystemV.toFixed(0)),
      datasheetUrl,
      datasheetRev,
      tolerancePlusPct: Number(tolerancePlusPct.toFixed(2)),
      toleranceMinusPct: Number(toleranceMinusPct.toFixed(2)),
      cells,
      preloaded: !!opts.allowPreloaded && input.preloaded === true,
      note: _cleanText(input.note || '', 240),
      createdAt,
      updatedAt,
      _deleted: false,
      deletedAt: null,
    };
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _save(panels) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }

  function init() {
    if (!_load()) {
      const nowISO = new Date().toISOString();
      _save(PRELOADED.map(p => ({
        ...p,
        createdAt: p.createdAt || nowISO,
        updatedAt: p.updatedAt || nowISO,
        _deleted: false,
        deletedAt: null,
      })));
    }
  }

  function _withDefaults(panel) {
    if (!panel || typeof panel !== 'object') return panel;
    const coeffVoc = _normalizeCoeff(panel.coeffVoc, -0.02, 0, -0.0026);
    const coeffIsc = _normalizeCoeff(panel.coeffIsc, 0, 0.01, 0.00048);
    const coeffPmax = _normalizeCoeff(panel.coeffPmax, -0.02, 0, -0.0030);
    const coeffVmp = _normalizeCoeff(panel.coeffVmp, -0.02, 0, coeffVoc);
    const coeffImp = _normalizeCoeff(panel.coeffImp, -0.01, 0.01, coeffIsc);
    const NOCT = _normalizeBoundedNumber(panel.NOCT, 20, 80, 43);
    const NMOT = _normalizeBoundedNumber(panel.NMOT, 20, 80, NOCT);
    const maxSystemV = _normalizeBoundedNumber(panel.maxSystemV, 100, 2000, 1500);
    const tolerancePlusPct = _normalizeBoundedNumber(panel.tolerancePlusPct, 0, 10, 0);
    const toleranceMinusPct = _normalizeBoundedNumber(panel.toleranceMinusPct, 0, 10, 0);
    return {
      ...panel,
      coeffVoc: Number(coeffVoc.toFixed(6)),
      coeffIsc: Number(coeffIsc.toFixed(6)),
      coeffPmax: Number(coeffPmax.toFixed(6)),
      coeffVmp: Number(coeffVmp.toFixed(6)),
      coeffImp: Number(coeffImp.toFixed(6)),
      NOCT: Number(NOCT.toFixed(2)),
      NMOT: Number(NMOT.toFixed(2)),
      seriesFuseA: _normalizeBoundedNumber(panel.seriesFuseA, 1, 100, null),
      maxSystemV: Number(maxSystemV.toFixed(0)),
      datasheetUrl: _normalizeURL(panel.datasheetUrl || ''),
      datasheetRev: _cleanText(panel.datasheetRev || '', 80),
      tolerancePlusPct: Number(tolerancePlusPct.toFixed(2)),
      toleranceMinusPct: Number(toleranceMinusPct.toFixed(2)),
    };
  }

  function getAll() {
    const panels = _load() || [];
    return panels.map(_withDefaults).sort((a, b) => {
      const m = a.manufacturer.localeCompare(b.manufacturer);
      return m !== 0 ? m : a.model.localeCompare(b.model);
    });
  }

  function getById(id) {
    return getAll().find(p => p.id === id) || null;
  }

  function save(panel) {
    const panels = _load() || [];
    const rawId = _cleanText((panel && panel.id) || '', 80)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
    const idx = rawId ? panels.findIndex(p => p.id === rawId) : -1;
    const existing = idx >= 0 ? panels[idx] : null;
    const nowISO = new Date().toISOString();
    const normalized = _normalizePanel(panel, {
      allowPreloaded: panel && panel.preloaded === true,
      existing,
      nowISO
    });
    if (!normalized) return false;
    normalized.createdAt = (existing && existing.createdAt) || normalized.createdAt || nowISO;
    normalized.updatedAt = nowISO;
    normalized._deleted = false;
    normalized.deletedAt = null;
    if (idx >= 0) panels[idx] = normalized;
    else panels.push(normalized);
    _save(panels);
    if (typeof FirebaseSync !== 'undefined' && FirebaseSync && typeof FirebaseSync.onPanelSaved === 'function') {
      FirebaseSync.onPanelSaved(normalized);
    }
    return true;
  }

  function remove(id) {
    const all = _load() || [];
    const existed = all.some(p => p.id === id);
    const panels = all.filter(p => p.id !== id);
    _save(panels);
    if (existed && typeof FirebaseSync !== 'undefined' && FirebaseSync && typeof FirebaseSync.onPanelDeleted === 'function') {
      FirebaseSync.onPanelDeleted(id);
    }
  }

  function exportJSON() {
    return JSON.stringify(getAll(), null, 2);
  }

  function importJSON(json) {
    const report = { ok: false, total: 0, added: 0, updated: 0, rejected: 0, error: '' };
    _lastImportReport = report;
    try {
      const incoming = JSON.parse(json);
      if (!Array.isArray(incoming)) throw new Error('JSON root must be an array');
      if (incoming.length > MAX_IMPORT_PANELS) throw new Error(`Too many panels in one import (max ${MAX_IMPORT_PANELS})`);

      const existing = _load() || [];
      const map = {};
      existing.forEach(p => { if (p && p.id) map[p.id] = p; });

      report.total = incoming.length;
      incoming.forEach(raw => {
        const normalized = _normalizePanel(raw, {
          allowPreloaded: false,
          existing: null
        });
        if (!normalized) {
          report.rejected++;
          return;
        }
        const existingRecord = map[normalized.id] || null;
        if (existingRecord && existingRecord.createdAt) {
          normalized.createdAt = existingRecord.createdAt;
        }
        if (map[normalized.id]) report.updated++;
        else report.added++;
        map[normalized.id] = normalized;
      });

      if (report.added === 0 && report.updated === 0) {
        report.error = 'No valid panel records found in file';
        report.ok = false;
        _lastImportReport = report;
        return report;
      }

      _save(Object.values(map));
      if (typeof FirebaseSync !== 'undefined'
        && FirebaseSync
        && typeof FirebaseSync.isSignedIn === 'function'
        && FirebaseSync.isSignedIn()
        && typeof FirebaseSync.syncPanels === 'function') {
        FirebaseSync.syncPanels({ silent: true }).catch(() => {});
      }
      report.ok = true;
      _lastImportReport = report;
      return report;
    } catch (err) {
      report.error = err && err.message ? err.message : 'Invalid JSON file';
      report.ok = false;
      _lastImportReport = report;
      return report;
    }
  }

  function getLastImportReport() {
    return _lastImportReport;
  }

  function generateId(manufacturer, model) {
    return (manufacturer + '_' + model)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 60);
  }

  function _downloadJSON(filename, jsonText) {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function _withCatalogStore() {
    if (typeof CatalogStore === 'undefined' || !CatalogStore) return null;
    return CatalogStore;
  }

  async function resetToBundledDefaults() {
    const nowISO = new Date().toISOString();
    let source = 'preloaded';
    let rows = [];

    try {
      if (typeof fetch === 'function') {
        const res = await fetch(PV_SEED_PATH);
        if (res && res.ok) {
          const payload = await res.json();
          const modules = Array.isArray(payload)
            ? payload
            : (payload && typeof payload === 'object' && Array.isArray(payload.modules) ? payload.modules : []);
          rows = modules
            .map(raw => _normalizePanel(raw, { allowPreloaded: true, nowISO }))
            .filter(Boolean)
            .map(p => ({
              ...p,
              preloaded: true,
              createdAt: nowISO,
              updatedAt: nowISO,
              _deleted: false,
              deletedAt: null,
            }));
          if (rows.length) source = 'data/pv-modules.json';
        }
      }
    } catch (_) {}

    if (!rows.length) {
      rows = PRELOADED
        .map(raw => _normalizePanel(raw, { allowPreloaded: true, nowISO }))
        .filter(Boolean)
        .map(p => ({
          ...p,
          preloaded: true,
          createdAt: nowISO,
          updatedAt: nowISO,
          _deleted: false,
          deletedAt: null,
        }));
    }

    if (!rows.length) return { ok: false, error: 'No bundled PV module records available' };
    _save(rows);
    _seedAttempted = true;

    if (typeof FirebaseSync !== 'undefined'
      && FirebaseSync
      && typeof FirebaseSync.isSignedIn === 'function'
      && FirebaseSync.isSignedIn()
      && typeof FirebaseSync.syncPanels === 'function') {
      FirebaseSync.syncPanels({ silent: true }).catch(() => {});
    }

    return { ok: true, count: rows.length, source };
  }

  async function _ensurePVSeedFromCatalog() {
    if (_seedAttempted) return;
    _seedAttempted = true;
    try {
      if (typeof fetch !== 'function') return;
      const res = await fetch(PV_SEED_PATH);
      if (!res || !res.ok) return;
      const payload = await res.json();
      const modules = Array.isArray(payload)
        ? payload
        : (payload && typeof payload === 'object' && Array.isArray(payload.modules) ? payload.modules : []);
      if (!modules.length) return;

      const existing = _load() || [];
      const map = {};
      existing.forEach(p => { if (p && p.id) map[p.id] = p; });
      let added = 0;
      modules.forEach(raw => {
        const normalized = _normalizePanel(raw, { allowPreloaded: true });
        if (!normalized || map[normalized.id]) return;
        map[normalized.id] = normalized;
        added += 1;
      });
      if (added > 0) {
        _save(Object.values(map));
      }
    } catch (_) {}
  }

  // --- RENDER PAGE ---
  function renderPage(container) {
    if (!container) return;
    if (!DB_TABS.includes(_activeTab)) _activeTab = 'pv';

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128230; Database</div>
        <div class="info-box" id="db-summary">
          PV modules: ${getAll().length} &nbsp;|&nbsp; Inverters: loading... &nbsp;|&nbsp; Batteries: loading...
        </div>

        <div class="btn-group" style="margin-bottom:12px">
          <button class="btn btn-sm ${_activeTab === 'pv' ? 'btn-primary' : 'btn-secondary'}" id="db-tab-pv">PV Modules</button>
          <button class="btn btn-sm ${_activeTab === 'inverter' ? 'btn-primary' : 'btn-secondary'}" id="db-tab-inv">Inverters</button>
          <button class="btn btn-sm ${_activeTab === 'battery' ? 'btn-primary' : 'btn-secondary'}" id="db-tab-bat">Batteries</button>
        </div>

        <div class="btn-group" style="margin-bottom:12px">
          <button class="btn btn-primary btn-sm" id="db-add-btn"></button>
          <button class="btn btn-secondary btn-sm" id="db-export-btn">&#8659; Export JSON</button>
          <button class="btn btn-secondary btn-sm" id="db-import-btn">&#8657; Import JSON</button>
        </div>

        <div class="form-group">
          <input type="search" class="form-input" id="db-search" style="margin-bottom:0" />
        </div>

        <div id="db-list"></div>
      </div>
    `;

    const setTab = tab => {
      _activeTab = tab;
      renderPage(container);
    };
    container.querySelector('#db-tab-pv').addEventListener('click', () => setTab('pv'));
    container.querySelector('#db-tab-inv').addEventListener('click', () => setTab('inverter'));
    container.querySelector('#db-tab-bat').addEventListener('click', () => setTab('battery'));

    _bindActionButtons(container);
    _renderActiveList(container, '');
    container.querySelector('#db-search').addEventListener('input', e => _renderActiveList(container, e.target.value || ''));

    _updateSummary(container);
    _ensurePVSeedFromCatalog().then(() => {
      if (document.getElementById('main-content') === container && _activeTab === 'pv') {
        _renderActiveList(container, container.querySelector('#db-search').value || '');
        _updateSummary(container);
      }
    }).catch(() => {});
  }

  function _renderList(container, panels) {
    const list = container.querySelector('#db-list');
    if (!panels.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128230;</div><div>No panels found</div></div>`;
      return;
    }
    list.innerHTML = panels.map(p => `
      <div class="panel-card ${p.preloaded ? 'preloaded' : ''}">
        <div class="panel-card-info">
          <div class="panel-card-name">
            ${_esc(p.manufacturer)} ${_esc(p.model)}
            ${p.preloaded ? '<span class="tag-preloaded">Built-in</span>' : ''}
          </div>
          <div class="panel-card-sub">${_esc(p.note || '')}</div>
          <div class="panel-card-specs">
            <span class="spec-chip">${p.Pmax}W</span>
            <span class="spec-chip">Voc ${p.Voc}V</span>
            <span class="spec-chip">Vmp ${p.Vmp}V</span>
            <span class="spec-chip">Isc ${p.Isc}A</span>
            <span class="spec-chip">Imp ${p.Imp}A</span>
            <span class="spec-chip">NOCT ${p.NOCT}&deg;C</span>
            <span class="spec-chip">NMOT ${p.NMOT}&deg;C</span>
            <span class="spec-chip">Max ${p.maxSystemV}V</span>
            ${Number.isFinite(p.seriesFuseA) ? `<span class="spec-chip">Series Fuse ${p.seriesFuseA}A</span>` : ''}
            ${(p.tolerancePlusPct || p.toleranceMinusPct) ? `<span class="spec-chip">Tol +${p.tolerancePlusPct}% / -${p.toleranceMinusPct}%</span>` : ''}
          </div>
          <div class="text-sm text-muted mt-4">
            &#945;Voc: ${(p.coeffVoc * 100).toFixed(3)}%/&deg;C &nbsp;
            &#945;Isc: +${(p.coeffIsc * 100).toFixed(3)}%/&deg;C &nbsp;
            &#945;Pmax: ${(p.coeffPmax * 100).toFixed(3)}%/&deg;C &nbsp;
            &#945;Vmp: ${(p.coeffVmp * 100).toFixed(3)}%/&deg;C &nbsp;
            &#945;Imp: ${(p.coeffImp * 100).toFixed(3)}%/&deg;C
          </div>
          ${p.datasheetUrl ? `<div class="text-sm text-muted mt-4">Datasheet: <a href="${_esc(p.datasheetUrl)}" target="_blank" rel="noopener noreferrer">${_esc(p.datasheetRev || p.datasheetUrl)}</a></div>` : ''}
        </div>
        <div class="panel-card-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${_esc(p.id)}">Edit</button>
          ${!p.preloaded ? `<button class="btn btn-danger btn-sm" data-del="${_esc(p.id)}">Del</button>` : ''}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => _showPanelForm(getById(btn.dataset.edit)));
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this panel?')) {
          remove(btn.dataset.del);
          renderPage(container);
          App.toast('Panel deleted');
        }
      });
    });
  }

  function _bindActionButtons(container) {
    const search = container.querySelector('#db-search');
    const addBtn = container.querySelector('#db-add-btn');
    const exportBtn = container.querySelector('#db-export-btn');
    const importBtn = container.querySelector('#db-import-btn');

    if (_activeTab === 'pv') {
      search.placeholder = 'Search PV modules...';
      addBtn.textContent = '+ Add PV Module';
      addBtn.onclick = () => _showPanelForm(null);
      exportBtn.onclick = () => _doExport();
      importBtn.onclick = () => _doImport();
      return;
    }

    if (_activeTab === 'inverter') {
      search.placeholder = 'Search inverters (manufacturer, model, topology)...';
      addBtn.textContent = '+ Add Inverter';
      addBtn.onclick = async () => {
        const store = await _ensureCatalogReady(true);
        if (!store) return;
        _showInverterForm(null);
      };
      exportBtn.onclick = async () => {
        const store = await _ensureCatalogReady(true);
        if (!store) return;
        _downloadJSON('solarpv_inverters.json', store.exportInvertersJSON());
        App.toast('Inverters exported', 'success');
      };
      importBtn.onclick = async () => {
        const store = await _ensureCatalogReady(true);
        if (!store) return;
        _pickJSONFile(text => {
          const report = store.importInvertersJSON(text);
          if (report && report.ok) {
            App.toast(`Inverters imported (${report.added} added, ${report.updated} updated${report.rejected ? `, ${report.rejected} rejected` : ''})`, report.rejected ? 'warning' : 'success');
            renderPage(document.getElementById('main-content'));
          } else {
            App.toast(report && report.error ? report.error : 'Invalid JSON file', 'error');
          }
        });
      };
      return;
    }

    search.placeholder = 'Search batteries (manufacturer, model, chemistry)...';
    addBtn.textContent = '+ Add Battery';
    addBtn.onclick = async () => {
      const store = await _ensureCatalogReady(true);
      if (!store) return;
      _showBatteryForm(null);
    };
    exportBtn.onclick = async () => {
      const store = await _ensureCatalogReady(true);
      if (!store) return;
      _downloadJSON('solarpv_batteries.json', store.exportBatteriesJSON());
      App.toast('Batteries exported', 'success');
    };
    importBtn.onclick = async () => {
      const store = await _ensureCatalogReady(true);
      if (!store) return;
      _pickJSONFile(text => {
        const report = store.importBatteriesJSON(text);
        if (report && report.ok) {
          App.toast(`Batteries imported (${report.added} added, ${report.updated} updated${report.rejected ? `, ${report.rejected} rejected` : ''})`, report.rejected ? 'warning' : 'success');
          renderPage(document.getElementById('main-content'));
        } else {
          App.toast(report && report.error ? report.error : 'Invalid JSON file', 'error');
        }
      });
    };
  }

  function _pickJSONFile(onText) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => onText(String(ev.target && ev.target.result ? ev.target.result : ''));
      reader.readAsText(file);
    };
    input.click();
  }

  async function _ensureCatalogReady(showToastOnError) {
    const store = _withCatalogStore();
    if (!store || typeof store.ensureLoaded !== 'function') {
      if (showToastOnError) App.toast('Catalog store not available', 'error');
      return null;
    }
    try {
      await store.ensureLoaded();
      const state = typeof store.getState === 'function' ? store.getState() : null;
      if (state && state.loadError) {
        if (showToastOnError) App.toast(state.loadError, 'error');
        return null;
      }
      return store;
    } catch (err) {
      if (showToastOnError) App.toast(err && err.message ? err.message : 'Catalog load failed', 'error');
      return null;
    }
  }

  function _renderActiveList(container, queryRaw) {
    const q = String(queryRaw || '').toLowerCase().trim();
    if (_activeTab === 'pv') {
      const filtered = getAll().filter(p =>
        String(p.manufacturer || '').toLowerCase().includes(q)
        || String(p.model || '').toLowerCase().includes(q)
        || String(p.id || '').toLowerCase().includes(q)
        || String(p.note || '').toLowerCase().includes(q)
      );
      _renderList(container, filtered);
      return;
    }
    if (_activeTab === 'inverter') {
      _renderInverterList(container, q);
      return;
    }
    _renderBatteryList(container, q);
  }

  async function _renderInverterList(container, q) {
    const list = container.querySelector('#db-list');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9889;</div><div>Loading inverter database...</div></div>';
    const store = await _ensureCatalogReady(false);
    if (!store || _activeTab !== 'inverter') {
      if (_activeTab === 'inverter') {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9889;</div><div>Inverter database unavailable</div></div>';
      }
      return;
    }
    const rows = (store.getAllInverters() || []).filter(x =>
      String(x.manufacturer || '').toLowerCase().includes(q)
      || String(x.model || '').toLowerCase().includes(q)
      || String(x.id || '').toLowerCase().includes(q)
      || String(x.topology || '').toLowerCase().includes(q)
      || String(x.note || '').toLowerCase().includes(q)
    );
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9889;</div><div>No inverters found</div></div>';
      return;
    }
    list.innerHTML = rows.map(inv => `
      <div class="panel-card">
        <div class="panel-card-info">
          <div class="panel-card-name">${_esc(inv.manufacturer)} ${_esc(inv.model)}</div>
          <div class="panel-card-sub">${_esc(inv.note || inv.id || '')}</div>
          <div class="panel-card-specs">
            <span class="spec-chip">${_esc(inv.topology || 'grid-tie')}</span>
            <span class="spec-chip">AC ${_esc(inv.acRated_kW)} kW</span>
            ${inv.maxPv_kW ? `<span class="spec-chip">PV ${_esc(inv.maxPv_kW)} kW</span>` : ''}
            ${inv.batteryBus_V ? `<span class="spec-chip">Battery ${_esc(inv.batteryBus_V)} V</span>` : ''}
            ${inv.maxDcVoc_V ? `<span class="spec-chip">Voc max ${_esc(inv.maxDcVoc_V)} V</span>` : ''}
            ${(inv.mpptMin_V || inv.mpptMax_V) ? `<span class="spec-chip">MPPT ${_esc(inv.mpptMin_V)}-${_esc(inv.mpptMax_V)} V</span>` : ''}
            ${inv.mpptCount ? `<span class="spec-chip">${_esc(inv.mpptCount)} MPPT</span>` : ''}
            ${inv.maxCurrentPerMppt_A ? `<span class="spec-chip">${_esc(inv.maxCurrentPerMppt_A)} A/MPPT</span>` : ''}
          </div>
          ${inv.datasheetUrl ? `<div class="text-sm text-muted mt-4">Datasheet: <a href="${_esc(inv.datasheetUrl)}" target="_blank" rel="noopener noreferrer">${_esc(inv.datasheetRev || inv.datasheetUrl)}</a></div>` : ''}
        </div>
        <div class="panel-card-actions">
          <button class="btn btn-secondary btn-sm" data-edit-inv="${_esc(inv.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del-inv="${_esc(inv.id)}">Del</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit-inv]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = (store.getAllInverters() || []).find(x => x.id === btn.dataset.editInv);
        if (!row) return;
        _showInverterForm(row);
      });
    });
    list.querySelectorAll('[data-del-inv]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this inverter model?')) return;
        store.removeInverter(btn.dataset.delInv);
        renderPage(container);
        App.toast('Inverter deleted', 'success');
      });
    });
  }

  async function _renderBatteryList(container, q) {
    const list = container.querySelector('#db-list');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128267;</div><div>Loading battery database...</div></div>';
    const store = await _ensureCatalogReady(false);
    if (!store || _activeTab !== 'battery') {
      if (_activeTab === 'battery') {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128267;</div><div>Battery database unavailable</div></div>';
      }
      return;
    }
    const rows = (store.getAllBatteries() || []).filter(x =>
      String(x.manufacturer || '').toLowerCase().includes(q)
      || String(x.model || '').toLowerCase().includes(q)
      || String(x.id || '').toLowerCase().includes(q)
      || String(x.chemistry || '').toLowerCase().includes(q)
      || String(x.note || '').toLowerCase().includes(q)
    );
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128267;</div><div>No batteries found</div></div>';
      return;
    }
    list.innerHTML = rows.map(b => `
      <div class="panel-card">
        <div class="panel-card-info">
          <div class="panel-card-name">${_esc(b.manufacturer)} ${_esc(b.model)}</div>
          <div class="panel-card-sub">${_esc(b.note || b.id || '')}</div>
          <div class="panel-card-specs">
            <span class="spec-chip">${_esc(b.chemistry || 'battery')}</span>
            <span class="spec-chip">${_esc(b.nominalV)} V</span>
            <span class="spec-chip">${_esc(b.capacityAh)} Ah</span>
            <span class="spec-chip">DoD ${Math.round((Number(b.recommendedDod) || 0) * 100)}%</span>
            ${b.continuousCharge_A ? `<span class="spec-chip">Charge ${_esc(b.continuousCharge_A)} A</span>` : ''}
            ${b.continuousDischarge_A ? `<span class="spec-chip">Discharge ${_esc(b.continuousDischarge_A)} A</span>` : ''}
            ${b.peakDischarge_A ? `<span class="spec-chip">Peak ${_esc(b.peakDischarge_A)} A/${_esc(b.peakDuration_s || 0)}s</span>` : ''}
            <span class="spec-chip">${_esc(b.tempMinC)} to ${_esc(b.tempMaxC)} &deg;C</span>
          </div>
          ${b.datasheetUrl ? `<div class="text-sm text-muted mt-4">Datasheet: <a href="${_esc(b.datasheetUrl)}" target="_blank" rel="noopener noreferrer">${_esc(b.datasheetRev || b.datasheetUrl)}</a></div>` : ''}
        </div>
        <div class="panel-card-actions">
          <button class="btn btn-secondary btn-sm" data-edit-bat="${_esc(b.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del-bat="${_esc(b.id)}">Del</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit-bat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = (store.getAllBatteries() || []).find(x => x.id === btn.dataset.editBat);
        if (!row) return;
        _showBatteryForm(row);
      });
    });
    list.querySelectorAll('[data-del-bat]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this battery model?')) return;
        store.removeBattery(btn.dataset.delBat);
        renderPage(container);
        App.toast('Battery deleted', 'success');
      });
    });
  }

  function _updateSummary(container) {
    const el = container.querySelector('#db-summary');
    if (!el) return;
    const pvCount = getAll().length;
    const store = _withCatalogStore();
    if (!store || typeof store.getState !== 'function') {
      el.textContent = `PV modules: ${pvCount} | Inverters: n/a | Batteries: n/a`;
      return;
    }
    const state = store.getState();
    const invCount = Number.isFinite(state.inverterCount) ? state.inverterCount : 0;
    const batCount = Number.isFinite(state.batteryCount) ? state.batteryCount : 0;
    const status = state.loading
      ? 'Catalog syncing...'
      : (state.loadError ? `Catalog warning: ${state.loadError}` : 'Catalog ready');
    el.textContent = `PV modules: ${pvCount} | Inverters: ${invCount} | Batteries: ${batCount} | ${status}`;
    if (!state.loaded && !state.loading) {
      _ensureCatalogReady(false).then(() => {
        if (document.getElementById('main-content') === container) {
          _updateSummary(container);
          if (_activeTab !== 'pv') _renderActiveList(container, container.querySelector('#db-search').value || '');
        }
      }).catch(() => {});
    }
  }

  function _showInverterForm(inverter) {
    const isNew = !inverter;
    const inv = inverter || {
      id: '',
      manufacturer: '',
      model: '',
      topology: 'hybrid',
      acRated_kW: '',
      surge_kW: '',
      surge_s: '',
      batteryBus_V: 48,
      maxCharge_A: '',
      maxDischarge_A: '',
      maxPv_kW: '',
      maxDcVoc_V: '',
      mpptMin_V: '',
      mpptMax_V: '',
      mpptCount: '',
      maxCurrentPerMppt_A: '',
      supportedProfiles: ['offgrid', 'ceb_2025', 'leco_2025'],
      utilityListed: { ceb_2025: false, leco_2025: false },
      listingSource: { ceb_2025: '', leco_2025: '' },
      datasheetRev: '',
      datasheetUrl: '',
      sourceConfidence: 'unknown',
      note: '',
    };

    App.showModal(isNew ? 'Add Inverter' : `Edit Inverter: ${inv.manufacturer} ${inv.model}`, `
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">Manufacturer</label><input class="form-input" id="if-mfr" value="${_esc(inv.manufacturer)}" /></div>
        <div class="form-group"><label class="form-label">Model</label><input class="form-input" id="if-model" value="${_esc(inv.model)}" /></div>
        <div class="form-group"><label class="form-label">Topology</label>
          <select class="form-select" id="if-topo">
            <option value="grid-tie" ${inv.topology === 'grid-tie' ? 'selected' : ''}>Grid-Tie</option>
            <option value="hybrid" ${inv.topology === 'hybrid' ? 'selected' : ''}>Hybrid</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">AC Rated (kW)</label><input class="form-input" id="if-ac" type="number" step="0.01" value="${_esc(inv.acRated_kW)}" /></div>
        <div class="form-group"><label class="form-label">Surge (kW)</label><input class="form-input" id="if-surge" type="number" step="0.01" value="${_esc(inv.surge_kW)}" /></div>
        <div class="form-group"><label class="form-label">Surge Duration (s)</label><input class="form-input" id="if-surges" type="number" step="0.1" value="${_esc(inv.surge_s)}" /></div>
        <div class="form-group"><label class="form-label">Battery Bus (V)</label><input class="form-input" id="if-bv" type="number" step="1" value="${_esc(inv.batteryBus_V)}" /></div>
        <div class="form-group"><label class="form-label">Max Charge (A)</label><input class="form-input" id="if-cha" type="number" step="0.1" value="${_esc(inv.maxCharge_A)}" /></div>
        <div class="form-group"><label class="form-label">Max Discharge (A)</label><input class="form-input" id="if-disa" type="number" step="0.1" value="${_esc(inv.maxDischarge_A)}" /></div>
        <div class="form-group"><label class="form-label">Max PV DC (kW)</label><input class="form-input" id="if-maxpv" type="number" step="0.01" value="${_esc(inv.maxPv_kW)}" /></div>
        <div class="form-group"><label class="form-label">Max DC Voc (V)</label><input class="form-input" id="if-voc" type="number" step="0.1" value="${_esc(inv.maxDcVoc_V)}" /></div>
        <div class="form-group"><label class="form-label">MPPT Min (V)</label><input class="form-input" id="if-mmin" type="number" step="0.1" value="${_esc(inv.mpptMin_V)}" /></div>
        <div class="form-group"><label class="form-label">MPPT Max (V)</label><input class="form-input" id="if-mmax" type="number" step="0.1" value="${_esc(inv.mpptMax_V)}" /></div>
        <div class="form-group"><label class="form-label">MPPT Count</label><input class="form-input" id="if-mcnt" type="number" step="1" value="${_esc(inv.mpptCount)}" /></div>
        <div class="form-group"><label class="form-label">Max Current / MPPT (A)</label><input class="form-input" id="if-mcur" type="number" step="0.1" value="${_esc(inv.maxCurrentPerMppt_A)}" /></div>
      </div>
      <div class="form-group">
        <label class="form-label">Supported Profiles</label>
        <div class="btn-group">
          <label><input type="checkbox" id="if-pro-off" ${Array.isArray(inv.supportedProfiles) && inv.supportedProfiles.includes('offgrid') ? 'checked' : ''} /> Offgrid</label>
          <label><input type="checkbox" id="if-pro-ceb" ${Array.isArray(inv.supportedProfiles) && inv.supportedProfiles.includes('ceb_2025') ? 'checked' : ''} /> CEB 2025</label>
          <label><input type="checkbox" id="if-pro-leco" ${Array.isArray(inv.supportedProfiles) && inv.supportedProfiles.includes('leco_2025') ? 'checked' : ''} /> LECO 2025</label>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">CEB Listed</label><input type="checkbox" id="if-ceb-list" ${inv.utilityListed && inv.utilityListed.ceb_2025 ? 'checked' : ''} /></div>
        <div class="form-group"><label class="form-label">LECO Listed</label><input type="checkbox" id="if-leco-list" ${inv.utilityListed && inv.utilityListed.leco_2025 ? 'checked' : ''} /></div>
        <div class="form-group"><label class="form-label">CEB Listing Source</label><input class="form-input" id="if-ceb-src" value="${_esc(inv.listingSource && inv.listingSource.ceb_2025 ? inv.listingSource.ceb_2025 : '')}" /></div>
        <div class="form-group"><label class="form-label">LECO Listing Source</label><input class="form-input" id="if-leco-src" value="${_esc(inv.listingSource && inv.listingSource.leco_2025 ? inv.listingSource.leco_2025 : '')}" /></div>
        <div class="form-group"><label class="form-label">Datasheet URL</label><input class="form-input" id="if-url" value="${_esc(inv.datasheetUrl || '')}" /></div>
        <div class="form-group"><label class="form-label">Datasheet Revision</label><input class="form-input" id="if-rev" value="${_esc(inv.datasheetRev || '')}" /></div>
        <div class="form-group"><label class="form-label">Source Confidence</label>
          <select class="form-select" id="if-conf">
            <option value="high" ${inv.sourceConfidence === 'high' ? 'selected' : ''}>high</option>
            <option value="medium" ${inv.sourceConfidence === 'medium' ? 'selected' : ''}>medium</option>
            <option value="low" ${inv.sourceConfidence === 'low' ? 'selected' : ''}>low</option>
            <option value="unknown" ${!inv.sourceConfidence || inv.sourceConfidence === 'unknown' ? 'selected' : ''}>unknown</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="if-note" value="${_esc(inv.note || '')}" /></div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: 'close' },
      {
        label: isNew ? 'Add Inverter' : 'Save',
        cls: 'btn-primary',
        action: async () => {
          const store = await _ensureCatalogReady(true);
          if (!store) return false;
          const manufacturer = document.getElementById('if-mfr').value.trim();
          const model = document.getElementById('if-model').value.trim();
          if (!manufacturer || !model) {
            App.toast('Manufacturer and model required', 'error');
            return false;
          }
          const supportedProfiles = [];
          if (document.getElementById('if-pro-off').checked) supportedProfiles.push('offgrid');
          if (document.getElementById('if-pro-ceb').checked) supportedProfiles.push('ceb_2025');
          if (document.getElementById('if-pro-leco').checked) supportedProfiles.push('leco_2025');
          if (!supportedProfiles.length) supportedProfiles.push('offgrid');

          const payload = {
            id: isNew ? generateId(manufacturer, model) : inv.id,
            manufacturer,
            model,
            topology: document.getElementById('if-topo').value,
            acRated_kW: parseFloat(document.getElementById('if-ac').value),
            surge_kW: parseFloat(document.getElementById('if-surge').value),
            surge_s: parseFloat(document.getElementById('if-surges').value),
            batteryBus_V: parseFloat(document.getElementById('if-bv').value),
            maxCharge_A: parseFloat(document.getElementById('if-cha').value),
            maxDischarge_A: parseFloat(document.getElementById('if-disa').value),
            maxPv_kW: parseFloat(document.getElementById('if-maxpv').value),
            maxDcVoc_V: parseFloat(document.getElementById('if-voc').value),
            mpptMin_V: parseFloat(document.getElementById('if-mmin').value),
            mpptMax_V: parseFloat(document.getElementById('if-mmax').value),
            mpptCount: parseInt(document.getElementById('if-mcnt').value, 10),
            maxCurrentPerMppt_A: parseFloat(document.getElementById('if-mcur').value),
            supportedProfiles,
            utilityListed: {
              ceb_2025: !!document.getElementById('if-ceb-list').checked,
              leco_2025: !!document.getElementById('if-leco-list').checked,
            },
            listingSource: {
              ceb_2025: document.getElementById('if-ceb-src').value.trim(),
              leco_2025: document.getElementById('if-leco-src').value.trim(),
            },
            datasheetUrl: document.getElementById('if-url').value.trim(),
            datasheetRev: document.getElementById('if-rev').value.trim(),
            sourceConfidence: document.getElementById('if-conf').value,
            note: document.getElementById('if-note').value.trim(),
          };
          const saved = store.upsertInverter(payload);
          if (!saved) {
            App.toast('Invalid inverter data', 'error');
            return false;
          }
          App.closeModal();
          renderPage(document.getElementById('main-content'));
          App.toast(isNew ? 'Inverter added' : 'Inverter updated', 'success');
        }
      }
    ]);
  }

  function _showBatteryForm(battery) {
    const isNew = !battery;
    const bat = battery || {
      id: '',
      manufacturer: '',
      model: '',
      chemistry: 'lifepo4',
      nominalV: 48,
      capacityAh: 100,
      recommendedDod: 0.8,
      continuousCharge_A: 0,
      continuousDischarge_A: 0,
      peakDischarge_A: 0,
      peakDuration_s: 0,
      tempMinC: 0,
      tempMaxC: 50,
      datasheetRev: '',
      datasheetUrl: '',
      note: '',
    };

    App.showModal(isNew ? 'Add Battery' : `Edit Battery: ${bat.manufacturer} ${bat.model}`, `
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">Manufacturer</label><input class="form-input" id="bf-mfr" value="${_esc(bat.manufacturer)}" /></div>
        <div class="form-group"><label class="form-label">Model</label><input class="form-input" id="bf-model" value="${_esc(bat.model)}" /></div>
        <div class="form-group"><label class="form-label">Chemistry</label><input class="form-input" id="bf-chem" value="${_esc(bat.chemistry)}" placeholder="lifepo4 / tubular / leadacid" /></div>
        <div class="form-group"><label class="form-label">Nominal Voltage (V)</label><input class="form-input" id="bf-v" type="number" step="0.1" value="${_esc(bat.nominalV)}" /></div>
        <div class="form-group"><label class="form-label">Capacity (Ah)</label><input class="form-input" id="bf-ah" type="number" step="0.1" value="${_esc(bat.capacityAh)}" /></div>
        <div class="form-group"><label class="form-label">Recommended DoD (0-1)</label><input class="form-input" id="bf-dod" type="number" step="0.01" min="0.1" max="1" value="${_esc(bat.recommendedDod)}" /></div>
        <div class="form-group"><label class="form-label">Continuous Charge (A)</label><input class="form-input" id="bf-cha" type="number" step="0.1" value="${_esc(bat.continuousCharge_A)}" /></div>
        <div class="form-group"><label class="form-label">Continuous Discharge (A)</label><input class="form-input" id="bf-dis" type="number" step="0.1" value="${_esc(bat.continuousDischarge_A)}" /></div>
        <div class="form-group"><label class="form-label">Peak Discharge (A)</label><input class="form-input" id="bf-peak" type="number" step="0.1" value="${_esc(bat.peakDischarge_A)}" /></div>
        <div class="form-group"><label class="form-label">Peak Duration (s)</label><input class="form-input" id="bf-peaks" type="number" step="0.1" value="${_esc(bat.peakDuration_s)}" /></div>
        <div class="form-group"><label class="form-label">Temp Min (&deg;C)</label><input class="form-input" id="bf-tmin" type="number" step="0.1" value="${_esc(bat.tempMinC)}" /></div>
        <div class="form-group"><label class="form-label">Temp Max (&deg;C)</label><input class="form-input" id="bf-tmax" type="number" step="0.1" value="${_esc(bat.tempMaxC)}" /></div>
        <div class="form-group"><label class="form-label">Datasheet URL</label><input class="form-input" id="bf-url" value="${_esc(bat.datasheetUrl || '')}" /></div>
        <div class="form-group"><label class="form-label">Datasheet Revision</label><input class="form-input" id="bf-rev" value="${_esc(bat.datasheetRev || '')}" /></div>
      </div>
      <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="bf-note" value="${_esc(bat.note || '')}" /></div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: 'close' },
      {
        label: isNew ? 'Add Battery' : 'Save',
        cls: 'btn-primary',
        action: async () => {
          const store = await _ensureCatalogReady(true);
          if (!store) return false;
          const manufacturer = document.getElementById('bf-mfr').value.trim();
          const model = document.getElementById('bf-model').value.trim();
          if (!manufacturer || !model) {
            App.toast('Manufacturer and model required', 'error');
            return false;
          }
          const payload = {
            id: isNew ? generateId(manufacturer, model) : bat.id,
            manufacturer,
            model,
            chemistry: document.getElementById('bf-chem').value.trim(),
            nominalV: parseFloat(document.getElementById('bf-v').value),
            capacityAh: parseFloat(document.getElementById('bf-ah').value),
            recommendedDod: parseFloat(document.getElementById('bf-dod').value),
            continuousCharge_A: parseFloat(document.getElementById('bf-cha').value),
            continuousDischarge_A: parseFloat(document.getElementById('bf-dis').value),
            peakDischarge_A: parseFloat(document.getElementById('bf-peak').value),
            peakDuration_s: parseFloat(document.getElementById('bf-peaks').value),
            tempMinC: parseFloat(document.getElementById('bf-tmin').value),
            tempMaxC: parseFloat(document.getElementById('bf-tmax').value),
            datasheetUrl: document.getElementById('bf-url').value.trim(),
            datasheetRev: document.getElementById('bf-rev').value.trim(),
            note: document.getElementById('bf-note').value.trim(),
          };
          const saved = store.upsertBattery(payload);
          if (!saved) {
            App.toast('Invalid battery data', 'error');
            return false;
          }
          App.closeModal();
          renderPage(document.getElementById('main-content'));
          App.toast(isNew ? 'Battery added' : 'Battery updated', 'success');
        }
      }
    ]);
  }

  function _showPanelForm(panel) {
    const isNew = !panel;
    const p = panel || {
      id: '', manufacturer: '', model: '', Pmax: '', Voc: '', Vmp: '', Isc: '', Imp: '',
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030,
      coeffVmp: -0.0026, coeffImp: 0.00048,
      NOCT: 43, NMOT: 43,
      seriesFuseA: '', maxSystemV: 1500,
      tolerancePlusPct: 0, toleranceMinusPct: 0,
      datasheetUrl: '', datasheetRev: '',
      cells: 72, note: '', preloaded: false
    };
    const safeTitle = isNew ? 'Add Panel' : `Edit: ${p.manufacturer} ${p.model}`;

    App.showModal(safeTitle, `
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Manufacturer</label>
          <input class="form-input" id="pf-mfr" value="${_esc(p.manufacturer)}" placeholder="e.g. Jinko Solar" />
        </div>
        <div class="form-group">
          <label class="form-label">Model</label>
          <input class="form-input" id="pf-model" value="${_esc(p.model)}" placeholder="e.g. Tiger Neo 580W" />
        </div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group">
          <label class="form-label">Pmax (W)</label>
          <input class="form-input" id="pf-pmax" type="number" value="${p.Pmax}" />
        </div>
        <div class="form-group">
          <label class="form-label">Voc (V)</label>
          <input class="form-input" id="pf-voc" type="number" step="0.01" value="${p.Voc}" />
        </div>
        <div class="form-group">
          <label class="form-label">Vmp (V)</label>
          <input class="form-input" id="pf-vmp" type="number" step="0.01" value="${p.Vmp}" />
        </div>
        <div class="form-group">
          <label class="form-label">Isc (A)</label>
          <input class="form-input" id="pf-isc" type="number" step="0.01" value="${p.Isc}" />
        </div>
        <div class="form-group">
          <label class="form-label">Imp (A)</label>
          <input class="form-input" id="pf-imp" type="number" step="0.01" value="${p.Imp}" />
        </div>
        <div class="form-group">
          <label class="form-label">NOCT (&deg;C)</label>
          <input class="form-input" id="pf-noct" type="number" value="${p.NOCT}" />
        </div>
        <div class="form-group">
          <label class="form-label">NMOT (&deg;C)</label>
          <input class="form-input" id="pf-nmot" type="number" value="${p.NMOT}" />
        </div>
        <div class="form-group">
          <label class="form-label">Series Fuse (A)</label>
          <input class="form-input" id="pf-fuse" type="number" step="0.1" value="${p.seriesFuseA}" />
        </div>
        <div class="form-group">
          <label class="form-label">Max System Voltage (V)</label>
          <input class="form-input" id="pf-maxv" type="number" step="1" value="${p.maxSystemV}" />
        </div>
      </div>
      <div class="section-title">Temperature Coefficients</div>
      <div class="info-box">Enter as %/&deg;C (e.g. -0.26). Stored internally as decimal.</div>
      <div class="form-row cols-3">
        <div class="form-group">
          <label class="form-label">&#945;Voc (%/&deg;C)</label>
          <input class="form-input" id="pf-cvoc" type="number" step="0.001" value="${(p.coeffVoc * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Isc (%/&deg;C)</label>
          <input class="form-input" id="pf-cisc" type="number" step="0.001" value="${(p.coeffIsc * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Pmax (%/&deg;C)</label>
          <input class="form-input" id="pf-cpmax" type="number" step="0.001" value="${(p.coeffPmax * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Vmp (%/&deg;C)</label>
          <input class="form-input" id="pf-cvmp" type="number" step="0.001" value="${(p.coeffVmp * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Imp (%/&deg;C)</label>
          <input class="form-input" id="pf-cimp" type="number" step="0.001" value="${(p.coeffImp * 100).toFixed(3)}" />
        </div>
      </div>
      <div class="section-title">Datasheet and Tolerance</div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Datasheet URL</label>
          <input class="form-input" id="pf-durl" value="${_esc(p.datasheetUrl || '')}" placeholder="https://..." />
        </div>
        <div class="form-group">
          <label class="form-label">Datasheet Revision</label>
          <input class="form-input" id="pf-drev" value="${_esc(p.datasheetRev || '')}" placeholder="e.g. Rev 2025-01" />
        </div>
        <div class="form-group">
          <label class="form-label">Power Tolerance + (%)</label>
          <input class="form-input" id="pf-tolp" type="number" step="0.1" min="0" value="${p.tolerancePlusPct}" />
        </div>
        <div class="form-group">
          <label class="form-label">Power Tolerance - (%)</label>
          <input class="form-input" id="pf-tolm" type="number" step="0.1" min="0" value="${p.toleranceMinusPct}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input class="form-input" id="pf-note" value="${_esc(p.note || '')}" placeholder="e.g. N-type TOPCon bifacial" />
      </div>
    `, [
      { label: 'Cancel', cls: 'btn-secondary', action: 'close' },
      {
        label: isNew ? 'Add Panel' : 'Save', cls: 'btn-primary', action: () => {
          const mfr = document.getElementById('pf-mfr').value.trim();
          const model = document.getElementById('pf-model').value.trim();
          if (!mfr || !model) { App.toast('Manufacturer and model required', 'error'); return false; }

          const newPanel = {
            id: isNew ? generateId(mfr, model) : p.id,
            manufacturer: mfr,
            model: model,
            Pmax: parseFloat(document.getElementById('pf-pmax').value),
            Voc: parseFloat(document.getElementById('pf-voc').value),
            Vmp: parseFloat(document.getElementById('pf-vmp').value),
            Isc: parseFloat(document.getElementById('pf-isc').value),
            Imp: parseFloat(document.getElementById('pf-imp').value),
            NOCT: parseFloat(document.getElementById('pf-noct').value),
            NMOT: parseFloat(document.getElementById('pf-nmot').value),
            seriesFuseA: parseFloat(document.getElementById('pf-fuse').value),
            maxSystemV: parseFloat(document.getElementById('pf-maxv').value),
            coeffVoc: parseFloat(document.getElementById('pf-cvoc').value) / 100,
            coeffIsc: parseFloat(document.getElementById('pf-cisc').value) / 100,
            coeffPmax: parseFloat(document.getElementById('pf-cpmax').value) / 100,
            coeffVmp: parseFloat(document.getElementById('pf-cvmp').value) / 100,
            coeffImp: parseFloat(document.getElementById('pf-cimp').value) / 100,
            datasheetUrl: document.getElementById('pf-durl').value.trim(),
            datasheetRev: document.getElementById('pf-drev').value.trim(),
            tolerancePlusPct: parseFloat(document.getElementById('pf-tolp').value),
            toleranceMinusPct: parseFloat(document.getElementById('pf-tolm').value),
            note: document.getElementById('pf-note').value.trim(),
            preloaded: isNew ? false : !!p.preloaded
          };

          const ok = save(newPanel);
          if (!ok) { App.toast('Invalid panel data. Check numeric fields and coefficients.', 'error'); return false; }
          App.closeModal();
          // Re-render the database page
          renderPage(document.getElementById('main-content'));
          App.toast(isNew ? 'Panel added' : 'Panel updated', 'success');
        }
      }
    ]);
  }

  function _doExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'solarpv_panels.json';
    a.click();
    App.toast('Panels exported');
  }

  function _doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const result = importJSON(ev.target.result);
        if (result && result.ok) {
          renderPage(document.getElementById('main-content'));
          const msg = `Panels imported (${result.added} added, ${result.updated} updated${result.rejected ? `, ${result.rejected} rejected` : ''})`;
          App.toast(msg, result.rejected ? 'warning' : 'success');
        } else {
          const msg = result && result.error ? result.error : 'Invalid JSON file';
          App.toast(msg, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return { init, getAll, getById, save, remove, exportJSON, importJSON, getLastImportReport, generateId, renderPage, resetToBundledDefaults };
})();

