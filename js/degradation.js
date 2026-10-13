/**
 * degradation.js — PV Module Degradation Calculator
 * Linear & compound degradation, warranty check, benchmarks.
 * Planning assumptions and the entered manufacturer warranty; qualification is separate.
 */

const Degradation = (() => {

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128200; PV Module Degradation</div>

        <div class="info-box">
          Explore power-retention projections using entered planning assumptions.
          SLS 1553 covers module safety; IEC 61215 covers design qualification. Neither supplies a universal annual degradation rate or warranty curve.
        </div>

        <div class="warn-box" style="margin-bottom:12px">
          Use the exact manufacturer's declared first-year loss, annual warranty schedule and measurement conditions.
          Heat, humidity, salt exposure, shading and defects need a site-specific assessment. A planning projection does not establish a warranty claim or qualification result.
        </div>
        <!-- CALC 1: LINEAR -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128290; Linear Degradation (Planning Model)</div>
          <div class="info-box" style="margin-bottom:10px">
            Formula: <strong>P(n) = P&#x2080; &times; (1 &minus; LID) &minus; P&#x2080; &times; d &times; (n &minus; 1)</strong><br>
            A planning model with a fixed loss relative to initial power each year. Confirm the actual warranty schedule separately.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Nameplate Power P&#x2080; (W)</label>
              <input class="form-input" id="lin-p0" type="number" step="any" placeholder="e.g. 600" />
              <div class="form-hint">Module or string STC rated power</div>
            </div>
            <div class="form-group">
              <label class="form-label">LID &mdash; Year 1 Loss (%)</label>
              <input class="form-input" id="lin-lid" type="number" step="any" value="2" />
              <div class="form-hint">Example default; replace with declared or measured evidence</div>
            </div>
            <div class="form-group">
              <label class="form-label">Annual Degradation d (%/year)</label>
              <input class="form-input" id="lin-d" type="number" step="any" value="0.5" />
              <div class="form-hint">Entered planning assumption; not an SLS limit</div>
            </div>
            <div class="form-group">
              <label class="form-label">Year n to Calculate</label>
              <input class="form-input" id="lin-n" type="number" step="1" value="25" />
              <div class="form-hint">e.g. 10, 20, 25</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="lin-calc-btn">Calculate Linear</button>
          <div id="lin-result" style="margin-top:10px"></div>
        </div>

        <!-- CALC 2: COMPOUND -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128290; Compound Degradation (Planning Model)</div>
          <div class="info-box" style="margin-bottom:10px">
            Formula: <strong>P(n) = P&#x2080; &times; (1 &minus; LID) &times; (1 &minus; d)^(n&minus;1)</strong><br>
            Loss compounds relative to the previous year. Suitability depends on the evidence and projection purpose.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Nameplate Power P&#x2080; (W)</label>
              <input class="form-input" id="cmp-p0" type="number" step="any" placeholder="e.g. 600" />
            </div>
            <div class="form-group">
              <label class="form-label">LID &mdash; Year 1 Loss (%)</label>
              <input class="form-input" id="cmp-lid" type="number" step="any" value="2" />
            </div>
            <div class="form-group">
              <label class="form-label">Annual Degradation d (%/year)</label>
              <input class="form-input" id="cmp-d" type="number" step="any" value="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Year n to Calculate</label>
              <input class="form-input" id="cmp-n" type="number" step="1" value="25" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="cmp-calc-btn">Calculate Compound</button>
          <div id="cmp-result" style="margin-top:10px"></div>
        </div>

        <!-- CALC 3: WARRANTY CHECK -->
        <div class="card">
          <div class="card-title">Warranty Retention Comparison</div>
          <div class="info-box" style="margin-bottom:10px">
            Enter the manufacturer's retention target at the actual system age and compare a properly corrected measurement.
            Warranty measurement conditions and claim acceptance remain with the manufacturer; no universal 80% rule is assumed.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Original Rated Power P&#x2080; (W)</label>
              <input class="form-input" id="wc-p0" type="number" step="any" placeholder="Nameplate at commissioning" />
            </div>
            <div class="form-group">
              <label class="form-label">Current Measured Power (W)</label>
              <input class="form-input" id="wc-pm" type="number" step="any" placeholder="STC-corrected field measurement" />
            </div>
            <div class="form-group">
              <label class="form-label">System Age (years)</label>
              <input class="form-input" id="wc-n" type="number" step="1" placeholder="Years since commissioning" />
            </div>
            <div class="form-group">
              <label class="form-label">Warranty Retention at Entered Age (%)</label>
              <input class="form-input" id="wc-wg" type="number" step="any" placeholder="From the exact warranty schedule" />
              <div class="form-hint">Use the actual age-specific target, including any first-year step</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="wc-calc-btn">Check Warranty</button>
          <div id="wc-result" style="margin-top:10px"></div>
        </div>

      </div>
    `;

    container.querySelector('#lin-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#lin-calc-btn'), () => _calcLinear(container));
    });
    container.querySelector('#cmp-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#cmp-calc-btn'), () => _calcCompound(container));
    });
    container.querySelector('#wc-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#wc-calc-btn'), () => _calcWarranty(container));
    });
  }

  // -----------------------------------------------------------------------
  // HELPERS
  // -----------------------------------------------------------------------

  function _g(container, id) {
    const el = container.querySelector('#' + id);
    return el ? parseFloat(el.value) : NaN;
  }

  function _steps(container, resultId, steps, verdict, cls) {
    const resultDiv = container.querySelector('#' + resultId);
    resultDiv.innerHTML = `
      <div>
        <div class="section-title">Step-by-Step Calculation</div>
        <div style="font-family:monospace;font-size:0.82rem;background:var(--bg-3);border-radius:var(--radius);padding:12px;line-height:1.9;overflow-x:auto">
          ${steps.map(s => `<div>${s}</div>`).join('')}
        </div>
        <div class="result-box ${cls}" style="margin-top:10px">
          <div class="result-value" style="font-size:1.2rem">${verdict}</div>
        </div>
        <div class="btn-group" style="margin-top:8px" data-no-print>
          <button class="btn btn-secondary btn-sm" id="${resultId}-print-btn">&#128424; Print</button>
        </div>
      </div>`;

    const printBtn = resultDiv.querySelector('#' + resultId + '-print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (typeof App.printSection === 'function') {
          App.printSection('#' + resultId, 'Module Degradation Report', container);
          return;
        }
        window.print();
      });
    }
  }

  function _keyYearTable(P0, keyYears, fn) {
    return keyYears.map(y => {
      const py = fn(y);
      return `Year ${y}: ${py.toFixed(1)} W (${(py/P0*100).toFixed(1)}%)`;
    });
  }

  // -----------------------------------------------------------------------
  // CALCULATORS
  // -----------------------------------------------------------------------

  function _calcLinear(container) {
    const P0  = _g(container, 'lin-p0');
    const LID = _g(container, 'lin-lid') / 100;
    const d   = _g(container, 'lin-d')   / 100;
    const n   = _g(container, 'lin-n');
    if (![P0,LID,d,n].every(Number.isFinite)||P0<=0||LID<0||LID>1||d<0||d>1||n<1) {
      container.querySelector('#lin-result').innerHTML = '<div class="danger-box">Enter positive rated power, year ≥1 and valid percentage losses (0–100%).</div>'; return;
    }
    const P1 = P0 * (1 - LID);
    const Pn = P1 - P0 * d * (n - 1);
    if(Pn<0){container.querySelector('#lin-result').innerHTML='<div class="warn-box">These assumptions project below zero power. The linear model is outside its physical range at this year; revise the model and evidence.</div>';return;}
    const pct = (Pn / P0) * 100;
    const keyYears = [...new Set([1,5,10,15,20,25,n])].filter(y=>y>=1&&y<=Math.max(n,25)).sort((a,b)=>a-b);
    _steps(container, 'lin-result', [
      `Planning linear formula: P(n) = P\u2080 \u00d7 (1 \u2212 LID) \u2212 P\u2080 \u00d7 d \u00d7 (n \u2212 1)`,
      `Step 1: P\u2080 = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/yr, n = ${n}`,
      `Step 2: Year 1 after LID: P\u2081 = ${P0} \u00d7 (1 \u2212 ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
      `Step 3: Annual loss = P\u2080 \u00d7 d = ${P0} \u00d7 ${(d*100).toFixed(2)}% = ${(P0*d).toFixed(2)} W/year`,
      `Step 4: P(${n}) = ${P1.toFixed(2)} \u2212 ${(P0*d).toFixed(2)} \u00d7 (${n}\u22121) = ${P1.toFixed(2)} \u2212 ${(P0*d*(n-1)).toFixed(2)} = ${Pn.toFixed(2)} W`,
      `Step 5: Retention = ${Pn.toFixed(2)} \u00f7 ${P0} \u00d7 100 = ${pct.toFixed(1)}%`,
      `\u2500\u2500 Year-by-year output \u2500\u2500`,
      ..._keyYearTable(P0, keyYears, y => y===1 ? P1 : P1 - P0*d*(y-1)),
      `Projection from entered assumptions; compare the exact age-specific warranty separately.`
    ], `Year ${n}: ${Pn.toFixed(1)} W \u2014 ${pct.toFixed(1)}% of P\u2080`, 'alert-warn');
  }

  function _calcCompound(container) {
    const P0  = _g(container, 'cmp-p0');
    const LID = _g(container, 'cmp-lid') / 100;
    const d   = _g(container, 'cmp-d')   / 100;
    const n   = _g(container, 'cmp-n');
    if (![P0,LID,d,n].every(Number.isFinite)||P0<=0||LID<0||LID>1||d<0||d>1||n<1) {
      container.querySelector('#cmp-result').innerHTML = '<div class="danger-box">Enter positive rated power, year ≥1 and valid percentage losses (0–100%).</div>'; return;
    }
    const P1 = P0 * (1 - LID);
    const Pn = P1 * Math.pow(1 - d, n - 1);
    const pct = (Pn / P0) * 100;
    const Pn_lin = P1 - P0 * d * (n - 1);
    const keyYears = [...new Set([1,5,10,15,20,25,n])].filter(y=>y>=1&&y<=Math.max(n,25)).sort((a,b)=>a-b);
    _steps(container, 'cmp-result', [
      `Compound Formula: P(n) = P\u2080 \u00d7 (1 \u2212 LID) \u00d7 (1 \u2212 d)^(n\u22121)`,
      `Step 1: P\u2080 = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/yr, n = ${n}`,
      `Step 2: Year 1 after LID: P\u2081 = ${P0} \u00d7 (1 \u2212 ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
      `Step 3: Compound factor = (1 \u2212 ${(d*100).toFixed(2)}%)^(${n}\u22121) = ${(1-d).toFixed(5)}^${n-1} = ${Math.pow(1-d,n-1).toFixed(6)}`,
      `Step 4: P(${n}) = ${P1.toFixed(2)} \u00d7 ${Math.pow(1-d,n-1).toFixed(5)} = ${Pn.toFixed(2)} W`,
      `Step 5: Retention = ${Pn.toFixed(2)} \u00f7 ${P0} \u00d7 100 = ${pct.toFixed(1)}%`,
      `\u2500\u2500 Year-by-year output \u2500\u2500`,
      ..._keyYearTable(P0, keyYears, y => P1 * Math.pow(1-d, y-1)),
      `Compound vs Linear at Year ${n}: ${Math.abs(Pn-Pn_lin).toFixed(1)} W difference (compound is slightly ${Pn>Pn_lin?'higher':'lower'})`,
      `Projection from entered assumptions; compare the exact age-specific warranty separately.`
    ], `Year ${n}: ${Pn.toFixed(1)} W \u2014 ${pct.toFixed(1)}% of P\u2080`, 'alert-warn');
  }

  function _calcWarranty(container) {
    const P0 = _g(container, 'wc-p0');
    const Pm = _g(container, 'wc-pm');
    const n  = _g(container, 'wc-n');
    const wg = _g(container, 'wc-wg');
    if (![P0,Pm,n,wg].every(Number.isFinite)||P0<=0||Pm<0||n<0||wg<0||wg>100) {
      container.querySelector('#wc-result').innerHTML = '<div class="danger-box">Enter valid rated/measured power, age and the actual age-specific retention target (0–100%).</div>'; return;
    }
    const actual_pct   = (Pm / P0) * 100;
    const warranty_at_n = wg;
    const meetsNow     = actual_pct >= warranty_at_n;
    const annualDeg    = n > 0 ? ((P0 - Pm) / P0 / n * 100) : 0;
    _steps(container, 'wc-result', [
      `Comparison with the entered manufacturer retention target`,
      `Step 1: Original rated power P\u2080 = ${P0} W`,
      `Step 2: Current measured power (STC-corrected) = ${Pm} W`,
      `Step 3: System age = ${n} years`,
      `Step 4: Actual retention = ${Pm} \u00f7 ${P0} \u00d7 100 = ${actual_pct.toFixed(1)}%`,
      `Step 5: Effective annual degradation = (${P0} \u2212 ${Pm}) \u00f7 ${P0} \u00f7 ${n} = ${annualDeg.toFixed(3)}%/year`,
      `Step 6: Entered warranty retention at Year ${n}: ${warranty_at_n.toFixed(1)}%`,
      meetsNow ? `${actual_pct.toFixed(1)}% meets the entered ${warranty_at_n.toFixed(1)}% target` : `${actual_pct.toFixed(1)}% is below the entered ${warranty_at_n.toFixed(1)}% target`,
      `Actual warranty assessment requires the OEM measurement conditions, uncertainty and claim process.`
    ], `${actual_pct.toFixed(1)}% \u2014 ${meetsNow?'Entered target met':'Below entered target'} at Year ${n}`, meetsNow?'alert-warn':'alert-unsafe');
  }

  return { render };
})();
