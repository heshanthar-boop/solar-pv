/**
 * basic-calc.js — Basic Mode Quick Calculator
 * Speed-first. Panel count, inverter match, battery sizing,
 * wire size, protection devices, cost estimate.
 * Cost data: fetched from GitHub-hosted JSON or falls back to bundled values.
 */

var BasicCalc = (() => {

  // -----------------------------------------------------------------------
  // Cost data — bundled fallback (LKR, approximate April 2025)
  // Source: Sri Lankan solar market averages (dealer quotes, CEB-registered installers)
  // -----------------------------------------------------------------------
  const COSTS_FALLBACK = {
    updatedAt: '2025-04',
    currency: 'LKR',
    note: 'Approximate Sri Lanka market prices. Verify with your supplier.',
    pvModulePerWp: 38,           // LKR/Wp — 400-550W tier-1 mono
    gridInverterPerW: 45,        // LKR/W — single-phase string inverter
    hybridInverterPerW: 65,      // LKR/W — hybrid inverter
    batteryLiFePO4PerKwh: 85000, // LKR/kWh — LiFePO4 48V pack
    batteryLeadAcidPerKwh: 32000,// LKR/kWh — sealed lead acid
    mountingRooftopPerWp: 6,     // LKR/Wp — rooftop flush/tilt
    mountingGroundPerWp: 10,     // LKR/Wp — ground mount galvanised
    dc6mmCuPerM: 380,            // LKR/m — 6mm² DC PV cable (single core)
    dc4mmCuPerM: 260,
    ac4mmCuPerM: 290,
    ac6mmCuPerM: 410,
    ac10mmCuPerM: 600,
    ac16mmCuPerM: 950,
    ac25mmCuPerM: 1450,
    mcb1pPer: 1200,              // LKR/MCB — 1P 6–32A
    mcb3pPer: 3800,              // LKR/MCB — 3P 6–32A
    acbPer: 8500,                // LKR — AC isolator/ACB 63A
    dcFuseholderPer: 950,        // LKR — DC string fuse holder
    spd1pPer: 2500,              // LKR — DC/AC SPD Type 2
    earthing: 12000,             // LKR — earthing system complete
    labour_pct: 0.12,            // 12% of material cost
    bos_pct: 0.08,               // 8% of panel cost — misc BOS (conduit, lugs, labels)
  };

  let _costs = null;
  let _costsSource = 'bundled';

  async function _loadCosts() {
    if (_costs) return;
    // Try fetching from a GitHub raw JSON maintained alongside the app
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
  // Returns smallest standard CSA (mm²) that handles the current
  // -----------------------------------------------------------------------
  const WIRE_TABLE = [
    // [max_A, csa_mm2]
    [13,  1.5],
    [18,  2.5],
    [24,  4],
    [32,  6],
    [43,  10],
    [57,  16],
    [75,  25],
    [92,  35],
    [120, 50],
    [150, 70],
    [180, 95],
  ];

  function _wireCSA(amps) {
    const design = amps * 1.25; // continuous factor
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

  // -----------------------------------------------------------------------
  // Core calculation engine
  // -----------------------------------------------------------------------
  function _calculate(inputs) {
    const {
      sysKwp, sysVoltage, numStrings, modPmax, modVoc, modIsc,
      modPerString, battery, batKwh, batVoltage, systemType,
      roofType, acVoltage, acPhase
    } = inputs;

    const c = _costs || COSTS_FALLBACK;

    // --- Panel count ---
    const panelCount = Math.ceil((sysKwp * 1000) / modPmax);
    const actualKwp = (panelCount * modPmax) / 1000;
    const stringsCalc = Math.ceil(panelCount / modPerString);
    const actualStrings = numStrings || stringsCalc;

    // --- String Voc / Isc ---
    const stringVoc = modVoc * modPerString;
    const stringIsc = modIsc;
    const arrayIsc = stringIsc * actualStrings;

    // --- Inverter sizing ---
    // DC input: 1.1–1.2× Pmax; AC output: 1.0× or 0.9× for export limit
    const invDcKw = (actualKwp * 1.05).toFixed(1);
    const invAcKw = actualKwp.toFixed(1);

    // --- DC string cable ---
    const dcCable = _wireCSA(modIsc * 1.25);
    const dcBreaker = modIsc > 30 ? null : 'String fuse ' + _breakerA(modIsc) + 'A (DC rated)';

    // --- AC cable ---
    const acCurrentPerPhase = acPhase === 3
      ? (actualKwp * 1000) / (acVoltage * Math.sqrt(3) * 0.97)
      : (actualKwp * 1000) / (acVoltage * 0.97);
    const acCable = _wireCSA(acCurrentPerPhase);
    const acBreaker = _breakerA(acCurrentPerPhase);

    // --- Battery ---
    let batResult = null;
    if (battery && batKwh > 0) {
      const batCapAh = (batKwh * 1000) / batVoltage;
      const invChargeA = batKwh > 5 ? 50 : 30;
      const batCable = _wireCSA(invChargeA * 1.1);
      const batBreaker = _breakerA(invChargeA);
      batResult = { batCapAh: batCapAh.toFixed(0), invChargeA, batCable, batBreaker };
    }

    // --- Cost estimate ---
    const modCost = panelCount * modPmax * c.pvModulePerWp;
    const invType = battery ? 'hybrid' : 'grid';
    const invCost = actualKwp * 1000 * (invType === 'hybrid' ? c.hybridInverterPerW : c.gridInverterPerW);
    const mountCost = actualKwp * 1000 * (roofType === 'ground' ? c.mountingGroundPerWp : c.mountingRooftopPerWp);
    const batCost = (battery && batKwh > 0) ? batKwh * c.batteryLiFePO4PerKwh : 0;
    // Rough cabling: DC strings 30m avg + AC 20m
    const dcCableLen = actualStrings * 30 * 2; // 2 cores
    const acCableLen = 20;
    const cableCost = dcCableLen * (dcCable.csa >= 6 ? c.dc6mmCuPerM : c.dc4mmCuPerM)
                    + acCableLen * (acCable.csa >= 10 ? c.ac10mmCuPerM : acCable.csa >= 6 ? c.ac6mmCuPerM : c.ac4mmCuPerM);
    const protCost = actualStrings * c.dcFuseholderPer + (acPhase === 1 ? c.mcb1pPer : c.mcb3pPer) * 2
                   + c.spd1pPer * 2 + c.earthing + c.acbPer;
    const materialTotal = modCost + invCost + mountCost + batCost + cableCost + protCost;
    const bosCost = modCost * c.bos_pct;
    const labourCost = (materialTotal + bosCost) * c.labour_pct;
    const grandTotal = materialTotal + bosCost + labourCost;
    const perWp = grandTotal / (actualKwp * 1000);

    return {
      panelCount, actualKwp: actualKwp.toFixed(2), stringsCalc, actualStrings,
      stringVoc: stringVoc.toFixed(1), stringIsc: stringIsc.toFixed(2), arrayIsc: arrayIsc.toFixed(2),
      invDcKw, invAcKw,
      dcCable, dcBreaker, acCable, acBreaker: _breakerA(acCurrentPerPhase),
      acCurrentPerPhase: acCurrentPerPhase.toFixed(1), acPhase,
      batResult,
      cost: {
        modCost, invCost, mountCost, batCost, cableCost, protCost,
        bosCost, labourCost, grandTotal, perWp: perWp.toFixed(0),
        source: _costsSource
      }
    };
  }

  function _fmt(n) { return Number(n).toLocaleString('en-LK'); }
  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  async function render(container) {
    container.innerHTML = `
      <div class="page basic-calc-page">
        <div class="basic-calc-header">
          <div class="basic-calc-title">&#9889; Quick Solar Calculator</div>
          <div class="basic-calc-subtitle">Fast estimates for design, sizing &amp; cost</div>
        </div>

        <div class="card">
          <div class="card-title">System Parameters</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">System Size (kWp)</label>
              <input class="form-input" id="bc-kwp" type="number" value="10" min="0.1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">System Type</label>
              <select class="form-select" id="bc-systype">
                <option value="gridtie">Grid-Tie</option>
                <option value="hybrid">Hybrid + Battery</option>
                <option value="offgrid">Off-Grid</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Module Pmax (W)</label>
              <input class="form-input" id="bc-pmax" type="number" value="550" min="50" step="5" />
            </div>
            <div class="form-group">
              <label class="form-label">Module Voc (V)</label>
              <input class="form-input" id="bc-voc" type="number" value="49.5" step="0.1" />
            </div>
            <div class="form-group">
              <label class="form-label">Module Isc (A)</label>
              <input class="form-input" id="bc-isc" type="number" value="14.2" step="0.1" />
            </div>
            <div class="form-group">
              <label class="form-label">Modules per String</label>
              <input class="form-input" id="bc-modstring" type="number" value="20" min="1" max="50" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">AC Side</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">AC Phase</label>
              <select class="form-select" id="bc-acphase">
                <option value="1">Single Phase (230V)</option>
                <option value="3">Three Phase (400V)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Roof / Mount Type</label>
              <select class="form-select" id="bc-roof">
                <option value="rooftop">Rooftop</option>
                <option value="ground">Ground Mount</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card" id="bc-bat-card">
          <div class="card-title">Battery (Hybrid / Off-Grid)</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Battery Capacity (kWh)</label>
              <input class="form-input" id="bc-batkwh" type="number" value="10" min="1" step="0.5" />
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
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="bc-calc-btn" style="margin-bottom:12px">&#9889; Calculate</button>

        <div id="bc-results" class="hidden"></div>
      </div>
    `;

    // Show/hide battery card based on system type
    const sysTypeEl = container.querySelector('#bc-systype');
    const batCard = container.querySelector('#bc-bat-card');
    function _toggleBatCard() {
      const show = sysTypeEl.value !== 'gridtie';
      batCard.style.display = show ? '' : 'none';
    }
    sysTypeEl.addEventListener('change', _toggleBatCard);
    _toggleBatCard();

    // Load costs in background
    _loadCosts();

    container.querySelector('#bc-calc-btn').addEventListener('click', async () => {
      await _loadCosts();

      const kwp = parseFloat(container.querySelector('#bc-kwp').value);
      const pmax = parseFloat(container.querySelector('#bc-pmax').value);
      const voc = parseFloat(container.querySelector('#bc-voc').value);
      const isc = parseFloat(container.querySelector('#bc-isc').value);
      const modPerString = parseInt(container.querySelector('#bc-modstring').value) || 20;
      const sysType = container.querySelector('#bc-systype').value;
      const acPhase = parseInt(container.querySelector('#bc-acphase').value);
      const acVoltage = acPhase === 3 ? 400 : 230;
      const roof = container.querySelector('#bc-roof').value;
      const hasBattery = sysType !== 'gridtie';
      const batKwh = parseFloat(container.querySelector('#bc-batkwh').value) || 10;
      const batVoltage = parseFloat(container.querySelector('#bc-batvolt').value) || 48;

      if (isNaN(kwp) || isNaN(pmax) || isNaN(voc) || isNaN(isc)) {
        App.toast('Fill in all module values', 'error'); return;
      }

      const r = _calculate({
        sysKwp: kwp, sysVoltage: 230, numStrings: 0, modPmax: pmax,
        modVoc: voc, modIsc: isc, modPerString,
        battery: hasBattery, batKwh, batVoltage,
        systemType: sysType, roofType: roof, acVoltage, acPhase
      });

      _renderResults(container, r);
    });
  }

  function _renderResults(container, r) {
    const c = r.cost;
    const hasBat = !!r.batResult;

    const costRows = [
      ['PV Modules (' + r.panelCount + ' × ' + Math.round((r.actualKwp * 1000) / r.panelCount) + 'W)', c.modCost],
      [hasBat ? 'Hybrid Inverter' : 'Grid Inverter', c.invCost],
      ['Mounting Structure', c.mountCost],
      hasBat ? ['Battery System', c.batCost] : null,
      ['Cabling (est.)', c.cableCost],
      ['Protection Devices', c.protCost],
      ['BOS / Misc', c.bosCost],
      ['Labour (~12%)', c.labourCost],
    ].filter(Boolean);

    const div = container.querySelector('#bc-results');
    div.classList.remove('hidden');
    div.innerHTML = `
      <div class="card">
        <div class="card-title">&#128202; System Summary</div>
        <div class="basic-result-grid">
          <div class="basic-result-item">
            <div class="basic-result-val">${r.panelCount}</div>
            <div class="basic-result-label">Panels Required</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${r.actualKwp} kWp</div>
            <div class="basic-result-label">Actual Array Size</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${r.actualStrings}</div>
            <div class="basic-result-label">No. of Strings</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${r.stringVoc} V</div>
            <div class="basic-result-label">String Voc</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${r.invDcKw} kW</div>
            <div class="basic-result-label">Inverter DC Input</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${r.invAcKw} kW</div>
            <div class="basic-result-label">Inverter AC Output</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">&#128268; Wiring &amp; Protection</div>
        <table class="status-table">
          <tbody>
            <tr><td><strong>DC String Cable</strong></td><td>${r.dcCable.csa} mm² Cu</td><td class="text-muted text-sm">Design: ${r.dcCable.design} A</td></tr>
            ${r.dcBreaker ? `<tr><td><strong>DC Protection</strong></td><td colspan="2">${_esc(r.dcBreaker)}</td></tr>` : ''}
            <tr><td><strong>AC Output Cable</strong></td><td>${r.acCable.csa} mm² Cu (${r.acPhase === 3 ? '3P' : '1P'})</td><td class="text-muted text-sm">I<sub>des</sub>: ${r.acCurrentPerPhase} A</td></tr>
            <tr><td><strong>AC MCB / MCCB</strong></td><td>${r.acBreaker} A ${r.acPhase === 3 ? '3P' : '1P'}</td><td class="text-muted text-sm">At AC output panel</td></tr>
            <tr><td><strong>Array Isc</strong></td><td>${r.arrayIsc} A DC</td><td class="text-muted text-sm">${r.actualStrings} string(s)</td></tr>
            ${r.batResult ? `
            <tr><td><strong>Battery Cable</strong></td><td>${r.batResult.batCable.csa} mm² Cu</td><td class="text-muted text-sm">Charge: ${r.batResult.invChargeA} A</td></tr>
            <tr><td><strong>Battery Fuse / CB</strong></td><td>${r.batResult.batBreaker} A DC rated</td><td class="text-muted text-sm">At battery terminal</td></tr>
            <tr><td><strong>Battery Capacity</strong></td><td>${r.batResult.batCapAh} Ah</td><td class="text-muted text-sm">At selected voltage</td></tr>
            ` : ''}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">&#128176; Cost Estimate (LKR)</div>
        <div class="info-box" style="margin-bottom:10px;font-size:0.8rem">
          Price source: ${_esc(c.source)} &bull; Approximate Sri Lanka market. Verify with supplier.
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
              <td style="text-align:right" class="text-muted">Rs. ${_fmt(c.perWp)}</td>
            </tr>
          </tbody>
        </table>
        <div class="warn-box" style="margin-top:10px;font-size:0.78rem">
          &#9888; These are rough estimates only. Actual costs vary with brand, site conditions, and current market. Get a formal quotation for any real project.
        </div>
      </div>

      <div class="card" style="margin-bottom:80px">
        <div class="card-title">&#128196; Next Steps</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-secondary btn-sm" id="bc-goto-sizing">&#9889; Full String Sizing (Advanced)</button>
          <button class="btn btn-secondary btn-sm" id="bc-goto-wire">&#128268; Detailed Wire Calc (Advanced)</button>
          <button class="btn btn-secondary btn-sm" id="bc-goto-checklist">&#9989; Commissioning Checklist (Advanced)</button>
        </div>
      </div>
    `;

    div.querySelector('#bc-goto-sizing').addEventListener('click', () => {
      App.setMode('advanced');
      App.navigate('sizing');
    });
    div.querySelector('#bc-goto-wire').addEventListener('click', () => {
      App.setMode('advanced');
      App.navigate('wirecalc');
    });
    div.querySelector('#bc-goto-checklist').addEventListener('click', () => {
      App.setMode('advanced');
      App.navigate('checklist');
    });

    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
