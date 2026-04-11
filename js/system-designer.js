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
      try { return CatalogStore.getAllBatteries() || []; } catch (_) {}
    }
    return [];
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

  function _estimateSelfUse(annualPv, annualLoad, profile, batteryUsableKwh, pDc) {
    const pv = Math.max(0, Number(annualPv) || 0);
    const load = Math.max(0, Number(annualLoad) || 0);
    const base = _clamp(Number(profile.baseSelfUse) || 0.4, 0.15, 0.85);
    const battery = Math.max(0, Number(batteryUsableKwh) || 0);
    const pdc = Math.max(0.1, Number(pDc) || 0.1);

    const dailyPv = pv / 365;
    const batteryShiftDays = dailyPv > 0 ? battery / dailyPv : 0;
    const batteryBoost = _clamp(batteryShiftDays * 0.10, 0, 0.32);
    const batteryDensityBoost = _clamp((battery / pdc) * 0.01, 0, 0.10);
    const oversizePenalty = (load > 0 && pv > load)
      ? _clamp((pv / load - 1) * 0.08, 0, 0.16)
      : 0;

    const selfUseRatio = _clamp(base + batteryBoost + batteryDensityBoost - oversizePenalty, 0.15, 0.97);
    const selfConsumed_kWh = Math.min(pv * selfUseRatio, load);
    const gridExport_kWh = Math.max(0, pv - selfConsumed_kWh);
    const gridImport_kWh = Math.max(0, load - selfConsumed_kWh);

    return {
      selfUseRatio,
      selfConsumed_kWh,
      gridExport_kWh,
      gridImport_kWh,
      solarFraction: load > 0 ? (selfConsumed_kWh / load) : 0,
      batteryBoost,
      oversizePenalty,
    };
  }

  function _catalogLabel(panel, inverter, battery) {
    const tags = [];
    if (panel) tags.push('PV module');
    if (inverter) tags.push('Inverter');
    if (battery) tags.push('Battery');
    return tags.length ? `Catalogue-backed (${tags.join(', ')})` : 'Heuristic inputs';
  }

  function _componentSnapshot(panel, inverter, battery) {
    return {
      panel: panel ? {
        id: panel.id,
        manufacturer: panel.manufacturer,
        model: panel.model,
        Pmax: panel.Pmax,
        Voc: panel.Voc,
        Vmp: panel.Vmp,
        Isc: panel.Isc,
        Imp: panel.Imp,
        coeffPmax: panel.coeffPmax,
        NOCT: panel.NOCT,
      } : null,
      inverter: inverter ? {
        id: inverter.id,
        manufacturer: inverter.manufacturer,
        model: inverter.model,
        topology: inverter.topology,
        acRated_kW: inverter.acRated_kW,
        maxPv_kW: inverter.maxPv_kW,
        maxDcVoc_V: inverter.maxDcVoc_V,
        mpptMin_V: inverter.mpptMin_V,
        mpptMax_V: inverter.mpptMax_V,
        mpptCount: inverter.mpptCount,
        batteryBus_V: inverter.batteryBus_V,
      } : null,
      battery: battery ? {
        id: battery.id,
        manufacturer: battery.manufacturer,
        model: battery.model,
        nominalV: battery.nominalV,
        capacityAh: battery.capacityAh,
        recommendedDod: battery.recommendedDod,
        chemistry: battery.chemistry,
        continuousCharge_A: battery.continuousCharge_A,
        continuousDischarge_A: battery.continuousDischarge_A,
      } : null,
    };
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
    const monthlyRows = r.monthly.map((m, i) => `
      <tr>
        <td>${_esc(m.monthName)}</td>
        <td style="text-align:right">${_fmt(m.E_mon, 0)}</td>
        <td style="text-align:right">${_fmt(r.monthlyLoad[i].load_kWh, 0)}</td>
        <td style="text-align:right">${_fmt(Math.max(0, m.E_mon - r.monthlyLoad[i].load_kWh), 0)}</td>
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
      ? `${_esc(r.components.battery.manufacturer)} ${_esc(r.components.battery.model)} (${_esc(r.components.battery.nominalV)}V, ${_esc(r.components.battery.capacityAh)}Ah)`
      : 'Not selected';

    const resultsDiv = container.querySelector('#sd-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="card-title">&#128200; Simulation Summary</div>
        <div class="btn-group" style="margin-bottom:10px">
          <span class="status-badge ${_esc(confidenceCls)}">${_esc(r.catalogLabel)}</span>
          <span class="status-badge ${_esc(dcacCls)}">DC/AC ${_esc(r.dcac.ratio.toFixed(2))}</span>
          <span class="status-badge badge-pass">Profile: ${_esc(r.profile.label)}</span>
        </div>
        <div class="result-grid-3">
          <div class="result-box"><div class="result-value">${_fmt(r.summary.E_annual, 0)} kWh</div><div class="result-label">Annual PV Energy</div></div>
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
              <th style="text-align:right">Surplus (kWh)</th>
            </tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>

      <div class="info-box">
        <strong>Method note:</strong> PV generation uses the app yield physics (monthly irradiance, POA transposition,
        temperature model, and configured losses). Self-consumption and grid exchange are estimated from selected load
        profile and battery size heuristics, not sub-hourly measured load data.
      </div>
    `;

    const printBtn = container.querySelector('#sd-print-btn');
    if (printBtn) printBtn.classList.remove('hidden');
  }

  function render(container) {
    if (typeof YieldEstimator === 'undefined' || !YieldEstimator || typeof YieldEstimator.simulateMonthly !== 'function') {
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

    const locations = Array.isArray(YieldEstimator.SL_LOCATIONS) ? YieldEstimator.SL_LOCATIONS : [];
    const panels = _getPanels();
    const inverters = _getInverters();
    const batteries = _getBatteries();
    const defaultLoc = _nearestLocation(locations);
    const projectName = _projectLabel();

    container.innerHTML = `
      <div class="page">
        <div class="card">
          <div class="card-title">&#128736; System Designer (PV*SOL-style flow)</div>
          <div class="text-muted" style="font-size:0.82rem">
            Guided sequence: location and load, component selection, loss setup, then annual simulation and energy balance.
            ${projectName ? `Active project: <strong>${_esc(projectName)}</strong>.` : ''}
          </div>
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
          <div class="card-title">3. Catalog Components</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">PV Module (optional)</label>
              <select class="form-select" id="sd-panel">
                <option value="">Manual only</option>
                ${panels.map(p => `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${_esc(p.Pmax)}W)</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Inverter (optional)</label>
              <select class="form-select" id="sd-inverter">
                <option value="">Manual only</option>
                ${inverters.map(i => `<option value="${_esc(i.id)}">${_esc(i.manufacturer)} ${_esc(i.model)} (${_esc(i.acRated_kW)} kW)</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Battery (optional)</label>
              <select class="form-select" id="sd-battery">
                <option value="">No battery</option>
                ${batteries.map(b => `<option value="${_esc(b.id)}">${_esc(b.manufacturer)} ${_esc(b.model)} (${_esc(b.nominalV)}V, ${_esc(b.capacityAh)}Ah)</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Usable Battery (kWh)</label>
              <input class="form-input" id="sd-battery-kwh" type="number" min="0" step="0.1" value="0" />
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

        <div id="sd-results" class="hidden" style="margin-top:12px"></div>
      </div>
    `;

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

    let _syncingLoad = false;
    const manual = {
      pdc: false,
      pac: false,
      noct: false,
      gamma: false,
      battery: false,
    };

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
      if (!bat) return;
      const nominal = Number(bat.nominalV);
      const ah = Number(bat.capacityAh);
      const dod = Number.isFinite(Number(bat.recommendedDod)) ? Number(bat.recommendedDod) : 0.8;
      if (!manual.battery && Number.isFinite(nominal) && Number.isFinite(ah) && nominal > 0 && ah > 0) {
        const usable = nominal * ah * dod / 1000;
        batteryKwhEl.value = usable.toFixed(1);
      }
      if (typeof App !== 'undefined' && App) App.toast(`Battery loaded: ${bat.manufacturer} ${bat.model}`, 'success');
    });

    container.querySelector('#sd-autosize').addEventListener('click', () => {
      const annualLoad = _num(annualLoadEl.value, 0);
      if (!(annualLoad > 0)) {
        if (typeof App !== 'undefined' && App) App.toast('Enter annual load first', 'warning');
        return;
      }
      const suggested = _suggestDcFromLoad(annualLoad);
      pdcEl.value = suggested.toFixed(2);
      const pac = suggested / 1.2;
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
      if (coeffPmax >= 0) {
        App.toast('Pmax temperature coefficient should be negative', 'error');
        return;
      }

      const losses = {
        eta_inv: _clamp(etaInv, 0.7, 1),
        L_cable: _clamp(lossCable, 0, 0.4),
        L_soiling: _clamp(lossSoiling, 0, 0.4),
        L_mismatch: _clamp(lossMismatch, 0, 0.3),
        L_other: _clamp(lossOther, 0, 0.4),
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
      const selfUse = _estimateSelfUse(summary.E_annual, annualLoad, profile, batteryUsable, pDc);

      const panel = panels.find(p => String(p.id) === String(panelSel.value));
      const inverter = inverters.find(i => String(i.id) === String(inverterSel.value));
      const battery = batteries.find(b => String(b.id) === String(batterySel.value));

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

      const payload = {
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

      _renderResults(container, payload);
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
