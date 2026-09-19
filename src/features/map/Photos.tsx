import { useEffect, useRef, useState } from 'react';
import type { PhotoStop, TripPhoto, Waypoint } from './model';
import WaypointIcon from './WaypointIcon';

export type PhotoPlace = Waypoint | PhotoStop;

export function placeIdForPhoto(photo: TripPhoto) { return photo.waypointId ?? photo.stopId!; }
export function photosForPlace(photos: TripPhoto[], placeId: string) { return photos.filter(photo => placeIdForPhoto(photo) === placeId); }
export function placeForPhoto(photo: TripPhoto, waypoints: Waypoint[], stops: PhotoStop[]) { return [...waypoints, ...stops].find(place => place.id === placeIdForPhoto(photo)) ?? null; }
/** Trip photos in route order. Missing orders sort first, ties keep file order. */
export function orderedTripPhotos(photos: TripPhoto[]) { return [...photos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function placeType(place: PhotoPlace) { return place.kind === 'photo' ? 'Photo stop' : place.kind.replace('-', ' / '); }

function PhotoImage({photo, thumbnail = false, eager = false}: {photo: TripPhoto; thumbnail?: boolean; eager?: boolean}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo.id, thumbnail]);
  if (failed) return <div className={`photo-fallback ${thumbnail ? 'photo-fallback-thumb' : ''}`} role="img" aria-label={`${photo.alt}. Image unavailable.`}><span>Image unavailable</span></div>;
  const variants = photo.variants?.slice().sort((a, b) => a.width - b.width);
  return <img
    src={thumbnail && photo.thumbnailSrc ? photo.thumbnailSrc : photo.src}
    srcSet={!thumbnail && variants?.length ? variants.map(variant => `${variant.src} ${variant.width}w`).join(', ') : undefined}
    sizes={!thumbnail && variants?.length ? '(max-width: 700px) 92vw, 760px' : undefined}
    width={photo.width}
    height={photo.height}
    alt={photo.alt}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    onError={() => setFailed(true)}
  />;
}

export function PlaceDetail({place, photos, activePhotoId, onPhoto, onOpen, onBack}: {place: PhotoPlace; photos: TripPhoto[]; activePhotoId: string | null; onPhoto: (id: string) => void; onOpen: (photo: TripPhoto, opener: HTMLElement) => void; onBack: () => void}) {
  const placePhotos = photosForPlace(photos, place.id);
  const active = placePhotos.find(photo => photo.id === activePhotoId) ?? placePhotos[0];
  const index = active ? placePhotos.indexOf(active) : -1;
  const move = (delta: number) => placePhotos.length && onPhoto(placePhotos[(index + delta + placePhotos.length) % placePhotos.length].id);
  return <section className="waypoint-detail place-detail" aria-label="Waypoint details" aria-live="polite">
    <button className="back-button place-back" onClick={onBack}>← Back to trip</button>
    <span className="eyebrow">{place.kind === 'photo' ? <span className="photo-stop-icon" aria-hidden="true">▣</span> : <WaypointIcon kind={place.kind} />} {placeType(place)}{'derived' in place && place.derived ? ' · derived' : ''}</span>
    <h2>{place.name}</h2>
    <p>{place.description || 'No description supplied.'}</p>
    {'symbol' in place && (place.symbol || place.type) && <p className="caption">Original symbol/type: {place.symbol || place.type}</p>}
    {active && <div className="place-photos">
      <button className="photo-stage" aria-label={`Enlarge photo: ${active.alt}`} onClick={event => onOpen(active, event.currentTarget)}>
        <PhotoImage photo={active} eager />
        <span className="photo-expand" aria-hidden="true">↗</span>
      </button>
      <div className="photo-controls">
        <span>{String(index + 1).padStart(2, '0')} / {String(placePhotos.length).padStart(2, '0')}</span>
        {placePhotos.length > 1 && <span><button aria-label="Previous photo" onClick={() => move(-1)}>←</button><button aria-label="Next photo" onClick={() => move(1)}>→</button></span>}
      </div>
      <p className="photo-caption">{active.caption || <span className="subtle">No caption.</span>}</p>
      {active.credit && <p className="photo-credit">Photo: {active.credit}</p>}
      {placePhotos.length > 1 && <div className="photo-thumbnails" aria-label="Choose a photo">{placePhotos.map((photo, photoIndex) => <button key={photo.id} aria-label={`Photo ${photoIndex + 1}: ${photo.alt}`} aria-pressed={photo.id === active.id} onClick={() => onPhoto(photo.id)}><PhotoImage photo={photo} thumbnail /></button>)}</div>}
    </div>}
    {!placePhotos.length && <p className="no-photos subtle">No photos are attached to this place.</p>}
  </section>;
}

