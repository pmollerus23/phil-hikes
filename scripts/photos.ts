import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PhotoStop, TripPhoto, TripPhotos, Waypoint } from '../src/features/map/model';

export interface PhotoManifest { schemaVersion: 1; trips: Record<string, TripPhotos> }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const assetPath = (src: string) => {
  if (!src.startsWith('/') || src.includes('..') || src.startsWith('//')) throw new Error(`Photo asset must be a root-relative public path: ${src}`);
  return resolve('public', src.slice(1));
};

export async function validatePhotoManifest(value: unknown, trips: Map<string, Waypoint[]>, checkAssets = true): Promise<PhotoManifest> {
  if (!value || typeof value !== 'object' || (value as any).schemaVersion !== 1 || !(value as any).trips || Array.isArray((value as any).trips)) {
    throw new Error('Photo manifest must contain schemaVersion 1 and a trips object.');
  }
  const manifest = value as PhotoManifest;
  const globalPhotoIds = new Set<string>();
  for (const [tripId, data] of Object.entries(manifest.trips)) {
    const waypoints = trips.get(tripId);
    if (!waypoints) throw new Error(`Photo manifest references unknown trip: ${tripId}`);
    if (!data || !Array.isArray(data.stops) || !Array.isArray(data.photos)) throw new Error(`${tripId}: photos entry must contain stops and photos arrays.`);
    const waypointIds = new Set(waypoints.map(waypoint => waypoint.id));
    const stopIds = new Set<string>();
    for (const stop of data.stops as PhotoStop[]) {
      if (!stop || !/^[a-z0-9-]+$/.test(stop.id) || stopIds.has(stop.id) || waypointIds.has(stop.id)) throw new Error(`${tripId}: invalid, duplicate, or waypoint-colliding photo stop ID ${stop?.id ?? '(missing)'}.`);
      if (typeof stop.name !== 'string' || !stop.name.trim() || typeof stop.description !== 'string' || stop.kind !== 'photo') throw new Error(`${tripId}/${stop.id}: photo stop requires a name, description, and kind "photo".`);
      if (!finite(stop.lon) || Math.abs(stop.lon) > 180 || !finite(stop.lat) || Math.abs(stop.lat) > 90) throw new Error(`${tripId}/${stop.id}: invalid photo stop coordinates.`);
      if (!(stop.elevation === null || finite(stop.elevation)) || !(stop.time === null || typeof stop.time === 'string')) throw new Error(`${tripId}/${stop.id}: photo stop elevation/time must be null or valid values.`);
      stopIds.add(stop.id);
    }
    const localPhotoIds = new Set<string>();
    for (const photo of data.photos as TripPhoto[]) {
      const label = `${tripId}/${photo?.id ?? '(missing)'}`;
      if (!photo || !/^[a-z0-9-]+$/.test(photo.id) || localPhotoIds.has(photo.id) || globalPhotoIds.has(photo.id)) throw new Error(`${label}: invalid or duplicate photo ID.`);
      const associations = Number(typeof photo.waypointId === 'string') + Number(typeof photo.stopId === 'string');
      if (associations !== 1) throw new Error(`${label}: associate the photo with exactly one waypointId or stopId.`);
      if (photo.waypointId && !waypointIds.has(photo.waypointId)) throw new Error(`${label}: unknown waypointId ${photo.waypointId}.`);
      if (photo.stopId && !stopIds.has(photo.stopId)) throw new Error(`${label}: unknown stopId ${photo.stopId}.`);
      if (typeof photo.src !== 'string' || !photo.src || !finite(photo.width) || photo.width <= 0 || !finite(photo.height) || photo.height <= 0 || typeof photo.alt !== 'string' || !photo.alt.trim() || typeof photo.caption !== 'string' || !Number.isInteger(photo.order)) throw new Error(`${label}: src, positive dimensions, alt, caption, and integer order are required.`);
      if (photo.thumbnailSrc !== undefined && typeof photo.thumbnailSrc !== 'string') throw new Error(`${label}: thumbnailSrc must be a string path.`);
      if (photo.capturedAt !== undefined && typeof photo.capturedAt !== 'string' || photo.credit !== undefined && typeof photo.credit !== 'string') throw new Error(`${label}: capturedAt and credit must be strings when provided.`);
      if (photo.variants !== undefined && !Array.isArray(photo.variants)) throw new Error(`${label}: variants must be an array.`);
      for (const variant of photo.variants ?? []) if (!variant || typeof variant.src !== 'string' || !finite(variant.width) || variant.width <= 0 || !finite(variant.height) || variant.height <= 0) throw new Error(`${label}: responsive variants require a string src and positive dimensions.`);
      const sources = [photo.src, ...(photo.thumbnailSrc ? [photo.thumbnailSrc] : []), ...(photo.variants ?? []).map(variant => variant.src)];
      for (const src of sources) {
        const path = assetPath(src);
        if (checkAssets) await access(path).catch(() => { throw new Error(`${label}: missing photo asset ${src}.`); });
      }
      localPhotoIds.add(photo.id);
      globalPhotoIds.add(photo.id);
    }
    data.photos.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  return manifest;
}
