from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
TMP_DIR = ROOT / '.tmp'

PV_JSON = DATA_DIR / 'pv-modules.json'
GRID_JSON = DATA_DIR / 'grid-inverters.json'
BAT_JSON = DATA_DIR / 'hybrid-batteries.json'

CEC_MODULES = TMP_DIR / 'cec_modules.csv'
CEC_INVERTERS = TMP_DIR / 'cec_inverters.csv'

CEC_MODULES_URL = 'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv'
CEC_INVERTERS_URL = 'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv'

MODULE_KEYWORDS = (
    'jinko', 'ja solar', 'longi', 'trina', 'csi solar', 'canadian', 'risen',
    'qcells', 'suntech', 'phono', 'talesun', 'seraphim', 'rec', 'axitec',
    'waaree', 'znshine', 'chint', 'sunpower', 'runergy'
)

INVERTER_KEYWORDS = (
    'growatt', 'goodwe', 'huawei', 'ginlong', 'solis', 'fronius', 'kaco',
    'abb', 'fimer', 'afore', 'deye', 'solax', 'sungrow', 'canadian solar',
    'csi solar', 'sma', 'delta', 'solaredge', 'enphase', 'sol-ark', 'dyness',
    'foxess', 'megarevo', 'srne'
)


def clean_text(v: Any, max_len: int = 240) -> str:
    s = '' if v is None else str(v)
    s = re.sub(r'[\x00-\x1F\x7F]+', '', s).strip()
    return s[:max_len]


