/** Accessible input/review components shared by design and utility workflows. */
const DirectiveUI = (() => {
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const defaults = {connection:'grid_export',phase:3,category:'residential',performanceClass:'standard',rtePct:90,tMinC:10,tCellMaxC:70,cycleDod:'',cycleRate:'',retentionPct:'',applicant:'new_pv',scheme:'net_accounting'};
  function field(prefix,key,label,value='',hint='',type='number',attrs='') {
    return `<div class="form-group"><label class="form-label" for="${prefix}-${key}">${esc(label)}</label><input class="form-input" id="${prefix}-${key}" data-rule="${key}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''} ${attrs}/>${hint?`<div class="form-hint">${esc(hint)}</div>`:''}</div>`;
  }
  function select(prefix,key,label,options,value) {
    return `<div class="form-group"><label class="form-label" for="${prefix}-${key}">${esc(label)}</label><select class="form-select" id="${prefix}-${key}" data-rule="${key}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
  }
  function form(prefix,s={}) {
    const projectType=typeof App!=='undefined'&&App.getProject?App.getProject().systemType:'';
    const p={...defaults,installation:projectType==='ground-mount'?'ground':'rooftop',...s};
    return `<section class="card directive-form" id="${prefix}-rules" aria-label="Sri Lanka 2026 design requirements">
      <div class="directive-heading"><div><p class="eyebrow">SRI LANKA · RULESET ${DirectiveRules.VERSION}</p><h2>Design conditions & evidence</h2></div><span class="status-badge badge-warn">Approval evidence required</span></div>
      <p class="directive-lead">Automatic design checks use the July/August framework, August feed-in decision and October BESS standards. Unknown data stays marked for review. Documentary checks record your evidence; they do not confer utility approval.</p>
      <div class="form-row cols-2">
        ${select(prefix,'installation','Installation scope',[['rooftop','Rooftop RTSPV'],['ground','Ground-mounted power plant'],['floating','Floating PV power plant']],p.installation)}
        ${field(prefix,'inverterCount','Identical inverter units',p.inverterCount??1,'Selected model rating × units gives aggregate continuous power.','number','min="1"')}
        ${field(prefix,'batteryUnits','Battery units / stacks',p.batteryUnits??1,'Keep each OEM-supported battery grouping and controller configuration.','number','min="1"')}
        ${prefix==='sd-policy'?'':field(prefix,'installedUsableKwh','Manufacturer-declared INSTALLED usable battery energy (kWh)',p.installedUsableKwh??'','Total installed usable energy, not the calculator’s required energy target. Leave unknown if only V × Ah × DoD is available.','number','min="0"')}
        ${select(prefix,'connection','Operating arrangement',[['grid_export','Grid connected · export'],['zero_export','Grid connected · zero export'],['offgrid','Fully isolated off-grid']],p.connection)}
        ${select(prefix,'phase','Grid / inverter phases',[[1,'Single-phase'],[3,'Three-phase']],p.phase)}
        ${select(prefix,'category','BESS installation category',[['residential','Residential'],['commercial','Commercial'],['industrial','Industrial']],p.category)}
        ${field(prefix,'approvedExportKW','Contracted / approved AC export (kW)',p.approvedExportKW??'','Use the clearance capacity, not PV DC kWp. Set 0 for zero export.','number','min="0"')}
        ${field(prefix,'mountHeightM','PV support height ABOVE the roof (m)',p.mountHeightM??'','More than 1 m above the roof requires structural certification.','number','min="0"')}
      </div>
      <label class="checkbox-item"><input type="checkbox" data-rule="roofSlab" ${p.roofSlab?'checked':''}/> Roof-slab installation (structural certification required)</label>
      <details class="directive-details"><summary>PV string design and battery performance evidence</summary>
        <p class="form-hint">Supply manufacturer declarations and test conditions. Efficiency is a planning input until supported by the evidence pack. Cell Wh/kg is distinct from pack energy divided by pack weight.</p>
        <div class="form-row cols-2">
          ${prefix==='sd-policy'?select(prefix,'chemistry','Manually specified battery chemistry',[['unknown','Not declared'],['lifepo4','Lithium iron phosphate (LFP)'],['li-ion','Other lithium-ion'],['leadacid','Lead-acid / separate scope'],['nimh','NiMH / separate scope']],p.chemistry||'unknown'):''}
          ${field(prefix,'modulesPerString','Modules per string',p.modulesPerString??'','','number','min="1" step="1"')}
          ${field(prefix,'stringsPerMppt','Strings per MPPT',p.stringsPerMppt??1,'Layout assumes all selected inverter MPPTs use the same string arrangement.','number','min="1"')}
          ${field(prefix,'mpptsUsed','Total MPPTs used across inverter units',p.mpptsUsed??'','Only count trackers with the entered string layout.','number','min="1"')}
          ${field(prefix,'tMinC','Coldest site temperature (°C)',p.tMinC)}
          ${field(prefix,'tCellMaxC','Maximum cell temperature (°C)',p.tCellMaxC)}
          ${field(prefix,'batteryMinV','Battery lower operating voltage (V)',p.batteryMinV??'')}
          ${field(prefix,'batteryMaxV','Battery upper operating voltage (V)',p.batteryMaxV??'')}
          ${field(prefix,'batteryVoltage','Manufacturer-declared nominal battery voltage (V)',p.batteryVoltage??'','Leave unknown when the reference does not declare it. Interface ranges do not establish a nominal cell/pack voltage.')}
          ${field(prefix,'batteryIP','Battery pack IP rating',p.batteryIP??'','Example: IP54; use pack/module enclosure rating.','text')}
          ${select(prefix,'performanceClass','Battery performance class',[['standard','Standard · ≥85% RTE'],['premium','Premium · ≥90% RTE']],p.performanceClass)}
          ${field(prefix,'rtePct','Battery round-trip efficiency (%)',p.rtePct,'Separate from inverter conversion efficiency.','number','min="1" max="100"')}
          ${field(prefix,'cycles','Certified cycle life (cycles)',p.cycles??'','6000 residential; 8000 commercial/industrial at specified test conditions.','number','min="1"')}
          ${field(prefix,'cycleDod','Cycle-test depth of discharge (%)',p.cycleDod)}
          ${field(prefix,'cycleRate','Cycle-test charge/discharge rate (C)',p.cycleRate)}
          ${field(prefix,'retentionPct','Capacity retained at end of test (%)',p.retentionPct)}
          ${field(prefix,'testTempC','Certified performance-test ambient (°C)',p.testTempC??'','Specification test ambient is 25±5°C unless the authority specifies otherwise.')}
          ${field(prefix,'cellDensity','Certified CELL energy density (Wh/kg)',p.cellDensity??'','Minimum 150 Wh/kg, supported by an accredited cell report.')}
          ${field(prefix,'logMonths','On-site telemetry retention (months)',p.logMonths??'','At least 12 months of parameters, events and alarms.')}
          ${field(prefix,'chargeKW','Battery charging power limit (kW)',p.chargeKW??'','Use the lowest continuous inverter/battery limit.')}
          ${field(prefix,'dischargeKW','Battery discharging power limit (kW)',p.dischargeKW??'','Use the lowest continuous inverter/battery limit.')}
        </div>
        <label class="checkbox-item"><input type="checkbox" data-rule="repurposed" ${p.repurposed?'checked':''}/> Repurposed / second-life battery</label>
      </details>
      <details class="directive-details"><summary>Engineer-reviewed exceptions</summary>
        <label class="checkbox-item"><input type="checkbox" data-rule="energyException" ${p.energyException?'checked':''}/> Written Chartered Electrical Engineer assessment for energy above 5 × continuous inverter kW</label>
        ${field(prefix,'exceptionRef','Energy-ratio assessment reference',p.exceptionRef??'','The report records the exception for review; a checkbox does not approve it.','text')}
        <label class="checkbox-item"><input type="checkbox" data-rule="phaseException" ${p.phaseException?'checked':''}/> DL / Commission alternative for a BESS above 7 kW on single-phase</label>
        ${field(prefix,'phaseExceptionRef','Phase alternative approval reference',p.phaseExceptionRef??'','','text')}
      </details>
      <details class="directive-details"><summary>Documentary evidence & commissioning</summary>
        ${field(prefix,'evidenceRef','Evidence-pack / inspection reference',p.evidenceRef??'','Use a document-pack or review reference. Model certificates must cover the exact selected equipment.','text')}
        ${field(prefix,'dlSettingsRef','DL-approved protection / control schedule reference',p.dlSettingsRef??'','Reference the actual approved schedule. The legacy 2025 numeric profiles are not treated as new approvals.','text')}
        <div class="directive-evidence">${DirectiveRules.EVIDENCE.map(e=>`<label class="checkbox-item"><input type="checkbox" data-evidence="${e.key}" ${p.evidence?.[e.key]?'checked':''}/><span>${esc(e.label)}<small>${esc(DirectiveRules.SOURCES[e.source].title)} · ${esc(e.clause)}</small></span></label>`).join('')}
          <label class="checkbox-item"><input type="checkbox" data-evidence="exportLimiter" ${p.evidence?.exportLimiter?'checked':''}/><span>Export limiter, dynamic management and utility-accessible control verified<small>Technical specification 3.5</small></span></label>
          <label class="checkbox-item"><input type="checkbox" data-evidence="gridFunctions" ${p.evidence?.gridFunctions?'checked':''}/><span>Fitted LVRT, AFCI, Volt-VAR and Volt-Watt functions verified<small>Technical specification 3.2.2; optional OEM features need confirmation</small></span></label>
          <label class="checkbox-item"><input type="checkbox" data-evidence="telemetryHardware" ${p.evidence?.telemetryHardware?'checked':''}/><span>Communication hardware and utility monitoring/control capability verified for BESS above 50 kW<small>Technical specification 3.5; a fallback arrangement does not replace hardware capability</small></span></label>
          <label class="checkbox-item"><input type="checkbox" data-evidence="structuralCertified" ${p.evidence?.structuralCertified?'checked':''}/><span>Structural certification for roof-slab or supports more than 1 m above roof level<small>Interconnection 4.19-4.20</small></span></label>
        </div>
      </details>
      <div class="directive-source-link"><a href="${DirectiveRules.SOURCES.framework.url}" target="_blank" rel="noopener noreferrer">PUCSL framework & technical specification ↗</a><a href="${DirectiveRules.SOURCES.standards.url}" target="_blank" rel="noopener noreferrer">October BESS standards ↗</a></div>
    </section>`;
  }
  function read(container,prefix) {
    const root=container.querySelector(`#${prefix}-rules`), p={evidence:{}};
    if (!root) return p;
    root.querySelectorAll('[data-rule]').forEach(el=>p[el.dataset.rule]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value);
    root.querySelectorAll('[data-evidence]').forEach(el=>p.evidence[el.dataset.evidence]=el.checked);
    return p;
  }
  function updateModel(container,prefix,kind,model) {
    const root=container.querySelector(`#${prefix}-rules`); if(!root)return;
    const set=(k,v)=>{const el=root.querySelector(`[data-rule="${k}"]`);if(el&&v!==undefined&&v!==null)el.value=v;};
    // A new model invalidates declarations about the previous model.
    root.querySelectorAll('[data-evidence]').forEach(el=>{if(el.dataset.evidence!=='providerRegistered')el.checked=false;});
    if(kind==='inverter'&&model) {set('inverterCount',1);set('mpptsUsed',model.mpptCount);set('phase',model.phase||3);set('chargeKW',model.acRated_kW);set('dischargeKW',model.acRated_kW);}
    if(kind==='battery') {set('batteryUnits',1);for(const k of ['batteryMinV','batteryMaxV','batteryVoltage','batteryIP','cycles','cellDensity','cycleDod','cycleRate','retentionPct'])set(k,'');if(model){const phase=Number(root.querySelector('[data-rule="phase"]')?.value);set('batteryMinV',phase===3?(model.batteryMin3V||model.batteryMinV||''):(model.batteryMinV||''));set('batteryMaxV',phase===3?(model.batteryMax3V||model.batteryMaxV||''):(model.batteryMaxV||''));set('batteryVoltage',phase===3?(model.nominalV3??model.nominalV??''):(model.nominalV??''));set('batteryIP',model.ipRating);set('chargeKW',model.maxPower_kW||model.continuousCharge_A*model.nominalV/1000||'');set('dischargeKW',model.maxPower_kW||model.continuousDischarge_A*model.nominalV/1000||'');}}
  }
  function sourceLabel(key,clause='') {const s=DirectiveRules.SOURCES[key];return s?`${s.url?`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`:esc(s.title)}${clause?` · ${esc(clause)}`:''}`:esc(key);}
  function review(result) {
    if(!result)return'';
    const c=result.counts, label=result.status==='blocked'?'Design blockers':result.status==='review'?'Engineering review required':'Recorded checks complete';
    return `<section class="card directive-review"><div class="directive-heading"><div><p class="eyebrow">DESIGN REVIEW · ${esc(result.version)}</p><h2>${label}</h2></div><span class="status-badge ${c.fail?'badge-fail':c.review?'badge-warn':'badge-pass'}">${c.fail} blockers · ${c.review} to review</span></div><div class="directive-review-metrics"><span><strong>${c.pass}</strong> Checks passed</span><span><strong>${c.fail}</strong> Failed limits</span><span><strong>${c.review}</strong> Need evidence / review</span></div><p class="form-hint">Checks use the entered values and declared evidence. Utility acceptance and signed engineering certification remain separate requirements.</p><div class="table-scroll" tabindex="0" role="region" aria-label="2026 directive checks"><table class="status-table"><thead><tr><th>Check</th><th>Entered / calculated</th><th>Requirement</th><th>Result</th></tr></thead><tbody>${result.checks.map(r=>`<tr><td><strong>${esc(r.label)}</strong><small class="rule-source">${sourceLabel(r.source,r.clause)}</small></td><td>${esc(r.actual)}</td><td>${esc(r.target)}${r.note?`<small class="rule-source">${esc(r.note)}</small>`:''}</td><td><span class="status-badge ${r.status==='pass'?'badge-pass':r.status==='fail'?'badge-fail':'badge-warn'}">${r.status==='review'?'REVIEW':r.status.toUpperCase()}</span></td></tr>`).join('')}</tbody></table></div>${result.advisory.map(a=>`<div class="info-box mt-12">${esc(a.note)}<small class="rule-source">${sourceLabel(a.source,a.clause)}</small></div>`).join('')}</section>`;
  }
  function tariffForm(prefix,s={}) {
    const projectType=typeof App!=='undefined'&&App.getProject?App.getProject().systemType:'';
    return `<section class="card directive-tariff" id="${prefix}-tariff"><div class="directive-heading"><div><p class="eyebrow">FEED-IN DECISION · EFFECTIVE 25 AUG 2026</p><h2>Scheme & tariff eligibility</h2></div></div><div class="form-row cols-2">
      ${select(prefix,'installation','Tariff installation class',[['rooftop','Rooftop prosumer'],['ground','Ground-mounted power plant'],['floating','Floating PV power plant']],s.installation|| (projectType==='ground-mount'?'ground':'rooftop'))}
      ${select(prefix,'billingClass','Service / billing class',[['retail','Retail monthly net / BESS'],['bulk','Bulk PV-only · daytime metering']],s.billingClass||'retail')}
      ${select(prefix,'scheme','Commercial settlement',[['net_metering','Net metering · unit banking'],['net_accounting','Net accounting · eligible surplus'],['net_plus','Net Plus · gross generation export'],['zero_export','Zero export · self-consumption']],s.scheme||'net_accounting')}
      ${select(prefix,'applicant','Agreement category',[['new_pv','New rooftop PV'],['new_bess','New rooftop PV + BESS'],['retrofit_bess','Existing rooftop PV · BESS retrofit'],['legacy','Existing / earlier signed SPPA']],s.applicant||'new_pv')}
      ${field(prefix,'capacityKW','Contracted AC capacity for tariff band (kW)',s.capacityKW??'','Separate from DC array kWp.','number','min="0"')}
      ${field(prefix,'clearanceDate','Grid-clearance issue date',s.clearanceDate??'','','date')}
      ${field(prefix,'existingRate','Existing signed-SPPA rate (LKR/kWh)',s.existingRate??'','Required for existing agreements and BESS retrofit.','number','min="0"')}
      ${field(prefix,'remainingYears','Unexpired existing-SPPA years',s.remainingYears??'','BESS retrofit is limited to the unexpired associated agreement.','number','min="0"')}
      ${field(prefix,'usableKwh','Installed usable BESS energy for tariff (kWh)',s.usableKwh??'','Declare installed usable energy. System Designer uses its selected battery energy; this field supports standalone financial inputs.','number','min="0"')}
    </div><label class="checkbox-item"><input type="checkbox" data-tariff="clearanceValid" ${s.clearanceValid?'checked':''}/> Written grid clearance is currently valid</label><label class="checkbox-item"><input type="checkbox" data-tariff="clearanceExtended" ${s.clearanceExtended?'checked':''}/> Clearance was extended (requires original / extension tariff review)</label><label class="checkbox-item"><input type="checkbox" data-tariff="taxConcession" ${s.taxConcession?'checked':''}/> Bonded Warehouse tax concession verified for >250 to 1000 kW BESS band</label><p class="form-hint">Priority export: 17:30–21:30, subject to Commission changes. BESS tariffs are not provided at or below 250 kW in this decision. Net metering does not pay cash for surplus. Physical two-meter arrangements do not remove the selected commercial scheme.</p><div id="${prefix}-tariff-preview"></div></section>`;
  }
  function readTariff(container,prefix) {
    const root=container.querySelector(`#${prefix}-tariff`),r={};if(!root)return r;
    root.querySelectorAll('[data-rule]').forEach(el=>r[el.dataset.rule]=el.type==='number'?(el.value===''?null:Number(el.value)):el.value);
    root.querySelectorAll('[data-tariff]').forEach(el=>r[el.dataset.tariff]=el.checked);
    return r;
  }
  function tariffSummary(t,revenue) {
    return `<div class="info-box mt-12"><strong>${t.status==='eligible'?'Tariff basis identified':t.status==='unavailable'?'BESS priority tariff unavailable':'Tariff eligibility needs review'}</strong><p>${t.baseRate===null?'No automatic payable rate.':`Other-period rate: LKR ${t.baseRate.toFixed(2)}/kWh${t.priorityRate!==t.baseRate?`; priority rate: LKR ${t.priorityRate?.toFixed(2)}/kWh (first ${t.priorityYears} years)`:''}.`}</p>${t.plantComponents?`<p>Reference power-plant components (LKR/kWh): other ${t.plantComponents.base} non-escalable + ${t.plantComponents.om} O&M; PV+BESS priority ${t.plantComponents.priorityBase} non-escalable + ${t.plantComponents.priorityOm} O&M. These are not substituted for rooftop rates.</p>`:''}${t.exportCapPer30Days!==null?`<p>Payable BESS export cap: ${Number(t.exportCapPer30Days).toLocaleString('en-LK')} kWh per 30 days (${t.capacityKW} × 123). Calendar-month model scales this by days/30; actual billing-cycle data governs settlement.</p>`:''}${t.messages.map(m=>`<p>${esc(m)}</p>`).join('')}${revenue?.amount!==null&&revenue?.amount!==undefined?`<p><strong>Estimated year-1 export income: LKR ${Math.round(revenue.amount).toLocaleString('en-LK')}</strong> · unpaid above cap: ${revenue.unpaidKwh.toFixed(1)} kWh.</p>${revenue.method?`<p>${esc(revenue.method)}</p>`:''}`:''}<small class="rule-source">${sourceLabel('tariffs','pp. 1-2')}; ${sourceLabel('decision','pp. 8-9 / Annex 3')}; ${sourceLabel('schemes')}</small></div>`;
  }
  function sources() {
    return `<section class="card directive-source-guide"><p class="eyebrow">RULESET ${DirectiveRules.VERSION}</p><h2>RTSPV & BESS source guide</h2><div class="info-box mt-12"><strong>SLSI workshop · 16 July 2026</strong><p>Usable energy ≤ 5 × continuous inverter kW. A 5 kW inverter therefore supports up to 25 kWh under the standard criterion; 30 kWh needs a documented engineering assessment.</p><p>The workshop’s 6 kW / 20 kWh / 2 kW export diagram illustrates a proposed approach. Enter the export capacity approved for your site. The published specification and October standards list remain the governing references.</p></div><p class="directive-lead">Regulatory requirements, model-specific references and advisory quality checks have different roles. A brochure, catalogue row or model preset is not a product approval.</p><div class="table-scroll"><table class="status-table"><thead><tr><th>SLS reference</th><th>IEC family</th><th>Applicability</th></tr></thead><tbody>${DirectiveRules.BESS_STANDARDS.map(s=>`<tr>${s.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="form-hint">NiMH and traction-battery standards are not substituted for stationary lithium BESS safety evidence. Repurposing requirements apply only to second-life batteries.</p><details class="directive-details"><summary>Documents, dates and implementation notes</summary>${Object.entries(DirectiveRules.SOURCES).map(([key,s])=>`<p class="directive-source-row">${sourceLabel(key)}<small>${esc(s.kind||'Regulatory / administrative source')} ${esc(s.date||'')} ${s.file?`· ${esc(s.file)}`:''}</small></p>`).join('')}<div class="warn-box">The newer August FIT decision’s 123 kWh/kW per 30-day cap is used for payable exports. The older guideline’s plant-factor/example cap is retained only as a superseded reference. The framework lists the BESS code of practice and final SPPA instruments as pending; the August decision specifies interim agreements. Project-specific DL-approved protection settings govern; 2025 voltage/frequency presets are historical references.</div></details></section>`;
  }
  return {form,read,updateModel,review,tariffForm,readTariff,tariffSummary,sources,defaults};
})();
