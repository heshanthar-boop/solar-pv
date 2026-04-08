/**
 * pr.js — Performance Ratio Calculator + Insulation Resistance Check
 * IEC 61724-1 PR formula. IEC 62446-1 IR minimum check.
 */

const PRCalc = (() => {
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

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)} (${_esc(p.Pmax)}W)</option>`
    ).join('');

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128200; Performance Ratio &amp; IR Test</div>

        <!-- PR CALCULATOR -->
        <div class="card">
          <div class="card-title">Performance Ratio — IEC 61724-1</div>
          <div class="info-box">
            PR = E_AC / (H_poa × P_stc). Typical good system: 75–85%. Below 70% warrants investigation.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">AC Energy Produced (kWh)</label>
              <input class="form-input" id="pr-eac" type="number" step="0.1" placeholder="From inverter meter / CEB meter" />
              <div class="form-hint">Measurement period (day / month / year)</div>
            </div>
            <div class="form-group">
              <label class="form-label">POA Irradiation (kWh/m²)</label>
              <input class="form-input" id="pr-hpoa" type="number" step="0.1" placeholder="From pyranometer / irradiance logger" />
              <div class="form-hint">Plane-of-array, same period as energy</div>
            </div>
            <div class="form-group">
              <label class="form-label">System DC Capacity (kWp)</label>
              <input class="form-input" id="pr-pkwp" type="number" step="0.1" placeholder="Total array nameplate kWp" />
            </div>
            <div class="form-group">
              <label class="form-label">Measurement Period</label>
              <select class="form-select" id="pr-period">
                <option value="day">Single Day</option>
                <option value="month" selected>Month</option>
                <option value="year">Year</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="pr-calc-btn">Calculate PR</button>
          <div id="pr-result" class="hidden" style="margin-top:14px"></div>
        </div>

        <!-- INSTANT PR (spot check) -->
        <div class="card">
          <div class="card-title">Spot PR Check (Instantaneous)</div>
          <div class="info-box">
            For field spot-check: compare actual inverter AC output right now vs theoretical maximum at current irradiance and temperature.
          </div>
          <div class="form-group">
            <label class="form-label">Module (for temperature correction)</label>
            <select class="form-select" id="pr-panel">
              <option value="">-- Select Panel (optional) --</option>
              ${panelOptions}
            </select>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Current AC Output (kW)</label>
              <input class="form-input" id="pr-pac" type="number" step="0.01" placeholder="From inverter display" />
            </div>
            <div class="form-group">
              <label class="form-label">Current Irradiance (W/m²)</label>
              <input class="form-input" id="pr-g" type="number" value="900" />
            </div>
            <div class="form-group">
              <label class="form-label">Module Temp (°C)</label>
              <input class="form-input" id="pr-tmod" type="number" value="55" />
            </div>
            <div class="form-group">
              <label class="form-label">System DC Capacity (kWp)</label>
              <input class="form-input" id="pr-pkwp2" type="number" step="0.1" placeholder="Total nameplate kWp" />
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="pr-spot-btn">Check Spot PR</button>
          <div id="pr-spot-result" class="hidden" style="margin-top:14px"></div>
        </div>

        <!-- IR TEST -->
        <div class="card">
          <div class="card-title">Insulation Resistance (IR) Test — IEC 62446-1</div>
          <div class="info-box">
            Minimum 1 MΩ at 500V DC test voltage (IEC 62446-1:2016 Cl. 5.3.3). Test DC+ to earth and DC− to earth separately.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">DC+ to Earth (MΩ)</label>
              <input class="form-input" id="ir-pos" type="number" step="0.01" placeholder="Measured MΩ" />
            </div>
            <div class="form-group">
              <label class="form-label">DC− to Earth (MΩ)</label>
              <input class="form-input" id="ir-neg" type="number" step="0.01" placeholder="Measured MΩ" />
            </div>
            <div class="form-group">
              <label class="form-label">Test Voltage (V)</label>
              <input class="form-input" id="ir-volt" type="number" value="500" />
              <div class="form-hint">Typically 500V DC for ≤1000V systems</div>
            </div>
            <div class="form-group">
              <label class="form-label">String / Location</label>
              <input class="form-input" id="ir-label" placeholder="e.g. Array 1 combiner" />
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="ir-check-btn">Check IR Result</button>
          <div id="ir-result" class="hidden" style="margin-top:14px"></div>
        </div>

        <!-- STANDARDS REFERENCE -->
        <div class="card">
          <div class="card-title">&#128218; Standards Reference</div>
          <table class="status-table">
            <thead><tr><th>Standard</th><th>Scope</th><th>Key Limit / Requirement</th></tr></thead>
            <tbody>
              <tr><td><strong>IEC 62446-1:2016</strong></td><td>Commissioning tests &amp; documentation</td><td>IR ≥ 1 MΩ, Voc ±2%, Isc ±5% of STC</td></tr>
              <tr><td><strong>IEC 61215:2021</strong></td><td>Module design qualification</td><td>Performance &amp; durability testing</td></tr>
              <tr><td><strong>IEC 61730:2023</strong></td><td>Module safety qualification</td><td>Earthing, insulation, mechanical</td></tr>
              <tr><td><strong>IEC 60364-7-712:2017</strong></td><td>PV electrical installation</td><td>Earthing resistance &lt;1Ω</td></tr>
              <tr><td><strong>IEC 61643-32:2019</strong></td><td>DC-side SPD</td><td>SPD required at array &amp; inverter DC input</td></tr>
              <tr><td><strong>IEC TS 62804-1:2025</strong></td><td>PID detection</td><td>Negative grounding or PID protection required</td></tr>
              <tr><td><strong>IEC 61724-1</strong></td><td>Performance monitoring</td><td>PR = E_AC / (H_poa × P_stc/G_stc)</td></tr>
              <tr><td><strong>SLS 1522:2016</strong></td><td>Sri Lanka SPD standard</td><td>SPD compliance for AC &amp; DC sides</td></tr>
              <tr><td><strong>PUCSL Guidelines</strong></td><td>Sri Lanka rooftop solar</td><td>Commissioning sign-off, CEB metering, UV cable</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('#pr-calc-btn').addEventListener('click', () => _calcPR(container));
    container.querySelector('#pr-spot-btn').addEventListener('click', () => _spotPR(container));
    container.querySelector('#ir-check-btn').addEventListener('click', () => _checkIR(container));
  }

  function _calcPR(container) {
    const E = parseFloat(container.querySelector('#pr-eac').value);
    const H = parseFloat(container.querySelector('#pr-hpoa').value);
    const P = parseFloat(container.querySelector('#pr-pkwp').value);
    if ([E, H, P].some(isNaN) || H === 0 || P === 0) { App.toast('Fill all PR fields', 'error'); return; }

    const pr = PVCalc.performanceRatio(E, H, P);
    const prPct = (pr * 100).toFixed(1);
    const cls = pr >= 0.80 ? 'alert-safe' : pr >= 0.70 ? 'alert-warn' : 'alert-unsafe';
    const verdict = pr >= 0.80 ? 'Good' : pr >= 0.70 ? 'Acceptable — investigate losses' : 'Poor — investigate immediately';

    const div = container.querySelector('#pr-result');
    div.classList.remove('hidden');
    div.innerHTML = `
      <div class="result-box ${cls}">
        <div class="result-value">PR = ${prPct}%</div>
        <div class="result-label">${verdict}</div>
        <div class="result-sub">E_AC = ${_esc(E)} kWh &bull; H_poa = ${_esc(H)} kWh/m&sup2; &bull; P_stc = ${_esc(P)} kWp</div>
      </div>
      <div class="info-box" style="margin-top:8px">
        Benchmark: ≥80% = Good &bull; 70–80% = Acceptable &bull; &lt;70% = Poor / fault suspected<br>
        IEC 61724-1: PR = ${_esc(E)} / (${_esc(H)} × ${_esc(P)} / 1.0) = <strong>${_esc(prPct)}%</strong>
      </div>
    `;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="pr-print-btn">&#128424; Print</button>';
    div.appendChild(printWrap);
    printWrap.querySelector('#pr-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#pr-result', 'Performance Ratio Report', container);
        return;
      }
      window.print();
    });
  }

  function _spotPR(container) {
    const Pac = parseFloat(container.querySelector('#pr-pac').value);
    const G   = parseFloat(container.querySelector('#pr-g').value);
    const T   = parseFloat(container.querySelector('#pr-tmod').value);
    const P   = parseFloat(container.querySelector('#pr-pkwp2').value);
    const panelId = container.querySelector('#pr-panel').value;

    if ([Pac, G, P].some(isNaN)) { App.toast('Fill AC output, irradiance, and capacity', 'error'); return; }

    let P_expected_kW;
    if (panelId) {
      const panel = DB.getById(panelId);
      P_expected_kW = PVCalc.expectedPower(P * 1000, G, isNaN(T) ? 25 : T, panel.coeffPmax) / 1000;
    } else {
      P_expected_kW = P * (G / 1000) * (1 + (-0.0030) * ((isNaN(T) ? 25 : T) - 25));
    }

    const pr = Pac / P_expected_kW;
    const prPct = (pr * 100).toFixed(1);
    const cls = pr >= 0.80 ? 'alert-safe' : pr >= 0.70 ? 'alert-warn' : 'alert-unsafe';

    const div = container.querySelector('#pr-spot-result');
    div.classList.remove('hidden');
    div.innerHTML = `
      <div class="result-box ${cls}">
        <div class="result-value">Spot PR = ${prPct}%</div>
        <div class="result-label">AC Output: ${_esc(Pac)} kW &bull; Expected at G=${_esc(G)} W/m&sup2;, T=${_esc(T)}°C: ${_esc(P_expected_kW.toFixed(2))} kW</div>
      </div>
    `;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="pr-spot-print-btn">&#128424; Print</button>';
    div.appendChild(printWrap);
    printWrap.querySelector('#pr-spot-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#pr-spot-result', 'Spot PR Report', container);
        return;
      }
      window.print();
    });
  }

  function _checkIR(container) {
    const pos   = parseFloat(container.querySelector('#ir-pos').value);
    const neg   = parseFloat(container.querySelector('#ir-neg').value);
    const volt  = container.querySelector('#ir-volt').value || '500';
    const label = container.querySelector('#ir-label').value || 'Array';

    if (isNaN(pos) && isNaN(neg)) { App.toast('Enter at least one IR measurement', 'error'); return; }

    const MIN = 1.0;
    function row(label, val) {
      if (isNaN(val)) return '';
      const pass = val >= MIN;
      const cls = pass ? 'status-ok' : 'status-fault';
      const badge = pass
        ? '<span class="status-badge badge-pass">PASS</span>'
        : '<span class="status-badge badge-fail">FAIL</span>';
      return `<tr class="${cls}"><td>${_esc(label)}</td><td>${_esc(val)} M&Omega;</td><td>${_esc(MIN)} M&Omega;</td><td>${badge}</td></tr>`;
    }

    const allPass = (!isNaN(pos) ? pos >= MIN : true) && (!isNaN(neg) ? neg >= MIN : true);

    const div = container.querySelector('#ir-result');
    div.classList.remove('hidden');
    div.innerHTML = `
      <div class="result-box ${allPass ? 'alert-safe' : 'alert-unsafe'}" style="margin-bottom:10px">
        <div class="result-value">${allPass ? '&#10003; PASS' : '&#9888; FAIL'}</div>
        <div class="result-label">${_esc(label)} — Test voltage: ${_esc(volt)}V DC</div>
      </div>
      <table class="status-table">
        <thead><tr><th>Test</th><th>Measured</th><th>Minimum</th><th>Result</th></tr></thead>
        <tbody>
          ${row('DC+ to Earth', pos)}
          ${row('DC− to Earth', neg)}
        </tbody>
      </table>
      <div class="info-box" style="margin-top:8px;font-size:0.78rem">
        IEC 62446-1:2016 Cl. 5.3.3: Minimum insulation resistance ≥ 1 MΩ at 500V DC test voltage.
        Test both polarities. Values below 1 MΩ indicate earth fault — do not energise.
      </div>
    `;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="ir-print-btn">&#128424; Print</button>';
    div.appendChild(printWrap);
    printWrap.querySelector('#ir-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ir-result', 'Insulation Resistance Report', container);
        return;
      }
      window.print();
    });
  }

  return { render };
})();
