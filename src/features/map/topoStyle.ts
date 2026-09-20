import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const emptyTopoStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#fafaf7' } }],
};

export type TopoPalette = 'topo' | 'mono';

interface Palette {
  background: string;
  land: string;
  forest: string;
  ice: string;
  water: string;
  waterLine: string;
  contour: string;
  contourIndex: string;
  label: string;
  halo: string;
  protectedFill: string;
  protectedWilderness: string;
  protectedLine: string;
  trail: string;
  trailMajor: string;
  path: string;
  border: string;
  designationLabel: string;
}

const PALETTES: Record<TopoPalette, Palette> = {
  topo: {
    background: '#fafaf7',
    land: '#edefe5',
    forest: '#bcd0b4',
    ice: '#ffffff',
    water: '#a9c9d6',
    waterLine: '#7fa9b8',
    contour: '#8a9188',
    contourIndex: '#6b7268',
    label: '#667066',
    halo: '#fafaf7',
    protectedFill: '#d8dfd2',
    protectedWilderness: '#ccd6c2',
    protectedLine: '#8b938a',
    trail: '#8b9186',
    trailMajor: '#6b7263',
    path: '#a9aea6',
    border: '#aeb4aa',
    designationLabel: '#55604c',
  },
  mono: {
    background: '#f2f2f0',
    land: '#e4e4e2',
    forest: '#c6c6c4',
    ice: '#ffffff',
    water: '#bdbdbc',
    waterLine: '#8f8f8d',
    contour: '#7c7c7a',
    contourIndex: '#5c5c5a',
    label: '#595958',
    halo: '#f2f2f0',
    protectedFill: '#d4d4d2',
    protectedWilderness: '#c6c6c4',
    protectedLine: '#7e7e7c',
    trail: '#5a5a58',
    trailMajor: '#333332',
    path: '#8a8a88',
    border: '#8f8f8d',
    designationLabel: '#3f3f3e',
  },
};

/** Source-layers that carry park / protected-area fills in MapTiler / OpenMapTiles styles. */
const PARK_FILL_SOURCE_LAYERS = new Set(['park', 'protected_area', 'nature_reserve', 'conservation', 'nature']);

const NATURAL_PLACE_PATTERN = /mountain|peak|volcano|hill|range|park|forest|wilderness|reserve|natural|conservation/i;

/** A place label is kept when its data filter targets natural features, never cities. */
function hasNaturalPlaceFilter(layer: LayerSpecification): boolean {
  if (!('filter' in layer) || layer.filter === undefined) return false;
  const filter = JSON.stringify(layer.filter);
  if (NATURAL_PLACE_PATTERN.test(filter)) return true;
  // Dataviz-style allowlists exclude urban classes instead of naming natural ones.
  return filter.includes('["!in","class"') && filter.includes('"city"');
}

function filterText(layer: LayerSpecification): string {
  return 'filter' in layer && layer.filter !== undefined ? JSON.stringify(layer.filter) : '';
}

/** A POI label layer is kept only when it labels parks, not shops or stations. */
function isParkPoiLayer(layer: LayerSpecification): boolean {
  const text = filterText(layer);
  return text.includes('"park"') && !text.includes('"atm"');
}

/** Signed walking-route layers use iwn/nwn networks (the Appalachian Trail is nwn). */
function isLongDistanceTrail(layer: LayerSpecification): boolean {
  const text = filterText(layer);
  return text.includes('"nwn"') || text.includes('"iwn"');
}

/** Cycle-route layers (class or icn/ncn networks) stay off the hiking topo. */
function isBicycleTrail(layer: LayerSpecification): boolean {
  const text = filterText(layer);
  return text.includes('"bicycle"') || text.includes('"icn"') || text.includes('"ncn"');
}

/**
 * Layers that draw state/national land designations (parks, wilderness,
 * boundaries, state labels) or natural place labels. These stay visible on
 * topo and mono styles so designations read across Appalachian and Montana trips.
 */
export function isLandDesignationLayer(layer: LayerSpecification): boolean {
  const sourceLayer = 'source-layer' in layer ? String(layer['source-layer'] ?? '') : '';
  if (!sourceLayer) return false;
  if (layer.type === 'fill') return PARK_FILL_SOURCE_LAYERS.has(sourceLayer);
  if (layer.type === 'line') return ['boundary', 'sub_border', 'country_border', 'park', 'protected_area'].includes(sourceLayer);
  if (layer.type === 'symbol') {
    if (['protected_area_major_label', 'protected_area_minor_label', 'state_label', 'country_label', 'park'].includes(sourceLayer)) return true;
    if (sourceLayer === 'poi_public') return isParkPoiLayer(layer);
    if (sourceLayer === 'place') return hasNaturalPlaceFilter(layer);
  }
  return false;
}

/**
 * Keep only natural features from the provider style, preserving its data
 * filters and per-zoom curation. Layer names match MapTiler Planet v4
 * (outdoor-v4); the mono palette renders the same geography in grayscale.
 */
