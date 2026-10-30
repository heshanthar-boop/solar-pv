"""On-device adapter for the original optimizer, executed in a JS Web Worker.

The desktop API starts OS threads to stream results. In WebAssembly the copied
API has those worker bodies run synchronously inside the browser worker instead;
no Python thread is started. Inputs are validated by the original Pydantic models.
"""
import base64
import io
import json
import math
import re
import zipfile
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from backend import app, models, engine, eastwest


def _limit_sweep(s):
    n = len(engine._axis(s.tilt_min,s.tilt_max,s.tilt_step))*len(engine._axis(s.az_min,s.az_max,s.az_step))
    local_t = math.ceil(min(s.tilt_max-s.tilt_min, 2*s.tilt_step))+3
    local_a = math.ceil(min(s.az_max-s.az_min, 2*s.az_step))+3
    if n > 300 or local_t*local_a > 2500:
        raise ValueError(f'This phone build allows at most 300 coarse and 2,500 local single-plane orientations (coarse requested {n}). Adjust steps or ranges.')


def _limit_dual(req):
    if req.mode != 'optimize':
        return
    s=req.search
    if req.arrangement == 'independent':
        # Four-dimensional local candidate products are prohibitively large on phones.
        radii = [min(6.0,max(1.0,x/2+0.5)) for x in (s.a_tilt_step,s.a_az_step,s.b_tilt_step,s.b_az_step)]
        upper = math.prod(math.ceil(2*r)+3 for r in radii)
        if req.optimize_split: upper *= 7
        count_a=len(eastwest._axis(max(1,s.a_tilt_min),s.a_tilt_max,s.a_tilt_step))*len(eastwest._axis(s.a_az_min,s.a_az_max,s.a_az_step))
        count_b=len(eastwest._axis(max(1,s.b_tilt_min),s.b_tilt_max,s.b_tilt_step))*len(eastwest._axis(s.b_az_min,s.b_az_max,s.b_az_step))
        split_count=len(eastwest._axis(s.split_min_pct,s.split_max_pct,s.split_step_pct)) if req.optimize_split else 1
        coarse=min(count_a,s.top_plane_count)*min(count_b,s.top_plane_count)*split_count
        if count_a>300 or count_b>300 or coarse>2500 or upper > 2500:
            raise ValueError('Independent local refinement exceeds the phone limit. Use narrower steps/ranges or run this case on the desktop app.')
    else:
        n=len(eastwest._axis(max(1,s.common_tilt_min),s.common_tilt_max,s.common_tilt_step))*len(eastwest._axis(s.east_az_min,s.east_az_max,s.east_az_step))
        if req.optimize_split: n*=len(eastwest._axis(s.split_min_pct,s.split_max_pct,s.split_step_pct))
        local_t=math.ceil(min(s.common_tilt_max-s.common_tilt_min,2*s.common_tilt_step))+3
        local_a=math.ceil(min(s.east_az_max-s.east_az_min,2*s.east_az_step))+3
        if n>300 or local_t*local_a>2500:
            raise ValueError(f'This phone build allows at most 300 symmetric coarse candidates (requested {n}). Increase the steps or narrow the ranges.')


def _file(form):
    f=form.get('file')
    if not f or not isinstance(f,dict):
        raise ValueError('Choose a file first.')
    data=base64.b64decode(f['content'], validate=True)
    if len(data)>20_000_000:
        raise ValueError('File exceeds the 20 MB phone limit.')
    filename=re.sub(r'[^A-Za-z0-9._-]+','_',str(f.get('name') or 'upload'))[:120] or 'upload'
    if filename.lower().endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            entries=z.infolist()
            if len(entries)>100 or any(i.file_size>20_000_000 for i in entries) or sum(i.file_size for i in entries)>40_000_000:
                raise ValueError('ZIP exceeds the phone limit: 100 files, 20 MB per file, 40 MB total uncompressed.')
    return UploadFile(file=io.BytesIO(data), filename=filename)


async def dispatch(path, payload, form):
    try:
        if isinstance(payload,dict) and payload.get('plant',{}).get('apply_horizon'):
            raise ValueError('Horizon shading is not yet verified on this phone version. Turn it off or use the desktop optimizer.')
        if path == '/api/catalog': data=app.get_catalog()
        elif path == '/api/weather/inspect': data=app.inspect(models.InspectRequest.model_validate(payload))
        elif path == '/api/weather/upload': data=await app.upload(_file(form), float(form.get('utc_offset',0)))
        elif path == '/api/analyze':
            req=models.AnalyzeRequest.model_validate(payload)
            if req.mode=='optimize' and req.plant.mounting!='sat': _limit_sweep(req.sweep)
            return {'status':200,'mime':'application/x-ndjson','body':''.join(app.analyze(req))}
        elif path == '/api/eastwest/analyze':
            req=models.EastWestAnalyzeRequest.model_validate(payload);_limit_sweep(req.single_plane_sweep);_limit_dual(req)
            return {'status':200,'mime':'application/x-ndjson','body':''.join(app.eastwest_analyze(req))}
        elif path == '/api/eastwest/overload':
            req=models.EastWestOverloadRequest.model_validate(payload)
            if req.single_ref_tilt is None or req.single_ref_azimuth is None:
                raise ValueError('Run the East-West analysis first to establish a single-plane reference for overload analysis.')
            data=app.eastwest_overload(req)
        elif path == '/api/evaluate': data=app.evaluate(models.EvaluateRequest.model_validate(payload))
        elif path == '/api/longterm':
            req=models.LongTermRequest.model_validate(payload)
            if req.end_year-req.start_year+1>5: raise ValueError('The phone build allows five years for long-term analysis; use the desktop app for longer periods.')
            data=app.longterm(req)
        elif path.startswith('/api/atlas/'):
            raise ValueError('Atlas background building is not supported in the on-device version. Use the desktop optimizer.')
        elif path == '/api/fieldtest/analyze':
            opts={'warning_pct':90.0,'critical_pct':80.0,'voltage_warning_pct':5.0,'current_warning_pct':8.0,'irradiance_min_wm2':700.0,'ff_warning_pct':70.0,'warranty_start_date':None,'warranty_first_year_min_pct':97.0,'warranty_annual_degradation_pct':0.7,'warranty_term_years':25}
            for k,v in form.items():
                if k in opts and v not in ('',None): opts[k]=v if k=='warranty_start_date' else (int(v) if k=='warranty_term_years' else float(v))
            for k,v in opts.items():
                if k!='warranty_start_date' and (not math.isfinite(v) or v<0): raise ValueError(f'Invalid {k}.')
            if not 1<=opts['warranty_term_years']<=50: raise ValueError('Warranty term must be between 1 and 50 years.')
            data=await app.analyze_fieldtest(_file(form), **opts)
        elif path == '/api/fieldtest/report.pdf':
            response=app.fieldtest_report_pdf(payload)
            return {'status':200,'mime':'application/pdf','base64':base64.b64encode(response.body).decode('ascii')}
        else: raise ValueError('This operation is unavailable on the phone.')
        return {'status':200,'mime':'application/json','body':json.dumps(data,allow_nan=False)}
    except HTTPException as exc:
        return {'status':exc.status_code,'mime':'application/json','body':json.dumps({'detail':str(exc.detail)})}
    except (ValueError, ValidationError) as exc:
        return {'status':400,'mime':'application/json','body':json.dumps({'detail':str(exc)})}
    except Exception as exc:
        return {'status':500,'mime':'application/json','body':json.dumps({'detail':f'{type(exc).__name__}: {exc}'})}