def slug_id(*parts: str) -> str:
    s = '_'.join(clean_text(p, 100).lower() for p in parts if clean_text(p, 100))
    s = re.sub(r'[^a-z0-9_]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:96]


def as_float(v: Any) -> float | None:
    try:
        n = float(v)
    except Exception:
        return None
    return n if math.isfinite(n) else None


def clamp(v: float, lo: float, hi: float) -> float:
    return min(max(v, lo), hi)


def round_n(v: float | None, n: int = 3) -> float | None:
    if v is None:
        return None
    return float(f'{v:.{n}f}')


def canonical_module_mfr(raw: str) -> str:
    m = clean_text(raw, 140)
    ml = m.lower()
    if 'ja solar' in ml:
        return 'JA Solar'
    if 'jinko' in ml:
        return 'Jinko Solar'
    if 'longi' in ml:
        return 'LONGi'
    if 'trina' in ml:
        return 'Trina Solar'
    if 'csi solar' in ml or 'canadian' in ml:
        return 'Canadian Solar'
    if 'risen' in ml:
        return 'Risen Energy'
    if 'qcells' in ml:
        return 'Qcells'
    if 'suntech' in ml:
        return 'Suntech'
    if 'phono' in ml:
        return 'Phono Solar'
    if 'talesun' in ml:
        return 'Talesun'
    if ml.startswith('rec'):
        return 'REC'
    if 'axitec' in ml:
        return 'AXITEC'
    if 'waaree' in ml:
        return 'Waaree'
    if 'znshine' in ml:
        return 'ZNSHINE'
    if 'chint' in ml:
        return 'Chint'
    if 'sunpower' in ml:
        return 'SunPower'
    if 'runergy' in ml:
        return 'Runergy'
    return m


def canonical_inverter_mfr(raw: str) -> str:
    m = clean_text(raw, 140)
    ml = m.lower()
    if 'growatt' in ml:
        return 'Growatt'
    if 'goodwe' in ml:
        return 'GoodWe'
    if 'huawei' in ml:
        return 'Huawei'
    if 'ginlong' in ml or 'solis' in ml:
        return 'Solis (Ginlong)'
    if 'fronius' in ml:
        return 'Fronius'
    if 'kaco' in ml:
        return 'KACO New Energy'
    if ml == 'abb' or 'abb' in ml:
        return 'ABB/FIMER'
    if 'fimer' in ml:
        return 'ABB/FIMER'
    if 'afore' in ml:
        return 'Afore'
    if 'deye' in ml:
        return 'Deye'
    if 'solax' in ml:
        return 'SolaX'
    if 'sungrow' in ml:
        return 'Sungrow'
    if 'csi solar' in ml or 'canadian solar' in ml:
        return 'Canadian Solar'
    if ml.startswith('sma'):
        return 'SMA'
    if 'delta' in ml:
        return 'Delta'
    if 'solaredge' in ml:
        return 'SolarEdge'
    if 'enphase' in ml:
        return 'Enphase'
    if 'sol-ark' in ml:
        return 'Sol-Ark'
    if 'dyness' in ml:
        return 'Dyness'
    if 'foxess' in ml:
        return 'FoxESS'
    if 'megarevo' in ml:
        return 'Megarevo'
    if 'srne' in ml:
        return 'SRNE'
    return m


def load_csv_rows(path: Path) -> Iterable[Dict[str, str]]:
    with path.open(newline='', encoding='utf-8-sig', errors='ignore') as f:
        r = csv.DictReader(f)
        for row in r:
            name = clean_text(row.get('Name', ''), 200)
            if not name or name in {'Units', '[0]'}:
                continue
            yield row


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def expand_modules(pv_payload: Dict[str, Any]) -> Tuple[int, int]:
    modules: List[Dict[str, Any]] = list(pv_payload.get('modules') or [])
    registry: List[Dict[str, Any]] = list(pv_payload.get('registry') or [])

    existing_ids = {clean_text(x.get('id', ''), 120).lower() for x in modules if x.get('id')}
    existing_keys = {
        (clean_text(x.get('manufacturer', ''), 120).lower(), clean_text(x.get('model', ''), 180).lower())
        for x in modules
    }

    added = 0
    for row in load_csv_rows(CEC_MODULES):
        manufacturer_raw = clean_text(row.get('Manufacturer', ''), 160)
        ml = manufacturer_raw.lower()
        if not any(k in ml for k in MODULE_KEYWORDS):
            continue

        stc = as_float(row.get('STC'))
        voc = as_float(row.get('V_oc_ref'))
        vmp = as_float(row.get('V_mp_ref'))
        isc = as_float(row.get('I_sc_ref'))
        imp = as_float(row.get('I_mp_ref'))
        noct = as_float(row.get('T_NOCT'))
        cells = int(as_float(row.get('N_s')) or 72)
        if None in (stc, voc, vmp, isc, imp) or stc < 430:
            continue
        if not (0 < vmp <= voc and 0 < imp <= isc):
            continue

        manufacturer = canonical_module_mfr(manufacturer_raw)
        model = clean_text(row.get('Name', ''), 180)
        mid = slug_id(manufacturer, model)
        key = (manufacturer.lower(), model.lower())
        if mid in existing_ids or key in existing_keys:
            continue

        alpha_sc = as_float(row.get('alpha_sc'))
        beta_oc = as_float(row.get('beta_oc'))
        gamma_pmp = as_float(row.get('gamma_pmp'))

        coeff_isc = (alpha_sc / isc) if (alpha_sc is not None and isc > 0) else 0.00048
        coeff_voc = (beta_oc / voc) if (beta_oc is not None and voc > 0) else -0.0026
        if gamma_pmp is None:
            coeff_pmp = -0.0030
        else:
            coeff_pmp = gamma_pmp / 100.0 if abs(gamma_pmp) > 0.05 else gamma_pmp

        coeff_isc = clamp(coeff_isc, 0.0, 0.01)
        coeff_voc = clamp(coeff_voc, -0.02, 0.0)
        coeff_pmp = clamp(coeff_pmp, -0.02, 0.0)
        noct = clamp(noct if noct is not None else 45.0, 20.0, 80.0)

        technology = clean_text(row.get('Technology', ''), 80)

        modules.append({
            'id': mid,
            'manufacturer': manufacturer,
            'model': model,
            'Pmax': round_n(stc, 3),
            'Voc': round_n(voc, 3),
            'Vmp': round_n(vmp, 3),
            'Isc': round_n(isc, 3),
            'Imp': round_n(imp, 3),
            'coeffVoc': round_n(coeff_voc, 6),
            'coeffIsc': round_n(coeff_isc, 6),
            'coeffPmax': round_n(coeff_pmp, 6),
            'coeffVmp': round_n(coeff_voc, 6),
            'coeffImp': round_n(coeff_isc, 6),
            'NOCT': round_n(noct, 2),
            'NMOT': round_n(noct, 2),
            'cells': cells,
            'seriesFuseA': None,
            'maxSystemV': 1500,
            'tolerancePlusPct': 0,
            'toleranceMinusPct': 0,
            'datasheetUrl': CEC_MODULES_URL,
            'datasheetRev': 'CEC Modules.csv (NREL SAM develop)',
            'catalogueBacked': True,
            'sourceConfidence': 'medium',
            'preloaded': True,
            'note': clean_text(f'CEC/SAM public module listing. Tech: {technology}' if technology else 'CEC/SAM public module listing.', 220),
        })

        registry.append({
            'manufacturer': manufacturer,
            'model': model,
            'modelFamily': clean_text(model.split(' ')[0], 120),
            'calculationReady': True,
            'method': 'cec_modules_csv',
            'sourceUrl': CEC_MODULES_URL,
            'sourceConfidence': 'medium',
        })

        existing_ids.add(mid)
        existing_keys.add(key)
        added += 1

    modules.sort(key=lambda x: (clean_text(x.get('manufacturer', ''), 120), clean_text(x.get('model', ''), 180)))
    registry.sort(key=lambda x: (clean_text(x.get('manufacturer', ''), 120), clean_text(x.get('model', ''), 180)))

    pv_payload['modules'] = modules
    pv_payload['registry'] = registry
    pv_payload['version'] = '2026-04-09'
    src = clean_text(pv_payload.get('source', ''), 400)
    if 'CEC Modules.csv' not in src:
        pv_payload['source'] = clean_text(src + ' + NREL SAM CEC Modules.csv expansion', 380) if src else 'NREL SAM CEC Modules.csv expansion'

    return added, len(modules)


def expand_grid_inverters(grid_payload: Dict[str, Any]) -> Tuple[int, int]:
    rows: List[Dict[str, Any]] = list(grid_payload.get('inverters') or [])

    existing_ids = {clean_text(x.get('id', ''), 120).lower() for x in rows if x.get('id')}
    existing_keys = {
        (clean_text(x.get('manufacturer', ''), 120).lower(), clean_text(x.get('model', ''), 200).lower())
        for x in rows
    }

    grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}

    for row in load_csv_rows(CEC_INVERTERS):
        name = clean_text(row.get('Name', ''), 220)
        if ':' not in name:
            continue

        mfr_raw, model_raw = name.split(':', 1)
        mfr_raw = clean_text(mfr_raw, 140)
        # Keep full CEC inverter coverage (all manufacturers), then normalize names.

        model = clean_text(model_raw, 180)
        model = re.sub(r'\s*\[[^\]]+\]\s*$', '', model).strip()
        if not model:
            continue

        paco = as_float(row.get('Paco'))
        if paco is None:
            continue
        ac_kw = paco / 1000.0
        if ac_kw < 0.6 or ac_kw > 200.0:
            continue

        mfr = canonical_inverter_mfr(mfr_raw)

        key = (mfr, model)
        g = grouped.get(key)
        if g is None:
            g = {
                'manufacturer': mfr,
                'model': model,
                'acRated_kW': ac_kw,
                'maxDcVoc_V': as_float(row.get('Vdcmax')),
                'mpptMin_V': as_float(row.get('Mppt_low')),
                'mpptMax_V': as_float(row.get('Mppt_high')),
                'maxCurrentPerMppt_A': as_float(row.get('Idcmax')),
                'hasHybridFlag': clean_text(row.get('CEC_hybrid', ''), 10).upper() == 'Y',
            }
            grouped[key] = g
        else:
            g['acRated_kW'] = max(g['acRated_kW'], ac_kw)
            for f in ('maxDcVoc_V', 'mpptMin_V', 'mpptMax_V', 'maxCurrentPerMppt_A'):
                cur = g.get(f)
                new = as_float(row.get({'maxDcVoc_V': 'Vdcmax', 'mpptMin_V': 'Mppt_low', 'mpptMax_V': 'Mppt_high', 'maxCurrentPerMppt_A': 'Idcmax'}[f]))
                if new is None:
                    continue
                if cur is None:
                    g[f] = new
                elif f == 'mpptMin_V':
                    g[f] = min(cur, new)
                else:
                    g[f] = max(cur, new)
            if clean_text(row.get('CEC_hybrid', ''), 10).upper() == 'Y':
                g['hasHybridFlag'] = True

    added = 0
    for (mfr, model), g in grouped.items():
        iid = slug_id(mfr, model)
        k = (mfr.lower(), model.lower())
        if iid in existing_ids or k in existing_keys:
            continue

        note = 'CEC/SAM inverter listing entry.'
        if g.get('hasHybridFlag'):
            note = 'CEC/SAM inverter listing entry (CEC_hybrid=Y). Verify battery-side specs in hybrid design.'

        rows.append({
            'id': iid,
            'manufacturer': mfr,
            'model': model,
            'topology': 'grid-tie',
            'acRated_kW': round_n(g.get('acRated_kW'), 3),
            'maxDcVoc_V': round_n(g.get('maxDcVoc_V'), 3),
            'mpptMin_V': round_n(g.get('mpptMin_V'), 3),
            'mpptMax_V': round_n(g.get('mpptMax_V'), 3),
            'mpptCount': None,
            'maxCurrentPerMppt_A': round_n(g.get('maxCurrentPerMppt_A'), 3),
            'utilityListed': {
                'ceb_2025': False,
                'leco_2025': False,
            },
            'listingSource': {
                'ceb_2025': 'NREL SAM CEC inverter catalog (not utility-approval evidence).',
                'leco_2025': 'NREL SAM CEC inverter catalog (not utility-approval evidence).',
            },
            'datasheetUrl': CEC_INVERTERS_URL,
            'datasheetRev': 'CEC Inverters.csv (NREL SAM develop)',
            'sourceConfidence': 'medium',
            'note': note,
        })

        existing_ids.add(iid)
        existing_keys.add(k)
        added += 1

    rows.sort(key=lambda x: (clean_text(x.get('manufacturer', ''), 120), clean_text(x.get('model', ''), 180)))

    grid_payload['inverters'] = rows
    grid_payload['version'] = '2026-04-09'
    src = clean_text(grid_payload.get('source', ''), 400)
    if 'CEC Inverters.csv' not in src:
        grid_payload['source'] = clean_text(src + ' + NREL SAM CEC Inverters.csv expansion', 380) if src else 'NREL SAM CEC Inverters.csv expansion'

    return added, len(rows)