export function createTopoStyle(style: StyleSpecification, paletteName: TopoPalette = 'topo'): StyleSpecification {
  const palette = PALETTES[paletteName];
  const layers: LayerSpecification[] = [];
  for (const original of style.layers) {
    const layer = structuredClone(original);
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : '';
    if (layer.type === 'background') {
      layer.paint = { 'background-color': palette.background };
    } else if (layer.type === 'hillshade') {
      layer.paint = { ...layer.paint, 'hillshade-exaggeration': 0.32, 'hillshade-shadow-color': '#7e847e', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#a9aea6' };
    } else if (layer.type === 'raster' && /hillshade|relief/i.test(layer.id)) {
      layer.paint = { ...layer.paint, 'raster-saturation': -1, 'raster-opacity': 0.16 };
    } else if (layer.type === 'fill' && ['landcover', 'globallandcover', 'wood', 'forest', 'scrub', 'grass', 'sand', 'ice'].includes(sourceLayer ?? '')) {
      layer.paint = { 'fill-color': ['match', ['coalesce', ['get', 'class'], sourceLayer ?? ''], ['wood', 'forest', 'tree'], palette.forest, ['ice', 'snow'], palette.ice, palette.land], 'fill-opacity': 0.72 };
    } else if (layer.type === 'fill' && sourceLayer === 'water') {
      layer.paint = { 'fill-color': palette.water, 'fill-outline-color': palette.waterLine };
    } else if (layer.type === 'line' && ['waterway', 'water'].includes(sourceLayer ?? '')) {
      layer.paint = { 'line-color': palette.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 14, 1.4], 'line-opacity': 0.9 };
    } else if (layer.type === 'line' && sourceLayer === 'contour') {
      layer.minzoom = Math.max(layer.minzoom ?? 0, 10);
      // Index contours (every 5th) draw bolder so elevation reads at a glance.
      const index = filterText(layer).includes('nth_line');
      layer.paint = { 'line-color': index ? palette.contourIndex : palette.contour, 'line-width': index ? 1 : 0.7, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 12, 0.7, 15, 0.9] };
    } else if (layer.type === 'line' && sourceLayer === 'trail' && !isBicycleTrail(layer)) {
      const major = isLongDistanceTrail(layer);
      layer.paint = { 'line-color': major ? palette.trailMajor : palette.trail, 'line-width': major ? 1.3 : 1, 'line-opacity': 0.85 };
    } else if (layer.type === 'line' && sourceLayer === 'pathway') {
      layer.paint = { 'line-color': palette.path, 'line-width': 0.8, 'line-opacity': 0.8 };
    } else if (layer.type === 'line' && ['sub_border', 'country_border', 'boundary'].includes(sourceLayer ?? '')) {
      layer.paint = { 'line-color': palette.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 12, 1.2], 'line-opacity': 0.75, 'line-dasharray': [3, 2] };
    } else if (layer.type === 'symbol' && ['protected_area_major_label', 'protected_area_minor_label'].includes(sourceLayer ?? '')) {
      layer.layout = { ...layer.layout, 'icon-image': '', 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.designationLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else if (layer.type === 'symbol' && sourceLayer === 'poi_public' && isParkPoiLayer(layer)) {
      layer.minzoom = 12;
      layer.layout = { ...layer.layout, 'icon-image': '', 'text-size': 11, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.designationLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else if (layer.type === 'symbol' && ['state_label', 'country_label'].includes(sourceLayer ?? '')) {
      layer.layout = { ...layer.layout, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.label, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else if (layer.type === 'symbol' && sourceLayer === 'trail' && isLongDistanceTrail(layer) && !isBicycleTrail(layer)) {
      layer.layout = { ...layer.layout, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.trailMajor, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else if (layer.type === 'symbol' && (sourceLayer === 'place' || sourceLayer === 'park') && hasNaturalPlaceFilter(layer)) {
      layer.minzoom = Math.max(layer.minzoom ?? 9, 9);
      layer.layout = { ...layer.layout, 'icon-image': '', 'text-size': 11, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.designationLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else if (layer.type === 'symbol' && ['water_name', 'water_label', 'water_centroid', 'waterway', 'mountain_peak', 'peak', 'volcano', 'saddle', 'ridge_label', 'cliff_label', 'contour'].includes(sourceLayer ?? '')) {
      // Provider per-zoom curation is authoritative; only contour labels wait longer.
      if (sourceLayer === 'contour') layer.minzoom = Math.max(layer.minzoom ?? 0, 13);
      layer.layout = { ...layer.layout, 'icon-image': '', 'text-size': 11, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': palette.label, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 };
    } else {
      continue;
    }
    layers.push(layer);
  }
  // The provider style draws protected areas as labels only. Add fills and
  // outlines from the same tileset so national/state forests, parks, and
  // wilderness read as designated land, not just names.
  const designationSource = layers.find((layer) => 'source-layer' in layer && typeof layer['source-layer'] === 'string' && (layer['source-layer'] === 'protected_area_major_label' || layer['source-layer'] === 'protected_area_minor_label') && 'source' in layer);
  if (designationSource && 'source' in designationSource) {
    const source = designationSource.source;
    const fill: LayerSpecification = { id: 'Protected area fill', type: 'fill', source, 'source-layer': 'protected_area', minzoom: 7, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['match', ['coalesce', ['get', 'class'], ''], ['wilderness_area'], palette.protectedWilderness, palette.protectedFill], 'fill-opacity': 0.55 } };
    const outline: LayerSpecification = { id: 'Protected area outline', type: 'line', source, 'source-layer': 'protected_area', minzoom: 7, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': palette.protectedLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 14, 1.2], 'line-opacity': 0.9, 'line-dasharray': [3, 2] } };
    const lastFill = layers.map((layer) => layer.type).lastIndexOf('fill');
    layers.splice(Math.max(lastFill + 1, 1), 0, fill, outline);
  }
  const usedSources = new Set(layers.flatMap((layer) => ('source' in layer ? [layer.source] : [])));
  return { ...style, name: paletteName === 'mono' ? 'Minimal mono' : 'Minimal topo', layers, sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => usedSources.has(id))) };
}
