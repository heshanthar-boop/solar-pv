"""Field PV test parser and condition analyzer.

The analyzer is built for instrument exports such as Metrel MI 3115 PDFs, ZIP
site packs containing those PDFs, and simple CSV exports. It keeps the
calculation path explicit: instrument-normalized values are used first; when a
normalized value is absent, the fallback is a linear irradiance and temperature
translation using the module datasheet coefficients.
"""
from __future__ import annotations

import csv
import io
import math
import re
import statistics
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Any


NUMBER = r"[-+]?\d+(?:\.\d+)?"
DELTA = "\u0394"


SOLARWORLD_SW_XL_350 = {
    "profile_id": "solarworld_sw_xl_350_mono",
    "manufacturer": "SolarWorld AG",
    "long_name": "Sunmodule SW XL 350 mono",
    "pmax_w": 350.0,
    "umpp_v": 38.4,
    "impp_a": 9.17,
    "uoc_v": 48.0,
    "isc_a": 9.82,
    "noct_c": 46.0,
    "alpha_a_c": 0.0041244,
    "beta_v_c": -0.146,
    "gamma_pct_c": -0.43,
    "rs_ohm": 0.3,
    "bifaciality": 0.0,
}


@dataclass
class FieldThresholds:
    warning_pct: float = 90.0
    critical_pct: float = 80.0
    voltage_warning_pct: float = 5.0
    current_warning_pct: float = 8.0
    irradiance_min_wm2: float = 700.0
    ff_warning_pct: float = 70.0


@dataclass
class WarrantyModel:
    start_date: str | None = None
    first_year_min_pct: float = 97.0
    annual_degradation_pct: float = 0.7
    term_years: int = 25


def analyze_upload(
    content: bytes,
    filename: str,
    thresholds: FieldThresholds | None = None,
    warranty: WarrantyModel | None = None,
) -> dict[str, Any]:
    """Parse an uploaded ZIP/PDF/CSV and return a condition assessment."""
    thresholds = thresholds or FieldThresholds()
    warranty = warranty or WarrantyModel()
    parsed = parse_upload(content, filename)
    records = [_analyze_record(r, thresholds) for r in parsed]
    records = [r for r in records if _has_useful_measurement(r)]
    return _build_result(records, filename, thresholds, warranty)


def parse_upload(content: bytes, filename: str) -> list[dict[str, Any]]:
    lower = filename.lower()
    if lower.endswith(".zip"):
        return _parse_zip(content)
    if lower.endswith(".pdf"):
        return _parse_pdf_bytes(content, filename)
    if lower.endswith(".csv") or lower.endswith(".txt"):
        return _parse_csv_bytes(content, filename)
    raise ValueError("Upload a ZIP, PDF, or CSV instrument export.")


def _parse_zip(content: bytes) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            lower = name.lower()
            data = zf.read(info)
            if lower.endswith(".pdf"):
                out.extend(_parse_pdf_bytes(data, name))
            elif lower.endswith(".csv") or lower.endswith(".txt"):
                out.extend(_parse_csv_bytes(data, name))
    if not out:
        raise ValueError("No PDF or CSV test files were found in the ZIP.")
    return out


def _parse_pdf_bytes(content: bytes, name: str) -> list[dict[str, Any]]:
    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover - depends on local install
        raise ValueError("PDF parsing requires the 'pypdf' package.") from exc

    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    records = _split_mi3115_report(text)
    if not records:
        return [_parse_text_record(text, name)]
    header = text[:records[0][0]]
    parsed: list[dict[str, Any]] = []
    for idx, (start, end) in enumerate(records, start=1):
        record_text = f"{header}\n{text[start:end]}"
        parsed.append(_parse_text_record(record_text, f"{name}#{idx:03d}"))
    return parsed


def _split_mi3115_report(text: str) -> list[tuple[int, int]]:
    """Return start/end spans for each test path in a combined MI3115 PDF."""
    starts: list[int] = []
    for match in re.finditer(r"(?m)^.+/.+(?:I/U curve|IEC 62446 Autotest|Uoc/Isc|R low|Environment).*$", text):
        line = match.group(0)
        if re.search(r"\b(?:Block|Inverter|Tracker|String|Module|SCB|STR)\b", line, re.I):
            starts.append(match.start())
    return [(start, starts[i + 1] if i + 1 < len(starts) else len(text)) for i, start in enumerate(starts)]


def _parse_text_record(text: str, source_name: str) -> dict[str, Any]:
    fields = _extract_numeric_fields(text)
    path_line = _find_path_line(text)
    meta = _extract_location(path_line or source_name)
    params = _extract_parameters(text)
    module_profile = _apply_module_profile(params)
    test_type = _classify_test(text, source_name)
    status = _extract_status(text, test_type)
    created = _extract_datetime(text)
    instruments = _extract_instrument_info(text)
    return {
        "source_file": source_name,
        "raw_path": path_line,
        "test_type": test_type,
        "status": status,
        "created_at": created,
        "fields": fields,
        "parameters": params,
        "module_profile": module_profile,
        "instruments": instruments,
        **meta,
    }


def _parse_csv_bytes(content: bytes, name: str) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    dialect = csv.Sniffer().sniff(sample) if "," in sample or "\t" in sample else csv.excel
    rows = list(csv.DictReader(io.StringIO(text), dialect=dialect))
    out: list[dict[str, Any]] = []
    for idx, row in enumerate(rows, start=1):
        norm = {_norm_key(k): v for k, v in row.items() if k is not None}
        fields: dict[str, float] = {}
        for key, canonical in _CSV_FIELD_MAP.items():
            if key in norm:
                value = _to_float(norm[key])
                if value is not None:
                    fields[canonical] = value
        source_id = norm.get("source") or norm.get("file") or f"{name} row {idx}"
        meta_text = " / ".join(
            str(norm.get(k, ""))
            for k in ("site", "block", "inverter", "tracker", "string", "module")
            if norm.get(k)
        )
        meta = _extract_location(meta_text or source_id)
        test_type = norm.get("test_type") or norm.get("test") or "csv"
        out.append(
            {
                "source_file": source_id,
                "raw_path": meta_text or None,
                "test_type": str(test_type),
                "status": str(norm.get("status") or ""),
                "created_at": str(norm.get("datetime") or norm.get("date") or ""),
                "fields": fields,
                "parameters": {},
                "module_profile": {"profile_id": None, "name": "CSV provided module data", "matches_solarworld": False},
                "instruments": {"meters": [], "has_mi3115": False, "has_remote": False, "calibration_visible": False},
                **meta,
            }
        )
    return out


