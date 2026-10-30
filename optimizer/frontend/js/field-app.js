const $ = id => document.getElementById(id);
let RESULT = null;

const COLORS = {
  ink: "#1f2933",
  muted: "#667085",
  grid: "#d8dee6",
  healthy: "#138a63",
  watch: "#1f7a8c",
  degraded: "#d97706",
  critical: "#c2412d",
  review: "#64748b",
};

const COND_COLORS = {
  Healthy: COLORS.healthy,
  Watch: COLORS.watch,
  Degraded: COLORS.degraded,
  Critical: COLORS.critical,
  "Needs review": COLORS.review,
};

document.addEventListener("DOMContentLoaded", () => {
  $("btn_analyze").addEventListener("click", analyzeUpload);
  $("btn_pdf").addEventListener("click", exportPdf);
  $("btn_json").addEventListener("click", exportJson);
  $("btn_csv").addEventListener("click", exportCsv);
});

async function analyzeUpload(){
  const file = $("file_input").files[0];
  if(!file){
    toast("Select a MI3115 ZIP, PDF, or CSV file.");
    return;
  }
  const fd = new FormData();
  fd.append("file", file);
  ["warning_pct","critical_pct","voltage_warning_pct","current_warning_pct","irradiance_min_wm2","ff_warning_pct"]
    .forEach(id => fd.append(id, numberValue(id)));
  fd.append("warranty_start_date", $("warranty_start_date").value || "");
  fd.append("warranty_first_year_min_pct", numberValue("warranty_first_year_min_pct"));
  fd.append("warranty_annual_degradation_pct", numberValue("warranty_annual_degradation_pct"));
  fd.append("warranty_term_years", numberValue("warranty_term_years"));

  $("btn_analyze").disabled = true;
  $("upload_state").textContent = "Analyzing instrument export...";
  try{
    const res = await fetch("/api/fieldtest/analyze", {method:"POST", body:fd});
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || "Upload analysis failed.");
    RESULT = data;
    render(data);
    $("upload_state").textContent = `${data.summary.records} measurement records loaded.`;
    $("btn_pdf").disabled = false;
    $("btn_json").disabled = false;
    $("btn_csv").disabled = false;
  }catch(err){
    toast(err.message);
    $("upload_state").textContent = "Analysis failed.";
  }finally{
    $("btn_analyze").disabled = false;
  }
}

function render(data){
  $("empty_state").hidden = true;
  $("results").hidden = false;
  const s = data.summary;
  const v = data.validation || {};
  $("page_title").textContent = `${s.source} condition assessment`;
  renderKpis(s, v);
  renderValidation(v);
  renderWarranty(data.module_verdicts || [], data.warranty_model || {});
  renderModuleVerdicts(data.module_verdicts || []);
  renderStringVerdicts(data.string_verdicts || []);
  renderStrings(data.strings || []);
  renderSpecialist(data);
  renderMethodology(data.methodology || {});
  renderRecords(data.records || []);
  drawPowerChart(data.records || [], data.methodology?.thresholds || {});
  drawConditionChart(s.conditions || {});
}

function renderKpis(s, v){
  const moduleVerdicts = RESULT?.module_verdicts || [];
  const degradedModules = moduleVerdicts.filter(m => ["Degraded","Critical"].includes(m.final_verdict)).length;
  const unstableModules = moduleVerdicts.filter(m => ["Review","Unstable"].includes(m.repeatability)).length;
  const cards = [
    kpi("Validation", s.validation_status || "Pending", `${v.mi3115_records || 0}/${v.total_records || s.records} MI3115 records`, "wide"),
    kpi("Final Modules", moduleVerdicts.length, `${degradedModules} degraded/critical`),
    kpi("Repeatability", unstableModules, "assets need retest", unstableModules ? "bad" : "good"),
    kpi("Median PI", value(s.median_performance_pct, "%"), "all corrected records"),
    kpi("IV Curves", s.iv_curves, `${v.iv_curves_with_remote || 0} with remote data`),
    kpi("SolarWorld Match", `${v.solarworld_records || s.solarworld_records || 0}/${v.solarworld_applicable_records || s.solarworld_records || 0}`, "applicable module tests"),
    kpi("Critical", s.conditions?.Critical || 0, "action records", (s.conditions?.Critical || 0) ? "bad" : "good"),
  ];
  $("kpi_grid").innerHTML = cards.join("");
}

