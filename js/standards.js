/**
 * standards.js — Standards Reference & Quick-Check Calculators
 * Source-linked Sri Lankan scopes and selected planning/evidence comparisons.
 * Exact licensed clauses and project acceptance remain with the applicable evidence.
 */

const Standards = (() => {
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

  // -----------------------------------------------------------------------
  // STANDARDS DATA
  // -----------------------------------------------------------------------

  const STANDARDS = SriLankaStandards.getRecords();

  // -----------------------------------------------------------------------
  // RENDER MAIN PAGE
  // -----------------------------------------------------------------------

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <div class="page-title">&#128218; Standards Reference</div>
        ${typeof StandardsVisuals!=='undefined'?StandardsVisuals.hub():''}

        <div class="info-box">
          ${STANDARDS.length} reference entries: listed Sri Lankan adoptions, international reference families, 2026 PV/BESS requirements and planning models.
          Choose a discipline or search a code to see its scope, source and associated illustration.
        </div>
        <div class="info-box" style="margin-top:8px">
          Scope cross-references checked on 13 October 2026 against SLSEA and PUCSL publications. Listed local editions and later IEC editions are distinct. Exact numerical clauses depend on the applicable edition, product and approved project specification.
        </div>

        <!-- SEARCH -->
        <div class="form-group" style="margin-bottom:12px">
          <input type="search" class="form-input" id="std-search" placeholder="Search standards, keywords, limits..." />
        </div>

        <!-- STANDARDS LIST -->
        <div class="std-family-filter" role="group" aria-label="Filter standards by discipline"><button type="button" data-std-family="all" aria-pressed="true">All references</button>${Object.entries(SriLankaStandards.GROUPS).map(([key,label])=>`<button type="button" data-std-family="${key}" aria-pressed="false">${_esc(label)}</button>`).join('')}</div>
        <div id="std-list">
          ${STANDARDS.map(s => _stdCard(s)).join('')}
        </div>
      </div>
    `;

    if(typeof StandardsVisuals!=='undefined') {
      StandardsVisuals.bind(container);
      container.querySelectorAll('[data-visual-standard]').forEach(btn=>btn.addEventListener('click',()=>StandardsVisuals.showForStandard(container,STANDARDS.find(s=>s.id===btn.dataset.visualStandard))));
    }
    // Search filter
    let family='all';
    const filter=()=>{
      const q=container.querySelector('#std-search').value.toLowerCase();
      container.querySelectorAll('.std-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q)&&(family==='all'||card.dataset.stdFamily===family) ? '' : 'none';
      });
    };
    container.querySelector('#std-search').addEventListener('input',filter);
    container.querySelectorAll('.std-family-filter [data-std-family]').forEach(btn=>btn.addEventListener('click',()=>{family=btn.dataset.stdFamily;container.querySelectorAll('.std-family-filter [data-std-family]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));filter();}));

    // Expand/collapse
    container.querySelectorAll('.std-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.stdId;
        const body = container.querySelector('#std-body-' + id);
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        btn.textContent = isOpen ? '▼ Show details & calculators' : '▲ Hide';
      });
    });

    // Calc buttons
    container.querySelectorAll('.std-calc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stdId = btn.dataset.stdId;
        const calcId = btn.dataset.calcId;
        _showCalc(container, stdId, calcId);
      });
    });
  }

  function _stdCard(s) {
    const limitRows = s.limits.map(l => `
      <tr>
        <td style="font-weight:600">${l.param}</td>
        <td style="color:var(--primary);font-weight:700">${l.value}</td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${l.note}</td>
      </tr>`).join('');

    const pointsHtml = s.keyPoints.map(p => `<li>${p}</li>`).join('');
    const sourceRows = (s.sources || []).map(src => `
      <li>
        <a href="${_esc(src.url)}" target="_blank" rel="noopener noreferrer">${_esc(src.title)}</a>
        ${src.note ? `<div style="font-size:0.78rem;color:var(--text-muted)">${_esc(src.note)}</div>` : ''}
      </li>`).join('');

    const calcBtns = s.calcs.map(cId => `
      <button class="btn btn-secondary btn-sm std-calc-btn" data-std-id="${s.id}" data-calc-id="${cId}">
        &#128290; ${_calcLabel(cId)}
      </button>`).join('');

    return `
      <div class="std-card card" id="std-card-${s.id}" data-std-family="${s.group}" style="margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1">
            <div style="font-size:0.75rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.05em">${s.code}</div>
            <div style="font-weight:700;font-size:0.95rem;margin-top:2px">${s.title}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px">${s.scope}</div>
          </div>
        </div>
        ${typeof StandardsVisuals!=='undefined'?`<button class="btn btn-secondary btn-sm std-visual-btn" data-visual-standard="${s.id}">See animated guide · ${_esc(s.code)}</button>`:''}
        <button class="btn btn-secondary btn-sm std-expand-btn" data-std-id="${s.id}" style="margin-top:10px;width:100%">
          ▼ Show details &amp; calculators
        </button>
        <div id="std-body-${s.id}" class="hidden" style="margin-top:12px">
          <div class="section-title">What This Standard Requires</div>
          <ul style="margin:0 0 12px 18px;font-size:0.83rem;line-height:1.7">
            ${pointsHtml}
          </ul>
          <div class="section-title">Scope &amp; applicable requirements</div>
          <div style="overflow-x:auto;margin-bottom:12px">
            <table class="status-table">
              <thead><tr><th>Parameter</th><th>Limit / Value</th><th>Note</th></tr></thead>
              <tbody>${limitRows}</tbody>
            </table>
          </div>
          ${sourceRows ? `
            <div class="section-title">Primary Source Documents</div>
            <ul style="margin:0 0 12px 18px;font-size:0.83rem;line-height:1.7">
              ${sourceRows}
            </ul>
          ` : ''}
          ${s.calcs.length ? `
            <div class="section-title">Interactive Calculators</div>
            <div class="btn-group" style="flex-wrap:wrap">
              ${calcBtns}
            </div>
            <div id="calc-area-${s.id}" style="margin-top:12px"></div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function _calcLabel(id) {
    const labels = {
      ir_test:              'IR Test Check',
      voc_check:            'String Voc Check',
      isc_check:            'String Isc Check',
      insulation_test_voltage: 'Insulation Test Voltage',
      power_degradation:    'Power Degradation %',
      reverse_current:      'Reverse Current Check',
      bypass_diode_check:   'Bypass Diode Check',
      cable_sizing:         'DC Cable Sizing',
      string_fuse:          'String Fuse Rating',
      earth_resistance:     'Earth Resistance Check',
      cable_selector_adv:   'AC/DC Cable Size Selector',
      spd_uc_rating:        'SPD Voltage Rating',
      spd_summary:          'SPD Selection Guide',
      lightning_risk_screen:'Lightning Risk Screen',
      pv_fuse_link_check:   'PV Fuse-Link Check (gPV)',
      pr_calc:              'Performance Ratio',
      specific_yield:       'Specific Yield',
      capacity_factor:      'Capacity Factor',
      pid_risk:             'PID Risk Assessment',
      string_voc_tmin:      'String Voc at Tmin',
      string_vmp_tmax:      'String Vmp at Tmax',
      max_strings_no_fuse:  'Parallel-string Reverse-current Bound',
      grid_voltage_check:   'Compare Entered Grid Values',
      system_size_check:    'System Size Check',
      ceb_readiness_check:  'CEB/LECO Readiness Check',
      ceb_setting_match:    'Setting Match Check',
      ceb_export_gate:      'Export Enable Gate',
      cell_temp_noct:       'Cell Temperature (NOCT)',
      inverter_sizing:      'Inverter Sizing (AC/DC Ratio)',
      cable_vdrop:          'Cable Voltage Drop',
      dc_fuse_sizing:       'DC Fuse Sizing',
      linear_degradation:   'Linear Degradation (Warranty)',
      compound_degradation: 'Compound Degradation (Realistic)',
      warranty_check:       'Warranty Power Check',
    };
    return labels[id] || id;
  }

  // -----------------------------------------------------------------------
  // CALCULATOR RENDERERS
  // -----------------------------------------------------------------------

  function _showCalc(container, stdId, calcId) {
    const area = container.querySelector('#calc-area-' + stdId);
    if (!area) return;

    const html = _buildCalcHtml(calcId);
    area.innerHTML = `
      <div class="card" style="border:2px solid var(--primary);background:var(--primary-bg)">
        <div class="card-title" style="color:var(--primary)">&#128290; ${_calcLabel(calcId)}</div>
        ${html}
      </div>
    `;

    // Wire calculate button
    const btn = area.querySelector('.calc-run-btn');
    if (btn) btn.addEventListener('click', () => _runCalc(area, calcId));
  }

  function _inp(id, label, placeholder, value, hint) {
    return `
      <div class="form-group">
        <label class="form-label">${_esc(label)}</label>
        <input class="form-input" id="${_esc(id)}" type="number" step="any" placeholder="${_esc(placeholder||'')}" value="${_esc(value||'')}" />
        ${hint ? `<div class="form-hint">${_esc(hint)}</div>` : ''}
      </div>`;
  }

  function _buildCalcHtml(calcId) {
    const panels = DB.getAll();
    const pOpts = `<option value="">-- Select Panel (optional) --</option>` +
      panels.map(p => `<option value="${_esc(p.id)}">${_esc(p.manufacturer)} ${_esc(p.model)}</option>`).join('');

    switch (calcId) {

      case 'ir_test': return `
        <div class="info-box">Voltage-dependent comparison from the PUCSL September 2022 service-provider guideline, Table C1 / insulation table (PDF pp. 59, 83). Use the accepted test procedure. This illustration records method 1 readings; daylight PV can remain live.</div>
        <div class="form-row cols-2">
          ${_inp('c-ir-system', 'System voltage for the test plan (V)', 'Voc STC × 1.25', '', 'Source table uses Voc STC × 1.25; confirm the accepted procedure.')}
          ${_inp('c-ir-test', 'Actual applied test voltage (V)', '', '', '250 V below 120 V; 500 V from 120–500 V; 1000 V above 500 V, per the cited table.')}
          ${_inp('c-ir-pos', 'DC+ to Earth (MΩ)', '0.00', '', 'Recorded method 1 reading')}
          ${_inp('c-ir-neg', 'DC− to Earth (MΩ)', '0.00', '', 'Recorded method 1 reading')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'voc_check': return `
        <div class="info-box">IEC 62446-1: Measured Voc must be within ±2% of temperature-corrected expected value.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',   'Modules per String', '20', '20', 'Number of modules in this string')}
          ${_inp('c-tmod',   'Module Temp (°C)',   '55', '55', 'Back-of-panel temperature at time of test')}
          ${_inp('c-voc-m',  'Measured Voc (V)',   '',   '',   'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'isc_check': return `
        <div class="info-box">IEC 62446-1: Measured Isc must be within ±5% of irradiance-corrected expected value.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-irr',   'Irradiance (W/m²)', '900', '900', 'From reference cell or pyranometer')}
          ${_inp('c-tmod',  'Module Temp (°C)',  '55',  '55',  'Back-of-panel')}
          ${_inp('c-isc-m', 'Measured Isc (A)',  '',    '',    'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'insulation_test_voltage': return `
        <div class="info-box">IEC 61215 / IEC 61730: Test voltage = 1000V + 2 × Vsys_max for Class A modules.</div>
        ${_inp('c-vsys', 'System Maximum Voltage (V)', '1000', '1000', 'From inverter spec or design (e.g. 1000V or 1500V)')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'power_degradation': return `
        <div class="info-box">IEC 61215: Max allowed power degradation = 5% after sequence A, 8% after sequence B. Also useful for field annual degradation check.</div>
        <div class="form-row cols-2">
          ${_inp('c-p-initial', 'Initial Pmax (W)', '', '', 'Nameplate or commissioning measurement')}
          ${_inp('c-p-current', 'Current Pmax (W)', '', '', 'Measured today (corrected to STC)')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'reverse_current': return `
        <div class="info-box">IEC 61730 / IEC 62548-1: Max reverse current through any module = 1.35 × Series Fuse Rating. Exceeding this destroys bypass diodes.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-fuse',   'Series Fuse Rating (A)', '', '', 'From module datasheet / label')}
          ${_inp('c-nstr',   'Strings in Parallel',    '2', '2', 'Strings connected to same MPPT/combiner')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'bypass_diode_check': return `
        <div class="info-box">IEC 61730: Bypass diode thermally rated for Isc for 1 hour. Check if measured string Voc suggests a failed diode (Voc drops by ~Voc/3 per diode).</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',   'Modules per String', '20', '20', '')}
          ${_inp('c-voc-m',  'Measured String Voc (V)', '', '', 'Measured at string terminals')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'cable_sizing': return `
        <div class="info-box">IEC 60364-7-712: DC cable must carry 1.25 × Isc continuously. Apply derating for temperature, grouping, and conduit.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nstr',     'Strings per Cable Run', '1', '1', 'Parallel strings on this cable')}
          ${_inp('c-derate',   'Derating Factor',       '0.82', '0.82', 'Temp + grouping derating. 0.82 typical for Sri Lanka outdoor.')}
          ${_inp('c-cabamp',   'Cable Ampacity (A)',     '', '', 'From cable datasheet for selected cross-section')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'string_fuse': return `
        <div class="info-box">IEC 62548-1 / IEC 60364-7-712: String fuse ≤ Series Fuse Rating on module label. Fuse also must be > 1.5 × Isc to avoid nuisance blowing.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        ${_inp('c-fuse-r',  'Series Fuse Rating on Module Label (A)', '', '', 'From datasheet — max reverse current')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'earth_resistance': return `
        <div class="info-box">IEC 60364-5-54 / PUCSL: Earth electrode resistance < 1 Ω. Measured with earth tester (3-pin fall-of-potential or clamp method).</div>
        ${_inp('c-re', 'Measured Earth Resistance (Ω)', '', '', 'From earth resistance tester (DET, Fluke etc.)')}
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'spd_uc_rating': return `
        <div class="info-box">IEC 61643-32 / SLS 1522: SPD continuous operating voltage UC ≥ 1.2 × Voc_string_max (at lowest temperature).</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',  'Modules per String', '20', '20', '')}
          ${_inp('c-tmin',  'Min Site Temp (°C)', '10', '10', 'Lowest ambient expected')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'spd_summary': return `
        <div class="info-box">SPD selection summary for a PV system. Shows required UC, recommended In, and type selection.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',   '20', '20', '')}
          ${_inp('c-tmin',    'Min Site Temp (°C)',    '10', '10', '')}
          ${_inp('c-vsys',    'System Voltage (V)',    '1000','1000','Inverter max DC input')}
        </div>
        <div class="form-group">
          <label class="form-label">Site Exposure</label>
          <select class="form-select" id="c-exposure">
            <option value="sheltered">Sheltered (urban, surrounded by buildings)</option>
            <option value="normal" selected>Normal (suburban, open area)</option>
            <option value="exposed">Exposed (rural, hilltop, coastal Sri Lanka)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Generate SPD Spec</button>
        <div id="calc-result"></div>`;

      case 'lightning_risk_screen': return `
        <div class="info-box">IEC 62305 screening method: Nd = Ng x Aeq x Cd x 10^-6 (events/year), where Aeq = LxW + 2H(L+W) + piH^2. Use as pre-design screening before full IEC 62305-2 risk analysis.</div>
        <div class="form-row cols-2">
          ${_inp('c-lr-ng', 'Lightning Ground Flash Density Ng (flashes/km2/year)', '6', '6', 'Use national map/local utility data for exact site value')}
          ${_inp('c-lr-l', 'Structure Length L (m)', '20', '20', 'Building/array footprint length')}
          ${_inp('c-lr-w', 'Structure Width W (m)', '10', '10', 'Building/array footprint width')}
          ${_inp('c-lr-h', 'Structure Height H (m)', '8', '8', 'Highest point including PV structure')}
          ${_inp('c-lr-rt', 'Screening Threshold Rt (events/year)', '0.03', '0.03', 'Lower threshold = more conservative LPS decision gate')}
        </div>
        <div class="form-group">
          <label class="form-label">Location / Surroundings Factor Cd</label>
          <select class="form-select" id="c-lr-cd">
            <option value="0.25">0.25 - surrounded by taller structures</option>
            <option value="0.5">0.50 - surrounded by structures of similar height</option>
            <option value="1" selected>1.00 - isolated structure</option>
            <option value="2">2.00 - isolated hilltop/exposed ridge</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Run Lightning Screening</button>
        <div id="calc-result"></div>`;

      case 'pv_fuse_link_check': return `
        <div class="info-box">IEC 60269-6 gPV selection with IEC 62548-1 coordination. Checks current window, voltage rating, and breaking capacity.</div>
        <div class="form-group">
          <label class="form-label">Select Module (optional but recommended)</label>
          <select class="form-select" id="c-pvf-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-pvf-isc', 'Module Isc (A)', '', '', 'If blank and module selected, app uses module database Isc')}
          ${_inp('c-pvf-fmax', 'Module Max Series Fuse (A)', '', '', 'If blank and module selected, app uses module series fuse if available')}
          ${_inp('c-pvf-nmod', 'Modules per String', '20', '20', 'Used for Voc max estimate when module is selected')}
          ${_inp('c-pvf-tmin', 'Minimum Site Temperature (C)', '10', '10', 'Used for string Voc at Tmin when module is selected')}
          ${_inp('c-pvf-vocmax', 'String Voc max at Tmin (V) [manual override]', '', '', 'If entered, this overrides calculated Voc max')}
          ${_inp('c-pvf-npar', 'Parallel Strings at Combiner/MPPT', '4', '4', 'String fusing is typically required for >3 parallel strings')}
          ${_inp('c-pvf-vfuse', 'Fuse Rated Voltage Ue (V DC)', '1000', '1000', 'Must be >= maximum string Voc at Tmin')}
          ${_inp('c-pvf-ifault', 'Prospective DC Fault Current (kA)', '5', '5', 'Estimated prospective short-circuit current at fuse location')}
          ${_inp('c-pvf-ibreak', 'Fuse Breaking Capacity Icn (kA)', '20', '20', 'From fuse datasheet')}
        </div>
        <div class="form-group">
          <label class="form-label">Fuse Utilization Class</label>
          <select class="form-select" id="c-pvf-util">
            <option value="gpv" selected>gPV (required for PV string/array fusing)</option>
            <option value="other">Other class (not preferred for PV string protection)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check Fuse Compliance</button>
        <div id="calc-result"></div>`;

      case 'pr_calc': return `
        <div class="info-box">IEC 61724-1: PR = E_AC ÷ (H_poa × P_stc ÷ G_stc). Shows complete step-by-step calculation.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac',   'AC Energy Produced (kWh)', '', '', 'From inverter or CEB meter — same period as H_poa')}
          ${_inp('c-hpoa',  'POA Irradiation (kWh/m²)', '', '', 'Plane-of-array irradiation — same period')}
          ${_inp('c-pkwp',  'System DC Capacity (kWp)', '', '', 'Total array nameplate')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate PR</button>
        <div id="calc-result"></div>`;

      case 'specific_yield': return `
        <div class="info-box">Specific Yield (kWh/kWp) = annual AC energy ÷ system capacity. Sri Lanka typical: 1300–1600 kWh/kWp/year.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac-yr', 'Annual AC Energy (kWh)', '', '', 'From inverter annual log or CEB meter')}
          ${_inp('c-pkwp',   'System DC Capacity (kWp)', '', '', 'Total nameplate')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'capacity_factor': return `
        <div class="info-box">Capacity Factor = Actual kWh ÷ (kWp × 8760 hours). Typical PV: 15–22% in Sri Lanka.</div>
        <div class="form-row cols-2">
          ${_inp('c-eac-yr', 'Annual AC Energy (kWh)', '', '', '')}
          ${_inp('c-pkwp',   'System DC Capacity (kWp)', '', '', '')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'pid_risk': return `
        <div class="info-box">IEC TS 62804: PID risk assessment for Sri Lanka conditions. High humidity + high system voltage = high risk.</div>
        <div class="form-row cols-2">
          ${_inp('c-vsys',   'String Voc at Tmin (V)', '', '', 'Highest voltage in string at coldest temp')}
          ${_inp('c-humid',  'Average Relative Humidity (%)', '80', '80', 'Sri Lanka coastal ~80–85%, hill country ~75%')}
        </div>
        <div class="form-group">
          <label class="form-label">Module Type</label>
          <select class="form-select" id="c-modtype">
            <option value="p-type">p-type (Mono-PERC, BSF) — Higher PID risk</option>
            <option value="n-type">N-type (TOPCon, HJT) — Lower PID risk</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">System Grounding</label>
          <select class="form-select" id="c-ground">
            <option value="none">Ungrounded (floating) — Higher risk</option>
            <option value="negative">Negative ground — Reduces PID for p-type</option>
            <option value="positive">Positive ground — Increases PID for p-type</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Assess Risk</button>
        <div id="calc-result"></div>`;

      case 'string_voc_tmin': return `
        <div class="info-box">IEC 62548-1: String Voc at Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25)). Must be ≤ inverter max DC input voltage.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',     '20',   '20',   '')}
          ${_inp('c-tmin',    'Min Site Temp (°C)',      '10',   '10',   'Sri Lanka default: 10°C')}
          ${_inp('c-vinvmax', 'Inverter Max DC (V)',     '1000', '1000', 'From inverter spec')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'string_vmp_tmax': return `
        <div class="info-box">IEC 62548-1: String Vmp at Tmax_cell = n × Vmp_stc × (1 + αVoc × (Tcell − 25)). Must be ≥ inverter MPPT minimum voltage.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-nmod',    'Modules per String',       '20',  '20',  '')}
          ${_inp('c-tamb',    'Max Ambient Temp (°C)',    '38',  '38',  'Hottest day ambient')}
          ${_inp('c-vmppt',   'Inverter MPPT Vmin (V)',   '200', '200', 'From inverter spec')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'max_strings_no_fuse': return `
        <div class="info-box">PV-only reverse-current bound: (N − 1) × design Isc, compared with the module maximum series-fuse value (PUCSL September 2022 guideline, section 3.1). Other fault sources and the complete protection/cable design require separate assessment.</div>
        ${_inp('c-nstr', 'Number of Parallel Strings', '', '', 'Strings connected to same MPPT input')}
        ${_inp('c-string-isc','Design Isc per string (A)','','','Include applicable irradiance/current corrections.')}
        ${_inp('c-max-series-fuse','Module maximum series-fuse value (A)','','','From the exact module datasheet.')}
        <label class="checkbox-item"><input type="checkbox" id="c-other-source"/> Battery or another source can contribute fault current to this branch</label>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'grid_voltage_check': return `
        <div class="info-box">Compare one recorded voltage with the entered project limits. This does not test protection timing, averaging, ride-through or reconnection. Reference the actual DL-approved schedule.</div>
        ${_inp('c-vgrid', 'Measured Grid Voltage (V)', '', '', 'L-N at point of connection')}
        ${_inp('c-grid-low','Approved lower comparison value (V)','','','Use the actual approved schedule.')}
        ${_inp('c-grid-high','Approved upper comparison value (V)','','','Use the actual approved schedule.')}
        <div class="form-group"><label class="form-label" for="c-grid-ref">Approved schedule reference</label><input class="form-input" id="c-grid-ref" type="text"/></div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'system_size_check': return `
        <div class="info-box">PUCSL: Residential system ≤ sanctioned load in kVA. Commercial requires separate approval for systems &gt; 100 kWp.</div>
        <div class="form-row cols-2">
          ${_inp('c-syssize',  'Proposed System Size (kWp)', '', '', 'DC nameplate capacity')}
          ${_inp('c-sanctioned','Sanctioned Load (kVA)',     '', '', 'From CEB/LECO connection')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'ceb_readiness_check': return `
        <div class="info-box">PUCSL utility workflow: complete application, compliance records, commissioning, and authorization checks before export enable.</div>
        <div class="form-row cols-2">
          <label class="form-label"><input id="c-r-sld" type="checkbox" /> SLD + protection details attached</label>
          <label class="form-label"><input id="c-r-approvals" type="checkbox" /> Equipment approvals/type certificates attached</label>
          <label class="form-label"><input id="c-r-meter" type="checkbox" /> Metering arrangement confirmed with utility</label>
          <label class="form-label"><input id="c-r-settings" type="checkbox" /> Inverter settings sheet submitted</label>
          <label class="form-label"><input id="c-r-tests" type="checkbox" /> Commissioning/inspection reports complete</label>
          <label class="form-label"><input id="c-r-agreement" type="checkbox" /> Utility agreement/authorization complete</label>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Run Readiness Check</button>
        <div id="calc-result"></div>`;

      case 'ceb_setting_match': return `
        <div class="info-box">Compare submitted utility profile against commissioned inverter profile. CEB settings sheet (2025-02-25) uses 1.06 pu sustained OV for &lt;1MW and 1.05 pu for &ge;1MW, with 600 s reconnect delay and 49.5-50.5 Hz reconnect window.</div>
        <div class="form-group">
          <label class="form-label">Plant Capacity Class</label>
          <select class="form-select" id="c-sm-class">
            <option value="lt1">Below 1 MW</option>
            <option value="ge1">1 MW and above</option>
          </select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-sm-vsub', 'Submitted Sustained OV Limit (pu)', '1.06', '1.06', 'Use 1.06 for <1MW, 1.05 for >=1MW unless utility-approved variant')}
          ${_inp('c-sm-vcom', 'Commissioned Sustained OV Limit (pu)', '1.06', '1.06', 'Read from inverter exported settings')}
          ${_inp('c-sm-rsub', 'Submitted Reconnect Delay (s)', '600', '600', 'CEB profile default is 600 s')}
          ${_inp('c-sm-rcom', 'Commissioned Reconnect Delay (s)', '600', '600', 'Must match submitted profile')}
          ${_inp('c-sm-fminsub', 'Submitted Reconnect f_min (Hz)', '49.5', '49.5', 'Expected reconnect window lower limit')}
          ${_inp('c-sm-fmincom', 'Commissioned Reconnect f_min (Hz)', '49.5', '49.5', 'Read from inverter settings export')}
          ${_inp('c-sm-fmaxsub', 'Submitted Reconnect f_max (Hz)', '50.5', '50.5', 'Expected reconnect window upper limit')}
          ${_inp('c-sm-fmaxcom', 'Commissioned Reconnect f_max (Hz)', '50.5', '50.5', 'Read from inverter settings export')}
          ${_inp('c-sm-rampsub', 'Submitted Enter-Service Ramp (s)', '900', '900', 'CEB profile default is linear 900 s ramp')}
          ${_inp('c-sm-rampcom', 'Commissioned Enter-Service Ramp (s)', '900', '900', 'Must match submitted profile')}
        </div>
        <div class="form-group">
          <label class="form-label"><input id="c-sm-perm" type="checkbox" /> Written utility permission exists for any deviation</label>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check Setting Match</button>
        <div id="calc-result"></div>`;

      case 'ceb_export_gate': return `
        <div class="info-box">Final gate before enabling export: approvals, tests, agreement, and utility acceptance must all be complete.</div>
        <div class="form-row cols-2">
          <label class="form-label"><input id="c-eg-clearance" type="checkbox" /> Initial clearance obtained</label>
          <label class="form-label"><input id="c-eg-inspection" type="checkbox" /> Utility inspection / witnessed commissioning passed</label>
          <label class="form-label"><input id="c-eg-agreement" type="checkbox" /> Interconnection agreement executed</label>
          <label class="form-label"><input id="c-eg-meter" type="checkbox" /> Utility bi-directional metering commissioned</label>
          <label class="form-label"><input id="c-eg-accept" type="checkbox" /> Final written utility acceptance received</label>
          <label class="form-label"><input id="c-eg-exportreq" type="checkbox" /> Site is requesting export enable now</label>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Evaluate Export Gate</button>
        <div id="calc-result"></div>`;

      case 'inverter_sizing': return `
        <div class="info-box">Sri Lanka / PUCSL rule: Inverter AC rating ≥ 0.85 × Array DC (kWp). Ratio 0.8–1.0 is typical. Below 0.8 causes clipping losses; above 1.0 wastes inverter capacity.</div>
        <div class="form-row cols-2">
          ${_inp('c-pdc',  'Array DC Capacity (kWp)', '', '', 'Total nameplate Wp ÷ 1000')}
          ${_inp('c-pac',  'Inverter AC Rating (kW)',  '', '', 'From inverter spec sheet')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'cable_vdrop': return `
        <div class="info-box">IEC 60364-7-712 / SLS 1522: VD = (2 × L × I × ρ) ÷ A. Limit: &lt;1% for DC string cables, &lt;3% for AC side. Use ρ = 0.0172 Ω·mm²/m for copper.</div>
        <div class="form-row cols-2">
          ${_inp('c-vdl',   'Cable Length one-way (m)', '', '', 'One-way run length — formula uses 2×L for return')}
          ${_inp('c-vdi',   'Current (A)', '', '', 'String Isc for DC; inverter output current for AC')}
          ${_inp('c-vda',   'Cable CSA (mm²)', '4', '4', 'Cross-sectional area: 4, 6, 10, 16 mm² etc.')}
          ${_inp('c-vdvn',  'Nominal Voltage (V)', '', '', 'String Vmp for DC; 230 for single-phase AC')}
        </div>
        <div class="form-group">
          <label class="form-label">Cable Type / Side</label>
          <select class="form-select" id="c-vdside">
            <option value="dc">DC String Cable (limit: &lt;1%)</option>
            <option value="ac">AC Side Cable (limit: &lt;3%)</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'cable_selector_adv': return `
        <div class="info-box">Advanced pre-design selector using Kelani catalogue tables (E/F/H) with IEC/SLS checks: combines ampacity, environmental derating, and voltage-drop limits to suggest cable CSA.</div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">System Type</label>
            <select class="form-select" id="c-cs-system">
              <option value="dc">DC 2-wire (PV/battery)</option>
              <option value="ac1p">AC 1-phase</option>
              <option value="ac3p">AC 3-phase</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cable Construction</label>
            <select class="form-select" id="c-cs-construction">
              <option value="multi_core_non_armoured">Multicore non-armoured</option>
              <option value="multi_core_armoured">Multicore armoured</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Conductor Material</label>
            <select class="form-select" id="c-cs-mat">
              <option value="cu">Copper (Cu)</option>
              <option value="al">Aluminum (Al)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Insulation Class</label>
            <select class="form-select" id="c-cs-ins">
              <option value="xlpe">XLPE / 90C</option>
              <option value="pvc">PVC / 70C</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Installation / Place</label>
            <select class="form-select" id="c-cs-install">
              <option value="closed_tube">Closed conduit/tube/trunking</option>
              <option value="open_air">Open air / perforated tray</option>
              <option value="clipped_direct">Clipped direct</option>
              <option value="buried_direct">Buried direct in ground</option>
              <option value="buried_duct">Buried in duct</option>
              <option value="rooftop_open">Rooftop open-air route</option>
            </select>
          </div>
          ${_inp('c-cs-temp', 'Ambient Temperature (C)', '35', '35', 'Derating uses insulation temperature range')}
          ${_inp('c-cs-gtemp', 'Ground Temperature (C)', '20', '20', 'Used for buried methods (Kelani Z-02)')}
          ${_inp('c-cs-group', 'Loaded Circuits Grouped Together', '1', '1', '1 = single circuit, higher = heavier grouping derating')}
          <div class="form-group">
            <label class="form-label">Buried Spacing</label>
            <select class="form-select" id="c-cs-bspacing">
              <option value="touching">Touching</option>
              <option value="one_d">One cable diameter</option>
              <option value="0.125m">0.125 m</option>
              <option value="0.25m">0.25 m</option>
              <option value="0.5m">0.5 m</option>
              <option value="1.0m">1.0 m</option>
            </select>
          </div>
          ${_inp('c-cs-l', 'Length One-way (m)', '40', '40', 'Route length from source to load')}
          ${_inp('c-cs-v', 'Nominal Voltage (V)', '230', '230', 'Example: 48V DC, 230V 1P, 400V 3P')}
          ${_inp('c-cs-i', 'Load Current (A) [optional]', '', '', 'If blank, current is calculated from load power')}
          ${_inp('c-cs-p', 'Load Power (kW) [optional]', '', '', 'Used when current is not entered')}
          ${_inp('c-cs-pf', 'Power Factor (AC)', '0.95', '0.95', 'Used for AC current derivation')}
          ${_inp('c-cs-cf', 'Continuous Load Factor', '1.25', '1.25', 'IEC PV practice often uses 1.25 for continuous design')}
          ${_inp('c-cs-vdlim', 'Voltage Drop Limit (%)', '', '', 'Blank = 1% for DC, 3% for AC')}
        </div>
        <div class="info-box">Standards checkpoints: current capacity with correction factors (IEC 60364-5-52), voltage-drop limits by circuit role (IEC 60364-7-712 / SLS 1522), and final datasheet verification before construction.</div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate Recommended Cable Size</button>
        <div id="calc-result"></div>`;

      case 'dc_fuse_sizing': return `
        <div class="info-box">IEC 62548-1 / SLS 1522: DC string fuse = 1.25 × 1.25 × Isc (double 1.25 factor — one for continuous current, one for fault tolerance). Must also be ≤ module Series Fuse Rating.</div>
        <div class="form-group">
          <label class="form-label">Select Module</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        ${_inp('c-fuse-r', 'Module Series Fuse Rating (A)', '', '', 'From module datasheet label — max reverse current')}
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'linear_degradation': return `
        <div class="info-box">IEC 61215 / SLS 1553 Linear Model: P(n) = P₀ × (1 − LID) − P₀ × d × (n − 1)<br>Used for warranty calculations. LID = Year 1 loss; d = annual degradation rate.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',   'Nameplate Power P₀ (W)',         '', '',    'Module or string STC power')}
          ${_inp('c-lid',  'LID — Year 1 loss (%)',          '2', '2',  'Typical: 1.0–2.5% for c-Si; ~0.5% for N-type')}
          ${_inp('c-drate','Annual Degradation d (%/year)',  '0.5','0.5','Mono: 0.3–0.5%, Poly: 0.5–0.8%, Thin-film: 0.6–1.0%')}
          ${_inp('c-nyear','Year n to calculate',            '25', '25', 'e.g. 10, 20, 25')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'compound_degradation': return `
        <div class="info-box">Compound Degradation Model: P(n) = P₀ × (1 − LID) × (1 − d)^(n−1)<br>More realistic than linear — loss compounds each year relative to prior year's output.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',   'Nameplate Power P₀ (W)',         '', '',    'Module or string STC power')}
          ${_inp('c-lid',  'LID — Year 1 loss (%)',          '2', '2',  'Typical: 1.0–2.5% for c-Si')}
          ${_inp('c-drate','Annual Degradation d (%/year)',  '0.5','0.5','Mono: 0.3–0.5%, Poly: 0.5–0.8%')}
          ${_inp('c-nyear','Year n to calculate',            '25', '25', '')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      case 'warranty_check': return `
        <div class="info-box">SLS 1553 / Sri Lanka requirement: ≥80% of initial power at Year 25. Check if a measured or calculated output still meets the manufacturer's warranty claim.</div>
        <div class="form-row cols-2">
          ${_inp('c-p0',      'Original Rated Power P₀ (W)',    '', '', 'Nameplate at commissioning')}
          ${_inp('c-pmeas',   'Current Measured Power (W)',      '', '', 'STC-corrected field measurement')}
          ${_inp('c-nyear',   'Age of System (years)',           '', '', 'Years since commissioning')}
          ${_inp('c-wguarant','Warranty Guarantee at Year 25 (%)', '80', '80', 'Typically 80% per SLS 1553')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Check</button>
        <div id="calc-result"></div>`;

      case 'cell_temp_noct': return `
        <div class="info-box">IEC 61853 / IEC 61215: T_cell = T_amb + (NOCT − 20) ÷ 800 × G. Used to calculate realistic operating temperature.</div>
        <div class="form-group">
          <label class="form-label">Select Module (for NOCT)</label>
          <select class="form-select" id="c-panel">${pOpts}</select>
        </div>
        <div class="form-row cols-2">
          ${_inp('c-tamb', 'Ambient Temp (°C)', '35', '35', '')}
          ${_inp('c-girr', 'Irradiance (W/m²)', '1000', '1000', 'Use 800 for NOCT test conditions')}
        </div>
        <button class="btn btn-primary btn-sm calc-run-btn">Calculate</button>
        <div id="calc-result"></div>`;

      default: return `<div class="text-muted">Calculator not implemented for: ${_esc(calcId)}</div>`;
    }
  }

  // -----------------------------------------------------------------------
  // CALCULATION RUNNERS (step-by-step output)
  // -----------------------------------------------------------------------

  function _g(area, id) {
    const el = area.querySelector('#' + id);
    return el ? parseFloat(el.value) : NaN;
  }
  function _gs(area, id) {
    const el = area.querySelector('#' + id);
    return el ? el.value : '';
  }
  function _gc(area, id) {
    const el = area.querySelector('#' + id);
    return !!(el && el.checked);
  }

  function _steps(steps, verdict, verdictCls) {
    return `
      <div style="margin-top:10px">
        <div class="section-title">Step-by-Step Calculation</div>
        <div style="font-family:monospace;font-size:0.82rem;background:var(--bg-3);border-radius:var(--radius);padding:12px;line-height:1.9;overflow-x:auto">
          ${steps.map(s => `<div>${_esc(s)}</div>`).join('')}
        </div>
        <div class="result-box ${verdictCls}" style="margin-top:10px">
          <div class="result-value" style="font-size:1.3rem">${_esc(verdict)}</div>
        </div>
      </div>`;
  }

  function _runCalc(area, calcId) {
    const result = area.querySelector('#calc-result');

    try {
      switch (calcId) {

        case 'ir_test': {
          const pos = _g(area, 'c-ir-pos');
          const neg = _g(area, 'c-ir-neg');
          const check=SriLankaStandards.irCheck(_g(area,'c-ir-system'),_g(area,'c-ir-test'),pos,neg);
          result.innerHTML = _steps([
            `Required test voltage in the cited band: ${check.requiredTest??'not determined'} V`,
            `Minimum in that band: ${check.minimum??'not determined'} MΩ`,
            `DC+: ${Number.isFinite(pos)?pos:'not recorded'} MΩ; DC−: ${Number.isFinite(neg)?neg:'not recorded'} MΩ`,check.note
          ],check.status==='within'?'Entered readings meet the cited comparison':check.status==='below'?'Reading below the cited criterion':'REVIEW — incomplete or inconsistent test evidence',check.status==='within'?'alert-safe':check.status==='below'?'alert-unsafe':'alert-warn');
          break;
        }

        case 'voc_check': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const T = _g(area, 'c-tmod');
          const Vm = _g(area, 'c-voc-m');
          if (!panelId || isNaN(n) || isNaN(Vm)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_stc_str = p.Voc * n;
          const T_used = isNaN(T) ? 25 : T;
          const Voc_exp = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, T_used) * n;
          const dev = (Vm - Voc_exp) / Voc_exp * 100;
          const pass = Math.abs(dev) <= 2.0;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: String Voc at STC = n × Voc_stc = ${n} × ${p.Voc} = ${Voc_stc_str.toFixed(2)} V`,
            `Step 2: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C`,
            `Step 3: ΔT = T_module − 25 = ${T_used} − 25 = ${(T_used-25).toFixed(1)} °C`,
            `Step 4: Correction factor = 1 + αVoc × ΔT = 1 + ${p.coeffVoc.toFixed(4)} × ${(T_used-25).toFixed(1)} = ${(1+p.coeffVoc*(T_used-25)).toFixed(4)}`,
            `Step 5: Voc_expected = ${Voc_stc_str.toFixed(2)} × ${(1+p.coeffVoc*(T_used-25)).toFixed(4)} = ${Voc_exp.toFixed(2)} V`,
            `Step 6: Measured Voc = ${Vm} V`,
            `Step 7: Deviation = (${Vm} − ${Voc_exp.toFixed(2)}) ÷ ${Voc_exp.toFixed(2)} × 100 = ${dev>=0?'+':''}${dev.toFixed(2)} %`,
            `IEC 62446-1 limit: ±2.0%`,
            pass ? `${Math.abs(dev).toFixed(2)}% ≤ 2.0% → ✓ PASS` : `${Math.abs(dev).toFixed(2)}% > 2.0% → ✗ FAIL — check connections, module count, shading`
          ], `${dev>=0?'+':''}${dev.toFixed(2)}% — ${pass?'✓ PASS':'✗ FAIL'}`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'isc_check': {
          const panelId = _gs(area, 'c-panel');
          const G = _g(area, 'c-irr');
          const T = _g(area, 'c-tmod');
          const Im = _g(area, 'c-isc-m');
          if (!panelId || isNaN(G) || isNaN(Im)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const T_used = isNaN(T) ? 25 : T;
          const Isc_exp = PVCalc.iscCorrected(p.Isc, p.coeffIsc, T_used, G);
          const dev = (Im - Isc_exp) / Isc_exp * 100;
          const pass = Math.abs(dev) <= 5.0;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: Isc_stc = ${p.Isc} A, αIsc = +${(p.coeffIsc*100).toFixed(3)} %/°C`,
            `Step 2: Temp correction: Isc_temp = ${p.Isc} × (1 + ${p.coeffIsc.toFixed(5)} × (${T_used}−25)) = ${PVCalc.iscAtTemp(p.Isc,p.coeffIsc,T_used).toFixed(3)} A`,
            `Step 3: Irradiance correction: Isc_corr = Isc_temp × (G ÷ 1000) = ${PVCalc.iscAtTemp(p.Isc,p.coeffIsc,T_used).toFixed(3)} × (${G} ÷ 1000) = ${Isc_exp.toFixed(3)} A`,
            `Step 4: Measured Isc = ${Im} A`,
            `Step 5: Deviation = (${Im} − ${Isc_exp.toFixed(3)}) ÷ ${Isc_exp.toFixed(3)} × 100 = ${dev>=0?'+':''}${dev.toFixed(2)} %`,
            `IEC 62446-1 limit: ±5.0%`,
            pass ? `${Math.abs(dev).toFixed(2)}% ≤ 5.0% → ✓ PASS` : `${Math.abs(dev).toFixed(2)}% > 5.0% → ✗ FAIL — check shading, soiling, bypass diodes`
          ], `${dev>=0?'+':''}${dev.toFixed(2)}% — ${pass?'✓ PASS':'✗ FAIL'}`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'insulation_test_voltage': {
          const Vs = _g(area, 'c-vsys');
          if (isNaN(Vs)) { result.innerHTML = '<div class="danger-box">Enter system voltage</div>'; break; }
          const Vtest = 1000 + 2 * Vs;
          result.innerHTML = _steps([
            `IEC 61730 Cl.10.19 formula: V_test = 1000 V + 2 × V_sys_max`,
            `Step 1: V_sys_max = ${Vs} V`,
            `Step 2: V_test = 1000 + 2 × ${Vs} = 1000 + ${2*Vs} = ${Vtest} V`,
            `This test voltage is applied for 1 minute between all conductors shorted together and the module frame.`,
            `Module must not break down — leakage current must stay below manufacturer's rated limit.`
          ], `Required Test Voltage: ${Vtest} V DC (1 minute)`, 'alert-warn');
          break;
        }

        case 'power_degradation': {
          const Pi = _g(area, 'c-p-initial');
          const Pc = _g(area, 'c-p-current');
          if (isNaN(Pi) || isNaN(Pc)) { result.innerHTML = '<div class="danger-box">Enter both power values</div>'; break; }
          const deg = (Pi - Pc) / Pi * 100;
          const pass61215 = deg <= 5.0;
          result.innerHTML = _steps([
            `Step 1: Initial Pmax = ${Pi} W`,
            `Step 2: Current Pmax = ${Pc} W`,
            `Step 3: Degradation = (Initial − Current) ÷ Initial × 100`,
            `Step 4: Degradation = (${Pi} − ${Pc}) ÷ ${Pi} × 100 = ${deg.toFixed(2)} %`,
            `IEC 61215 limit: ≤5% (Sequence A), ≤8% (Sequence B)`,
            `Field annual degradation guidance: ≤0.5–0.7%/year for mono-Si`,
            deg <= 0 ? `Negative degradation — check measurement accuracy` : deg <= 5 ? `${deg.toFixed(2)}% ≤ 5% → Within IEC 61215 limit` : `${deg.toFixed(2)}% > 5% → Exceeds IEC 61215 Sequence A limit`
          ], `Degradation: ${deg.toFixed(2)}%`, deg<=5?'alert-safe':'alert-unsafe');
          break;
        }

        case 'reverse_current': {
          const panelId = _gs(area, 'c-panel');
          const fuse = _g(area, 'c-fuse');
          const nStr = _g(area, 'c-nstr');
          if (isNaN(fuse) || isNaN(nStr)) { result.innerHTML = '<div class="danger-box">Enter fuse rating and string count</div>'; break; }
          const p = panelId ? DB.getById(panelId) : null;
          const Isc = p ? p.Isc : NaN;
          const Irev_max = fuse * 1.35;
          const Irev_actual = isNaN(Isc) ? 'N/A' : ((nStr - 1) * Isc).toFixed(2);
          const pass = isNaN(Isc) ? null : (nStr - 1) * Isc <= Irev_max;
          result.innerHTML = _steps([
            p ? `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A` : 'No module selected',
            `Step 1: Series Fuse Rating = ${fuse} A`,
            `Step 2: Max reverse current (IEC 61730) = 1.35 × fuse = 1.35 × ${fuse} = ${Irev_max.toFixed(2)} A`,
            `Step 3: ${nStr} strings in parallel → reverse current through one string if it open-circuits:`,
            `         I_reverse = (${nStr} − 1) × Isc = (${nStr} − 1) × ${isNaN(Isc)?'?':Isc} = ${Irev_actual} A`,
            isNaN(Isc) ? 'Select module to complete check' : pass ? `${Irev_actual} A ≤ ${Irev_max.toFixed(2)} A → ✓ Module can withstand reverse current` : `${Irev_actual} A > ${Irev_max.toFixed(2)} A → ✗ String fuse REQUIRED to protect module`
          ], pass===null?'Select module to complete':pass?`✓ Safe — ${Irev_actual} A < ${Irev_max.toFixed(2)} A`:`✗ Fuse Required — ${Irev_actual} A exceeds limit`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'bypass_diode_check': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Vm = _g(area, 'c-voc-m');
          if (!panelId || isNaN(n) || isNaN(Vm)) { result.innerHTML = '<div class="danger-box">Select panel and enter values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_exp = p.Voc * n;
          const ratio = Vm / Voc_exp;
          const diode_drop = p.Voc / 3;
          let finding = 'No bypass diode failure pattern detected.';
          let cls = 'alert-safe';
          for (let k = 1; k <= Math.min(n * 3, 9); k++) {
            const exp_k = Voc_exp - k * diode_drop;
            if (Math.abs(Vm - exp_k) / Voc_exp < 0.05) {
              finding = `Voc matches pattern for ${k} failed bypass diode(s). Expected with ${k} diode(s) shorted: ${exp_k.toFixed(1)} V. Measured: ${Vm} V.`;
              cls = 'alert-unsafe';
              break;
            }
          }
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, Voc = ${p.Voc} V, ${n} modules/string`,
            `Step 1: Expected string Voc (STC) = ${n} × ${p.Voc} = ${Voc_exp.toFixed(1)} V`,
            `Step 2: Measured Voc = ${Vm} V (${(ratio*100).toFixed(1)}% of expected)`,
            `Step 3: Each bypass diode protects ~1/3 of module cells`,
            `         Diode dropout voltage ≈ Voc/3 = ${p.Voc}/3 = ${diode_drop.toFixed(2)} V per diode`,
            `Step 4: Check if measured Voc matches (n_modules × Voc) − k × (Voc/3) for k = 1,2,3...`,
            finding
          ], finding, cls);
          break;
        }

        case 'cable_sizing': {
          const panelId = _gs(area, 'c-panel');
          const nStr = _g(area, 'c-nstr');
          const derate = _g(area, 'c-derate');
          const cabAmp = _g(area, 'c-cabamp');
          const p = panelId ? DB.getById(panelId) : null;
          if (!p || isNaN(nStr) || isNaN(derate)) { result.innerHTML = '<div class="danger-box">Select module and fill fields</div>'; break; }
          const I_design = 1.25 * p.Isc * nStr;
          const I_cable_req = I_design / derate;
          const pass = !isNaN(cabAmp) && cabAmp * derate >= I_design;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A`,
            `Step 1: IEC 60364-7-712: Cable must carry 1.25 × Isc continuously`,
            `Step 2: Design current = 1.25 × Isc × strings = 1.25 × ${p.Isc} × ${nStr} = ${I_design.toFixed(2)} A`,
            `Step 3: Derating factor = ${derate} (temperature + grouping + conduit)`,
            `Step 4: Required cable ampacity = Design current ÷ derating = ${I_design.toFixed(2)} ÷ ${derate} = ${I_cable_req.toFixed(2)} A`,
            isNaN(cabAmp) ? `Enter cable ampacity to check if selected cable is adequate.` : pass ? `Selected cable: ${cabAmp} A × ${derate} derate = ${(cabAmp*derate).toFixed(2)} A ≥ ${I_design.toFixed(2)} A → ✓ Adequate` : `Selected cable: ${cabAmp} A × ${derate} derate = ${(cabAmp*derate).toFixed(2)} A < ${I_design.toFixed(2)} A → ✗ Undersized`
          ], isNaN(cabAmp) ? `Min cable ampacity needed: ${I_cable_req.toFixed(1)} A` : pass ? `✓ Cable adequate (${cabAmp}A rated)` : `✗ Cable undersized — need ≥${I_cable_req.toFixed(1)} A`, isNaN(cabAmp)?'alert-warn':pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'string_fuse': {
          const panelId = _gs(area, 'c-panel');
          const fuseR = _g(area, 'c-fuse-r');
          const p = panelId ? DB.getById(panelId) : null;
          if (!p && isNaN(fuseR)) { result.innerHTML = '<div class="danger-box">Select module or enter fuse rating</div>'; break; }
          const Isc = p ? p.Isc : NaN;
          const FR = isNaN(fuseR) ? null : fuseR;
          const min_fuse = isNaN(Isc) ? '?' : (1.5 * Isc).toFixed(1);
          const max_fuse = FR || '?';
          result.innerHTML = _steps([
            p ? `Module: ${p.manufacturer} ${p.model}, Isc = ${Isc} A` : 'No module selected',
            `Step 1: Min fuse rating (to avoid nuisance blowing) = 1.5 × Isc = 1.5 × ${isNaN(Isc)?'?':Isc} = ${min_fuse} A`,
            `Step 2: Max fuse rating (IEC 62548-1) = Series Fuse Rating on label = ${max_fuse} A`,
            `Step 3: Select a standard fuse rating between ${min_fuse} A and ${max_fuse} A`,
            `Standard fuse ratings: 10A, 12A, 15A, 16A, 20A, 25A`,
            `Common choice: 15A for modules with Isc ~10A, 20A for Isc ~13–15A`
          ], `Fuse range: ${min_fuse} A – ${max_fuse} A`, 'alert-warn');
          break;
        }

        case 'earth_resistance': {
          const Re = _g(area, 'c-re');
          if (isNaN(Re)) { result.innerHTML = '<div class="danger-box">Enter measured resistance</div>'; break; }
          const pass = Re < 1.0;
          result.innerHTML = _steps([
            `IEC 60364-5-54 / PUCSL requirement: Earth resistance < 1 Ω`,
            `Measured earth resistance = ${Re} Ω`,
            pass ? `${Re} Ω < 1 Ω → ✓ PASS — Earth electrode adequate` : `${Re} Ω ≥ 1 Ω → ✗ FAIL — Improve earth electrode (additional rods, deeper rod, bentonite treatment)`
          ], pass ? `✓ PASS — ${Re} Ω` : `✗ FAIL — ${Re} Ω (must be < 1 Ω)`, pass ? 'alert-safe' : 'alert-unsafe');
          break;
        }

        case 'spd_uc_rating': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          if (!panelId || isNaN(n) || isNaN(Tmin)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_tmin = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, Tmin) * n;
          const UC_min = 1.2 * Voc_tmin;
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: Voc at Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25))`,
            `         = ${n} × ${p.Voc} × (1 + ${p.coeffVoc.toFixed(4)} × (${Tmin} − 25))`,
            `         = ${n} × ${p.Voc} × ${(1+p.coeffVoc*(Tmin-25)).toFixed(4)}`,
            `         = ${Voc_tmin.toFixed(1)} V`,
            `Step 2: UC_min (IEC 61643-32) = 1.2 × Voc_max = 1.2 × ${Voc_tmin.toFixed(1)} = ${UC_min.toFixed(1)} V`,
            `Step 3: Select SPD with UC ≥ ${UC_min.toFixed(0)} V (round up to next standard value)`,
            `Standard UC values: 600V, 800V, 1000V, 1200V, 1500V`
          ], `SPD UC ≥ ${UC_min.toFixed(0)} V`, 'alert-warn');
          break;
        }

        case 'spd_summary': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          const Vsys = _g(area, 'c-vsys');
          const exposure = _gs(area, 'c-exposure');
          if (!panelId || isNaN(n) || isNaN(Tmin)) { result.innerHTML = '<div class="danger-box">Select panel and enter values</div>'; break; }
          const p = DB.getById(panelId);
          const Voc_tmin = PVCalc.vocAtTemp(p.Voc, p.coeffVoc, Tmin) * n;
          const UC_min = Math.ceil(1.2 * Voc_tmin / 100) * 100;
          const In_min = exposure === 'exposed' ? 20 : 10;
          const type = exposure === 'exposed' ? 'Type 1+2' : 'Type 2';
          result.innerHTML = _steps([
            `Module: ${p.manufacturer} ${p.model}, ${n} modules/string`,
            `String Voc at Tmin (${Tmin}°C) = ${Voc_tmin.toFixed(1)} V`,
            `Required UC = 1.2 × ${Voc_tmin.toFixed(1)} = ${(1.2*Voc_tmin).toFixed(1)} V → use UC = ${UC_min} V`,
            `System voltage = ${isNaN(Vsys)?'not entered':Vsys+' V'} → SPD voltage class must cover system voltage`,
            `Site exposure: ${exposure} → ${type} SPD, In ≥ ${In_min} kA`,
            `Required: SPD ${type}, UC ≥ ${UC_min} V, In ≥ ${In_min} kA`,
            `Install at: array combiner box AND inverter DC input`,
            `Both DC+ and DC− to earth — 2 SPD units per location (or combined unit)`,
            `SLS 1522:2016 compliance required for Sri Lanka grid-tied systems`
          ], `SPD: ${type}, UC ≥ ${UC_min} V, In ≥ ${In_min} kA`, 'alert-warn');
          break;
        }

        case 'lightning_risk_screen': {
          const Ng = _g(area, 'c-lr-ng');
          const L = _g(area, 'c-lr-l');
          const W = _g(area, 'c-lr-w');
          const H = _g(area, 'c-lr-h');
          const Cd = _g(area, 'c-lr-cd');
          const RtInput = _g(area, 'c-lr-rt');

          if ([Ng, L, W, H, Cd].some(v => isNaN(v) || v <= 0)) {
            result.innerHTML = '<div class="danger-box">Enter valid Ng, dimensions, and Cd factor</div>';
            break;
          }

          const Aeq = (L * W) + (2 * H * (L + W)) + (Math.PI * H * H);
          const Nd = Ng * Aeq * Cd * 1e-6;
          const Rt = (isNaN(RtInput) || RtInput <= 0) ? 0.03 : RtInput;
          const yearsPerEvent = Nd > 0 ? (1 / Nd) : Infinity;
          const exceeds = Nd > Rt;

          let lpl = 'IV';
          if (Nd >= 0.10) lpl = 'II';
          else if (Nd >= 0.03) lpl = 'III';

          const rollingSphere = lpl === 'II' ? 30 : lpl === 'III' ? 45 : 60;
          const spdNote = Nd >= 0.03
            ? 'Recommend coordinated Type 1+2 at AC service entry plus Type 2 near inverter/PV DC entry.'
            : 'At minimum, keep coordinated Type 2 SPDs; verify if Type 1 is needed from utility/supplier lightning study.';
          const cls = exceeds ? 'alert-unsafe' : (Nd >= 0.01 ? 'alert-warn' : 'alert-safe');

          result.innerHTML = _steps([
            `IEC 62305-2 screening frequency: Nd = Ng × Aeq × Cd × 10^-6`,
            `Step 1: Equivalent collection area Aeq = L×W + 2H(L+W) + piH^2`,
            `         = ${L}×${W} + 2×${H}×(${L}+${W}) + pi×${H}^2 = ${Aeq.toFixed(2)} m2`,
            `Step 2: Ng = ${Ng} flashes/km2/year, Cd = ${Cd}`,
            `Step 3: Nd = ${Ng} × ${Aeq.toFixed(2)} × ${Cd} × 10^-6 = ${Nd.toFixed(6)} events/year`,
            `Step 4: Mean interval = 1 / Nd = ${Number.isFinite(yearsPerEvent) ? yearsPerEvent.toFixed(1) : 'infinite'} years/event`,
            `Step 5: Screening threshold Rt = ${Rt.toFixed(4)} events/year`,
            exceeds ? `Nd (${Nd.toFixed(6)}) > Rt (${Rt.toFixed(4)}) -> Full IEC 62305-2 risk study + external LPS design required.` : `Nd (${Nd.toFixed(6)}) <= Rt (${Rt.toFixed(4)}) -> Screening level acceptable, but keep surge coordination.`,
            `Indicative LPL from screening frequency: LPL ${lpl}, rolling sphere radius ~${rollingSphere} m`,
            spdNote,
            'Note: this is a pre-design screening check, not a replacement for complete IEC 62305 risk assessment.'
          ], `Nd = ${Nd.toFixed(5)} /year (about 1 event every ${Number.isFinite(yearsPerEvent) ? yearsPerEvent.toFixed(1) : '∞'} years)`, cls);
          break;
        }

        case 'pv_fuse_link_check': {
          const panelId = _gs(area, 'c-pvf-panel');
          const p = panelId ? DB.getById(panelId) : null;
          const nmod = _g(area, 'c-pvf-nmod');
          const Tmin = _g(area, 'c-pvf-tmin');
          const IscManual = _g(area, 'c-pvf-isc');
          const fmaxManual = _g(area, 'c-pvf-fmax');
          const VocManual = _g(area, 'c-pvf-vocmax');
          const npar = _g(area, 'c-pvf-npar');
          const Vfuse = _g(area, 'c-pvf-vfuse');
          const Ifault = _g(area, 'c-pvf-ifault');
          const Ibreak = _g(area, 'c-pvf-ibreak');
          const util = _gs(area, 'c-pvf-util');

          const Isc = !isNaN(IscManual) ? IscManual : (p ? Number(p.Isc) : NaN);
          const fmaxFromPanel = (p && Number.isFinite(Number(p.seriesFuseA)) && Number(p.seriesFuseA) > 0) ? Number(p.seriesFuseA) : NaN;
          const fmax = !isNaN(fmaxManual) ? fmaxManual : fmaxFromPanel;
          const VocCalc = (p && !isNaN(nmod) && !isNaN(Tmin)) ? PVCalc.vocAtTemp(p.Voc, p.coeffVoc, Tmin) * nmod : NaN;
          const VocMax = !isNaN(VocManual) ? VocManual : VocCalc;

          if ([Isc, npar, Vfuse, Ifault, Ibreak].some(v => isNaN(v) || v <= 0)) {
            result.innerHTML = '<div class="danger-box">Enter Isc, parallel strings, fuse voltage, prospective fault current, and fuse breaking capacity</div>';
            break;
          }

          const needFuse = npar > 3;
          const Idesign = 1.25 * Isc;
          const Imin = 1.25 * Idesign;
          const Imax = !isNaN(fmax) ? fmax : Infinity;
          const stdFuses = [10, 12, 15, 16, 20, 25, 30, 32, 35, 40, 50, 63];
          const candidates = stdFuses.filter(f => f >= Imin && f <= Imax);
          const selectedIn = candidates.length ? candidates[0] : NaN;
          const Ireverse = Math.max(0, (npar - 1) * 1.25 * Isc);
          const voltagePass = isNaN(VocMax) ? null : Vfuse >= VocMax;
          const breakPass = Ibreak >= Ifault;
          const utilPass = util === 'gpv';
          const reverseDriveWarn = !isNaN(selectedIn) && npar > 1 && Ireverse <= selectedIn;

          const failReasons = [];
          if (!utilPass) failReasons.push('Fuse class is not gPV');
          if (!breakPass) failReasons.push('Fuse breaking capacity is below prospective fault current');
          if (voltagePass === false) failReasons.push('Fuse voltage rating is below maximum string Voc');
          if (needFuse && !candidates.length) failReasons.push('No standard fuse rating fits required current window');

          const warnReasons = [];
          if (!needFuse) warnReasons.push('Parallel strings <= 3: verify if fusing is required by reverse-current check and local design practice');
          if (isNaN(fmax)) warnReasons.push('Module maximum series fuse not provided; upper current limit could not be fully checked');
          if (isNaN(VocMax)) warnReasons.push('String Voc max not provided; voltage rating check is incomplete');
          if (reverseDriveWarn) warnReasons.push('Estimated reverse current may be too low to drive rapid fuse operation; verify protection coordination');

          const cls = failReasons.length ? 'alert-unsafe' : (warnReasons.length ? 'alert-warn' : 'alert-safe');
          const verdict = failReasons.length
            ? `FAIL (${failReasons.length} blocking check${failReasons.length > 1 ? 's' : ''})`
            : (warnReasons.length ? `CHECK (${warnReasons.length} warning${warnReasons.length > 1 ? 's' : ''})` : 'PASS - gPV fuse checks satisfied');

          result.innerHTML = _steps([
            `IEC 60269-6 gPV + IEC 62548-1 coordination`,
            p ? `Module: ${p.manufacturer} ${p.model}` : 'Module: not selected (manual inputs used)',
            `Step 1: Isc used = ${Isc.toFixed(3)} A`,
            `Step 2: Design current = 1.25 x Isc = 1.25 x ${Isc.toFixed(3)} = ${Idesign.toFixed(3)} A`,
            `Step 3: Minimum fuse current = 1.25 x design current = ${Imin.toFixed(3)} A`,
            `Step 4: Maximum fuse current from module = ${Number.isFinite(fmax) ? fmax.toFixed(3) + ' A' : 'not available'}`,
            `Step 5: Candidate standard fuse ratings in window = ${candidates.length ? candidates.join('A, ') + 'A' : 'none'}`,
            `Step 6: Recommended nominal In = ${Number.isFinite(selectedIn) ? selectedIn + ' A' : 'N/A'}`,
            `Step 7: String Voc max at Tmin = ${!isNaN(VocMax) ? VocMax.toFixed(2) + ' V' : 'not available'}, fuse Ue = ${Vfuse.toFixed(1)} V -> ${voltagePass === null ? 'CHECK (insufficient data)' : (voltagePass ? 'PASS' : 'FAIL')}`,
            `Step 8: Breaking capacity check: Icn = ${Ibreak.toFixed(2)} kA, I_fault = ${Ifault.toFixed(2)} kA -> ${breakPass ? 'PASS' : 'FAIL'}`,
            `Step 9: Reverse current estimate = (Npar - 1) x 1.25 x Isc = (${npar} - 1) x 1.25 x ${Isc.toFixed(3)} = ${Ireverse.toFixed(3)} A`,
            `Step 10: Utilization class check = ${utilPass ? 'gPV PASS' : 'not gPV FAIL'}`,
            needFuse ? `String fusing required check: Npar = ${npar} > 3 -> fuse REQUIRED` : `String fusing required check: Npar = ${npar} <= 3 -> conditional; verify reverse-current criteria`,
            ...failReasons.map((x, i) => `Blocking ${i + 1}: ${x}`),
            ...warnReasons.map((x, i) => `Warning ${i + 1}: ${x}`)
          ], verdict, cls);
          break;
        }

        case 'pr_calc': {
          const E = _g(area, 'c-eac');
          const H = _g(area, 'c-hpoa');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(H) || isNaN(P) || H===0 || P===0) { result.innerHTML = '<div class="danger-box">Enter all three values</div>'; break; }
          const prCalc = (typeof StandardsCalc !== 'undefined' && StandardsCalc && typeof StandardsCalc.performanceRatio === 'function')
            ? StandardsCalc.performanceRatio(E, H, P)
            : null;
          const pr = prCalc ? prCalc.pr : (E / (H * P));
          const pct = (pr * 100).toFixed(1);
          const cls = pr >= 0.80 ? 'alert-safe' : pr >= 0.70 ? 'alert-warn' : 'alert-unsafe';
          result.innerHTML = _steps([
            `IEC 61724-1 Formula: PR = E_AC ÷ (H_poa × P_stc ÷ G_stc)`,
            `Where G_stc = 1.0 kW/m² (standard reference irradiance)`,
            `Step 1: E_AC = ${E} kWh`,
            `Step 2: H_poa = ${H} kWh/m²`,
            `Step 3: P_stc = ${P} kWp`,
            `Step 4: Theoretical yield = H_poa × P_stc = ${H} × ${P} = ${(H*P).toFixed(1)} kWh`,
            `Step 5: PR = ${E} ÷ ${(H*P).toFixed(1)} = ${pr.toFixed(4)}`,
            `Step 6: PR = ${pct}%`,
            `Benchmark: ≥80% = Good, 70–80% = Acceptable, <70% = Poor`
          ], `PR = ${pct}% — ${pr>=0.80?'Good':pr>=0.70?'Acceptable':'Poor — Investigate'}`, cls);
          break;
        }

        case 'specific_yield': {
          const E = _g(area, 'c-eac-yr');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(P) || P===0) { result.innerHTML = '<div class="danger-box">Enter energy and capacity</div>'; break; }
          const syCalc = (typeof StandardsCalc !== 'undefined' && StandardsCalc && typeof StandardsCalc.specificYield === 'function')
            ? StandardsCalc.specificYield(E, P)
            : null;
          const sy = syCalc ? syCalc.value : (E / P);
          const cls = sy >= 1300 ? 'alert-safe' : sy >= 1000 ? 'alert-warn' : 'alert-unsafe';
          result.innerHTML = _steps([
            `Specific Yield = Annual AC Energy ÷ System DC Capacity`,
            `Step 1: Annual AC Energy = ${E} kWh`,
            `Step 2: System Capacity = ${P} kWp`,
            `Step 3: Specific Yield = ${E} ÷ ${P} = ${sy.toFixed(0)} kWh/kWp/year`,
            `Sri Lanka typical range: 1300–1600 kWh/kWp/year (location dependent)`,
            sy >= 1300 ? `${sy.toFixed(0)} kWh/kWp ≥ 1300 → Within expected range for Sri Lanka` :
            sy >= 1000 ? `${sy.toFixed(0)} kWh/kWp — Below typical Sri Lanka range. Check losses.` :
            `${sy.toFixed(0)} kWh/kWp — Very low. Significant losses or underperformance.`
          ], `Specific Yield: ${sy.toFixed(0)} kWh/kWp/year`, cls);
          break;
        }

        case 'capacity_factor': {
          const E = _g(area, 'c-eac-yr');
          const P = _g(area, 'c-pkwp');
          if (isNaN(E) || isNaN(P) || P===0) { result.innerHTML = '<div class="danger-box">Enter values</div>'; break; }
          const cf = E / (P * 8760) * 100;
          result.innerHTML = _steps([
            `Capacity Factor = Actual kWh ÷ (kWp × 8760 hours/year)`,
            `Step 1: Annual AC Energy = ${E} kWh`,
            `Step 2: System capacity = ${P} kWp`,
            `Step 3: Max theoretical energy = ${P} kWp × 8760 h = ${(P*8760).toFixed(0)} kWh`,
            `Step 4: CF = ${E} ÷ ${(P*8760).toFixed(0)} × 100 = ${cf.toFixed(1)}%`,
            `Typical PV in Sri Lanka: 15–22% capacity factor`
          ], `Capacity Factor: ${cf.toFixed(1)}%`, cf>=15?'alert-safe':'alert-warn');
          break;
        }

        case 'pid_risk': {
          const Vs = _g(area, 'c-vsys');
          const RH = _g(area, 'c-humid');
          const modType = _gs(area, 'c-modtype');
          const ground = _gs(area, 'c-ground');
          let risk = 0;
          const factors = [];
          if (!isNaN(Vs)) {
            if (Vs > 800) { risk += 2; factors.push(`High system voltage (${Vs}V > 800V) → High PID drive voltage`); }
            else if (Vs > 500) { risk += 1; factors.push(`Medium system voltage (${Vs}V)`); }
          }
          if (!isNaN(RH) && RH > 70) { risk += 2; factors.push(`High humidity (${RH}% > 70%) — typical Sri Lanka coastal`); }
          else if (!isNaN(RH) && RH > 60) { risk += 1; factors.push(`Moderate humidity (${RH}%)`); }
          if (modType === 'p-type') { risk += 1; factors.push(`p-type module — higher PID susceptibility`); }
          else { factors.push(`N-type module — naturally more PID resistant`); }
          if (ground === 'positive') { risk += 2; factors.push(`Positive grounding — INCREASES PID risk for p-type modules`); }
          else if (ground === 'negative') { risk -= 1; factors.push(`Negative grounding — reduces PID risk for p-type`); }
          else { risk += 1; factors.push(`Ungrounded system — moderate PID risk`); }
          const level = risk >= 4 ? 'HIGH' : risk >= 2 ? 'MODERATE' : 'LOW';
          const cls = risk >= 4 ? 'alert-unsafe' : risk >= 2 ? 'alert-warn' : 'alert-safe';
          const mitigation = risk >= 4
            ? 'Immediate action: verify module PID certification (IEC TS 62804), install negative grounding or PID recovery box. Consider N-type modules for replacement.'
            : risk >= 2 ? 'Recommended: annual IV curve check, monitor power loss trend. Consider PID recovery overnight grounding.'
            : 'Low risk. Standard monitoring sufficient.';
          result.innerHTML = _steps([
            `IEC TS 62804-1 PID Risk Assessment:`,
            ...factors,
            `Total risk score: ${risk}`,
            `Mitigation: ${mitigation}`
          ], `PID Risk: ${level}`, cls);
          break;
        }

        case 'string_voc_tmin': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tmin = _g(area, 'c-tmin');
          const Vmax = _g(area, 'c-vinvmax');
          if (!panelId || isNaN(n) || isNaN(Tmin) || isNaN(Vmax)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const factor = 1 + p.coeffVoc * (Tmin - 25);
          const Voc_tmin = p.Voc * factor * n;
          const pass = Voc_tmin <= Vmax;
          result.innerHTML = _steps([
            `IEC 62548-1 Formula: V_string_Tmin = n × Voc_stc × (1 + αVoc × (Tmin − 25))`,
            `Module: ${p.manufacturer} ${p.model}`,
            `Step 1: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C = ${p.coeffVoc.toFixed(5)} /°C`,
            `Step 2: ΔT = Tmin − 25 = ${Tmin} − 25 = ${Tmin-25} °C`,
            `Step 3: Correction factor = 1 + ${p.coeffVoc.toFixed(5)} × ${Tmin-25} = ${factor.toFixed(5)}`,
            `Step 4: String Voc at Tmin = ${n} × ${p.Voc} × ${factor.toFixed(4)} = ${Voc_tmin.toFixed(2)} V`,
            `Step 5: Inverter max DC = ${Vmax} V`,
            pass ? `${Voc_tmin.toFixed(2)} V ≤ ${Vmax} V → ✓ SAFE — Will not damage inverter` : `${Voc_tmin.toFixed(2)} V > ${Vmax} V → ✗ EXCEEDS INVERTER LIMIT — Reduce to max ${Math.floor(Vmax/(p.Voc*factor))} modules/string`
          ], pass ? `✓ SAFE — ${Voc_tmin.toFixed(1)} V ≤ ${Vmax} V` : `✗ UNSAFE — ${Voc_tmin.toFixed(1)} V exceeds ${Vmax} V`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'string_vmp_tmax': {
          const panelId = _gs(area, 'c-panel');
          const n = _g(area, 'c-nmod');
          const Tamb = _g(area, 'c-tamb');
          const Vmppt = _g(area, 'c-vmppt');
          if (!panelId || isNaN(n) || isNaN(Tamb) || isNaN(Vmppt)) { result.innerHTML = '<div class="danger-box">Select panel and enter all values</div>'; break; }
          const p = DB.getById(panelId);
          const Tcell = PVCalc.cellTemp(Tamb, p.NOCT, 1000);
          const factor = 1 + p.coeffVoc * (Tcell - 25);
          const Vmp_tmax = p.Vmp * factor * n;
          const pass = Vmp_tmax >= Vmppt;
          result.innerHTML = _steps([
            `IEC 62548-1 / IEC 61853 Formula: V_string_Vmp_Tmax = n × Vmp_stc × (1 + αVoc × (Tcell_max − 25))`,
            `Module: ${p.manufacturer} ${p.model}, NOCT = ${p.NOCT}°C`,
            `Step 1: Cell temp at max ambient: Tcell = Tamb + (NOCT−20)/800 × G`,
            `         Tcell = ${Tamb} + (${p.NOCT}−20)/800 × 1000 = ${Tcell.toFixed(1)} °C`,
            `Step 2: αVoc = ${(p.coeffVoc*100).toFixed(3)} %/°C`,
            `Step 3: Correction = 1 + ${p.coeffVoc.toFixed(5)} × (${Tcell.toFixed(1)}−25) = ${factor.toFixed(4)}`,
            `Step 4: String Vmp at Tcell_max = ${n} × ${p.Vmp} × ${factor.toFixed(4)} = ${Vmp_tmax.toFixed(2)} V`,
            `Step 5: MPPT minimum = ${Vmppt} V`,
            pass ? `${Vmp_tmax.toFixed(2)} V ≥ ${Vmppt} V → ✓ String stays within MPPT range` : `${Vmp_tmax.toFixed(2)} V < ${Vmppt} V → ✗ String drops below MPPT minimum — increase to min ${Math.ceil(Vmppt/(p.Vmp*factor))} modules/string`
          ], pass ? `✓ MPPT OK — ${Vmp_tmax.toFixed(1)} V ≥ ${Vmppt} V` : `✗ Below MPPT min — ${Vmp_tmax.toFixed(1)} V < ${Vmppt} V`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'max_strings_no_fuse': {
          const n=_g(area,'c-nstr'), isc=_g(area,'c-string-isc'), maximum=_g(area,'c-max-series-fuse');
          const check=SriLankaStandards.reverseCurrent(n,isc,maximum,_gc(area,'c-other-source'));
          result.innerHTML=_steps([`Parallel strings: ${n}; design Isc: ${isc} A; module maximum series-fuse value: ${maximum} A`, `Other-string reverse-current bound: ${check.current??'not determined'} A`, 'Cable/device limits, fault sources and the applicable complete design must also be reviewed.'],check.status==='review'?'REVIEW — incomplete data or other fault sources':check.status==='protection_required'?'Reverse-current bound exceeds the entered module value':'Entered bound satisfied — complete protection review still required',check.status==='protection_required'?'alert-unsafe':'alert-warn');
          break;
        }
        case 'grid_voltage_check': {
          const voltage=_g(area,'c-vgrid'),low=_g(area,'c-grid-low'),high=_g(area,'c-grid-high'),reference=_gs(area,'c-grid-ref');
          if(![voltage,low,high].every(Number.isFinite)||low<=0||high<=low||!reference){result.innerHTML='<div class="warn-box">Record the measurement, valid project limits and approved schedule reference.</div>';break;}
          const inside=voltage>=low&&voltage<=high;
          result.innerHTML=_steps([`Measured: ${voltage} V; entered comparison: ${low}–${high} V`, `Schedule: ${reference}`, 'This is an instantaneous comparison only. Timed protection, averaging, ride-through and reconnection are not tested.'],inside?'Measurement within entered comparison values':'Measurement outside entered comparison values',inside?'alert-warn':'alert-unsafe');
          break;
        }

        case 'system_size_check': {
          const sys = _g(area, 'c-syssize');
          const sanc = _g(area, 'c-sanctioned');
          if (isNaN(sys) || isNaN(sanc)) { result.innerHTML = '<div class="danger-box">Enter both values</div>'; break; }
          const pass = sys <= sanc;
          result.innerHTML = _steps([
            `PUCSL Guidelines: Residential system ≤ sanctioned load`,
            `Step 1: Proposed system = ${sys} kWp`,
            `Step 2: Sanctioned load = ${sanc} kVA`,
            `Step 3: ${sys} kWp vs ${sanc} kVA`,
            pass ? `${sys} ≤ ${sanc} → ✓ Within PUCSL residential limit` : `${sys} > ${sanc} → Exceeds sanctioned load. Requires PUCSL special approval or load upgrade.`,
            sys > 100 ? `System > 100 kWp → Commercial/industrial approval process required` : ``
          ], pass ? `✓ Compliant — ${sys} kWp ≤ ${sanc} kVA` : `✗ Exceeds limit — approval required`, pass?'alert-safe':'alert-warn');
          break;
        }

        case 'ceb_readiness_check': {
          const checks = [
            { id: 'c-r-sld',        label: 'SLD + protection details attached' },
            { id: 'c-r-approvals',  label: 'Equipment approvals/type certificates attached' },
            { id: 'c-r-meter',      label: 'Metering arrangement confirmed with utility' },
            { id: 'c-r-settings',   label: 'Inverter settings sheet submitted' },
            { id: 'c-r-tests',      label: 'Commissioning/inspection reports complete' },
            { id: 'c-r-agreement',  label: 'Utility agreement/authorization complete' },
          ];
          const complete = checks.filter(c => _gc(area, c.id));
          const missing = checks.filter(c => !_gc(area, c.id));
          const pass = missing.length === 0;
          result.innerHTML = _steps([
            'Workflow basis: PUCSL process (application review, commissioning witness, utility agreement, and authorization before export).',
            `Completed checks = ${complete.length} / ${checks.length}`,
            ...checks.map((c, idx) => `Step ${idx + 1}: ${c.label} -> ${_gc(area, c.id) ? 'YES' : 'NO'}`),
            pass ? 'All readiness gates are complete.' : `Missing items: ${missing.map(m => m.label).join('; ')}`,
          ], pass ? 'READY FOR SUBMISSION/COMMISSIONING GATE' : 'NOT READY - COMPLETE MISSING ITEMS', pass ? 'alert-safe' : 'alert-warn');
          break;
        }

        case 'ceb_setting_match': {
          const plantClass = _gs(area, 'c-sm-class') === 'ge1' ? 'ge1' : 'lt1';
          const expectedV = plantClass === 'ge1' ? 1.05 : 1.06;
          const expectedFMin = 49.5;
          const expectedFMax = 50.5;
          const expectedDelay = 600;
          const expectedRamp = 900;
          const vSub = _g(area, 'c-sm-vsub');
          const vCom = _g(area, 'c-sm-vcom');
          const rSub = _g(area, 'c-sm-rsub');
          const rCom = _g(area, 'c-sm-rcom');
          const fMinSub = _g(area, 'c-sm-fminsub');
          const fMinCom = _g(area, 'c-sm-fmincom');
          const fMaxSub = _g(area, 'c-sm-fmaxsub');
          const fMaxCom = _g(area, 'c-sm-fmaxcom');
          const rampSub = _g(area, 'c-sm-rampsub');
          const rampCom = _g(area, 'c-sm-rampcom');
          if ([vSub, vCom, rSub, rCom, fMinSub, fMinCom, fMaxSub, fMaxCom, rampSub, rampCom].some(v => isNaN(v))) {
            result.innerHTML = '<div class="danger-box">Enter all submitted and commissioned setting values</div>';
            break;
          }
          const hasPermission = _gc(area, 'c-sm-perm');
          const vDiff = Math.abs(vSub - vCom);
          const rDiff = Math.abs(rSub - rCom);
          const fMinDiff = Math.abs(fMinSub - fMinCom);
          const fMaxDiff = Math.abs(fMaxSub - fMaxCom);
          const rampDiff = Math.abs(rampSub - rampCom);
          const expectedVDiff = Math.abs(vSub - expectedV);
          const expectedDelayDiff = Math.abs(rSub - expectedDelay);
          const expectedFMinDiff = Math.abs(fMinSub - expectedFMin);
          const expectedFMaxDiff = Math.abs(fMaxSub - expectedFMax);
          const expectedRampDiff = Math.abs(rampSub - expectedRamp);
          const vMatch = vDiff <= 0.001;
          const rMatch = rDiff <= 0.1;
          const fMinMatch = fMinDiff <= 0.01;
          const fMaxMatch = fMaxDiff <= 0.01;
          const rampMatch = rampDiff <= 1.0;
          const directMatch = vMatch && rMatch && fMinMatch && fMaxMatch && rampMatch;
          const submittedExpectedOk =
            expectedVDiff <= 0.01 &&
            expectedDelayDiff <= 1.0 &&
            expectedFMinDiff <= 0.05 &&
            expectedFMaxDiff <= 0.05 &&
            expectedRampDiff <= 5.0;
          const pass = (directMatch && submittedExpectedOk) || hasPermission;
          result.innerHTML = _steps([
            'Check rule: commissioned inverter settings must match submitted utility profile and submitted profile should align with selected utility class unless written approval exists.',
            `Step 1: Selected class = ${plantClass === 'ge1' ? '>=1MW' : '<1MW'}; expected submitted values: OV=${expectedV.toFixed(2)} pu, f_reconnect=${expectedFMin.toFixed(1)}-${expectedFMax.toFixed(1)} Hz, delay=${expectedDelay}s, ramp=${expectedRamp}s`,
            `Step 2: Submitted profile vs expected -> OV diff ${expectedVDiff.toFixed(3)} pu, f_min diff ${expectedFMinDiff.toFixed(2)} Hz, f_max diff ${expectedFMaxDiff.toFixed(2)} Hz, delay diff ${expectedDelayDiff.toFixed(1)} s, ramp diff ${expectedRampDiff.toFixed(1)} s`,
            `Step 3: Submitted vs commissioned -> OV diff ${vDiff.toFixed(3)} pu, f_min diff ${fMinDiff.toFixed(2)} Hz, f_max diff ${fMaxDiff.toFixed(2)} Hz, delay diff ${rDiff.toFixed(1)} s, ramp diff ${rampDiff.toFixed(1)} s`,
            `Step 4: Direct match result -> OV ${vMatch ? 'MATCH' : 'MISMATCH'}, freq window ${fMinMatch && fMaxMatch ? 'MATCH' : 'MISMATCH'}, delay ${rMatch ? 'MATCH' : 'MISMATCH'}, ramp ${rampMatch ? 'MATCH' : 'MISMATCH'}`,
            `Step 5: Submitted profile aligns with selected class defaults -> ${submittedExpectedOk ? 'YES' : 'NO'}`,
            `Step 6: Written utility permission for any deviation -> ${hasPermission ? 'YES' : 'NO'}`,
            pass ? 'Setting profile is acceptable for inspection.' : 'Profile mismatch or off-profile settings without written permission -> high rework risk at inspection.',
          ], pass ? 'SETTING CHECK PASS' : 'SETTING CHECK FAIL', pass ? 'alert-safe' : 'alert-unsafe');
          break;
        }

        case 'ceb_export_gate': {
          const gates = [
            { id: 'c-eg-clearance', label: 'Initial clearance obtained' },
            { id: 'c-eg-inspection', label: 'Utility inspection / witnessed commissioning passed' },
            { id: 'c-eg-agreement', label: 'Interconnection agreement executed' },
            { id: 'c-eg-meter', label: 'Utility bi-directional metering commissioned' },
            { id: 'c-eg-accept', label: 'Final written utility acceptance received' },
          ];
          const exportReq = _gc(area, 'c-eg-exportreq');
          const complete = gates.filter(g => _gc(area, g.id));
          const missing = gates.filter(g => !_gc(area, g.id));
          const pass = exportReq && missing.length === 0;
          result.innerHTML = _steps([
            'Compliance gate: parallel operation/export only after utility acceptance and agreement completion.',
            `Step 1: Export request present -> ${exportReq ? 'YES' : 'NO'}`,
            ...gates.map((g, idx) => `Step ${idx + 2}: ${g.label} -> ${_gc(area, g.id) ? 'YES' : 'NO'}`),
            missing.length ? `Missing gates: ${missing.map(m => m.label).join('; ')}` : 'All mandatory gates complete.',
            pass ? 'Export enable condition satisfied.' : 'Keep export disabled until all gates are complete and accepted by utility.',
          ], pass ? 'EXPORT ON PERMITTED' : 'EXPORT MUST REMAIN OFF', pass ? 'alert-safe' : 'alert-unsafe');
          break;
        }

        case 'cell_temp_noct': {
          const panelId = _gs(area, 'c-panel');
          const Tamb = _g(area, 'c-tamb');
          const G = _g(area, 'c-girr');
          if (isNaN(Tamb) || isNaN(G)) { result.innerHTML = '<div class="danger-box">Enter ambient temp and irradiance</div>'; break; }
          const NOCT = panelId ? (DB.getById(panelId)||{NOCT:44}).NOCT : 44;
          const Tcell = PVCalc.cellTemp(Tamb, NOCT, G);
          result.innerHTML = _steps([
            `IEC 61853 / IEC 61215 Formula: T_cell = T_amb + (NOCT − 20) ÷ 800 × G`,
            `Step 1: NOCT = ${NOCT}°C (from module datasheet)`,
            `Step 2: T_amb = ${Tamb}°C`,
            `Step 3: G = ${G} W/m²`,
            `Step 4: (NOCT − 20) ÷ 800 = (${NOCT} − 20) ÷ 800 = ${((NOCT-20)/800).toFixed(4)} °C·m²/W`,
            `Step 5: Temperature rise = ${((NOCT-20)/800).toFixed(4)} × ${G} = ${((NOCT-20)/800*G).toFixed(1)} °C`,
            `Step 6: T_cell = ${Tamb} + ${((NOCT-20)/800*G).toFixed(1)} = ${Tcell.toFixed(1)} °C`,
            `Note: NOCT test conditions = 800 W/m², 20°C ambient, 1 m/s wind`
          ], `T_cell = ${Tcell.toFixed(1)} °C`, Tcell > 70 ? 'alert-unsafe' : Tcell > 55 ? 'alert-warn' : 'alert-safe');
          break;
        }

        case 'linear_degradation': {
          const P0 = _g(area, 'c-p0');
          const LID = _g(area, 'c-lid') / 100;
          const d = _g(area, 'c-drate') / 100;
          const n = _g(area, 'c-nyear');
          if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const P1 = P0 * (1 - LID);
          const Pn = P1 - P0 * d * (n - 1);
          const pct = (Pn / P0) * 100;
          const meetsWarranty = pct >= 80;
          // Build year-by-year table for key years
          const keyYears = [1, 5, 10, 15, 20, 25].filter(y => y <= n + 1);
          if (!keyYears.includes(n)) keyYears.push(n);
          keyYears.sort((a,b)=>a-b);
          const tableRows = keyYears.map(y => {
            const py = y === 1 ? P1 : P1 - P0 * d * (y - 1);
            return `Year ${y}: ${py.toFixed(1)} W (${(py/P0*100).toFixed(1)}%)`;
          });
          result.innerHTML = _steps([
            `IEC 61215 / SLS 1553 Linear Formula: P(n) = P₀ × (1 − LID) − P₀ × d × (n − 1)`,
            `Step 1: P₀ = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/year, n = ${n}`,
            `Step 2: Year 1 output after LID: P₁ = ${P0} × (1 − ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
            `Step 3: Annual loss = P₀ × d = ${P0} × ${(d*100).toFixed(2)}% = ${(P0*d).toFixed(2)} W/year`,
            `Step 4: After ${n} years: P(${n}) = ${P1.toFixed(2)} − ${(P0*d).toFixed(2)} × (${n} − 1)`,
            `         = ${P1.toFixed(2)} − ${(P0*d*(n-1)).toFixed(2)} = ${Pn.toFixed(2)} W`,
            `Step 5: Retention = ${Pn.toFixed(2)} ÷ ${P0} × 100 = ${pct.toFixed(1)}%`,
            `── Year-by-year output ──`,
            ...tableRows,
            `SLS 1553 / 25-year warranty minimum: 80%`,
            meetsWarranty ? `${pct.toFixed(1)}% ≥ 80% at Year ${n} → ✓ Within warranty` : `${pct.toFixed(1)}% < 80% at Year ${n} → ✗ Below warranty threshold`
          ], `Year ${n}: ${Pn.toFixed(1)} W — ${pct.toFixed(1)}% of P₀ — ${meetsWarranty?'✓ OK':'✗ Below 80%'}`, meetsWarranty?'alert-safe':'alert-unsafe');
          break;
        }

        case 'compound_degradation': {
          const P0 = _g(area, 'c-p0');
          const LID = _g(area, 'c-lid') / 100;
          const d = _g(area, 'c-drate') / 100;
          const n = _g(area, 'c-nyear');
          if (isNaN(P0) || isNaN(LID) || isNaN(d) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const P1 = P0 * (1 - LID);
          const Pn = P1 * Math.pow(1 - d, n - 1);
          const pct = (Pn / P0) * 100;
          const meetsWarranty = pct >= 80;
          const keyYears = [1, 5, 10, 15, 20, 25].filter(y => y <= n + 1);
          if (!keyYears.includes(n)) keyYears.push(n);
          keyYears.sort((a,b)=>a-b);
          const tableRows = keyYears.map(y => {
            const py = P1 * Math.pow(1 - d, y - 1);
            return `Year ${y}: ${py.toFixed(1)} W (${(py/P0*100).toFixed(1)}%)`;
          });
          result.innerHTML = _steps([
            `Compound Formula: P(n) = P₀ × (1 − LID) × (1 − d)^(n−1)`,
            `Step 1: P₀ = ${P0} W, LID = ${(LID*100).toFixed(2)}%, d = ${(d*100).toFixed(2)}%/year, n = ${n}`,
            `Step 2: Year 1 after LID: P₁ = ${P0} × (1 − ${(LID*100).toFixed(2)}%) = ${P1.toFixed(2)} W`,
            `Step 3: Compound factor = (1 − ${(d*100).toFixed(2)}%)^(${n}−1) = ${(1-d).toFixed(5)}^${n-1} = ${Math.pow(1-d,n-1).toFixed(5)}`,
            `Step 4: P(${n}) = ${P1.toFixed(2)} × ${Math.pow(1-d,n-1).toFixed(5)} = ${Pn.toFixed(2)} W`,
            `Step 5: Retention = ${Pn.toFixed(2)} ÷ ${P0} × 100 = ${pct.toFixed(1)}%`,
            `── Year-by-year output ──`,
            ...tableRows,
            `Compound vs Linear difference at Year ${n}: ${Math.abs(Pn - (P1 - P0*d*(n-1))).toFixed(1)} W (compound is slightly ${Pn > (P1-P0*d*(n-1)) ? 'higher' : 'lower'})`,
            meetsWarranty ? `${pct.toFixed(1)}% ≥ 80% at Year ${n} → ✓ Within warranty` : `${pct.toFixed(1)}% < 80% → ✗ Below 80%`
          ], `Year ${n}: ${Pn.toFixed(1)} W — ${pct.toFixed(1)}% of P₀ — ${meetsWarranty?'✓ OK':'✗ Below 80%'}`, meetsWarranty?'alert-safe':'alert-unsafe');
          break;
        }

        case 'warranty_check': {
          const P0 = _g(area, 'c-p0');
          const Pm = _g(area, 'c-pmeas');
          const n = _g(area, 'c-nyear');
          const wg = _g(area, 'c-wguarant');
          if (isNaN(P0) || isNaN(Pm) || isNaN(n)) { result.innerHTML = '<div class="danger-box">Enter P₀, current power, and age</div>'; break; }
          const actual_pct = (Pm / P0) * 100;
          const guarantee_pct = isNaN(wg) ? 80 : wg;
          // Linear interpolation of warranty limit at year n (assumes 100% → guarantee_pct over 25 years)
          const warranty_at_n = 100 - (100 - guarantee_pct) * (n / 25);
          const meetsNow = actual_pct >= warranty_at_n;
          const meetsEnd = actual_pct >= guarantee_pct;
          const annualDeg = n > 0 ? ((P0 - Pm) / P0 / n * 100) : 0;
          result.innerHTML = _steps([
            `SLS 1553 / Manufacturer warranty check`,
            `Step 1: Original rated power P₀ = ${P0} W`,
            `Step 2: Current measured power (STC-corrected) = ${Pm} W`,
            `Step 3: System age = ${n} years`,
            `Step 4: Actual retention = ${Pm} ÷ ${P0} × 100 = ${actual_pct.toFixed(1)}%`,
            `Step 5: Effective annual degradation rate = (${P0} − ${Pm}) ÷ ${P0} ÷ ${n} years = ${annualDeg.toFixed(3)}%/year`,
            `Step 6: Linear warranty limit at Year ${n} (interpolated to ${guarantee_pct}% at Year 25):`,
            `         = 100% − (100 − ${guarantee_pct}%) × ${n}/25 = ${warranty_at_n.toFixed(1)}%`,
            meetsNow ? `${actual_pct.toFixed(1)}% ≥ ${warranty_at_n.toFixed(1)}% → ✓ Currently within warranty limits` : `${actual_pct.toFixed(1)}% < ${warranty_at_n.toFixed(1)}% → ✗ Below warranty limit at Year ${n}`,
            `Projected at Year 25 (at current rate): ${(100 - annualDeg * 25).toFixed(1)}% — ${(100-annualDeg*25)>=80?'✓ Should meet 80% target':'✗ May not meet 80% target'}`
          ], meetsNow ? `✓ ${actual_pct.toFixed(1)}% — Warranty OK at Year ${n}` : `✗ ${actual_pct.toFixed(1)}% — Below warranty at Year ${n}`, meetsNow?'alert-safe':'alert-unsafe');
          break;
        }

        case 'inverter_sizing': {
          const Pdc = _g(area, 'c-pdc');
          const Pac = _g(area, 'c-pac');
          if (isNaN(Pdc) || isNaN(Pac)) { result.innerHTML = '<div class="danger-box">Enter both values</div>'; break; }
          const ratio = Pac / Pdc;
          const P_ac_min = 0.85 * Pdc;
          const pass = ratio >= 0.80;
          const optimal = ratio >= 0.85 && ratio <= 1.05;
          result.innerHTML = _steps([
            `Sri Lanka / PUCSL guideline: P_inverter_AC ≥ 0.85 × P_array_DC`,
            `Step 1: Array DC capacity = ${Pdc} kWp`,
            `Step 2: Inverter AC rating = ${Pac} kW`,
            `Step 3: Minimum required AC rating = 0.85 × ${Pdc} = ${P_ac_min.toFixed(2)} kW`,
            `Step 4: AC/DC ratio = ${Pac} ÷ ${Pdc} = ${ratio.toFixed(3)} (${(ratio*100).toFixed(1)}%)`,
            ratio < 0.80 ? `Ratio ${(ratio*100).toFixed(1)}% < 80% → ✗ Inverter significantly undersized — excessive clipping losses` :
            ratio <= 0.85 ? `Ratio ${(ratio*100).toFixed(1)}% — Borderline. Marginally undersized, minor clipping. Acceptable if DC/AC ratio intentional.` :
            ratio <= 1.05 ? `Ratio ${(ratio*100).toFixed(1)}% — ✓ Optimal sizing range (85–105%)` :
            `Ratio ${(ratio*100).toFixed(1)}% > 105% — Inverter oversized. Check cost justification.`,
            `Typical accepted range in Sri Lanka: 0.85–1.00 (inverter lightly undersized is common practice)`
          ], pass ? `✓ AC/DC Ratio: ${(ratio*100).toFixed(1)}% — ${optimal?'Optimal':'Acceptable'}` : `✗ Inverter Undersized — ${(ratio*100).toFixed(1)}%`, pass?(optimal?'alert-safe':'alert-warn'):'alert-unsafe');
          break;
        }

        case 'cable_vdrop': {
          const L = _g(area, 'c-vdl');
          const I = _g(area, 'c-vdi');
          const A = _g(area, 'c-vda');
          const Vn = _g(area, 'c-vdvn');
          const side = _gs(area, 'c-vdside');
          if (isNaN(L) || isNaN(I) || isNaN(A) || isNaN(Vn)) { result.innerHTML = '<div class="danger-box">Enter all values</div>'; break; }
          const rho = 0.0172; // copper Ω·mm²/m
          const VD = (2 * L * I * rho) / A;
          const VD_pct = (VD / Vn) * 100;
          const limit = side === 'dc' ? 1.0 : 3.0;
          const pass = VD_pct <= limit;
          result.innerHTML = _steps([
            `IEC 60364-7-712 / SLS 1522 Formula: VD = (2 × L × I × ρ) ÷ A`,
            `ρ (copper resistivity) = ${rho} Ω·mm²/m`,
            `Step 1: Cable length one-way L = ${L} m → total circuit length = 2 × ${L} = ${2*L} m`,
            `Step 2: Current I = ${I} A`,
            `Step 3: Cable cross-section A = ${A} mm²`,
            `Step 4: VD = (2 × ${L} × ${I} × ${rho}) ÷ ${A}`,
            `         = ${(2*L*I*rho).toFixed(4)} ÷ ${A}`,
            `         = ${VD.toFixed(3)} V`,
            `Step 5: Nominal voltage = ${Vn} V`,
            `Step 6: VD% = (${VD.toFixed(3)} ÷ ${Vn}) × 100 = ${VD_pct.toFixed(2)}%`,
            `Limit for ${side === 'dc' ? 'DC string' : 'AC side'} cables = ${limit}%`,
            pass ? `${VD_pct.toFixed(2)}% ≤ ${limit}% → ✓ Within limit` : `${VD_pct.toFixed(2)}% > ${limit}% → ✗ Exceeds limit — increase cable CSA`
          ], pass ? `✓ VD = ${VD.toFixed(2)} V (${VD_pct.toFixed(2)}%)` : `✗ VD too high: ${VD.toFixed(2)} V (${VD_pct.toFixed(2)}% > ${limit}%)`, pass?'alert-safe':'alert-unsafe');
          break;
        }

        case 'cable_selector_adv': {
          const systemType = _gs(area, 'c-cs-system') || 'dc';
          const cableConstruction = _gs(area, 'c-cs-construction') || 'multi_core_non_armoured';
          const material = _gs(area, 'c-cs-mat') || 'cu';
          const insulation = _gs(area, 'c-cs-ins') || 'xlpe';
          const installMethod = _gs(area, 'c-cs-install') || 'closed_tube';
          const ambient_C = _g(area, 'c-cs-temp');
          const groundTemp_C = _g(area, 'c-cs-gtemp');
          const groupedCircuits = _g(area, 'c-cs-group');
          const buriedSpacing = _gs(area, 'c-cs-bspacing') || 'touching';
          const lengthOneWay_m = _g(area, 'c-cs-l');
          const nominal_V = _g(area, 'c-cs-v');
          const current_A = _g(area, 'c-cs-i');
          const load_kW = _g(area, 'c-cs-p');
          const powerFactor = _g(area, 'c-cs-pf');
          const continuousFactor = _g(area, 'c-cs-cf');
          const dropLimitInput = _g(area, 'c-cs-vdlim');

          if (isNaN(lengthOneWay_m) || isNaN(nominal_V)) {
            result.innerHTML = '<div class="danger-box">Enter at least cable length and nominal voltage</div>';
            break;
          }

          const selector = (typeof StandardsCalc !== 'undefined' && StandardsCalc && typeof StandardsCalc.cableSizeSelector === 'function')
            ? StandardsCalc.cableSizeSelector({
                systemType,
                cableConstruction,
                material,
                insulation,
                installMethod,
                ambient_C,
                groundTemp_C,
                groupedCircuits,
                buriedSpacing,
                lengthOneWay_m,
                nominal_V,
                current_A,
                load_kW,
                powerFactor,
                continuousFactor,
                dropLimit_pct: isNaN(dropLimitInput) ? undefined : dropLimitInput,
              })
            : null;

          if (!selector) {
            result.innerHTML = '<div class="danger-box">Enter load current, or load power + voltage (and PF for AC).</div>';
            break;
          }

          const pass = selector.ampacityPass && selector.vdropPass;
          const cls = pass ? 'alert-safe' : (selector.selectedCSA_mm2 >= 300 ? 'alert-unsafe' : 'alert-warn');
          const sysLabel = systemType === 'ac3p' ? 'AC 3-phase' : (systemType === 'ac1p' ? 'AC 1-phase' : 'DC 2-wire');
          const currentFormula = systemType === 'ac3p'
            ? 'I = P / (sqrt(3) x V x PF)'
            : (systemType === 'ac1p' ? 'I = P / (V x PF)' : 'I = P / V');
          const limitDriver = selector.limitedBy === 'ampacity' ? 'ampacity/thermal limit' : 'voltage-drop limit';
          const coeffText = Number.isFinite(selector.selectedVdropCoeff_mV_per_A_m)
            ? selector.selectedVdropCoeff_mV_per_A_m.toFixed(3)
            : 'N/A';

          result.innerHTML = _steps([
            `System: ${sysLabel}, Material: ${material.toUpperCase()}, Insulation: ${insulation.toUpperCase()}, Install: ${installMethod.replace(/_/g, ' ')}`,
            `Catalogue profile: ${selector.catalogProfileLabel || selector.catalogProfile || 'N/A'} (${selector.tableMethodLabel || 'method N/A'})`,
            `Step 1: Current source = ${selector.currentSource === 'entered_current' ? 'entered current' : `derived from load power using ${currentFormula}`}`,
            `Step 2: I_load = ${selector.I_load_A.toFixed(2)} A`,
            `Step 3: Continuous design current = I_load x factor = ${selector.I_load_A.toFixed(2)} x ${selector.factors.continuousFactor.toFixed(2)} = ${selector.designCurrent_A.toFixed(2)} A`,
            `Step 4: Derating factors -> Temperature=${selector.tempFactor.toFixed(2)} (${selector.tempFactorSource || 'table'}), Grouping=${selector.groupFactor.toFixed(2)} (${selector.groupFactorSource || 'table'})`,
            `Step 5: Required base ampacity = ${selector.designCurrent_A.toFixed(2)} / (${selector.tempFactor.toFixed(2)} x ${selector.groupFactor.toFixed(2)}) = ${selector.requiredBaseAmpacity_A.toFixed(2)} A`,
            `Step 6: Ampacity-driven CSA = ${selector.ampacityRequiredCSA_mm2} mm2`,
            `Step 7: Allowed drop coeff = ${selector.vdropAllowedCoeff_mV_per_A_m.toFixed(3)} mV/A/m, Required CSA by Vdrop = ${selector.requiredAreaByVdrop_mm2.toFixed(2)} mm2 -> standard ${selector.vdropRequiredCSA_mm2} mm2`,
            `Step 8: Recommended standard CSA = ${selector.selectedCSA_mm2} mm2 (driven by ${limitDriver})`,
            `Step 9: With ${selector.selectedCSA_mm2} mm2 -> allowable current = ${selector.selectedAllowableCurrent_A.toFixed(2)} A, voltage drop = ${selector.selectedVdrop_V.toFixed(2)} V (${selector.selectedVdrop_pct.toFixed(2)}%), coeff = ${coeffText} mV/A/m`,
            `Ampacity check: ${selector.selectedAllowableCurrent_A.toFixed(2)} A ${selector.ampacityPass ? '>=' : '<'} ${selector.designCurrent_A.toFixed(2)} A -> ${selector.ampacityPass ? 'PASS' : 'FAIL'}`,
            `Voltage-drop check: ${selector.selectedVdrop_pct.toFixed(2)}% ${selector.vdropPass ? '<=' : '>'} ${selector.dropLimit_pct.toFixed(2)}% -> ${selector.vdropPass ? 'PASS' : 'FAIL'}`,
            ...((selector.sourceRefs || []).map((x, idx) => `Catalogue ref ${idx + 1}: ${x}`)),
            ...((selector.warnings || []).map((x, idx) => `Warning ${idx + 1}: ${x}`)),
            ...selector.standardsChecklist.map((s, idx) => `Standards note ${idx + 1}: ${s}`),
          ], `Recommended Cable: ${selector.selectedCSA_mm2} mm2 (${material.toUpperCase()}, ${sysLabel})`, cls);
          break;
        }

        case 'dc_fuse_sizing': {
          const panelId = _gs(area, 'c-panel');
          const fuseR = _g(area, 'c-fuse-r');
          if (!panelId) { result.innerHTML = '<div class="danger-box">Select module</div>'; break; }
          const p = DB.getById(panelId);
          const I_min = 1.25 * 1.25 * p.Isc;
          const I_max = isNaN(fuseR) ? null : fuseR;
          const stdFuses = [10, 12, 15, 16, 20, 25, 30, 32];
          const candidates = stdFuses.filter(f => f >= I_min && (I_max === null || f <= I_max));
          result.innerHTML = _steps([
            `IEC 62548-1 / SLS 1522 Formula: I_fuse = 1.25 × 1.25 × Isc`,
            `Module: ${p.manufacturer} ${p.model}, Isc = ${p.Isc} A`,
            `Step 1: First 1.25 factor — continuous current derating (IEC 60364-7-712)`,
            `         I_cont = 1.25 × ${p.Isc} = ${(1.25*p.Isc).toFixed(2)} A`,
            `Step 2: Second 1.25 factor — fault tolerance / safety margin (IEC 62548-1)`,
            `         I_fuse_min = 1.25 × ${(1.25*p.Isc).toFixed(2)} = ${I_min.toFixed(2)} A`,
            `Step 3: Maximum fuse rating = Series Fuse Rating on module label = ${I_max !== null ? I_max + ' A' : 'not entered'}`,
            `Step 4: Select standard fuse ≥ ${I_min.toFixed(1)} A${I_max ? ' and ≤ ' + I_max + ' A' : ''}`,
            candidates.length > 0 ? `Suitable standard fuses: ${candidates.join('A, ')}A` : `No standard fuse fits — check module Series Fuse Rating is entered correctly`,
          ], candidates.length > 0 ? `Fuse: ${candidates[0]}A (minimum suitable)` : `Check Series Fuse Rating`, candidates.length>0?'alert-warn':'alert-unsafe');
          break;
        }

        default:
          result.innerHTML = '<div class="text-muted">Calculator not implemented.</div>';
      }
    } catch (e) {
      result.innerHTML = `<div class="danger-box">Error: ${_esc(e && e.message ? e.message : 'Unknown error')}</div>`;
    }
  }

  return { render };
})();


