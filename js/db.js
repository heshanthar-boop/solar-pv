/**
 * db.js - Panel Database
 * localStorage-backed, synchronous. All calc modules call DB.getById(id).
 * Temperature coefficients stored as decimal fractions (e.g. -0.0026 per C, NOT -0.26%/C)
 */

const DB = (() => {
  const STORAGE_KEY = 'solarpv_panels';
  const MAX_IMPORT_PANELS = 1500;
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

  // --- RENDER PAGE ---
  function renderPage(container) {
    const panels = getAll();

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128230; Panel Database</div>

        <div class="btn-group" style="margin-bottom:16px">
          <button class="btn btn-primary btn-sm" id="db-add-btn">+ Add Panel</button>
          <button class="btn btn-secondary btn-sm" id="db-export-btn">&#8659; Export JSON</button>
          <button class="btn btn-secondary btn-sm" id="db-import-btn">&#8657; Import JSON</button>
        </div>

        <div class="form-group">
          <input type="search" class="form-input" id="db-search" placeholder="Search panels..." style="margin-bottom:0" />
        </div>

        <div id="db-list"></div>
      </div>
    `;

    _renderList(container, panels);

    container.querySelector('#db-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = getAll().filter(p =>
        p.manufacturer.toLowerCase().includes(q) || p.model.toLowerCase().includes(q)
      );
      _renderList(container, filtered);
    });

    container.querySelector('#db-add-btn').addEventListener('click', () => _showPanelForm(null));
    container.querySelector('#db-export-btn').addEventListener('click', _doExport);
    container.querySelector('#db-import-btn').addEventListener('click', _doImport);
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

  return { init, getAll, getById, save, remove, exportJSON, importJSON, getLastImportReport, generateId, renderPage };
})();

