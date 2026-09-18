import type { WaypointKind } from './model';

const paths: Record<WaypointKind, string> = {
  camp: 'M3 19 12 4l9 15H3Zm5 0 4-7 4 7M10 4l2 3 2-3',
  start: 'M8 5v14l11-7L8 5Z',
  end: 'M6 6h12v12H6Z',
  'start-end': 'M6 21V4m0 1c4-4 8 4 13 0v9c-5 4-9-4-13 0',
  parking: 'M8 20V4h5a5 5 0 0 1 0 10H8',
  transport: 'M5 19 19 5M6 5h13v13',
  summit: 'M2 19 10 5l4 7 2-3 6 10H2Zm5-9 3 2 3-2',
  water: 'M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Zm-3 12a3 3 0 0 0 3 3',
  other: 'M12 3 21 12 12 21 3 12 12 3Z',
};

export default function WaypointIcon({ kind }: { kind: WaypointKind }) {
  return <svg className="waypoint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