export function TripCarousel({photos, waypoints, stops, activePlaceId, onOpen, onPlace}: {photos: TripPhoto[]; waypoints: Waypoint[]; stops: PhotoStop[]; activePlaceId: string | null; onOpen: (photo: TripPhoto, opener: HTMLElement) => void; onPlace: (place: PhotoPlace, photoId: string) => void}) {
  const ordered = orderedTripPhotos(photos);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activePlaceId) return;
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activePlaceId]);
  return <div ref={list} className="trip-carousel" role="list" aria-label="Trip photos in route order">
    {ordered.map((photo, index) => {
      const place = placeForPhoto(photo, waypoints, stops);
      return <div key={photo.id} role="listitem" className="carousel-item" data-active={!!place && place.id === activePlaceId} data-place-id={place?.id}>
        <div className="carousel-photo">
          <button className="carousel-enlarge" aria-label={`Enlarge photo ${index + 1}: ${photo.alt}`} onClick={event => onOpen(photo, event.currentTarget)}>
            <PhotoImage photo={photo} thumbnail />
            <span className="carousel-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {(photo.caption || photo.credit) && <span className="carousel-caption" aria-hidden="true"><span>{photo.caption}</span>{photo.credit && <small>Photo: {photo.credit}</small>}</span>}
          </button>
          {place && <button className="carousel-place" aria-label={`Jump to ${place.name} on the map`} onClick={() => onPlace(place, photo.id)}><span aria-hidden="true">↗</span> {place.name}</button>}
        </div>
      </div>;
    })}
  </div>;
}

export function PhotoLightbox({photos, activeId, scope, placeName, onChange, onClose}: {photos: TripPhoto[]; activeId: string; scope: 'place' | 'trip'; placeName: (photo: TripPhoto) => string; onChange: (id: string) => void; onClose: () => void}) {
  const dialog = useRef<HTMLDivElement>(null);
  const index = Math.max(0, photos.findIndex(photo => photo.id === activeId));
  const active = photos[index];
  const move = (delta: number) => onChange(photos[(index + delta + photos.length) % photos.length].id);
  useEffect(() => {
    const node = dialog.current;
    node?.querySelector<HTMLElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'ArrowLeft' && photos.length > 1) { event.preventDefault(); move(-1); }
      else if (event.key === 'ArrowRight' && photos.length > 1) { event.preventDefault(); move(1); }
      else if (event.key === 'Tab' && node) {
        const focusable = [...node.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')].filter(element => !element.hasAttribute('disabled'));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [activeId, photos.length]);
  useEffect(() => {
    if (photos.length < 2) return;
    for (const next of [photos[(index - 1 + photos.length) % photos.length], photos[(index + 1) % photos.length]]) { const image = new Image(); image.src = next.src; }
  }, [index, photos]);
  useEffect(() => { const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;}; }, []);
  if (!active) return null;
  return <div className="photo-lightbox-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div ref={dialog} className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged photo viewer">
      <header><span>{scope === 'trip' ? 'TRIP COLLECTION' : 'PLACE COLLECTION'} · {String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span><button aria-label="Close enlarged photo" onClick={onClose}>×</button></header>
      <div className="lightbox-image"><PhotoImage photo={active} eager /></div>
      {photos.length > 1 && <><button className="lightbox-prev" aria-label="Previous photo" onClick={() => move(-1)}>←</button><button className="lightbox-next" aria-label="Next photo" onClick={() => move(1)}>→</button></>}
      <footer><div><span className="eyebrow">{placeName(active)}</span><p>{active.caption || 'No caption.'}</p>{active.credit && <small>Photo: {active.credit}</small>}</div></footer>
    </div>
  </div>;
}
