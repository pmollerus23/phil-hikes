import type { Point } from './model';
export function distance(a: Point, b: Point) {
 const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export const miles = (m:number) => `${(m/1609.344).toFixed(1)} mi`;
export const feet = (m:number) => `${Math.round(m*3.28084/10)*10} ft`;