def expand_batteries(bat_payload: Dict[str, Any]) -> Tuple[int, int]:
    rows: List[Dict[str, Any]] = list(bat_payload.get('batteries') or [])
    existing = {clean_text(x.get('id', ''), 120).lower() for x in rows}

    additions: List[Dict[str, Any]] = [
        {
            'id': 'dyness_dl5_0c',
            'manufacturer': 'Dyness',
            'model': 'DL5.0C',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 100.0,
            'recommendedDod': 0.90,
            'continuousCharge_A': 50.0,
            'continuousDischarge_A': 75.0,
            'peakDischarge_A': 110.0,
            'peakDuration_s': 15.0,
            'tempMinC': -20.0,
            'tempMaxC': 55.0,
            'datasheetRev': 'DL5.0C V1.0-20241011',
            'datasheetUrl': 'https://dyness.com/Public/Uploads/uploadfile/files/20241016/DynessDL5.0CdatasheetEN.pdf',
            'note': 'Charge temp 0..55C, discharge temp -20..55C. Pack min/max set to full operating envelope.',
        },
        {
            'id': 'byd_hvs_5_1',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium HVS 5.1',
            'chemistry': 'lifepo4',
            'nominalV': 204.8,
            'capacityAh': 25.0,
            'recommendedDod': 0.95,
            'continuousCharge_A': 25.0,
            'continuousDischarge_A': 25.0,
            'peakDischarge_A': 50.0,
            'peakDuration_s': 3.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'HVS V1.4 (2024-12)',
            'datasheetUrl': 'https://bydbatterybox.com/uploads/downloads/241212_Datasheet_Battery-Box%20HVS_V1.4_EN-675a34b4e7bfb.pdf',
            'note': '2 modules, 5.12kWh usable.',
        },
        {
            'id': 'byd_hvs_7_7',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium HVS 7.7',
            'chemistry': 'lifepo4',
            'nominalV': 307.2,
            'capacityAh': 25.0,
            'recommendedDod': 0.95,
            'continuousCharge_A': 25.0,
            'continuousDischarge_A': 25.0,
            'peakDischarge_A': 50.0,
            'peakDuration_s': 3.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'HVS V1.4 (2024-12)',
            'datasheetUrl': 'https://bydbatterybox.com/uploads/downloads/241212_Datasheet_Battery-Box%20HVS_V1.4_EN-675a34b4e7bfb.pdf',
            'note': '3 modules, 7.68kWh usable.',
        },
        {
            'id': 'byd_hvs_10_2',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium HVS 10.2',
            'chemistry': 'lifepo4',
            'nominalV': 409.6,
            'capacityAh': 25.0,
            'recommendedDod': 0.95,
            'continuousCharge_A': 25.0,
            'continuousDischarge_A': 25.0,
            'peakDischarge_A': 50.0,
            'peakDuration_s': 3.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'HVS V1.4 (2024-12)',
            'datasheetUrl': 'https://bydbatterybox.com/uploads/downloads/241212_Datasheet_Battery-Box%20HVS_V1.4_EN-675a34b4e7bfb.pdf',
            'note': '4 modules, 10.24kWh usable.',
        },
        {
            'id': 'byd_hvs_12_8',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium HVS 12.8',
            'chemistry': 'lifepo4',
            'nominalV': 512.0,
            'capacityAh': 25.0,
            'recommendedDod': 0.95,
            'continuousCharge_A': 25.0,
            'continuousDischarge_A': 25.0,
            'peakDischarge_A': 50.0,
            'peakDuration_s': 3.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'HVS V1.4 (2024-12)',
            'datasheetUrl': 'https://bydbatterybox.com/uploads/downloads/241212_Datasheet_Battery-Box%20HVS_V1.4_EN-675a34b4e7bfb.pdf',
            'note': '5 modules, 12.8kWh usable.',
        },
        {
            'id': 'byd_lvs_4_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 4.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 78.125,
            'recommendedDod': 0.95,
            'continuousCharge_A': 65.0,
            'continuousDischarge_A': 65.0,
            'peakDischarge_A': 90.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Single module tower.',
        },
        {
            'id': 'byd_lvs_8_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 8.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 156.25,
            'recommendedDod': 0.95,
            'continuousCharge_A': 130.0,
            'continuousDischarge_A': 130.0,
            'peakDischarge_A': 180.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Two-module tower.',
        },
        {
            'id': 'byd_lvs_12_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 12.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 234.375,
            'recommendedDod': 0.95,
            'continuousCharge_A': 195.0,
            'continuousDischarge_A': 195.0,
            'peakDischarge_A': 270.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Three-module tower.',
        },
        {
            'id': 'byd_lvs_16_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 16.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 312.5,
            'recommendedDod': 0.95,
            'continuousCharge_A': 250.0,
            'continuousDischarge_A': 250.0,
            'peakDischarge_A': 360.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Four-module tower.',
        },
        {
            'id': 'byd_lvs_20_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 20.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 390.625,
            'recommendedDod': 0.95,
            'continuousCharge_A': 250.0,
            'continuousDischarge_A': 250.0,
            'peakDischarge_A': 360.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Five-module tower (single-tower only in datasheet).',
        },
        {
            'id': 'byd_lvs_24_0',
            'manufacturer': 'BYD',
            'model': 'Battery-Box Premium LVS 24.0',
            'chemistry': 'lifepo4',
            'nominalV': 51.2,
            'capacityAh': 468.75,
            'recommendedDod': 0.95,
            'continuousCharge_A': 250.0,
            'continuousDischarge_A': 250.0,
            'peakDischarge_A': 360.0,
            'peakDuration_s': 5.0,
            'tempMinC': -10.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'LVS AU V1.1',
            'datasheetUrl': 'https://www.bydbatterybox.com/uploads/downloads/Datasheet%20BYD%20Premium%20LVS%204.0-24.0%20AU%20V1.1-5f977de8ed8ce.pdf',
            'note': 'Six-module tower (single-tower only in datasheet).',
        },
        {
            'id': 'sungrow_sbr064',
            'manufacturer': 'Sungrow',
            'model': 'SBR064',
            'chemistry': 'lifepo4',
            'nominalV': 128.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '2 modules (6.4kWh). Some inverter families may cap SBR064 current lower; verify compatibility sheet.',
        },
        {
            'id': 'sungrow_sbr096',
            'manufacturer': 'Sungrow',
            'model': 'SBR096',
            'chemistry': 'lifepo4',
            'nominalV': 192.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '3 modules (9.6kWh).',
        },
        {
            'id': 'sungrow_sbr128',
            'manufacturer': 'Sungrow',
            'model': 'SBR128',
            'chemistry': 'lifepo4',
            'nominalV': 256.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '4 modules (12.8kWh).',
        },
        {
            'id': 'sungrow_sbr160',
            'manufacturer': 'Sungrow',
            'model': 'SBR160',
            'chemistry': 'lifepo4',
            'nominalV': 320.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '5 modules (16.0kWh).',
        },
        {
            'id': 'sungrow_sbr192',
            'manufacturer': 'Sungrow',
            'model': 'SBR192',
            'chemistry': 'lifepo4',
            'nominalV': 384.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '6 modules (19.2kWh).',
        },
        {
            'id': 'sungrow_sbr224',
            'manufacturer': 'Sungrow',
            'model': 'SBR224',
            'chemistry': 'lifepo4',
            'nominalV': 448.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '7 modules (22.4kWh).',
        },
        {
            'id': 'sungrow_sbr256',
            'manufacturer': 'Sungrow',
            'model': 'SBR256',
            'chemistry': 'lifepo4',
            'nominalV': 512.0,
            'capacityAh': 50.0,
            'recommendedDod': 1.0,
            'continuousCharge_A': 30.0,
            'continuousDischarge_A': 30.0,
            'peakDischarge_A': 30.0,
            'peakDuration_s': 0.0,
            'tempMinC': -20.0,
            'tempMaxC': 50.0,
            'datasheetRev': 'SBR V5 (2024-09)',
            'datasheetUrl': 'https://info-support.sungrowpower.com/application/pdf/2024/09/13/DS_20240907_SBR064_096_128_160_192_224_256_Datasheet_V5_EN.pdf',
            'note': '8 modules (25.6kWh).',
        },
    ]

    added = 0
    for row in additions:
        rid = clean_text(row.get('id', ''), 120).lower()
        if not rid or rid in existing:
            continue
        rows.append(row)
        existing.add(rid)
        added += 1

    rows.sort(key=lambda x: (clean_text(x.get('manufacturer', ''), 120), clean_text(x.get('model', ''), 180)))
    bat_payload['batteries'] = rows
    bat_payload['version'] = '2026-04-09'
    src = clean_text(bat_payload.get('source', ''), 400)
    if 'BYD HVS' not in src:
        bat_payload['source'] = clean_text(src + ' + BYD HVS/LVS, Dyness DL5.0C, Sungrow SBR datasheet expansion', 380) if src else 'BYD HVS/LVS, Dyness DL5.0C, Sungrow SBR datasheet expansion'

    return added, len(rows)


def main() -> None:
    if not CEC_MODULES.exists() or not CEC_INVERTERS.exists():
        raise SystemExit('Missing .tmp/cec_modules.csv or .tmp/cec_inverters.csv')

    pv_payload = load_json(PV_JSON)
    grid_payload = load_json(GRID_JSON)
    bat_payload = load_json(BAT_JSON)

    pv_added, pv_total = expand_modules(pv_payload)
    grid_added, grid_total = expand_grid_inverters(grid_payload)
    bat_added, bat_total = expand_batteries(bat_payload)

    write_json(PV_JSON, pv_payload)
    write_json(GRID_JSON, grid_payload)
    write_json(BAT_JSON, bat_payload)

    print(f'PV modules: +{pv_added} => {pv_total}')
    print(f'Grid inverters: +{grid_added} => {grid_total}')
    print(f'Hybrid batteries: +{bat_added} => {bat_total}')


if __name__ == '__main__':
    main()
