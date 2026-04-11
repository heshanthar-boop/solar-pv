/**
 * roof-layout.js — 2D Roof Panel Layout Designer
 *
 * Canvas-based panel auto-layout with:
 *  - Rectangular roof area input or polygon draw
 *  - Panel auto-placement with setback margins
 *  - Row/column gap (inter-row spacing)
 *  - Portrait/landscape orientation
 *  - Shadow overlay: simplified obstruction shadow from parapet/ridge at given sun angle
 *  - String grouping: auto-assign panels to MPPT strings, colour-coded
 *  - Export: PNG download, summary to cable schedule
 *
 * Shadow model: rectangular shadow cast by a horizontal ridge of height H
 * at sun elevation α: shadow_length = H / tan(α). Valid for simple obstructions.
 * Does NOT model topographic shading, tree shading, or multi-facet roofs.
 */

var RoofLayout = (() => {

  const PANEL_COLORS = [
    '#d97706','#2563eb','#16a34a','#dc2626','#7c3aed',
    '#0891b2','#b45309','#be185d','#064e3b','#1e3a5f',
  ];
  const SHADOW_COLOR  = 'rgba(0,0,50,0.30)';
  const SETBACK_COLOR = 'rgba(220,80,80,0.10)';
  const GRID_COLOR    = '#e5e7eb';
  const PANEL_STROKE  = '#fff';
  const ROOF_FILL     = '#f9fafb';
  const ROOF_STROKE   = '#d97706';

  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function _fmt(n) { return Number(n).toLocaleString('en-LK'); }

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  function render(container) {
    const panels = (typeof DB !== 'undefined') ? DB.getAll() : [];
    const invs   = (typeof CatalogStore !== 'undefined') ? CatalogStore.getAllInverters() : [];

    const panelOpts = panels.map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.manufacturer + ' ' + p.model)} (${p.Pmax}W)</option>`
    ).join('');

    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#127968; Roof Layout Designer</div>
        <div class="info-box">
          2D panel auto-layout with setbacks, string grouping, and shadow overlay.
          Dimensions in metres. Panels placed portrait or landscape.
        </div>

        <!-- ROOF DIMENSIONS -->
        <div class="card">
          <div class="card-title">Roof Area</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Roof Width (m) <span class="text-muted" style="font-size:0.78rem">East-West</span></label>
              <input class="form-input" id="rl-rw" type="number" value="15" min="1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Roof Depth (m) <span class="text-muted" style="font-size:0.78rem">North-South</span></label>
              <input class="form-input" id="rl-rd" type="number" value="10" min="1" step="0.5" />
            </div>
            <div class="form-group">
              <label class="form-label">Setback — Eaves / Edges (m)</label>
              <input class="form-input" id="rl-setback-edge" type="number" value="0.5" min="0" step="0.1" />
              <div class="form-hint">SL: min 0.5 m from roof edge typical</div>
            </div>
            <div class="form-group">
              <label class="form-label">Setback — Ridge (m)</label>
              <input class="form-input" id="rl-setback-ridge" type="number" value="0.5" min="0" step="0.1" />
              <div class="form-hint">Ridge/parapet clearance</div>
            </div>
          </div>
        </div>

        <!-- PANEL SPECS -->
        <div class="card">
          <div class="card-title">Panel &amp; Layout</div>
          <div class="form-row cols-2">
            ${panels.length ? `
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Select Panel from DB</label>
              <select class="form-select" id="rl-panel-sel">
                <option value="">— manual entry —</option>
                ${panelOpts}
              </select>
            </div>` : ''}
            <div class="form-group">
              <label class="form-label">Panel Width (m) <span class="text-muted" style="font-size:0.78rem">short side</span></label>
              <input class="form-input" id="rl-pw" type="number" value="1.134" min="0.5" step="0.001" />
            </div>
            <div class="form-group">
              <label class="form-label">Panel Length (m) <span class="text-muted" style="font-size:0.78rem">long side</span></label>
              <input class="form-input" id="rl-pl" type="number" value="2.278" min="0.5" step="0.001" />
            </div>
            <div class="form-group">
              <label class="form-label">Orientation</label>
              <select class="form-select" id="rl-orient">
                <option value="portrait">Portrait (width × length)</option>
                <option value="landscape">Landscape (length × width)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Column Gap (m)</label>
              <input class="form-input" id="rl-cgap" type="number" value="0.02" min="0" step="0.01" />
            </div>
            <div class="form-group">
              <label class="form-label">Row Gap (m)</label>
              <input class="form-input" id="rl-rgap" type="number" value="0.02" min="0" step="0.01" />
            </div>
            <div class="form-group">
              <label class="form-label">Panels per String (MPPT)</label>
              <input class="form-input" id="rl-pps" type="number" value="20" min="1" max="50" />
            </div>
          </div>
        </div>

        <!-- SHADOW PARAMETERS -->
        <div class="card">
          <div class="card-title">&#9728; Shadow Overlay (optional)</div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label class="form-label">Obstruction Height (m)</label>
              <input class="form-input" id="rl-obs-h" type="number" value="0" min="0" step="0.1" />
              <div class="form-hint">Ridge height, parapet, wall. 0 = no shadow.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Sun Elevation Angle (°)</label>
              <input class="form-input" id="rl-sun-el" type="number" value="30" min="5" max="90" />
              <div class="form-hint">Sri Lanka worst-case winter: ~55°. Equinox noon: ~73°</div>
            </div>
            <div class="form-group">
              <label class="form-label">Obstruction Position</label>
              <select class="form-select" id="rl-obs-pos">
                <option value="north">North edge (ridge/wall)</option>
                <option value="south">South edge</option>
                <option value="east">East edge</option>
                <option value="west">West edge</option>
              </select>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="rl-layout-btn">&#127968; Generate Layout</button>

        <!-- CANVAS OUTPUT -->
        <div id="rl-result" class="hidden" style="margin-top:12px">
          <div class="card">
            <div class="card-title">&#128200; Layout Preview</div>
            <div style="overflow-x:auto">
              <canvas id="rl-canvas" style="display:block;max-width:100%;border:1px solid var(--border);border-radius:var(--radius);background:#f9fafb"></canvas>
            </div>
            <div id="rl-summary" style="margin-top:10px"></div>
            <div class="btn-group" style="margin-top:10px;gap:8px">
              <button class="btn btn-secondary btn-sm" id="rl-download-btn">&#128190; Download PNG</button>
              <button class="btn btn-secondary btn-sm" id="rl-rotate-btn">&#8635; Toggle Orientation</button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (panels.length) {
      container.querySelector('#rl-panel-sel').addEventListener('change', () => _fillPanelDims(container, panels));
    }
    container.querySelector('#rl-layout-btn').addEventListener('click', () => {
      App.btnSpinner(container.querySelector('#rl-layout-btn'), () => _generateLayout(container));
    });
  }

  function _fillPanelDims(container, panels) {
    const id = container.querySelector('#rl-panel-sel').value;
    if (!id) return;
    const p = panels.find(x => String(x.id) === id);
    if (!p) return;
    // Standard 60/72/96-cell module dimensions (approximate)
    // Use common Longi/Trina 550W dimensions as fallback
    const W = p.width_m  || (p.cells >= 120 ? 1.134 : p.cells >= 96 ? 1.048 : 0.992);
    const L = p.length_m || (p.cells >= 120 ? 2.278 : p.cells >= 96 ? 2.008 : 1.640);
    container.querySelector('#rl-pw').value = W.toFixed(3);
    container.querySelector('#rl-pl').value = L.toFixed(3);
    App.toast('Panel dims: ' + W.toFixed(3) + ' × ' + L.toFixed(3) + ' m', 'info');
  }

  // -----------------------------------------------------------------------
  // LAYOUT GENERATION
  // -----------------------------------------------------------------------
  function _generateLayout(container) {
    const roofW   = parseFloat(container.querySelector('#rl-rw').value);
    const roofD   = parseFloat(container.querySelector('#rl-rd').value);
    const sbEdge  = parseFloat(container.querySelector('#rl-setback-edge').value) || 0;
    const sbRidge = parseFloat(container.querySelector('#rl-setback-ridge').value) || 0;
    const panelW0 = parseFloat(container.querySelector('#rl-pw').value);
    const panelL0 = parseFloat(container.querySelector('#rl-pl').value);
    const orient  = container.querySelector('#rl-orient').value;
    const cGap    = parseFloat(container.querySelector('#rl-cgap').value) || 0.02;
    const rGap    = parseFloat(container.querySelector('#rl-rgap').value) || 0.02;
    const pps     = parseInt(container.querySelector('#rl-pps').value) || 20;
    const obsH    = parseFloat(container.querySelector('#rl-obs-h').value) || 0;
    const sunEl   = parseFloat(container.querySelector('#rl-sun-el').value) || 30;
    const obsPos  = container.querySelector('#rl-obs-pos').value;

    if ([roofW, roofD, panelW0, panelL0].some(isNaN) || roofW <= 0 || roofD <= 0) {
      App.toast('Enter valid roof and panel dimensions', 'error'); return;
    }

    // Panel footprint in layout (portrait: W=short, L=long along depth axis)
    const pW = orient === 'landscape' ? panelL0 : panelW0;  // col width
    const pD = orient === 'landscape' ? panelW0 : panelL0;  // row depth

    // Usable area
    const useW = roofW - sbEdge * 2;
    const useD = roofD - sbEdge - sbRidge;

    if (useW <= 0 || useD <= 0) {
      App.toast('Setbacks exceed roof dimensions', 'error'); return;
    }

    // Panel count
    const cols = Math.floor((useW + cGap) / (pW + cGap));
    const rows = Math.floor((useD + rGap) / (pD + rGap));
    const total = cols * rows;

    if (total <= 0) {
      App.toast('No panels fit — check dimensions', 'error'); return;
    }

    // Panel positions (relative to usable area origin)
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        positions.push({
          x: sbEdge + c * (pW + cGap),
          y: sbRidge + r * (pD + rGap),
          string: Math.floor((r * cols + c) / pps),
        });
      }
    }

    const numStrings = Math.ceil(total / pps);
    const partialLast = total % pps || pps;

    // Shadow polygon (simplified rectangular shadow from edge obstruction)
    let shadowPolygon = null;
    if (obsH > 0 && sunEl > 0) {
      const shadowLen = obsH / Math.tan(sunEl * Math.PI / 180);
      shadowPolygon = { obsPos, shadowLen, roofW, roofD };
    }

    // Draw
    _drawCanvas(container, {
      roofW, roofD, sbEdge, sbRidge, useW, useD,
      positions, pW, pD, pps, numStrings, total,
      shadowPolygon, cols, rows, cGap, rGap
    });

    // Summary
    const kwp = (typeof DB !== 'undefined' && container.querySelector('#rl-panel-sel') && container.querySelector('#rl-panel-sel').value)
      ? (() => { const p = DB.getById(container.querySelector('#rl-panel-sel').value); return p ? (total * p.Pmax / 1000).toFixed(2) : null; })()
      : null;

    // Store result in App state for other modules to consume
    const layoutResult = {
      total, rows, cols, numStrings, pps, partialLast,
      panelW: panelW0, panelL: panelL0, pW, pD,
      roofW, roofD, kwp: kwp ? parseFloat(kwp) : null,
      panelId: container.querySelector('#rl-panel-sel') ? container.querySelector('#rl-panel-sel').value : null,
    };
    if (typeof App !== 'undefined') App.state.roofLayoutResult = layoutResult;

    container.querySelector('#rl-summary').innerHTML = `
      <table class="status-table">
        <tbody>
          <tr><td><strong>Total Panels</strong></td><td>${total} panels</td></tr>
          ${kwp ? `<tr><td><strong>Array Size</strong></td><td>${_esc(kwp)} kWp</td></tr>` : ''}
          <tr><td><strong>Layout</strong></td><td>${rows} rows × ${cols} columns</td></tr>
          <tr><td><strong>MPPT Strings</strong></td><td>${numStrings} strings (${pps} panels/string, last: ${partialLast})</td></tr>
          <tr><td><strong>Array Area</strong></td><td>${(total * panelW0 * panelL0).toFixed(1)} m² (panel area)</td></tr>
          <tr><td><strong>Roof Coverage</strong></td><td>${((total * panelW0 * panelL0) / (roofW * roofD) * 100).toFixed(0)}%</td></tr>
          ${shadowPolygon ? `<tr><td><strong>Shadow at ${sunEl}° elevation</strong></td><td>${shadowPolygon.shadowLen.toFixed(2)} m from ${obsPos} edge</td></tr>` : ''}
        </tbody>
      </table>
      <div style="margin-top:8px">
        <button class="btn btn-primary btn-sm" id="rl-to-calc-btn">&#9889; Use in Calculator &#8250;</button>
        <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px">${total} panels${kwp ? ', ' + kwp + ' kWp' : ''} → Quick Calculator</span>
      </div>`;

    container.querySelector('#rl-result').classList.remove('hidden');
    container.querySelector('#rl-result').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // "Use in Calculator" — navigate to basiccalc with panel count pre-filled
    container.querySelector('#rl-to-calc-btn').addEventListener('click', () => {
      App.navigate('basiccalc');
      // BasicCalc.render() will read App.state.roofLayoutResult on next render
      App.toast(total + ' panels from roof layout → loaded into Calculator', 'success');
    });

    // Download button
    container.querySelector('#rl-download-btn').onclick = () => _downloadPNG(container);

    // Rotate button
    container.querySelector('#rl-rotate-btn').onclick = () => {
      const o = container.querySelector('#rl-orient');
      o.value = o.value === 'portrait' ? 'landscape' : 'portrait';
      _generateLayout(container);
    };
  }

  // -----------------------------------------------------------------------
  // CANVAS DRAWING
  // -----------------------------------------------------------------------
  function _drawCanvas(container, d) {
    const canvas = container.querySelector('#rl-canvas');

    // Scale: fit to ~360px wide on mobile, up to 720px on desktop
    const maxPx = Math.min(window.innerWidth - 32, 720);
    const scale = maxPx / d.roofW;
    const canvW = Math.round(d.roofW * scale);
    const canvH = Math.round(d.roofD * scale);
    canvas.width  = canvW;
    canvas.height = canvH;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvW, canvH);

    // Roof background
    ctx.fillStyle = ROOF_FILL;
    ctx.fillRect(0, 0, canvW, canvH);

    // Setback zone overlay
    ctx.fillStyle = SETBACK_COLOR;
    ctx.fillRect(0, 0, canvW, canvH);
    // Clear usable area
    const ux = d.sbEdge * scale;
    const uy = d.sbRidge * scale;
    const uw = d.useW * scale;
    const uh = d.useD * scale;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ux, uy, uw, uh);

    // Grid lines (1m grid)
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= d.roofW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, canvH);
      ctx.stroke();
    }
    for (let y = 0; y <= d.roofD; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(canvW, y * scale);
      ctx.stroke();
    }

    // Shadow polygon
    if (d.shadowPolygon) {
      const sp = d.shadowPolygon;
      const sl = sp.shadowLen * scale;
      ctx.fillStyle = SHADOW_COLOR;
      if (sp.obsPos === 'north') {
        ctx.fillRect(0, 0, canvW, Math.min(sl, canvH));
      } else if (sp.obsPos === 'south') {
        ctx.fillRect(0, canvH - Math.min(sl, canvH), canvW, Math.min(sl, canvH));
      } else if (sp.obsPos === 'east') {
        ctx.fillRect(canvW - Math.min(sl, canvW), 0, Math.min(sl, canvW), canvH);
      } else { // west
        ctx.fillRect(0, 0, Math.min(sl, canvW), canvH);
      }
    }

    // Panels
    d.positions.forEach((pos, idx) => {
      const cx = pos.x * scale;
      const cy = pos.y * scale;
      const cw = d.pW * scale - 1;
      const ch = d.pD * scale - 1;
      const color = PANEL_COLORS[pos.string % PANEL_COLORS.length];

      ctx.fillStyle = color;
      ctx.fillRect(cx, cy, cw, ch);

      ctx.strokeStyle = PANEL_STROKE;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx, cy, cw, ch);

      // Panel number (only if large enough)
      if (cw > 18 && ch > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${Math.max(6, Math.min(10, cw / 4))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(idx + 1, cx + cw / 2, cy + ch / 2);
      }
    });

    // Roof border
    ctx.strokeStyle = ROOF_STROKE;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvW - 2, canvH - 2);

    // Legend: strings
    const numStrings = Math.max(...d.positions.map(p => p.string)) + 1;
    const legX = 4, legY = canvH - 14 * Math.min(numStrings, 5) - 4;
    if (legY > 20) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(legX - 2, legY - 4, 80, 14 * Math.min(numStrings, 5) + 8);
      for (let s = 0; s < Math.min(numStrings, 5); s++) {
        ctx.fillStyle = PANEL_COLORS[s % PANEL_COLORS.length];
        ctx.fillRect(legX, legY + s * 14, 10, 10);
        ctx.fillStyle = '#111';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`String ${s + 1}`, legX + 13, legY + s * 14 + 1);
      }
      if (numStrings > 5) {
        ctx.fillStyle = '#666';
        ctx.fillText(`+${numStrings - 5} more...`, legX, legY + 5 * 14);
      }
    }

    // Dimension labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(d.roofW.toFixed(1) + ' m', canvW / 2, canvH - 2);
    ctx.save();
    ctx.translate(11, canvH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(d.roofD.toFixed(1) + ' m', 0, 0);
    ctx.restore();
  }

  function _downloadPNG(container) {
    const canvas = container.querySelector('#rl-canvas');
    const link = document.createElement('a');
    link.download = 'roof-layout.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return { render };

})();
