import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Delivery policy lives in public/_headers (copied to dist by Astro) and a
// map-only preconnect hint. Netlify behavior itself must be verified after a
// separately authorized deployment; these assertions only pin the config.
test('delivery headers pin immutable hashed assets and revalidating trip JSON', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/_astro\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/trips\/\*\.json\s*\n\s*Cache-Control: public, max-age=0, must-revalidate/);
  assert.doesNotMatch(headers, /\/photos\//);
  assert.doesNotMatch(headers, /\/fonts\//);
});

test('preconnect hint is map-only and carries no key', () => {
  const shell = readFileSync(new URL('../src/layouts/Shell.astro', import.meta.url), 'utf8');
  const hint = shell.split('\n').find((line) => line.includes('preconnect'));
  assert.ok(hint, 'Shell renders a preconnect hint');
  assert.match(hint, /\{map && mapKey &&/);
  assert.match(hint, /href="https:\/\/api\.maptiler\.com"/);
  assert.doesNotMatch(hint, /key=/);
  const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /preconnect/);
});
