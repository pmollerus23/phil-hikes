import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapHandle } from './mapHandle';
// The map engine (MapLibre, react-map-gl, worker, engine CSS) loads lazily so
// the archive interface becomes usable before the heavy dependency graph
// finishes. The shell keeps no static dependency on the engine chunk.
const MapCanvas = lazy(() => import('./MapCanvas'));
import Profile from './Profile';
import WaypointIcon from './WaypointIcon';
import { PhotoLightbox, PlaceDetail, TripCarousel, placeForPhoto, photosForPlace, type PhotoPlace } from './Photos';
import { type Trip, type TripDetail, type TripPhoto, type TripPhotos, type Point } from './model';
import { tripFromUrl, urlForTrip } from './url';
import { miles, feet } from './geo';
import { validateDetail, validateIndex, validatePhotoData } from './validation';
import './map.css';

const key=import.meta.env.PUBLIC_MAPTILER_KEY?.trim();
class MapBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<div className="map-fallback"><h2>Map rendering is unavailable</h2><p>Try a browser with WebGL enabled. You can still explore the trip archive.</p></div>:this.props.children;}}
function hasWebGL(){try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}}
function urlState(){const params=new URL(location.href).searchParams;return {placeId:params.get('place'),photoId:params.get('photo'),scope:params.get('collection')==='trip'?'trip' as const:'place' as const};}
function selectionUrl(tripId:string|null,placeId:string|null=null,photoId:string|null=null,scope:'place'|'trip'='place'){
 const next=new URL(urlForTrip(location.href,tripId),'http://localhost');
 for(const name of ['place','photo','gallery','collection'])next.searchParams.delete(name);
 if(placeId)next.searchParams.set('place',placeId);
 if(photoId){next.searchParams.set('photo',photoId);next.searchParams.set('collection',scope);}
 return `${next.pathname}${next.search}${next.hash}`;
}

