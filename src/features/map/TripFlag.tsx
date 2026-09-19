import { Marker } from 'react-map-gl/maplibre';
import type { Trip } from './model';

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

export default function TripFlag({ trip, selected = false, onClick }: { trip: Trip; selected?: boolean; onClick: () => void }) {
  const [longitude, latitude] = tripFlagPosition(trip);
  const width = tripFlagWidth(trip.mapLabel);
  const center = width / 2;
  return <Marker longitude={longitude} latitude={latitude} anchor="bottom-left" offset={[-center, 0]}>
    <button className="trip-marker" style={{width}} data-selected={selected} aria-pressed={selected} aria-label={`Trip · ${trip.title}`} title={`${trip.mapLabel} · ${trip.waypoints.length} waypoints`} onClick={event => { event.stopPropagation(); onClick(); }}>
      <span className="trip-marker-surface">
        <span className="trip-marker-label">{trip.mapLabel}</span>
      </span>
      <span className="trip-marker-tether" aria-hidden="true" />
      <span className="trip-marker-anchor" aria-hidden="true" />
    </button>
  </Marker>;
}
