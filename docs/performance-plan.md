# Performance implementation handoff

Audit date: September 20, 2026. Local `dev` HEAD: `8ced354`.

## Scope and evidence

Implement the following in priority order, preserving the repository's AGENTS.md behavior and data requirements. This is a plan, not an implementation. The audited working tree includes existing staged/unstaged changes to MapApp.tsx, MapCanvas.tsx, topoStyle.ts, and tests/topoStyle.test.ts. Preserve those changes, including Mono styling and the current terrain exaggeration. Do not reset, stash, overwrite, or commit someone else's work as part of this task. No PR, merge, push, or deployment is requested.

The production build passed. Local gzip measurements below describe emitted files, not observed production transfer sizes or interaction timings. Runtime request duplication and frame costs need the measurements in step 0.

| Current artifact/data | Raw bytes | Local gzip bytes |
| --- | ---: | ---: |
| MapApp JS, including the eager map engine | 1,128,057 | 301,110 |
| MapLibre worker JS | 508,485 | 143,867 |
| React client JS | 209,158 | 64,795 |
| Additional react-dom JS | 12,328 | 4,356 |
| Map CSS | 107,012 | 15,503 |
| Trip index | 100,973 | 31,546 |

Home's built HTML has zero script tags. The index has 12 trips, 2,403 preview coordinates, and 48 waypoints. The largest selected profile has 3,818 points. Photo collections now include Maine (86), Johnson Lake (57), and Vermud (32). There are 350 photo assets totaling 78.8 MB on disk; that is not a page-load download total. Existing thumbnail lazy loading is valuable and must remain.

## 0. Capture a repeatable production baseline

Use a production build and preview for performance measurement; the current Playwright configuration runs Astro dev servers. Add a separate opt-in production measurement configuration or script without disrupting the existing suites. Use the local fixture key and intercept all provider traffic; do not publish a fixture build or print the real key. Avoid competing builds into the same dist directory.

Measure cold and warm `/map/`, direct trip links, selecting/revisiting trips, opening and navigating a lightbox, terrain toggles, and Topo/Mono/Satellite transitions. Record resource requests/bytes, archive usable time, first usable map, long tasks, and a profile pointer-sweep trace. Run several samples under the same desktop/mobile viewport and CPU/network conditions; report medians and variability. Separate provider fixtures from any live-provider observation.

Add deterministic assertions for dependency boundaries and request behavior. Do not enforce fragile wall-clock thresholds in ordinary CI. Extend the provider fixture with a representative vector source/TileJSON and source-backed layers: the existing background-only style cannot expose real style/source reload costs.

## 1. Split MapCanvas from the archive interface — highest impact

Files: `src/features/map/MapApp.tsx`, `MapCanvas.tsx`, optionally a type-only map handle module; browser suites.

Problem: MapApp statically imports MapCanvas, which imports MapLibre, react-map-gl, worker setup, and engine CSS. The archive island must load/evaluate the heavy dependency graph even when the map cannot render.

Instructions:

1. Replace the runtime import with a module-scope React lazy import and a Suspense boundary enclosing only the map surface. Keep the archive, data fetches, and controls outside Suspense. Keep MapHandle imports type-only.
2. Keep worker URL setup and engine CSS inside the lazy module. Preserve Astro's `client:only="react"` mount and Home's zero-JS boundary. Do not preload the map engine on Home.
3. Start the lazy map load when a usable key and WebGL are available; do not add an artificial timeout or require a click. Provide an accessible loading status and retain the map error boundary for import failures.
4. Disable or queue imperative controls while the map is unavailable. Ensure a trip/place selected while loading is applied when the map becomes ready. Existing setTimeout callbacks can silently lose focus requests while the ref is null; use current declarative selection or a latest pending intent, and apply it after initial framing. Never replay obsolete selections.
5. Verify the archive shell has no static dependency on the engine chunk. Merely moving code into another eagerly imported chunk does not solve the problem.

Acceptance: delaying the engine response still allows archive loading, trip selection, details, and history navigation. Missing-key and unsupported-WebGL paths request no engine/worker. Import failure leaves the archive usable. Direct links and selections during loading eventually frame/focus correctly; profile hover never moves the camera. Home retains zero scripts. Report shell bytes separately from total map bytes: splitting primarily improves readiness, not total bytes for map users.

## 2. Replace the heading TTF with WOFF2 — small, safe asset win

Files: `src/layouts/Shell.astro`, `public/fonts/`, a reproducible conversion script if useful.