export default function MapApp({photoDemo=false}:{photoDemo?:boolean}){
 const [trips,setTrips]=useState<Trip[]>([]),[loaded,setLoaded]=useState(false),[archiveError,setArchiveError]=useState(''),[retry,setRetry]=useState(0);
 const [id,setId]=useState<string|null>(null),[unknown,setUnknown]=useState(false),[detail,setDetail]=useState<TripDetail|null>(null),[detailError,setDetailError]=useState(''),[detailRetry,setDetailRetry]=useState(0);
 const [open,setOpen]=useState(true),[style,setStyle]=useState<'outdoor'|'mono'|'satellite'>('outdoor'),[terrain,setTerrain]=useState(false),[mapError,setMapError]=useState(''),[placeId,setPlaceId]=useState<string|null>(null),[activePhotoId,setActivePhotoId]=useState<string|null>(null),[info,setInfo]=useState(false),[viewer,setViewer]=useState(false),[viewerScope,setViewerScope]=useState<'place'|'trip'>('place'),[demoPhotos,setDemoPhotos]=useState<TripPhotos|null>(null),[webgl]=useState(hasWebGL);
 const map=useRef<MapHandle>(null),panel=useRef<HTMLDivElement>(null),restoreFocus=useRef<HTMLElement|null>(null);const selected=trips.find(t=>t.id===id)??null;
 // Focus requests made while the engine chunk is still loading are kept as a
 // single latest pending intent and applied once the map reports ready, after
 // its initial framing. Only the newest intent survives, so obsolete
 // selections are never replayed.
 const focusSeq=useRef(0),pendingFocus=useRef<{point:Point;seq:number}|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const flushFocus=useCallback(()=>{const pending=pendingFocus.current;if(pending&&map.current){map.current.showPoint(pending.point);map.current.focusPoint(pending.point);pendingFocus.current=null;}},[]);
 const requestFocus=useCallback((point:Point)=>{focusSeq.current+=1;const seq=focusSeq.current;pendingFocus.current={point,seq};window.setTimeout(()=>{if(pendingFocus.current?.seq!==seq)return;flushFocus();},0);},[flushFocus]);
 const handleMapReady=useCallback(()=>{setMapReady(true);flushFocus();},[flushFocus]);
 useEffect(()=>{const abort=new AbortController();setArchiveError('');setLoaded(false);fetch('/trips/index.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Trip archive is missing. Run npm run import:gpx.');return r.json();}).then(validateIndex).then(data=>{if(!abort.signal.aborted){setTrips(data);setLoaded(true);}}).catch(e=>{if(!abort.signal.aborted){setArchiveError(e.message||'Unable to load trips. Check your connection.');setLoaded(true);}});return()=>abort.abort();},[retry]);
 const restore=useCallback(()=>{const state=tripFromUrl(location.href,trips.map(t=>t.id)),extra=urlState();setId(state.id);setUnknown(state.unknown);setPlaceId(state.id?extra.placeId:null);setActivePhotoId(state.id?extra.photoId:null);setViewer(!!state.id&&!!extra.photoId);setViewerScope(extra.scope);if(state.id)setOpen(true);},[trips]);
  useEffect(()=>{if(!loaded)return;restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[loaded,restore]);
  // Bounded in-memory cache of validated trip details: A→B→A reuses the
  // validated A object without refetching, reparsing, or revalidating. Only
  // successful responses are stored; explicit retry evicts the entry. Stale
  // selections stay guarded by the fetch abort. Reloads revalidate normally.
  const detailCache=useRef(new Map<string,TripDetail>());
  const retryDetail=useCallback(()=>{if(selected)detailCache.current.delete(selected.detailUrl);setDetailRetry(v=>v+1);},[selected]);
  useEffect(()=>{
   setDetailError('');setDemoPhotos(null);if(!selected){setDetail(null);return;}
   const cached=detailCache.current.get(selected.detailUrl);
   if(cached&&cached.id===selected.id){setDetail(cached);return;}
   setDetail(null);const abort=new AbortController();
   fetch(selected.detailUrl,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('The detailed route could not load. Preview geometry is still available.');return r.json();}).then(v=>validateDetail(v,selected.id)).then(v=>{if(abort.signal.aborted)return;while(detailCache.current.size>=3){const oldest=detailCache.current.keys().next();if(oldest.done)break;detailCache.current.delete(oldest.value);}detailCache.current.set(selected.detailUrl,v);setDetail(v);}).catch(e=>{if(!abort.signal.aborted)setDetailError(e.message||'Unable to load route detail.');});return()=>abort.abort();
  },[selected,detailRetry]);
 useEffect(()=>{
  if(!photoDemo||!selected)return;const abort=new AbortController();
  fetch(`/demo/photos/${selected.id}.json`,{signal:abort.signal}).then(response=>response.status===404?{stops:[],photos:[]}:response.ok?response.json():Promise.reject(new Error('Demo photo data could not load.'))).then(validatePhotoData).then(data=>{if(!abort.signal.aborted)setDemoPhotos(data);}).catch(error=>{if(!abort.signal.aborted)setDetailError(error.message||'Demo photo data could not load.');});return()=>abort.abort();
 },[photoDemo,selected]);
 const photoData=useMemo<TripPhotos>(()=>demoPhotos??(detail?.id===id?{stops:detail.photoStops,photos:detail.photos}:{stops:[],photos:[]}),[demoPhotos,detail,id]);
 const photosReady=photoDemo?demoPhotos!==null:detail?.id===id;
 const places=useMemo(()=>selected?[...selected.waypoints,...photoData.stops]:[],[selected,photoData.stops]);
 const place=places.find(candidate=>candidate.id===placeId)??null;
 useEffect(()=>{if(!photosReady||!placeId||place)return;setPlaceId(null);setActivePhotoId(null);history.replaceState({},'',selectionUrl(id));},[photosReady,placeId,place,id]);
 useEffect(()=>{if(!photosReady||!activePhotoId)return;const photo=photoData.photos.find(candidate=>candidate.id===activePhotoId);if(photo)return;setActivePhotoId(null);setViewer(false);history.replaceState({},'',selectionUrl(id,placeId));},[photosReady,activePhotoId,photoData.photos,id,placeId]);
 const select=useCallback((next:string|null)=>{const url=selectionUrl(next);if(url!==`${location.pathname}${location.search}${location.hash}`)history.pushState({},'',url);pendingFocus.current=null;setId(next);setUnknown(false);setPlaceId(null);setActivePhotoId(null);setInfo(false);setViewer(false);setDetailError('');setOpen(true);panel.current?.scrollTo({top:0});},[]);
 const choosePlace=useCallback((trip:Trip,next:PhotoPlace,photoId:string|null=null)=>{
  const changed=placeId!==next.id||id!==trip.id;
   if(id!==trip.id||photoData.photos.length>0)history.pushState({},'',selectionUrl(trip.id,next.id));setId(trip.id);setUnknown(false);setPlaceId(next.id);setActivePhotoId(photoId);setViewer(false);setOpen(true);panel.current?.scrollTo({top:0});
    if(changed)requestFocus(next);
  },[id,placeId,photoData.photos.length,requestFocus]);
   const selectPhoto=useCallback((photoId:string)=>{setActivePhotoId(photoId);const photo=photoData.photos.find(candidate=>candidate.id===photoId),associated=photo&&selected?placeForPhoto(photo,selected.waypoints,photoData.stops):null;if(associated)requestFocus(associated);history.replaceState({},'',selectionUrl(id,placeId));},[id,placeId,photoData,selected,requestFocus]);
  const openViewer=useCallback((photo:TripPhoto,scope:'place'|'trip',opener:HTMLElement)=>{const associated=scope==='trip'&&selected?placeForPhoto(photo,selected.waypoints,photoData.stops):null,nextPlaceId=associated?.id??placeId;restoreFocus.current=opener;setPlaceId(nextPlaceId);setActivePhotoId(photo.id);setViewerScope(scope);setViewer(true);if(associated&&associated.id!==placeId)requestFocus(associated);history.pushState({photoViewer:true},'',selectionUrl(id,nextPlaceId,photo.id,scope));},[id,placeId,selected,photoData.stops,requestFocus]);
 const closeViewer=useCallback(()=>{setViewer(false);if(history.state?.photoViewer)history.back();else history.replaceState({},'',selectionUrl(id,placeId));setTimeout(()=>restoreFocus.current?.focus(),0);},[id,placeId]);
 const viewerPhotos=viewerScope==='trip'?photoData.photos:place?photosForPlace(photoData.photos,place.id):[];
  const changeViewer=useCallback((photoId:string)=>{const photo=photoData.photos.find(candidate=>candidate.id===photoId),next=photo&&selected?placeForPhoto(photo,selected.waypoints,photoData.stops):null,nextPlaceId=next?.id??placeId;setActivePhotoId(photoId);setPlaceId(nextPlaceId);if(next&&next.id!==placeId)requestFocus(next);history.replaceState({photoViewer:true},'',selectionUrl(id,nextPlaceId,photoId,viewerScope));},[id,placeId,viewerScope,photoData,selected,requestFocus]);
 const showPoint=useCallback((p:Point|null)=>map.current?.showPoint(p),[]);
 const failure=!key?'setup':!webgl?'webgl':null;
 const hasPhotos=!!selected&&photoData.photos.length>0;
 return <main className={`map-app ${open?'panel-open':'panel-closed'}${selected?' place-open':''}${hasPhotos&&!info?' carousel-open':''}`} aria-label="Hiking and camping archive">
  {photoDemo&&<div className="demo-ribbon" role="status">PHOTO FEATURE DEMO · SYNTHETIC CONTENT</div>}
   <div className="map-surface">
    {!failure?<MapBoundary><Suspense fallback={<p className="map-loading" role="status">Loading the interactive map…</p>}><MapCanvas ref={map} trips={trips} selected={selected} detail={detail?.id===id?detail:null} photoStops={photoData.stops} photos={photoData.photos} selectedPlaceId={place?.id??null} style={style} terrain={terrain} apiKey={key!} onSelect={select} onWaypoint={choosePlace} onError={setMapError} onReady={handleMapReady} panelOpen={open}/>{!mapReady&&<p className="map-loading" role="status">Loading the interactive map…</p>}</Suspense></MapBoundary>:<div className="map-fallback"><div className="contours" aria-hidden="true">◎</div><span className="eyebrow">THE FIELD AT A GLANCE</span><h2>{failure==='setup'?'Your next view starts here.':'Explore the archive.'}</h2><p>{failure==='setup'?'Add a MapTiler key to bring the landscape into view. All imported trips, notes, and elevation profiles are ready to explore.':'This browser cannot render WebGL maps. The trip list, notes, and elevation profiles remain available.'}</p>{failure==='setup'&&<details><summary>Map setup</summary><p>Set <code>PUBLIC_MAPTILER_KEY</code> in <code>.env</code> and restart the dev server. Use <code>.env.example</code> as a guide. The browser key is public; restrict it to approved domains in MapTiler.</p></details>}</div>}
   </div>
    <div className="map-controls" aria-label="Map display controls"><div className="style-switch"><button disabled={!!failure} aria-pressed={style==='outdoor'} onClick={()=>{setStyle('outdoor');setMapError('');}}>Topo</button><button disabled={!!failure} aria-pressed={style==='mono'} onClick={()=>{setStyle('mono');setMapError('');}}>Mono</button><button disabled={!!failure} aria-pressed={style==='satellite'} onClick={()=>{setStyle('satellite');setMapError('');}}>Satellite</button></div><button className="terrain-button" aria-label="3D terrain" disabled={!!failure} aria-pressed={terrain} onClick={()=>setTerrain(v=>!v)}>△ <span>3D terrain</span></button><button disabled={!!failure||!mapReady} className="frame-button" aria-label="Frame current trip or full archive" onClick={()=>map.current?.frame()}>⌖</button></div>
  {mapError&&<div className="map-error" role="alert">{mapError}<button aria-label="Dismiss map error" onClick={()=>setMapError('')}>×</button></div>}
  <aside className="trip-panel" aria-label="Trip explorer">
   <button className="panel-toggle" aria-controls="trip-panel-content" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span><span className="status-dot"/> {selected?selected.title:'The trip archive'} <small>{trips.length} trips</small></span><span aria-hidden="true">{open?'−':'+'}</span></button>
   <div id="trip-panel-content" ref={panel} className="panel-content" hidden={!open}>
    {unknown&&<p className="notice" role="status">That trip link wasn’t found. Choose a trip below. <button className="text-button" onClick={()=>select(null)}>Clear link</button></p>}
    {!loaded&&<p role="status">Loading the archive…</p>}
    {archiveError&&<div role="alert"><p>{archiveError}</p><button className="simple-button" onClick={()=>setRetry(v=>v+1)}>Retry archive</button></div>}
    {loaded&&!archiveError&&!trips.length&&<p>No trips imported yet. Add GPX files and run the importer to start your archive.</p>}
     {selected?<>
      <button className="back-button" onClick={()=>{select(null);setInfo(false);}}>← All trips</button>
      {hasPhotos?<>
       {info?<div className="trip-info">
        <p className="eyebrow">{selected.region??'FIELD NOTES'} / {selected.dates.label}</p><div className="trip-title-row"><h1>{selected.title}</h1></div>
        {place?<PlaceDetail place={place} photos={photoData.photos} activePhotoId={activePhotoId} onPhoto={selectPhoto} onOpen={(photo,opener)=>openViewer(photo,'place',opener)} onBack={()=>{setPlaceId(null);setActivePhotoId(null);map.current?.showPoint(null);history.pushState({},'',selectionUrl(id));}}/>: <>
        <div className="trip-stats"><div><strong>{miles(selected.stats.distanceM)}</strong><span>{selected.statsLabel}</span></div><div><strong>{selected.stats.gainM===null?'Unavailable':feet(selected.stats.gainM)}</strong><span>Estimated ascent</span></div></div>
        {selected.notes&&<p className="trip-notes">{selected.notes}</p>}
        <p className="caption">{selected.statsPathIds.some(p=>p.startsWith('trk-'))?'Summary uses recorded tracks.':'Planned geometry is not a recording of travel.'} Ascent uses unsmoothed elevation and may overestimate climbing.</p>
{detailError?<div className="notice" role="alert">{detailError}<button className="text-button" onClick={retryDetail}>Retry detail</button></div>:detail?.id===id?<Profile key={id} detail={detail} pathIds={selected.statsPathIds} onPoint={showPoint}/>:<p role="status" className="subtle">Loading detailed route and elevation…</p>}
         <section className="waypoint-list"><div className="section-label">ALONG THE WAY <span>{selected.waypoints.length} places</span></div>{selected.waypoints.map(next=>{const count=photosForPlace(photoData.photos,next.id).length;return <button key={next.id} aria-pressed={false} onClick={()=>choosePlace(selected,next)}><span className={`list-icon kind-${next.kind}`} aria-hidden="true"><WaypointIcon kind={next.kind}/></span><span>{next.name}<small>{next.kind.replace('-',' / ')}{next.derived?' · derived':''}</small></span>{count>0&&<span className="list-photo-count" aria-label={`${count} ${count===1?'photo':'photos'}`}>▣ {count}</span>}<span aria-hidden="true">↗</span></button>})}</section>
        {photoData.stops.length>0&&<details className="data-notes photo-stop-list"><summary>GPS photo stops · {photoData.stops.length}</summary><div className="waypoint-list photo-stop-buttons">{photoData.stops.map(next=>{const count=photosForPlace(photoData.photos,next.id).length;return <button key={next.id} aria-pressed={false} onClick={()=>choosePlace(selected,next)}><span className="list-icon kind-photo" aria-hidden="true"><span className="photo-stop-icon">▣</span></span><span>{next.name}<small>photo stop</small></span><span className="list-photo-count" aria-label={`${count} ${count===1?'photo':'photos'}`}>▣ {count}</span><span aria-hidden="true">↗</span></button>})}</div></details>}
        {detail?.id===id&&<details className="data-notes"><summary>Source geometry · {detail.paths.length} {detail.paths.length===1?'path':'paths'}</summary>{detail.paths.map(path=><div key={path.id}><strong>{path.kind==='route'?'Planned route':'Recorded track'}: {path.name}</strong><p>{path.segments.length} segment(s) · {path.segments.reduce((n,s)=>n+s.points.length,0)} points{selected.statsPathIds.includes(path.id)?' · included in summary':' · alternative geometry'}</p>{path.description&&<p>{path.description}</p>}</div>)}</details>}
        {selected.issues.length>0&&<details className="data-notes"><summary>Source notes · {selected.issues.length}</summary><ul>{selected.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
       </>}
       </div>:<TripCarousel photos={photoData.photos} waypoints={selected.waypoints} stops={photoData.stops} activePlaceId={place?.id??null} onOpen={(photo,opener)=>openViewer(photo,'trip',opener)} onPlace={(next,photoId)=>choosePlace(selected,next,photoId)}/>}
       <footer className="trip-footer"><div><strong>{selected.title}</strong><small>{selected.region??'Region unspecified'} · {selected.dates.label} · {photoData.photos.length} {photoData.photos.length===1?'photo':'photos'}</small></div><button className="info-toggle" aria-pressed={info} onClick={()=>setInfo(v=>!v)}>{info?'← Photos':'ⓘ Trip info'}</button></footer>
      </>:<>
       <p className="eyebrow">{selected.region??'FIELD NOTES'} / {selected.dates.label}</p><div className="trip-title-row"><h1>{selected.title}</h1></div>
       {place?<PlaceDetail place={place} photos={photoData.photos} activePhotoId={activePhotoId} onPhoto={selectPhoto} onOpen={(photo,opener)=>openViewer(photo,'place',opener)} onBack={()=>{setPlaceId(null);setActivePhotoId(null);map.current?.showPoint(null);history.pushState({},'',selectionUrl(id));}}/>: <>
       <div className="trip-stats"><div><strong>{miles(selected.stats.distanceM)}</strong><span>{selected.statsLabel}</span></div><div><strong>{selected.stats.gainM===null?'Unavailable':feet(selected.stats.gainM)}</strong><span>Estimated ascent</span></div></div>
       {selected.notes&&<p className="trip-notes">{selected.notes}</p>}
       <p className="caption">{selected.statsPathIds.some(p=>p.startsWith('trk-'))?'Summary uses recorded tracks.':'Planned geometry is not a recording of travel.'} Ascent uses unsmoothed elevation and may overestimate climbing.</p>
{detailError?<div className="notice" role="alert">{detailError}<button className="text-button" onClick={retryDetail}>Retry detail</button></div>:detail?.id===id?<Profile key={id} detail={detail} pathIds={selected.statsPathIds} onPoint={showPoint}/>:<p role="status" className="subtle">Loading detailed route and elevation…</p>}
        <section className="waypoint-list"><div className="section-label">ALONG THE WAY <span>{selected.waypoints.length} places</span></div>{selected.waypoints.map(next=>{const count=photosForPlace(photoData.photos,next.id).length;return <button key={next.id} aria-pressed={false} onClick={()=>choosePlace(selected,next)}><span className={`list-icon kind-${next.kind}`} aria-hidden="true"><WaypointIcon kind={next.kind}/></span><span>{next.name}<small>{next.kind.replace('-',' / ')}{next.derived?' · derived':''}</small></span>{count>0&&<span className="list-photo-count" aria-label={`${count} ${count===1?'photo':'photos'}`}>▣ {count}</span>}<span aria-hidden="true">↗</span></button>})}</section>
       {photoData.stops.length>0&&<details className="data-notes photo-stop-list"><summary>GPS photo stops · {photoData.stops.length}</summary><div className="waypoint-list photo-stop-buttons">{photoData.stops.map(next=>{const count=photosForPlace(photoData.photos,next.id).length;return <button key={next.id} aria-pressed={false} onClick={()=>choosePlace(selected,next)}><span className="list-icon kind-photo" aria-hidden="true"><span className="photo-stop-icon">▣</span></span><span>{next.name}<small>photo stop</small></span><span className="list-photo-count" aria-label={`${count} ${count===1?'photo':'photos'}`}>▣ {count}</span><span aria-hidden="true">↗</span></button>})}</div></details>}
       {detail?.id===id&&<details className="data-notes"><summary>Source geometry · {detail.paths.length} {detail.paths.length===1?'path':'paths'}</summary>{detail.paths.map(path=><div key={path.id}><strong>{path.kind==='route'?'Planned route':'Recorded track'}: {path.name}</strong><p>{path.segments.length} segment(s) · {path.segments.reduce((n,s)=>n+s.points.length,0)} points{selected.statsPathIds.includes(path.id)?' · included in summary':' · alternative geometry'}</p>{path.description&&<p>{path.description}</p>}</div>)}</details>}
       {selected.issues.length>0&&<details className="data-notes"><summary>Source notes · {selected.issues.length}</summary><ul>{selected.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
      </>}
      </>}
     </>:<><p className="eyebrow">ON FOOT & UNDER CANVAS</p><h1>Places worth<br/>remembering.</h1><p className="panel-intro">Follow a route. Find a campsite.<br/>A few notes from the way there.</p><div className="archive-label"><span>TRIP COLLECTION</span><span>{String(trips.length).padStart(2,'0')}</span></div><ol className="trip-list">{trips.map((t,i)=><li key={t.id}><button onClick={()=>select(t.id)}><span className="trip-number">{String(i+1).padStart(2,'0')}</span><span><strong>{t.title}</strong><small>{t.region??'Region unspecified'} · {t.dates.label}</small></span><span className="trip-arrow" aria-hidden="true">↗</span></button></li>)}</ol><p className="caption archive-caption">Routes from Gaia GPS exports.<br/>Personal notes, kept close to the trail.</p></>}
    </div>
  </aside>
  {!failure&&<a className="provider-logo" href="https://www.maptiler.com/" target="_blank" rel="noreferrer" aria-label="MapTiler"><img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" width="80" height="20"/></a>}
  <div className="map-legend"><span className="line-swatch"/> Planned route <WaypointIcon kind="camp" /> Camp <WaypointIcon kind="summit" /> Summit</div>
  {viewer&&activePhotoId&&viewerPhotos.some(photo=>photo.id===activePhotoId)&&<PhotoLightbox photos={viewerPhotos} activeId={activePhotoId} scope={viewerScope} placeName={photo=>placeForPhoto(photo,selected?.waypoints??[],photoData.stops)?.name??'Unknown place'} onChange={changeViewer} onClose={closeViewer}/>}
 </main>;
}
