const test=require('node:test');
const assert=require('node:assert/strict');
const {indexedDB}=require('fake-indexeddb');
const XLSX=require('../js/vendor/xlsx.full.min.js');
const {loadBrowserModule}=require('./helpers/load-browser-module');
let file;
const survey=loadBrowserModule('js/site-survey.js','SiteSurvey',{indexedDB,XLSX,AndroidInventory:{saveWorkbook:(name,data)=>file={name,data}}});
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);
const p=(lat,lon)=>survey.point(lat,lon,'Map');

test('distance, bearing, area and unit conversions match known spherical values',()=>{
  const square=[p(0,0),p(0,.001),p(.001,.001),p(.001,0)];
  near(survey.distance(square[0],square[1]),111.195,0.01);
  near(survey.bearing(square[0],square[1]),90,0.001);
  const m=survey.metrics(square);near(m.perimeter,444.780,0.02);near(m.area,12364.35,0.1);
  near(m.area/4046.8564224,3.0555,.001);near(m.area/25.29285264,488.86,.1);
  assert.equal(survey.metrics(square.slice(0,2)).area,null);
});
test('crossed, repeated and collinear boundaries are not given an area',()=>{
  for(const points of [[p(0,0),p(.001,.001),p(0,.001),p(.001,0)],[p(0,0),p(0,.001),p(0,0)],[p(0,0),p(0,.001),p(0,.002)]]){
    const m=survey.metrics(points);assert.equal(m.invalid,true);assert.equal(m.area,null);
  }
});
test('dateline distance and GPS altitude-derived slope retain their correct direction',()=>{
  near(survey.distance(p(0,179.999),p(0,-179.999)),222.39,.1);
  const a={...p(0,0),altitude:10},b={...p(0,.001),altitude:13};
  near(survey.slope(a,b),2.6979,.001);assert.equal(survey.slope(a,p(0,.001)),null);
  assert.throws(()=>survey.point(91,80,'GPS'),/Invalid/);
});
test('saved surveys remain separate and Excel preserves coordinates and source metadata',async()=>{
  const points=[survey.point(6.91,79.86,'GPS',6,'2026-10-29T10:00:00.000Z'),p(6.91,79.861),p(6.911,79.861)];
  points[0].altitude=42;points[0].altitudeAccuracy=8;
  const a={id:'farm a',site:'Farm A',boundary:points,ruler:[points[0],points[1]],radius:[points[1],points[2]]};
  const b={id:'farm b',site:'Farm B',boundary:[p(7,80)],ruler:[],radius:[]};
  await survey.save(a);await survey.save(b);assert.equal((await survey.load('farm a')).boundary.length,3);assert.equal((await survey.load('farm b')).site,'Farm B');
  survey.exportExcel(a);assert.match(file.name,/survey\.xlsx$/);const book=XLSX.read(file.data,{type:'base64'});
  assert.equal(book.SheetNames.length,2);const rows=XLSX.utils.sheet_to_json(book.Sheets.Coordinates);
  assert.equal(rows.length,7);assert.equal(rows[0].Latitude,6.91);assert.equal(rows[0].Source,'GPS');assert.equal(rows[0]['GPS accuracy (m)'],6);assert.equal(rows[0]['GPS altitude (m; WGS84 ellipsoid)'],42);
  const restored=survey.parseWorkbook(book);assert.equal(restored.boundary.length,3);assert.equal(restored.ruler.length,2);assert.equal(restored.radius.length,2);assert.equal(restored.boundary[0].accuracy,6);
});
