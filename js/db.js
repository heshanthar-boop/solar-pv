/**
 * db.js — Panel Database
 * localStorage-backed, synchronous. All calc modules call DB.getById(id).
 * Temperature coefficients stored as decimal fractions (e.g. -0.0026 per °C, NOT -0.26%/°C)
 */

const DB = (() => {
  const STORAGE_KEY = 'solarpv_panels';

  // --- PRELOADED PANELS ---
  // Typical 2023/2024 datasheet values. Coefficients as decimal/°C.
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
      note: 'N-type HJT bifacial, NMOT 41°C, 1500V system, Series Fuse 25A'
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
      _save(PRELOADED.map(p => ({ ...p })));
    }
  }

  function getAll() {
    const panels = _load() || [];
    return panels.sort((a, b) => {
      const m = a.manufacturer.localeCompare(b.manufacturer);
      return m !== 0 ? m : a.model.localeCompare(b.model);
    });
  }

  function getById(id) {
    return getAll().find(p => p.id === id) || null;
  }

  function save(panel) {
    const panels = _load() || [];
    const idx = panels.findIndex(p => p.id === panel.id);
    if (idx >= 0) panels[idx] = panel;
    else panels.push(panel);
    _save(panels);
  }

  function remove(id) {
    const panels = (_load() || []).filter(p => p.id !== id);
    _save(panels);
  }

  function exportJSON() {
    return JSON.stringify(_load() || [], null, 2);
  }

  function importJSON(json) {
    try {
      const incoming = JSON.parse(json);
      if (!Array.isArray(incoming)) throw new Error('Not array');
      const existing = _load() || [];
      const map = {};
      existing.forEach(p => { map[p.id] = p; });
      incoming.forEach(p => { if (p.id) map[p.id] = p; });
      _save(Object.values(map));
      return true;
    } catch { return false; }
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
            ${p.manufacturer} ${p.model}
            ${p.preloaded ? '<span class="tag-preloaded">Built-in</span>' : ''}
          </div>
          <div class="panel-card-sub">${p.note || ''}</div>
          <div class="panel-card-specs">
            <span class="spec-chip">${p.Pmax}W</span>
            <span class="spec-chip">Voc ${p.Voc}V</span>
            <span class="spec-chip">Vmp ${p.Vmp}V</span>
            <span class="spec-chip">Isc ${p.Isc}A</span>
            <span class="spec-chip">Imp ${p.Imp}A</span>
            <span class="spec-chip">NOCT ${p.NOCT}°C</span>
          </div>
          <div class="text-sm text-muted mt-4">
            &#945;Voc: ${(p.coeffVoc * 100).toFixed(3)}%/°C &nbsp;
            &#945;Isc: +${(p.coeffIsc * 100).toFixed(3)}%/°C &nbsp;
            &#945;Pmax: ${(p.coeffPmax * 100).toFixed(3)}%/°C
          </div>
        </div>
        <div class="panel-card-actions">
          <button class="btn btn-secondary btn-sm" data-edit="${p.id}">Edit</button>
          ${!p.preloaded ? `<button class="btn btn-danger btn-sm" data-del="${p.id}">Del</button>` : ''}
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
      coeffVoc: -0.0026, coeffIsc: 0.00048, coeffPmax: -0.0030, NOCT: 43, cells: 72, note: '', preloaded: false
    };

    App.showModal(isNew ? 'Add Panel' : `Edit: ${p.manufacturer} ${p.model}`, `
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Manufacturer</label>
          <input class="form-input" id="pf-mfr" value="${p.manufacturer}" placeholder="e.g. Jinko Solar" />
        </div>
        <div class="form-group">
          <label class="form-label">Model</label>
          <input class="form-input" id="pf-model" value="${p.model}" placeholder="e.g. Tiger Neo 580W" />
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
          <label class="form-label">NOCT (°C)</label>
          <input class="form-input" id="pf-noct" type="number" value="${p.NOCT}" />
        </div>
      </div>
      <div class="section-title">Temperature Coefficients</div>
      <div class="info-box">Enter as %/°C (e.g. -0.26). Stored internally as decimal.</div>
      <div class="form-row cols-3">
        <div class="form-group">
          <label class="form-label">&#945;Voc (%/°C)</label>
          <input class="form-input" id="pf-cvoc" type="number" step="0.001" value="${(p.coeffVoc * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Isc (%/°C)</label>
          <input class="form-input" id="pf-cisc" type="number" step="0.001" value="${(p.coeffIsc * 100).toFixed(3)}" />
        </div>
        <div class="form-group">
          <label class="form-label">&#945;Pmax (%/°C)</label>
          <input class="form-input" id="pf-cpmax" type="number" step="0.001" value="${(p.coeffPmax * 100).toFixed(3)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input class="form-input" id="pf-note" value="${p.note || ''}" placeholder="e.g. N-type TOPCon bifacial" />
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
            coeffVoc: parseFloat(document.getElementById('pf-cvoc').value) / 100,
            coeffIsc: parseFloat(document.getElementById('pf-cisc').value) / 100,
            coeffPmax: parseFloat(document.getElementById('pf-cpmax').value) / 100,
            note: document.getElementById('pf-note').value.trim(),
            preloaded: false
          };

          save(newPanel);
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
        const ok = importJSON(ev.target.result);
        if (ok) {
          renderPage(document.getElementById('main-content'));
          App.toast('Panels imported', 'success');
        } else {
          App.toast('Invalid JSON file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return { init, getAll, getById, save, remove, exportJSON, importJSON, generateId, renderPage };
})();
