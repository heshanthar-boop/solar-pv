"""PDF reporting for MI3115 / SolarWorld field-test analysis."""
from __future__ import annotations

import io
import hashlib
import json
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)


def build_pdf(analysis: dict[str, Any]) -> bytes:
    """Return a defensible calculation-and-verdict PDF for a field-test result."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=13 * mm,
        bottomMargin=13 * mm,
        title="PV Condition Analysis Report",
        author="PV Condition Monitor",
    )
    styles = _styles()
    story: list[Any] = []

    summary = analysis.get("summary", {})
    validation = analysis.get("validation", {})
    warranty = analysis.get("warranty_model", {})
    report_id = _report_id(analysis)

    story += _title_block(styles, summary, report_id)
    story += _executive_result(styles, analysis)
    story += _expert_opinion_section(styles, analysis)
    story += _validation_section(styles, validation, summary)
    story += _evidence_register_section(styles, analysis, report_id)
    story += _required_basis_section(styles, analysis, warranty)
    story += _module_verdict_section(styles, analysis)
    story += _string_verdict_section(styles, analysis)
    story += _calculation_steps_section(styles, analysis)
    story += _limitations_and_signoff(styles, analysis, report_id)
    story += _record_appendix(styles, analysis)

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def _styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="ReportTitle", parent=base["Title"], fontName="Helvetica-Bold",
        fontSize=19, leading=23, alignment=TA_CENTER, textColor=colors.HexColor("#102027"),
        spaceAfter=8,
    ))
    base.add(ParagraphStyle(
        name="Subtle", parent=base["Normal"], fontSize=8.5, leading=11,
        textColor=colors.HexColor("#5f6b76"),
    ))
    base.add(ParagraphStyle(
        name="Small", parent=base["Normal"], fontSize=7.6, leading=9.2,
        textColor=colors.HexColor("#1f2933"),
    ))
    base.add(ParagraphStyle(
        name="Legal", parent=base["Normal"], fontSize=8.2, leading=10.3,
        textColor=colors.HexColor("#1f2933"),
    ))
    base.add(ParagraphStyle(
        name="Section", parent=base["Heading2"], fontName="Helvetica-Bold",
        fontSize=12.5, leading=15, textColor=colors.HexColor("#102027"),
        spaceBefore=8, spaceAfter=5,
    ))
    base.add(ParagraphStyle(
        name="Cell", parent=base["Normal"], fontSize=7.2, leading=8.6,
        alignment=TA_LEFT,
    ))
    return base


def _title_block(styles, summary, report_id):
    return [
        Paragraph("PV MODULE CONDITION ANALYSIS REPORT", styles["ReportTitle"]),
        Paragraph("Defensible engineering report - Metrel MI3115 evidence for SolarWorld Sunmodule SW XL 350 mono", styles["Subtle"]),
        Spacer(1, 5 * mm),
        _kv_table([
            ("Document ID", report_id),
            ("Report status", "Engineering evidence report for technical review and decision support"),
            ("Report generated", datetime.now().strftime("%Y-%m-%d %H:%M")),
            ("Source upload", summary.get("source", "-")),
            ("Validation status", summary.get("validation_status", "-")),
            ("Test date range", f"{summary.get('date_from') or '-'} to {summary.get('date_to') or '-'}"),
            ("Scope", "Instrument evidence validation, calculation audit, SolarWorld degradation comparison, final engineering verdict, and required corrective action."),
            ("Prepared for", "PV field performance and condition assessment record"),
            ("Prepared by", "PV Condition Monitor - analyst review/signature required before external issue"),
        ], styles),
        Paragraph(
            "Important: this report is structured to be technically defensible and auditable. "
            "It must still be reviewed, signed, and issued by a suitably competent engineer/assessor before use as formal evidence.",
            styles["Legal"],
        ),
        Spacer(1, 4 * mm),
    ]


def _executive_result(styles, analysis):
    modules = analysis.get("module_verdicts", [])
    strings = analysis.get("string_verdicts", [])
    counts = _verdict_counts(modules)
    worst = sorted(modules, key=lambda r: _rank(r.get("final_verdict")), reverse=True)
    lines = [
        ("Modules assessed", str(len(modules))),
        ("Strings assessed", str(len(strings))),
        ("Module final verdict count", ", ".join(f"{k}: {v}" for k, v in counts.items() if v)),
        ("Worst module", f"{worst[0].get('asset_id')} - {worst[0].get('final_verdict')}" if worst else "-"),
    ]
    return [
        Paragraph("1. Executive Verdict", styles["Section"]),
        _kv_table(lines, styles),
        Paragraph(
            "Engineering conclusion: final verdicts are derived from validated MI3115 records, repeated-test medians, "
            "repeatability checks, SolarWorld warranted performance comparison, and diagnostic pattern recognition. "
            "Where a module is below the SolarWorld warranty line or below the screening threshold, the report identifies the measured deficit and required next action.",
            styles["Legal"],
        ),
        Spacer(1, 3 * mm),
    ]


def _expert_opinion_section(styles, analysis):
    modules = analysis.get("module_verdicts", [])
    below = [m for m in modules if (m.get("solarworld_warranty") or {}).get("status") == "Below warranty line"]
    high_conf = [m for m in modules if m.get("confidence_level") == "High"]
    opinion = [
        ("Opinion basis", "Validated field measurements from Metrel MI3115 analyzer exports, SolarWorld SW XL 350 mono module profile, SolarWorld linear performance warranty model, and repeated IV evidence where available."),
        ("Opinion strength", f"{len(high_conf)} of {len(modules)} module verdicts have high confidence from repeated validated IV evidence." if modules else "-"),
        ("Warranty-line finding", f"{len(below)} module(s) are below the entered SolarWorld warranty degradation line." if modules else "-"),
        ("Primary conclusion", _primary_conclusion(modules)),
        ("Required action", "Use the final module/string verdict tables as the action register. Retest any unstable or low-confidence assets before irreversible warranty/replacement decisions."),
    ]
    return [
        Paragraph("2. Engineering Opinion Summary", styles["Section"]),
        _kv_table(opinion, styles),
        Spacer(1, 3 * mm),
    ]


def _validation_section(styles, validation, summary):
    return [
        Paragraph("3. Evidence Validation", styles["Section"]),
        _kv_table([
            ("MI3115 records", f"{validation.get('mi3115_records', 0)} / {validation.get('total_records', summary.get('records', 0))}"),
            ("SolarWorld profile matches", f"{validation.get('solarworld_records', 0)} / {validation.get('solarworld_applicable_records', 0)}"),
            ("IV curves with A 1785 remote", f"{validation.get('iv_curves_with_remote', 0)} / {validation.get('iv_curve_records', 0)}"),
            ("High-confidence records", str(validation.get("high_confidence_records", 0))),
            ("Parsed records", str(summary.get("records", 0))),
        ], styles),
        Paragraph("Validation warnings: " + (_join(validation.get("warnings")) or "None."), styles["Small"]),
        Spacer(1, 3 * mm),
    ]


def _evidence_register_section(styles, analysis, report_id):
    rows = [["Evidence item", "Value"]]
    rows.extend([
        ["Analysis integrity hash", report_id],
        ["Unique source files parsed", str(len(_source_files(analysis)))],
        ["Instrument serials detected", _instrument_serials(analysis) or "-"],
        ["Calibration dates detected", _calibration_dates(analysis) or "-"],
        ["Traceability rule", "Every measurement record keeps source file and asset path where supplied by MI3115 export."],
        ["Data handling rule", "All individual test records are retained; final verdicts are grouped summaries and do not delete raw evidence."],
    ])
    src_rows = [["Source file", "Records", "Test types"]]
    for source, rows_for_source in list(_records_by_source(analysis).items())[:12]:
        src_rows.append([
            source,
            str(len(rows_for_source)),
            ", ".join(sorted({r.get("test_type", "-") for r in rows_for_source})),
        ])
    story = [
        Paragraph("4. Evidence Register and Chain of Calculation", styles["Section"]),
        _table(rows, styles, widths=[50, 130]),
        Spacer(1, 2 * mm),
        _table(src_rows, styles, widths=[92, 22, 66]),
        Paragraph("If source-file count exceeds the rows shown above, the complete record list remains available in the JSON/CSV export.", styles["Subtle"]),
        Spacer(1, 3 * mm),
    ]
    return story


def _required_basis_section(styles, analysis, warranty):
    thresholds = (analysis.get("methodology") or {}).get("thresholds", {})
    profile = [
        ("Required STC module", "SolarWorld Sunmodule SW XL 350 mono"),
        ("Required Pmax / Vmpp / Impp", "350 W / 38.4 V / 9.17 A"),
        ("Required Voc / Isc", "48.0 V / 9.82 A"),
        ("Temperature coefficient", "-0.430 %/C"),
        ("SolarWorld warranty rule", "97.0% first-year minimum, then 0.7%/year linear degradation for 25 years"),
        ("Warranty start date used", warranty.get("start_date") or "Not entered"),
        ("Screening watch / critical", f"{thresholds.get('warning_pct', '-')}% / {thresholds.get('critical_pct', '-')}%"),
        ("Repeatability rule", "<=2 pp Stable, <=5 pp Review, >5 pp Unstable"),
    ]
    return [
        Paragraph("5. Required Basis - What It Needs To Be", styles["Section"]),
        _kv_table(profile, styles),
        Paragraph("Manufacturer source basis: archived SolarWorld SW 340-350 XL MONO datasheet and SolarWorld linear performance guarantee wording.", styles["Small"]),
        Spacer(1, 3 * mm),
    ]


def _module_verdict_section(styles, analysis):
    rows = [[
        "Module", "Need now", "Got PI", "Got degr.", "Margin", "Warranty", "Repeat", "Confidence", "Verdict", "Next action"
    ]]
    for item in analysis.get("module_verdicts", []):
        w = item.get("solarworld_warranty") or {}
        rows.append([
            item.get("asset_id", "-"),
            _pct(w.get("warranted_min_pct")),
            _pct(item.get("median_performance_pct")),
            _pct(w.get("measured_degradation_pct")),
            _pp(w.get("margin_to_warranty_pct")),
            w.get("status", "-"),
            item.get("repeatability", "-"),
            f"{item.get('confidence_level', '-')} {item.get('confidence_score_pct', '-')}%",
            item.get("final_verdict", "-"),
            item.get("next_action", "-"),
        ])
    return [
        Paragraph("6. Final Module Verdict - Required vs Got", styles["Section"]),
        _table(rows, styles, widths=[23, 14, 13, 13, 13, 16, 15, 16, 15, 42]),
        Spacer(1, 3 * mm),
    ]


def _string_verdict_section(styles, analysis):
    rows = [["String", "Need", "Got PI", "Spread", "Repeat", "Weak modules", "Verdict", "Action"]]
    for item in analysis.get("string_verdicts", []):
        rows.append([
            item.get("asset_id", "-"),
            "No safety fail; module PI above warranty/screening line",
            _pct(item.get("median_performance_pct")),
            _pp(item.get("repeatability_spread_pct")),
            item.get("repeatability", "-"),
            _join(item.get("weak_modules")) or "-",
            item.get("final_verdict", "-"),
            item.get("next_action", "-"),
        ])
    return [
        Paragraph("7. Final String Verdict", styles["Section"]),
        _table(rows, styles, widths=[26, 34, 13, 12, 15, 28, 16, 38]),
        Spacer(1, 3 * mm),
    ]


def _calculation_steps_section(styles, analysis):
    methodology = analysis.get("methodology") or {}
    warranty = analysis.get("warranty_model") or {}
    steps = [
        "1. Parse MI3115 PDF/CSV fields and retain asset path: block, inverter, tracker, string, module.",
        "2. Validate instrument evidence: MI3115 analyzer, calibration date, A 1785 remote data, irradiance, Tcell, and SolarWorld module profile.",
        "3. Use instrument-normalized Pmpp/Uoc/Isc/Umpp/Impp where present. If missing, translate measured power to STC using P_stc = P_meas * (1000 / G) / (1 + gamma * (Tcell - 25)).",
        "4. Compute performance index PI = 100 * corrected Pmpp / expected STC Pmpp.",
        "5. For repeated tests on the same module/string, use the median of high-confidence corrected IV PI values. Preserve every raw test record.",
        "6. Compute repeatability spread = max PI - min PI across the tests used.",
        "7. Compare measured PI with SolarWorld warranted minimum: " + (warranty.get("formula") or "not configured") + ".",
        "8. Final verdict uses safety-fail override, then warranty/screening PI, then repeatability and current/voltage/fill-factor patterns.",
    ]
    extra = []
    for block in ("standards_alignment", "assumptions", "formulas"):
        for item in methodology.get(block, [])[:5]:
            extra.append(f"- {item}")
    story = [
        PageBreak(),
        Paragraph("8. Calculation Steps and Assumptions", styles["Section"]),
    ]
    story.extend(_bullet_block(steps, styles))
    story.append(Paragraph("Method details from application:", styles["Small"]))
    story.extend(_bullet_block(extra, styles))
    story.append(Spacer(1, 3 * mm))
    return story


def _limitations_and_signoff(styles, analysis, report_id):
    limitations = [
        "This report is based only on uploaded MI3115/CSV/PDF evidence and the entered SolarWorld warranty start date.",
        "The report does not itself prove root cause; it identifies evidence-backed likely causes and required next actions.",
        "Warranty or legal acceptance may require original signed calibration certificates, site photographs, module serial number evidence, chain-of-custody records, and/or accredited laboratory flash testing.",
        "If field conditions were unstable, irradiance sensor plane was incorrect, module surface was dirty, or connection contact was poor, repeat testing is required before final replacement or warranty claim.",
        "A competent reviewer must verify site identity, test procedure, instrument calibration validity, and source-file authenticity before external submission.",
    ]
    sign_rows = [
        ["Role", "Name / organization", "Signature", "Date"],
        ["Prepared by", "", "", ""],
        ["Reviewed by", "", "", ""],
        ["Client / site representative", "", "", ""],
    ]
    story = [
        Paragraph("9. Limitations, Reliance, and Sign-Off", styles["Section"]),
    ]
    story.extend(_bullet_block([f"- {x}" for x in limitations], styles))
    story.append(Spacer(1, 2 * mm))
    story.append(_table([
        ["Document control item", "Value"],
        ["Report integrity hash", report_id],
        ["External issue status", "Unsigned draft until reviewed and signed"],
        ["Recommended attachments", "Original MI3115 PDF exports, calibration certificates, site test procedure, photographs/thermal images, module serial list"],
    ], styles, widths=[50, 130]))
    story.append(Spacer(1, 2 * mm))
    story.append(_table(sign_rows, styles, widths=[38, 58, 46, 28]))
    story.append(Spacer(1, 4 * mm))
    return story


def _record_appendix(styles, analysis):
    rows = [["Asset", "Test", "PI", "dP", "dVoc", "dIsc", "FF", "Condition"]]
    for r in (analysis.get("records") or [])[:80]:
        rows.append([
            r.get("asset_id", "-"),
            r.get("test_type", "-"),
            _pct(r.get("performance_pct")),
            _pct(r.get("delta_pmpp_pct")),
            _pct(r.get("delta_uoc_pct")),
            _pct(r.get("delta_isc_pct")),
            _pct(r.get("ff_measured_pct")),
            r.get("condition", "-"),
        ])
    story = [
        Paragraph("10. Measurement Record Appendix", styles["Section"]),
        _table(rows, styles, widths=[38, 22, 14, 14, 14, 14, 14, 24]),
    ]
    if len(analysis.get("records") or []) > 80:
        story.append(Paragraph("Appendix table truncated to first 80 records in the PDF. Full records remain in JSON/CSV export.", styles["Subtle"]))
    return story


def _kv_table(items, styles):
    return _table([["Item", "Value"]] + [[k, v] for k, v in items], styles, widths=[48, 132])


def _bullet_block(items, styles):
    return [Paragraph(_esc(item), styles["Small"]) for item in items]


def _table(rows, styles, widths=None):
    data = [[_para(cell, styles) for cell in row] for row in rows]
    col_widths = [w * mm for w in widths] if widths else None
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102027")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("LEADING", (0, 0), (-1, -1), 8.3),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d2dc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def _para(value, styles):
    return Paragraph(_esc(value), styles["Cell"])


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#667085"))
    canvas.drawString(14 * mm, 8 * mm, "PV Condition Monitor - MI3115 / SolarWorld field-test report")
    canvas.drawRightString(196 * mm, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _verdict_counts(items):
    counts = {"Healthy": 0, "Watch": 0, "Degraded": 0, "Critical": 0, "Needs review": 0}
    for item in items:
        key = item.get("final_verdict", "Needs review")
        counts[key] = counts.get(key, 0) + 1
    return counts


def _report_id(analysis):
    canonical = json.dumps(analysis, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    return "PVCR-" + hashlib.sha256(canonical).hexdigest()[:16].upper()


def _primary_conclusion(modules):
    if not modules:
        return "No module verdicts available."
    critical = [m for m in modules if m.get("final_verdict") == "Critical"]
    degraded = [m for m in modules if m.get("final_verdict") == "Degraded"]
    watch = [m for m in modules if m.get("final_verdict") == "Watch"]
    below = [m for m in modules if (m.get("solarworld_warranty") or {}).get("status") == "Below warranty line"]
    if critical:
        return f"{len(critical)} module(s) require critical corrective action before acceptance."
    if degraded:
        return f"{len(degraded)} module(s) are degraded; {len(below)} are below the SolarWorld warranty/degradation line."
    if watch:
        return f"{len(watch)} module(s) require monitoring or repeat testing; no degraded/critical module verdicts found."
    return "All assessed modules are within configured screening and warranty comparison limits."


def _source_files(analysis):
    return sorted({r.get("source_file", "-") for r in analysis.get("records", [])})


def _records_by_source(analysis):
    grouped = {}
    for record in analysis.get("records", []):
        grouped.setdefault(record.get("source_file", "-"), []).append(record)
    return dict(sorted(grouped.items(), key=lambda kv: kv[0]))


def _instrument_serials(analysis):
    values = set()
    for record in analysis.get("records", []):
        for meter in (record.get("instruments") or {}).get("meters", []):
            serial = meter.get("serial")
            model = meter.get("model")
            if serial:
                values.add(f"{model or 'Meter'}: {serial}")
    return "; ".join(sorted(values))


def _calibration_dates(analysis):
    values = set()
    for record in analysis.get("records", []):
        for meter in (record.get("instruments") or {}).get("meters", []):
            cal = meter.get("calibration_date")
            model = meter.get("model")
            if cal:
                values.add(f"{model or 'Meter'}: {cal}")
    return "; ".join(sorted(values))


def _rank(v):
    return {"Healthy": 0, "Watch": 1, "Needs review": 1, "Degraded": 2, "Critical": 3}.get(v, 1)


def _pct(v):
    return "-" if v is None else f"{float(v):.1f}%"


def _pp(v):
    return "-" if v is None else f"{float(v):+.1f} pp"


def _join(values):
    if not values:
        return ""
    if isinstance(values, str):
        return values
    return ", ".join(str(v) for v in values)


def _esc(value):
    text = str(value if value is not None else "-")
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )
