import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const emptyTopoStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#fafaf7' } }],
};

/** Keep only natural features from the provider style, preserving its data filters. */
export function createTopoStyle(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const original of style.layers) {
    const layer = structuredClone(original);
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : '';
    if (layer.type === 'background') {
      layer.paint = { 'background-color': '#fafaf7' };
    } else if (layer.type === 'hillshade') {
      layer.paint = { ...layer.paint, 'hillshade-exaggeration': 0.18, 'hillshade-shadow-color': '#92978f', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#b8bcb4' };
    } else if (layer.type === 'raster' && /hillshade|relief/i.test(layer.id)) {
      layer.paint = { ...layer.paint, 'raster-saturation': -1, 'raster-opacity': 0.16 };
    } else if (layer.type === 'fill' && ['landcover', 'globallandcover', 'wood', 'forest', 'scrub', 'grass', 'sand', 'ice'].includes(sourceLayer ?? '')) {
      layer.paint = { 'fill-color': ['match', ['coalesce', ['get', 'class'], sourceLayer ?? ''], ['wood', 'forest', 'tree'], '#e4e9e0', ['ice', 'snow'], '#ffffff', '#f0f1eb'], 'fill-opacity': 0.65 };
    } else if (layer.type === 'fill' && sourceLayer === 'water') {
      layer.paint = { 'fill-color': '#e1e8e9', 'fill-outline-color': '#c5ced0' };
    } else if (layer.type === 'line' && ['waterway', 'water'].includes(sourceLayer ?? '')) {
      layer.paint = { 'line-color': '#c5ced0', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 14, 1], 'line-opacity': 0.8 };
    } else if (layer.type === 'line' && sourceLayer === 'contour') {
      layer.minzoom = Math.max(layer.minzoom ?? 0, 10);
      layer.paint = { 'line-color': '#b9bdb5', 'line-width': 0.55, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 0.45, 15, 0.65] };
    } else if (layer.type === 'symbol' && ['water_name', 'water_label', 'water_centroid', 'waterway', 'mountain_peak', 'peak', 'volcano', 'saddle', 'ridge_label', 'cliff_label', 'contour'].includes(sourceLayer ?? '')) {
      layer.minzoom = Math.max(layer.minzoom ?? 0, sourceLayer === 'contour' ? 13 : 11);
      layer.layout = { ...layer.layout, 'icon-image': '', 'text-size': 11, 'text-allow-overlap': false, 'text-ignore-placement': false };
      layer.paint = { 'text-color': '#7b837d', 'text-halo-color': '#fafaf7', 'text-halo-width': 1.5 };
    } else {
      continue;
    }
    layers.push(layer);
  }
  const usedSources = new Set(layers.flatMap(layer => 'source' in layer ? [layer.source] : []));
  return { ...style, name: 'Minimal topo', layers, sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => usedSources.has(id))) };
}