function kpi(label, main, sub, cls=""){
  return `<article class="kpi ${cls}">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(main)}</div>
    <div class="kpi-sub">${esc(sub || "")}</div>
  </article>`;
}

function renderValidation(v){
  $("validation_badge").textContent = v.status || "Pending";
  $("validation_badge").className = `status-badge ${v.status === "Validated" ? "ok" : "warn"}`;
  $("validation_sub").textContent = `${v.mi3115_records || 0} MI3115 records, ${v.solarworld_records || 0} SolarWorld module-test matches, ${v.high_confidence_records || 0} high-confidence records`;
  const failed = Object.entries(v.failed_checks || {});
  $("validation_table").innerHTML = `<table>
    <tbody>
      <tr><th>MI3115 records</th><td>${v.mi3115_records || 0} / ${v.total_records || 0}</td></tr>
      <tr><th>SolarWorld profile</th><td>${v.solarworld_records || 0} / ${v.solarworld_applicable_records || 0}</td></tr>
      <tr><th>IV curves with A 1785 remote</th><td>${v.iv_curves_with_remote || 0} / ${v.iv_curve_records || 0}</td></tr>
      <tr><th>High-confidence records</th><td>${v.high_confidence_records || 0}</td></tr>
      <tr><th>Failed checks</th><td>${failed.length ? failed.map(([k,n])=>`${esc(k)}: ${n}`).join("<br>") : "None"}</td></tr>
    </tbody>
  </table>`;
  const warnings = (v.warnings || []).map(w => `<li>${esc(w)}</li>`).join("") || "<li>No specialist validation warnings.</li>";
  $("validation_notes").innerHTML = `<h4>Validation Notes</h4><ol>${warnings}</ol>`;
}

function renderStrings(strings){
  const rows = strings.map(r => `<tr>
    <td>${esc(r.string_id)}</td>
    <td>${r.tests}</td>
    <td>${r.modules}</td>
    <td>${value(r.median_performance_pct, "%")}</td>
    <td>${value(r.min_performance_pct, "%")}</td>
    <td>${condition(r.condition)}</td>
    <td>${esc((r.low_assets || []).join(", ") || "-")}</td>
  </tr>`).join("");
  $("string_table").innerHTML = `<table>
    <thead><tr><th>String</th><th>Tests</th><th>Modules</th><th>Median PI</th><th>Min PI</th><th>Status</th><th>Weak assets</th></tr></thead>
    <tbody>${rows || emptyRow(7)}</tbody>
  </table>`;
}

function renderModuleVerdicts(items){
  const rows = items.map(r => `<tr>
    <td>${esc(r.asset_id)}</td>
    <td>${condition(r.final_verdict)}</td>
    <td>${r.tests}</td>
    <td>${r.iv_curve_tests}</td>
    <td>${r.high_confidence_iv_tests}</td>
    <td>${value(r.median_performance_pct, "%")}</td>
    <td>${value(r.best_performance_pct, "%")}</td>
    <td>${value(r.worst_performance_pct, "%")}</td>
    <td>${value(r.repeatability_spread_pct, " pp")}</td>
    <td>${repeatability(r.repeatability)}</td>
    <td>${confidence(r.confidence_level, r.confidence_score_pct)}</td>
    <td>${warrantyCell(r.solarworld_warranty)}</td>
    <td>${causeList(r.likely_causes)}</td>
    <td>${esc(r.next_action || "-")}</td>
    <td>${flags(r.flags)}</td>
    <td>${basis(r.basis)}</td>
  </tr>`).join("");
  $("module_verdict_table").innerHTML = `<table>
    <thead><tr><th>Module</th><th>Final verdict</th><th>Tests</th><th>IV</th><th>High-conf IV</th><th>Median PI</th><th>Best</th><th>Worst</th><th>Spread</th><th>Repeatability</th><th>Confidence</th><th>Warranty</th><th>Likely cause</th><th>Next action</th><th>Flags</th><th>Basis</th></tr></thead>
    <tbody>${rows || emptyRow(16)}</tbody>
  </table>`;
}

