const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');
const XLSX=require('../js/vendor/xlsx.full.min.js');
const bwipjs=require('bwip-js');
const {PNG}=require('pngjs');
const ZXing=require('../js/vendor/zxing.min.js');

for(const format of ['code128','datamatrix','qrcode']) test(`bundled barcode reader decodes ${format} serials`,async()=>{
  const buffer=await bwipjs.toBuffer({bcid:format,text:'SN-001234567',scale:3,height:14,includetext:false,paddingwidth:10,paddingheight:10,backgroundcolor:'FFFFFF'});
  const png=PNG.sync.read(buffer),pixels=new Uint8ClampedArray(png.width*png.height);
  for(let i=0;i<pixels.length;i++){const j=i*4,a=png.data[j+3]/255;pixels[i]=Math.round((.299*png.data[j]+.587*png.data[j+1]+.114*png.data[j+2])*a+255*(1-a));}
  const source=new ZXing.RGBLuminanceSource(pixels,png.width,png.height);
  const decoded=new ZXing.MultiFormatReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source)));
  assert.equal(decoded.getText(),'SN-001234567');
});

test('field workflow saves scans, blocks duplicates, filters strings and exports every site row',async()=>{
  const dom=new JSDOM('<!doctype html><body><main id="app"></main></body>',{url:'https://local.example/',runScripts:'outside-only'});
  const w=dom.window;w.indexedDB=new IDBFactory();w.IDBKeyRange=IDBKeyRange;w.XLSX=XLSX;
  let saved,callback;w.AndroidInventory={saveWorkbook:(name,content)=>saved={name,content}};
  Object.defineProperty(w.navigator,'geolocation',{value:{watchPosition(ok){ok({coords:{latitude:6.91,longitude:79.86,accuracy:8},timestamp:Date.now()});return 1;},clearWatch(){}}});
  w.ZXing={BrowserMultiFormatReader:class{async decodeFromConstraints(c,v,cb){callback=cb;}reset(){}}};
  w.eval(fs.readFileSync('js/module-inventory.js','utf8')+'\nwindow.inventory=ModuleInventory;');
  const app=w.document.querySelector('#app');w.inventory.render(app);
  const input=(id,value)=>{const el=w.document.querySelector('#mi-'+id);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for field UI');};
  for(const [key,value] of Object.entries({site:'Test Site',operator:'Amal',inverter:'INV-1',mppt:'1',string:'1',serial:'000123'}))input(key,value);
  w.document.querySelector('#mi-add').click();await waitFor(()=>w.document.querySelector('#mi-message').textContent.includes('Saved 000123'));
  await waitFor(()=>w.document.querySelector('#mi-rows').textContent.includes('000123'));
  assert.match(w.document.querySelector('#mi-rows').textContent,/000123/);
  input('serial','000123');w.document.querySelector('#mi-add').click();await waitFor(()=>w.document.querySelector('#mi-message').textContent.includes('already recorded'));
  input('string','2');w.document.querySelector('#mi-start').click();await waitFor(()=>typeof callback==='function');
  callback({getText:()=> 'SN-456'});await waitFor(()=>w.document.querySelector('#mi-message').textContent.includes('Saved SN-456'));
  await waitFor(()=>w.document.querySelector('#mi-rows').textContent.includes('SN-456'));
  assert.doesNotMatch(w.document.querySelector('#mi-rows').textContent,/000123/);
  w.document.querySelector('#mi-export').click();await waitFor(()=>!!saved);
  const workbook=XLSX.read(saved.content,{type:'base64'}),rows=XLSX.utils.sheet_to_json(workbook.Sheets['Module inventory']);
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r['Module serial number']),['000123','SN-456']);
  assert.equal(rows[0].Operator,'Amal');assert.equal(rows[0].Latitude,6.91);assert.equal(rows[1]['Entry method'],'Camera');
  app.innerHTML='';dom.window.close();
});
