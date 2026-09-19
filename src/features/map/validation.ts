import type { Trip, TripDetail } from './model';
function finite(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
function point(p:any){return p&&finite(p.lon)&&finite(p.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90&&(p.elevation===null||finite(p.elevation))&&(p.time===null||typeof p.time==='string');}
function collection(v:any){return v?.type==='FeatureCollection'&&Array.isArray(v.features)&&v.features.every((f:any)=>f.type==='Feature'&&f.geometry?.type==='LineString'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.every((c:any)=>Array.isArray(c)&&c.length>=2&&c.every(finite))&&typeof f.properties?.tripId==='string');}
export function validateIndex(v:unknown):Trip[]{
 if(!Array.isArray(v)||!v.every(t=>typeof t.id==='string'&&/^[a-z0-9-]+$/.test(t.id)&&typeof t.title==='string'&&typeof t.mapLabel==='string'&&t.mapLabel.length>0&&typeof t.dates?.label==='string'&&t.detailUrl===`/trips/${t.id}.json`&&(t.bounds===null||(Array.isArray(t.bounds)&&t.bounds.length===4&&t.bounds.every(finite)))&&finite(t.stats?.distanceM)&&(t.stats.gainM===null||finite(t.stats.gainM))&&Array.isArray(t.statsPathIds)&&Array.isArray(t.issues)&&Array.isArray(t.waypoints)&&t.waypoints.every((w:any)=>point(w)&&typeof w.id==='string'&&typeof w.name==='string'&&['camp','start','end','start-end','parking','transport','summit','water','other'].includes(w.kind))&&collection(t.overview))||new Set(v.map(t=>t.id)).size!==v.length)throw new Error('Trip index is invalid. Run npm run import:gpx to regenerate it.');
 return v;
}
export function validateDetail(v:any,id:string):TripDetail{
 if(v?.schemaVersion!==1||v.id!==id||!Array.isArray(v.paths)||!v.paths.every((p:any)=>typeof p.id==='string'&&['route','track'].includes(p.kind)&&Array.isArray(p.segments)&&p.segments.every((s:any)=>typeof s.id==='string'&&Array.isArray(s.points)&&s.points.every(point)))||!collection(v.geojson))throw new Error('This trip’s detail file is invalid. Re-import the GPX source.');
 return v;
}
