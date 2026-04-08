/**
 * degradation.js — PV Module Degradation Calculator
 * Linear & compound degradation, warranty check, benchmarks.
 * IEC 61215 / SLS 1553
 */

const Degradation = (() => {

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128200; PV Module Degradation</div>

        <div class="info-box">
          Calculate expected power output over system lifetime using IEC 61215 / SLS 1553 formulas.
          Linear model for warranty checks; compound model for financial/yield analysis.
        </div>

        <!-- BENCHMARKS TABLE -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">Industry Benchmarks (IEC 61215 / SLS 1553)</div>
          <div style="overflow-x:auto">
            <table class="status-table">
              <thead>
                <tr>
                  <th>Technology</th>
                  <th>LID Year 1</th>
                  <th>Annual Rate (d)</th>
                  <th>Year 25 Output</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="font-weight:600">Monocrystalline (c-Si)</td>
                  <td style="color:var(--primary);font-weight:700">1.0–2.5%</td>
                  <td style="color:var(--primary);font-weight:700">0.3–0.5%/yr</td>
                  <td>88–93%</td>
                </tr>
                <tr>
                  <td style="font-weight:600">N-type (TOPCon / HJT)</td>
                  <td style="color:var(--success);font-weight:700">&lt;0.5%</td>
                  <td style="color:var(--success);font-weight:700">0.25–0.4%/yr</td>
                  <td>90–95%</td>
                </tr>
                <tr>
                  <td style="font-weight:600">Polycrystalline</td>
                  <td style="color:var(--primary);font-weight:700">1.5–2.5%</td>
                  <td style="color:var(--primary);font-weight:700">0.5–0.8%/yr</td>
                  <td>80–88%</td>
                </tr>
                <tr>
                  <td style="font-weight:600">Thin-Film</td>
                  <td style="color:var(--danger);font-weight:700">1.0–3.0%</td>
                  <td style="color:var(--danger);font-weight:700">0.6–1.0%/yr</td>
                  <td>75–85%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px">
            SLS 1553 / Sri Lanka requirement: ≥80% of initial power at Year 25 (25-year linear warranty).
            CEB/LECO grid connection requires valid IEC 61215 certificate.
          </div>
        </div>

        <!-- TROPICAL NOTE -->
        <div class="warn-box" style="margin-bottom:12px">
          <strong>Sri Lanka Tropical Factors:</strong> High humidity + heat can cause PID and encapsulant browning.
          Coastal sites risk salt mist corrosion of interconnects. Degradation rates may be 0.1–0.2%/yr higher than temperate benchmarks.
          Use N-type modules for lowest long-term degradation risk.
        </div>

        <!-- CALC 1: LINEAR -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#128290; Linear Degradation (Warranty Model)</div>
          <div class="info-box" style="margin-bottom:10px">
            Formula: <strong>P(n) = P&#x2080; &times; (1 &minus; LID) &minus; P&#x2080; &times; d &times; (n &minus; 1)</strong><br>
            Standard used for manufacturer warranties. Fixed loss per year.
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
              <div class="form-hint">Mono: 1.0&ndash;2.5%, N-type: &lt;0.5%</div>
            </div>
            <div class="form-group">
              <label class="form-label">Annual Degradation d (%/year)</label>
              <input class="form-input" id="lin-d" type="number" step="any" value="0.5" />
              <div class="form-hint">Mono: 0.3&ndash;0.5%, Poly: 0.5&ndash;0.8%</div>
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
          <div class="card-title">&#128290; Compound Degradation (Realistic / Financial Model)</div>
          <div class="info-box" style="margin-bottom:10px">
            Formula: <strong>P(n) = P&#x2080; &times; (1 &minus; LID) &times; (1 &minus; d)^(n&minus;1)</strong><br>
            More accurate for energy yield prediction &mdash; loss compounds relative to previous year.
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
          <div class="card-title">&#9989; Warranty Power Check (SLS 1553 / IEC 61215)</div>
          <div class="info-box" style="margin-bottom:10px">
            Check if current measured output meets the manufacturer warranty at this system age.
            SLS 1553 requirement: &ge;80% of initial power at Year 25.
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
              <label class="form-label">Warranty at Year 25 (%)</label>
              <input class="form-input" id="wc-wg" type="number" step="any" value="80" />
              <div class="form-hint">Typically 80% per SLS 1553</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="wc-calc-btn">Check Warranty</button>
          <div id="wc-result" style="margin-top:10px"></div>
        </div>

      </div>
    `;

    container.querySelector('#lin-calc-btn').addEventListener('click', () => _calcLinear(container));
    container.querySelector('#cmp-calc-btn').addEventListener('click', () => _calcCompound(container));
    container.querySelector('#wc-calc-btn').addEventListener('click',  () => _calcWarranty(container));
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
    if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) {
      container.querySelector('#lin-result').innerHTML = '<div class="danger-box">Enter all values</div>'; return;
    }
    const P1 = P0 * (1 - LID);
    const Pn = P1 - P0 * d * (n - 1);
    const pct = (Pn / P0) * 100;
    const ok  = pct >= 80;
    const keyYears = [...new Set([1,5,10,15,20,25,n])].filter(y=>y>=1&&y<=Math.max(n,25)).sort((a,b)=>a-b);
    _steps(container, 'lin-result', [
      `IEC 61215 / SLS 1553 Linear Formula: P(n) = P\u2080 \u00d7 (1 \u2212 LID) \u2212 P\u2080 \u00d7 d \u00d7 (n \u2212 1)`,
      `Step 1: P\u2080 = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/yr, n = ${n}`,
      `Step 2: Year 1 after LID: P\u2081 = ${P0} \u00d7 (1 \u2212 ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
      `Step 3: Annual loss = P\u2080 \u00d7 d = ${P0} \u00d7 ${(d*100).toFixed(2)}% = ${(P0*d).toFixed(2)} W/year`,
      `Step 4: P(${n}) = ${P1.toFixed(2)} \u2212 ${(P0*d).toFixed(2)} \u00d7 (${n}\u22121) = ${P1.toFixed(2)} \u2212 ${(P0*d*(n-1)).toFixed(2)} = ${Pn.toFixed(2)} W`,
      `Step 5: Retention = ${Pn.toFixed(2)} \u00f7 ${P0} \u00d7 100 = ${pct.toFixed(1)}%`,
      `\u2500\u2500 Year-by-year output \u2500\u2500`,
      ..._keyYearTable(P0, keyYears, y => y===1 ? P1 : P1 - P0*d*(y-1)),
      `SLS 1553 warranty minimum: \u226580% at Year 25`,
      ok ? `${pct.toFixed(1)}% \u2265 80% \u2192 \u2713 Within warranty` : `${pct.toFixed(1)}% < 80% \u2192 \u2717 Below warranty threshold`
    ], `Year ${n}: ${Pn.toFixed(1)} W \u2014 ${pct.toFixed(1)}% of P\u2080 \u2014 ${ok?'\u2713 OK':'\u2717 Below 80%'}`, ok?'alert-safe':'alert-unsafe');
  }

  function _calcCompound(container) {
    const P0  = _g(container, 'cmp-p0');
    const LID = _g(container, 'cmp-lid') / 100;
    const d   = _g(container, 'cmp-d')   / 100;
    const n   = _g(container, 'cmp-n');
    if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) {
      container.querySelector('#cmp-result').innerHTML = '<div class="danger-box">Enter all values</div>'; return;
    }
    const P1 = P0 * (1 - LID);
    const Pn = P1 * Math.pow(1 - d, n - 1);
    const pct = (Pn / P0) * 100;
    const ok  = pct >= 80;
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
      ok ? `${pct.toFixed(1)}% \u2265 80% \u2192 \u2713 Within warranty` : `${pct.toFixed(1)}% < 80% \u2192 \u2717 Below warranty threshold`
    ], `Year ${n}: ${Pn.toFixed(1)} W \u2014 ${pct.toFixed(1)}% of P\u2080 \u2014 ${ok?'\u2713 OK':'\u2717 Below 80%'}`, ok?'alert-safe':'alert-unsafe');
  }

  function _calcWarranty(container) {
    const P0 = _g(container, 'wc-p0');
    const Pm = _g(container, 'wc-pm');
    const n  = _g(container, 'wc-n');
    const wg = _g(container, 'wc-wg');
    if (isNaN(P0) || isNaN(Pm) || isNaN(n)) {
      container.querySelector('#wc-result').innerHTML = '<div class="danger-box">Enter P\u2080, current power and age</div>'; return;
    }
    const guar = isNaN(wg) ? 80 : wg;
    const actual_pct   = (Pm / P0) * 100;
    const warranty_at_n = 100 - (100 - guar) * (n / 25);
    const meetsNow     = actual_pct >= warranty_at_n;
    const annualDeg    = n > 0 ? ((P0 - Pm) / P0 / n * 100) : 0;
    const proj25       = 100 - annualDeg * 25;
    _steps(container, 'wc-result', [
      `SLS 1553 / Manufacturer warranty check`,
      `Step 1: Original rated power P\u2080 = ${P0} W`,
      `Step 2: Current measured power (STC-corrected) = ${Pm} W`,
      `Step 3: System age = ${n} years`,
      `Step 4: Actual retention = ${Pm} \u00f7 ${P0} \u00d7 100 = ${actual_pct.toFixed(1)}%`,
      `Step 5: Effective annual degradation = (${P0} \u2212 ${Pm}) \u00f7 ${P0} \u00f7 ${n} = ${annualDeg.toFixed(3)}%/year`,
      `Step 6: Warranty limit at Year ${n} (linear interpolation to ${guar}% at Year 25):`,
      `         = 100% \u2212 (100 \u2212 ${guar}%) \u00d7 ${n}/25 = ${warranty_at_n.toFixed(1)}%`,
      meetsNow ? `${actual_pct.toFixed(1)}% \u2265 ${warranty_at_n.toFixed(1)}% \u2192 \u2713 Within warranty at Year ${n}` : `${actual_pct.toFixed(1)}% < ${warranty_at_n.toFixed(1)}% \u2192 \u2717 Below warranty limit at Year ${n}`,
      `Projected at Year 25 (at current rate): ${proj25.toFixed(1)}% \u2014 ${proj25>=80?'\u2713 Should meet 80% target':'\u2717 May not meet 80% target'}`
    ], meetsNow ? `\u2713 ${actual_pct.toFixed(1)}% \u2014 Warranty OK at Year ${n}` : `\u2717 ${actual_pct.toFixed(1)}% \u2014 Below warranty at Year ${n}`, meetsNow?'alert-safe':'alert-unsafe');
  }

  return { render };
})();
