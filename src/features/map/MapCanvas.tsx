import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, AttributionControl, ScaleControl, type MapRef } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// MapLibre 6 ships an external ESM worker; let Astro/Vite bundle its dependencies.
maplibregl.setWorkerUrl(workerUrl);
import type { Bounds, Point, Trip, TripDetail, Waypoint } from './model';
import { icons } from './model';
import 'maplibre-gl/dist/maplibre-gl.css';
export interface MapHandle { showPoint:(point:Point|null)=>void; frame:()=>void }
interface Props { trips:Trip[]; selected:Trip|null; detail:TripDetail|null; style:'outdoor'|'satellite'; terrain:boolean; apiKey:string; onSelect:(id:string)=>void; onWaypoint:(trip:Trip,w:Waypoint)=>void; onError:(message:string)=>void; panelOpen:boolean }
export function archiveBounds(trips:Trip[]):Bounds|null {
 const bs=trips.map(t=>t.bounds).filter((b):b is Bounds=>b!==null);
 return bs.length?bs.reduce<Bounds>((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[180,90,-180,-90]):null;
}
export default memo(forwardRef<MapHandle,Props>(function MapCanvas({trips,selected,detail,style,terrain,apiKey,onSelect,onWaypoint,onError,panelOpen},ref) {
 const map=useRef<MapRef>(null), marker=useRef<maplibregl.Marker|null>(null);const [ready,setReady]=useState(false);
 const bounds=useMemo(()=>selected?.bounds??archiveBounds(trips),[selected,trips]);
 const overview=useMemo(()=>({type:'FeatureCollection' as const,features:trips.filter(t=>t.id!==selected?.id||!detail).flatMap(t=>t.overview.features)}),[trips,selected?.id,detail]);
 const empty=useMemo(()=>({type:'FeatureCollection' as const,features:[]}),[]);
 const duration=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;
 const frame=useCallback(()=>{
  if(!map.current||!bounds) return;
  const mobile=window.matchMedia('(max-width: 700px)').matches;
  const height=map.current.getContainer().clientHeight;
  map.current.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{padding:mobile?{top:85,left:35,right:80,bottom:panelOpen?Math.min(height*.49+30,height-170):100}:{top:90,bottom:65,left:panelOpen?390:65,right:80},maxZoom:14,duration:duration()});
 },[bounds,panelOpen]);
 const frameLatest=useRef(frame);frameLatest.current=frame;
 useEffect(()=>{if(ready) frameLatest.current();},[ready,bounds]);
 useImperativeHandle(ref,()=>({frame,showPoint(p){
  if(!p){marker.current?.remove();marker.current=null;return;} if(!map.current)return;
  if(!marker.current){const el=document.createElement('div');el.className='profile-marker';el.setAttribute('aria-hidden','true');marker.current=new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(map.current.getMap());}
  else marker.current.setLngLat([p.lon,p.lat]);
 }}),[frame]);
 useEffect(()=>()=>{marker.current?.remove();},[]);
 useEffect(()=>{marker.current?.remove();marker.current=null;},[selected?.id]);
 // Reapply terrain only after React's source is present, including after a style swap.
 useEffect(()=>{
  if(!ready||!map.current)return;const m=map.current.getMap();
  const sync=()=>{if(!m.isStyleLoaded())return;const active=m.getTerrain();if(terrain&&m.getSource('terrain-dem')&&!active)m.setTerrain({source:'terrain-dem',exaggeration:1});else if(!terrain&&active)m.setTerrain(null);};
  const timer=window.setTimeout(sync,0);m.on('idle',sync);return()=>{clearTimeout(timer);m.off('idle',sync);};
 },[ready,terrain,style]);
 const previousTerrain=useRef(false);
 useEffect(()=>{
  if(!ready||previousTerrain.current===terrain)return;
  previousTerrain.current=terrain;
  map.current?.easeTo({pitch:terrain?50:0,duration:duration()});
 },[terrain,ready]);
 const styleUrl=`https://api.maptiler.com/maps/${style==='outdoor'?'outdoor-v4':'satellite'}/style.json?key=${encodeURIComponent(apiKey)}`;
 return <Map ref={map} mapLib={maplibregl} initialViewState={{longitude:-96,latitude:39,zoom:3,pitch:0}} mapStyle={styleUrl} styleDiffing={false} attributionControl={false} onLoad={()=>setReady(true)} onError={()=>onError('Map tiles could not load. Check your connection, MapTiler key, and allowed domains. The trip archive is still available.')} onClick={e=>{const id=e.features?.[0]?.properties?.tripId;if(typeof id==='string')onSelect(id);}} interactiveLayerIds={['archive-hit','detail-hit']} cursor="grab" canvasContextAttributes={{antialias:true}}>
  <Source id="terrain-dem" type="raster-dem" url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(apiKey)}`} tileSize={256}/>
  <Source id="archive" type="geojson" data={overview}>
   <Layer id="archive-casing" type="line" paint={{'line-color':'#fff9e9','line-width':6,'line-opacity':.9}}/>
   <Layer id="archive-line" type="line" paint={{'line-color':['case',['==',['get','tripId'],selected?.id??''],'#e76632','#34573e'],'line-width':3}}/>
   <Layer id="archive-hit" type="line" paint={{'line-width':20,'line-opacity':0}}/>
  </Source>
  <Source id="detail" type="geojson" data={detail?.geojson??empty}>
   <Layer id="detail-casing" type="line" paint={{'line-color':'#fff9e9','line-width':8}}/>
   <Layer id="detail-line" type="line" paint={{'line-color':'#c54f22','line-width':4}}/>
   <Layer id="detail-hit" type="line" paint={{'line-width':22,'line-opacity':0}}/>
  </Source>
  {(selected?[selected]:trips).flatMap(t=>t.waypoints.map(w=><Marker key={`${t.id}-${w.id}`} longitude={w.lon} latitude={w.lat} anchor="center"><button className={`waypoint-marker kind-${w.kind}`} aria-label={`${w.name} · ${t.title}`} title={w.name} onClick={e=>{e.stopPropagation();onWaypoint(t,w);}}>{icons[w.kind]}</button></Marker>))}
  <NavigationControl position="top-right" showCompass={true}/><ScaleControl position="bottom-left" unit="imperial"/><AttributionControl position="bottom-right" compact={false}/>
 </Map>;
}));
