/** Group a trip when its waypoint badges occupy one compact area on screen. */
export function shouldGroupWaypoints(points: { x: number; y: number }[], grouped = false): boolean {
  if (points.length < 2) return false;
  const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
  const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  // A little hysteresis prevents flicker around the transition while zooming.
  return Math.hypot(width, height) < (grouped ? 80 : 60);
}
