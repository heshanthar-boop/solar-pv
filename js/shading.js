/**
 * shading.js — Shading & Irradiance Loss Analysis
 * Phase 5: Effective irradiance, angle of incidence loss, partial shading current reduction.
 */

const ShadingLoss = (() => {

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#127774; Shading &amp; Irradiance Loss</div>

        <div class="info-box">
          Calculate effective irradiance, angle-of-incidence (AOI) cosine loss, partial shading
          current reduction, and total power loss estimate. All formulas shown step-by-step.
        </div>

        <!-- EFFECTIVE IRRADIANCE -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#9728; Effective Irradiance &amp; AOI Loss</div>
          <div class="info-box" style="margin-bottom:10px">
            G_eff = G_poa &times; (1 &minus; shade_fraction) &times; cos(AOI)<br>
            AOI = angle between sun ray and panel normal. At AOI=0, full irradiance. At AOI=90&deg;, zero.
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">POA Irradiance G_poa (W/m&sup2;)</label>
              <input class="form-input" id="sh-gpoa" type="number" step="any" placeholder="e.g. 900" value="900" />
              <div class="form-hint">From reference cell or pyranometer</div>
            </div>
            <div class="form-group">
              <label class="form-label">Shading Fraction (0&ndash;1)</label>
              <input class="form-input" id="sh-shade" type="number" step="any" placeholder="e.g. 0.15" value="0" />
              <div class="form-hint">0 = no shading, 1 = full shade</div>
            </div>
            <div class="form-group">
              <label class="form-label">Angle of Incidence AOI (&deg;)</label>
              <input class="form-input" id="sh-aoi" type="number" step="any" placeholder="e.g. 20" value="0" />
              <div class="form-hint">0&deg; = sun perpendicular to panel</div>
            </div>
            <div class="form-group">
              <label class="form-label">Array Peak Power (kWp)</label>
              <input class="form-input" id="sh-pkwp" type="number" step="any" placeholder="e.g. 6.6" />
              <div class="form-hint">For power loss estimate</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="sh-calc-btn">Calculate</button>
          <div id="sh-result"></div>
        </div>

        <!-- PARTIAL SHADING — STRING IMPACT -->
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">&#9889; Partial Shading — String Current Impact</div>
          <div class="info-box" style="margin-bottom:10px">
            In a series string, shaded cells reduce Isc proportional to shading fraction.
            Bypass diodes activate when voltage reversal exceeds ~0.6 V per shaded cell.
            <br>Current loss: &Delta;Isc = Isc &times; shade_fraction (per affected module)
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">String Isc at STC (A)</label>
              <input class="form-input" id="ps-isc" type="number" step="any" placeholder="e.g. 13.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Modules in String</label>
              <input class="form-input" id="ps-nm" type="number" step="1" placeholder="e.g. 20" />
            </div>
            <div class="form-group">
              <label class="form-label">Shaded Modules</label>
              <input class="form-input" id="ps-ns" type="number" step="1" placeholder="e.g. 2" />
            </div>
            <div class="form-group">
              <label class="form-label">Shading % on each module</label>
              <input class="form-input" id="ps-spct" type="number" step="any" placeholder="e.g. 30" value="50" />
              <div class="form-hint">% of module area shaded</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="ps-calc-btn">Calculate</button>
          <div id="ps-result"></div>
        </div>

        <!-- AOI CURVE -->
        <div class="card">
          <div class="card-title">&#128200; AOI Cosine Loss Curve</div>
          <div class="info-box" style="margin-bottom:8px">
            Cosine law: P_loss% = (1 &minus; cos(AOI)) &times; 100%. Significant beyond 40&deg;.
          </div>
          <button class="btn btn-secondary btn-sm" id="aoi-plot-btn">Plot AOI Curve</button>
          <div id="aoi-result"></div>
        </div>
      </div>
    `;

    container.querySelector('#sh-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#sh-calc-btn'), () => _calcEffIrr(container));
    });
    container.querySelector('#ps-calc-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#ps-calc-btn'), () => _calcPartialShade(container));
    });
    container.querySelector('#aoi-plot-btn').addEventListener('click', () => _plotAOI(container));
  }

  // -----------------------------------------------------------------------
  // EFFECTIVE IRRADIANCE
  // -----------------------------------------------------------------------

  function shadingLoss(Gpoa, shadeFraction, AOI_deg, Pkwp) {
    const cos_aoi   = Math.cos(AOI_deg * Math.PI / 180);
    const G_shade   = Gpoa * (1 - shadeFraction);
    const G_eff     = G_shade * cos_aoi;
    const G_loss_pct = (1 - G_eff / Gpoa) * 100;
    const P_loss_kW  = (!isNaN(Pkwp) && Pkwp > 0) ? Pkwp * (G_eff / 1000) : NaN;
    const P_full_kW  = (!isNaN(Pkwp) && Pkwp > 0) ? Pkwp * (Gpoa / 1000) : NaN;
    return { cos_aoi, G_shade, G_eff, G_loss_pct, P_loss_kW, P_full_kW };
  }

  function _calcEffIrr(container) {
    const Gpoa  = parseFloat(container.querySelector('#sh-gpoa').value);
    const shade = parseFloat(container.querySelector('#sh-shade').value) || 0;
    const AOI   = parseFloat(container.querySelector('#sh-aoi').value)   || 0;
    const Pkwp  = parseFloat(container.querySelector('#sh-pkwp').value);
    const res   = container.querySelector('#sh-result');

    if (isNaN(Gpoa)) { res.innerHTML='<div class="danger-box">Enter G_poa</div>'; return; }

    const r   = shadingLoss(Gpoa, shade, AOI, Pkwp);
    const cls = r.G_loss_pct > 20 ? 'alert-unsafe' : r.G_loss_pct > 5 ? 'alert-warn' : 'alert-safe';

    res.innerHTML = `
      <div style="margin-top:10px">
        <div class="section-title">Step-by-Step</div>
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>G_poa = ${Gpoa} W/m\u00b2 (plane-of-array irradiance)</div>
          <div>Shading fraction = ${shade} (${(shade*100).toFixed(0)}% of array)</div>
          <div>AOI = ${AOI}\u00b0</div>
          <div>Step 1: After shading: G_shade = ${Gpoa} \u00d7 (1 \u2212 ${shade}) = ${r.G_shade.toFixed(2)} W/m\u00b2</div>
          <div>Step 2: cos(AOI) = cos(${AOI}\u00b0) = ${r.cos_aoi.toFixed(5)}</div>
          <div>Step 3: G_eff = ${r.G_shade.toFixed(2)} \u00d7 ${r.cos_aoi.toFixed(4)} = ${r.G_eff.toFixed(2)} W/m\u00b2</div>
          <div>Step 4: G_loss = (1 \u2212 ${r.G_eff.toFixed(2)}/${Gpoa}) \u00d7 100 = ${r.G_loss_pct.toFixed(2)}%</div>
          ${!isNaN(Pkwp)?`<div>Step 5: Array power at G_eff = ${Pkwp} \u00d7 (${r.G_eff.toFixed(2)}/1000) = ${r.P_loss_kW.toFixed(3)} kW</div>
          <div>         Full power (no loss) = ${Pkwp} \u00d7 (${Gpoa}/1000) = ${r.P_full_kW.toFixed(3)} kW</div>
          <div>         Power loss = ${(r.P_full_kW-r.P_loss_kW).toFixed(3)} kW</div>` : ''}
        </div>
        <div class="form-row cols-2" style="margin-top:10px">
          <div class="result-box ${cls}">
            <div class="result-label">Effective Irradiance</div>
            <div class="result-value">${r.G_eff.toFixed(1)} W/m&sup2;</div>
            <div class="result-unit">Loss: ${r.G_loss_pct.toFixed(1)}%</div>
          </div>
          ${!isNaN(Pkwp)?`<div class="result-box ${cls}">
            <div class="result-label">Array Output</div>
            <div class="result-value">${r.P_loss_kW.toFixed(2)} kW</div>
            <div class="result-unit">vs ${r.P_full_kW.toFixed(2)} kW full</div>
          </div>`:''}
        </div>
      </div>`;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="sh-print-btn">&#128424; Print</button>';
    res.appendChild(printWrap);
    printWrap.querySelector('#sh-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#sh-result', 'Shading & Effective Irradiance Report', container);
        return;
      }
      window.print();
    });
  }

  // -----------------------------------------------------------------------
  // PARTIAL SHADING — STRING
  // -----------------------------------------------------------------------

  function _calcPartialShade(container) {
    const Isc   = parseFloat(container.querySelector('#ps-isc').value);
    const Nm    = parseFloat(container.querySelector('#ps-nm').value);
    const Ns    = parseFloat(container.querySelector('#ps-ns').value);
    const Spct  = parseFloat(container.querySelector('#ps-spct').value);
    const res   = container.querySelector('#ps-result');

    if ([Isc,Nm,Ns,Spct].some(isNaN)) { res.innerHTML='<div class="danger-box">Enter all values</div>'; return; }
    if (Ns > Nm) { res.innerHTML='<div class="danger-box">Shaded modules cannot exceed total modules</div>'; return; }

    // In series string with bypass diodes (1 per module):
    // Shaded module generates I_shaded = Isc × (1 - Spct/100)
    // If this is < 30% Isc, bypass diode activates — module bypassed
    // String current limited by worst-shaded module if diode does NOT activate
    const I_shaded     = Isc * (1 - Spct / 100);
    const diodeActive  = I_shaded < 0.3 * Isc;
    const I_string     = diodeActive ? Isc : I_shaded;   // diode bypasses bad module
    const V_loss_pct   = diodeActive ? (Ns / Nm * 100) : 0;   // voltage lost per bypassed module
    // P_proxy: current × module-count proxy (not watts — Vmp not known; used only for % loss ratio)
    const P_before     = Isc * Nm;
    const P_after      = I_string * (Nm - (diodeActive ? Ns : 0));
    const P_loss_pct   = (1 - P_after / P_before) * 100;
    const cls          = P_loss_pct > 20 ? 'alert-unsafe' : P_loss_pct > 5 ? 'alert-warn' : 'alert-safe';

    res.innerHTML = `
      <div style="margin-top:10px">
        <div style="font-family:monospace;font-size:0.8rem;background:var(--bg-3);border-radius:var(--radius);padding:10px;line-height:1.8">
          <div>String: ${Nm} modules, Isc_stc = ${Isc} A</div>
          <div>Shaded: ${Ns} module(s) at ${Spct}% shading each</div>
          <div>Step 1: I_shaded = ${Isc} \u00d7 (1 \u2212 ${Spct}/100) = ${I_shaded.toFixed(3)} A</div>
          <div>Step 2: Bypass diode activation threshold \u2248 30% Isc = ${(0.3*Isc).toFixed(3)} A</div>
          <div>Step 3: ${diodeActive?`I_shaded (${I_shaded.toFixed(3)}A) < threshold (${(0.3*Isc).toFixed(3)}A) \u2192 Bypass diode ACTIVATES`:
            `I_shaded (${I_shaded.toFixed(3)}A) \u2265 threshold \u2192 Diode does NOT activate`}</div>
          ${diodeActive?`<div>Step 4: ${Ns} module(s) bypassed \u2192 string voltage reduced by ${Ns}/${Nm} = ${V_loss_pct.toFixed(1)}%</div>
          <div>         String current remains at ${Isc} A (other modules unaffected)</div>`:
          `<div>Step 4: String current limited to ${I_string.toFixed(3)} A by shaded module(s)</div>`}
          <div>Step 5: Estimated power loss \u2248 ${P_loss_pct.toFixed(1)}%</div>
        </div>
        <div class="result-box ${cls}" style="margin-top:8px">
          <div class="result-label">Estimated Power Loss</div>
          <div class="result-value">${P_loss_pct.toFixed(1)}%</div>
          <div class="result-unit">${diodeActive?`Bypass diode active \u2014 ${Ns} module(s) bypassed`:`Diode not activated \u2014 current limited to ${I_string.toFixed(3)} A`}</div>
        </div>
      </div>`;

    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="ps-print-btn">&#128424; Print</button>';
    res.appendChild(printWrap);
    printWrap.querySelector('#ps-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#ps-result', 'Partial Shading String Impact Report', container);
        return;
      }
      window.print();
    });
  }

  // -----------------------------------------------------------------------
  // AOI CURVE
  // -----------------------------------------------------------------------

  function _plotAOI(container) {
    const angles = Array.from({length: 19}, (_,i) => i * 5);   // 0 to 90 deg
    const losses = angles.map(a => (1 - Math.cos(a*Math.PI/180))*100);

    const W=320,H=160,PL=44,PR=16,PT=14,PB=30;
    const cW=W-PL-PR, cH=H-PT-PB;
    const px = x => PL + x/90*cW;
    const py = y => PT + cH - y/100*cH;

    const pathD = angles.map((a,i)=>`${i===0?'M':'L'}${px(a).toFixed(1)},${py(losses[i]).toFixed(1)}`).join(' ');

    // Shade zone >40 deg
    const x40 = px(40), x90 = px(90);
    const shadeZone = `<rect x="${x40.toFixed(1)}" y="${PT}" width="${(x90-x40).toFixed(1)}" height="${cH}" fill="#dc2626" opacity="0.07"/>`;

    const xTicks = [0,15,30,45,60,75,90].map(x=>`
      <line x1="${px(x).toFixed(1)}" y1="${PT}" x2="${px(x).toFixed(1)}" y2="${PT+cH}" stroke="var(--border)" stroke-width="0.5"/>
      <text x="${px(x).toFixed(1)}" y="${PT+cH+12}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${x}\u00b0</text>`).join('');

    const yTicks = [0,20,40,60,80,100].map(y=>`
      <line x1="${PL}" y1="${py(y).toFixed(1)}" x2="${PL+cW}" y2="${py(y).toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
      <text x="${PL-3}" y="${(py(y)+3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--text-muted)">${y}%</text>`).join('');

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:600px;display:block;margin:8px auto 0">
        ${shadeZone}
        ${yTicks}${xTicks}
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <line x1="${PL}" y1="${PT+cH}" x2="${PL+cW}" y2="${PT+cH}" stroke="var(--text-secondary)" stroke-width="1.5"/>
        <path d="${pathD}" fill="none" stroke="#d97706" stroke-width="2.5"/>
        <text x="${px(42).toFixed(1)}" y="${(PT+10).toFixed(1)}" font-size="8" fill="#dc2626">High loss zone</text>
        <text x="${PL+cW/2}" y="${H-1}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">Angle of Incidence (AOI)</text>
        <text x="10" y="${PT+cH/2}" text-anchor="middle" font-size="9" fill="var(--text-secondary)" transform="rotate(-90,10,${PT+cH/2})">Loss %</text>
      </svg>`;

    container.querySelector('#aoi-result').innerHTML = svg +
      `<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:4px">
        Loss % = (1 \u2212 cos(AOI)) \u00d7 100%. Red zone (&gt;40\u00b0) = significant loss. At 60\u00b0 = 50% loss.
      </div>`;

    const aoiResult = container.querySelector('#aoi-result');
    const printWrap = document.createElement('div');
    printWrap.className = 'btn-group';
    printWrap.style.marginTop = '8px';
    printWrap.setAttribute('data-no-print', '');
    printWrap.innerHTML = '<button class="btn btn-secondary btn-sm" id="aoi-print-btn">&#128424; Print</button>';
    aoiResult.appendChild(printWrap);
    printWrap.querySelector('#aoi-print-btn').addEventListener('click', () => {
      if (typeof App.printSection === 'function') {
        App.printSection('#aoi-result', 'AOI Cosine Loss Curve Report', container);
        return;
      }
      window.print();
    });
  }

  return { render, shadingLoss };
})();
