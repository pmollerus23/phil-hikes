import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StyleSpecification } from 'maplibre-gl';
import { createTopoStyle, isLandDesignationLayer } from '../src/features/map/topoStyle';

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

test('topographic style retains natural geography and land designations, and removes urban layers and unused sources', () => {
  const original = structuredClone(provider);
  const style = createTopoStyle(provider);
  assert.deepEqual(style.layers.map(l => l.id), ['background', 'forest', 'lake', 'river', 'contours', 'peak-label', 'lake-label', 'relief', 'boundary']);
  assert.deepEqual(Object.keys(style.sources), ['nature', 'urban', 'dem']);
  assert.ok(style.sources.nature.type === 'vector');
  assert.equal(style.sources.nature.attribution, 'Provider attribution');
  assert.ok(style.layers[1].type === 'fill' && provider.layers[1].type === 'fill');
  assert.deepEqual(style.layers[1].filter, provider.layers[1].filter);
  assert.deepEqual(provider, original);
});

test('contours and natural labels wait for close zooms and use a restrained palette', () => {
  const style = createTopoStyle(provider);
  assert.equal(style.layers.find(l => l.id === 'contours')?.minzoom, 10);
  // Provider per-zoom curation is preserved (peaks show from z9 live).
  assert.equal(style.layers.find(l => l.id === 'peak-label')?.minzoom, undefined);
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

test('protected areas, trails, borders, and state labels match live Planet v4 names', () => {
  const style: StyleSpecification = { ...provider, layers: [
    { id: 'Water', type: 'fill', source: 'nature', 'source-layer': 'water' },
    { id: 'Protected area major labels', type: 'symbol', source: 'nature', 'source-layer': 'protected_area_major_label', minzoom: 4, layout: { 'text-field': ['get', 'name'] } },
    { id: 'Protected area labels', type: 'symbol', source: 'nature', 'source-layer': 'protected_area_minor_label', minzoom: 11, layout: { 'text-field': ['get', 'name'] } },
    { id: 'Park labels', type: 'symbol', source: 'nature', 'source-layer': 'poi_public', minzoom: 14, filter: ['all', ['==', ['geometry-type'], 'Point'], ['all', ['match', ['get', 'subclass'], ['park'], true, false], ['has', 'name']]], layout: { 'text-field': ['get', 'name'] } },
    { id: 'Public', type: 'symbol', source: 'nature', 'source-layer': 'poi_public', minzoom: 17, filter: ['all', ['match', ['get', 'subclass'], ['atm', 'bank'], true, false]], layout: { 'text-field': ['get', 'name'] } },
    { id: 'Longdistance trail', type: 'line', source: 'nature', 'source-layer': 'trail', minzoom: 5, filter: ['all', ['in', 'network', 'iwn', 'nwn'], ['has', 'ref']] },
    { id: 'Other trails', type: 'line', source: 'nature', 'source-layer': 'trail', minzoom: 10, filter: ['all', ['!has', 'color']] },
    { id: 'Bicycle longdistance', type: 'line', source: 'nature', 'source-layer': 'trail', minzoom: 5, filter: ['all', ['in', 'network', 'icn', 'ncn'], ['==', 'class', 'bicycle']] },
    { id: 'Path', type: 'line', source: 'nature', 'source-layer': 'pathway', minzoom: 12 },
    { id: 'Longdistance trail labels', type: 'symbol', source: 'nature', 'source-layer': 'trail', minzoom: 11, filter: ['all', ['in', 'network', 'iwn', 'nwn'], ['has', 'ref']], layout: { 'text-field': ['get', 'ref'] } },
    { id: 'Other border z7', type: 'line', source: 'nature', 'source-layer': 'sub_border', minzoom: 7 },
    { id: 'State labels z4', type: 'symbol', source: 'nature', 'source-layer': 'state_label', minzoom: 4, layout: { 'text-field': ['get', 'name'] } },
    { id: 'City labels', type: 'symbol', source: 'nature', 'source-layer': 'city_label', minzoom: 5, layout: { 'text-field': ['get', 'name'] } },
    { id: 'Road labels', type: 'symbol', source: 'nature', 'source-layer': 'road_label', minzoom: 8, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'] } },
    { id: 'Major road', type: 'line', source: 'nature', 'source-layer': 'road', minzoom: 5, filter: ['all', ['match', ['get', 'class'], ['motorway'], true, false]], paint: { 'line-color': 'white' } },
    { id: 'No access road', type: 'line', source: 'nature', 'source-layer': 'road', minzoom: 5, filter: ['all', ['match', ['get', 'access'], ['conditional'], true, false]] },
    { id: 'Highway shield (US)', type: 'symbol', source: 'nature', 'source-layer': 'road_label', minzoom: 12, layout: { 'icon-image': 'us-interstate_2', 'text-field': '{ref}' }, paint: { 'text-color': 'black' } },
    { id: 'Town labels', type: 'symbol', source: 'nature', 'source-layer': 'town_label', minzoom: 6, layout: { 'icon-image': 'dot', 'text-field': ['get', 'name'] }, paint: { 'text-color': 'black', 'text-halo-width': 1.6 } },
    { id: 'Village labels', type: 'symbol', source: 'nature', 'source-layer': 'place_label', minzoom: 9, layout: { 'text-field': ['get', 'name'] } },
  ] };
  const topo = createTopoStyle(style);
  assert.deepEqual(topo.layers.map(l => l.id), [
    'Water', 'Protected area fill', 'Protected area outline',
    'Protected area major labels', 'Protected area labels',
    'Park labels', 'Longdistance trail', 'Other trails', 'Path', 'Longdistance trail labels', 'Other border z7', 'State labels z4',
    'City labels', 'Road labels', 'Major road', 'Highway shield (US)', 'Town labels', 'Village labels',
    'Regional trail', 'Regional trail labels', 'Regional trail ref labels',
  ]);
  // Provider per-zoom curation is preserved; park POIs arrive earlier on the sparse topo.
  assert.equal(topo.layers.find(l => l.id === 'Protected area major labels')?.minzoom, 4);
  assert.equal(topo.layers.find(l => l.id === 'Protected area labels')?.minzoom, 11);
  assert.equal(topo.layers.find(l => l.id === 'Park labels')?.minzoom, 12);
  const major = topo.layers.find(l => l.id === 'Longdistance trail');
  const minor = topo.layers.find(l => l.id === 'Other trails');
  assert.ok(major?.type === 'line' && minor?.type === 'line');
  assert.notDeepEqual(major.paint?.['line-color'], minor.paint?.['line-color']);
  const fill = topo.layers.find(l => l.id === 'Protected area fill');
  assert.ok(fill?.type === 'fill');
  assert.equal(fill.minzoom, 7);
  // Towns, cities, and road names join the topo with provider minzooms intact.
  const city = topo.layers.find(l => l.id === 'City labels');
  assert.ok(city?.type === 'symbol');
  assert.equal(city.minzoom, 5);
  assert.ok(city.paint?.['text-color'] !== undefined);
  const roadLabels = topo.layers.find(l => l.id === 'Road labels');
  assert.ok(roadLabels?.type === 'symbol');
  assert.equal(roadLabels.minzoom, 8);
  // Road casings keep provider paint; shields keep sprites and paint.
  const majorRoad = topo.layers.find(l => l.id === 'Major road');
  assert.ok(majorRoad?.type === 'line');
  assert.deepEqual(majorRoad.paint, { 'line-color': 'white' });
  const shield = topo.layers.find(l => l.id === 'Highway shield (US)');
  assert.ok(shield?.type === 'symbol');
  assert.deepEqual(shield.paint, { 'text-color': 'black' });
  assert.equal(shield.layout?.['icon-image'], 'us-interstate_2');
  const town = topo.layers.find(l => l.id === 'Town labels');
  assert.ok(town?.type === 'symbol');
  assert.equal(town.layout?.['icon-image'], 'dot');
  assert.equal(town.paint?.['text-halo-width'], 1.6);
  // Signed regional routes (rwn, e.g. the Long Trail) get major-trail lines and names.
  const regional = topo.layers.find(l => l.id === 'Regional trail');
  assert.ok(regional?.type === 'line');
  assert.equal(regional.minzoom, 8);
  assert.ok(JSON.stringify(regional.filter).includes('"rwn"'));
  assert.deepEqual(regional.paint?.['line-color'], major.paint?.['line-color']);
  const regionalLabels = topo.layers.find(l => l.id === 'Regional trail labels');
  assert.ok(regionalLabels?.type === 'symbol');
  assert.equal(regionalLabels.minzoom, 10);
  assert.ok(JSON.stringify(regionalLabels.filter).includes('"rwn"'));
  // The name layer inherits placement from the working road-label template.
  assert.equal(regionalLabels.layout?.['symbol-placement'], 'line');
  assert.deepEqual(regionalLabels.layout?.['text-field'], ['coalesce', ['get', 'name:en'], ['get', 'name']]);
  assert.equal(regionalLabels.source, 'nature');
  assert.equal(regionalLabels['source-layer'], 'trail');
  assert.equal(regionalLabels.layout?.['text-max-angle'], 90);
  // Short ref badges place on twisty runs where full names cannot fit.
  const regionalRef = topo.layers.find(l => l.id === 'Regional trail ref labels');
  assert.ok(regionalRef?.type === 'symbol');
  assert.deepEqual(regionalRef.layout?.['text-field'], ['get', 'ref']);
  assert.equal(regionalRef.layout?.['text-max-angle'], 90);
  assert.equal(regionalRef.layout?.['text-allow-overlap'], true);
  assert.deepEqual(validateStyleMin(topo), []);
  assert.deepEqual(validateStyleMin(createTopoStyle(style, 'mono')), []);
});

test('mono renders the same geography in grayscale', () => {
  const topo = createTopoStyle(provider);
  const mono = createTopoStyle(provider, 'mono');
  assert.equal(mono.name, 'Minimal mono');
  assert.deepEqual(mono.layers.map(l => l.id), topo.layers.map(l => l.id));
  assert.notDeepEqual(
    mono.layers.find(l => l.id === 'background'),
    topo.layers.find(l => l.id === 'background'),
  );
  assert.deepEqual(validateStyleMin(mono), []);
});

test('land designation layers are identified for topo styling', () => {
  assert.equal(isLandDesignationLayer({ id: 'a', type: 'fill', source: 's', 'source-layer': 'protected_area' } as never), true);
  assert.equal(isLandDesignationLayer({ id: 'b', type: 'line', source: 's', 'source-layer': 'sub_border' } as never), true);
  assert.equal(isLandDesignationLayer({ id: 'c', type: 'symbol', source: 's', 'source-layer': 'protected_area_major_label' } as never), true);
  assert.equal(isLandDesignationLayer({ id: 'd', type: 'symbol', source: 's', 'source-layer': 'state_label' } as never), true);
  assert.equal(isLandDesignationLayer({ id: 'e', type: 'fill', source: 's', 'source-layer': 'landcover' } as never), false);
  assert.equal(isLandDesignationLayer({ id: 'f', type: 'line', source: 's', 'source-layer': 'transportation' } as never), false);
  assert.equal(isLandDesignationLayer({ id: 'g', type: 'symbol', source: 's', 'source-layer': 'city_label' } as never), false);
  assert.equal(isLandDesignationLayer({ id: 'h', type: 'symbol', source: 's', 'source-layer': 'place' } as never), false);
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
  assert.deepEqual(topo.layers.map(l => l.id), ['Forest', 'Wood', 'Lake labels', 'River labels', 'City labels']);
  assert.deepEqual(validateStyleMin(topo), []);
});