_CSV_FIELD_MAP = {
    "uoc_m": "Uoc_m",
    "voc_m": "Uoc_m",
    "isc_m": "Isc_m",
    "umpp_m": "Umpp_m",
    "vmpp_m": "Umpp_m",
    "impp_m": "Impp_m",
    "pmpp_m": "Pmpp_m",
    "pmax_m": "Pmpp_m",
    "uoc": "Uoc",
    "voc": "Uoc",
    "isc": "Isc",
    "umpp": "Umpp",
    "vmpp": "Umpp",
    "impp": "Impp",
    "pmpp": "Pmpp",
    "pmax": "Pmpp",
    "uoc_n": "Uoc_n",
    "voc_n": "Uoc_n",
    "isc_n": "Isc_n",
    "umpp_n": "Umpp_n",
    "vmpp_n": "Umpp_n",
    "impp_n": "Impp_n",
    "pmpp_n": "Pmpp_n",
    "pmax_n": "Pmpp_n",
    "irr": "Irr",
    "irradiance": "Irr",
    "tcell": "Tcell",
    "cell_temp": "Tcell",
    "roc": "Roc",
    "r": "R",
    "ff_m": "FF_m",
    "ff_n": "FF_n",
    "delta_pmpp": "dPmpp",
    "delta_uoc": "dUoc",
    "delta_isc": "dIsc",
}


def _extract_numeric_fields(text: str) -> dict[str, float]:
    labels = [
        "Uoc_m", "Isc_m", "Umpp_m", "Impp_m", "Pmpp_m",
        "Uoc_n", "Isc_n", "Umpp_n", "Impp_n", "Pmpp_n",
        "Uoc", "Isc", "Umpp", "Impp", "Pmpp",
        "Irr", "Irr_f", "Irr_b", "Tcell", "Tamb",
        "Roc", "Roc+", "Roc-", "R", "R+", "R-",
        "FF_m", "FF_n", "Limit  (Roc)", "Limit  (R)",
    ]
    fields: dict[str, float] = {}
    for label in labels:
        key = label.replace("Limit  (", "Limit_").replace(")", "")
        key = key.replace("+", "_pos").replace("-", "_neg")
        value = _find_label_value(text, label)
        if value is not None:
            fields[key] = value
    for label in ["Pmpp", "Umpp", "Impp", "Uoc", "Isc"]:
        value = _find_label_value(text, f"{DELTA}{label}")
        if value is not None:
            fields[f"d{label}"] = value
    return fields


def _find_label_value(text: str, label: str) -> float | None:
    pattern = rf"(?m)^\s*{re.escape(label)}\s+({NUMBER})\b"
    match = re.search(pattern, text)
    return float(match.group(1)) if match else None


def _find_path_line(text: str) -> str | None:
    for line in text.splitlines():
        clean = " ".join(line.split())
        if "/" in clean and re.search(r"\b(String|STR|Module|Tracker|Inverter|Block|SCB)\b", clean, re.I):
            return clean
    return None


def _extract_location(text: str) -> dict[str, Any]:
    def pick(pattern: str) -> str | None:
        match = re.search(pattern, text, flags=re.I)
        return " ".join(match.group(1).split()) if match else None

    site = text.split("/")[0].strip() if "/" in text else None
    module = pick(r"(?:^|/)\s*Module\s*-?\s*([A-Za-z0-9]+)") or pick(r"(?:^|/)\s*S\s*-?\s*([0-9][A-Za-z0-9]*)")
    string = pick(r"(?:^|/)\s*(?:String|STR)\s*-?\s*([A-Za-z0-9]+)")
    tracker = pick(r"(?:^|/)\s*Tracker\s*-?\s*([A-Za-z0-9]+)")
    inverter = pick(r"(?:^|/)\s*Inverter\s*-?\s*([A-Za-z0-9]+)")
    block = pick(r"(?:^|/)\s*Block\s*-?\s*([A-Za-z0-9]+)")
    scb = pick(r"(?:^|/)\s*SCB\s*-?\s*([A-Za-z0-9]+)")
    return {
        "site": site or None,
        "block": block,
        "inverter": inverter,
        "tracker": tracker,
        "scb": scb,
        "string": string,
        "module": module,
        "asset_id": _asset_id(block, inverter, tracker, string, module, scb),
        "string_id": _asset_id(block, inverter, tracker, string, None, scb),
    }


def _asset_id(block, inverter, tracker, string, module, scb=None) -> str:
    parts = []
    string_prefix = "STR" if scb else "S"
    module_prefix = "S" if scb else "M"
    for prefix, value in (
        ("B", block), ("I", inverter), ("SCB", scb), ("T", tracker), (string_prefix, string), (module_prefix, module)
    ):
        if value:
            parts.append(f"{prefix}{value}")
    return "-".join(parts) if parts else "Unassigned"


def _extract_parameters(text: str) -> dict[str, float | str | int]:
    params: dict[str, float | str | int] = {}
    param_text = _parameter_block(text)
    for key, label in (
        ("pmax_w", "Pmax"),
        ("umpp_v", "Umpp"),
        ("impp_a", "Impp"),
        ("uoc_v", "Uoc"),
        ("isc_a", "Isc"),
        ("noct_c", "NOCT"),
        ("alpha_a_c", "alpha"),
        ("beta_v_c", "beta"),
        ("gamma_pct_c", "gamma"),
        ("rs_ohm", "Rs"),
        ("bifaciality", "Bifaciality"),
        ("modules_in_string", "Number of modules in PV string"),
        ("parallel_strings", "Number of PV strings"),
    ):
        value = _find_label_value(param_text, label)
        if value is not None:
            params[key] = int(value) if key in {"modules_in_string", "parallel_strings"} else value
    for key, label in (
        ("module_name", "Name"),
        ("manufacturer", "Manufacturer"),
        ("long_name", "Long name"),
    ):
        match = re.search(rf"(?m)^\s*{label}\s+(.+?)\s*$", param_text)
        if match:
            params[key] = match.group(1).strip()
    return params


def _parameter_block(text: str) -> str:
    match = re.search(r"(?mi)^\s*Parameters\s*$", text)
    if not match:
        return text
    return text[match.end():]


