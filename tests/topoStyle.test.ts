import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StyleSpecification } from 'maplibre-gl';
import { createTopoStyle } from '../src/features/map/topoStyle';

const provider: StyleSpecification = {
  version: 8,
  glyphs: 'https://example.com/{fontstack}/{range}.pbf',
  sources: {
    nature: { type: 'vector', tiles: ['https://example.com/{z}/{x}/{y}.pbf'], attribution: 'Provider attribution' },
    urban: { type: 'vector', tiles: ['https://example.com/urban/{z}/{x}/{y}.pbf'] },
    dem: { type: 'raster-dem', tiles: ['https://example.com/{z}/{x}/{y}.png'] },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'green' } },
    { id: 'forest', type: 'fill', source: 'nature', 'source-layer': 'landcover', filter: ['==', 'class', 'wood'], paint: { 'fill-pattern': 'trees' } },
    { id: 'lake', type: 'fill', source: 'nature', 'source-layer': 'water' },
    { id: 'river', type: 'line', source: 'nature', 'source-layer': 'waterway' },
    { id: 'contours', type: 'line', source: 'nature', 'source-layer': 'contour' },
    { id: 'peak-label', type: 'symbol', source: 'nature', 'source-layer': 'peak', layout: { 'text-field': ['get', 'name'], 'icon-image': 'mountain' } },
    { id: 'lake-label', type: 'symbol', source: 'nature', 'source-layer': 'water_name', minzoom: 14 },
    { id: 'relief', type: 'hillshade', source: 'dem' },
    ...['transportation', 'place', 'boundary', 'building', 'poi', 'landuse'].map(sourceLayer => ({ id: sourceLayer, type: 'line' as const, source: 'urban', 'source-layer': sourceLayer })),
  ],
};

test('topographic style retains natural geography and attribution, and removes urban layers and unused sources', () => {
  const original = structuredClone(provider);
  const style = createTopoStyle(provider);
  assert.deepEqual(style.layers.map(l => l.id), ['background', 'forest', 'lake', 'river', 'contours', 'peak-label', 'lake-label', 'relief']);
  assert.deepEqual(Object.keys(style.sources), ['nature', 'dem']);
  assert.ok(style.sources.nature.type === 'vector');
  assert.equal(style.sources.nature.attribution, 'Provider attribution');
  assert.ok(style.layers[1].type === 'fill' && provider.layers[1].type === 'fill');
  assert.deepEqual(style.layers[1].filter, provider.layers[1].filter);
  assert.deepEqual(provider, original);
});

test('contours and natural labels wait for close zooms and use a restrained palette', () => {
  const style = createTopoStyle(provider);
  assert.equal(style.layers.find(l => l.id === 'contours')?.minzoom, 10);
  assert.equal(style.layers.find(l => l.id === 'peak-label')?.minzoom, 11);
  assert.equal(style.layers.find(l => l.id === 'lake-label')?.minzoom, 14);
  const forest = style.layers.find(l => l.id === 'forest');
  assert.ok(forest?.type === 'fill');
  assert.equal(forest.paint?.['fill-pattern'], undefined);
  const peak = style.layers.find(l => l.id === 'peak-label');
  assert.ok(peak?.type === 'symbol');
  assert.equal(peak.layout?.['icon-image'], '');
  assert.deepEqual(peak.layout?.['text-field'], ['get', 'name']);
});

test('generated topographic style satisfies the MapLibre style specification', () => {
  assert.deepEqual(validateStyleMin(createTopoStyle(provider)), []);
});

test('current Planet v4 woodland and water labels are retained', () => {
  const style: StyleSpecification = { ...provider, layers: [
    { id: 'Forest', type: 'fill', source: 'nature', 'source-layer': 'forest' },
    { id: 'Wood', type: 'fill', source: 'nature', 'source-layer': 'wood' },
    { id: 'Lake labels', type: 'symbol', source: 'nature', 'source-layer': 'water_centroid' },
    { id: 'River labels', type: 'symbol', source: 'nature', 'source-layer': 'water_label' },
    { id: 'City labels', type: 'symbol', source: 'nature', 'source-layer': 'city_label' },
  ] };
  const topo = createTopoStyle(style);
  assert.deepEqual(topo.layers.map(l => l.id), ['Forest', 'Wood', 'Lake labels', 'River labels']);
  assert.deepEqual(validateStyleMin(topo), []);
});
