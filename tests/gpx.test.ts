import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { parseGpx, classify, statistics, sumStats, stableId, distance } from '../scripts/gpx';
import type { Override, Point } from '../src/features/map/model';
const gpx=(body:string)=>`<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="GaiaGPS" version="1.1">${body}</gpx>`;
const pt=(lon:number,ele?:number,time?:string)=>`<trkpt lat="40" lon="${lon}">${ele===undefined?'':`<ele>${ele}</ele>`}${time?`<time>${time}</time>`:''}</trkpt>`;
const p=(lon:number,elevation:number|null=null):Point=>({lon,lat:40,elevation,time:null});
test('representative supplied Gaia route, symbols, descriptions, styles, and aligned times',async()=>{
 const {trip,detail}=parseGpx(await readFile('gpx_map_data/maine-august-2026.gpx','utf8'),'maine-august-2026.gpx');
 assert.equal(detail.paths.length,10);assert.ok(detail.paths.every(p=>p.kind==='route'));
 const day6=detail.paths.find(path=>path.name==='Day 6')!;
 assert.equal(day6.segments[0].points.length,339);
 assert.equal(day6.segments[0].points[0].time,'2026-08-10T00:50:49Z');
 assert.equal(day6.segments[0].points[0].elevation,658);
 assert.deepEqual(day6.extensions,{line:{color:'FFEF00'}});
 const itinerary=detail.paths.find(path=>path.name==='Rangeley to Flagstaff AT Section')!;
 assert.equal(itinerary.segments[0].points.length,4182);
 assert.equal(detail.paths.find(path=>path.name==='Maine AT Section Route')?.segments[0].points.length,3441);
 assert.equal(trip.waypoints.find(w=>w.name==='Shuttle Drop Off')?.kind,'start');
 assert.equal(trip.waypoints.filter(w=>w.kind==='camp').length,6);
 assert.equal(trip.waypoints.find(w=>w.name==='Sugarloaf Summit')?.symbol,'emoji-🗻');
 assert.ok(trip.issues.some(s=>s.includes('empty')));
 assert.equal(detail.paths.find(path=>path.name==='untitled')?.segments[0].points.length,0);
});
test('Maine publishes only its continuous route while retaining source inventory and waypoint notes',async()=>{
  const xml=await readFile('gpx_map_data/maine-august-2026.gpx','utf8');
  const overrides:Record<string,Override>=JSON.parse(await readFile('data/trip-overrides.json','utf8'));
  const source=parseGpx(xml,'maine-august-2026.gpx');
  const {trip,detail,inventory}=parseGpx(xml,'maine-august-2026.gpx',overrides['maine-august-2026']);
  const route=source.detail.paths.find(path=>path.name==='Maine AT Section Route')!;
  assert.deepEqual(detail.paths,[route]);
  assert.equal(route.segments.length,1);
  assert.equal(route.segments[0].points.length,3441);
  assert.deepEqual(trip.statsPathIds,[route.id]);
  assert.deepEqual(trip.stats,route.segments[0].stats);
  assert.ok(Math.abs(trip.stats.distanceM/1609.344-61.51)<.01);
  assert.equal(trip.overview.features.length,1);
  assert.equal(trip.overview.features[0].properties?.pathId,route.id);
  assert.equal(detail.geojson.features.length,1);
  assert.equal(detail.geojson.features[0].geometry.coordinates.length,3441);
  assert.deepEqual(trip.waypoints,source.trip.waypoints);
  assert.equal(trip.waypoints.length,10);
  assert.ok(!trip.issues.some(issue=>/empty|Multiple planned routes/.test(issue)));
  assert.deepEqual(inventory,source.inventory);
});
test('path overrides exclude alternative bounds and endpoints and reject invalid references',()=>{
  const xml=gpx('<rte><name>Alternative</name><rtept lat="40" lon="-110"/><rtept lat="41" lon="-109"/></rte><rte><name>Chosen</name><rtept lat="42" lon="-73"/><rtept lat="43" lon="-72"/></rte>');
  const {trip,detail,inventory}=parseGpx(xml,'selected.gpx',{pathIds:['rte-2']});
  assert.deepEqual(trip.bounds,[-73,42,-72,43]);
  assert.deepEqual(trip.statsPathIds,['rte-2']);
  assert.deepEqual(detail.paths.map(path=>path.id),['rte-2']);
  assert.equal(trip.waypoints.find(w=>w.kind==='start')?.lon,-73);
  assert.equal(trip.waypoints.find(w=>w.kind==='end')?.lon,-72);
  assert.equal(inventory.routes,2);
  assert.equal(inventory.points,4);
  assert.throws(()=>parseGpx(xml,'selected.gpx',{pathIds:['missing']}),/Invalid pathIds/);
  assert.throws(()=>parseGpx(xml,'selected.gpx',{pathIds:['rte-2','rte-2']}),/Invalid pathIds/);
  assert.throws(()=>parseGpx(xml,'selected.gpx',{pathIds:['rte-2'],statsPathIds:['rte-1']}),/Invalid statsPathIds/);
});
test('tracks, routes, segments and point extensions are preserved without gap bridges',()=>{
 const xml=gpx(`<trk><name>Recorded</name><trkseg>${pt(-73,10)}${pt(-72.999,20)}</trkseg><trkseg>${pt(-110,500)}${pt(-109.999,510)}</trkseg></trk><rte><name>Plan</name><rtept lat="42" lon="-73"><ele>1</ele><extensions><id>abc</id></extensions></rtept><rtept lat="42.01" lon="-73"><ele>10</ele></rtept></rte>`);
 const {trip,detail}=parseGpx(xml,'test.gpx');
 assert.equal(detail.paths[0].segments.length,2);assert.equal(detail.geojson.features.length,3);
 assert.deepEqual(trip.statsPathIds,['trk-1']);assert.ok(trip.stats.distanceM<180);assert.equal(trip.stats.gainM,20);
 assert.equal(detail.paths[1].segments[0].points[0].extensions && (detail.paths[1].segments[0].points[0].extensions as any).id,'abc');
 assert.equal(trip.waypoints.filter(w=>w.derived).length,2);
});
test('waypoint classification uses observed Gaia values with generic fallback',()=>{
 assert.equal(classify('Night 6','emoji-⛺'),'camp');assert.equal(classify('Peak','emoji-🗻'),'summit');assert.equal(classify('Car','car-24'),'parking');assert.equal(classify('Stop','bus'),'transport');assert.equal(classify('Loop Start/End','car-24'),'start-end');assert.equal(classify('Start','','',''),'start');assert.equal(classify('End/Car Parked','car-24'),'end');assert.equal(classify('Look here','alien-symbol'),'other');
 const {trip}=parseGpx(gpx('<wpt lat="40" lon="-73"><name>Look here</name><sym>alien-symbol</sym><type>odd</type><desc>Keep this</desc></wpt>'),'x.gpx');
 assert.equal(trip.waypoints[0].type,'odd');assert.equal(trip.waypoints[0].description,'Keep this');assert.ok(trip.issues.some(s=>s.includes('generic')));
});
test('missing data is null; flat elevation is zero, partial elevation is unavailable',()=>{
 const {detail,trip}=parseGpx(gpx(`<trk><trkseg>${pt(-73)}${pt(-72.99,0,'2021-01-01T00:00:00Z')}</trkseg></trk>`),'test.gpx');
 const points=detail.paths[0].segments[0].points;assert.equal(points[0].time,null);assert.equal(points[0].elevation,null);assert.equal(points[1].elevation,0);assert.equal(trip.stats.gainM,null);
 assert.equal(statistics([p(-73,0),p(-72.99,0)]).gainM,0);assert.equal(statistics([p(-73)]).gainM,null);
});
test('haversine distance and segment totals never count artificial connections',()=>{
 assert.ok(Math.abs(distance({...p(0),lat:0},{...p(1),lat:0})-111195.08)<1);
 const s=sumStats([statistics([p(-73,0),p(-72.999,10)]),statistics([p(-110,900),p(-109.999,910)])]);assert.ok(s.distanceM<180);assert.equal(s.gainM,20);
});
test('stable filename IDs survive title/date/classification/coordinate overrides',()=>{
 const xml=gpx('<wpt lat="40" lon="-73"><name>Unknown</name><sym>custom</sym></wpt>');
 const a=parseGpx(xml,'trip-2021.gpx');const b=parseGpx(xml,'trip-2021.gpx',{title:'Renamed',dates:{label:'July 2021',source:'owner'},waypoints:{'wpt-1':{kind:'camp',lat:41}}});
 assert.equal(a.trip.id,b.trip.id);assert.equal(b.trip.id,stableId('trip-2021.gpx'));assert.equal(b.trip.title,'Renamed');assert.equal(b.trip.dates.label,'July 2021');assert.equal(b.trip.waypoints[0].kind,'camp');assert.equal(b.trip.waypoints[0].lat,41);
 assert.throws(()=>parseGpx(xml,'x.gpx',{statsPathIds:['missing']}));assert.throws(()=>parseGpx(xml,'x.gpx',{waypoints:{missing:{kind:'camp'}}}));
});
test('malformed coordinates/XML fail explicitly and invalid optional values report issues',()=>{
 assert.throws(()=>parseGpx('<gpx><trk></gpx>','x.gpx'));assert.throws(()=>parseGpx(gpx('<wpt lat="nan" lon="0"/>'),'x.gpx'));
 const result=parseGpx(gpx('<rte><rtept lat="40" lon="-70"><ele>broken</ele><time>not-a-date</time></rtept></rte>'),'x.gpx');assert.ok(result.trip.issues.some(s=>s.includes('invalid elevation')));assert.ok(result.trip.issues.some(s=>s.includes('invalid timestamp')));
});
test('all 12 exports reconcile with independently counted source structures and generated assets',async()=>{
 const files=(await readdir('gpx_map_data')).filter(f=>f.endsWith('.gpx'));assert.equal(files.length,12);
 const overrides:Record<string,Override>=JSON.parse(await readFile('data/trip-overrides.json','utf8'));
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false});const arr=(v:any)=>v===undefined?[]:Array.isArray(v)?v:[v];
 let routes=0,points=0,wps=0,camps=0;
 for(const file of files){const xml=await readFile(`gpx_map_data/${file}`,'utf8');const source=parser.parse(xml).gpx;const result=parseGpx(xml,file,overrides[stableId(file)]);const inv=result.inventory;
 assert.equal(inv.routes,arr(source.rte).length);assert.equal(inv.tracks,arr(source.trk).length);assert.equal(inv.sourceWaypoints,arr(source.wpt).length);
 assert.equal(inv.points,arr(source.rte).reduce((n:number,r:any)=>n+arr(r.rtept).length,0)+arr(source.trk).reduce((n:number,t:any)=>n+arr(t.trkseg).reduce((m:number,s:any)=>m+arr(s.trkpt).length,0),0));
 const asset=JSON.parse(await readFile(`public/trips/${result.trip.id}.json`,'utf8'));assert.deepEqual(asset,result.detail);
 routes+=inv.routes;points+=inv.points;wps+=inv.sourceWaypoints;camps+=inv.campsites;
 }
 assert.equal(routes,23);assert.equal(points,29494);assert.equal(wps,39);assert.equal(camps,26);
});