def _apply_module_profile(params: dict[str, float | str | int]) -> dict[str, Any]:
    """Attach and, if needed, fill the SolarWorld SW XL 350 mono profile."""
    name_blob = " ".join(
        str(params.get(k, ""))
        for k in ("module_name", "manufacturer", "long_name")
    ).lower()
    pmax = _to_float(params.get("pmax_w"))
    looks_solarworld = (
        "solarworld" in name_blob
        or "sunmodule" in name_blob
        or (pmax is not None and abs(pmax - 350.0) <= 2.0 and "sw" in name_blob)
    )
    if not looks_solarworld:
        return {"profile_id": None, "name": str(params.get("long_name") or params.get("module_name") or "Unknown module"), "matches_solarworld": False}

    filled: list[str] = []
    mismatch: list[str] = []
    for key, value in SOLARWORLD_SW_XL_350.items():
        if key in {"profile_id", "manufacturer", "long_name"}:
            continue
        if key not in params or params.get(key) in (None, ""):
            params[key] = value
            filled.append(key)
        else:
            actual = _to_float(params.get(key))
            if actual is not None and isinstance(value, (int, float)):
                tolerance = max(abs(value) * 0.025, 0.02)
                if abs(actual - float(value)) > tolerance:
                    mismatch.append(f"{key}: report {actual:g}, SolarWorld profile {value:g}")
    return {
        "profile_id": SOLARWORLD_SW_XL_350["profile_id"],
        "name": SOLARWORLD_SW_XL_350["long_name"],
        "manufacturer": SOLARWORLD_SW_XL_350["manufacturer"],
        "matches_solarworld": True,
        "fallback_fields": filled,
        "mismatches": mismatch,
    }


def _extract_instrument_info(text: str) -> dict[str, Any]:
    cal_dates = re.findall(r"Calibration date:\s*(\d{2}/\d{2}/\d{4})", text, flags=re.I)
    serials = [
        m.group(1).strip()
        for m in re.finditer(r"Serial Number:\s*([A-Za-z0-9-]+?)(?=Model:|\s|$)", text, flags=re.I)
    ]
    model_matches = re.findall(r"Model:\s*([^\r\n]+)", text, flags=re.I)
    models = [_clean_model(m) for m in model_matches]
    meters = []
    n = max(len(models), len(serials), len(cal_dates))
    for i in range(n):
        model = models[i] if i < len(models) else None
        serial = serials[i] if i < len(serials) else None
        cal = _parse_date(cal_dates[i]) if i < len(cal_dates) else None
        meters.append({"model": model, "serial": serial, "calibration_date": cal})
    return {
        "meters": meters,
        "has_mi3115": any("mi 3115" in (m.get("model") or "").lower() for m in meters),
        "has_remote": any("a 1785" in (m.get("model") or "").lower() or "remote" in (m.get("model") or "").lower() for m in meters),
        "calibration_visible": any(m.get("calibration_date") for m in meters),
    }


def _clean_model(value: str) -> str:
    value = re.sub(r"\s*(Instrument data:|User:).*$", "", value, flags=re.I).strip()
    return " ".join(value.split())