Convert the approximately 112 KB Barlow bold TTF to WOFF2; preserve its OFL license. Subset only after checking UI strings and all current authored titles/captions. Include curly punctuation, degree signs, accented place names, and a reasonable Latin repertoire for future content. Prefer full WOFF2 over an excessively narrow subset that silently loses glyphs. Record the conversion command/tool and resulting size. Update @font-face; retain `font-display: swap`, weight, family, and fallback behavior. Remove the unused TTF only after verifying references. If long-lived font caching is added, use a versioned/content-hashed filename.

Acceptance: screenshots of Home and map on desktop/mobile show no text clipping, missing glyphs, or changed flag widths/packing. The browser requests WOFF2 and no TTF. Target less than 40 KB, but report actual quality-preserving results rather than treating the target as guaranteed.

## 3. Make terrain initialization demand-driven — moderate lifecycle risk

Files: `MapCanvas.tsx`, relevant provider fixture tests.

Problem: `terrain-dem` is unconditionally mounted while terrain defaults to false. The map first mounts an empty style and then replaces it with the fetched style using `styleDiffing={false}`. That structure can repeat source initialization. The local Mono edits already share one Outdoor style fetch; retain that improvement.

Instructions:

1. Register the DEM source only after terrain is first requested. A simple safe approach is to retain it for the lifetime of that map after first activation and toggle terrain independently; fresh terrain-off sessions must not initialize it. If removing it on disable, call setTerrain(null) before removal and test rapid toggles.
2. Coordinate source creation and terrain attachment with style readiness and style replacement. Preserve pitch behavior and exaggeration. Clean up listeners and pending work on unmount; avoid an idle listener firing forever when a narrower lifecycle hook suffices.
3. Measure the initial empty-style replacement. Prefer preparing the initial provider style before constructing MapLibre if it removes duplicate work without harming time to useful map. Keep archive operation independent of style loading and preserve actionable error handling.
4. Evaluate style diffing as a separate measured change, particularly Topo↔Mono, which share sources. Do not simply flip the flag and assume Satellite, terrain, custom route layers, and event handlers survive. Keep full replacement where required for correctness.

Acceptance: zero DEM TileJSON/tile requests before first terrain activation; working terrain afterward, including during style loading and repeated switches. Routes, selected highlights, markers, attribution, camera, and click targets survive every mode. Count style, TileJSON, and tile requests separately with browser caching controlled. Claim fewer requests only when observed; fixture tests do not establish live provider correctness.

## 4. Remove repeated work from elevation hover

Files: `Profile.tsx`, `tests/profile.test.ts`, browser profile tests.

Problem: every pointermove linearly scans all profile points. Each changed index rerenders Profile and reconstructs every SVG path string with map/join/toFixed. React.memo does not prevent local-state renders. This is more work than the nearest-point scan alone.

Instructions:

1. Precompute immutable path strings with the profile model; memoize the static SVG geometry or isolate it from cursor/readout rendering.
2. Extract a nearest-x helper using lower-bound binary search on the monotonic x coordinates. Preserve existing earliest-point tie behavior, including duplicate distances/x values, segment gaps, and zero-distance paths.
3. Keep the latest pointer coordinates in a ref; do geometry reads, lookup, and update at most once per animation frame. Avoid state/marker updates when the chosen point is unchanged, while allowing re-entry to restore a previously cleared marker.
4. Cancel pending frames on pointerleave, pointercancel, unmount, and model replacement so a delayed callback cannot resurrect a marker. Keep keyboard/range input immediate and clamp/reset index when the data model changes.
5. Preserve full-resolution associations, missing-elevation gaps, segment boundaries, times, accessible readout, and reduced-motion behavior. Do not downsample source data to mask render work.

Acceptance: unit-test before/after endpoints, exact matches, equal-distance ties, duplicate x values, gaps, missing elevations, and single/empty input handling. Browser tests verify keyboard use, clearing without a late marker, re-entry, and a stationary camera. Compare a sweep of the 3,818-point profile before/after; path generation should not recur for each hover update.

## 5. Tune delivery policy, using Netlify's existing capabilities

Files: new `public/_headers` or equivalent project configuration, `Shell.astro`.

No `_headers` or netlify.toml was present in the inspected checkout. This does not prove the live deployment lacks custom settings. Inspect actual production responses before diagnosing delivery problems.

