import { memo, useMemo, useState } from 'react';
import type { Point, TripDetail } from './model';
import { distance, feet, miles } from './geo';
export function profileData(detail:TripDetail, pathIds:string[]) {
 let total=0;
 return pathIds.flatMap(id=>detail.paths.filter(p=>p.id===id)).flatMap(path=>path.segments).filter(s=>s.points.length).map(segment=>({id:segment.id, points:segment.points.map((point,i)=>{if(i) total+=distance(segment.points[i-1],point);return {point,distance:total};})}));
}
export default memo(function Profile({detail,pathIds,onPoint}:{detail:TripDetail;pathIds:string[];onPoint:(p:Point|null)=>void}) {
 const data=useMemo(()=>profileData(detail,pathIds),[detail,pathIds]);
 const model=useMemo(()=>{
  const total=data.at(-1)?.points.at(-1)?.distance??0;
  const elevations=data.flatMap(s=>s.points.map(p=>p.point.elevation)).filter((v):v is number=>v!==null);
  const min=elevations.length?Math.min(...elevations):0,max=elevations.length?Math.max(...elevations):0;
  const gap=Math.min(10,100/Math.max(1,data.length));const width=600-gap*Math.max(0,data.length-1);
  let index=0;
  const segments=data.map((s,j)=>({...s,points:s.points.map(p=>({...p,index:index++,segment:s.id,x:10+(total?p.distance/total*width:0)+j*gap,y:p.point.elevation===null?null:110-(p.point.elevation-min)/Math.max(1,max-min)*90}))}));
  return {segments,flat:segments.flatMap(s=>s.points),min,max,available:elevations.length>=2};
 },[data]);
 const [index,setIndex]=useState(0);const current=model.flat[index];
 function choose(i:number){setIndex(i);onPoint(model.flat[i]?.point??null);}
 if(!model.available) return <p className="subtle">An elevation profile cannot be shown: fewer than two points have elevation data.</p>;
 return <section className="profile" aria-label="Elevation profile">
  <div className="section-label">ELEVATION <span>{feet(model.min)} – {feet(model.max)}</span></div>
  <svg viewBox="0 0 620 125" role="img" aria-label="Elevation by cumulative distance. Gaps separate segments or missing elevations." onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)/rect.width*620;let closest=0;for(let i=1;i<model.flat.length;i++)if(Math.abs(model.flat[i].x-x)<Math.abs(model.flat[closest].x-x))closest=i;choose(closest);}} onPointerLeave={()=>onPoint(null)}>
   <path d="M10 110H610 M10 65H610 M10 20H610" stroke="#dedede" strokeDasharray="3 5"/>
   {model.segments.map(s=>{let pen=false;const d=s.points.map(p=>{if(p.y===null){pen=false;return '';}const command=pen?'L':'M';pen=true;return `${command}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join(' ');return <path key={s.id} d={d} fill="none" stroke="#171717" strokeWidth="2"/>;})}
   {current?.y!==null&&current&&<><path d={`M${current.x} 10V115`} stroke="#d54300"/><circle cx={current.x} cy={current.y} r="4" fill="#d54300"/></>}
  </svg>
  <input aria-label="Explore elevation profile" type="range" min="0" max={model.flat.length-1} value={index} onChange={e=>choose(Number(e.target.value))} onFocus={()=>choose(index)} onBlur={()=>onPoint(null)} aria-valuetext={current?`${miles(current.distance)}, ${current.point.elevation===null?'elevation unavailable':feet(current.point.elevation)}, segment ${current.segment}`:undefined}/>
  <div className="profile-readout">{current&&<><span>{miles(current.distance)}</span><strong>{current.point.elevation===null?'No elevation':feet(current.point.elevation)}</strong><span>{current.segment}</span></>}</div>
  <p className="caption">Move, touch, or use the slider’s arrow keys to follow the route. Breaks are preserved. Point times are preserved; travel timing is not inferred.</p>
 </section>;
});
