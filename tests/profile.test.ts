import test from 'node:test';import assert from 'node:assert/strict';import {nearestProfileIndex, profileData} from '../src/features/map/Profile';import {parseGpx} from '../scripts/gpx';
test('profile associates full-resolution points with correct segments and times without bridging gaps',()=>{
 const xml='<gpx><trk><trkseg><trkpt lat="40" lon="-73"><ele>10</ele><time>2020-01-01T00:00:00Z</time></trkpt><trkpt lat="40" lon="-72.999"><ele>20</ele><time>2020-01-01T00:01:00Z</time></trkpt></trkseg><trkseg><trkpt lat="40" lon="-110"><ele>1000</ele><time>2020-01-02T00:00:00Z</time></trkpt><trkpt lat="40" lon="-109.999"/></trkseg></trk><rte><rtept lat="41" lon="-72"/></rte></gpx>';
 const {detail}=parseGpx(xml,'test.gpx');const data=profileData(detail,['trk-1']);assert.equal(data.length,2);assert.equal(data[1].id,'trk-1-s2');assert.equal(data[1].points[0].point.time,'2020-01-02T00:00:00Z');assert.equal(data[1].points[0].distance,data[0].points[1].distance);assert.ok(data[1].points[1].distance<180);assert.equal(data[1].points[1].point.elevation,null);assert.equal(data[1].points[1].point.time,null);
});
function linearNearest(xs:number[],x:number){let closest=0;for(let i=1;i<xs.length;i++)if(Math.abs(xs[i]-x)<Math.abs(xs[closest]-x))closest=i;return closest;}
test('nearest-point lookup matches the linear scan at endpoints, exact matches, and ties',()=>{
 assert.equal(nearestProfileIndex([],5),-1);
 assert.equal(nearestProfileIndex([{x:10}],-100),0);
 assert.equal(nearestProfileIndex([{x:10}],100),0);
 const flat=[{x:10},{x:30},{x:50}];
 assert.equal(nearestProfileIndex(flat,10),0);
 assert.equal(nearestProfileIndex(flat,50),2);
 assert.equal(nearestProfileIndex(flat,30),1);
 assert.equal(nearestProfileIndex(flat,20),0);
 assert.equal(nearestProfileIndex(flat,40),1);
 assert.equal(nearestProfileIndex(flat,0),0);
 assert.equal(nearestProfileIndex(flat,100),2);
});
test('nearest-point lookup resolves duplicate x values to the earliest point',()=>{
 const flat=[{x:10},{x:20},{x:20},{x:20},{x:40}];
 assert.equal(nearestProfileIndex(flat,20),1);
 assert.equal(nearestProfileIndex(flat,19),1);
 assert.equal(nearestProfileIndex(flat,21),1);
 assert.equal(nearestProfileIndex(flat,30),1);
 assert.equal(nearestProfileIndex([{x:7},{x:7},{x:7}],7),0);
 assert.equal(nearestProfileIndex([{x:7},{x:7},{x:7}],0),0);
});
test('nearest-point lookup agrees with the linear scan on gapped and zero-distance coordinates',()=>{
 const cases=[[10,10,10],[10,10.5,11,40,40.2,90],[0],[5,5,5,5],[10,30,30,50,70,70,70,90]];
 for(const xs of cases){
  const flat=xs.map(x=>({x}));
  for(const x of [-5,0,5,7.5,10,15,29.9,30,31,55,70,85,120]){
   assert.equal(nearestProfileIndex(flat,x),linearNearest(xs,x),`xs=${xs} x=${x}`);
  }
 }
});
test('nearest-point lookup agrees with the linear scan on a large monotonic sweep',()=>{
 const xs:Array<number>=[];let value=10;
 for(let i=0;i<3818;i++){if(i%7===0&&i>0)value+=0;else value+=0.157;if(i%500===0)value+=4;xs.push(Number(value.toFixed(3)));}
 const flat=xs.map(x=>({x}));
 for(let x=0;x<=620;x+=7)assert.equal(nearestProfileIndex(flat,x),linearNearest(xs,x),`x=${x}`);
});