Netlify already provides edge caching and automatic Brotli compression. Do not add a compression server/plugin or manually serve .br files without evidence of a gap. See [Netlify compression](https://www.netlify.com/blog/2020/05/20/gain-instant-performance-boosts-as-brotli-comes-to-netlify-edge/), [caching](https://docs.netlify.com/build/caching/caching-overview/), and [custom headers](https://docs.netlify.com/manage/routing/headers/).

Set `Cache-Control: public, max-age=31536000, immutable` for content-hashed `/_astro/*` assets. For stable trip JSON URLs, use `public, max-age=0, must-revalidate` so browsers can reuse validated content without hiding updated imports. Do not apply immutable caching to stable photo/font/JSON names. Leave HTML revalidating. Add a map-page-only preconnect to `https://api.maptiler.com` when the map key is configured; do not put a key in the hint or add provider connections to Home.

Acceptance: generated headers exist in dist; after a separately authorized deployment, verify actual cache-control, content-encoding, and conditional request behavior. A local preview cannot establish Netlify header behavior. Do not claim deployment validation from configuration inspection alone.

## 6. Small follow-ups after the main changes

### A. Cache validated trip details within the mounted app

MapApp's detail effect refetches, reparses, and revalidates on every revisit. HTTP caching may avoid transfer but does not remove parsing/validation or the loading transition. Add a small bounded in-memory cache keyed by detail URL/id; store only successfully validated responses. Start with three entries, measure memory, and retain cancellation/stale-selection guards. Explicit retry bypasses/evicts the entry. Keep demo photo data separately scoped. Do not use persistent storage or prefetch every trip.

Acceptance: A→B→A reuses the validated A object within the session; a failed response is retryable; a slow A never replaces B; app reload sees updated data through normal revalidation.

### B. Make photo preloading consistent with responsive display

Photos.tsx's adjacent preloader always requests `next.src`, whereas the displayed image supports srcset/sizes. On variant-bearing photos this can download a different/larger asset than the one later displayed. Inspect current manifests first: the benefit depends on variants actually existing. Share resource-selection attributes between rendering and preloading, setting sizes/srcset before src. Use context-appropriate sizes for the narrow place panel and wider lightbox; account for contained portrait images. Deduplicate the same neighbor in two-photo collections. Keep preloading bounded to neighboring photos while the viewer is open; consider skipping speculative preload under Save-Data where supported.

Memoize sorted carousel photos and place lookups if traces show repeated work. Precompute photo counts by association in MapCanvas rather than filtering the entire photo list for every marker on zoom-driven renders. These are small optimizations, not justification for a gallery rewrite.

Acceptance: scrolling the carousel loads thumbnails, not full display assets. Opening/navigating the viewer requests appropriate responsive candidates without an unnecessary second fallback request. Test portrait/landscape containment, mobile/desktop sizes, focus restoration, keyboard navigation, and photo/place URL history.

### C. Only optimize map-movement bookkeeping if traces justify it

syncGroups runs on every move/resize, projects waypoints, reads multiple DOM rectangles, and packs flags. With 48 waypoints this is not yet a demonstrated bottleneck. If material in traces, coalesce work with requestAnimationFrame, read obstacles once per pass, and avoid repeated passes caused by groupedTrips dependency changes. Flush final positioning on moveend and clean up scheduled work. Cache obstacle rectangles only with correct invalidation for panel/control/error/viewport changes. Preserve above-only stacking, scale-aware packing, selection priority, and hidden flags near constrained edges. Avoid introducing one-frame lag without measuring it.

## Delivery and verification

Implement steps 1–5 as small reviewable changes, then choose step 6 items from measured benefit. Run `npm run check`, `npm test`, `npm run build`, `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`, and `CHROMIUM_PATH=/usr/bin/chromium npm run test:map`. Run the production measurements separately. Use existing meaningful test helpers; no tests that merely duplicate implementation code.

Preserve route-order photos, authored coordinates/associations, full-image containment, trip selection camera glides, wide selected panels, pixel-aligned crosshair guides, and all flag rules. Do not edit GPX or generated JSON manually. Do not regenerate trip assets unless the implementation actually changes their generator. Do not add vector tiling, server clustering, a service worker, persistent data caching, or broad dependency upgrades for this archive size. Keep the source ZIP excluded from deployment.

Deliver a concise before/after resource table, measured interaction results, desktop/mobile screenshots for visual changes, test results, and explicit remaining provider/deployment limitations. Update historical audit documentation only with new verified measurements, clearly distinguishing asset-size estimates from real network transfer.
