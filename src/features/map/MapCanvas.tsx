import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, AttributionControl, ScaleControl, type MapRef } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// MapLibre 6 ships an external ESM worker; let Astro/Vite bundle its dependencies.
maplibregl.setWorkerUrl(workerUrl);
import type { Bounds, PhotoStop, Trip, TripDetail, TripPhoto, Waypoint } from './model';
import type { MapHandle } from './mapHandle';
export type { MapHandle } from './mapHandle';
import type { StyleSpecification } from 'maplibre-gl';
import { createTopoStyle, emptyTopoStyle } from './topoStyle';
import WaypointIcon from './WaypointIcon';
import TripFlag, { tripFlagPosition, tripFlagWidth } from './TripFlag';
import { DEFAULT_TRIP_FLAG_OFFSET, layoutTripFlags, tripFlagScale, type ScreenRect, type TripFlagOffset } from './tripFlagLayout';
import MapCrosshair from './MapCrosshair';
import { overlappingTripIds, shouldGroupWaypoints, tripAreasOverlap } from './waypointGrouping';
import 'maplibre-gl/dist/maplibre-gl.css';
interface Props { trips:Trip[]; selected:Trip|null; detail:TripDetail|null; photoStops:PhotoStop[]; photos:TripPhoto[]; selectedPlaceId:string|null; style:'outdoor'|'mono'|'satellite'; terrain:boolean; apiKey:string; onSelect:(id:string|null)=>void; onWaypoint:(trip:Trip,w:Waypoint|PhotoStop)=>void; onError:(message:string)=>void; onReady?:()=>void; panelOpen:boolean }
export function archiveBounds(trips:Trip[]):Bounds|null {
 const bs=trips.map(t=>t.bounds).filter((b):b is Bounds=>b!==null);
 return bs.length?bs.reduce<Bounds>((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[180,90,-180,-90]):null;
}
export default memo(forwardRef<MapHandle,Props>(function MapCanvas({trips,selected,detail,photoStops,photos,selectedPlaceId,style,terrain,apiKey,onSelect,onWaypoint,onError,onReady,panelOpen},ref) {
 const map=useRef<MapRef>(null), marker=useRef<maplibregl.Marker|null>(null);const [ready,setReady]=useState(false),[zoom,setZoom]=useState(3);
 const lastSelectedId=useRef<string|null>(selected?.id??null);if(selected?.id)lastSelectedId.current=selected.id;
 const [topoStyle,setTopoStyle]=useState(emptyTopoStyle);
 const [outdoorRaw,setOutdoorRaw]=useState<StyleSpecification|null>(null);
 // Mono renders the same outdoor geography in grayscale, so both topo modes
 // share one provider fetch and one set of designation, trail, and contour layers.
 const monoStyle=useMemo(()=>outdoorRaw?createTopoStyle(outdoorRaw,'mono'):emptyTopoStyle,[outdoorRaw]);
 useEffect(()=>{
  const controller=new AbortController();
  setTopoStyle(emptyTopoStyle);setOutdoorRaw(null);
  fetch(`https://api.maptiler.com/maps/outdoor-v4/style.json?key=${encodeURIComponent(apiKey)}`,{signal:controller.signal})
   .then(response=>{if(!response.ok)throw new Error('Style unavailable');return response.json();})
   .then(style=>{if(!controller.signal.aborted){setOutdoorRaw(style);setTopoStyle(createTopoStyle(style));}})
   .catch(()=>{if(!controller.signal.aborted)onError('Map tiles could not load. Check your connection, MapTiler key, and allowed domains. The trip archive is still available.');});
  return()=>controller.abort();
 },[apiKey,onError]);
 const [groupedTrips,setGroupedTrips]=useState<Set<string>>(new Set());
 const [flagOffsets,setFlagOffsets]=useState<Record<string,TripFlagOffset>>({});
 const overlappingTrips=useMemo(()=>overlappingTripIds(trips),[trips]);
 const visibleTrips=useMemo(()=>selected?trips.filter(t=>t.id===selected.id||tripAreasOverlap(t.bounds,selected.bounds)):trips,[selected,trips]);
  const arrangeFlags=useCallback((groups:Set<string>)=>{
   if(!map.current)return;
   const m=map.current,container=m.getContainer(),containerBox=container.getBoundingClientRect();
   const scale=tripFlagScale(m.getZoom());
   const flagTrips=visibleTrips.filter(t=>t.waypoints.length>0&&(groups.has(t.id)||(t.id!==selected?.id&&overlappingTrips.has(t.id))));
  const obstacles=[...document.querySelectorAll<HTMLElement>('.map-controls,.map-error,.maplibregl-ctrl-top-right,.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right')].map(element=>{
   const box=element.getBoundingClientRect();
   return {left:box.left-containerBox.left-5,top:box.top-containerBox.top-5,right:box.right-containerBox.left+5,bottom:box.bottom-containerBox.top+5};
  }).filter((box):box is ScreenRect=>box.right>0&&box.bottom>0&&box.left<container.clientWidth&&box.top<container.clientHeight);
   const items=flagTrips.map(trip=>({id:trip.id,anchor:m.project(tripFlagPosition(trip)),width:tripFlagWidth(trip.mapLabel),priority:trip.id===selected?.id||trip.id===lastSelectedId.current}));
   setFlagOffsets(previous=>{
    const next=layoutTripFlags(items,{width:container.clientWidth,height:container.clientHeight},obstacles,previous,scale);
   const ids=Object.keys(next);
   return ids.length===Object.keys(previous).length&&ids.every(id=>previous[id]?.x===next[id].x&&previous[id]?.y===next[id].y&&previous[id]?.hidden===next[id].hidden)?previous:next;
  });
 },[overlappingTrips,selected?.id,visibleTrips]);
 const syncGroups=useCallback(()=>{
  if(!map.current)return;
  const m=map.current;
  const nextZoom=m.getZoom();setZoom(previous=>Math.abs(previous-nextZoom)<.1?previous:nextZoom);
  const next=new Set(visibleTrips.filter(t=>shouldGroupWaypoints(t.waypoints.map(w=>m.project([w.lon,w.lat])),groupedTrips.has(t.id))).map(t=>t.id));
  arrangeFlags(next);
  setGroupedTrips(previous=>next.size===previous.size&&[...next].every(id=>previous.has(id))?previous:next);
 },[arrangeFlags,groupedTrips,visibleTrips]);
 useEffect(()=>{if(ready)syncGroups();},[ready,syncGroups]);
 const bounds=useMemo(()=>selected?.bounds??archiveBounds(trips),[selected,trips]);
  const overview=useMemo(()=>({type:'FeatureCollection' as const,features:trips.filter(t=>t.id!==selected?.id||!detail).flatMap(t=>t.overview.features)}),[trips,selected?.id,detail]);
  const empty=useMemo(()=>({type:'FeatureCollection' as const,features:[]}),[]);
  // Photo counts by association, precomputed once per photo list instead of
  // filtering the entire list for every marker on zoom-driven renders.
  const waypointPhotoCounts=useMemo(()=>{const counts=new globalThis.Map<string,number>();for(const photo of photos){if(photo.waypointId)counts.set(photo.waypointId,(counts.get(photo.waypointId)??0)+1);}return counts;},[photos]);
  const stopPhotoCounts=useMemo(()=>{const counts=new globalThis.Map<string,number>();for(const photo of photos){if(photo.stopId)counts.set(photo.stopId,(counts.get(photo.stopId)??0)+1);}return counts;},[photos]);
 const duration=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;
 const frame=useCallback(()=>{
  if(!map.current||!bounds) return;
  const mobile=window.matchMedia('(max-width: 700px)').matches;
  const height=map.current.getContainer().clientHeight;
  const labelPadding=selected?0:Math.ceil(Math.max(0,...trips.map(trip=>tripFlagWidth(trip.mapLabel)))/2)+12;
  // Selected trips use the wide (390px) panel, so reserve room for it up front.
  const panelPad=selected?410:358;
  map.current.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:mobile?{top:selected?85:100,left:Math.max(35,labelPadding),right:selected?80:68+labelPadding,bottom:panelOpen?Math.min(height*(selected?0.63:0.49)+30,height-170):100}:{top:90,bottom:65,left:panelOpen?panelPad+Math.max(32,labelPadding):Math.max(65,labelPadding),right:selected?80:68+labelPadding},maxZoom:14,duration:duration()});
 },[bounds,panelOpen,selected,trips]);
 const frameLatest=useRef(frame);frameLatest.current=frame;
 const previousSelection=useRef(selected?.id);
  useEffect(()=>{
   const cleared=!!previousSelection.current&&!selected;
   previousSelection.current=selected?.id;
   if(ready&&cleared&&map.current){
    const m=map.current;
    m.easeTo({zoom:Math.max(m.getMinZoom(),m.getZoom()-.75),duration:duration()});
    return;
   }
   if(ready) frameLatest.current();
  },[ready,bounds,selected?.id]);
  // Notify the archive shell once the map is ready so a place selected while
  // the engine was loading can be applied after this initial framing.
  const onReadyRef=useRef(onReady);onReadyRef.current=onReady;
  useEffect(()=>{if(ready)onReadyRef.current?.();},[ready]);
  useImperativeHandle(ref,()=>({frame,focusPoint(p){
   if(!map.current)return;
  const m=map.current, container=m.getContainer(), mobile=window.matchMedia('(max-width: 700px)').matches;
  // Every new selection glides its point into the unobstructed view. Zoom is
  // never forced beyond a close-up floor, so nearby selections only nudge.
  m.easeTo({center:[p.lon,p.lat],zoom:Math.max(m.getZoom(),10),offset:mobile&&panelOpen?[0,-container.clientHeight*.18]:panelOpen?[170,0]:[0,0],duration:duration()});
  },showPoint(p){
   if(!p){marker.current?.remove();marker.current=null;return;} if(!map.current)return;
   if(!marker.current){const el=document.createElement('div');el.className='profile-marker';el.setAttribute('aria-hidden','true');marker.current=new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(map.current.getMap());}
  if(!marker.current){const el=document.createElement('div');el.className='profile-marker';el.setAttribute('aria-hidden','true');marker.current=new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(map.current.getMap());}
  else marker.current.setLngLat([p.lon,p.lat]);
 }}),[frame]);
 useEffect(()=>()=>{marker.current?.remove();},[]);
 useEffect(()=>{marker.current?.remove();marker.current=null;},[selected?.id]);
  // Reapply terrain only after React's source is present, including after a style swap.
  // The DEM source is armed on first terrain request and retained for the map
  // lifetime; fresh terrain-off sessions never initialize provider DEM traffic.
  const [terrainArmed,setTerrainArmed]=useState(false);
  useEffect(()=>{if(terrain)setTerrainArmed(true);},[terrain]);
  useEffect(()=>{
   if(!ready||!map.current)return;const m=map.current.getMap();
   const sync=()=>{if(!m.isStyleLoaded())return;const active=m.getTerrain();if(terrain&&terrainArmed&&m.getSource('terrain-dem')&&!active)m.setTerrain({source:'terrain-dem',exaggeration:1.3});else if(!terrain&&active)m.setTerrain(null);};
   const timer=window.setTimeout(sync,0);m.on('idle',sync);return()=>{clearTimeout(timer);m.off('idle',sync);};
  },[ready,terrain,terrainArmed,style]);
  const previousTerrain=useRef(false);
 useEffect(()=>{
  if(!ready||previousTerrain.current===terrain)return;
  previousTerrain.current=terrain;
  map.current?.easeTo({pitch:terrain?50:0,duration:duration()});
 },[terrain,ready]);
   const styleUrl=`https://api.maptiler.com/maps/${style==='satellite'?'satellite':'outdoor-v4'}/style.json?key=${encodeURIComponent(apiKey)}`;
   const flagScale=tripFlagScale(zoom);
  return <Map ref={map} mapLib={maplibregl} initialViewState={{longitude:-96,latitude:39,zoom:3,pitch:0}} mapStyle={style==='satellite'?styleUrl:style==='mono'?monoStyle:topoStyle} styleDiffing={false} attributionControl={false} onLoad={()=>setReady(true)} onMove={syncGroups} onResize={syncGroups} onError={()=>onError('Map tiles could not load. Check your connection, MapTiler key, and allowed domains. The trip archive is still available.')} onClick={e=>{
  const id=e.features?.[0]?.properties?.tripId;
  if(typeof id==='string')onSelect(id);
  else if(selected)onSelect(null);
 }} interactiveLayerIds={['archive-hit','detail-hit']} cursor="none" canvasContextAttributes={{antialias:true}}>
   {terrainArmed&&<Source id="terrain-dem" type="raster-dem" url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(apiKey)}`} tileSize={256}/>}
  <Source id="archive" type="geojson" data={overview}>
   <Layer id="archive-casing" type="line" paint={{'line-color':'#fff9e9','line-width':6,'line-opacity':selected?['case',['==',['get','tripId'],selected.id],.9,.18]:.9}}/>
   <Layer id="archive-line" type="line" paint={{'line-color':['case',['==',['get','tripId'],selected?.id??''],'#ff5f00','#ff7900'],'line-width':3,'line-opacity':selected?['case',['==',['get','tripId'],selected.id],1,.28]:1}}/>
   <Layer id="archive-hit" type="line" paint={{'line-width':20,'line-opacity':0}}/>
  </Source>
  <Source id="detail" type="geojson" data={detail?.geojson??empty}>
   <Layer id="detail-casing" type="line" paint={{'line-color':'#fff9e9','line-width':8}}/>
   <Layer id="detail-line" type="line" paint={{'line-color':'#ff5f00','line-width':4}}/>
   <Layer id="detail-hit" type="line" paint={{'line-width':22,'line-opacity':0}}/>
  </Source>
   {visibleTrips.filter(t=>t.waypoints.length>0).flatMap(t=>(groupedTrips.has(t.id)||(t.id!==selected?.id&&overlappingTrips.has(t.id)))?[<TripFlag key={`trip-${t.id}`} trip={t} selected={selected?.id===t.id} offset={flagOffsets[t.id]??DEFAULT_TRIP_FLAG_OFFSET} scale={flagScale} onClick={()=>{if(selected?.id===t.id)frame();else onSelect(t.id);}} />]:t.waypoints.map(w=>{
    const photoCount=t.id===selected?.id?(waypointPhotoCounts.get(w.id)??0):0;
   return <Marker key={`${t.id}-${w.id}`} longitude={w.lon} latitude={w.lat} anchor="center"><button className={`waypoint-marker kind-${w.kind}${selectedPlaceId===w.id?' place-selected':''}`} aria-label={`${w.name} · ${t.title}${photoCount?` · ${photoCount} ${photoCount===1?'photo':'photos'}`:''}`} title={w.name} onClick={e=>{e.stopPropagation();onWaypoint(t,w);}}><WaypointIcon kind={w.kind} />{photoCount>0&&<span className="marker-photo-count" aria-hidden="true">{photoCount}</span>}</button></Marker>;
  }))}
   {selected&&photoStops.filter(stop=>zoom>=10||selectedPlaceId===stop.id).map(stop=>{
    const photoCount=stopPhotoCounts.get(stop.id)??0;
   return <Marker key={`${selected.id}-${stop.id}`} longitude={stop.lon} latitude={stop.lat} anchor="center"><button className={`waypoint-marker photo-stop-marker${selectedPlaceId===stop.id?' place-selected':''}`} aria-label={`${stop.name} · photo stop · ${selected.title} · ${photoCount} ${photoCount===1?'photo':'photos'}`} title={stop.name} onClick={event=>{event.stopPropagation();onWaypoint(selected,stop);}}><span aria-hidden="true">▣</span><span className="marker-photo-count" aria-hidden="true">{photoCount}</span></button></Marker>;
  })}
  <MapCrosshair map={map} ready={ready} satellite={style==='satellite'} />
  <NavigationControl position="top-right" showCompass={true}/><ScaleControl position="bottom-left" unit="imperial"/><AttributionControl position="bottom-right" compact={false}/>
 </Map>;
}));