function renderWarranty(items, model){
  const rows = items.map(r => {
    const w = r.solarworld_warranty || {};
    return `<tr>
      <td>${esc(r.asset_id)}</td>
      <td>${condition(r.final_verdict)}</td>
      <td>${esc(w.status || "Start date required")}</td>
      <td>${esc(w.start_date || model.start_date || "-")}</td>
      <td>${esc(w.test_date || "-")}</td>
      <td>${value(w.age_years, " yr")}</td>
      <td>${value(w.warranted_min_pct, "%")}</td>
      <td>${value(w.measured_pi_pct, "%")}</td>
      <td>${value(w.measured_degradation_pct, "%")}</td>
      <td>${value(w.allowed_degradation_pct, "%")}</td>
      <td>${warrantyMargin(w.margin_to_warranty_pct)}</td>
    </tr>`;
  }).join("");
  const notes = (model.notes || []).map(x => `<li>${esc(x)}</li>`).join("");
  $("warranty_table").innerHTML = `<div class="warranty-info">
    <b>${esc(model.source || "SolarWorld warranty model")}</b>
    <span>${esc(model.formula || "")}</span>
    <ol>${notes}</ol>
  </div>
  <table>
    <thead><tr><th>Module</th><th>Verdict</th><th>Warranty status</th><th>Start</th><th>Test date</th><th>Age</th><th>Warranted min</th><th>Measured PI</th><th>Measured degradation</th><th>Allowed degradation</th><th>Margin</th></tr></thead>
    <tbody>${rows || emptyRow(11)}</tbody>
  </table>`;
}

function renderStringVerdicts(items){
  const rows = items.map(r => `<tr>
    <td>${esc(r.asset_id)}</td>
    <td>${condition(r.final_verdict)}</td>
    <td>${r.tests}</td>
    <td>${r.module_count || 0}</td>
    <td>${value(r.median_performance_pct, "%")}</td>
    <td>${value(r.repeatability_spread_pct, " pp")}</td>
    <td>${repeatability(r.repeatability)}</td>
    <td>${confidence(r.confidence_level, r.confidence_score_pct)}</td>
    <td>${causeList(r.likely_causes)}</td>
    <td>${esc(r.next_action || "-")}</td>
    <td>${esc((r.weak_modules || []).join(", ") || "-")}</td>
    <td>${basis(r.basis)}</td>
  </tr>`).join("");
  $("string_verdict_table").innerHTML = `<table>
    <thead><tr><th>String</th><th>Final verdict</th><th>Tests</th><th>Modules</th><th>Median PI</th><th>Spread</th><th>Repeatability</th><th>Confidence</th><th>Likely cause</th><th>Next action</th><th>Weak modules</th><th>Basis</th></tr></thead>
    <tbody>${rows || emptyRow(12)}</tbody>
  </table>`;
}

function renderSpecialist(data){
  const recommendations = (data.recommendations || []).map(x => `<li>${esc(x)}</li>`).join("");
  const weakest = (data.module_verdicts || []).slice(0, 6).map(r =>
    `<li><b>${esc(r.asset_id)}</b> ${condition(r.final_verdict)} ${confidence(r.confidence_level, r.confidence_score_pct)} ${value(r.median_performance_pct, "%")} median PI<br><span>${esc((r.likely_causes || [])[0] || "")}</span></li>`
  ).join("");
  $("specialist_notes").innerHTML = `
    <h4>Recommended Actions</h4><ol>${recommendations}</ol>
    <h4>Weakest Records</h4><ol>${weakest || "<li>No weak assets detected by the configured limits.</li>"}</ol>
    <h4>SolarWorld Interpretation</h4>
    <p>For SW XL 350 mono modules, current loss is treated as the leading signal for soiling, shading, irradiance reference mismatch, cracked cells, or degradation. Voltage loss is treated as the leading signal for module-count, bypass-section, hot-cell, or connection issues. Low fill factor points toward series resistance, connector heating, sweep disturbance, or internal cell damage.</p>`;
}

