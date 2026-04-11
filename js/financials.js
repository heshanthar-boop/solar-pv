/**
 * financials.js — Solar PV Financial Analysis
 *
 * Calculations:
 *  - Simple Payback Period (SPP)
 *  - Net Present Value (NPV) over system lifetime
 *  - Internal Rate of Return (IRR) — Newton-Raphson on cash flows
 *  - Levelised Cost of Energy (LCOE)
 *  - CEB Net Metering savings model (Sri Lanka tariff tiers)
 *  - CO2 savings (SL grid emission factor)
 *
 * Sri Lanka CEB tariff (2024, domestic net metering):
 *  Source: CEB Tariff Revision 2023 gazette, PUCSL rates
 *  Tier 1: 0–30 units → Rs. 7.85/kWh
 *  Tier 2: 31–60 units → Rs. 10.00/kWh
 *  Tier 3: 61–90 units → Rs. 27.75/kWh
 *  Tier 4: 91–120 units → Rs. 32.00/kWh
 *  Tier 5: 121–180 units → Rs. 45.00/kWh
 *  Tier 6: >180 units → Rs. 50.00/kWh
 *  Net metering export credit: Rs. 22.00/kWh (surplus to grid)
 *
 * Grid emission factor: 0.584 kgCO2/kWh (SLSEA 2022, national average)
 */

