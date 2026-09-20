import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Point, TripDetail } from './model';
import { distance, feet, miles } from './geo';
export function profileData(detail:TripDetail, pathIds:string[]) {
 let total=0;
 return pathIds.flatMap(id=>detail.paths.filter(p=>p.id===id)).flatMap(path=>path.segments).filter(s=>s.points.length).map(segment=>({id:segment.id, points:segment.points.map((point,i)=>{if(i) total+=distance(segment.points[i-1],point);return {point,distance:total};})}));
}
export interface FlatProfilePoint { point:Point; distance:number; index:number; segment:string; x:number; y:number|null }
/**
 * Nearest point by x on the monotonic profile coordinates using lower-bound
 * binary search. Exact matches, equal-distance ties, and duplicate x values
 * all resolve to the earliest point, matching the previous linear scan.
 */
export function nearestProfileIndex(flat:ReadonlyArray<Pick<FlatProfilePoint,'x'>>, x:number):number {
 if(!flat.length) return -1;
 let lo=0,hi=flat.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(flat[mid].x<x) lo=mid+1;else hi=mid;}
 let best:number;
 if(lo>=flat.length) best=flat.length-1;
 else if(lo===0) best=0;
 else best=Math.abs(flat[lo-1].x-x)<=Math.abs(flat[lo].x-x)?lo-1:lo;
 while(best>0&&flat[best-1].x===flat[best].x) best-=1;
 return best;
}
// Static SVG geometry: path strings are built once per data model so hover
// updates never reconstruct them. Isolated by memo from cursor rendering.
const ProfilePaths=memo(function ProfilePaths({paths}:{paths:ReadonlyArray<{id:string;d:string}>}) {
 return <>{paths.map(path=><path key={path.id} d={path.d} fill="none" stroke="#171717" strokeWidth="2"/>)}</>;
});
export default memo(function Profile({detail,pathIds,onPoint}:{detail:TripDetail;pathIds:string[];onPoint:(p:Point|null)=>void}) {
 const data=useMemo(()=>profileData(detail,pathIds),[detail,pathIds]);
 const model=useMemo(()=>{
  const total=data.at(-1)?.points.at(-1)?.distance??0;
  const elevations=data.flatMap(s=>s.points.map(p=>p.point.elevation)).filter((v):v is number=>v!==null);
  const min=elevations.length?Math.min(...elevations):0,max=elevations.length?Math.max(...elevations):0;
  const gap=Math.min(10,100/Math.max(1,data.length));const width=600-gap*Math.max(0,data.length-1);
  let index=0;
  const segments=data.map((s,j)=>({...s,points:s.points.map(p=>({...p,index:index++,segment:s.id,x:10+(total?p.distance/total*width:0)+j*gap,y:p.point.elevation===null?null:110-(p.point.elevation-min)/Math.max(1,max-min)*90}))}));
  const flat:FlatProfilePoint[]=segments.flatMap(s=>s.points);
  const paths=segments.map(s=>{let pen=false;const d=s.points.map(p=>{if(p.y===null){pen=false;return '';}const command=pen?'L':'M';pen=true;return `${command}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join(' ');return {id:s.id,d};});
  return {paths,flat,min,max,available:elevations.length>=2};
 },[data]);
 const [index,setIndex]=useState(0);const current=model.flat[index];
 // Latest values for the animation-frame callback without stale closures.
 const flatRef=useRef(model.flat);flatRef.current=model.flat;
 const onPointRef=useRef(onPoint);onPointRef.current=onPoint;
 const indexRef=useRef(index);indexRef.current=index;
 const frame=useRef(0),pendingX=useRef<number|null>(null),markerCleared=useRef(false);
 // A model replacement cancels any scheduled lookup and clamps the cursor.
 useEffect(()=>{
  cancelAnimationFrame(frame.current);frame.current=0;pendingX.current=null;
  setIndex(previous=>model.flat.length?Math.min(previous,model.flat.length-1):0);
 },[model]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 function applyIndex(next:number){
  if(next===-1) return;
  if(next!==indexRef.current){indexRef.current=next;setIndex(next);markerCleared.current=false;onPointRef.current(flatRef.current[next]?.point??null);}
  else if(markerCleared.current){markerCleared.current=false;onPointRef.current(flatRef.current[next]?.point??null);}
 }
 // Pointer geometry is read into a ref and resolved at most once per frame.
 function scheduleHover(clientX:number,rectLeft:number,rectWidth:number){
  pendingX.current=(clientX-rectLeft)/rectWidth*620;
  if(frame.current) return;
  frame.current=requestAnimationFrame(()=>{
   frame.current=0;const x=pendingX.current;pendingX.current=null;
   if(x===null||!Number.isFinite(x)) return;
   applyIndex(nearestProfileIndex(flatRef.current,x));
  });
 }
 function clearHover(){cancelAnimationFrame(frame.current);frame.current=0;pendingX.current=null;markerCleared.current=true;onPointRef.current(null);}
 // Keyboard and slider input stay immediate.
 function choose(i:number){cancelAnimationFrame(frame.current);frame.current=0;pendingX.current=null;indexRef.current=i;setIndex(i);markerCleared.current=false;onPoint(model.flat[i]?.point??null);}
 if(!model.available) return <p className="subtle">An elevation profile cannot be shown: fewer than two points have elevation data.</p>;
 return <section className="profile" aria-label="Elevation profile">
  <div className="section-label">ELEVATION <span>{feet(model.min)} – {feet(model.max)}</span></div>
  <svg viewBox="0 0 620 125" role="img" aria-label="Elevation by cumulative distance. Gaps separate segments or missing elevations." onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();scheduleHover(e.clientX,rect.left,rect.width);}} onPointerLeave={clearHover} onPointerCancel={clearHover}>
   <path d="M10 110H610 M10 65H610 M10 20H610" stroke="#dedede" strokeDasharray="3 5"/>
   <ProfilePaths paths={model.paths}/>
   {current?.y!==null&&current&&<><path d={`M${current.x} 10V115`} stroke="#d54300"/><circle cx={current.x} cy={current.y} r="4" fill="#d54300"/></>}
  </svg>
  <input aria-label="Explore elevation profile" type="range" min="0" max={model.flat.length-1} value={index} onChange={e=>choose(Number(e.target.value))} onFocus={()=>choose(index)} onBlur={()=>onPoint(null)} aria-valuetext={current?`${miles(current.distance)}, ${current.point.elevation===null?'elevation unavailable':feet(current.point.elevation)}, segment ${current.segment}`:undefined}/>
  <div className="profile-readout">{current&&<><span>{miles(current.distance)}</span><strong>{current.point.elevation===null?'No elevation':feet(current.point.elevation)}</strong><span>{current.segment}</span></>}</div>
  <p className="caption">Move, touch, or use the slider’s arrow keys to follow the route. Breaks are preserved. Point times are preserved; travel timing is not inferred.</p>
 </section>;
});
