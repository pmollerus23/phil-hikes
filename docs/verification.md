# Verification — 2026-09-18

- `npm run import:gpx`: all 12 supplied files imported; 22 planned routes (one empty), 26,053 points, 39 original waypoints, 26 campsites.
- Independent Python ElementTree audit: geometry/elevation/timestamp/campsite counts match every source file; all SHA-256 hashes match the originals. No GPX files appear in `public/` or `dist/`.
- `npm run check`: zero TypeScript/Astro errors, warnings, or hints.
- `npm test` and expanded Node test output: 11 passing parser, preservation, calculation, reconciliation, profile, and URL cases across three test files.
- `npm run build`: passed. Vite reports the expected large map-only chunk. Built Home contains no script tags.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: 16 passing Chromium cases across desktop and mobile. Direct links, selection, history, clearing selection, unknown IDs, keyboard profile/list interaction, waypoint details, panel collapse/reopen, missing/invalid/empty data, detail retry, stale requests, and GPX serving denial checked.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:map`: 6 passing Chromium cases across desktop and mobile. Actual MapLibre renderer with intercepted local styles and flat DEM fixtures: initial bounds, stable canvas/camera, style swaps, route hits, waypoint markers, profile marker, terrain requests/toggle, provider error UI, and unsupported WebGL fallback checked.
- Desktop/mobile screenshots inspected; waypoint details moved to the top of the panel, mobile header compacted, and control clearance adjusted. Explicit Vite worker bundling fixes MapLibre 6 worker delivery.

No authorized MapTiler key was available. The test key is used only by intercepted local tests, never as a fallback in the application. Live Outdoor/Satellite maps, actual terrain elevation, provider attribution contents, and real provider style changes remain unverified. No public deployment was performed.

Data issues needing owner review are recorded in [the trip inventory](trip-inventory.md): Ontario coordinates for LSPP despite the US-only brief, overlapping/approximate plans, the empty Maine route, repeated creation timestamps, and the undated Shenandoah trip. No source-count discrepancies remain.
