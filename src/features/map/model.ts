import type { FeatureCollection, LineString } from 'geojson';
export type WaypointKind = 'camp' | 'start' | 'end' | 'start-end' | 'parking' | 'transport' | 'summit' | 'water' | 'other';
export type Bounds = [number, number, number, number];
export interface Point { lon: number; lat: number; elevation: number | null; time: string | null; extensions?: unknown }
export interface Waypoint extends Point { id: string; name: string; description: string; symbol: string; type: string; kind: WaypointKind; derived?: boolean }
export interface PhotoStop extends Point { id: string; name: string; description: string; kind: 'photo' }
export interface PhotoVariant { src: string; width: number; height: number }
export interface TripPhoto { id: string; waypointId?: string; stopId?: string; src: string; thumbnailSrc?: string; variants?: PhotoVariant[]; width: number; height: number; alt: string; caption: string; order: number; capturedAt?: string; credit?: string }
export interface TripPhotos { stops: PhotoStop[]; photos: TripPhoto[] }
export interface Stats { distanceM: number; gainM: number | null; points: number; elevationPoints: number; timestampPoints: number }
export interface Segment { id: string; points: Point[]; stats: Stats }
export interface Path { id: string; kind: 'track' | 'route'; name: string; description: string; extensions?: unknown; segments: Segment[] }
export interface TripDetail { schemaVersion: 1; id: string; paths: Path[]; geojson: FeatureCollection<LineString>; sourceMetadata: unknown; sourceExtensions: unknown; photoStops: PhotoStop[]; photos: TripPhoto[] }
export interface Trip { id: string; title: string; mapLabel: string; dates: { start?: string; end?: string; label: string; source: string }; region?: string; tags?: string[]; detailUrl: string; bounds: Bounds | null; stats: Stats; statsPathIds: string[]; statsLabel: string; overview: FeatureCollection<LineString>; waypoints: Waypoint[]; notes?: string; photos?: {src: string; caption?: string; date?: string}[]; issues: string[] }
export interface Override { title?: string; mapLabel?: string; dates?: Trip['dates']; region?: string; tags?: string[]; notes?: string; pathIds?: string[]; statsPathIds?: string[]; statsLabel?: string; waypoints?: Record<string, Partial<Pick<Waypoint,'kind' | 'name' | 'description' | 'lat' | 'lon'>>> }
