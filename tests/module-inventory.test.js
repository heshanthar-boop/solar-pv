const test=require('node:test');
const assert=require('node:assert/strict');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
const XLSX=require('../js/vendor/xlsx.full.min.js');
const {loadBrowserModule}=require('./helpers/load-browser-module');
let saved;
const inventory=loadBrowserModule('js/module-inventory.js','ModuleInventory',{indexedDB,IDBKeyRange,XLSX,AndroidInventory:{saveWorkbook:(name,data)=>{saved={name,data};}}});
const site={site:'East Farm',operator:'Nimal',inverter:'INV-01',mppt:'MPPT 1',string:'String 1'};
const moment=new Date('2026-10-29T09:30:00.000Z');

test('records retain exact serial text, operator, UTC time and recent GPS accuracy',()=>{
  const gps={latitude:6.91,longitude:79.86,accuracy:7.5,timestamp:moment.getTime()-1000};
  const r=inventory.makeRecord(site,'  001234  ',1,gps,'camera',moment);
  assert.equal(r.serial,'001234');assert.equal(r.operator,'Nimal');assert.equal(r.scannedAt,'2026-10-29T09:30:00.000Z');
  assert.equal(r.latitude,6.91);assert.equal(r.accuracy,7.5);assert.equal(r.gpsStatus,'Recorded');
  const stale=inventory.makeRecord(site,'S2',1,{...gps,timestamp:moment.getTime()-121000},'manual',moment);
  assert.equal(stale.latitude,null);assert.equal(stale.gpsStatus,'Unavailable');
  assert.throws(()=>inventory.makeRecord({...site,operator:''},'S2',1,null,'manual',moment),/operator/i);
});

test('site inventory rejects duplicate serials and assigns positions per string atomically',async()=>{
  const a=inventory.makeRecord(site,'001234',1,null,'camera',moment);
  const b=inventory.makeRecord(site,'001235',1,null,'manual',moment);
  const other=inventory.makeRecord({...site,string:'String 2'},'001236',1,null,'camera',moment);
  await inventory.add(a);await inventory.add(b);await inventory.add(other);
  assert.equal(a.position,1);assert.equal(b.position,2);assert.equal(other.position,1);
  await assert.rejects(inventory.add(inventory.makeRecord({...site,string:'String 2'},'001234',1,null,'manual',moment)),{name:'ConstraintError'});
  await inventory.add(inventory.makeRecord({...site,site:'West Farm'},'001234',1,null,'manual',moment));
  const rows=await inventory.list('east farm');assert.equal(rows.length,3);
  const recent=await inventory.recent('East Farm');assert.equal(recent.total,3);assert.equal(recent.items.length,3);
  assert.equal((await inventory.recent('East Farm',site)).total,2);
});

test('Excel export preserves leading zeroes and formula-like serials as text',()=>{
  const a=inventory.makeRecord(site,'001234',1,null,'camera',moment);
  const b=inventory.makeRecord(site,'=1+1',2,null,'manual',moment);
  inventory.exportWorkbook([a,b],site.site);
  assert.match(saved.name,/\.xlsx$/);
  const book=XLSX.read(saved.data,{type:'base64'}),sheet=book.Sheets['Module inventory'];
  assert.equal(sheet.F2.v,'001234');assert.equal(sheet.F2.t,'s');
  assert.equal(sheet.F3.v,'=1+1');assert.equal(sheet.F3.t,'s');assert.equal(sheet.F3.f,undefined);
});

test('large strings keep a bounded recent view while the site export includes every module',async()=>{
  const large={...site,site:'Large Test Farm'};
  for(let i=0;i<205;i++)await inventory.add(inventory.makeRecord(large,`L-${String(i).padStart(5,'0')}`,1,null,'manual',moment));
  const view=await inventory.recent(large.site,large);
  assert.equal(view.total,205);assert.equal(view.items.length,200);
  assert.equal(view.items[0].position,205);
  inventory.exportWorkbook(await inventory.list(large.site),large.site);
  const book=XLSX.read(saved.data,{type:'base64'});
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Module inventory']).length,205);
});
