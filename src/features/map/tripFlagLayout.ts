export interface ScreenPoint { x: number; y: number }
export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export interface TripFlagLayoutItem { id: string; anchor: ScreenPoint; width: number; priority?: boolean }
export interface TripFlagOffset { x: number; y: number; hidden?: boolean }

export const TRIP_FLAG_HEIGHT = 28;
export const DEFAULT_TRIP_FLAG_OFFSET: TripFlagOffset = { x: 0, y: -34 };
export const MAX_TRIP_FLAG_REACH = 120;

/** Zoom at or above which callouts render at full size. Archive/continent views sit below this. */
export const TRIP_FLAG_FULL_SIZE_ZOOM = 5;
/** Smallest rendered callout scale. Keeps far-out archive labels usable instead of shrinking to nothing. */
export const TRIP_FLAG_MIN_SCALE = 0.6;

/**
 * Zoom-dependent callout scale. Full size at/above the threshold, then shrinking
 * gradually as the user zooms out so labels stop dominating far-out views.
 */
export function tripFlagScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom >= TRIP_FLAG_FULL_SIZE_ZOOM) return 1;
  return Math.min(1, Math.max(TRIP_FLAG_MIN_SCALE, 1 - (TRIP_FLAG_FULL_SIZE_ZOOM - zoom) * 0.15));
}

const GAP = 7;
const VIEWPORT_MARGIN = 8;

function candidates(scaledWidth: number, scale: number, preferred?: TripFlagOffset): TripFlagOffset[] {
  const side = scaledWidth / 2 + 18;
  // Leaders always rise north from the route pin: labels sit above their anchor
  // and stack vertically when routes cluster. Straight-above comes first so a
  // centered label gets a plain vertical pole; side positions add the 90-degree
  // elbow along the label's bottom edge.
  const positions = [
    ...(preferred && preferred.y < 0 ? [{ x: preferred.x, y: preferred.y }] : []),
    DEFAULT_TRIP_FLAG_OFFSET,
    { x: -side, y: -34 },
    { x: side, y: -34 },
    { x: 0, y: -76 },
    { x: -side, y: -76 },
    { x: side, y: -76 },
    { x: 0, y: -118 },
  ];
  const horizontalLimit = Math.min(160, Math.max(120, scaledWidth));
  const scaledHeight = TRIP_FLAG_HEIGHT * scale;
  for (let y = -115; y <= -30; y += 15) {
    for (let x = -horizontalLimit; x <= horizontalLimit; x += 20) {
      if (Math.abs(x) < scaledWidth / 2 + 12 && Math.abs(y) < scaledHeight / 2 + 12) continue;
      positions.push({ x, y });
    }
  }
  const seen = new Set<string>();
  return positions.filter(position => {
    if (Math.hypot(position.x, position.y) > MAX_TRIP_FLAG_REACH) return false;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function flagRect(item: TripFlagLayoutItem, offset: TripFlagOffset, scale = 1): ScreenRect {
  const centerX = item.anchor.x + offset.x;
  const centerY = item.anchor.y + offset.y;
  const halfWidth = (item.width * scale) / 2;
  const halfHeight = (TRIP_FLAG_HEIGHT * scale) / 2;
  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    top: centerY - halfHeight,
    bottom: centerY + halfHeight,
  };
}

function expanded(rect: ScreenRect, amount: number): ScreenRect {
  return { left: rect.left - amount, top: rect.top - amount, right: rect.right + amount, bottom: rect.bottom + amount };
}

function intersectionArea(a: ScreenRect, b: ScreenRect): number {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function outsideArea(rect: ScreenRect, viewport: { width: number; height: number }): number {
  const safe = { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN, right: viewport.width - VIEWPORT_MARGIN, bottom: viewport.height - VIEWPORT_MARGIN };
  const area = (rect.right - rect.left) * (rect.bottom - rect.top);
  return area - intersectionArea(rect, safe);
}

/**
 * Greedily packs map labels above their geographic anchors so every leader
 * rises north from its route pin. Candidate positions are stable, so labels
 * only move when a collision or map-edge constraint changes.
 *
 * Offsets are screen-space label centers relative to their anchors. `scale` is
 * the rendered callout scale (see `tripFlagScale`); collision boxes use scaled
 * label dimensions so the packer reserves what is actually drawn.
 */
export function layoutTripFlags(
  items: TripFlagLayoutItem[],
  viewport: { width: number; height: number },
  obstacles: ScreenRect[] = [],
  previousOffsets: Record<string, TripFlagOffset> = {},
  scale = 1,
): Record<string, TripFlagOffset> {
  const placed: ScreenRect[] = [];
  const offsets: Record<string, TripFlagOffset> = {};
  const ordered = [...items].sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || a.id.localeCompare(b.id));

  for (const item of ordered) {
    const previous = previousOffsets[item.id];
    const scaledWidth = item.width * scale;
    // Do not pull a label into view when its geographic anchor has left the map.
    if (item.anchor.x < -scaledWidth / 2 || item.anchor.x > viewport.width + scaledWidth / 2 || item.anchor.y < 0 || item.anchor.y > viewport.height) {
      offsets[item.id] = previous ?? DEFAULT_TRIP_FLAG_OFFSET;
      continue;
    }
    let best = DEFAULT_TRIP_FLAG_OFFSET;
    let bestScore = Number.POSITIVE_INFINITY;
    let foundOpenPosition = false;
    for (const [index, offset] of candidates(scaledWidth, scale, previous).entries()) {
      const rect = flagRect(item, offset, scale);
      const collisionArea = placed.reduce((sum, other) => sum + intersectionArea(expanded(rect, GAP), expanded(other, GAP)), 0);
      const obstacleArea = obstacles.reduce((sum, obstacle) => sum + intersectionArea(expanded(rect, 3), obstacle), 0);
      const offscreenArea = outsideArea(rect, viewport);
      const open = collisionArea === 0 && obstacleArea === 0 && offscreenArea === 0;
      const retainsPosition = previous?.x === offset.x && previous?.y === offset.y;
      if (open && retainsPosition) {
        best = offset;
        foundOpenPosition = true;
        break;
      }
      if (foundOpenPosition && !open) continue;
      const movement = previous ? Math.hypot(offset.x - previous.x, offset.y - previous.y) : 0;
      const score = collisionArea * 10_000_000
        + offscreenArea * 1_000_000
        + obstacleArea * 100_000
        + movement * 50
        + Math.hypot(offset.x, offset.y)
        + index;
      if ((open && !foundOpenPosition) || score < bestScore) {
        best = offset;
        bestScore = score;
        foundOpenPosition = open;
      }
    }
    offsets[item.id] = foundOpenPosition ? best : { ...best, hidden: true };
    if (foundOpenPosition) placed.push(flagRect(item, best, scale));
  }
  return offsets;
}
