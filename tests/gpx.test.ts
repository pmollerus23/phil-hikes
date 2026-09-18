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
 assert.equal(detail.paths.length,9);assert.ok(detail.paths.every(p=>p.kind==='route'));
 assert.equal(detail.paths[0].segments[0].points.length,339);
 assert.equal(detail.paths[0].segments[0].points[0].time,'2026-08-10T00:50:49Z');
 assert.equal(detail.paths[0].segments[0].points[0].elevation,658);
 assert.deepEqual(detail.paths[0].extensions,{line:{color:'FFEF00'}});
 assert.equal(trip.waypoints.find(w=>w.name==='Shuttle Drop Off')?.kind,'start');
 assert.equal(trip.waypoints.filter(w=>w.kind==='camp').length,6);
 assert.equal(trip.waypoints.find(w=>w.name==='Sugarloaf Summit')?.symbol,'emoji-🗻');
 assert.ok(trip.issues.some(s=>s.includes('empty')));
 assert.equal(detail.paths[8].segments[0].points.length,0);
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
 assert.equal(routes,22);assert.equal(points,26053);assert.equal(wps,39);assert.equal(camps,26);
});
