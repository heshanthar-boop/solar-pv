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
 * Current feed-in bands come from DirectiveRules (PUCSL decision effective 2026-08-25).
 * Import energy rates are user-entered from the current bill/approved tariff.
 * Historical retail helper functions are retained only for API compatibility.
 * Net metering banks units and never creates a cash export payment.
 *
 * Grid emission factor: 0.584 kgCO2/kWh (SLSEA 2022, national average)
 */

var Financials = (() => {

  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _fmt(n, dec) { return Number(n).toLocaleString('en-LK', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }

  // -----------------------------------------------------------------------
  // HISTORICAL APPROXIMATION ONLY — not used for current projections
  // -----------------------------------------------------------------------
  const CEB_TIERS = [
    { max: 30,   rate: 7.85  },
    { max: 60,   rate: 10.00 },
    { max: 90,   rate: 27.75 },
    { max: 120,  rate: 32.00 },
    { max: 180,  rate: 45.00 },
    { max: Infinity, rate: 50.00 },
  ];
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
  function annualSavings(solar_annual_kWh, load_monthly_kWh, self_use_pct, custom_rate, options = {}) {
    if (!(custom_rate > 0)) throw new Error('Enter the effective import energy rate from the current bill or approved tariff.');
    if (![solar_annual_kWh,load_monthly_kWh,self_use_pct,custom_rate].every(Number.isFinite) || solar_annual_kWh<0 || load_monthly_kWh<0 || self_use_pct<0 || self_use_pct>100) throw new Error('Invalid energy or self-consumption inputs.');
    const scheme=options.scheme||'net_metering', load_annual=load_monthly_kWh*12;
    const direct=Array.isArray(options.periods)?options.periods.reduce((sum,p)=>sum+Math.max(0,Number(p.selfKwh)||0),0):solar_annual_kWh*self_use_pct/100;
    const self_consumed=scheme==='net_plus'?0:Math.min(direct,load_annual);
    const exported=scheme==='zero_export'||scheme==='offgrid'?0:Array.isArray(options.periods)?options.periods.reduce((sum,p)=>sum+Math.max(0,Number(p.otherKwh)||0)+Math.max(0,Number(p.priorityKwh)||0),0):Math.max(0,solar_annual_kWh-self_consumed);
    const terms=options.terms || {scheme,status:'eligible',baseRate:0,priorityRate:0,priorityYears:0,exportCapPer30Days:null};
    const priority=Math.min(exported,Math.max(0,Number(options.priorityKwh)||0));
    const periods=options.periods || Array.from({length:12},(_,i)=>({otherKwh:(exported-priority)/12,priorityKwh:priority/12,importKwh:Math.max(0,load_annual-self_consumed)/12,days:[31,28,31,30,31,30,31,31,30,31,30,31][i]}));
    const paid=DirectiveRules.settle(periods,{...terms,scheme},options.year||1,options.initialBankKwh||0);
    const unit_offset=paid.offsetKwh;
    const savings_self=(self_consumed+unit_offset)*custom_rate;
    const savings_export=paid.amount===null?0:paid.amount;
    const bill_before=load_annual*custom_rate;
    const bill_after=Math.max(0,load_annual-self_consumed-unit_offset)*custom_rate;
    return {self_consumed,exported,tariff:custom_rate,savings_self,savings_export,total:savings_self+savings_export,bill_before,bill_after,unit_offset,banked_units:paid.bankedKwh,paid_export_kWh:paid.paidKwh,settlementMethod:paid.method,bill_reduction_pct:bill_before>0?(bill_before-bill_after)/bill_before*100:0,unpaidKwh:paid.unpaidKwh||0,scheme,terms};
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
    if(!Array.isArray(cashflows)||!cashflows.every(Number.isFinite))return null;
    const signs=cashflows.filter(v=>v!==0).map(v=>Math.sign(v));
    if(signs[0]!==-1||signs.filter((v,i)=>i>0&&v!==signs[i-1]).length!==1)return null;
    const f=rate=>cashflows.reduce((sum,cf,y)=>sum+cf/Math.pow(1+rate,y),0);
    let lo=-0.9999,hi=1;
    while(f(hi)>0&&hi<1e6)hi*=2;
    if(!Number.isFinite(f(lo))||f(lo)<0||f(hi)>0)return null;
    for(let i=0;i<200;i++){const mid=(lo+hi)/2,value=f(mid);if(Math.abs(value)<1e-7)return mid*100;if(value>0)lo=mid;else hi=mid;}
    return (lo+hi)/2*100;
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
          Scheme-aware projection using the August 2026 feed-in decision. Enter the current effective import energy rate; fixed charges and exact utility billing are outside this planning model.
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
              <label class="form-label">Current Import Energy Rate (LKR/kWh)</label>
              <input class="form-input" id="fi-tariff-custom" type="number" step="0.01" min="0.01" required placeholder="From current bill / tariff" />
              <div class="form-hint">Use the applicable marginal/effective energy rate; the old 2023 tier table is not applied automatically.</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="fi-show-tiers-btn">Show Approved Feed-in Bands</button>
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
              <label class="form-label">Import Energy Rate Escalation (%/yr)</label>
              <input class="form-input" id="fi-esc" type="number" step="0.5" value="0" />
              <div class="form-hint">Planning assumption for avoided import costs only. Approved rooftop feed-in rates are held fixed.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Panel Degradation (%/yr)</label>
              <input class="form-input" id="fi-deg" type="number" step="0.1" value="0.4" />
              <div class="form-hint">Tier-1 mono: 0.4–0.5%/yr</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="fi-calc-btn">&#128176; Calculate ROI &amp; Financials</button>

        <div id="fi-results" class="hidden" style="margin-top:12px"></div>
      </div>
    `;

    const donor = App.state.designerResults;
    container.querySelector('#fi-calc-btn').insertAdjacentHTML('beforebegin', DirectiveUI.tariffForm('fi-fit', donor?.fitInputs||{}));
    const lifeInput=container.querySelector('#fi-life');
    lifeInput.closest('.form-group').insertAdjacentHTML('afterend', `<div class="form-group"><label class="form-label" for="fi-contract-years">Remaining PV SPPA Term (years)</label><input class="form-input" id="fi-contract-years" type="number" min="1" max="40" value="20"/><div class="form-hint">Planning term until replaced by the signed agreement. Feed-in income stops after this term; no renewal tariff is assumed.</div></div><div class="form-group"><label class="form-label" for="fi-battery-fade">Battery Capacity Degradation (%/yr)</label><input class="form-input" id="fi-battery-fade" type="number" min="0" max="20" step="0.1" value="1.6"/><div class="form-hint">PUCSL prosumer tariff-model assumption; replace with project warranty data.</div></div><div class="form-group"><label class="form-label" for="fi-priority-kwh">Measured / Estimated Priority Export (kWh/year)</label><input class="form-input" id="fi-priority-kwh" type="number" min="0" value="${donor?.dispatch?donor.dispatch.total.priorityKwh.toFixed(1):0}"/><div class="form-hint">Used only without a linked dispatch model. Declare exported energy for the 17:30–21:30 window, not battery nominal capacity.</div></div>`);
    if (donor?.selfUse) {container.querySelector('#fi-load').value=(donor.annualLoad/12).toFixed(1);container.querySelector('#fi-selfuse').value=(donor.selfUse.selfUseRatio*100).toFixed(1);}
    container.addEventListener('input',e=>{if(!e.target.closest('#fi-results'))container.querySelector('#fi-results').classList.add('hidden');});
    container.addEventListener('change',()=>container.querySelector('#fi-results').classList.add('hidden'));
    container.querySelector('#fi-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#fi-calc-btn'), () => _calculate(container));
    });
    container.querySelector('#fi-show-tiers-btn').addEventListener('click', () => _toggleTiers(container));
  }

  function _toggleTiers(container) {
    const el = container.querySelector('#fi-tiers-detail');
    const btn = container.querySelector('#fi-show-tiers-btn');
    if (el.classList.contains('hidden')) {
      el.innerHTML = `<table class="status-table"><thead><tr><th>New rooftop contracted AC capacity</th><th>Feed-in rate</th></tr></thead><tbody><tr><td>Up to 10 kW</td><td>23.11 LKR/kWh</td></tr><tr><td>Above 10 to 40 kW</td><td>19.15 LKR/kWh</td></tr><tr><td>Above 40 to 250 kW</td><td>17.11 LKR/kWh</td></tr><tr><td>Above 250 kW</td><td>15.81 LKR/kWh</td></tr></tbody></table><div class="form-hint">Valid clearance dated on/after 25 August 2026 is required. BESS priority tariffs have separate eligibility checks; net metering has no cash export payment. <a href="${DirectiveRules.SOURCES.tariffs.url}" target="_blank" rel="noopener noreferrer">Approved tariff source</a></div>`;
      el.classList.remove('hidden');
      btn.textContent = 'Hide Feed-in Bands';
    } else {
      el.classList.add('hidden');
      btn.textContent = 'Show Approved Feed-in Bands';
    }
  }

  function projectCashflows(options) {
    const {capex,solarKwh,load,selfUse,tariffOvr,life,disc,esc,deg,om,contractYears,batteryFade=0.016,priorityKwh=0,fit,terms,donor=null}=options;
    const cashflows=[-capex],deliveredEnergy=[];
    let npvValue=-capex;
    for(let y=1;y<=life;y++) {
      const pvFactor=Math.pow(1-deg/100,y-1), importRate=tariffOvr*Math.pow(1+esc/100,y-1);
      let yearPeriods, yearSelfUse=selfUse, yearSolar=solarKwh*pvFactor, yearDelivered=yearSolar;
      if(!!donor) {
        const yearly=DirectiveRules.dispatch(donor.monthly.map(m=>({...m,E_mon:m.E_mon*pvFactor})),load*12,{profile:donor.profile.id,usableKwh:donor.system.batteryUsable_kWh*Math.pow(1-batteryFade,y-1),monthlyLoadKwh:donor.dispatchOptions.monthlyLoadKwh,rtePct:donor.dispatchOptions.rtePct,chargeKW:donor.dispatchOptions.chargeKW,dischargeKW:donor.dispatchOptions.dischargeKW,pvPowerKW:donor.system.P_ac,exportKW:donor.policy.connection==='grid_export'?donor.policy.approvedExportKW:0,mode:fit.scheme==='net_plus'?'net_plus':fit.applicant.includes('bess')?'priority_export':'self_consumption'});
        yearDelivered=yearly.total.selfKwh+yearly.total.exportKwh;
        yearPeriods=yearly.monthly;yearSelfUse=yearSolar>0?yearly.total.selfKwh/yearSolar*100:0;
      }
      const yearTerms={...terms,status:y-1<Math.min(contractYears,fit.applicant==='retrofit_bess'?Number(fit.remainingYears):contractYears)?'eligible':'expired',contractLimitYears:Math.min(contractYears,fit.applicant==='retrofit_bess'?Number(fit.remainingYears):contractYears)};
      const yr=annualSavings(yearSolar,load,yearSelfUse,importRate,{scheme:fit.scheme,terms:yearTerms,year:y,priorityKwh:priorityKwh*pvFactor,periods:yearPeriods});
      if(!donor&&(fit.scheme==='zero_export'||fit.scheme==='offgrid'))yearDelivered=yr.self_consumed;
      deliveredEnergy.push(yearDelivered);
      const cf=yr.total-om;
      npvValue+=cf/Math.pow(1+disc/100,y);cashflows.push(cf);
    }
    return {npv:npvValue,cashflows,deliveredEnergy};

  }

  function _calculate(container) {
    const capex    = parseFloat(container.querySelector('#fi-capex').value);
    const solarKwh = parseFloat(container.querySelector('#fi-solar').value);
    const kwp      = parseFloat(container.querySelector('#fi-kwp').value);
    const om       = parseFloat(container.querySelector('#fi-om').value) || 0;
    const load     = parseFloat(container.querySelector('#fi-load').value);
    const selfUse  = Number(container.querySelector('#fi-selfuse').value);
    const tariffOvr= parseFloat(container.querySelector('#fi-tariff-custom').value) || 0;
    const life     = Number(container.querySelector('#fi-life').value);
    const disc     = Number(container.querySelector('#fi-discount').value);
    const esc      = Number(container.querySelector('#fi-esc').value);
    const deg      = Number(container.querySelector('#fi-deg').value);

    if (isNaN(capex) || capex <= 0) { App.toast('Enter system cost', 'error'); return; }
    if (isNaN(solarKwh) || solarKwh <= 0) { App.toast('Enter annual solar yield', 'error'); return; }
    if (isNaN(load) || load <= 0) { App.toast('Enter monthly consumption', 'error'); return; }

    if (!(tariffOvr>0)) {App.toast('Enter the current import energy rate from your bill or approved tariff','error');return;}
    const fit=DirectiveUI.readTariff(container,'fi-fit'), donor=App.state.designerResults;
    const terms=DirectiveRules.tariff({...fit,usableKwh:fit.usableKwh??donor?.system?.batteryUsable_kWh??0});
    container.querySelector('#fi-fit-tariff-preview').innerHTML=DirectiveUI.tariffSummary(terms);
    if (terms.status!=='eligible') {App.toast('Resolve tariff eligibility or select the existing signed-SPPA option','warning');return;}
    const contractYears=Number(container.querySelector('#fi-contract-years').value), batteryFade=Number(container.querySelector('#fi-battery-fade').value)/100;
    const priorityKwh=Number(container.querySelector('#fi-priority-kwh').value);
    if (![capex,solarKwh,om,load,selfUse,tariffOvr,life,disc,esc,deg,contractYears,batteryFade,priorityKwh].every(Number.isFinite)||om<0||batteryFade<0||batteryFade>=1||!(contractYears>0)||!Number.isInteger(life)||life<1||life>40||selfUse<0||selfUse>100||deg<0||deg>=100||disc<0||esc<0||!Number.isFinite(priorityKwh)||priorityKwh<0) {App.toast('Check financial percentages, export energy and agreement term','error');return;}
    const linked=donor?.dispatch&&Math.abs(solarKwh-donor.summary.E_annual)<1&&Math.abs(load*12-donor.annualLoad)<2&&['installation','billingClass','scheme','applicant','capacityKW','existingRate','remainingYears','clearanceDate','usableKwh'].every(k=>String(fit[k]??'')===String(donor.fitInputs?.[k]??''))&&Math.abs(selfUse-donor.selfUse.selfUseRatio*100)<0.2;
    const periods=linked?donor.dispatch.monthly:undefined;
    const sav = annualSavings(solarKwh,load,selfUse,tariffOvr,{scheme:fit.scheme,terms,priorityKwh,periods});
    const npvRes=projectCashflows({capex,solarKwh,load,selfUse,tariffOvr,life,disc,esc,deg,om,contractYears,batteryFade,priorityKwh,fit,terms,donor:linked?donor:null});

    // SPP
    const spp = simplePayback(capex, sav.total-om);

    // NPV + cash flows
    // Cash flows hold FIT rates fixed, end payments at the declared agreement term and apply battery fade separately.

    // IRR
    const irrVal = irr(npvRes.cashflows);

    // LCOE
    const discountedCosts=capex+npvRes.deliveredEnergy.reduce((sum,_,i)=>sum+om/Math.pow(1+disc/100,i+1),0);
    const discountedEnergy=npvRes.deliveredEnergy.reduce((sum,e,i)=>sum+e/Math.pow(1+disc/100,i+1),0);
    const lcoeVal=discountedEnergy>0?discountedCosts/discountedEnergy:Infinity;

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
        <div class="card-title">Year-1 scheme-aware savings</div>
        <div class="info-box">Settlement: ${_esc(d.sav.scheme)}. Net-metered surplus is banked as energy, not cash. This model offsets billing-period imports for Net Accounting before paying surplus; Net Metering carries credits within the modelled year. Historical credit ledgers and exact utility bills are not reconstructed. Banked surplus estimate: ${_fmt(d.sav.banked_units)} kWh.</div>
        <table class="status-table">
          <tbody>
            <tr><td>Solar Yield</td><td style="text-align:right">${_fmt(Math.round(d.solarKwh))} kWh/yr</td></tr>
            <tr><td>Self-Consumed (${(d.sav.self_consumed/d.solarKwh*100).toFixed(1)}%)</td><td style="text-align:right">${_fmt(Math.round(d.sav.self_consumed))} kWh/yr</td></tr>
            <tr><td>Physical grid export</td><td style="text-align:right">${_fmt(Math.round(d.sav.exported))} kWh/yr</td></tr>
            <tr><td>Paid export after netting / cap</td><td style="text-align:right">${_fmt(d.sav.paid_export_kWh)} kWh/yr</td></tr><tr><td>Effective Tariff</td><td style="text-align:right">Rs. ${_fmt(d.sav.tariff.toFixed(2))}/kWh</td></tr>
            <tr><td>Self-consumption / unit-offset savings</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.savings_self))}/yr</td></tr>
            <tr><td>Scheme-eligible cash export income</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.savings_export))}/yr</td></tr>
            <tr style="border-top:2px solid var(--border)">
              <td><strong>Total Annual Savings</strong></td>
              <td style="text-align:right;font-weight:700;color:var(--success)">Rs. ${_fmt(Math.round(d.sav.total))}/yr</td>
            </tr>
            <tr><td>Estimated energy cost before solar</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.bill_before))}/yr</td></tr>
            <tr><td>Estimated energy cost after offsets</td><td style="text-align:right">Rs. ${_fmt(Math.round(d.sav.bill_after))}/yr</td></tr>
          </tbody>
        </table>
      </div>

      <!-- CUMULATIVE CHART -->
      <div class="card">
        <div class="card-title">&#128200; Cumulative Cash Flow (${d.life} Years)</div>
        ${chartSvg}
        <div style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:4px">
          Uses ${d.esc}% import-cost escalation/yr and ${d.deg}%/yr PV degradation. Rooftop FIT rates are fixed; agreement expiry and the 15-year priority period are applied. Discount rate: ${d.disc}%.
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
        <div class="card-title">&#128218; Delivered-energy LCOE and entered import energy rate</div>
        <table class="status-table">
          <tbody>
            <tr><td>This system LCOE</td><td style="text-align:right;font-weight:700;color:var(--primary)">Rs. ${_fmt(d.lcoeVal.toFixed(2))}/kWh</td></tr>
            <tr><td>Entered import energy rate</td><td style="text-align:right">Rs. ~${_fmt(d.sav.tariff.toFixed(2))}/kWh</td></tr>

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

  return { render, cebBill, effectiveTariff, annualSavings, simplePayback, npv, irr, lcoe, projectCashflows };

})();
