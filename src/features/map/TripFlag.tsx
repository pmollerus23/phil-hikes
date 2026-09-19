import { Marker } from 'react-map-gl/maplibre';
import type { CSSProperties } from 'react';
import type { Trip } from './model';
import { DEFAULT_TRIP_FLAG_OFFSET, type TripFlagOffset } from './tripFlagLayout';

export function tripFlagWidth(label: string) {
  return Math.max(72, Math.ceil(label.length * 5.2 + 20));
}

/** Snap the flag to a route vertex near the waypoint cluster's center. */
export function tripFlagPosition(trip: Trip): [number, number] {
  const center: [number, number] = [
    trip.waypoints.reduce((sum, point) => sum + point.lon, 0) / trip.waypoints.length,
    trip.waypoints.reduce((sum, point) => sum + point.lat, 0) / trip.waypoints.length,
  ];
  const vertices = trip.overview.features.flatMap(feature => feature.geometry.coordinates);
  const longitudeScale = Math.cos(center[1] * Math.PI / 180);
  const distance = (point: number[]) => ((point[0] - center[0]) * longitudeScale) ** 2 + (point[1] - center[1]) ** 2;
  const closest = vertices.reduce<number[] | null>((best, point) => !best || distance(point) < distance(best) ? point : best, null);
  return closest ? [closest[0], closest[1]] : center;
}

export default function TripFlag({ trip, selected = false, offset = DEFAULT_TRIP_FLAG_OFFSET, scale = 1, onClick }: { trip: Trip; selected?: boolean; offset?: TripFlagOffset; scale?: number; onClick: () => void }) {
  const [longitude, latitude] = tripFlagPosition(trip);
  const width = tripFlagWidth(trip.mapLabel);
  const clampedScale = Number.isFinite(scale) && scale > 0 ? Math.min(1, scale) : 1;
  // `offset` is the screen-space label center chosen by the packer. Push the
  // marker by the unscaled equivalent so the inner shrink toward the route pin
  // lands the label exactly where the packer placed it while the pin stays put.
  const markerX = offset.x / clampedScale;
  const markerY = offset.y / clampedScale;
  const anchorX = -markerX;
  const anchorY = -markerY;
  // Labels always sit above their pin, so the leader leaves the bottom edge,
  // runs vertical from the pin, then elbows 90 degrees along the label.
  const labelEdgeY = 12;
  const labelHalfLine = width / 2 - 5;
  const labelJoinX = Math.max(-labelHalfLine, Math.min(labelHalfLine, anchorX));
  const leader = Math.abs(anchorX) <= labelHalfLine
    ? `M ${anchorX} ${labelEdgeY} V ${anchorY}`
    : `M ${labelJoinX} ${labelEdgeY} H ${anchorX} V ${anchorY}`;
  // Underline and leader share one path and one stroke so the joint can never
  // render as a step: a CSS border and an SVG stroke antialias differently and
  // sit on different centerlines, which read as jagged at every zoom.
  const tetherPath = `M ${-labelHalfLine} ${labelEdgeY} H ${labelHalfLine} ${leader}`;
  const style = {
    width,
    '--anchor-x': `${anchorX}px`,
    '--anchor-y': `${anchorY}px`,
    ...(clampedScale === 1 ? null : {
      transform: `scale(${clampedScale})`,
      transformOrigin: `${width / 2 + anchorX}px ${14 + anchorY}px`,
    }),
  } as CSSProperties;
  return <Marker longitude={longitude} latitude={latitude} anchor="center" offset={[markerX, markerY]}>
    <button className="trip-marker" style={style} data-selected={selected} data-hidden={!!offset.hidden} data-offset={`${offset.x},${offset.y}`} aria-hidden={offset.hidden || undefined} tabIndex={offset.hidden ? -1 : undefined} aria-pressed={selected} aria-label={`Trip · ${trip.title}`} title={`${trip.mapLabel} · ${trip.waypoints.length} waypoints`} onClick={event => { event.stopPropagation(); onClick(); }}>
      <span className="trip-marker-surface">
        <span className="trip-marker-label">{trip.mapLabel}</span>
      </span>
      <svg className="trip-marker-tether" width="1" height="1" aria-hidden="true"><path d={tetherPath} /></svg>
      <span className="trip-marker-anchor" aria-hidden="true" />
    </button>
  </Marker>;
}
