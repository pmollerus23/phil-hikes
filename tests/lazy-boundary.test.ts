import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The archive shell must keep no static dependency on the map engine chunk:
// merely moving code into another eagerly imported chunk would not help
// readiness. The engine stays inside the lazily imported MapCanvas module.
test('archive shell has no static dependency on the map engine', () => {
  const source = readFileSync(new URL('../src/features/map/MapApp.tsx', import.meta.url), 'utf8');
  const code = source.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /^[ \t]*import\s+.*from\s+'\.\/MapCanvas'/m);
  assert.match(code, /lazy\(\(\)\s*=>\s*import\('\.\/MapCanvas'\)\)/);
  assert.doesNotMatch(code, /maplibre/i);
  assert.doesNotMatch(code, /react-map-gl/);
  assert.match(code, /from\s+'\.\/mapHandle'/);
});

test('lazy map module owns worker setup and engine CSS', () => {
  const canvas = readFileSync(new URL('../src/features/map/MapCanvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /setWorkerUrl/);
  assert.match(canvas, /maplibre-gl\.css/);
});
