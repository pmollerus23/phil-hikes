import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import MapCanvas, {type MapHandle} from './MapCanvas';
import Profile from './Profile';
import { icons, type Trip, type TripDetail, type Waypoint, type Point } from './model';
import { tripFromUrl, urlForTrip } from './url';
import { miles, feet } from './geo';
import { validateDetail, validateIndex } from './validation';
import './map.css';
const key=import.meta.env.PUBLIC_MAPTILER_KEY?.trim();
class MapBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<div className="map-fallback"><h2>Map rendering is unavailable</h2><p>Try a browser with WebGL enabled. You can still explore the trip archive.</p></div>:this.props.children;}}
function hasWebGL(){try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}}
export default function MapApp(){
 const [trips,setTrips]=useState<Trip[]>([]),[loaded,setLoaded]=useState(false),[archiveError,setArchiveError]=useState(''),[retry,setRetry]=useState(0);
 const [id,setId]=useState<string|null>(null),[unknown,setUnknown]=useState(false),[detail,setDetail]=useState<TripDetail|null>(null),[detailError,setDetailError]=useState(''),[detailRetry,setDetailRetry]=useState(0);
 const [open,setOpen]=useState(true),[style,setStyle]=useState<'outdoor'|'satellite'>('outdoor'),[terrain,setTerrain]=useState(false),[mapError,setMapError]=useState(''),[waypoint,setWaypoint]=useState<Waypoint|null>(null),[webgl]=useState(hasWebGL);
 const map=useRef<MapHandle>(null);const panel=useRef<HTMLDivElement>(null);const selected=trips.find(t=>t.id===id)??null;
 useEffect(()=>{const abort=new AbortController();setArchiveError('');setLoaded(false);fetch('/trips/index.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Trip archive is missing. Run npm run import:gpx.');return r.json();}).then(validateIndex).then(data=>{if(!abort.signal.aborted){setTrips(data);setLoaded(true);}}).catch(e=>{if(!abort.signal.aborted){setArchiveError(e.message||'Unable to load trips. Check your connection.');setLoaded(true);}});return()=>abort.abort();},[retry]);
 useEffect(()=>{
  if(!loaded)return;function restore(){const state=tripFromUrl(location.href,trips.map(t=>t.id));setId(state.id);setUnknown(state.unknown);setWaypoint(null);if(state.id)setOpen(true);}
  restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[loaded,trips]);
 useEffect(()=>{
  setDetail(null);setDetailError('');if(!selected)return;const abort=new AbortController();
  fetch(selected.detailUrl,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('The detailed route could not load. Preview geometry is still available.');return r.json();}).then(v=>validateDetail(v,selected.id)).then(v=>{if(!abort.signal.aborted)setDetail(v);}).catch(e=>{if(!abort.signal.aborted)setDetailError(e.message||'Unable to load route detail.');});return()=>abort.abort();
 },[selected,detailRetry]);
 const select=useCallback((next:string|null)=>{const url=urlForTrip(location.href,next);if(url!==`${location.pathname}${location.search}${location.hash}`)history.pushState({},'',url);setId(next);setUnknown(false);setWaypoint(null);setDetailError('');setOpen(true);panel.current?.scrollTo({top:0});},[]);
 const chooseWaypoint=useCallback((t:Trip,w:Waypoint)=>{select(t.id);setWaypoint(w);},[select]);
 const showPoint=useCallback((p:Point|null)=>map.current?.showPoint(p),[]);
 const failure=!key?'setup':!webgl?'webgl':null;
 return <main className={`map-app ${open?'panel-open':'panel-closed'}`} aria-label="Hiking and camping archive">
  <div className="map-surface">
   {!failure?<MapBoundary><MapCanvas ref={map} trips={trips} selected={selected} detail={detail?.id===id?detail:null} style={style} terrain={terrain} apiKey={key!} onSelect={select} onWaypoint={chooseWaypoint} onError={setMapError} panelOpen={open}/></MapBoundary>:<div className="map-fallback"><div className="contours" aria-hidden="true">◎</div><span className="eyebrow">THE FIELD AT A GLANCE</span><h2>{failure==='setup'?'Your next view starts here.':'Explore the archive.'}</h2><p>{failure==='setup'?'Add a MapTiler key to bring the landscape into view. All imported trips, notes, and elevation profiles are ready to explore.':'This browser cannot render WebGL maps. The trip list, notes, and elevation profiles remain available.'}</p>{failure==='setup'&&<details><summary>Map setup</summary><p>Set <code>PUBLIC_MAPTILER_KEY</code> in <code>.env</code> and restart the dev server. Use <code>.env.example</code> as a guide. The browser key is public; restrict it to approved domains in MapTiler.</p></details>}</div>}
  </div>
  <div className="map-controls" aria-label="Map display controls"><div className="style-switch"><button disabled={!!failure} aria-pressed={style==='outdoor'} onClick={()=>{setStyle('outdoor');setMapError('');}}>Outdoor</button><button disabled={!!failure} aria-pressed={style==='satellite'} onClick={()=>{setStyle('satellite');setMapError('');}}>Satellite</button></div><button className="terrain-button" aria-label="3D terrain" disabled={!!failure} aria-pressed={terrain} onClick={()=>setTerrain(v=>!v)}>△ <span>3D terrain</span></button><button disabled={!!failure} className="frame-button" aria-label="Frame current trip or full archive" onClick={()=>map.current?.frame()}>⌖</button></div>
  {mapError&&<div className="map-error" role="alert">{mapError}<button aria-label="Dismiss map error" onClick={()=>setMapError('')}>×</button></div>}
  <aside className="trip-panel" aria-label="Trip explorer">
   <button className="panel-toggle" aria-controls="trip-panel-content" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span><span className="status-dot"/> {selected?selected.title:'The trip archive'} <small>{trips.length} trips</small></span><span aria-hidden="true">{open?'−':'+'}</span></button>
   <div id="trip-panel-content" ref={panel} className="panel-content" hidden={!open}>
    {unknown&&<p className="notice" role="status">That trip link wasn’t found. Choose a trip below. <button className="text-button" onClick={()=>select(null)}>Clear link</button></p>}
    {!loaded&&<p role="status">Loading the archive…</p>}
    {archiveError&&<div role="alert"><p>{archiveError}</p><button className="simple-button" onClick={()=>setRetry(v=>v+1)}>Retry archive</button></div>}
    {loaded&&!archiveError&&!trips.length&&<p>No trips imported yet. Add GPX files and run the importer to start your archive.</p>}
    {selected?<>
     <button className="back-button" onClick={()=>select(null)}>← All trips</button>
     <p className="eyebrow">{selected.region??'FIELD NOTES'} / {selected.dates.label}</p><h1>{selected.title}</h1>
     {waypoint&&<section className="waypoint-detail" aria-label="Waypoint details" aria-live="polite"><button className="close-detail" aria-label="Close waypoint details" onClick={()=>setWaypoint(null)}>×</button><span className="eyebrow">{icons[waypoint.kind]} {waypoint.kind.replace('-',' / ')}{waypoint.derived?' · derived':''}</span><h2>{waypoint.name}</h2><p>{waypoint.description||'No description supplied.'}</p>{(waypoint.symbol||waypoint.type)&&<p className="caption">Original symbol/type: {waypoint.symbol||waypoint.type}</p>}</section>}
     <div className="trip-stats"><div><strong>{miles(selected.stats.distanceM)}</strong><span>{selected.statsLabel}</span></div><div><strong>{selected.stats.gainM===null?'Unavailable':feet(selected.stats.gainM)}</strong><span>Estimated ascent</span></div></div>
     {selected.notes&&<p className="trip-notes">{selected.notes}</p>}
     <p className="caption">{selected.statsPathIds.some(p=>p.startsWith('trk-'))?'Summary uses recorded tracks.':'Planned geometry is not a recording of travel.'} Ascent uses unsmoothed elevation and may overestimate climbing.</p>
     {detailError?<div className="notice" role="alert">{detailError}<button className="text-button" onClick={()=>setDetailRetry(v=>v+1)}>Retry detail</button></div>:detail?.id===id?<Profile key={id} detail={detail} pathIds={selected.statsPathIds} onPoint={showPoint}/>:<p role="status" className="subtle">Loading detailed route and elevation…</p>}

     <section className="waypoint-list"><div className="section-label">ALONG THE WAY <span>{selected.waypoints.length} places</span></div>{selected.waypoints.map(w=><button key={w.id} aria-pressed={waypoint?.id===w.id} onClick={()=>{setWaypoint(w);showPoint(w);panel.current?.scrollTo({top:0});}}><span className={`list-icon kind-${w.kind}`} aria-hidden="true">{icons[w.kind]}</span><span>{w.name}<small>{w.kind.replace('-',' / ')}{w.derived?' · derived':''}</small></span><span aria-hidden="true">↗</span></button>)}</section>
     {detail?.id===id&&<details className="data-notes"><summary>Source geometry · {detail.paths.length} paths</summary>{detail.paths.map(path=><div key={path.id}><strong>{path.kind==='route'?'Planned route':'Recorded track'}: {path.name}</strong><p>{path.segments.length} segment(s) · {path.segments.reduce((n,s)=>n+s.points.length,0)} points{selected.statsPathIds.includes(path.id)?' · included in summary':' · alternative geometry'}</p>{path.description&&<p>{path.description}</p>}</div>)}</details>}
     {selected.issues.length>0&&<details className="data-notes"><summary>Source notes · {selected.issues.length}</summary><ul>{selected.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
    </>:<><p className="eyebrow">ON FOOT & UNDER CANVAS</p><h1>Places worth<br/>remembering.</h1><p className="panel-intro">Follow a route. Find a campsite.<br/>A few notes from the way there.</p><div className="archive-label"><span>TRIP COLLECTION</span><span>{String(trips.length).padStart(2,'0')}</span></div><ol className="trip-list">{trips.map((t,i)=><li key={t.id}><button onClick={()=>select(t.id)}><span className="trip-number">{String(i+1).padStart(2,'0')}</span><span><strong>{t.title}</strong><small>{t.region??'Region unspecified'} · {t.dates.label}</small></span><span className="trip-arrow" aria-hidden="true">↗</span></button></li>)}</ol><p className="caption archive-caption">Routes from Gaia GPS exports.<br/>Personal notes, kept close to the trail.</p></>}
   </div>
  </aside>
  {!failure&&<a className="provider-logo" href="https://www.maptiler.com/" target="_blank" rel="noreferrer" aria-label="MapTiler"><img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" width="80" height="20"/></a>}
  <div className="map-legend"><span className="line-swatch"/> Planned route <span aria-hidden="true">⛺</span> Camp <span aria-hidden="true">▲</span> Summit</div>
 </main>;
}
