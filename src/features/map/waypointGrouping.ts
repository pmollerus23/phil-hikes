import type { Bounds, Trip } from './model';

/** Group a trip when its waypoint badges occupy one compact area on screen. */
export function shouldGroupWaypoints(points: { x: number; y: number }[], grouped = false): boolean {
  if (points.length < 2) return false;
  const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  // A little hysteresis prevents flicker around the transition while zooming.
  return Math.hypot(width, height) < (grouped ? 80 : 60);
}

/** Geographic overlap stays stable as the user zooms and pans. */
export function tripAreasOverlap(a: Bounds | null, b: Bounds | null): boolean {
  return !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function overlappingTripIds(trips: Pick<Trip, 'id' | 'bounds'>[]): Set<string> {
  const overlapping = new Set<string>();
  for (let i = 0; i < trips.length; i++) {
    for (let j = i + 1; j < trips.length; j++) {
      if (tripAreasOverlap(trips[i].bounds, trips[j].bounds)) {
        overlapping.add(trips[i].id);
        overlapping.add(trips[j].id);
      }
    }
  }
  return overlapping;
}
