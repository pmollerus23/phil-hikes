#!/usr/bin/env node
// Production performance baseline (opt-in; not part of ordinary CI).
//
// Usage:
//   npm run test:perf            # fixture-key build into dist-perf/ + measurements
//   npm run test:perf -- --no-build --samples=5
//
// Methodology: a production build is made with the local fixture key into
// dist-perf/ (never dist/, and never published), served statically, with ALL
// provider traffic intercepted by deterministic fixtures. Timings are local
// estimates for relative comparison, not production observations. No
// wall-clock thresholds are enforced: this script reports medians and ranges.
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const root = resolve(new URL('.', import.meta.url).pathname, '..');
const outDir = join(root, 'dist-perf');
const resultsDir = join(root, 'test-results', 'perf');
const args = new Map(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : ['positional', a];
}));
const SAMPLES = Number(args.get('samples') ?? 3);
const NO_BUILD = args.has('no-build');
const PORT = Number(args.get('port') ?? 4333);

const execFileAsync = promisify(execFile);
const median = (xs) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
const spread = (xs) => xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : 'n/a';

function mime(file) {
  return {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  }[extname(file)] ?? 'application/octet-stream';
}

function startStaticServer(dir, port) {
  const server = createServer((req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = join(dir, path);
      if (path.endsWith('/')) file = join(file, 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(file === join(dir, path) ? file : file, 'index.html');
      if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': mime(file), 'content-length': statSync(file).size });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('error'); }
  });
  return new Promise((resolveServer) => server.listen(port, '127.0.0.1', () => resolveServer(server)));
}

function assetReport() {
  const astroDir = join(outDir, '_astro');
  const rows = [];
  if (existsSync(astroDir)) {
    for (const file of readdirSync(astroDir)) {
      const full = join(astroDir, file);
      if (statSync(full).isDirectory()) continue;
      const raw = readFileSync(full);
      // Classify by chunk filename: content matching misfires on the shell's
      // lazy `import('./MapCanvas')` string.
      let role = 'other';
      if (file.endsWith('.js')) {
        if (/^MapCanvas\./.test(file) || /^maplibre-gl\.(?!worker)/.test(file) || /^maplibre-gl-worker/.test(file)) {
          role = /^maplibre-gl-worker/.test(file) ? 'maplibre-worker' : 'map-engine';
        } else if (/^(client|react|react-dom)\./.test(file)) role = 'react-vendor';
        else role = 'archive-shell';
      } else if (file.endsWith('.css')) role = /^MapCanvas\./.test(file) ? 'map-css' : 'shell-css';
      rows.push({ file, bytes: raw.length, gzip: gzipSync(raw).length, role });
    }
  }
  const tripIndex = join(outDir, 'trips', 'index.json');
  if (existsSync(tripIndex)) {
    const raw = readFileSync(tripIndex);
    rows.push({ file: 'trips/index.json', bytes: raw.length, gzip: gzipSync(raw).length, role: 'trip-index' });
  }
  return rows;
}

// Vector-backed provider fixture: unlike the background-only dev fixture,
// this exposes real style/source reload costs on Topo/Mono/Satellite switches.
async function installProviderFixture(page) {
  const vectorStyle = (background) => ({
    version: 8,
    sources: { vectortiles: { type: 'vector', url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=perf-fixture' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      { id: 'landuse', type: 'fill', source: 'vectortiles', 'source-layer': 'landuse', paint: { 'fill-color': '#edefe5' } },
      { id: 'roads', type: 'line', source: 'vectortiles', 'source-layer': 'transportation', paint: { 'line-color': '#8b9186' } },
      { id: 'labels', type: 'symbol', source: 'vectortiles', 'source-layer': 'place', layout: { 'text-field': '{name}' } },
    ],
  });
  await page.route('https://api.maptiler.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/resources/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><text y="15">Perf</text></svg>' });
    if (url.includes('/maps/outdoor-v4/style.json')) return route.fulfill({ json: vectorStyle('#e7eddc') });
    if (url.includes('/maps/satellite/style.json')) return route.fulfill({ json: vectorStyle('#263a37') });
    if (url.includes('tiles/v3/tiles.json')) return route.fulfill({ json: { tilejson: '3.0.0', tiles: ['https://api.maptiler.com/perf-vector/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 5 } });
    if (url.includes('terrain-rgb-v2/tiles.json')) return route.fulfill({ json: { tilejson: '3.0.0', tiles: ['https://api.maptiler.com/perf-dem/{z}/{x}/{y}.png'], minzoom: 0, maxzoom: 5 } });
    if (url.includes('/perf-vector/')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ path: join(root, 'tests', 'fixtures', 'flat-dem.png'), contentType: 'image/png' });
  });
}

function categorize(url) {
  if (url.includes('/perf-vector/') || url.includes('/perf-dem/') || url.endsWith('.pbf') || url.endsWith('.png')) return 'provider-tiles';
  if (url.includes('tiles.json')) return 'provider-tilejson';
  if (url.includes('/maps/')) return 'provider-style';
  if (url.includes('/trips/')) return 'trip-json';
  if (url.includes('/photos/') || url.includes('/demo/photos/')) return 'photo';
  if (url.endsWith('.js')) return 'script';
  if (url.endsWith('.css')) return 'style';
  if (url.includes('/fonts/')) return 'font';
  return 'other';
}

async function measureScenario(page, viewport, kind, run) {
  const requests = [];
  const onRequest = (request) => requests.push({ url: request.url(), category: categorize(request.url()) });
  const bytes = new Map();
  const onResponse = async (response) => {
    try {
      const body = await response.body();
      const url = response.url();
      bytes.set(url, (bytes.get(url) ?? 0) + body.length);
    } catch { /* aborted/empty responses */ }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  await page.evaluate(() => { window.__longtasks = []; });
  const start = Date.now();
  const extra = await run();
  const durationMs = Date.now() - start;
  const longtasks = await page.evaluate(() => (window.__longtasks ?? []).length);
  page.off('request', onRequest);
  page.off('response', onResponse);
  const byCategory = {};
  for (const { category } of requests) byCategory[category] = (byCategory[category] ?? 0) + 1;
  let totalBytes = 0;
  for (const size of bytes.values()) totalBytes += size;
  return { viewport, kind, durationMs, longtasks, requests: requests.length, bytes: totalBytes, byCategory, ...extra };
}

async function main() {
  if (!NO_BUILD) {
    console.log('Building fixture-key production build into dist-perf/ …');
    await execFileAsync(process.execPath, ['node_modules/.bin/astro', 'build', '--outDir', 'dist-perf'], {
      cwd: root, env: { ...process.env, PUBLIC_MAPTILER_KEY: 'local-test-fixture' },
    });
  }
  if (!existsSync(join(outDir, 'map', 'index.html'))) throw new Error('dist-perf/ is missing: run without --no-build first.');

  const assets = assetReport();
  const server = await startStaticServer(outDir, PORT);
  const { chromium } = await import('@playwright/test');
  const chromiumPath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const viewports = [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ];
  const baseURL = `http://127.0.0.1:${PORT}`;
  const all = [];
  try {
    for (const { name: viewportName, ...device } of viewports) {
      for (let sample = 1; sample <= SAMPLES; sample++) {
        const context = await browser.newContext({ ...device, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.__longtasks = [];
          new PerformanceObserver((list) => { window.__longtasks.push(...list.getEntries().map((e) => e.duration)); }).observe({ entryTypes: ['longtask'] });
        });
        await installProviderFixture(page);
        all.push(await measureScenario(page, viewportName, 'cold /map/', async () => {
          const coldStart = Date.now();
          await page.goto(`${baseURL}/map/`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('heading', { name: /Places worth|Little Rock/ }).first().waitFor();
          const archiveUsableMs = Date.now() - coldStart;
          const canvasStart = Date.now();
          await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 });
          return { archiveUsableMs, firstCanvasMs: Date.now() - canvasStart };
        }));
        all.push(await measureScenario(page, viewportName, 'warm /map/', async () => {
          await page.goto(`${baseURL}/map/`, { waitUntil: 'domcontentloaded' });
          await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 });
        }));
        all.push(await measureScenario(page, viewportName, 'direct trip link', async () => {
          await page.goto(`${baseURL}/map?trip=little-rock-creek-lake-mt-2024`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('slider').waitFor({ timeout: 30000 });
        }));
        all.push(await measureScenario(page, viewportName, 'select/revisit trip', async () => {
          await page.goto(`${baseURL}/map/`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('button', { name: /01 Beartown/ }).click();
          await page.getByRole('slider').waitFor({ timeout: 30000 });
          await page.getByRole('button', { name: '← All trips' }).click();
          await page.getByRole('button', { name: /01 Beartown/ }).click();
          await page.getByRole('slider').waitFor({ timeout: 30000 });
        }));
        all.push(await measureScenario(page, viewportName, 'lightbox navigate', async () => {
          await page.goto(`${baseURL}/map?trip=maine-august-2026`, { waitUntil: 'domcontentloaded' });
          const first = page.getByRole('button', { name: /Enlarge photo 1:/ });
          await first.waitFor({ timeout: 30000 });
          await first.click();
          const viewer = page.getByRole('dialog', { name: 'Enlarged photo viewer' });
          await viewer.waitFor();
          for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
          await page.keyboard.press('Escape');
        }));
        all.push(await measureScenario(page, viewportName, 'terrain + style transitions', async () => {
          await page.goto(`${baseURL}/map?trip=little-rock-creek-lake-mt-2024`, { waitUntil: 'domcontentloaded' });
          await page.locator('.maplibregl-canvas').waitFor({ timeout: 30000 });
          await page.getByRole('button', { name: /3D terrain/ }).click();
          await page.waitForTimeout(1500);
          await page.getByRole('button', { name: /3D terrain/ }).click();
          for (const style of ['Mono', 'Satellite', 'Topo']) {
            await page.getByRole('button', { name: style, exact: true }).click();
            await page.waitForTimeout(1200);
          }
        }));
        all.push(await measureScenario(page, viewportName, 'profile pointer sweep', async () => {
          await page.goto(`${baseURL}/map?trip=little-rock-creek-lake-mt-2024`, { waitUntil: 'domcontentloaded' });
          const svg = page.locator('.profile svg');
          await svg.waitFor({ timeout: 30000 });
          await svg.scrollIntoViewIfNeeded();
          const box = await svg.boundingBox();
          const sweepStart = Date.now();
          // Human-paced sweep with small settles between steps, mirroring
          // real pointer use. The sweep stays in the interior (5%..95%): a
          // readout-driven sub-pixel layout shift at the exact edge can
          // otherwise deliver a pointerleave that clears the marker.
          for (let i = 0; i <= 20; i++) {
            await page.mouse.move(box.x + box.width * (0.05 + (0.9 * i) / 20), box.y + box.height / 2, { steps: 4 });
            await page.waitForTimeout(50);
          }
          const sweepMs = Date.now() - sweepStart;
          await page.locator('.profile-marker').waitFor({ timeout: 10000 });
          return { sweepMs };
        }));
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(resultsDir, `baseline-${stamp}.json`), JSON.stringify({ assets, scenarios: all }, null, 2));

  const shellBytes = assets.filter((a) => a.role === 'archive-shell').reduce((n, a) => n + a.bytes, 0);
  const shellGzip = assets.filter((a) => a.role === 'archive-shell').reduce((n, a) => n + a.gzip, 0);
  const vendorBytes = assets.filter((a) => a.role === 'react-vendor').reduce((n, a) => n + a.bytes, 0);
  const vendorGzip = assets.filter((a) => a.role === 'react-vendor').reduce((n, a) => n + a.gzip, 0);
  const engineBytes = assets.filter((a) => a.role === 'map-engine' || a.role === 'maplibre-worker').reduce((n, a) => n + a.bytes, 0);
  const engineGzip = assets.filter((a) => a.role === 'map-engine' || a.role === 'maplibre-worker').reduce((n, a) => n + a.gzip, 0);
  console.log(`\n## Asset bytes (dist-perf/_astro, gzip of emitted files — not transfer sizes)`);
  console.log(`| chunk | raw | gzip |`);
  console.log(`| --- | ---: | ---: |`);
  for (const a of [...assets].sort((x, y) => y.bytes - x.bytes)) console.log(`| ${a.file} (${a.role}) | ${a.bytes} | ${a.gzip} |`);
  console.log(`\nArchive shell JS: ${shellBytes} raw / ${shellGzip} gzip. React vendor JS: ${vendorBytes} raw / ${vendorGzip} gzip. Map engine JS: ${engineBytes} raw / ${engineGzip} gzip.`);
  console.log(`Scenario request/byte counts include memory-cached bodies, so they overstate transfer; durations are local swiftshader estimates for relative comparison only.`);
  console.log(`\n## Scenario medians across ${SAMPLES} sample(s)`);
  console.log(`| scenario | duration ms (median, range) | long tasks | requests | bytes |`);
  console.log(`| --- | ---: | ---: | ---: | ---: |`);
  for (const kind of [...new Set(all.map((s) => s.kind))]) {
    for (const viewport of ['desktop', 'mobile']) {
      const rows = all.filter((s) => s.viewport === viewport && s.kind === kind);
      if (!rows.length) continue;
      const d = rows.map((r) => r.durationMs);
      console.log(`| ${viewport} ${kind} | ${median(d)} (${spread(d)}) | ${median(rows.map((r) => r.longtasks))} | ${median(rows.map((r) => r.requests))} | ${median(rows.map((r) => r.bytes))} |`);
    }
  }
  const cold = all.filter((s) => s.kind === 'cold /map/');
  for (const viewport of ['desktop', 'mobile']) {
    const rows = cold.filter((s) => s.viewport === viewport);
    if (!rows.length) continue;
    console.log(`| ${viewport} archive usable / first canvas | ${median(rows.map((r) => r.archiveUsableMs))} / ${median(rows.map((r) => r.firstCanvasMs))} | – | – | – |`);
  }
  console.log(`\nFull results: test-results/perf/baseline-${stamp}.json`);
}

main().catch((error) => { console.error(error); process.exit(1); });
