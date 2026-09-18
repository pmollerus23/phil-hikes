import { Marker } from 'react-map-gl/maplibre';
import type { Trip } from './model';

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

export default function TripFlag({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const [longitude, latitude] = tripFlagPosition(trip);
  return <Marker longitude={longitude} latitude={latitude} anchor="bottom-left" offset={[-32, 0]}>
    <button className="trip-marker" aria-label={`Trip · ${trip.title}`} title={`${trip.title} · ${trip.waypoints.length} waypoints`} onClick={event => { event.stopPropagation(); onClick(); }}>
      <svg viewBox="0 0 64 56" aria-hidden="true">
        <path className="trip-marker-stem" d="M32 56V40l8-8v-5" />
        <path className="trip-marker-frame" d="M4 5h47l9 9v13H4Z" />
        <path className="trip-marker-brackets" d="M4 12V5h10m36 22h10v-8" />
        <path className="trip-marker-accent" d="M8 10h4" />
        <text x="32" y="19" textAnchor="middle">TRIP</text>
        <circle className="trip-marker-anchor" cx="32" cy="55" r="1.5" />
      </svg>
    </button>
  </Marker>;
}