def _parse_date(value: str) -> str | None:
    for fmt in ("%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return value


def _classify_test(text: str, source_name: str) -> str:
    blob = f"{source_name}\n{text}".lower()
    if "i/u curve" in blob or "i u curve" in blob:
        return "iv_curve"
    if "autotest" in blob or "iec 62446" in blob:
        return "autotest"
    if "uoc/isc" in blob or "u i test" in blob:
        return "uoc_isc"
    if "r low" in blob:
        return "continuity"
    if "roc" in blob:
        return "insulation"
    return "unknown"


def _extract_status(text: str, test_type: str) -> str:
    if re.search(r"\bFail\b", text, flags=re.I):
        return "Fail"
    if re.search(r"\bPass\b", text, flags=re.I):
        return "Pass"
    if test_type in {"iv_curve", "uoc_isc"}:
        return "Measured"
    return ""


def _extract_datetime(text: str) -> str | None:
    match = re.search(r"DateTime\s+(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})", text)
    if not match:
        return None
    raw = match.group(1)
    for fmt in ("%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).isoformat(sep=" ")
        except ValueError:
            pass
    return raw


def _analyze_record(record: dict[str, Any], t: FieldThresholds) -> dict[str, Any]:
    f = record["fields"]
    p = record["parameters"]
    modules = int(p.get("modules_in_string") or 1)
    pmpp_nominal = _first_number(f, "Pmpp_n")
    pmax = _to_float(p.get("pmax_w"))
    expected_stc = pmpp_nominal if pmpp_nominal is not None else (pmax or 0.0) * max(modules, 1)
    normalized_power = _first_number(f, "Pmpp") or _normalized_from_measured(f, p, expected_stc)
    measured_power = _first_number(f, "Pmpp_m")

    perf_pct = None
    if normalized_power and expected_stc:
        perf_pct = 100.0 * normalized_power / expected_stc

    delta_pmpp = f.get("dPmpp")
    if delta_pmpp is None and perf_pct is not None:
        delta_pmpp = perf_pct - 100.0

    ff_measured = f.get("FF_m") or _fill_factor(f, measured=True)
    ff_norm = f.get("FF_n") or _fill_factor(f, measured=False)
    delta_uoc = f.get("dUoc") or _ratio_delta(f.get("Uoc"), f.get("Uoc_n"))
    delta_isc = f.get("dIsc") or _ratio_delta(f.get("Isc"), f.get("Isc_n"))

    flags = _flags(record, perf_pct, delta_uoc, delta_isc, ff_measured, t)
    condition = _condition(perf_pct, flags, record["test_type"], t)
    confidence = _confidence(record, perf_pct, t)
    validation = _record_validation(record, perf_pct)

    record.update(
        {
            "modules_in_string": modules,
            "expected_stc_w": _round(expected_stc),
            "normalized_power_w": _round(normalized_power),
            "measured_power_w": _round(measured_power),
            "performance_pct": _round(perf_pct, 1),
            "delta_pmpp_pct": _round(delta_pmpp, 2),
            "delta_uoc_pct": _round(delta_uoc, 2),
            "delta_isc_pct": _round(delta_isc, 2),
            "ff_measured_pct": _round(ff_measured, 2),
            "ff_normalized_pct": _round(ff_norm, 2),
            "condition": condition,
            "confidence": confidence,
            "flags": flags,
            "validation": validation,
            "diagnosis": _diagnosis(flags, record["test_type"], condition),
        }
    )
    return record


def _has_useful_measurement(record: dict[str, Any]) -> bool:
    f = record.get("fields", {})
    return bool(f)


def _first_number(mapping: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = _to_float(mapping.get(key))
        if value is not None:
            return value
    return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    match = re.search(NUMBER, str(value).replace(",", ""))
    return float(match.group(0)) if match else None


def _normalized_from_measured(
    fields: dict[str, float],
    params: dict[str, Any],
    expected_stc: float,
) -> float | None:
    measured = fields.get("Pmpp_m")
    irr = fields.get("Irr") or fields.get("Irr_f")
    tcell = fields.get("Tcell")
    gamma_pct_c = _to_float(params.get("gamma_pct_c"))
    if not measured or not irr or irr <= 0:
        return None
    gamma = (gamma_pct_c or -0.43) / 100.0
    temp_factor = 1.0 + gamma * ((tcell if tcell is not None else 25.0) - 25.0)
    if temp_factor <= 0:
        return None
    translated = measured * (1000.0 / irr) / temp_factor
    if expected_stc and translated > expected_stc * 1.35:
        return None
    return translated


def _fill_factor(fields: dict[str, float], measured: bool) -> float | None:
    suffix = "_m" if measured else ""
    p = fields.get(f"Pmpp{suffix}")
    uoc = fields.get(f"Uoc{suffix}")
    isc = fields.get(f"Isc{suffix}")
    if p and uoc and isc and uoc * isc > 0:
        return 100.0 * p / (uoc * isc)
    return None


def _ratio_delta(value: float | None, nominal: float | None) -> float | None:
    if value is None or nominal is None or nominal == 0:
        return None
    return 100.0 * (value / nominal - 1.0)


def _flags(
    record: dict[str, Any],
    perf_pct: float | None,
    delta_uoc: float | None,
    delta_isc: float | None,
    ff_measured: float | None,
    t: FieldThresholds,
) -> list[str]:
    f = record["fields"]
    flags: list[str] = []
    if perf_pct is not None and perf_pct < t.critical_pct:
        flags.append("critical_power_loss")
    elif perf_pct is not None and perf_pct < t.warning_pct:
        flags.append("low_power")
    if delta_uoc is not None and delta_uoc <= -abs(t.voltage_warning_pct):
        flags.append("low_voltage")
    if delta_isc is not None and delta_isc <= -abs(t.current_warning_pct):
        flags.append("low_current")
    if ff_measured is not None and ff_measured < t.ff_warning_pct:
        flags.append("low_fill_factor")
    irr = f.get("Irr") or f.get("Irr_f")
    if irr is not None and irr < t.irradiance_min_wm2:
        flags.append("low_irradiance_confidence")
    if f.get("Tcell") is not None and f["Tcell"] > 70:
        flags.append("high_cell_temperature")
    if record.get("status", "").lower() == "fail":
        flags.append("instrument_fail")
    roc = f.get("Roc")
    roc_limit = f.get("Limit_Roc")
    if roc is not None and roc_limit is not None and roc < roc_limit:
        flags.append("insulation_below_limit")
    r_value = f.get("R")
    r_limit = f.get("Limit_R")
    if r_value is not None and r_limit is not None and r_value > r_limit:
        flags.append("continuity_above_limit")
    return flags


def _condition(
    perf_pct: float | None,
    flags: list[str],
    test_type: str,
    t: FieldThresholds,
) -> str:
    hard = {"instrument_fail", "insulation_below_limit", "continuity_above_limit"}
    if hard.intersection(flags):
        return "Critical"
    if perf_pct is not None:
        if perf_pct < t.critical_pct:
            return "Critical"
        if perf_pct < t.warning_pct:
            return "Degraded"
        if perf_pct < 95.0 or {"low_current", "low_voltage", "low_fill_factor"}.intersection(flags):
            return "Watch"
        return "Healthy"
    if {"low_current", "low_voltage", "low_fill_factor"}.intersection(flags):
        return "Watch"
    if test_type in {"autotest", "insulation", "continuity"}:
        return "Healthy" if "instrument_fail" not in flags else "Critical"
    return "Needs review"


def _confidence(record: dict[str, Any], perf_pct: float | None, t: FieldThresholds) -> str:
    irr = record["fields"].get("Irr") or record["fields"].get("Irr_f")
    has_temp = record["fields"].get("Tcell") is not None
    if record["test_type"] == "iv_curve" and perf_pct is not None and irr and irr >= 800 and has_temp:
        return "High"
    if perf_pct is not None and irr and irr >= t.irradiance_min_wm2:
        return "Medium"
    if record["test_type"] in {"autotest", "insulation", "continuity"}:
        return "Medium"
    return "Low"


def _record_validation(record: dict[str, Any], perf_pct: float | None) -> dict[str, Any]:
    checks: list[dict[str, str]] = []
    instr = record.get("instruments") or {}
    profile = record.get("module_profile") or {}
    fields = record.get("fields") or {}
    params = record.get("parameters") or {}

    checks.append(_check("Metrel MI 3115 analyzer identified", instr.get("has_mi3115")))
    if record["test_type"] in {"iv_curve", "autotest"}:
        checks.append(_check("Remote environmental unit identified", instr.get("has_remote")))
    checks.append(_check("Calibration date visible in report", instr.get("calibration_visible")))
    if record["test_type"] in {"iv_curve", "uoc_isc", "autotest"}:
        checks.append(_check("SolarWorld SW XL 350 mono profile matched", profile.get("matches_solarworld")))
        checks.append(_check("Module STC reference available", bool(_to_float(params.get("pmax_w")) or fields.get("Pmpp_n"))))
        checks.append(_check("Irradiance recorded", fields.get("Irr") is not None or fields.get("Irr_f") is not None))
    if record["test_type"] in {"iv_curve", "uoc_isc", "autotest"}:
        checks.append(_check("Cell temperature recorded", fields.get("Tcell") is not None))
    if record["test_type"] == "iv_curve":
        checks.append(_check("Corrected Pmpp available", perf_pct is not None))
        checks.append(_check("Fill factor available", fields.get("FF_m") is not None or _fill_factor(fields, True) is not None))

    warnings: list[str] = []
    if profile.get("fallback_fields"):
        warnings.append("SolarWorld profile filled missing fields: " + ", ".join(profile["fallback_fields"]))
    if profile.get("mismatches"):
        warnings.extend(profile["mismatches"])
    if record["test_type"] == "iv_curve" and not instr.get("has_remote"):
        warnings.append("IV curve has no detected A 1785 remote unit; verify irradiance and Tcell source.")
    valid = all(item["status"] != "fail" for item in checks)
    return {"valid": valid, "checks": checks, "warnings": warnings}


def _check(label: str, passed: Any) -> dict[str, str]:
    return {"label": label, "status": "pass" if passed else "fail"}


def _diagnosis(flags: list[str], test_type: str, condition: str) -> str:
    if "insulation_below_limit" in flags:
        return "Insulation resistance is below the configured limit; isolate and retest before energizing."
    if "continuity_above_limit" in flags:
        return "Protective conductor or continuity resistance is above limit; inspect terminations and bonding."
    if "critical_power_loss" in flags:
        return "Severe IV power loss; inspect module/string wiring, bypass diodes, cracks, shading, and soiling."
    if "low_current" in flags and "low_voltage" in flags:
        return "Both current and voltage are low; check irradiance reference, string/module count, wiring polarity, and module damage."
    if "low_current" in flags:
        return "Current loss dominates; likely soiling, shading, degradation, cell cracking, or irradiance sensor mismatch."
    if "low_voltage" in flags:
        return "Voltage loss dominates; check module count, bypass diode sections, hot cells, or wrong module data."
    if "low_fill_factor" in flags:
        return "Low fill factor indicates possible series resistance, connector heating, or curve sweep disturbance."
    if condition == "Healthy":
        return "No major electrical deviation detected by the uploaded test data."
    if test_type in {"uoc_isc", "autotest"}:
        return "Limited test type; use an IV curve to confirm power and fill-factor condition."
    return "Review the raw record and repeat the test if conditions were unstable."


def _build_result(
    records: list[dict[str, Any]],
    filename: str,
    thresholds: FieldThresholds,
    warranty: WarrantyModel | None = None,
) -> dict[str, Any]:
    if not records:
        raise ValueError("No usable field-test measurements were parsed.")

    warranty = warranty or WarrantyModel()
    by_string = _group_strings(records)
    module_verdicts = _group_module_verdicts(records, thresholds, warranty)
    string_verdicts = _group_string_verdicts(records, module_verdicts, thresholds, warranty)
    perf_values = [r["performance_pct"] for r in records if r.get("performance_pct") is not None]
    conditions = {name: 0 for name in ["Healthy", "Watch", "Degraded", "Critical", "Needs review"]}
    for rec in records:
        conditions[rec["condition"]] = conditions.get(rec["condition"], 0) + 1
    worst = sorted(records, key=lambda r: _condition_rank(r["condition"]), reverse=True)[:8]
    validation = _validation_summary(records)
    summary = {
        "source": filename,
        "records": len(records),
        "modules_tested": len({r["asset_id"] for r in records if r.get("module")}),
        "strings_tested": len({r["string_id"] for r in records if r.get("string")}),
        "iv_curves": sum(1 for r in records if r["test_type"] == "iv_curve"),
        "uoc_isc_tests": sum(1 for r in records if r["test_type"] == "uoc_isc"),
        "autotests": sum(1 for r in records if r["test_type"] == "autotest"),
        "insulation_or_continuity": sum(1 for r in records if r["test_type"] in {"insulation", "continuity"}),
        "conditions": conditions,
        "median_performance_pct": _round(statistics.median(perf_values), 1) if perf_values else None,
        "min_performance_pct": _round(min(perf_values), 1) if perf_values else None,
        "date_from": min((r["created_at"] for r in records if r.get("created_at")), default=None),
        "date_to": max((r["created_at"] for r in records if r.get("created_at")), default=None),
        "mi3115_records": validation["mi3115_records"],
        "solarworld_records": validation["solarworld_records"],
        "validation_status": validation["status"],
    }
    return {
        "summary": summary,
        "records": sorted(records, key=lambda r: (r.get("string_id") or "", r.get("module") or "", r.get("source_file") or "")),
        "strings": by_string,
        "module_verdicts": module_verdicts,
        "string_verdicts": string_verdicts,
        "worst_records": worst,
        "recommendations": _recommendations(records, by_string, module_verdicts, string_verdicts),
        "validation": validation,
        "warranty_model": _warranty_model_info(warranty),
        "methodology": _methodology(thresholds),
    }


def _validation_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    mi3115 = sum(1 for r in records if (r.get("instruments") or {}).get("has_mi3115"))
    solarworld = sum(1 for r in records if (r.get("module_profile") or {}).get("matches_solarworld"))
    solarworld_applicable = sum(1 for r in records if r["test_type"] in {"iv_curve", "uoc_isc", "autotest"})
    remote_iv = sum(
        1 for r in records
        if r["test_type"] == "iv_curve" and (r.get("instruments") or {}).get("has_remote")
    )
    iv_total = sum(1 for r in records if r["test_type"] == "iv_curve")
    high_conf = sum(1 for r in records if r.get("confidence") == "High")
    failed_checks: dict[str, int] = {}
    warnings: list[str] = []
    for r in records:
        for item in (r.get("validation") or {}).get("checks", []):
            if item["status"] == "fail":
                failed_checks[item["label"]] = failed_checks.get(item["label"], 0) + 1
        warnings.extend((r.get("validation") or {}).get("warnings", []))
    status = "Validated"
    if failed_checks:
        status = "Validated with warnings"
    if mi3115 == 0:
        status = "Not MI3115 verified"
    return {
        "status": status,
        "total_records": total,
        "mi3115_records": mi3115,
        "solarworld_records": solarworld,
        "solarworld_applicable_records": solarworld_applicable,
        "iv_curves_with_remote": remote_iv,
        "iv_curve_records": iv_total,
        "high_confidence_records": high_conf,
        "failed_checks": failed_checks,
        "warnings": sorted(set(warnings))[:12],
    }


def _group_strings(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        groups.setdefault(rec.get("string_id") or "Unassigned", []).append(rec)
    out: list[dict[str, Any]] = []
    for sid, rows in groups.items():
        perf = [r["performance_pct"] for r in rows if r.get("performance_pct") is not None]
        conditions = [r["condition"] for r in rows]
        worst_rank = max((_condition_rank(c) for c in conditions), default=0)
        out.append(
            {
                "string_id": sid,
                "tests": len(rows),
                "modules": len({r["module"] for r in rows if r.get("module")}),
                "median_performance_pct": _round(statistics.median(perf), 1) if perf else None,
                "min_performance_pct": _round(min(perf), 1) if perf else None,
                "condition": _rank_condition(worst_rank),
                "low_assets": [
                    r["asset_id"] for r in rows
                    if r.get("performance_pct") is not None and r["performance_pct"] < 90
                ][:6],
            }
        )
    return sorted(out, key=lambda r: (_condition_rank(r["condition"]), -(r["min_performance_pct"] or 999)), reverse=True)


def _group_module_verdicts(records: list[dict[str, Any]], t: FieldThresholds, warranty: WarrantyModel) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        if rec.get("module"):
            groups.setdefault(rec["asset_id"], []).append(rec)
    out = [_asset_verdict(asset, rows, t, warranty) for asset, rows in groups.items()]
    return sorted(out, key=lambda r: (_condition_rank(r["final_verdict"]), -(r["median_performance_pct"] or 999)), reverse=True)


def _group_string_verdicts(
    records: list[dict[str, Any]],
    module_verdicts: list[dict[str, Any]],
    t: FieldThresholds,
    warranty: WarrantyModel,
) -> list[dict[str, Any]]:
    record_groups: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        if rec.get("string_id"):
            record_groups.setdefault(rec["string_id"], []).append(rec)
    module_groups: dict[str, list[dict[str, Any]]] = {}
    for mv in module_verdicts:
        module_groups.setdefault(mv["string_id"], []).append(mv)

    out: list[dict[str, Any]] = []
    for string_id, rows in record_groups.items():
        modules = module_groups.get(string_id, [])
        verdict = _asset_verdict(string_id, rows, t, warranty, is_string=True)
        if modules:
            worst_module = max(modules, key=lambda r: _condition_rank(r["final_verdict"]))
            if _condition_rank(worst_module["final_verdict"]) > _condition_rank(verdict["final_verdict"]):
                verdict["final_verdict"] = worst_module["final_verdict"]
                verdict["basis"].append(f"Worst module verdict: {worst_module['asset_id']} = {worst_module['final_verdict']}")
        verdict["module_count"] = len(modules)
        verdict["weak_modules"] = [
            m["asset_id"] for m in modules
            if m["final_verdict"] in {"Watch", "Degraded", "Critical"}
        ][:8]
        out.append(verdict)
    return sorted(out, key=lambda r: (_condition_rank(r["final_verdict"]), -(r["median_performance_pct"] or 999)), reverse=True)


def _asset_verdict(
    asset_id: str,
    rows: list[dict[str, Any]],
    t: FieldThresholds,
    warranty: WarrantyModel,
    is_string: bool = False,
) -> dict[str, Any]:
    iv_rows = [r for r in rows if r["test_type"] == "iv_curve" and r.get("performance_pct") is not None]
    high_iv = [r for r in iv_rows if r.get("confidence") == "High"]
    power_rows = high_iv or iv_rows or [r for r in rows if r.get("performance_pct") is not None]
    power = [float(r["performance_pct"]) for r in power_rows if r.get("performance_pct") is not None]
    all_power = [float(r["performance_pct"]) for r in rows if r.get("performance_pct") is not None]
    safety_fail = any(
        {"instrument_fail", "insulation_below_limit", "continuity_above_limit"}.intersection(r.get("flags", []))
        for r in rows
    )
    low_current_votes = sum(1 for r in rows if "low_current" in r.get("flags", []))
    low_voltage_votes = sum(1 for r in rows if "low_voltage" in r.get("flags", []))
    low_ff_votes = sum(1 for r in rows if "low_fill_factor" in r.get("flags", []))

    median_pi = statistics.median(power) if power else None
    best_pi = max(power) if power else None
    worst_pi = min(power) if power else None
    spread = (max(power) - min(power)) if len(power) >= 2 else 0.0
    repeatability = _repeatability_status(spread, len(power))
    warranty_cmp = _warranty_comparison(median_pi, rows, warranty)
    flags: list[str] = []
    basis: list[str] = []

    if safety_fail:
        verdict = "Critical"
        basis.append("Safety or instrument fail evidence overrides power averaging.")
    elif median_pi is not None:
        if median_pi < t.critical_pct:
            verdict = "Critical"
            basis.append(f"Median corrected power index {median_pi:.1f}% is below critical threshold {t.critical_pct:.1f}%.")
        elif median_pi < t.warning_pct:
            verdict = "Degraded"
            basis.append(f"Median corrected power index {median_pi:.1f}% is below watch threshold {t.warning_pct:.1f}%.")
        elif median_pi < 95.0 or low_current_votes or low_voltage_votes or low_ff_votes:
            verdict = "Watch"
            basis.append(f"Median corrected power index {median_pi:.1f}% or supporting flags require monitoring.")
        else:
            verdict = "Healthy"
            basis.append(f"Median corrected power index {median_pi:.1f}% is within screening limits.")
    else:
        verdict = _rank_condition(max((_condition_rank(r["condition"]) for r in rows), default=1))
        basis.append("No corrected power evidence; verdict is based on available Uoc/Isc, auto-test, continuity, or insulation checks.")

    if len(power) >= 2:
        basis.append(f"{len(power)} corrected power tests used; repeatability spread {spread:.1f} percentage points.")
    elif len(power) == 1:
        basis.append("Single corrected power test used; repeat test recommended for acceptance confidence.")
        flags.append("single_power_test")
    else:
        flags.append("no_power_curve")

    if repeatability != "Stable":
        flags.append("repeatability_review")
        if verdict == "Healthy":
            verdict = "Watch"
        basis.append("Repeated tests are not tightly repeatable; use the median and retest under stable irradiance.")
    if low_current_votes:
        flags.append("current_loss_pattern")
    if low_voltage_votes:
        flags.append("voltage_loss_pattern")
    if low_ff_votes:
        flags.append("fill_factor_loss_pattern")
    if warranty_cmp.get("status") == "Below warranty line":
        flags.append("below_solarworld_warranty_line")

    prediction = _prediction_detail(
        rows=rows,
        verdict=verdict,
        repeatability=repeatability,
        power_tests=len(power),
        high_iv=len(high_iv),
        low_current_votes=low_current_votes,
        low_voltage_votes=low_voltage_votes,
        low_ff_votes=low_ff_votes,
        safety_fail=safety_fail,
        median_pi=median_pi,
        warranty_cmp=warranty_cmp,
        is_string=is_string,
    )

    return {
        "asset_id": asset_id,
        "string_id": rows[0].get("string_id") or asset_id,
        "scope": "string" if is_string else "module",
        "tests": len(rows),
        "iv_curve_tests": len(iv_rows),
        "high_confidence_iv_tests": len(high_iv),
        "power_tests_used": len(power),
        "median_performance_pct": _round(median_pi, 1),
        "best_performance_pct": _round(best_pi, 1),
        "worst_performance_pct": _round(worst_pi, 1),
        "all_power_median_pct": _round(statistics.median(all_power), 1) if all_power else None,
        "repeatability_spread_pct": _round(spread, 1),
        "repeatability": repeatability,
        "low_current_votes": low_current_votes,
        "low_voltage_votes": low_voltage_votes,
        "low_fill_factor_votes": low_ff_votes,
        "final_verdict": verdict,
        "solarworld_warranty": warranty_cmp,
        "confidence_score_pct": prediction["confidence_score_pct"],
        "confidence_level": prediction["confidence_level"],
        "likely_causes": prediction["likely_causes"],
        "next_action": prediction["next_action"],
        "prediction_basis": prediction["prediction_basis"],
        "flags": flags,
        "basis": basis,
    }


def _repeatability_status(spread: float, n: int) -> str:
    if n < 2:
        return "Single test"
    if spread <= 2.0:
        return "Stable"
    if spread <= 5.0:
        return "Review"
    return "Unstable"


def _warranty_model_info(w: WarrantyModel) -> dict[str, Any]:
    return {
        "source": "SolarWorld Sunmodule SW 340-350 XL MONO datasheet plus SolarWorld linear performance guarantee wording",
        "start_date": w.start_date,
        "first_year_min_pct": w.first_year_min_pct,
        "annual_degradation_pct": w.annual_degradation_pct,
        "term_years": w.term_years,
        "formula": "warranted_min_pct = first_year_min_pct - annual_degradation_pct * age_years, clamped to warranty term",
        "notes": [
            "Exact archived datasheet confirms 25-year linear performance guarantee and 10-year product warranty for SW 350 XL mono.",
            "SolarWorld warranty materials state first-year minimum performance around 97% and maximum linear degradation of 0.7% per year.",
            "Warranty comparison is only as correct as the entered warranty/commissioning start date.",
        ],
    }


def _warranty_comparison(
    measured_pi: float | None,
    rows: list[dict[str, Any]],
    w: WarrantyModel,
) -> dict[str, Any]:
    test_date = _representative_test_date(rows)
    start = _date_from_iso(w.start_date)
    if measured_pi is None:
        return {"available": False, "status": "No corrected power evidence", "test_date": test_date}
    if start is None:
        return {
            "available": False,
            "status": "Start date required",
            "test_date": test_date,
            "measured_pi_pct": _round(measured_pi, 1),
            "measured_degradation_pct": _round(100.0 - measured_pi, 1),
        }
    test_dt = _date_from_iso(test_date) or datetime.now().date()
    age_years = max(0.0, (test_dt - start).days / 365.25)
    age_for_warranty = min(age_years, float(w.term_years))
    warranted_min = max(0.0, w.first_year_min_pct - w.annual_degradation_pct * age_for_warranty)
    allowed_degradation = 100.0 - warranted_min
    measured_degradation = 100.0 - measured_pi
    margin = measured_pi - warranted_min
    if age_years > w.term_years:
        status = "Outside warranty term"
    elif margin >= 0:
        status = "Above warranty line"
    else:
        status = "Below warranty line"
    return {
        "available": True,
        "status": status,
        "start_date": start.isoformat(),
        "test_date": test_dt.isoformat(),
        "age_years": _round(age_years, 2),
        "warranted_min_pct": _round(warranted_min, 1),
        "measured_pi_pct": _round(measured_pi, 1),
        "measured_degradation_pct": _round(measured_degradation, 1),
        "allowed_degradation_pct": _round(allowed_degradation, 1),
        "margin_to_warranty_pct": _round(margin, 1),
    }


def _representative_test_date(rows: list[dict[str, Any]]) -> str | None:
    dates = [r.get("created_at") for r in rows if r.get("created_at")]
    if not dates:
        return None
    return max(dates)[:10]


def _date_from_iso(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _prediction_detail(
    rows: list[dict[str, Any]],
    verdict: str,
    repeatability: str,
    power_tests: int,
    high_iv: int,
    low_current_votes: int,
    low_voltage_votes: int,
    low_ff_votes: int,
    safety_fail: bool,
    median_pi: float | None,
    warranty_cmp: dict[str, Any],
    is_string: bool,
) -> dict[str, Any]:
    valid_records = sum(1 for r in rows if (r.get("validation") or {}).get("valid"))
    autotests = sum(1 for r in rows if r["test_type"] == "autotest")
    uoc_isc = sum(1 for r in rows if r["test_type"] == "uoc_isc")

    score = 35
    if high_iv >= 1:
        score += 22
    if high_iv >= 2:
        score += 12
    if power_tests >= 3:
        score += 6
    if repeatability == "Stable" and power_tests >= 2:
        score += 14
    elif repeatability == "Review":
        score -= 8
    elif repeatability == "Unstable":
        score -= 24
    elif power_tests == 1:
        score -= 8
    elif power_tests == 0:
        score -= 22
    if valid_records == len(rows):
        score += 8
    if autotests:
        score += 4
    if uoc_isc:
        score += 4
    score = int(max(10, min(98, score)))

    if score >= 85:
        level = "High"
    elif score >= 65:
        level = "Medium"
    else:
        level = "Low"

    likely = _likely_causes(
        verdict, repeatability, low_current_votes, low_voltage_votes, low_ff_votes,
        safety_fail, median_pi, is_string
    )
    action = _next_action(verdict, repeatability, likely, power_tests, is_string)
    basis = [
        f"Confidence uses {high_iv} high-confidence IV test(s), {power_tests} corrected power test(s), and {valid_records}/{len(rows)} validated record(s).",
        f"Repeatability classification: {repeatability}.",
    ]
    if median_pi is not None:
        basis.append(f"Final median corrected power index: {median_pi:.1f}%.")
    if warranty_cmp.get("available"):
        basis.append(
            f"SolarWorld warranty comparison: measured {warranty_cmp['measured_pi_pct']:.1f}% vs warranted minimum {warranty_cmp['warranted_min_pct']:.1f}% at age {warranty_cmp['age_years']:.2f} years."
        )
    if low_current_votes or low_voltage_votes or low_ff_votes:
        basis.append(
            f"Pattern votes - current: {low_current_votes}, voltage: {low_voltage_votes}, fill factor: {low_ff_votes}."
        )

    return {
        "confidence_score_pct": score,
        "confidence_level": level,
        "likely_causes": likely,
        "next_action": action,
        "prediction_basis": basis,
    }


def _likely_causes(
    verdict: str,
    repeatability: str,
    low_current_votes: int,
    low_voltage_votes: int,
    low_ff_votes: int,
    safety_fail: bool,
    median_pi: float | None,
    is_string: bool,
) -> list[str]:
    if safety_fail:
        return ["Electrical safety or instrument fail evidence"]
    if repeatability == "Unstable":
        return ["Unstable test conditions or inconsistent contact/sensor setup"]

    causes: list[str] = []
    if low_ff_votes:
        causes.append("Series resistance, connector heating, cell damage, or sweep disturbance")
    if low_current_votes > low_voltage_votes:
        causes.append("Soiling, shading, irradiance-plane mismatch, cracked cells, or module degradation")
    if low_voltage_votes > low_current_votes:
        causes.append("Bypass section, wrong module count, hot-cell behavior, or connection issue")
    if low_current_votes and low_voltage_votes and low_current_votes == low_voltage_votes:
        causes.append("Combined current and voltage loss; verify wiring, module count, irradiance reference, and module damage")
    if not causes and verdict in {"Degraded", "Critical"}:
        causes.append("Uniform corrected power deficit compared with SolarWorld STC reference")
    if not causes and verdict == "Watch" and median_pi is not None and median_pi < 95.0:
        causes.append("Mild underperformance; trend against repeat tests before replacement")
    if is_string and verdict in {"Watch", "Degraded", "Critical"}:
        causes.append("String verdict may be driven by one weak module or shared string wiring/sensor conditions")
    if not causes:
        causes.append("No abnormal electrical pattern detected")
    return causes


def _next_action(
    verdict: str,
    repeatability: str,
    likely_causes: list[str],
    power_tests: int,
    is_string: bool,
) -> str:
    if verdict == "Critical":
        return "Isolate the affected asset, verify safety limits, inspect wiring/connectors, and repeat MI3115 IV and safety tests before energizing."
    if repeatability in {"Review", "Unstable"}:
        return "Repeat the MI3115 IV curve under stable irradiance with verified sensor plane and clean module surface; use the repeat result before replacement decisions."
    joined = " ".join(likely_causes).lower()
    if "series resistance" in joined:
        return "Inspect connectors and junction box, perform thermography under load, then repeat IV curve after correction."
    if "soiling" in joined:
        return "Clean the module/string, confirm no shading, align irradiance sensor to module plane, then repeat IV curve."
    if "bypass" in joined:
        return "Check module count, polarity, bypass diode sections, hot-cell evidence, and connector voltage drops, then repeat Uoc/Isc and IV tests."
    if verdict == "Degraded":
        return "Confirm with at least one repeat IV curve after cleaning and visual/thermal inspection; compare against neighboring module/string baseline."
    if verdict == "Watch":
        return "Keep in monitoring list and repeat during the next field round; escalate if median PI drops or repeatability worsens."
    if power_tests < 2:
        return "Use as a provisional baseline; add one repeat IV curve for stronger future trending."
    return "Accept as current baseline and trend future MI3115 tests against this result."


def _condition_rank(condition: str) -> int:
    return {"Healthy": 0, "Watch": 1, "Needs review": 1, "Degraded": 2, "Critical": 3}.get(condition, 1)


def _rank_condition(rank: int) -> str:
    return {0: "Healthy", 1: "Watch", 2: "Degraded", 3: "Critical"}.get(rank, "Watch")


def _recommendations(
    records: list[dict[str, Any]],
    strings: list[dict[str, Any]],
    module_verdicts: list[dict[str, Any]] | None = None,
    string_verdicts: list[dict[str, Any]] | None = None,
) -> list[str]:
    recs: list[str] = []
    module_verdicts = module_verdicts or []
    string_verdicts = string_verdicts or []
    if any(not (r.get("instruments") or {}).get("has_mi3115") for r in records):
        recs.append("Some records are not confirmed as Metrel MI 3115 exports; verify source files before final acceptance.")
    if any(not (r.get("module_profile") or {}).get("matches_solarworld") for r in records if r["test_type"] in {"iv_curve", "uoc_isc", "autotest"}):
        recs.append("Some electrical records did not match the SolarWorld SW XL 350 mono profile; verify the module library used in the meter.")
    if any(r["condition"] == "Critical" for r in records):
        recs.append("Prioritize Critical records before production retest; do not average them into acceptance results.")
    if any("low_current" in r["flags"] for r in records):
        recs.append("For low-current assets, clean the module surface, verify irradiance sensor plane, and repeat IV curve at stable irradiance.")
    if any("low_voltage" in r["flags"] for r in records):
        recs.append("For low-voltage assets, verify module count, bypass diode sections, connectors, and thermal anomalies.")
    if any("low_fill_factor" in r["flags"] for r in records):
        recs.append("Low fill factor should be followed by connector thermography and resistance/continuity checks.")
    if any(s["condition"] in {"Degraded", "Critical"} for s in strings):
        recs.append("Compare weak strings against neighboring strings on the same tracker/inverter to separate site effects from module faults.")
    if any(v["repeatability"] in {"Review", "Unstable"} for v in module_verdicts):
        recs.append("Some repeated module tests are not repeatable; retest those assets under stable irradiance before using the final verdict for replacement decisions.")
    if any(v["power_tests_used"] < 2 and v["final_verdict"] in {"Watch", "Degraded", "Critical"} for v in module_verdicts):
        recs.append("Weak modules with only one IV curve should receive at least one repeat IV test after cleaning and sensor-plane verification.")
    if any(v["final_verdict"] in {"Degraded", "Critical"} for v in string_verdicts):
        recs.append("For degraded strings, compare the module verdict list to decide whether the string issue is one weak module, repeated current loss, or a broader string wiring/sensor issue.")
    if not recs:
        recs.append("Uploaded records are broadly within the configured thresholds; keep the dataset as the baseline for future degradation trending.")
    return recs


def _methodology(t: FieldThresholds) -> dict[str, Any]:
    return {
        "standards_alignment": [
            "IEC 62446-1 style commissioning/inspection data structure: polarity, open-circuit voltage, short-circuit current, insulation, continuity, and IV curve records are kept traceable by asset path.",
            "IEC 60891 style correction principle: translate field IV power to reference conditions using irradiance and module temperature coefficients when the instrument has not already supplied normalized values.",
            "IEC 60904 family principle: prefer tests at stable irradiance and treat low-irradiance records as lower confidence.",
            "Metrel MI 3115 workflow: analyzer serial, calibration visibility, and A 1785 remote environmental unit are checked when present in the PDF export.",
        ],
        "assumptions": [
            "Instrument-normalized Pmpp, Uoc, Isc, Umpp, and Impp are treated as the primary corrected values.",
            "For SolarWorld Sunmodule SW XL 350 mono, the built-in specialist profile is Pmax 350 W, Umpp 38.4 V, Impp 9.17 A, Uoc 48.0 V, Isc 9.82 A, NOCT 46 C, alpha 0.0041244 A/C, beta -0.146 V/C, gamma -0.430 %/C, Rs 0.3 ohm, bifaciality 0.",
            "Fallback STC translation uses P_stc = P_meas * (1000 / G) / (1 + gamma * (Tcell - 25)).",
            "Expected STC power is Pmpp_n from the instrument, otherwise datasheet Pmax multiplied by the number of modules in string.",
            "Condition thresholds are screening thresholds, not warranty acceptance limits; final acceptance should use the contract/module tolerance and retest rules.",
            "When the same module or string has repeated tests, the final verdict uses high-confidence IV curves first, then other corrected power evidence, while still preserving every individual record.",
        ],
        "formulas": [
            "Performance index (%) = 100 * corrected Pmpp / expected STC Pmpp.",
            "Delta Pmpp (%) = 100 * (corrected Pmpp / expected STC Pmpp - 1).",
            "Fill factor (%) = 100 * Pmpp / (Voc * Isc).",
            "Current/voltage deviation (%) = 100 * (corrected value / nominal value - 1).",
            "String condition = worst condition among records assigned to that string.",
            "Repeated-test final PI = median of high-confidence corrected IV power indexes for the asset; if no high-confidence IV exists, median of available corrected power indexes is used.",
            "Repeatability spread = maximum PI minus minimum PI among tests used for the final verdict; <=2 percentage points is Stable, <=5 is Review, and >5 is Unstable.",
            "Final module/string verdict = safety failure override, otherwise median PI threshold, upgraded to Watch when repeatability is not Stable.",
        ],
        "thresholds": {
            "warning_pct": t.warning_pct,
            "critical_pct": t.critical_pct,
            "voltage_warning_pct": t.voltage_warning_pct,
            "current_warning_pct": t.current_warning_pct,
            "irradiance_min_wm2": t.irradiance_min_wm2,
            "ff_warning_pct": t.ff_warning_pct,
        },
    }


def _round(value: float | None, ndigits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), ndigits)


def _norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
