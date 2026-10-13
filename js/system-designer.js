/**
 * system-designer.js - PV*SOL-style guided system simulation flow.
 * Uses existing yield physics and adds load/self-consumption layer.
 */

const SystemDesigner = (() => {
  const TARGET_SPECIFIC_YIELD = 1450; // kWh/kWp/year, Sri Lanka planning baseline.

  const LOAD_PROFILES = [
    {
      id: 'res_evening',
      label: 'Residential - Evening Peak',
      baseSelfUse: 0.30,
      note: 'Typical homes with strongest demand after sunset.',
      monthlyWeights: [1.02, 1.00, 0.98, 0.96, 0.97, 1.00, 1.01, 1.02, 1.03, 1.04, 1.03, 0.94],
    },
    {
      id: 'res_day',
      label: 'Residential - Day Active',
      baseSelfUse: 0.40,
      note: 'Home office or daytime occupancy increases direct PV use.',
      monthlyWeights: [1.01, 1.00, 0.99, 0.97, 0.98, 1.00, 1.00, 1.01, 1.02, 1.03, 1.02, 0.97],
    },
    {
      id: 'commercial',
      label: 'Commercial - Daytime',
      baseSelfUse: 0.62,
      note: 'Office and retail loads align strongly with daytime generation.',
      monthlyWeights: [1.01, 1.00, 1.00, 0.99, 0.99, 1.00, 1.00, 1.00, 1.00, 1.01, 1.01, 0.99],
    },
    {
      id: 'industrial',
      label: 'Industrial - Continuous',
      baseSelfUse: 0.72,
      note: 'High daytime baseload usually consumes most PV generation.',
      monthlyWeights: [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    },
    {
      id: 'hotel_hospital',
      label: 'Hotel/Hospital - 24h',
      baseSelfUse: 0.58,
      note: 'Round-the-clock loads with substantial daytime cooling demand.',
      monthlyWeights: [1.02, 1.00, 0.99, 0.98, 0.99, 1.00, 1.01, 1.02, 1.01, 1.00, 1.00, 0.98],
    },
    {
      id: 'mixed',
      label: 'Mixed Use',
      baseSelfUse: 0.48,
      note: 'Balanced mixed-use profile when detailed data is unavailable.',
      monthlyWeights: [1.01, 1.00, 0.99, 0.98, 0.98, 1.00, 1.01, 1.01, 1.01, 1.01, 1.01, 0.99],
    },
  ];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function _esc(value) {
    if (typeof App !== 'undefined' && App && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function _clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function _projectLabel() {
    if (typeof App === 'undefined' || !App || typeof App.getProject !== 'function') return '';
    const p = App.getProject() || {};
    return String(p.name || '').trim();
  }

  function _nearestLocation(locations) {
    if (!Array.isArray(locations) || !locations.length) return '';
    const project = (typeof App !== 'undefined' && App && typeof App.getProject === 'function') ? App.getProject() : null;
    const lat = project ? Number(project.lat) : NaN;
    const lon = project ? Number(project.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return locations[0].id;

    let best = { id: locations[0].id, d: Number.POSITIVE_INFINITY };
    locations.forEach((loc) => {
      const dLat = lat - Number(loc.lat || 0);
      const dLon = lon - Number(loc.lon || 0);
      const d2 = dLat * dLat + dLon * dLon;
      if (d2 < best.d) best = { id: loc.id, d: d2 };
    });
    return best.id;
  }

  function _getPanels() {
    if (typeof DB !== 'undefined' && DB && typeof DB.getAll === 'function') {
      try { return DB.getAll() || []; } catch (_) {}
    }
    return [];
  }

  function _getInverters() {
    if (typeof CatalogStore !== 'undefined' && CatalogStore && typeof CatalogStore.getAllInverters === 'function') {
      try { return CatalogStore.getAllInverters() || []; } catch (_) {}
    }
    return [];
  }

  function _getBatteries() {
    if (typeof CatalogStore !== 'undefined' && CatalogStore && typeof CatalogStore.getAllBatteries === 'function') {
      try { const rows=CatalogStore.getAllBatteries() || []; return rows.concat(DirectiveRules.BATTERY_REFERENCES.filter(r=>!rows.some(b=>b.id===r.id))); } catch (_) {}
    }
    return [];
  }

  async function _ensureCatalogLoaded() {
    if (typeof CatalogStore === 'undefined' || !CatalogStore) return;
    if (typeof CatalogStore.ensureLoaded === 'function') {
      try { await CatalogStore.ensureLoaded(); } catch (_) {}
    }
  }

  async function _ensurePanelSeedLoaded() {
    if (typeof DB === 'undefined' || !DB) return;
    if (typeof DB.ensureSeedLoaded === 'function') {
      try { await DB.ensureSeedLoaded(); } catch (_) {}
    }
  }

  function _suggestDcFromLoad(annualLoad) {
    if (!Number.isFinite(annualLoad) || annualLoad <= 0) return 0;
    return annualLoad / TARGET_SPECIFIC_YIELD;
  }

  function _profileById(profileId) {
    return LOAD_PROFILES.find(p => p.id === profileId) || LOAD_PROFILES[0];
  }

  function _monthlyLoadSplit(annualLoad, profile) {
    const weights = Array.isArray(profile.monthlyWeights) && profile.monthlyWeights.length === 12
      ? profile.monthlyWeights
      : new Array(12).fill(1);
    const wSum = weights.reduce((s, w) => s + (Number(w) || 0), 0) || 12;
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const w = Number(weights[i]) || 1;
      rows.push({
        month: i + 1,
        monthName: MONTHS[i],
        load_kWh: annualLoad * (w / wSum),
      });
    }
    return rows;
  }

  function _catalogLabel(panel, inverter, battery) {
    const tags = [];
    if (panel) tags.push('PV module');
    if (inverter) tags.push('Inverter');
    if (battery) tags.push('Battery');
    return tags.length ? `Catalogue-backed (${tags.join(', ')})` : 'Heuristic inputs';
  }

  function _componentSnapshot(panel, inverter, battery) {
    return { panel: panel ? {...panel} : null, inverter: inverter ? {...inverter} : null, battery: battery ? {...battery} : null };
  }

  function _fmt(n, d) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '-';
    return num.toLocaleString('en-LK', {
      minimumFractionDigits: Number.isFinite(d) ? d : 0,
      maximumFractionDigits: Number.isFinite(d) ? d : 0,
    });
  }

  function _renderResults(container, payload) {
    const r = payload;
    const monthlyRows = r.dispatch.monthly.map((m, i) => `
      <tr>
        <td>${_esc(m.monthName)}</td>
        <td style="text-align:right">${_fmt(m.pvKwh, 0)}</td>
        <td style="text-align:right">${_fmt(r.monthlyLoad[i].load_kWh, 0)}</td>
        <td style="text-align:right">${_fmt(m.exportKwh, 0)}</td><td style="text-align:right">${_fmt(m.importKwh, 0)}</td><td style="text-align:right">${_fmt(m.batteryLossKwh, 0)}</td>
      </tr>
    `).join('');

    const confidenceCls = r.catalogLabel.startsWith('Catalogue-backed') ? 'badge-pass' : 'badge-warn';
    const dcacCls = String(r.dcac && r.dcac.cls || '').replace('alert-', 'badge-') || 'badge-warn';
    const panelRef = r.components && r.components.panel
      ? `${_esc(r.components.panel.manufacturer)} ${_esc(r.components.panel.model)} (${_esc(r.components.panel.Pmax)}W)`
      : 'Manual';
    const inverterRef = r.components && r.components.inverter
      ? `${_esc(r.components.inverter.manufacturer)} ${_esc(r.components.inverter.model)} (${_esc(r.components.inverter.acRated_kW)} kW)`
      : 'Manual';
    const batteryRef = r.components && r.components.battery
      ? `${_esc(r.components.battery.manufacturer)} ${_esc(r.components.battery.model)} (${r.components.battery.usableEnergy_kWh>0?_esc(r.components.battery.usableEnergy_kWh)+' kWh declared usable':_esc(r.components.battery.nominalV)+'V, '+_esc(r.components.battery.capacityAh)+'Ah'})`
      : 'Not selected';

    const resultsDiv = container.querySelector('#sd-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      ${DirectiveUI.review(r.directiveReview)}
      ${DirectiveUI.tariffSummary(r.tariff,r.exportRevenue)}
      <div class="card">
        <div class="card-title">Draft design & simulation summary</div>
        <div class="btn-group" style="margin-bottom:10px">
          <span class="status-badge ${_esc(confidenceCls)}">${_esc(r.catalogLabel)}</span>
          <span class="status-badge ${_esc(dcacCls)}">DC/AC ${_esc(r.dcac.ratio.toFixed(2))}</span>
          <span class="status-badge badge-pass">Profile: ${_esc(r.profile.label)}</span>
        </div>
        <div class="result-grid-3">
          <div class="result-box"><div class="result-value">${_fmt(r.summary.E_annual, 0)} kWh</div><div class="result-label">Annual PV Potential</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.annualLoad, 0)} kWh</div><div class="result-label">Annual Load</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.annualLoad / 12, 1)} kWh</div><div class="result-label">Avg Monthly Load</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.annualLoad / 365, 2)} kWh</div><div class="result-label">Avg Daily Load</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.selfUse.selfConsumed_kWh, 0)} kWh</div><div class="result-label">Self-consumed PV</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.selfUse.gridExport_kWh, 0)} kWh</div><div class="result-label">Grid Export</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.selfUse.gridImport_kWh, 0)} kWh</div><div class="result-label">Grid Import</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.selfUse.selfUseRatio * 100, 1)}%</div><div class="result-label">Self-consumption Rate</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.selfUse.solarFraction * 100, 1)}%</div><div class="result-label">Solar Fraction of Load</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.summary.SY_annual, 0)} kWh/kWp</div><div class="result-label">Specific Yield</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.summary.PR_avg * 100, 1)}%</div><div class="result-label">Average PR</div></div>
          <div class="result-box"><div class="result-value">${_fmt(r.summary.H_poa_annual, 0)} kWh/m2</div><div class="result-label">Annual POA Irradiance</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">&#128230; Linked Database Components</div>
        <table class="status-table">
          <tbody>
            <tr><td><strong>PV Module</strong></td><td>${panelRef}</td></tr>
            <tr><td><strong>Inverter</strong></td><td>${inverterRef}</td></tr>
            <tr><td><strong>Battery</strong></td><td>${batteryRef}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">&#128202; Monthly Balance</div>
        <table class="status-table">
          <thead>
            <tr>
              <th>Month</th>
              <th style="text-align:right">PV Energy (kWh)</th>
              <th style="text-align:right">Load (kWh)</th>
              <th style="text-align:right">Export (kWh)</th><th style="text-align:right">Import (kWh)</th><th style="text-align:right">Battery Loss (kWh)</th>
            </tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>

      <div class="info-box">
        <strong>Method note:</strong> PV generation uses the app yield physics (monthly irradiance, POA transposition,
        temperature model, and configured losses). ${_esc(r.dispatch.method)} The AC-domain model is conservative for DC-coupled hybrids; DC-side capture above the AC conversion limit is not simulated. Battery/inverter AC-equivalent round-trip efficiency: ${_fmt(r.dispatchOptions.rtePct,1)}% (declared battery RTE × configured converter efficiency²). Grid charging is not assumed. Curtailed / clipped energy: ${_fmt(r.dispatch.total.curtailedKwh, 0)} kWh; battery losses: ${_fmt(r.dispatch.total.batteryLossKwh, 0)} kWh.
      </div>
    `;

    const printBtn = container.querySelector('#sd-print-btn');
    if (printBtn) printBtn.classList.remove('hidden');
  }

  async function render(container) {
    if (typeof DirectiveRules === 'undefined' || typeof DirectiveUI === 'undefined' || typeof YieldEstimator === 'undefined' || !YieldEstimator || typeof YieldEstimator.simulateMonthly !== 'function') {
      container.innerHTML = `
        <div class="page">
          <div class="card">
            <div class="card-title">System Designer</div>
            <div class="warn-box">Yield engine unavailable. Reload and try again.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="page">
        <div class="card">
          <div class="card-title">System Designer</div>
          <div class="text-muted">Loading database catalogs...</div>
        </div>
      </div>
    `;

    await _ensureCatalogLoaded();
    await _ensurePanelSeedLoaded();
    if (container.id === 'main-content' && App.state.currentPage !== 'systemdesigner') return;

    const locations = Array.isArray(YieldEstimator.SL_LOCATIONS) ? YieldEstimator.SL_LOCATIONS : [];
    const panels = _getPanels();
    const inverters = _getInverters();
    const batteries = _getBatteries();
    const defaultLoc = _nearestLocation(locations);
    const projectName = _projectLabel();
    const catalogState = (typeof CatalogStore !== 'undefined' && CatalogStore && typeof CatalogStore.getState === 'function')
      ? (CatalogStore.getState() || {})
      : {};
    const catalogWarnHtml = catalogState && catalogState.loadError
      ? `<div class="warn-box" style="margin-top:10px">Catalog load warning: ${_esc(catalogState.loadError)}</div>`
      : '';

    container.innerHTML = `
      <div class="page">
        <div class="page-title">System Designer</div>
        <div class="card">
          <div class="card-title">Guided system simulation</div>
          <div class="text-muted" style="font-size:0.82rem">
            Guided sequence: location and load, component selection, loss setup, then annual simulation and energy balance.
            ${projectName ? `Active project: <strong>${_esc(projectName)}</strong>.` : ''}
          </div>
          ${catalogWarnHtml}
        </div>

        <div class="card">
          <div class="card-title">1. Site and Consumption</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Location</label>
              <select class="form-select" id="sd-loc">
                ${locations.map(loc => `<option value="${_esc(loc.id)}" ${loc.id === defaultLoc ? 'selected' : ''}>${_esc(loc.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Annual Load (kWh/year)</label>
              <input class="form-input" id="sd-load" type="number" min="100" step="100" value="12000" />
            </div>
            <div class="form-group">
              <label class="form-label">Average Monthly Load (kWh/month)</label>
              <input class="form-input" id="sd-load-month" type="number" min="10" step="1" value="1000" />
            </div>
            <div class="form-group">
              <label class="form-label">Average Daily Load (kWh/day)</label>
              <input class="form-input" id="sd-load-day" type="number" min="0.1" step="0.1" value="32.9" />
            </div>
            <div class="form-group">
              <label class="form-label">Load Profile</label>
              <select class="form-select" id="sd-profile">
                ${LOAD_PROFILES.map(p => `<option value="${_esc(p.id)}">${_esc(p.label)}</option>`).join('')}
              </select>
              <div class="form-hint" id="sd-profile-note">${_esc(LOAD_PROFILES[0].note)}</div>
            </div>
            <div class="form-group">
              <label class="form-label">Auto-size baseline</label>
              <div class="info-box" style="font-size:0.8rem">Initial PV suggestion uses ${TARGET_SPECIFIC_YIELD} kWh/kWp/year.</div>
              <div class="form-hint">Edit any one of annual/monthly/daily load values. Others update automatically.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">2. PV Array and Orientation</div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label">PV Array (kWp DC)</label>
              <input class="form-input" id="sd-pdc" type="number" min="0.2" step="0.1" value="8.0" />
            </div>
            <div class="form-group">
              <label class="form-label">Inverter AC (kW)</label>
              <input class="form-input" id="sd-pac" type="number" min="0.2" step="0.1" value="6.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Tilt (deg)</label>
              <input class="form-input" id="sd-tilt" type="number" min="0" max="90" step="1" value="10" />
            </div>
            <div class="form-group">
              <label class="form-label">Azimuth (deg)</label>
              <input class="form-input" id="sd-azimuth" type="number" min="-180" max="180" step="1" value="0" />
              <div class="form-hint">0 = south, +90 = west, -90 = east.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Ground Reflectance</label>
              <input class="form-input" id="sd-rho" type="number" min="0" max="1" step="0.01" value="0.20" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">3. Catalog and Manufacturer References</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">PV Module (database)</label>
              <select class="form-select" id="sd-panel">
                <option value="">Select PV module...</option>
                ${panels.map(p => `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${_esc(p.Pmax)}W)</option>`).join('')}
              </select>
              <div class="form-hint">Required for module thermal and datasheet-backed simulation.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Inverter (database)</label>
              <select class="form-select" id="sd-inverter">
                <option value="">Select inverter...</option>
                ${inverters.map(i => `<option value="${_esc(i.id)}">${_esc(i.manufacturer)} ${_esc(i.model)} (${_esc(i.acRated_kW)} kW)</option>`).join('')}
              </select>
              <div class="form-hint">Required for AC rating and inverter limit checks.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Battery (database)</label>
              <select class="form-select" id="sd-battery">
                <option value="">No battery</option>
                ${batteries.map(b => `<option value="${_esc(b.id)}">${_esc(b.manufacturer)} ${_esc(b.model)} (${b.usableEnergy_kWh>0?_esc(b.usableEnergy_kWh)+' kWh usable · manufacturer reference':_esc(b.nominalV)+'V, '+_esc(b.capacityAh)+'Ah'})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Usable Battery (kWh)</label>
              <input class="form-input" id="sd-battery-kwh" type="number" min="0" step="0.1" value="0" />
              <div class="form-hint" id="sd-battery-kwh-note">Auto-filled from selected battery record. Editable when no battery is selected.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">4. Loss Model and Module Thermal Inputs</div>
          <div class="form-row cols-3">
            <div class="form-group">
              <label class="form-label">Inverter Efficiency (%)</label>
              <input class="form-input" id="sd-eta-inv" type="number" min="90" max="99.9" step="0.1" value="96.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Cable Loss (%)</label>
              <input class="form-input" id="sd-loss-cable" type="number" min="0" max="15" step="0.1" value="1.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Soiling Loss (%)</label>
              <input class="form-input" id="sd-loss-soiling" type="number" min="0" max="20" step="0.1" value="2.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Mismatch Loss (%)</label>
              <input class="form-input" id="sd-loss-mismatch" type="number" min="0" max="10" step="0.1" value="1.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Other Losses (%)</label>
              <input class="form-input" id="sd-loss-other" type="number" min="0" max="20" step="0.1" value="1.0" />
            </div>
            <div class="form-group">
              <label class="form-label">Module NOCT (degC)</label>
              <input class="form-input" id="sd-noct" type="number" min="25" max="80" step="0.1" value="43" />
            </div>
            <div class="form-group">
              <label class="form-label">Pmax Temp Coeff (%/degC)</label>
              <input class="form-input" id="sd-gamma" type="number" min="-1.2" max="-0.1" step="0.01" value="-0.35" />
            </div>
          </div>
          <div class="form-hint">Thermal and loss assumptions should be validated against selected datasheets and commissioning measurements.</div>
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary" id="sd-autosize">&#129520; Auto-size PV from annual load</button>
          <button class="btn btn-secondary" id="sd-opt-tilt">&#128208; Find optimal tilt</button>
          <button class="btn btn-primary" id="sd-run">&#9889; Run Simulation</button>
          <button class="btn btn-secondary hidden" id="sd-print-btn">&#128424; Print Results</button>
          <button class="btn btn-secondary" id="sd-open-yield">&#10145; Open Detailed Yield Module</button>
        </div>

        <div class="btn-group mt-12"><button class="btn btn-secondary" id="sd-export-review">Export draft design JSON</button><button class="btn btn-secondary" id="sd-open-financials">Open scheme-aware financials</button></div><div id="sd-results" class="hidden" style="margin-top:12px"></div>
      </div>
    `;

    container.querySelector('#sd-run').closest('.btn-group').insertAdjacentHTML('beforebegin', DirectiveUI.form('sd-policy') + DirectiveUI.tariffForm('sd-fit'));
    let designDirty=true;
    const markDesignDirty=e=>{if(e.target.closest('#sd-results'))return;designDirty=true;container.querySelector('#sd-results').classList.add('hidden');};
    container.addEventListener('input',markDesignDirty);
    container.addEventListener('change',markDesignDirty);
    container.querySelector('#sd-policy-connection').addEventListener('change',e=>{
      const scheme=container.querySelector('#sd-fit-scheme');
      if(e.target.value!=='grid_export')scheme.value='zero_export';else if(scheme.value==='zero_export')scheme.value='net_accounting';
    });
    container.querySelector('#sd-policy-installation').addEventListener('change',e=>{container.querySelector('#sd-fit-installation').value=e.target.value;});
    const profileSel = container.querySelector('#sd-profile');
    const profileNote = container.querySelector('#sd-profile-note');
    const panelSel = container.querySelector('#sd-panel');
    const inverterSel = container.querySelector('#sd-inverter');
    const batterySel = container.querySelector('#sd-battery');
    const annualLoadEl = container.querySelector('#sd-load');
    const monthlyLoadEl = container.querySelector('#sd-load-month');
    const dailyLoadEl = container.querySelector('#sd-load-day');
    const pdcEl = container.querySelector('#sd-pdc');
    const pacEl = container.querySelector('#sd-pac');
    const noctEl = container.querySelector('#sd-noct');
    const gammaEl = container.querySelector('#sd-gamma');
    const batteryKwhEl = container.querySelector('#sd-battery-kwh');
    const batteryKwhNoteEl = container.querySelector('#sd-battery-kwh-note');

    let _syncingLoad = false;
    const manual = {
      pdc: false,
      pac: false,
      noct: false,
      gamma: false,
      battery: false,
      etaInv: false,
    };

    container.querySelector('#sd-eta-inv').addEventListener('input',()=>{manual.etaInv=true;});
    pdcEl.addEventListener('input', () => { manual.pdc = true; });
    pacEl.addEventListener('input', () => { manual.pac = true; });
    noctEl.addEventListener('input', () => { manual.noct = true; });
    gammaEl.addEventListener('input', () => { manual.gamma = true; });
    batteryKwhEl.addEventListener('input', () => { manual.battery = true; });

    function _syncLoadFields(from) {
      if (_syncingLoad) return;
      _syncingLoad = true;
      try {
        let annual = NaN;
        if (from === 'monthly') annual = _num(monthlyLoadEl.value, NaN) * 12;
        else if (from === 'daily') annual = _num(dailyLoadEl.value, NaN) * 365;
        else annual = _num(annualLoadEl.value, NaN);

        if (!Number.isFinite(annual) || annual <= 0) return;
        annualLoadEl.value = annual.toFixed(0);
        monthlyLoadEl.value = (annual / 12).toFixed(1);
        dailyLoadEl.value = (annual / 365).toFixed(2);
      } finally {
        _syncingLoad = false;
      }
    }

    annualLoadEl.addEventListener('input', () => _syncLoadFields('annual'));
    monthlyLoadEl.addEventListener('input', () => _syncLoadFields('monthly'));
    dailyLoadEl.addEventListener('input', () => _syncLoadFields('daily'));
    _syncLoadFields('annual');

    function updateProfileNote() {
      const profile = _profileById(profileSel.value);
      profileNote.textContent = profile.note;
    }

    profileSel.addEventListener('change', updateProfileNote);
    updateProfileNote();

    panelSel.addEventListener('change', () => {
      const panel = panels.find(p => String(p.id) === String(panelSel.value));
      if (!panel) return;
      const noct = Number(panel.NOCT);
      const gammaPct = Number(panel.coeffPmax) * 100;
      if (!manual.noct && Number.isFinite(noct)) noctEl.value = noct.toFixed(1);
      if (!manual.gamma && Number.isFinite(gammaPct)) gammaEl.value = gammaPct.toFixed(2);
      if (typeof App !== 'undefined' && App) App.toast(`Panel loaded: ${panel.manufacturer} ${panel.model}`, 'success');
    });

    inverterSel.addEventListener('change', () => {
      const inv = inverters.find(i => String(i.id) === String(inverterSel.value));
      if (!inv) return;
      DirectiveUI.updateModel(container, 'sd-policy', 'inverter', inv);
      if(!manual.etaInv&&inv.efficiencyPct>0)container.querySelector('#sd-eta-inv').value=inv.efficiencyPct;
      const ac = Number(inv.acRated_kW);
      const maxPv = Number(inv.maxPv_kW);
      if (!manual.pac && Number.isFinite(ac) && ac > 0) pacEl.value = ac.toFixed(1);
      if (!manual.pdc && Number.isFinite(maxPv) && maxPv > 0 && String(inv.topology || '').toLowerCase() === 'hybrid') {
        pdcEl.value = maxPv.toFixed(1);
      }
      if (typeof App !== 'undefined' && App) App.toast(`Inverter loaded: ${inv.manufacturer} ${inv.model}`, 'success');
    });

    batterySel.addEventListener('change', () => {
      const bat = batteries.find(b => String(b.id) === String(batterySel.value));
      manual.battery=false;
      if (!bat) {
        DirectiveUI.updateModel(container, 'sd-policy', 'battery', null);
        batteryKwhEl.value = '0';
        batteryKwhEl.readOnly = false;
        if (batteryKwhNoteEl) batteryKwhNoteEl.textContent = 'No battery selected. Enter usable battery manually or keep 0.';
        return;
      }
      DirectiveUI.updateModel(container, 'sd-policy', 'battery', bat);
      const nominal = Number(bat.nominalV);
      const ah = Number(bat.capacityAh);
      const dod = Number.isFinite(Number(bat.recommendedDod)) ? Number(bat.recommendedDod) : 0.8;
      if (!manual.battery && (bat.usableEnergy_kWh>0 || Number.isFinite(nominal) && Number.isFinite(ah) && nominal > 0 && ah > 0)) {
        const usable = bat.usableEnergy_kWh > 0 ? bat.usableEnergy_kWh : nominal * ah * dod / 1000;
        batteryKwhEl.value = usable.toFixed(1);
      }
      batteryKwhEl.readOnly = bat.usableEnergy_kWh > 0;
      if (batteryKwhNoteEl) batteryKwhNoteEl.textContent = bat.usableEnergy_kWh > 0 ? 'Manufacturer-declared usable energy (not derated a second time by DoD).' : 'Estimate from V × Ah × selected DoD; replace with the manufacturer usable-energy declaration for compliance review.';
      if (typeof App !== 'undefined' && App) App.toast(`Battery loaded: ${bat.manufacturer} ${bat.model}`, 'success');
    });
    batterySel.dispatchEvent(new Event('change'));
    const unitInput = container.querySelector('#sd-policy-inverterCount');
    unitInput.addEventListener('input', () => {
      const inv=inverters.find(i=>i.id===inverterSel.value);
      if(inv) pacEl.value=(inv.acRated_kW*Number(unitInput.value||1)).toFixed(2);
    });
    container.querySelector('#sd-policy-batteryUnits').addEventListener('input', () => {
      const bat=batteries.find(b=>b.id===batterySel.value), count=Number(container.querySelector('#sd-policy-batteryUnits').value);
      if(bat&&count>0) batteryKwhEl.value=((bat.usableEnergy_kWh>0?bat.usableEnergy_kWh:bat.nominalV*bat.capacityAh*bat.recommendedDod/1000)*count).toFixed(2);
    });
    container.querySelector('#sd-export-review').addEventListener('click', () => {
      const r=App.state.designerResults;
      if(!r||designDirty){App.toast('Run a simulation with the current inputs first','warning');return;}
      const blob=new Blob([JSON.stringify({format:'solarpv.design-review.v2026',documentStatus:'DRAFT — decision support, not authority approval',project:App.getProject(),...r},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download='solarpv-design-review-2026.json';a.click();URL.revokeObjectURL(url);
    });
    container.querySelector('#sd-open-financials').addEventListener('click', () => {if(designDirty){App.toast('Run the current design before opening linked financials','warning');return;}App.navigate('financials');});

    container.querySelector('#sd-autosize').addEventListener('click', () => {
      const annualLoad = _num(annualLoadEl.value, 0);
      if (!(annualLoad > 0)) {
        if (typeof App !== 'undefined' && App) App.toast('Enter annual load first', 'warning');
        return;
      }
      const suggested = _suggestDcFromLoad(annualLoad);
      pdcEl.value = suggested.toFixed(2);
      const chosenInv=inverters.find(i=>i.id===inverterSel.value);
      const pac = chosenInv?chosenInv.acRated_kW*(Number(container.querySelector('#sd-policy-inverterCount').value)||1):suggested / 1.2;
      pacEl.value = pac.toFixed(2);
      if (typeof App !== 'undefined' && App) App.toast(`Suggested size: ${suggested.toFixed(2)} kWp DC`, 'success');
    });

    container.querySelector('#sd-opt-tilt').addEventListener('click', () => {
      const loc = locations.find(l => l.id === container.querySelector('#sd-loc').value);
      const az = _num(container.querySelector('#sd-azimuth').value, 0);
      if (!loc || typeof YieldEstimator.findOptimalTilt !== 'function') return;
      const best = YieldEstimator.findOptimalTilt(loc, az);
      container.querySelector('#sd-tilt').value = Number(best.tilt).toFixed(0);
      if (typeof App !== 'undefined' && App) App.toast(`Tilt set to ${best.tilt} deg (optimal)`, 'success');
    });

    container.querySelector('#sd-run').addEventListener('click', () => {
      const loc = locations.find(l => l.id === container.querySelector('#sd-loc').value);
      const annualLoad = _num(annualLoadEl.value, NaN);
      const profile = _profileById(container.querySelector('#sd-profile').value);
      const pDc = _num(pdcEl.value, NaN);
      const pAc = _num(pacEl.value, NaN);
      const tilt = _num(container.querySelector('#sd-tilt').value, NaN);
      const azimuth = _num(container.querySelector('#sd-azimuth').value, 0);
      const rho = _num(container.querySelector('#sd-rho').value, 0.20);
      const etaInv = _num(container.querySelector('#sd-eta-inv').value, NaN) / 100;
      const lossCable = _num(container.querySelector('#sd-loss-cable').value, NaN) / 100;
      const lossSoiling = _num(container.querySelector('#sd-loss-soiling').value, NaN) / 100;
      const lossMismatch = _num(container.querySelector('#sd-loss-mismatch').value, NaN) / 100;
      const lossOther = _num(container.querySelector('#sd-loss-other').value, NaN) / 100;
      const noct = _num(noctEl.value, NaN);
      const coeffPmax = _num(gammaEl.value, NaN) / 100;
      const batteryUsable = _num(batteryKwhEl.value, 0);

      if (!loc) {
        App.toast('Select a location', 'error');
        return;
      }
      if (![annualLoad, pDc, pAc, tilt, etaInv, lossCable, lossSoiling, lossMismatch, lossOther, noct, coeffPmax].every(Number.isFinite)) {
        App.toast('Fill all numeric inputs', 'error');
        return;
      }
      if (annualLoad <= 0 || pDc <= 0 || pAc <= 0) {
        App.toast('Load and system ratings must be positive', 'error');
        return;
      }
      if (!(etaInv>0&&etaInv<=1)||[lossCable,lossSoiling,lossMismatch,lossOther].some(v=>v<0||v>=1)||tilt<0||tilt>90||rho<0||rho>1||noct<=0||noct>100) {App.toast('Check efficiency, loss fractions, tilt, reflectance and NOCT ranges','error');return;}
      if (coeffPmax >= 0) {
        App.toast('Pmax temperature coefficient should be negative', 'error');
        return;
      }

      const losses = {
        eta_inv: etaInv,
        L_cable: lossCable,
        L_soiling: lossSoiling,
        L_mismatch: lossMismatch,
        L_other: lossOther,
      };

      const monthly = YieldEstimator.simulateMonthly(loc, pDc, noct, coeffPmax, tilt, azimuth, losses, _clamp(rho, 0, 1));
      const dcac = YieldEstimator.checkDCACRatio(pDc, pAc);
      const summary = {
        E_annual: monthly.reduce((s, m) => s + m.E_mon, 0),
        H_poa_annual: monthly.reduce((s, m) => s + m.H_poa * m.days, 0),
        PR_avg: monthly.reduce((s, m) => s + m.PR * m.days, 0) / 365,
        SY_annual: monthly.reduce((s, m) => s + m.E_mon, 0) / pDc,
      };
      const monthlyLoad = _monthlyLoadSplit(annualLoad, profile);
      let selfUse;

      const panel = panels.find(p => String(p.id) === String(panelSel.value));
      const inverter = inverters.find(i => String(i.id) === String(inverterSel.value));
      const battery = batteries.find(b => String(b.id) === String(batterySel.value));

      if (!panel) {
        App.toast('Select PV module from database in Catalog Components', 'error');
        return;
      }
      if (!inverter) {
        App.toast('Select inverter from database in Catalog Components', 'error');
        return;
      }

      if (inverter) {
        const invMaxPv = Number(inverter.maxPv_kW);
        if (Number.isFinite(invMaxPv) && invMaxPv > 0 && pDc > invMaxPv) {
          App.toast(`PV DC ${pDc.toFixed(2)} kWp exceeds inverter max PV ${invMaxPv.toFixed(2)} kW`, 'warning');
        }
        const invAc = Number(inverter.acRated_kW);
        if (Number.isFinite(invAc) && invAc > 0 && Math.abs(pAc - invAc) > 0.2) {
          App.toast(`AC rating differs from selected inverter (${invAc.toFixed(2)} kW)`, 'warning');
        }
      }
      if (battery && inverter && Number(inverter.batteryBus_V) > 0 && Number(battery.nominalV) > 0) {
        const bus = Number(inverter.batteryBus_V);
        const nominal = Number(battery.nominalV);
        const diffPct = Math.abs(nominal - bus) / bus;
        if (diffPct > 0.25) {
          App.toast(`Battery nominal voltage ${nominal}V may not match inverter bus ${bus}V`, 'warning');
        }
      }

      const policy = DirectiveUI.read(container, 'sd-policy');
      const fitInputs = {...DirectiveUI.readTariff(container,'sd-fit'),usableKwh:batteryUsable};
      const usableEnergyBasis=!battery?'user-declared':battery.usableEnergy_kWh>0?'manufacturer':manual.battery?'user-declared':'estimate';
      const directiveReview = DirectiveRules.evaluate({...policy,usableEnergyBasis,inverter,panel,battery,inverterKW:pAc,usableKwh:batteryUsable,pvKW:pDc,batteryVoltage:policy.batteryVoltage??battery?.nominalV,chemistry:battery?.chemistry||policy.chemistry});
      const tariff = DirectiveRules.tariff(fitInputs);
      const count=Number(policy.inverterCount)||1, batteryCount=Number(policy.batteryUnits)||1;
      const inverterCharge=inverter.maxCharge_A>0 ? inverter.maxCharge_A*(Number(policy.batteryMinV)||Number(battery?.nominalV)||inverter.batteryBus_V)/1000*count : pAc;
      const inverterDischarge=inverter.maxDischarge_A>0 ? inverter.maxDischarge_A*(Number(policy.batteryMinV)||Number(battery?.nominalV)||inverter.batteryBus_V)/1000*count : pAc;
      const batteryCharge=battery?.maxPower_kW>0?battery.maxPower_kW*batteryCount:battery?.continuousCharge_A>0?battery.continuousCharge_A*battery.nominalV/1000*batteryCount:pAc;
      const batteryDischarge=battery?.maxPower_kW>0?battery.maxPower_kW*batteryCount:battery?.continuousDischarge_A>0?battery.continuousDischarge_A*battery.nominalV/1000*batteryCount:pAc;
      const chargeKW=Math.min(Number(policy.chargeKW)||0,pAc,inverterCharge,batteryCharge), dischargeKW=Math.min(Number(policy.dischargeKW)||0,pAc,inverterDischarge,batteryDischarge);
      const mode=fitInputs.scheme==='net_plus'?'net_plus':fitInputs.applicant.includes('bess')?'priority_export':'self_consumption';
      const dispatchOptions={monthlyLoadKwh:monthlyLoad.map(m=>m.load_kWh),profile:profile.id,usableKwh:batteryUsable,rtePct:Number(policy.rtePct)*losses.eta_inv*losses.eta_inv,chargeKW,dischargeKW,pvPowerKW:pAc,exportKW:policy.connection==='offgrid'||policy.connection==='zero_export'?0:policy.approvedExportKW,mode};
      const dispatch = DirectiveRules.dispatch(monthly,annualLoad,dispatchOptions);
      selfUse={selfUseRatio:summary.E_annual>0?dispatch.total.selfKwh/summary.E_annual:0,selfConsumed_kWh:dispatch.total.selfKwh,gridExport_kWh:dispatch.total.exportKwh,gridImport_kWh:dispatch.total.importKwh,solarFraction:dispatch.total.selfKwh/annualLoad};
      const exportRevenue=DirectiveRules.settle(dispatch.monthly,tariff);
      const payload = {
        policy,fitInputs,usableEnergyBasis,directiveReview,tariff,exportRevenue,dispatch,dispatchOptions,
        date: (typeof App !== 'undefined' && App && typeof App.localDateISO === 'function') ? App.localDateISO() : '',
        location: { id: loc.id, name: loc.name, lat: loc.lat, lon: loc.lon },
        profile,
        annualLoad,
        system: { P_dc: pDc, P_ac: pAc, NOCT: noct, coeffPmax, tilt, azimuth, rho, batteryUsable_kWh: batteryUsable },
        losses,
        monthly,
        monthlyLoad,
        summary,
        dcac,
        selfUse,
        catalogLabel: _catalogLabel(panel, inverter, battery),
        components: _componentSnapshot(panel, inverter, battery),
      };

      if (typeof App !== 'undefined' && App && App.state) {
        App.state.designerResults = payload;
        App.state.yieldResults = {
          date: payload.date,
          location: payload.location,
          system: { P_dc: pDc, P_ac: pAc, NOCT: noct, coeffPmax, tilt, azimuth, rho },
          losses,
          monthly,
          dcac,
          summary,
          source: 'system_designer',
          components: payload.components,
        };
      }

      designDirty=false;
      _renderResults(container, payload);
      container.querySelector('#sd-results').scrollIntoView({behavior:'smooth',block:'start'});
      App.toast('System Designer simulation completed', 'success');
    });

    container.querySelector('#sd-print-btn').addEventListener('click', () => {
      App.printSection('#sd-results', 'System Designer Report', container);
    });

    container.querySelector('#sd-open-yield').addEventListener('click', () => {
      App.navigate('yield');
    });
  }

  return { render };
})();
