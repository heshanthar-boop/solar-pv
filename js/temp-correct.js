/**
 * temp-correct.js — Temperature & Irradiance Correction Calculator
 * Shows module parameters at min/max site temperature vs STC.
 * Also calculates cell temperature from ambient using NOCT formula.
 */

const TempCalc = (() => {

  function render(container) {
    const panels = DB.getAll();
    const panelOptions = panels.map(p =>
      `<option value="${p.id}">${p.manufacturer} ${p.model} (${p.Pmax}W)</option>`
    ).join('');

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#127777; Temperature Correction</div>

        <div class="card">
          <div class="card-title">Module & Conditions</div>
          <div class="form-group">
            <label class="form-label">Module</label>
            <select class="form-select" id="tc-panel">
              <option value="">-- Select Panel --</option>
              ${panelOptions}
            </select>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Site Min Ambient (°C)</label>
              <input class="form-input" id="tc-tmin" type="number" value="10" />
              <div class="form-hint">Coldest ambient (morning/night)</div>
            </div>
            <div class="form-group">
              <label class="form-label">Site Max Ambient (°C)</label>
              <input class="form-input" id="tc-tmax" type="number" value="38" />
              <div class="form-hint">Hottest ambient on site</div>
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Irradiance (W/m²)</label>
              <input class="form-input" id="tc-irr" type="number" value="1000" />
              <div class="form-hint">1000 = STC. Affects Isc &amp; Pmax.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Modules per String</label>
              <input class="form-input" id="tc-nmod" type="number" value="20" />
              <div class="form-hint">For string-level Voc/Vmp display</div>
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="tc-calc-btn">Calculate</button>
        </div>

        <div id="tc-results" class="hidden"></div>
      </div>
    `;

    container.querySelector('#tc-calc-btn').addEventListener('click', () => _calculate(container));
    // Auto-calculate when panel changes if fields already filled
    container.querySelector('#tc-panel').addEventListener('change', () => {
      if (container.querySelector('#tc-tmin').value) _calculate(container);
    });
  }

  function _calculate(container) {
    const panelId = container.querySelector('#tc-panel').value;
    if (!panelId) { App.toast('Select a panel first', 'error'); return; }
    const panel = DB.getById(panelId);
    if (!panel) return;

    const T_min = parseFloat(container.querySelector('#tc-tmin').value);
    const T_amb_max = parseFloat(container.querySelector('#tc-tmax').value);
    const G = parseFloat(container.querySelector('#tc-irr').value) || 1000;
    const n_mod = parseInt(container.querySelector('#tc-nmod').value) || 1;

    if (isNaN(T_min) || isNaN(T_amb_max)) { App.toast('Enter site temperatures', 'error'); return; }

    // Cell temperatures
    const T_cell_min = T_min; // at low irradiance/morning, cell ≈ ambient
    const T_cell_max = PVCalc.cellTemp(T_amb_max, panel.NOCT, G);

    const table = PVCalc.tempCorrectionTable(panel, T_cell_min, T_cell_max, G);

    function devClass(dev) {
      const abs = Math.abs(dev);
      if (abs > 10) return 'text-danger fw-bold';
      if (abs > 5)  return 'text-warning fw-bold';
      return '';
    }

    function devStr(dev) {
      return (dev >= 0 ? '+' : '') + dev.toFixed(2) + '%';
    }

    function row(label, stcVal, minVal, minDev, maxVal, maxDev, unit) {
      return `
        <tr>
          <td><strong>${label}</strong></td>
          <td>${stcVal.toFixed(2)} ${unit}</td>
          <td>${minVal.toFixed(2)} ${unit}</td>
          <td class="${devClass(minDev)}">${devStr(minDev)}</td>
          <td>${maxVal.toFixed(2)} ${unit}</td>
          <td class="${devClass(maxDev)}">${devStr(maxDev)}</td>
        </tr>`;
    }

    const resultsDiv = container.querySelector('#tc-results');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      <div class="card">
        <div class="card-title">Cell Temperature</div>
        <div class="result-grid">
          <div class="result-box">
            <div class="result-value">${T_cell_min.toFixed(1)}°C</div>
            <div class="result-label">T_cell at T_min</div>
            <div class="result-sub">Ambient = ${T_min}°C</div>
          </div>
          <div class="result-box">
            <div class="result-value">${T_cell_max.toFixed(1)}°C</div>
            <div class="result-label">T_cell at T_max</div>
            <div class="result-sub">Ambient = ${T_amb_max}°C, G = ${G} W/m²</div>
          </div>
        </div>
        <div class="info-box">Formula: T_cell = T_amb + (NOCT − 20) / 800 × G. NOCT = ${panel.NOCT}°C for this module.</div>
      </div>

      <div class="card">
        <div class="card-title">Module Parameters vs Temperature</div>
        <div style="overflow-x:auto">
          <table class="status-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>STC (25°C)</th>
                <th>At T_min (${T_cell_min.toFixed(0)}°C)</th>
                <th>Dev%</th>
                <th>At T_max (${T_cell_max.toFixed(0)}°C)</th>
                <th>Dev%</th>
              </tr>
            </thead>
            <tbody>
              ${row('Voc', table.stc.Voc, table.min.Voc, table.min.devVoc, table.max.Voc, table.max.devVoc, 'V')}
              ${row('Vmp', table.stc.Vmp, table.min.Vmp, table.min.devVmp, table.max.Vmp, table.max.devVmp, 'V')}
              ${row('Isc', table.stc.Isc, table.min.Isc, table.min.devIsc, table.max.Isc, table.max.devIsc, 'A')}
              ${row('Pmax', table.stc.Pmax, table.min.Pmax, table.min.devPmax, table.max.Pmax, table.max.devPmax, 'W')}
            </tbody>
          </table>
        </div>
        <div class="text-sm text-muted mt-8">Red = deviation &gt;10%, Orange = &gt;5%</div>
      </div>

      <div class="card">
        <div class="card-title">String-Level Voltage (${n_mod} modules)</div>
        <div class="result-grid">
          <div class="result-box alert-unsafe">
            <div class="result-value">${(table.min.Voc * n_mod).toFixed(1)} V</div>
            <div class="result-label">String Voc at T_min</div>
            <div class="result-sub">Worst case — check vs inverter max</div>
          </div>
          <div class="result-box">
            <div class="result-value">${(table.stc.Voc * n_mod).toFixed(1)} V</div>
            <div class="result-label">String Voc at STC</div>
          </div>
          <div class="result-box alert-warn">
            <div class="result-value">${(table.max.Voc * n_mod).toFixed(1)} V</div>
            <div class="result-label">String Voc at T_max</div>
          </div>
          <div class="result-box">
            <div class="result-value">${(table.stc.Vmp * n_mod).toFixed(1)} V</div>
            <div class="result-label">String Vmp at STC</div>
          </div>
          <div class="result-box alert-warn">
            <div class="result-value">${(table.max.Vmp * n_mod).toFixed(1)} V</div>
            <div class="result-label">String Vmp at T_max</div>
            <div class="result-sub">Worst case — check vs MPPT min</div>
          </div>
          <div class="result-box">
            <div class="result-value">${((table.max.Pmax / table.stc.Pmax - 1)*100).toFixed(1)}%</div>
            <div class="result-label">Power derating at T_max</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Coefficient Summary</div>
        <table class="status-table">
          <thead><tr><th>Coefficient</th><th>Value</th><th>Effect per 10°C rise</th></tr></thead>
          <tbody>
            <tr><td>&#945;Voc (tempCoeffVoc)</td><td>${(panel.coeffVoc*100).toFixed(3)}%/°C</td><td>${(panel.coeffVoc*100*10).toFixed(2)}% Voc change</td></tr>
            <tr><td>&#945;Isc (tempCoeffIsc)</td><td>+${(panel.coeffIsc*100).toFixed(3)}%/°C</td><td>+${(panel.coeffIsc*100*10).toFixed(2)}% Isc change</td></tr>
            <tr><td>&#945;Pmax (tempCoeffPmax)</td><td>${(panel.coeffPmax*100).toFixed(3)}%/°C</td><td>${(panel.coeffPmax*100*10).toFixed(2)}% power change</td></tr>
          </tbody>
        </table>
      </div>
    `;

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
