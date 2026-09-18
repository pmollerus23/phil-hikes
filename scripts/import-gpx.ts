import { readdir, readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseGpx, stableId } from './gpx';
import type { Override } from '../src/features/map/model';
const source='gpx_map_data';
const overrides:Record<string,Override>=JSON.parse(await readFile('data/trip-overrides.json','utf8'));
let files:string[];
try { files=(await readdir(source)).filter(f=>/\.gpx$/i.test(f)).sort(); }
catch { throw new Error('Missing gpx_map_data/. Restore the original exports and run npm run import:gpx. Existing output was not modified.'); }
if(!files.length) throw new Error('No GPX files found; existing output was not modified.');
const ids=files.map(stableId); if(new Set(ids).size!==ids.length) throw new Error('Filename ID collision');
for(const key of Object.keys(overrides)) if(!ids.includes(key)) throw new Error(`Override references missing file: ${key}`);
const results=[]; const errors=[];
for(const filename of files) {
 try { const xml=await readFile(`${source}/${filename}`,'utf8'); results.push({...parseGpx(xml,filename,overrides[stableId(filename)]),sha256:createHash('sha256').update(xml).digest('hex')}); }
 catch(e) {errors.push(`${filename}: ${String(e)}`);}
}
if(errors.length) throw new Error(`Import aborted without replacing output:\n${errors.join('\n')}`);
const staging='public/.trips-import'; await mkdir(staging,{recursive:true});
for(const r of results) await writeFile(`${staging}/${r.trip.id}.json`,JSON.stringify(r.detail));
await writeFile(`${staging}/index.json`,JSON.stringify(results.map(r=>r.trip)));
const inventory=results.map(r=>({...r.inventory,sha256:r.sha256}));
await writeFile(`${staging}/inventory.json`,JSON.stringify(inventory,null,2));
await rm('public/trips',{recursive:true,force:true}); await rename(staging,'public/trips');
const lines=['# GPX inventory','',`Imported ${results.length} files. Counts below are source counts; derived endpoint markers are excluded from waypoints. Route segments include an empty route. Elevation/time counts refer to geometry points, not waypoints. Presentation overrides may publish a subset of source paths.`,'','| Trip | Tracks | Routes | Track / route segments | Empty | Waypoints | Camps | Points | Elevation / time points |','| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |',...inventory.map(r=>`| ${r.id} | ${r.tracks} | ${r.routes} | ${r.trackSegments} / ${r.routeSegments} | ${r.emptySegments} | ${r.sourceWaypoints} | ${r.campsites} | ${r.points} | ${r.elevationPoints} / ${r.timestampPoints} |`),'','## Parsing and interpretation issues','',...results.flatMap(r=>[`### ${r.trip.title}`,...r.inventory.issues.map(s=>`- ${s}`),...(r.trip.notes?[`- Metadata note: ${r.trip.notes}`]:[]),'']),'## Source format','', 'All supplied exports use GPX 1.1 with creator GaiaGPS. There are no recorded tracks, track segments, metadata blocks, waypoint type tags, or Gaia object identifiers. Planned routes use rte/rtept. Names and descriptions are on routes and waypoints. Symbols include emoji-⛺, emoji-🗻, car-24, and bus; some waypoints have no symbol. Route extensions contain gpx_style/0/2 line/color values. All nonempty routes have elevations and a single repeated timestamp per route. Waypoints have timestamps but no elevation. Timestamp values often date to export day and must not imply trip dates. Filesystem modification times are not trip dates.','', 'See public/trips/inventory.json for source SHA-256 hashes and machine-readable counts.'];
await mkdir('docs',{recursive:true}); await writeFile('docs/trip-inventory.md',lines.join('\n'));
console.log(`Imported ${results.length} trips, ${inventory.reduce((s,r)=>s+r.routes,0)} routes, ${inventory.reduce((s,r)=>s+r.points,0)} points, ${inventory.reduce((s,r)=>s+r.sourceWaypoints,0)} waypoints. See docs/trip-inventory.md.`);
