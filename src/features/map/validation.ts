import type { Trip, TripDetail, TripPhotos } from './model';
function finite(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
function point(p:any){return p&&finite(p.lon)&&finite(p.lat)&&Math.abs(p.lon)<=180&&Math.abs(p.lat)<=90&&(p.elevation===null||finite(p.elevation))&&(p.time===null||typeof p.time==='string');}
function collection(v:any){return v?.type==='FeatureCollection'&&Array.isArray(v.features)&&v.features.every((f:any)=>f.type==='Feature'&&f.geometry?.type==='LineString'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.every((c:any)=>Array.isArray(c)&&c.length>=2&&c.every(finite))&&typeof f.properties?.tripId==='string');}
export function validateIndex(v:unknown):Trip[]{
 if(!Array.isArray(v)||!v.every(t=>typeof t.id==='string'&&/^[a-z0-9-]+$/.test(t.id)&&typeof t.title==='string'&&typeof t.mapLabel==='string'&&t.mapLabel.length>0&&typeof t.dates?.label==='string'&&t.detailUrl===`/trips/${t.id}.json`&&(t.bounds===null||(Array.isArray(t.bounds)&&t.bounds.length===4&&t.bounds.every(finite)))&&finite(t.stats?.distanceM)&&(t.stats.gainM===null||finite(t.stats.gainM))&&Array.isArray(t.statsPathIds)&&Array.isArray(t.issues)&&Array.isArray(t.waypoints)&&t.waypoints.every((w:any)=>point(w)&&typeof w.id==='string'&&typeof w.name==='string'&&['camp','start','end','start-end','parking','transport','summit','water','other'].includes(w.kind))&&collection(t.overview))||new Set(v.map(t=>t.id)).size!==v.length)throw new Error('Trip index is invalid. Run npm run import:gpx to regenerate it.');
 return v;
}
export function validateDetail(v:any,id:string):TripDetail{
 if(v?.schemaVersion!==1||v.id!==id||!Array.isArray(v.paths)||!v.paths.every((p:any)=>typeof p.id==='string'&&['route','track'].includes(p.kind)&&Array.isArray(p.segments)&&p.segments.every((s:any)=>typeof s.id==='string'&&Array.isArray(s.points)&&s.points.every(point)))||!collection(v.geojson)||!photoData(v))throw new Error('This trip’s detail file is invalid. Re-import the GPX source.');
 return v;
}
export function validatePhotoData(v:any):TripPhotos {
 if(!photoData(v))throw new Error('Photo data is invalid. Check its IDs, associations, dimensions, and coordinates.');
 return {stops:v.photoStops??v.stops,photos:v.photos};
}
function photoData(v:any){
 const stops=v?.photoStops??v?.stops;
 if(!Array.isArray(stops)||!Array.isArray(v?.photos))return false;
 const stopIds=new Set<string>();
 for(const stop of stops){if(typeof stop?.id!=='string'||stopIds.has(stop.id)||typeof stop.name!=='string'||!point({...stop,elevation:stop.elevation??null,time:stop.time??null})||stop.kind!=='photo')return false;stopIds.add(stop.id);}
 const photoIds=new Set<string>();
 for(const photo of v.photos){
  if(typeof photo?.id!=='string'||photoIds.has(photo.id)||typeof photo.src!=='string'||!finite(photo.width)||photo.width<=0||!finite(photo.height)||photo.height<=0||typeof photo.alt!=='string'||typeof photo.caption!=='string'||!Number.isInteger(photo.order))return false;
  if(Number(typeof photo.waypointId==='string')+Number(typeof photo.stopId==='string')!==1||photo.stopId&&!stopIds.has(photo.stopId))return false;
  if(photo.variants!==undefined&&(!Array.isArray(photo.variants)||!photo.variants.every((variant:any)=>typeof variant.src==='string'&&finite(variant.width)&&variant.width>0&&finite(variant.height)&&variant.height>0)))return false;
  photoIds.add(photo.id);
 }
 return true;
}