function renderMethodology(m){
  $("methodology").innerHTML = `
    ${methodBlock("Standards Alignment", m.standards_alignment)}
    ${methodBlock("Assumptions", m.assumptions)}
    ${methodBlock("Formulas", m.formulas)}
    <h4>Thresholds</h4>
    <table><tbody>${Object.entries(m.thresholds || {}).map(([k,v]) => `<tr><th>${esc(k.replaceAll("_"," "))}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
}

function methodBlock(title, items){
  return `<h4>${esc(title)}</h4><ol>${(items || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>`;
}

function renderRecords(records){
  $("record_subtitle").textContent = `${records.length} parsed measurement records`;
  const rows = records.map(r => `<tr>
    <td>${esc(r.asset_id)}</td>
    <td>${esc(r.test_type)}</td>
    <td>${value(r.performance_pct, "%")}</td>
    <td>${value(r.delta_pmpp_pct, "%")}</td>
    <td>${value(r.delta_uoc_pct, "%")}</td>
    <td>${value(r.delta_isc_pct, "%")}</td>
    <td>${value(r.ff_measured_pct, "%")}</td>
    <td>${esc(r.confidence || "-")}</td>
    <td>${condition(r.condition)}</td>
    <td>${flags(r.flags)}</td>
  </tr>`).join("");
  $("record_table").innerHTML = `<table>
    <thead><tr><th>Asset</th><th>Test</th><th>PI</th><th>dP</th><th>dVoc</th><th>dIsc</th><th>FF</th><th>Confidence</th><th>Condition</th><th>Flags</th></tr></thead>
    <tbody>${rows || emptyRow(10)}</tbody>
  </table>`;
}

function drawPowerChart(records, thresholds){
  const rows = records.filter(r => r.performance_pct != null);
  const x = rows.map((r, i) => `${i + 1}. ${r.asset_id}`);
  const y = rows.map(r => r.performance_pct);
  const color = rows.map(r => COND_COLORS[r.condition] || COLORS.review);
  const warn = thresholds.warning_pct || 90;
  const crit = thresholds.critical_pct || 80;
  Plotly.newPlot("power_chart", [
    {type:"bar", x, y, marker:{color}, hovertemplate:"%{x}<br><b>%{y:.1f}%</b><extra></extra>"},
    {type:"scatter", mode:"lines", x, y:x.map(()=>warn), name:"Watch", line:{color:COLORS.degraded, width:2, dash:"dash"}, hoverinfo:"skip"},
    {type:"scatter", mode:"lines", x, y:x.map(()=>crit), name:"Critical", line:{color:COLORS.critical, width:2, dash:"dot"}, hoverinfo:"skip"},
  ], chartLayout("Performance index %", true), chartConfig());
}

function drawConditionChart(conditions){
  const labels = ["Healthy","Watch","Degraded","Critical","Needs review"];
  const values = labels.map(k => conditions[k] || 0);
  Plotly.newPlot("condition_chart", [
    {type:"bar", x:labels, y:values, marker:{color:labels.map(k => COND_COLORS[k])}, hovertemplate:"%{x}: <b>%{y}</b><extra></extra>"}
  ], chartLayout("Records", false), chartConfig());
}

