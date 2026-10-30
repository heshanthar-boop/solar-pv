/* The original Python optimizer runs in this dedicated worker, never on the UI thread. */
importScripts('runtime/pyodide.js');
let runtime;
async function loadRuntime(){
  if(runtime)return runtime;
  const py=await loadPyodide({indexURL:new URL('runtime/',self.location.href).href});
  await py.loadPackage(['micropip','numpy','pandas','scipy','h5py','requests','tzdata','fastapi','pillow']);
  const wheels=['pvlib-0.15.1-py3-none-any.whl','reportlab-4.5.1-py3-none-any.whl','pypdf-6.21.4-py3-none-any.whl','python_multipart-0.0.32-py3-none-any.whl','pyodide_http-0.2.2-py3-none-any.whl'];
  for(const name of wheels){const response=await fetch('runtime/'+name);if(!response.ok)throw Error('Missing optimizer dependency '+name);py.FS.writeFile('/'+name,new Uint8Array(await response.arrayBuffer()));}
  await py.runPythonAsync(`import micropip\nawait micropip.install(${JSON.stringify(wheels.map(x=>'emfs:/'+x))},deps=False)`);
  py.FS.mkdir('/backend');py.FS.mkdir('/frontend');
  const names=['__init__.py','app.py','atlas.py','catalog.py','eastwest.py','electrical.py','engine.py','fieldreport.py','fieldtest.py','infra.py','longterm.py','models.py','weather.py','mobile_adapter.py'];
  for(const name of names){const response=await fetch('backend/'+name);if(!response.ok)throw Error('Missing optimizer source '+name);let content=await response.text();if(name==='app.py'){
    const start='threading.Thread(target=worker, daemon=True).start()';
    const stream='return StreamingResponse(stream(), media_type="application/x-ndjson")';
    if(content.split(start).length!==3||content.split(stream).length!==3)throw Error('Optimizer API adapter does not match source.');
    content=content.split(start).join('worker()').split(stream).join('return list(stream())');
  }py.FS.writeFile('/backend/'+name,content);}
  py.globals.set('_android_proxy',self.location.hostname==='appassets.androidplatform.net' ? self.location.origin+'/pvgis/' : '');
  await py.runPythonAsync(`import sys
sys.path.insert(0,"/")
import pyodide_http
pyodide_http.patch_all()
import requests
_real_get=requests.get
def _pvgis_get(url,*args,**kwargs):
    prefix='https://re.jrc.ec.europa.eu/api/'
    if _android_proxy and url.startswith(prefix):
        url=_android_proxy+url[len(prefix):]
    return _real_get(url,*args,**kwargs)
requests.get=_pvgis_get
from backend import mobile_adapter
if _android_proxy:
    _weather=mobile_adapter.app.wx
    _old_get_weather=_weather.get_weather
    def _versioned_weather(source,*args,**kwargs):
        data,meta=_old_get_weather(source,*args,**kwargs)
        if source in ('pvgis_tmy','pvgis_year'):
            meta={**meta,'source':str(meta.get('source','PVGIS'))+' · PVGIS API 5.3'}
        return data,meta
    _weather.get_weather=_versioned_weather
    _old_multiyear=_weather.get_multiyear
    def _versioned_multiyear(*args,**kwargs):
        data,meta=_old_multiyear(*args,**kwargs)
        return data,{**meta,'source':str(meta.get('source','PVGIS'))+' · PVGIS API 5.3'}
    _weather.get_multiyear=_versioned_multiyear`);
  runtime=py;return py;
}
async function execute(event){const {id,path,payload,form}=event.data;try{const py=await loadRuntime();py.globals.set('_mobile_input',JSON.stringify({path,payload,form}));const response=await py.runPythonAsync('import json\n_req=json.loads(_mobile_input)\njson.dumps(await mobile_adapter.dispatch(_req["path"],_req["payload"],_req["form"]),allow_nan=False)');self.postMessage({id,response:JSON.parse(response)});}catch(e){self.postMessage({id,error:String(e.message||e)});}}
let jobs=Promise.resolve();
self.onmessage=event=>{jobs=jobs.then(()=>execute(event));};
