/**
 * basic-calc.js — Basic Mode Quick Calculator
 * Panel/inverter/battery from DB or manual entry.
 * Grid-Tie, Off-Grid, Hybrid calculations.
 * Wire sizing, protection devices, cost estimate.
 */

var BasicCalc = (() => {

  // -----------------------------------------------------------------------
  // Cost data — bundled fallback (LKR, approximate April 2025)
  // -----------------------------------------------------------------------
  const COSTS_FALLBACK = {
    updatedAt: '2025-04',
    currency: 'LKR',
    note: 'Approximate Sri Lanka market prices. Verify with your supplier.',
    pvModulePerWp: 38,
    gridInverterPerW: 45,
    hybridInverterPerW: 65,
    offgridInverterPerW: 55,
    batteryLiFePO4PerKwh: 85000,
    batteryLeadAcidPerKwh: 32000,
    mountingRooftopPerWp: 6,
    mountingGroundPerWp: 10,
    dc6mmCuPerM: 380,
    dc4mmCuPerM: 260,
    ac4mmCuPerM: 290,
    ac6mmCuPerM: 410,
    ac10mmCuPerM: 600,
    ac16mmCuPerM: 950,
    ac25mmCuPerM: 1450,
    mcb1pPer: 1200,
    mcb3pPer: 3800,
    acbPer: 8500,
    dcFuseholderPer: 950,
    spd1pPer: 2500,
    earthing: 12000,
    labour_pct: 0.12,
    bos_pct: 0.08,
  };

  let _costs = null;
  let _costsSource = 'bundled';

  async function _loadCosts() {
    if (_costs) return;
    const url = 'https://raw.githubusercontent.com/heshanthar-boop/solar-pv/main/data/lk-costs.json';
    try {
      const res = await fetch(url, { cache: 'default' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.pvModulePerWp) {
          _costs = Object.assign({}, COSTS_FALLBACK, json);
          _costsSource = 'online (' + (_costs.updatedAt || '?') + ')';
          return;
        }
      }
    } catch (_) {}
    _costs = COSTS_FALLBACK;
    _costsSource = 'bundled (' + COSTS_FALLBACK.updatedAt + ')';
  }

  // -----------------------------------------------------------------------
  // Wire size quick lookup (IEC 60364-5-52 simplified, copper, conduit, 35°C)
  // -----------------------------------------------------------------------
  const WIRE_TABLE = [
    [13, 1.5], [18, 2.5], [24, 4], [32, 6], [43, 10],
    [57, 16], [75, 25], [92, 35], [120, 50], [150, 70], [180, 95],
  ];

  function _wireCSA(amps) {
    const design = amps * 1.25;
    for (const [maxA, csa] of WIRE_TABLE) {
      if (design <= maxA) return { csa, design: design.toFixed(1) };
    }
    return { csa: 120, design: design.toFixed(1) };
  }

  function _breakerA(amps) {
    const steps = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    for (const s of steps) if (s >= amps * 1.25) return s;
    return 125;
  }

  function _fmt(n) { return Number(n).toLocaleString('en-LK'); }
  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // -----------------------------------------------------------------------
  // DB helpers
  // -----------------------------------------------------------------------
  function _getPanels() {
    if (typeof DB !== 'undefined') {
      try { return DB.getAll() || []; } catch (_) {}
    }
    return [];
  }

  function _getInverters() {
    if (typeof CatalogStore !== 'undefined') {
      try { return CatalogStore.getAllInverters() || []; } catch (_) {}
    }
    return [];
  }

  function _getBatteries() {
    if (typeof CatalogStore !== 'undefined') {
      try { return CatalogStore.getAllBatteries() || []; } catch (_) {}
    }
    return [];
  }

  // -----------------------------------------------------------------------
  // Core calculation — Grid-Tie
  // -----------------------------------------------------------------------
  function _calcGridTie(inp) {
    const c = _costs || COSTS_FALLBACK;
    const { sysKwp, modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType } = inp;

    const panelCount = Math.ceil((sysKwp * 1000) / modPmax);
    const actualKwp = (panelCount * modPmax) / 1000;
    const actualStrings = Math.ceil(panelCount / modPerString);
    const stringVoc = modVoc * modPerString;
    const arrayIsc = modIsc * actualStrings;
    const invDcKw = (actualKwp * 1.05).toFixed(1);
    const invAcKw = actualKwp.toFixed(1);

    const dcCable = _wireCSA(modIsc * 1.25);
    const dcBreaker = 'String fuse ' + _breakerA(modIsc) + 'A (DC rated)';

    const acCurrent = acPhase === 3
      ? (actualKwp * 1000) / (acVoltage * Math.sqrt(3) * 0.97)
      : (actualKwp * 1000) / (acVoltage * 0.97);
    const acCable = _wireCSA(acCurrent);
    const acBreaker = _breakerA(acCurrent);

    // Costs
    const modCost = panelCount * modPmax * c.pvModulePerWp;
    const invCost = actualKwp * 1000 * c.gridInverterPerW;
    const mountCost = actualKwp * 1000 * (roofType === 'ground' ? c.mountingGroundPerWp : c.mountingRooftopPerWp);
    const cableCost = actualStrings * 30 * 2 * (dcCable.csa >= 6 ? c.dc6mmCuPerM : c.dc4mmCuPerM)
                    + 20 * (acCable.csa >= 10 ? c.ac10mmCuPerM : acCable.csa >= 6 ? c.ac6mmCuPerM : c.ac4mmCuPerM);
    const protCost = actualStrings * c.dcFuseholderPer + (acPhase === 1 ? c.mcb1pPer : c.mcb3pPer) * 2
                   + c.spd1pPer * 2 + c.earthing + c.acbPer;
    const materialTotal = modCost + invCost + mountCost + cableCost + protCost;
    const bosCost = modCost * c.bos_pct;
    const labourCost = (materialTotal + bosCost) * c.labour_pct;
    const grandTotal = materialTotal + bosCost + labourCost;

    return {
      type: 'gridtie',
      panelCount, actualKwp: actualKwp.toFixed(2),
      actualStrings, stringVoc: stringVoc.toFixed(1),
      stringIsc: modIsc.toFixed(2), arrayIsc: arrayIsc.toFixed(2),
      invDcKw, invAcKw,
      dcCable, dcBreaker, acCable, acBreaker,
      acCurrent: acCurrent.toFixed(1), acPhase,
      cost: { modCost, invCost, mountCost, batCost: 0, cableCost, protCost, bosCost, labourCost, grandTotal, source: _costsSource }
    };
  }

  // -----------------------------------------------------------------------
  // Core calculation — Hybrid
  // -----------------------------------------------------------------------
  function _calcHybrid(inp) {
    const c = _costs || COSTS_FALLBACK;
    const { sysKwp, modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType,
            batKwh, batVoltage, backupHours, dailyLoadKwh } = inp;

    // Same PV sizing as grid-tie
    const panelCount = Math.ceil((sysKwp * 1000) / modPmax);
    const actualKwp = (panelCount * modPmax) / 1000;
    const actualStrings = Math.ceil(panelCount / modPerString);
    const stringVoc = modVoc * modPerString;
    const arrayIsc = modIsc * actualStrings;
    const invDcKw = (actualKwp * 1.05).toFixed(1);
    const invAcKw = actualKwp.toFixed(1);

    const dcCable = _wireCSA(modIsc * 1.25);
    const dcBreaker = 'String fuse ' + _breakerA(modIsc) + 'A (DC rated)';

    const acCurrent = acPhase === 3
      ? (actualKwp * 1000) / (acVoltage * Math.sqrt(3) * 0.97)
      : (actualKwp * 1000) / (acVoltage * 0.97);
    const acCable = _wireCSA(acCurrent);
    const acBreaker = _breakerA(acCurrent);

    // Battery: user-specified kWh, or derived from backup hours × daily load
    let actualBatKwh = batKwh;
    if (!actualBatKwh && backupHours && dailyLoadKwh) {
      actualBatKwh = (dailyLoadKwh / 24) * backupHours / 0.85; // DoD 85%
    }
    const batCapAh = actualBatKwh ? ((actualBatKwh * 1000) / batVoltage).toFixed(0) : 0;
    const invChargeA = actualBatKwh > 5 ? 50 : 30;
    const batCable = _wireCSA(invChargeA * 1.1);
    const batBreaker = _breakerA(invChargeA);
    const backupHrsCalc = actualBatKwh && dailyLoadKwh
      ? ((actualBatKwh * 0.85) / (dailyLoadKwh / 24)).toFixed(1) : null;

    // Costs
    const modCost = panelCount * modPmax * c.pvModulePerWp;
    const invCost = actualKwp * 1000 * c.hybridInverterPerW;
    const mountCost = actualKwp * 1000 * (roofType === 'ground' ? c.mountingGroundPerWp : c.mountingRooftopPerWp);
    const batCost = actualBatKwh * c.batteryLiFePO4PerKwh;
    const cableCost = actualStrings * 30 * 2 * (dcCable.csa >= 6 ? c.dc6mmCuPerM : c.dc4mmCuPerM)
                    + 20 * (acCable.csa >= 10 ? c.ac10mmCuPerM : acCable.csa >= 6 ? c.ac6mmCuPerM : c.ac4mmCuPerM)
                    + 6 * batCable.csa * 3; // rough 3m battery cable
    const protCost = actualStrings * c.dcFuseholderPer + (acPhase === 1 ? c.mcb1pPer : c.mcb3pPer) * 2
                   + c.spd1pPer * 2 + c.earthing + c.acbPer;
    const materialTotal = modCost + invCost + mountCost + batCost + cableCost + protCost;
    const bosCost = modCost * c.bos_pct;
    const labourCost = (materialTotal + bosCost) * c.labour_pct;
    const grandTotal = materialTotal + bosCost + labourCost;

    return {
      type: 'hybrid',
      panelCount, actualKwp: actualKwp.toFixed(2),
      actualStrings, stringVoc: stringVoc.toFixed(1),
      stringIsc: modIsc.toFixed(2), arrayIsc: arrayIsc.toFixed(2),
      invDcKw, invAcKw,
      dcCable, dcBreaker, acCable, acBreaker,
      acCurrent: acCurrent.toFixed(1), acPhase,
      bat: { actualBatKwh: actualBatKwh.toFixed(1), batCapAh, batVoltage, invChargeA, batCable, batBreaker, backupHrsCalc },
      cost: { modCost, invCost, mountCost, batCost, cableCost, protCost, bosCost, labourCost, grandTotal, source: _costsSource }
    };
  }

  // -----------------------------------------------------------------------
  // Core calculation — Off-Grid
  // -----------------------------------------------------------------------
  function _calcOffGrid(inp) {
    const c = _costs || COSTS_FALLBACK;
    const { modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType,
            dailyLoadKwh, peakSunHrs, autonomyDays, batVoltage, batType } = inp;

    // Panel count from daily load
    const systemLoss = 0.80; // 80% efficiency
    const arrayKwp = dailyLoadKwh / (peakSunHrs * systemLoss);
    const panelCount = Math.ceil((arrayKwp * 1000) / modPmax);
    const actualKwp = (panelCount * modPmax) / 1000;
    const actualStrings = Math.ceil(panelCount / modPerString);
    const stringVoc = modVoc * modPerString;
    const arrayIsc = modIsc * actualStrings;

    // Battery bank
    const dod = batType === 'lifepo4' ? 0.90 : 0.50; // LiFePO4 90% DoD, SLA 50%
    const batKwh = (dailyLoadKwh * autonomyDays) / dod;
    const batCapAh = ((batKwh * 1000) / batVoltage).toFixed(0);

    // Charge controller (MPPT)
    const mpptA = Math.ceil((actualKwp * 1000) / batVoltage * 1.25);

    // Inverter: peak load
    const peakLoadKw = (dailyLoadKwh / peakSunHrs * 1.5); // rough peak factor
    const invKw = peakLoadKw.toFixed(1);

    // Cables
    const dcCable = _wireCSA(modIsc * 1.25);
    const mpptCable = _wireCSA(mpptA);
    const acCurrent = acPhase === 3
      ? (peakLoadKw * 1000) / (acVoltage * Math.sqrt(3) * 0.95)
      : (peakLoadKw * 1000) / (acVoltage * 0.95);
    const acCable = _wireCSA(acCurrent);
    const acBreaker = _breakerA(acCurrent);
    const batChargeA = mpptA;
    const batCable = _wireCSA(batChargeA * 1.1);
    const batBreaker = _breakerA(batChargeA);

    // Costs
    const modCost = panelCount * modPmax * c.pvModulePerWp;
    const invCost = peakLoadKw * 1000 * c.offgridInverterPerW;
    const mountCost = actualKwp * 1000 * (roofType === 'ground' ? c.mountingGroundPerWp : c.mountingRooftopPerWp);
    const batCostPer = batType === 'lifepo4' ? c.batteryLiFePO4PerKwh : c.batteryLeadAcidPerKwh;
    const batCost = batKwh * batCostPer;
    const mpptCost = mpptA > 60 ? 45000 : mpptA > 30 ? 28000 : 18000; // rough MPPT controller cost
    const cableCost = actualStrings * 30 * 2 * (dcCable.csa >= 6 ? c.dc6mmCuPerM : c.dc4mmCuPerM)
                    + 6 * batCable.csa * 3 + 20 * (acCable.csa >= 6 ? c.ac6mmCuPerM : c.ac4mmCuPerM);
    const protCost = actualStrings * c.dcFuseholderPer + c.mcb1pPer * 2 + c.spd1pPer + c.earthing;
    const materialTotal = modCost + invCost + mountCost + batCost + mpptCost + cableCost + protCost;
    const bosCost = modCost * c.bos_pct;
    const labourCost = (materialTotal + bosCost) * c.labour_pct;
    const grandTotal = materialTotal + bosCost + labourCost;

    return {
      type: 'offgrid',
      panelCount, actualKwp: actualKwp.toFixed(2),
      actualStrings, stringVoc: stringVoc.toFixed(1),
      stringIsc: modIsc.toFixed(2), arrayIsc: arrayIsc.toFixed(2),
      invKw, mpptA,
      dcCable, acCable, acBreaker,
      acCurrent: acCurrent.toFixed(1), acPhase,
      bat: { batKwh: batKwh.toFixed(1), batCapAh, batVoltage, batType, batCable, batBreaker, autonomyDays },
      cost: { modCost, invCost, mountCost, batCost, mpptCost, cableCost, protCost, bosCost, labourCost, grandTotal, source: _costsSource }
    };
  }

  // -----------------------------------------------------------------------
  // Build panel selector HTML
  // -----------------------------------------------------------------------
  function _panelSelectorHtml(panels) {
    if (!panels.length) return '';
    const opts = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer + ' ' + p.model)} (${p.Pmax}W, Voc ${p.Voc}V, Isc ${p.Isc}A)</option>`
    ).join('');
    return `
      <div class="form-group" id="bc-panel-db-wrap" style="grid-column:1/-1">
        <label class="form-label">Select Panel from Database</label>
        <select class="form-select" id="bc-panel-sel">
          <option value="">— manual entry —</option>
          ${opts}
        </select>
      </div>`;
  }

  function _inverterSelectorHtml(invs, sysType) {
    const filtered = invs.filter(inv => {
      if (sysType === 'gridtie') return inv.topology === 'grid-tie' || !inv.topology;
      if (sysType === 'hybrid') return inv.topology === 'hybrid';
      return true; // offgrid: show all
    });
    if (!filtered.length) return '';
    const opts = filtered.map(i =>
      `<option value="${_esc(i.id)}">${_esc((i.manufacturer || '') + ' ' + (i.model || ''))} (${i.acRated_kW || '?'} kW)</option>`
    ).join('');
    return `
      <div class="form-group" id="bc-inv-db-wrap" style="grid-column:1/-1">
        <label class="form-label">Select Inverter from Database <span class="text-muted" style="font-size:0.8rem">(optional — for reference)</span></label>
        <select class="form-select" id="bc-inv-sel">
          <option value="">— not selected —</option>
          ${opts}
        </select>
      </div>`;
  }

  function _batterySelectorHtml(bats) {
    if (!bats.length) return '';
    const opts = bats.map(b =>
      `<option value="${_esc(b.id)}">${_esc((b.manufacturer || '') + ' ' + (b.model || ''))} (${b.nominalV}V, ${b.capacityAh}Ah)</option>`
    ).join('');
    return `
      <div class="form-group" id="bc-bat-db-wrap" style="grid-column:1/-1">
        <label class="form-label">Select Battery from Database <span class="text-muted" style="font-size:0.8rem">(optional)</span></label>
        <select class="form-select" id="bc-bat-sel">
          <option value="">— manual entry —</option>
          ${opts}
        </select>
      </div>`;
  }

  // -----------------------------------------------------------------------
  // Onboarding steps (basic mode version)
  // -----------------------------------------------------------------------
  function _progressState() {
    if (typeof App === 'undefined' || !App || !App.state) return { panelReady: false, calculated: false };
    if (!App.state.basicCalcProgress || typeof App.state.basicCalcProgress !== 'object') {
      App.state.basicCalcProgress = { panelReady: false, calculated: false };
    }
    return App.state.basicCalcProgress;
  }

  function _setProgress(patch) {
    if (typeof App === 'undefined' || !App || !App.state || !patch || typeof patch !== 'object') return;
    const progress = _progressState();
    Object.assign(progress, patch);
  }

  function _panelInputReady(container) {
    const panelSel = container ? container.querySelector('#bc-panel-sel') : null;
    if (panelSel && panelSel.value) return true;
    const pmax = _getVal(container, '#bc-pmax', 0);
    const voc = _getVal(container, '#bc-voc', 0);
    const isc = _getVal(container, '#bc-isc', 0);
    return pmax > 0 && voc > 0 && isc > 0;
  }

  function _focusInView(container, blockSel, focusSel) {
    const block = container.querySelector(blockSel);
    if (block && typeof block.scrollIntoView === 'function') {
      block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const focusEl = container.querySelector(focusSel);
    if (focusEl && typeof focusEl.focus === 'function') {
      window.setTimeout(() => {
        try { focusEl.focus({ preventScroll: true }); } catch (_) { focusEl.focus(); }
      }, 180);
    }
  }

  function _runOnboardAction(container, action) {
    if (action === 'project') {
      if (typeof App !== 'undefined' && App && typeof App.openProjectEditor === 'function') {
        App.openProjectEditor();
      } else if (typeof App !== 'undefined' && App && typeof App.navigate === 'function') {
        App.navigate('settings');
      }
      return;
    }
    if (action === 'panel') {
      _focusInView(container, '#bc-panel-card', '#bc-panel-sel');
      const panelSel = container.querySelector('#bc-panel-sel');
      const fallback = container.querySelector('#bc-pmax');
      if ((!panelSel || !panelSel.value) && fallback && typeof fallback.focus === 'function') {
        fallback.focus();
      }
      return;
    }
    if (action === 'calculate') {
      _focusInView(container, '#bc-systype-tabs', '#bc-calc-btn');
    }
  }

  function _bindOnboardActions(container) {
    container.querySelectorAll('[data-bc-onboard-action]').forEach(step => {
      if (step.dataset.bcOnboardBound === '1') return;
      step.dataset.bcOnboardBound = '1';
      const action = step.dataset.bcOnboardAction;
      step.addEventListener('click', () => _runOnboardAction(container, action));
      step.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          _runOnboardAction(container, action);
        }
      });
    });
  }

  function _refreshOnboard(container) {
    const oldNode = container.querySelector('#bc-onboard');
    const html = _onboardHtml();
    if (!html) {
      if (oldNode) oldNode.remove();
      return;
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const nextNode = wrap.firstElementChild;
    if (!nextNode) return;

    if (oldNode) {
      oldNode.replaceWith(nextNode);
    } else {
      const anchor = container.querySelector('.basic-calc-header');
      if (anchor) anchor.insertAdjacentElement('afterend', nextNode);
      else container.prepend(nextNode);
    }
    _bindOnboardActions(container);
  }

  function _onboardHtml() {
    const p = typeof App !== 'undefined' ? App.getProject() : {};
    const hasProject = !!(p && (p.name || p.client || p.siteAddress));
    const progress = _progressState();
    const hasPanel = !!progress.panelReady;

    const steps = [
      { num: 1, action: 'project', title: 'Set your project', desc: 'Name, client, site - optional but useful', done: hasProject },
      { num: 2, action: 'panel', title: 'Select or enter panel data', desc: 'Pick from database or type Pmax, Voc, Isc', done: hasPanel },
      { num: 3, action: 'calculate', title: 'Choose system type & calculate', desc: 'Grid-Tie, Off-Grid, or Hybrid', done: !!progress.calculated },
    ];

    const allDone = steps.every(s => s.done);
    if (allDone) return '';

    return `
      <div class="home-onboard" id="bc-onboard">
        <div class="home-onboard-title">&#9654; Get started &mdash; 3 quick steps</div>
        <div class="home-onboard-steps">
          ${steps.map(s => `
            <div class="home-onboard-step actionable ${s.done ? 'done' : ''}" data-bc-onboard-action="${_esc(s.action)}" role="button" tabindex="0">
              <span class="home-onboard-num">${s.done ? '&#10003;' : s.num}</span>
              <div class="home-onboard-step-text">
                <div class="home-onboard-step-title">${_esc(s.title)}</div>
                <div class="home-onboard-step-desc">${_esc(s.desc)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // -----------------------------------------------------------------------
  // Render - main entry point
  // -----------------------------------------------------------------------
  async function render(container) {
    const panels = _getPanels();
    const inverters = _getInverters();
    const batteries = _getBatteries();

    container.innerHTML = `
      <div class="page basic-calc-page">
        <div class="basic-calc-header">
          <div class="basic-calc-title">&#9889; Quick Solar Calculator</div>
          <div class="basic-calc-subtitle">Fast estimates — panel count, wiring, cost</div>
        </div>

        ${_onboardHtml()}

        <!-- System Type Selector -->
        <div class="card">
          <div class="card-title">System Type</div>
          <div class="bc-systype-tabs" id="bc-systype-tabs">
            <button class="bc-tab active" data-type="gridtie">&#9889; Grid-Tie</button>
            <button class="bc-tab" data-type="offgrid">&#9875; Off-Grid</button>
            <button class="bc-tab" data-type="hybrid">&#128268; Hybrid</button>
          </div>
        </div>

        <!-- Panel Card -->
        <div class="card" id="bc-panel-card">
          <div class="card-title">PV Module</div>
          <div class="form-row cols-2">
            ${_panelSelectorHtml(panels)}
            <div class="form-group">
              <label class="form-label">Pmax (W)</label>
              <input class="form-input" id="bc-pmax" type="number" value="550" min="50" step="5" />
            </div>
            <div class="form-group">
              <label class="form-label">Voc (V)</label>
              <input class="form-input" id="bc-voc" type="number" value="49.5" step="0.1" />
            </div>
            <div class="form-group">
              <label class="form-label">Isc (A)</label>
              <input class="form-input" id="bc-isc" type="number" value="14.2" step="0.1" />
            </div>
            <div class="form-group">
              <label class="form-label">Modules per String</label>
              <input class="form-input" id="bc-modstring" type="number" value="20" min="1" max="50" />
            </div>
          </div>
        </div>

        <!-- Grid-Tie / Hybrid — system kWp -->
        <div class="card" id="bc-kwp-card">
          <div class="card-title">System Size</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">System Size (kWp)</label>
              <input class="form-input" id="bc-kwp" type="number" value="10" min="0.1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">AC Phase</label>
              <select class="form-select" id="bc-acphase">
                <option value="1">Single Phase (230V)</option>
                <option value="3">Three Phase (400V)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Mount Type</label>
              <select class="form-select" id="bc-roof">
                <option value="rooftop">Rooftop</option>
                <option value="ground">Ground Mount</option>
              </select>
            </div>
          </div>
          ${_inverterSelectorHtml(inverters, 'gridtie')}
        </div>

        <!-- Off-Grid specific -->
        <div class="card hidden" id="bc-offgrid-card">
          <div class="card-title">Load &amp; Site</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Daily Load (kWh/day)</label>
              <input class="form-input" id="bc-dailyload" type="number" value="5" min="0.1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Peak Sun Hours</label>
              <input class="form-input" id="bc-psh" type="number" value="5" min="1" step="0.5" />
              <div class="form-hint">Sri Lanka avg: 4.5–5.5 h/day</div>
            </div>
            <div class="form-group">
              <label class="form-label">Autonomy (days)</label>
              <input class="form-input" id="bc-autonomy" type="number" value="1" min="0.5" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">AC Phase</label>
              <select class="form-select" id="bc-offgrid-acphase">
                <option value="1">Single Phase (230V)</option>
                <option value="3">Three Phase (400V)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Mount Type</label>
              <select class="form-select" id="bc-offgrid-roof">
                <option value="rooftop">Rooftop</option>
                <option value="ground">Ground Mount</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Hybrid specific -->
        <div class="card hidden" id="bc-hybrid-card">
          <div class="card-title">Hybrid — Backup &amp; Load</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Daily Load (kWh/day) <span class="text-muted" style="font-size:0.8rem">for backup calc</span></label>
              <input class="form-input" id="bc-hy-dailyload" type="number" value="20" min="0.1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Backup Duration (hours)</label>
              <input class="form-input" id="bc-hy-backup" type="number" value="4" min="0.5" step="0.5" />
            </div>
          </div>
        </div>

        <!-- Battery Card — shown for offgrid/hybrid -->
        <div class="card hidden" id="bc-bat-card">
          <div class="card-title">Battery Bank</div>
          <div class="form-row cols-2">
            ${_batterySelectorHtml(batteries)}
            <div class="form-group" id="bc-bat-kwh-wrap">
              <label class="form-label">Battery Capacity (kWh) <span class="text-muted" style="font-size:0.8rem" id="bc-bat-kwh-hint">— or auto from backup hours</span></label>
              <input class="form-input" id="bc-batkwh" type="number" value="" min="1" step="0.5" placeholder="auto" />
            </div>
            <div class="form-group">
              <label class="form-label">Battery Voltage (V)</label>
              <select class="form-select" id="bc-batvolt">
                <option value="48">48V</option>
                <option value="51.2">51.2V (LiFePO4)</option>
                <option value="96">96V</option>
                <option value="192">192V</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Battery Type</label>
              <select class="form-select" id="bc-battype">
                <option value="lifepo4">LiFePO4 (recommended)</option>
                <option value="sla">Sealed Lead Acid</option>
              </select>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="bc-calc-btn" style="margin-bottom:12px">&#9889; Calculate</button>

        <div id="bc-results" class="hidden"></div>
      </div>
    `;

    _loadCosts();
    _bindEvents(container, panels, inverters, batteries);

    // Pre-fill from roof layout result if navigated here via "Use in Calculator"
    _applyRoofLayoutPreFill(container, panels);
  }

  function _applyRoofLayoutPreFill(container, panels) {
    if (typeof App === 'undefined' || !App.state || !App.state.roofLayoutResult) return;
    const rl = App.state.roofLayoutResult;

    // Only auto-apply once per navigation — clear after reading
    App.state.roofLayoutResult = null;

    // Fill kWp from layout if available
    if (rl.kwp) {
      _setVal(container, '#bc-kwp', rl.kwp);
    }

    // Fill modules per string from layout's pps
    if (rl.pps) {
      _setVal(container, '#bc-modstring', rl.pps);
    }

    // If a panel was selected in roof layout, select it here too
    if (rl.panelId) {
      const panelSel = container.querySelector('#bc-panel-sel');
      if (panelSel) {
        panelSel.value = rl.panelId;
        // Trigger fill of Pmax/Voc/Isc
        panelSel.dispatchEvent(new Event('change'));
      }
    }

    // Show a banner confirming the data came from roof layout
    const banner = document.createElement('div');
    banner.className = 'info-box';
    banner.style.cssText = 'margin-bottom:10px;font-size:0.82rem';
    banner.innerHTML = `&#127968; Loaded from Roof Layout: <strong>${rl.total} panels</strong>${rl.kwp ? ', <strong>' + rl.kwp + ' kWp</strong>' : ''}, ${rl.numStrings} string${rl.numStrings !== 1 ? 's' : ''} &bull; <a href="#" id="bc-clear-rl" style="color:var(--text-muted)">clear</a>`;
    const page = container.querySelector('.basic-calc-page');
    if (page) page.insertBefore(banner, page.firstChild);
    banner.querySelector('#bc-clear-rl').addEventListener('click', e => { e.preventDefault(); banner.remove(); });
  }

  // -----------------------------------------------------------------------
  // Bind events
  // -----------------------------------------------------------------------
  function _bindEvents(container, panels, inverters, batteries) {
    let currentType = 'gridtie';

    const tabs = container.querySelectorAll('.bc-tab');
    const kwpCard = container.querySelector('#bc-kwp-card');
    const offgridCard = container.querySelector('#bc-offgrid-card');
    const hybridCard = container.querySelector('#bc-hybrid-card');
    const batCard = container.querySelector('#bc-bat-card');

    function _switchType(type) {
      currentType = type;
      tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));

      kwpCard.classList.toggle('hidden', type === 'offgrid');
      offgridCard.classList.toggle('hidden', type !== 'offgrid');
      hybridCard.classList.toggle('hidden', type !== 'hybrid');
      batCard.classList.toggle('hidden', type === 'gridtie');

      // Refresh inverter selector for this type
      const invWrap = kwpCard.querySelector('#bc-inv-db-wrap');
      if (invWrap) invWrap.remove();
      if (type !== 'offgrid') {
        const filtered = inverters.filter(inv => {
          if (type === 'gridtie') return inv.topology === 'grid-tie' || !inv.topology;
          if (type === 'hybrid') return inv.topology === 'hybrid';
          return true;
        });
        if (filtered.length) {
          const html = _inverterSelectorHtml(filtered.length ? filtered : inverters, type);
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const newWrap = tmp.firstElementChild;
          if (newWrap) kwpCard.querySelector('.form-row').appendChild(newWrap);
          _bindInverterSel(container, filtered.length ? filtered : inverters, type);
        }
      }
    }

    tabs.forEach(t => t.addEventListener('click', () => _switchType(t.dataset.type)));
    _bindOnboardActions(container);

    // Panel DB selector
    const panelSel = container.querySelector('#bc-panel-sel');
    if (panelSel) {
      panelSel.addEventListener('change', () => {
        const id = panelSel.value;
        if (!id) return;
        const panel = panels.find(p => String(p.id) === id);
        if (!panel) return;
        _setVal(container, '#bc-pmax', panel.Pmax);
        _setVal(container, '#bc-voc', panel.Voc);
        _setVal(container, '#bc-isc', panel.Isc);
        // Auto-calc modules per string for ~600–1000V target
        if (panel.Voc) {
          const target = 800; // mid-range DC voltage
          const mps = Math.round(target / panel.Voc);
          _setVal(container, '#bc-modstring', Math.max(1, Math.min(mps, 30)));
        }
        _setProgress({ panelReady: _panelInputReady(container), calculated: false });
        _refreshOnboard(container);
        App.toast('Panel data loaded: ' + panel.manufacturer + ' ' + panel.model, 'success');
      });
    }

    ['#bc-pmax', '#bc-voc', '#bc-isc'].forEach(sel => {
      const el = container.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        _setProgress({ panelReady: _panelInputReady(container), calculated: false });
        _refreshOnboard(container);
      });
    });

    // Battery DB selector
    const batSel = container.querySelector('#bc-bat-sel');
    if (batSel) {
      batSel.addEventListener('change', () => {
        const id = batSel.value;
        if (!id) return;
        const bat = batteries.find(b => String(b.id) === id);
        if (!bat) return;
        _setVal(container, '#bc-batvolt', bat.nominalV);
        // Convert Ah to kWh and fill
        const kWh = ((bat.nominalV * bat.capacityAh) / 1000).toFixed(1);
        _setVal(container, '#bc-batkwh', kWh);
        App.toast('Battery data loaded: ' + (bat.manufacturer || '') + ' ' + (bat.model || ''), 'success');
      });
    }

    _bindInverterSel(container, inverters, 'gridtie');

    [
      '#bc-modstring', '#bc-kwp', '#bc-acphase', '#bc-roof',
      '#bc-dailyload', '#bc-psh', '#bc-autonomy', '#bc-offgrid-acphase', '#bc-offgrid-roof',
      '#bc-hy-dailyload', '#bc-hy-backup', '#bc-batkwh', '#bc-batvolt', '#bc-battype',
      '#bc-inv-sel', '#bc-bat-sel'
    ].forEach(sel => {
      const el = container.querySelector(sel);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        _setProgress({ calculated: false });
        _refreshOnboard(container);
      });
    });

    _setProgress({ panelReady: _panelInputReady(container) });
    _refreshOnboard(container);

    // Calculate
    container.querySelector('#bc-calc-btn').addEventListener('click', async () => {
      await _loadCosts();
      _doCalculate(container, currentType);
    });
  }

  function _bindInverterSel(container, inverters, type) {
    const invSel = container.querySelector('#bc-inv-sel');
    if (!invSel) return;
    invSel.addEventListener('change', () => {
      const id = invSel.value;
      if (!id) return;
      const inv = inverters.find(i => String(i.id) === id);
      if (!inv) return;
      // Fill system kWp from inverter rated kW if blank
      const kwpEl = container.querySelector('#bc-kwp');
      if (kwpEl && (!kwpEl.value || parseFloat(kwpEl.value) === 10)) {
        _setVal(container, '#bc-kwp', inv.acRated_kW || 10);
      }
      App.toast('Inverter: ' + (inv.manufacturer || '') + ' ' + (inv.model || '') + ' — ' + (inv.acRated_kW || '?') + ' kW', 'success');
    });
  }

  function _setVal(container, sel, val) {
    const el = container.querySelector(sel);
    if (el) el.value = val;
  }

  function _getVal(container, sel, def) {
    const el = container.querySelector(sel);
    return el ? (parseFloat(el.value) || def) : def;
  }

  function _getSelVal(container, sel, def) {
    const el = container.querySelector(sel);
    return el ? (el.value || def) : def;
  }

  // -----------------------------------------------------------------------
  // Do calculation dispatch
  // -----------------------------------------------------------------------
  function _doCalculate(container, type) {
    const modPmax = _getVal(container, '#bc-pmax', 550);
    const modVoc = _getVal(container, '#bc-voc', 49.5);
    const modIsc = _getVal(container, '#bc-isc', 14.2);
    const modPerString = _getVal(container, '#bc-modstring', 20);

    if (!modPmax || !modVoc || !modIsc) {
      App.toast('Enter module Pmax, Voc, Isc', 'error'); return;
    }

    let r;

    if (type === 'gridtie') {
      const sysKwp = _getVal(container, '#bc-kwp', 10);
      const acPhase = _getVal(container, '#bc-acphase', 1);
      const acVoltage = acPhase === 3 ? 400 : 230;
      const roofType = _getSelVal(container, '#bc-roof', 'rooftop');
      if (!sysKwp) { App.toast('Enter system size (kWp)', 'error'); return; }
      r = _calcGridTie({ sysKwp, modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType });

    } else if (type === 'hybrid') {
      const sysKwp = _getVal(container, '#bc-kwp', 10);
      const acPhase = _getVal(container, '#bc-acphase', 1);
      const acVoltage = acPhase === 3 ? 400 : 230;
      const roofType = _getSelVal(container, '#bc-roof', 'rooftop');
      const dailyLoadKwh = _getVal(container, '#bc-hy-dailyload', 20);
      const backupHours = _getVal(container, '#bc-hy-backup', 4);
      const batKwhRaw = _getVal(container, '#bc-batkwh', 0);
      const batVoltage = _getVal(container, '#bc-batvolt', 48);
      if (!sysKwp) { App.toast('Enter system size (kWp)', 'error'); return; }
      r = _calcHybrid({ sysKwp, modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType,
                        batKwh: batKwhRaw || 0, batVoltage, backupHours, dailyLoadKwh });

    } else { // offgrid
      const dailyLoadKwh = _getVal(container, '#bc-dailyload', 5);
      const peakSunHrs = _getVal(container, '#bc-psh', 5);
      const autonomyDays = _getVal(container, '#bc-autonomy', 1);
      const acPhase = _getVal(container, '#bc-offgrid-acphase', 1);
      const acVoltage = acPhase === 3 ? 400 : 230;
      const roofType = _getSelVal(container, '#bc-offgrid-roof', 'rooftop');
      const batVoltage = _getVal(container, '#bc-batvolt', 48);
      const batType = _getSelVal(container, '#bc-battype', 'lifepo4');
      if (!dailyLoadKwh) { App.toast('Enter daily load (kWh)', 'error'); return; }
      r = _calcOffGrid({ modPmax, modVoc, modIsc, modPerString, acPhase, acVoltage, roofType,
                         dailyLoadKwh, peakSunHrs, autonomyDays, batVoltage, batType });
    }

    _renderResults(container, r);
    _setProgress({ panelReady: _panelInputReady(container), calculated: true });
    _refreshOnboard(container);
  }

  // -----------------------------------------------------------------------
  // Render results
  // -----------------------------------------------------------------------
  function _renderResults(container, r) {
    const c = r.cost;
    const div = container.querySelector('#bc-results');
    div.classList.remove('hidden');

    // Summary items
    let summaryItems = `
      <div class="basic-result-item">
        <div class="basic-result-val">${r.panelCount}</div>
        <div class="basic-result-label">Panels Required</div>
      </div>
      <div class="basic-result-item">
        <div class="basic-result-val">${r.actualKwp} kWp</div>
        <div class="basic-result-label">Array Size</div>
      </div>
      <div class="basic-result-item">
        <div class="basic-result-val">${r.actualStrings}</div>
        <div class="basic-result-label">Strings</div>
      </div>
      <div class="basic-result-item">
        <div class="basic-result-val">${r.stringVoc} V</div>
        <div class="basic-result-label">String Voc</div>
      </div>`;

    if (r.type === 'offgrid') {
      summaryItems += `
        <div class="basic-result-item">
          <div class="basic-result-val">${r.invKw} kW</div>
          <div class="basic-result-label">Inverter Size</div>
        </div>
        <div class="basic-result-item">
          <div class="basic-result-val">${r.mpptA} A</div>
          <div class="basic-result-label">MPPT Controller</div>
        </div>`;
    } else {
      summaryItems += `
        <div class="basic-result-item">
          <div class="basic-result-val">${r.invDcKw} kW</div>
          <div class="basic-result-label">Inverter DC Input</div>
        </div>
        <div class="basic-result-item">
          <div class="basic-result-val">${r.invAcKw} kW</div>
          <div class="basic-result-label">Inverter AC Output</div>
        </div>`;
    }

    if (r.bat) {
      summaryItems += `
        <div class="basic-result-item">
          <div class="basic-result-val">${r.bat.batKwh || r.bat.actualBatKwh} kWh</div>
          <div class="basic-result-label">Battery Bank</div>
        </div>
        <div class="basic-result-item">
          <div class="basic-result-val">${r.bat.batCapAh} Ah</div>
          <div class="basic-result-label">At ${r.bat.batVoltage}V</div>
        </div>`;
      if (r.type === 'offgrid') {
        summaryItems += `
          <div class="basic-result-item">
            <div class="basic-result-val">${r.bat.autonomyDays} day${r.bat.autonomyDays != 1 ? 's' : ''}</div>
            <div class="basic-result-label">Autonomy</div>
          </div>`;
      } else if (r.bat.backupHrsCalc) {
        summaryItems += `
          <div class="basic-result-item">
            <div class="basic-result-val">${r.bat.backupHrsCalc} h</div>
            <div class="basic-result-label">Backup Duration</div>
          </div>`;
      }
    }

    // Wiring rows
    let wiringRows = `
      <tr><td><strong>DC String Cable</strong></td><td>${r.dcCable.csa} mm² Cu</td><td class="text-muted text-sm">I<sub>des</sub> ${r.dcCable.design} A</td></tr>
      ${r.dcBreaker ? `<tr><td><strong>DC Protection</strong></td><td colspan="2">${_esc(r.dcBreaker)}</td></tr>` : ''}
      <tr><td><strong>AC Cable</strong></td><td>${r.acCable.csa} mm² Cu (${r.acPhase === 3 ? '3P' : '1P'})</td><td class="text-muted text-sm">I ${r.acCurrent} A</td></tr>
      <tr><td><strong>AC MCB / MCCB</strong></td><td>${r.acBreaker} A ${r.acPhase === 3 ? '3P' : '1P'}</td><td class="text-muted text-sm">At AC panel</td></tr>
      <tr><td><strong>Array Isc</strong></td><td>${r.arrayIsc} A DC</td><td class="text-muted text-sm">${r.actualStrings} string(s)</td></tr>`;

    if (r.bat) {
      wiringRows += `
        <tr><td><strong>Battery Cable</strong></td><td>${r.bat.batCable.csa} mm² Cu</td><td class="text-muted text-sm">I<sub>des</sub> ${r.bat.batCable.design} A</td></tr>
        <tr><td><strong>Battery Fuse / CB</strong></td><td>${r.bat.batBreaker} A DC rated</td><td class="text-muted text-sm">At battery terminal</td></tr>`;
    }
    if (r.type === 'offgrid') {
      wiringRows += `<tr><td><strong>MPPT Controller</strong></td><td>≥ ${r.mpptA} A</td><td class="text-muted text-sm">At battery input</td></tr>`;
    }

    // Cost rows
    const typeLabel = { gridtie: 'Grid-Tie', hybrid: 'Hybrid', offgrid: 'Off-Grid' }[r.type];
    const costRows = [
      ['PV Modules (' + r.panelCount + ' panels)', c.modCost],
      [r.type === 'gridtie' ? 'Grid Inverter' : r.type === 'hybrid' ? 'Hybrid Inverter' : 'Off-Grid Inverter', c.invCost],
      ['Mounting Structure', c.mountCost],
      c.batCost ? ['Battery System', c.batCost] : null,
      r.type === 'offgrid' && c.mpptCost ? ['MPPT Charge Controller', c.mpptCost] : null,
      ['Cabling (est.)', c.cableCost],
      ['Protection Devices', c.protCost],
      ['BOS / Misc', c.bosCost],
      ['Labour (~12%)', c.labourCost],
    ].filter(Boolean);

    div.innerHTML = `
      <div class="card">
        <div class="card-title">&#128202; ${typeLabel} System Summary</div>
        <div class="basic-result-grid">${summaryItems}</div>
      </div>

      <div class="card">
        <div class="card-title">&#128268; Wiring &amp; Protection</div>
        <table class="status-table"><tbody>${wiringRows}</tbody></table>
      </div>

      <div class="card">
        <div class="card-title">&#128176; Cost Estimate (LKR)</div>
        <div class="info-box" style="margin-bottom:10px;font-size:0.8rem">
          Price source: ${_esc(c.source)} &bull; Approximate Sri Lanka market.
        </div>
        <table class="status-table">
          <tbody>
            ${costRows.map(([label, val]) => `<tr><td>${_esc(label)}</td><td style="text-align:right;font-weight:600">Rs. ${_fmt(Math.round(val))}</td></tr>`).join('')}
            <tr style="border-top:2px solid var(--border)">
              <td><strong>Total Estimated Cost</strong></td>
              <td style="text-align:right;font-size:1.1rem;font-weight:800;color:var(--primary)">Rs. ${_fmt(Math.round(c.grandTotal))}</td>
            </tr>
            <tr>
              <td class="text-muted">Per Watt (Rs./Wp)</td>
              <td style="text-align:right" class="text-muted">Rs. ${_fmt(Math.round(c.grandTotal / (parseFloat(r.actualKwp) * 1000)))}</td>
            </tr>
          </tbody>
        </table>
        <div class="warn-box" style="margin-top:10px;font-size:0.78rem">
          &#9888; Rough estimates only. Actual costs vary with brand, site, and market. Get formal quotation for real projects.
        </div>
      </div>
    `;

    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();

