import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Point, Path, Stats, Trip, TripDetail, Override, Waypoint, WaypointKind, Bounds } from '../src/features/map/model';
import type { FeatureCollection, LineString } from 'geojson';
const array = (v: any): any[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const str = (v: any): string => v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v);
export function stableId(filename: string) { return filename.replace(/\.gpx$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'); }
export function classify(name: string, symbol = '', type = '', description = ''): WaypointKind {
  const n = name.toLowerCase();
  if (/\bstart\b/.test(n) && /\bend\b/.test(n)) return 'start-end';
  if (/^start\b|^car dropoff$|^shuttle drop off$/.test(n) || /^started here\b|\bstart of (our|the) trip\b/i.test(description)) return 'start';
  if (/^end\b|^car pickup$/.test(n) || /^ended here\b/i.test(description)) return 'end';
  const s = `${symbol} ${type}`.toLowerCase();
  if (/⛺|camp|tent/.test(s) || /\bcamp(site)?\b|shelter/.test(n)) return 'camp';
  if (/🗻|summit|peak/.test(s+' '+n)) return 'summit';
  if (/car-24|parking/.test(s+' '+n)) return 'parking';
  if (/bus|transport/.test(s)) return 'transport';
  if (/water|drinking/.test(s)) return 'water';
  return 'other';
}
export { distance } from '../src/features/map/geo';
import { distance } from '../src/features/map/geo';
export function statistics(points: Point[]): Stats {
  let distanceM=0, gainM=0, pairs=0;
  for(let i=1;i<points.length;i++) { distanceM += distance(points[i-1],points[i]); const a=points[i-1].elevation,b=points[i].elevation; if(a!==null && b!==null) { pairs++; gainM+=Math.max(0,b-a); } }
  // Incomplete elevation is unavailable, never a misleading partial/zero gain.
  return {distanceM,gainM:pairs>0 && points.every(p=>p.elevation!==null)?gainM:null,points:points.length,elevationPoints:points.filter(p=>p.elevation!==null).length,timestampPoints:points.filter(p=>p.time!==null).length};
}
export function sumStats(stats: Stats[]): Stats {
  return {distanceM:stats.reduce((a,s)=>a+s.distanceM,0),gainM:stats.length && stats.every(s=>s.gainM!==null)?stats.reduce((a,s)=>a+s.gainM!,0):null,points:stats.reduce((a,s)=>a+s.points,0),elevationPoints:stats.reduce((a,s)=>a+s.elevationPoints,0),timestampPoints:stats.reduce((a,s)=>a+s.timestampPoints,0)};
}
// Index-stride preview thinning, capped at ~201 vertices per segment. Full assets stay lossless.
function preview(points: Point[]) { const stride=Math.max(1,Math.ceil(points.length/200)); return points.filter((_,i)=>i%stride===0 || i===points.length-1); }
export function geometry(paths: Path[], tripId: string, lightweight=false): FeatureCollection<LineString> {
 return {type:'FeatureCollection',features:paths.flatMap(path=>path.segments.filter(s=>s.points.length>=2).map(s=>({type:'Feature' as const,properties:{tripId,pathId:path.id,segmentId:s.id,kind:path.kind,name:path.name},geometry:{type:'LineString' as const,coordinates:(lightweight?preview(s.points):s.points).map(p=>p.elevation===null?[p.lon,p.lat]:[p.lon,p.lat,p.elevation])}})))};
}
export function parseGpx(xml: string, filename: string, override: Override = {}) {
 const valid=XMLValidator.validate(xml); if(valid!==true) throw new Error(`Malformed XML: ${valid.err.msg}`);
 const parsed=new XMLParser({ignoreAttributes:false,parseTagValue:false,removeNSPrefix:true}).parse(xml);
 const root=parsed.gpx; if(!root) throw new Error('Missing GPX root');
 const id=stableId(filename), issues:string[]=[];
 function point(raw:any, label:string): Point {
  if(raw['@_lon']===undefined || raw['@_lat']===undefined) throw new Error(`${label}: missing coordinate`);
  const lon=Number(raw['@_lon']),lat=Number(raw['@_lat']);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90) throw new Error(`${label}: invalid coordinate`);
  let elevation=raw.ele===undefined?null:Number(str(raw.ele));
  if(elevation!==null && (!Number.isFinite(elevation)||!str(raw.ele).trim())) {issues.push(`${label}: invalid elevation retained as unavailable`);elevation=null;}
  let time=raw.time===undefined?null:str(raw.time);
  if(time!==null && Number.isNaN(Date.parse(time))) {issues.push(`${label}: invalid timestamp retained in source; unavailable in output`);time=null;}
  return {lon,lat,elevation,time,...(raw.extensions?{extensions:raw.extensions}:{})};
 }
 const sourcePaths:Path[]=[];
 const pathIssues=new Map<string,string[]>();
 for(const [tag,kind] of [['trk','track'],['rte','route']] as const) {
  array(root[tag]).forEach((raw,i)=>{
   const pathId=`${tag}-${i+1}`;
   const issueStart=issues.length;
   const groups=tag==='trk'?array(raw.trkseg).map(s=>array(s.trkpt)):[array(raw.rtept)];
   const segments=groups.map((ps,j)=>{const points=ps.map((p,k)=>point(p,`${pathId}/${j+1}/${k+1}`));return {id:`${pathId}-s${j+1}`,points,stats:statistics(points)};});
   sourcePaths.push({id:pathId,kind,name:str(raw.name)||`${kind} ${i+1}`,description:str(raw.desc),extensions:raw.extensions??null,segments});
   if(!segments.length || segments.some(s=>s.points.length<2)) issues.push(`${pathId}: empty or single-point segment preserved; cannot draw a line`);
   for(const s of segments) {
    if(s.points.length>1 && s.points.every(p=>p.time!==null) && new Set(s.points.map(p=>p.time)).size===1) issues.push(`${s.id}: identical point timestamps; not travel timing`);
    if(s.points.some(p=>p.elevation===null)) issues.push(`${s.id}: missing elevation; gain unavailable`);
    if(s.points.some(p=>p.time===null)) issues.push(`${s.id}: missing point timestamps`);
   }
   pathIssues.set(pathId,issues.slice(issueStart));
  });
 }
 const sourcePathIssues=[...issues];
 const pathIds=override.pathIds??sourcePaths.map(p=>p.id);
 if(pathIds.some(id=>!sourcePaths.some(p=>p.id===id)) || new Set(pathIds).size!==pathIds.length) throw new Error('Invalid pathIds override');
 const paths=pathIds.map(id=>sourcePaths.find(p=>p.id===id)!);
 issues.length=0;
 issues.push(...paths.flatMap(p=>pathIssues.get(p.id)!));
 const waypoints:Waypoint[]=array(root.wpt).map((raw,i)=>{
  const wid=`wpt-${i+1}`, name=str(raw.name)||`Waypoint ${i+1}`,description=str(raw.desc),symbol=str(raw.sym),type=str(raw.type);
  const w={...point(raw,wid),id:wid,name,description,symbol,type,kind:classify(name,symbol,type,description),...override.waypoints?.[wid]};
  if(!Number.isFinite(w.lon)||!Number.isFinite(w.lat)||Math.abs(w.lon)>180||Math.abs(w.lat)>90) throw new Error(`${wid}: invalid override coordinates`);
  if(w.kind==='other') issues.push(`${wid}: unrecognized waypoint classification (${symbol||type||'no symbol/type'}); generic marker used`);
  return w;
 });
 for(const key of Object.keys(override.waypoints??{})) if(!waypoints.some(w=>w.id===key)) throw new Error(`Unknown waypoint override ${key}`);
 const defaultPaths=paths.some(p=>p.kind==='track')?paths.filter(p=>p.kind==='track'):paths;
 const statsPathIds=override.statsPathIds??defaultPaths.map(p=>p.id);
 if(statsPathIds.some(s=>!paths.some(p=>p.id===s)) || new Set(statsPathIds).size!==statsPathIds.length) throw new Error('Invalid statsPathIds override');
 const relevant=statsPathIds.map(s=>paths.find(p=>p.id===s)!);
 const multipleRoutesIssue='Multiple planned routes may overlap or be alternatives; totals are mapped geometry, not measured travel.';
 if(paths.filter(p=>p.kind==='route').length>1) issues.push(multipleRoutesIssue);
 const relevantPoints=relevant.flatMap(p=>p.segments.flatMap(s=>s.points));
 for(const [kind,p] of [['start',relevantPoints[0]],['end',relevantPoints.at(-1)]] as const) {
  if(p && !waypoints.some(w=>w.kind===kind||w.kind==='start-end')) waypoints.push({...p,id:`derived-${kind}`,name:`${kind==='start'?'Start':'End'} of mapped geometry`,kind,description:'Derived from the first/last point of summary geometry in file or override order; direction is not confirmed.',symbol:'',type:'',derived:true});
 }
 const allPoints=[...paths.flatMap(p=>p.segments.flatMap(s=>s.points)),...waypoints];
 const bounds:Bounds|null=allPoints.length?allPoints.reduce<Bounds>((b,p)=>[Math.min(b[0],p.lon),Math.min(b[1],p.lat),Math.max(b[2],p.lon),Math.max(b[3],p.lat)],[180,90,-180,-90]):null;
 const year=filename.match(/\b(20\d{2})\b/)?.[1],month=filename.match(/january|february|march|april|may|june|july|august|september|october|november|december/i)?.[0];
 const dates=override.dates??{label:year?`${month?month[0].toUpperCase()+month.slice(1)+' ':''}${year}`:'Date unknown',source:year?'filename (year/month precision)':'unavailable'};
 if(!year && !override.dates) issues.push('Trip date unavailable; route and waypoint creation times are not used as trip dates.');
 if(!paths.length) issues.push('No tracks or routes');
 const title=override.title??id.split('-').map(s=>s[0]?.toUpperCase()+s.slice(1)).join(' ');
 const displayYear=dates.label.match(/\b(?:19|20)\d{2}\b/)?.[0];
 const mapLabel=override.mapLabel??(displayYear&&!title.includes(displayYear)?`${title} ${displayYear}`:title);
 const trip:Trip={id,title,mapLabel,dates,region:override.region,tags:override.tags,detailUrl:`/trips/${id}.json`,bounds,stats:sumStats(relevant.flatMap(p=>p.segments.map(s=>s.stats))),statsPathIds,statsLabel:override.statsLabel??(relevant.some(p=>p.kind==='track')?'Recorded tracks':'Mapped routes'),overview:geometry(paths,id,true),waypoints,notes:override.notes,issues};
 const detail:TripDetail={schemaVersion:1,id,paths,geojson:geometry(paths,id),sourceMetadata:root.metadata??null,sourceExtensions:root.extensions??null};
 const ps=sourcePaths.flatMap(p=>p.segments.flatMap(s=>s.points));
 const inventoryIssues=[...new Set([...sourcePathIssues,...issues,...(sourcePaths.filter(p=>p.kind==='route').length>1?[multipleRoutesIssue]:[])])];
 const inventory={id,filename,tracks:sourcePaths.filter(p=>p.kind==='track').length,routes:sourcePaths.filter(p=>p.kind==='route').length,trackSegments:sourcePaths.filter(p=>p.kind==='track').reduce((n,p)=>n+p.segments.length,0),routeSegments:sourcePaths.filter(p=>p.kind==='route').reduce((n,p)=>n+p.segments.length,0),emptySegments:sourcePaths.flatMap(p=>p.segments).filter(s=>!s.points.length).length,sourceWaypoints:array(root.wpt).length,campsites:waypoints.filter(w=>w.kind==='camp'&&!w.derived).length,derivedMarkers:waypoints.filter(w=>w.derived).length,points:ps.length,elevationPoints:ps.filter(p=>p.elevation!==null).length,timestampPoints:ps.filter(p=>p.time!==null).length,issues:inventoryIssues};
 return {trip,detail,inventory};
}