function chartLayout(yTitle, rotate){
  return {
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
    font:{family:"Segoe UI, Arial, sans-serif", size:11, color:COLORS.muted},
    margin:{l:48,r:18,t:8,b:rotate ? 98 : 42},
    xaxis:{gridcolor:COLORS.grid, linecolor:COLORS.grid, tickangle:rotate ? -35 : 0},
    yaxis:{gridcolor:COLORS.grid, linecolor:COLORS.grid, title:{text:yTitle}},
    legend:{orientation:"h", y:1.14},
    showlegend:true,
  };
}

function chartConfig(){
  return {displayModeBar:false, responsive:true};
}

function exportJson(){
  if(!RESULT) return;
  download("pv-condition-analysis.json", JSON.stringify(RESULT, null, 2), "application/json");
}

async function exportPdf(){
  if(!RESULT) return;
  $("btn_pdf").disabled = true;
  try{
    const res = await fetch("/api/fieldtest/report.pdf", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(RESULT),
    });
    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "PDF report failed.");
    }
    const blob = await res.blob();
    const name = `${safeName(RESULT.summary?.source || "pv-condition-analysis")}_report.pdf`;
    downloadBlob(name, blob);
  }catch(err){
    toast(err.message);
  }finally{
    $("btn_pdf").disabled = false;
  }
}

function exportCsv(){
  if(!RESULT) return;
  const cols = ["asset_id","string_id","test_type","condition","confidence","performance_pct","delta_pmpp_pct","delta_uoc_pct","delta_isc_pct","ff_measured_pct","diagnosis","source_file"];
  const rows = [cols.join(",")].concat((RESULT.records || []).map(r => cols.map(c => csvCell(r[c])).join(",")));
  download("pv-condition-records.csv", rows.join("\n"), "text/csv");
}

function download(name, content, type){
  const blob = new Blob([content], {type});
  downloadBlob(name, blob);
}

function downloadBlob(name, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(name){
  return String(name).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}

function numberValue(id){
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? String(v) : "";
}

function value(v, suffix=""){
  return v == null || !Number.isFinite(Number(v)) ? "-" : `${Number(v).toLocaleString(undefined, {maximumFractionDigits:1})}${suffix}`;
}

function condition(name){
  const cls = String(name || "Needs review").toLowerCase().replace(/\s+/g, "-");
  return `<span class="condition ${cls}">${esc(name || "Needs review")}</span>`;
}

function flags(list){
  if(!list || !list.length) return "-";
  return list.map(x => `<span class="flag">${esc(String(x).replaceAll("_"," "))}</span>`).join("");
}

function repeatability(name){
  const cls = String(name || "").toLowerCase().replace(/\s+/g, "-");
  return `<span class="repeat ${cls}">${esc(name || "-")}</span>`;
}

function confidence(level, score){
  const cls = String(level || "Low").toLowerCase();
  return `<span class="confidence ${cls}">${esc(level || "Low")} ${score == null ? "" : esc(score + "%")}</span>`;
}

function warrantyCell(w){
  if(!w || !w.available) return "-";
  return `<span class="warranty ${w.status === "Above warranty line" ? "ok" : w.status === "Below warranty line" ? "bad" : "warn"}">${esc(w.status)} ${w.margin_to_warranty_pct == null ? "" : esc(w.margin_to_warranty_pct + " pp")}</span>`;
}

function warrantyMargin(v){
  if(v == null || !Number.isFinite(Number(v))) return "-";
  const cls = Number(v) >= 0 ? "ok" : "bad";
  return `<span class="warranty ${cls}">${value(v, " pp")}</span>`;
}

function causeList(items){
  if(!items || !items.length) return "-";
  return `<ul class="cause-list">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

function basis(items){
  if(!items || !items.length) return "-";
  return `<ol class="basis-list">${items.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`;
}

function emptyRow(cols){
  return `<tr><td colspan="${cols}">No records.</td></tr>`;
}

function csvCell(v){
  const text = v == null ? "" : String(Array.isArray(v) ? v.join("; ") : v);
  return `"${text.replaceAll('"','""')}"`;
}

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}

function toast(message){
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4500);
}