var Financials = (() => {

  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _fmt(n, dec) { return Number(n).toLocaleString('en-LK', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }

  // -----------------------------------------------------------------------
  // CEB TARIFF DATA (Sri Lanka 2024)
  // -----------------------------------------------------------------------
  const CEB_TIERS = [
    { max: 30,   rate: 7.85  },
    { max: 60,   rate: 10.00 },
    { max: 90,   rate: 27.75 },
    { max: 120,  rate: 32.00 },
    { max: 180,  rate: 45.00 },
    { max: Infinity, rate: 50.00 },
  ];
  const NET_METER_EXPORT_RATE = 22.00; // Rs./kWh export credit
  const CO2_FACTOR_KG_PER_KWH = 0.584; // SLSEA 2022

  /**
   * Compute monthly CEB bill for a given consumption (kWh).
   * Sri Lanka tiered billing — each tier applies to usage within that band.
   */
  function cebBill(kWh) {
    let bill = 0, remaining = kWh;
    let prev = 0;
    for (const tier of CEB_TIERS) {
      const band = tier.max - prev;
      const used = Math.min(remaining, band);
      bill += used * tier.rate;
      remaining -= used;
      prev = tier.max;
      if (remaining <= 0) break;
    }
    return bill;
  }

  /**
   * Average effective tariff rate for a given monthly consumption level.
   * Used for simple savings calc when net metering split unknown.
   */
  function effectiveTariff(kWh_monthly) {
    if (kWh_monthly <= 0) return 0;
    return cebBill(kWh_monthly) / kWh_monthly;
  }

  // -----------------------------------------------------------------------
  // FINANCIAL CALCULATIONS
  // -----------------------------------------------------------------------

  /**
   * Annual savings from solar PV under net metering.
   *
   * Model:
   *   self_consumed = min(solar_annual, load_annual) * self_use_fraction
   *   exported = solar_annual - self_consumed
   *   savings_self = self_consumed * effective_tariff(monthly_load)
   *   savings_export = exported * export_rate
   *   total_savings = savings_self + savings_export
   *
   * @param {number} solar_annual_kWh  - annual PV yield
   * @param {number} load_monthly_kWh  - average monthly electricity consumption
   * @param {number} self_use_pct      - % of solar consumed on-site (default 60%)
   * @param {number} custom_rate       - override tariff rate (0 = use CEB tiers)
   */
  function annualSavings(solar_annual_kWh, load_monthly_kWh, self_use_pct, custom_rate) {
    self_use_pct = self_use_pct || 60;
    const load_annual = load_monthly_kWh * 12;
    const self_fraction = self_use_pct / 100;

    const self_consumed = solar_annual_kWh * self_fraction;
    const exported      = solar_annual_kWh * (1 - self_fraction);

    const tariff = custom_rate > 0 ? custom_rate : effectiveTariff(load_monthly_kWh);
    const savings_self   = self_consumed * tariff;
    const savings_export = exported * NET_METER_EXPORT_RATE;
    const total = savings_self + savings_export;

    // Monthly bill before solar (estimate)
    const bill_before = cebBill(load_monthly_kWh) * 12;
    // Monthly bill after solar (remaining consumption)
    const residual_monthly = Math.max(0, load_monthly_kWh - self_consumed / 12);
    const bill_after = cebBill(residual_monthly) * 12;

    return {
      self_consumed, exported, tariff,
      savings_self, savings_export, total,
      bill_before, bill_after,
      bill_reduction_pct: bill_before > 0 ? (total / bill_before * 100) : 0,
    };
  }

  /**
   * Simple payback period: total_cost / annual_savings_year1
   */
  function simplePayback(total_cost, annual_savings_yr1) {
    if (annual_savings_yr1 <= 0) return Infinity;
    return total_cost / annual_savings_yr1;
  }

  /**
   * NPV of solar investment over lifetime.
   *
   * Cash flows:
   *   Year 0: -capex
   *   Year 1..lifetime: annual_savings × (1 + escalation_rate)^(y-1) × (1 - degradation)^(y-1)
   *   Minus O&M cost each year
   *
   * Discount rate applied: NPV = Σ CF_y / (1+r)^y
   */
  function npv(capex, annual_savings, discount_rate, escalation_rate, degradation_rate, lifetime_yr, om_annual) {
    discount_rate  = discount_rate  / 100;
    escalation_rate = escalation_rate / 100;
    degradation_rate = degradation_rate / 100;
    om_annual = om_annual || 0;

    let npvVal = -capex;
    const cashflows = [-capex];
    for (let y = 1; y <= lifetime_yr; y++) {
      const cf = annual_savings
                 * Math.pow(1 + escalation_rate, y - 1)
                 * Math.pow(1 - degradation_rate, y - 1)
                 - om_annual * Math.pow(1 + escalation_rate, y - 1);
      npvVal += cf / Math.pow(1 + discount_rate, y);
      cashflows.push(cf);
    }
    return { npv: npvVal, cashflows };
  }

  /**
   * IRR via Newton-Raphson iteration.
   * Finds rate r such that NPV(cashflows, r) = 0.
   * Returns null if not convergent.
   */
  function irr(cashflows) {
    let r = 0.1; // initial guess 10%
    for (let iter = 0; iter < 100; iter++) {
      let f = 0, df = 0;
      for (let t = 0; t < cashflows.length; t++) {
        const denom = Math.pow(1 + r, t);
        f  += cashflows[t] / denom;
        df -= t * cashflows[t] / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(df) < 1e-12) break;
      const r_new = r - f / df;
      if (Math.abs(r_new - r) < 1e-6) { r = r_new; break; }
      r = r_new;
      if (r < -0.99 || r > 10) return null; // diverged
    }
    return r * 100; // percent
  }

  /**
   * LCOE (Levelised Cost of Energy).
   * LCOE = (capex + PV_of_om) / PV_of_energy_generated
   *
   * Reference: NREL SAM LCOE definition.
   */
  function lcoe(capex, om_annual, discount_rate, lifetime_yr, solar_annual_kWh, degradation_rate) {
    discount_rate  = discount_rate  / 100;
    degradation_rate = degradation_rate / 100;

    let pv_energy = 0, pv_om = 0;
    for (let y = 1; y <= lifetime_yr; y++) {
      const energy_y = solar_annual_kWh * Math.pow(1 - degradation_rate, y - 1);
      pv_energy += energy_y / Math.pow(1 + discount_rate, y);
      pv_om += om_annual / Math.pow(1 + discount_rate, y);
    }
    return pv_energy > 0 ? (capex + pv_om) / pv_energy : 0;
  }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  function render(container) {
    // Pre-fill from yield results if available
    const yr = (typeof App !== 'undefined' && App.state) ? App.state.yieldResults : null;
    const solarKwh = yr ? yr.summary.E_annual.toFixed(0) : '';
    const kwp = yr ? yr.system.P_dc.toFixed(1) : '';

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128176; Financial Analysis</div>

        <div class="info-box">
          ROI, payback, NPV, IRR, LCOE — based on CEB 2024 net metering tariffs (Sri Lanka).
          ${yr ? `<br>&#9989; Yield data loaded from Yield Estimator: <strong>${_esc(solarKwh)} kWh/yr</strong>` : ''}
        </div>

        <!-- SYSTEM & COST INPUTS -->
        <div class="card">
          <div class="card-title">System Cost &amp; Energy</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Total System Cost (Rs.)</label>
              <input class="form-input" id="fi-capex" type="number" step="1000" placeholder="e.g. 1500000" />
              <div class="form-hint">From basic calculator or quotation</div>
            </div>
            <div class="form-group">
              <label class="form-label">Annual Solar Yield (kWh/yr)</label>
              <input class="form-input" id="fi-solar" type="number" step="100" value="${_esc(solarKwh)}" placeholder="e.g. 14000" />
              <div class="form-hint">${yr ? 'Auto-filled from Yield Estimator' : 'Run Yield Estimator first, or enter manually'}</div>
            </div>
            <div class="form-group">
              <label class="form-label">Array Size (kWp)</label>
              <input class="form-input" id="fi-kwp" type="number" step="0.1" value="${_esc(kwp)}" placeholder="e.g. 10" />
            </div>
            <div class="form-group">
              <label class="form-label">Annual O&amp;M Cost (Rs./yr)</label>
              <input class="form-input" id="fi-om" type="number" step="500" value="15000" />
              <div class="form-hint">Cleaning, inspection ~Rs. 1,000–2,000/kWp/yr</div>
            </div>
          </div>
        </div>

        <!-- CEB TARIFF & CONSUMPTION -->
        <div class="card">
          <div class="card-title">&#9889; CEB Tariff &amp; Consumption</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Monthly Consumption (kWh/month)</label>
              <input class="form-input" id="fi-load" type="number" step="10" value="300" />
              <div class="form-hint">From latest CEB bill. Avg domestic ~150–400 kWh/mo</div>
            </div>
            <div class="form-group">
              <label class="form-label">Self-Consumption Rate (%)</label>
              <input class="form-input" id="fi-selfuse" type="number" value="65" min="10" max="100" />
              <div class="form-hint">Grid-tie with daytime loads: 60–75%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Tariff Override (Rs./kWh)</label>
              <input class="form-input" id="fi-tariff-custom" type="number" step="0.5" value="0" placeholder="0 = use CEB tiers" />
              <div class="form-hint">0 = auto from CEB 2024 tiers</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="fi-show-tiers-btn">Show CEB Tariff Tiers</button>
          <div id="fi-tiers-detail" class="hidden" style="margin-top:8px"></div>
        </div>

        <!-- FINANCIAL PARAMETERS -->
        <div class="card">
          <div class="card-title">&#128200; Financial Parameters</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">System Lifetime (years)</label>
              <input class="form-input" id="fi-life" type="number" value="25" min="5" max="40" />
            </div>
            <div class="form-group">
              <label class="form-label">Discount Rate (%/yr)</label>
              <input class="form-input" id="fi-discount" type="number" step="0.5" value="10" />
              <div class="form-hint">Sri Lanka bank rate ~9–12%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Tariff Escalation (%/yr)</label>
              <input class="form-input" id="fi-esc" type="number" step="0.5" value="5" />
              <div class="form-hint">CEB tariff avg increase ~5–8%/yr historically</div>
            </div>
            <div class="form-group">
              <label class="form-label">Panel Degradation (%/yr)</label>
              <input class="form-input" id="fi-deg" type="number" step="0.1" value="0.5" />
              <div class="form-hint">Tier-1 mono: 0.4–0.5%/yr</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="fi-calc-btn">&#128176; Calculate ROI &amp; Financials</button>

        <div id="fi-results" class="hidden" style="margin-top:12px"></div>
      </div>
    `;

    container.querySelector('#fi-calc-btn').addEventListener('click', () => _calculate(container));
    container.querySelector('#fi-show-tiers-btn').addEventListener('click', () => _toggleTiers(container));
  }

  function _toggleTiers(container) {
    const el = container.querySelector('#fi-tiers-detail');
    const btn = container.querySelector('#fi-show-tiers-btn');
    if (el.classList.contains('hidden')) {
      el.innerHTML = `
        <table class="status-table">
          <thead><tr><th>Units (kWh/month)</th><th>Rate (Rs./kWh)</th></tr></thead>
          <tbody>
            <tr><td>1 – 30</td><td>Rs. 7.85</td></tr>
            <tr><td>31 – 60</td><td>Rs. 10.00</td></tr>
            <tr><td>61 – 90</td><td>Rs. 27.75</td></tr>
            <tr><td>91 – 120</td><td>Rs. 32.00</td></tr>
            <tr><td>121 – 180</td><td>Rs. 45.00</td></tr>
            <tr><td>&gt; 180</td><td>Rs. 50.00</td></tr>
            <tr style="border-top:2px solid var(--border)"><td>Net Metering Export Credit</td><td><strong>Rs. 22.00</strong></td></tr>
          </tbody>
        </table>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">CEB Tariff Revision 2023 (PUCSL). Verify current rates with CEB.</div>`;
      el.classList.remove('hidden');
      btn.textContent = 'Hide CEB Tariff Tiers';
    } else {
      el.classList.add('hidden');
      btn.textContent = 'Show CEB Tariff Tiers';
    }
  }

  function _calculate(container) {
    const capex    = parseFloat(container.querySelector('#fi-capex').value);
    const solarKwh = parseFloat(container.querySelector('#fi-solar').value);
    const kwp      = parseFloat(container.querySelector('#fi-kwp').value);
    const om       = parseFloat(container.querySelector('#fi-om').value) || 0;
    const load     = parseFloat(container.querySelector('#fi-load').value);
    const selfUse  = parseFloat(container.querySelector('#fi-selfuse').value) || 65;
    const tariffOvr= parseFloat(container.querySelector('#fi-tariff-custom').value) || 0;
    const life     = parseInt(container.querySelector('#fi-life').value) || 25;
    const disc     = parseFloat(container.querySelector('#fi-discount').value) || 10;
    const esc      = parseFloat(container.querySelector('#fi-esc').value) || 5;
    const deg      = parseFloat(container.querySelector('#fi-deg').value) || 0.5;

    if (isNaN(capex) || capex <= 0) { App.toast('Enter system cost', 'error'); return; }
    if (isNaN(solarKwh) || solarKwh <= 0) { App.toast('Enter annual solar yield', 'error'); return; }
    if (isNaN(load) || load <= 0) { App.toast('Enter monthly consumption', 'error'); return; }

    // Year-1 savings
    const sav = annualSavings(solarKwh, load, selfUse, tariffOvr);

    // SPP
    const spp = simplePayback(capex, sav.total);

    // NPV + cash flows
    const npvRes = npv(capex, sav.total, disc, esc, deg, life, om);

    // IRR
    const irrVal = irr(npvRes.cashflows);

    // LCOE
    const lcoeVal = lcoe(capex, om, disc, life, solarKwh, deg);

    // CO2 savings
    const co2_annual = solarKwh * CO2_FACTOR_KG_PER_KWH / 1000; // tonnes/yr
    const co2_life   = co2_annual * life;

    // Cumulative savings chart data (25 years)
    const cumSavings = [];
    let cumCf = -capex;
    for (let y = 0; y < npvRes.cashflows.length; y++) {
      cumCf += npvRes.cashflows[y] + (y === 0 ? capex : 0); // exclude initial capex from running sum
      if (y > 0) cumSavings.push({ y, val: cumCf });
    }

    _renderResults(container, {
      capex, solarKwh, kwp, om, load, selfUse, spp, sav,
      npvRes, irrVal, lcoeVal, co2_annual, co2_life,
      cumSavings, life, disc, esc, deg
    });
  }

  function _renderResults(container, d) {
    const sppOk = d.spp < d.life;
    const npvPositive = d.npvRes.npv > 0;

    // Cumulative savings SVG chart
    const chartSvg = _drawCumChart(d.cumSavings, d.capex, d.spp);

    const div = container.querySelector('#fi-results');
    div.classList.remove('hidden');
    div.innerHTML = `

      <!-- KEY METRICS -->
      <div class="card">
        <div class="card-title">&#128200; Key Financial Metrics</div>
        <div class="basic-result-grid">
          <div class="basic-result-item ${sppOk ? '' : 'fi-warn'}">
            <div class="basic-result-val">${isFinite(d.spp) ? d.spp.toFixed(1) + ' yr' : 'N/A'}</div>
            <div class="basic-result-label">Simple Payback</div>
          </div>
          <div class="basic-result-item ${npvPositive ? '' : 'fi-warn'}">
            <div class="basic-result-val">Rs. ${_fmt(Math.round(d.npvRes.npv / 1000))}k</div>
            <div class="basic-result-label">NPV (${d.life} yr)</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${d.irrVal !== null ? d.irrVal.toFixed(1) + '%' : 'N/A'}</div>
            <div class="basic-result-label">IRR</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">Rs. ${_fmt(d.lcoeVal.toFixed(2))}</div>
            <div class="basic-result-label">LCOE/kWh</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">Rs. ${_fmt(Math.round(d.sav.total))}</div>
            <div class="basic-result-label">Yr-1 Savings</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${d.sav.bill_reduction_pct.toFixed(0)}%</div>
            <div class="basic-result-label">Bill Reduction</div>
          </div>
        </div>
      </div>

      <!-- SAVINGS BREAKDOWN -->
      <div class="card">
        <div class="card-title">&#9889; Year-1 Savings Breakdown</div>
        <table class="status-table">
          <tbody>
            <tr><td>Solar Yield</td><td style="text-align:right">${_fmt(Math.round(d.solarKwh))} kWh/yr</td></tr>
            <tr><td>Self-Consumed (${d.selfUse}%)</td><td style="text-align:right">${_fmt(Math.round(d.sav.self_consumed))} kWh/yr</td></tr>
            <tr><td>Exported to Grid</td><td style="text-align:right">${_fmt(Math.round(d.sav.exported))} kWh/yr</td></tr>
            <tr><td>Effective Tariff</td><td style="text-align:right">Rs. ${_fmt(d.sav.tariff.toFixed(2))}/kWh</td></tr>
            <tr><td>Self-Consumption Savings</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.savings_self))}/yr</td></tr>
            <tr><td>Export Credit (@ Rs. 22/kWh)</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.savings_export))}/yr</td></tr>
            <tr style="border-top:2px solid var(--border)">
              <td><strong>Total Annual Savings</strong></td>
              <td style="text-align:right;font-weight:700;color:var(--success)">Rs. ${_fmt(Math.round(d.sav.total))}/yr</td>
            </tr>
            <tr><td>CEB Bill Before Solar</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.bill_before))}/yr</td></tr>
            <tr><td>CEB Bill After Solar</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.bill_after))}/yr</td></tr>
          </tbody>
        </table>
      </div>

      <!-- CUMULATIVE CHART -->
      <div class="card">
        <div class="card-title">&#128200; Cumulative Cash Flow (${d.life} Years)</div>
        ${chartSvg}
        <div style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:4px">
          Includes ${d.esc}% tariff escalation/yr, ${d.deg}%/yr panel degradation. Discount rate: ${d.disc}%.
        </div>
      </div>

      <!-- CO2 & ENVIRONMENT -->
      <div class="card">
        <div class="card-title">&#127807; Environmental Impact</div>
        <div class="basic-result-grid">
          <div class="basic-result-item">
            <div class="basic-result-val">${_fmt(d.co2_annual.toFixed(1))} t</div>
            <div class="basic-result-label">CO₂ Avoided/yr</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${_fmt(d.co2_life.toFixed(0))} t</div>
            <div class="basic-result-label">CO₂ over ${d.life} yr</div>
          </div>
          <div class="basic-result-item">
            <div class="basic-result-val">${_fmt(Math.round(d.co2_life * 1000 / 80))} trees</div>
            <div class="basic-result-label">Tree-year equiv.</div>
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">
          Grid emission factor: 0.584 kgCO₂/kWh (SLSEA 2022). Tree absorbs ~80 kg CO₂/yr.
        </div>
      </div>

      <!-- LCOE CONTEXT -->
      <div class="card">
        <div class="card-title">&#128218; LCOE Benchmarks (Sri Lanka 2024)</div>
        <table class="status-table">
          <tbody>
            <tr><td>This system LCOE</td><td style="text-align:right;font-weight:700;color:var(--primary)">Rs. ${_fmt(d.lcoeVal.toFixed(2))}/kWh</td></tr>
            <tr><td>CEB avg residential tariff</td><td style="text-align:right">Rs. ~${_fmt(d.sav.tariff.toFixed(2))}/kWh</td></tr>
            <tr><td>CEB high-use tier (&gt;180 kWh)</td><td style="text-align:right">Rs. 50.00/kWh</td></tr>
            <tr><td>Diesel generator (est.)</td><td style="text-align:right">Rs. 40–60/kWh</td></tr>
          </tbody>
        </table>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">
          LCOE below grid tariff = economically viable. This system LCOE vs current CEB rate:
          <strong style="color:${d.lcoeVal < d.sav.tariff ? 'var(--success)' : 'var(--danger)'}">
            ${d.lcoeVal < d.sav.tariff ? '✅ Solar is cheaper' : '⚠ Higher than grid rate (check assumptions)'}
          </strong>
        </div>
      </div>

      <div class="warn-box" style="margin-top:8px;font-size:0.78rem">
        ⚠ Estimates only. CEB tariffs subject to revision. Verify with CEB/PUCSL before any financial commitment.
      </div>
    `;

    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // -----------------------------------------------------------------------
  // Cumulative cash flow SVG chart (no external dependencies)
  // -----------------------------------------------------------------------
  function _drawCumChart(cumSavings, capex, spp) {
    if (!cumSavings.length) return '';

    const W = 340, H = 170, PL = 55, PR = 12, PT = 14, PB = 28;
    const cW = W - PL - PR, cH = H - PT - PB;
    const years = cumSavings.map(p => p.y);
    const vals  = cumSavings.map(p => p.val);
    const minV  = Math.min(-capex, ...vals);
    const maxV  = Math.max(...vals);
    const range = maxV - minV || 1;

    const px = y  => PL + (y - 1) / (years[years.length - 1]) * cW;
    const py = v  => PT + cH - ((v - minV) / range) * cH;

    // Zero line
    const y0 = py(0);
    const zeroLine = `<line x1="${PL}" y1="${y0.toFixed(1)}" x2="${PL + cW}" y2="${y0.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="4,3"/>`;

    // Payback vertical line
    const pbLine = isFinite(spp) && spp < years[years.length - 1]
      ? `<line x1="${px(spp).toFixed(1)}" y1="${PT}" x2="${px(spp).toFixed(1)}" y2="${PT + cH}" stroke="var(--success)" stroke-width="1.5" stroke-dasharray="3,3"/>
         <text x="${(px(spp) + 3).toFixed(1)}" y="${(PT + 10).toFixed(1)}" font-size="8" fill="var(--success)">Payback ${spp.toFixed(1)}yr</text>`
      : '';

    // Area fill
    const areaPoints = cumSavings.map((p, i) => `${px(p.y).toFixed(1)},${py(p.val).toFixed(1)}`).join(' ');
    const area = `<polyline points="${PL},${py(-capex).toFixed(1)} ${areaPoints}" fill="none" stroke="var(--primary)" stroke-width="2"/>`;

    // Positive fill
    const posPath = cumSavings
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.y).toFixed(1)},${py(Math.max(0, p.val)).toFixed(1)}`)
      .join(' ') + ` L${px(years[years.length - 1]).toFixed(1)},${y0.toFixed(1)} L${PL},${y0.toFixed(1)} Z`;

    // Y ticks
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = minV + (range / tickCount) * i;
      const label = Math.abs(v) >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0);
      return `<text x="${PL - 3}" y="${(py(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">Rs.${label}</text>
              <line x1="${PL}" y1="${py(v).toFixed(1)}" x2="${PL + cW}" y2="${py(v).toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>`;
    }).join('');

    // X ticks
    const xStep = Math.ceil(years[years.length - 1] / 5);
    const xTicks = Array.from({ length: 6 }, (_, i) => {
      const y = i * xStep;
      if (y > years[years.length - 1]) return '';
      return `<text x="${px(Math.max(1, y)).toFixed(1)}" y="${PT + cH + 12}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${y}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:6px auto">
      <path d="${posPath}" fill="var(--primary)" opacity="0.08"/>
      ${yTicks}
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
      <line x1="${PL}" y1="${PT + cH}" x2="${PL + cW}" y2="${PT + cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
      ${zeroLine}${pbLine}${area}
      ${xTicks}
      <text x="${PL + cW / 2}" y="${H - 1}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">Years</text>
    </svg>`;
  }

  return { render, cebBill, effectiveTariff, annualSavings, simplePayback, npv, irr, lcoe };

})();
