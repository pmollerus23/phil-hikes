# Repository Guidelines

## Project Structure & Architecture

- `src/pages/` owns Astro routes; `src/layouts/Shell.astro` provides shared navigation.
- `src/features/map/` contains the isolated React/TypeScript application, typed data model, MapLibre renderer, profiles, URL helpers, and styles. Mount it with `client:only="react"`; keep map dependencies off Home. Astro owns navigation; React owns map selection.
- `scripts/` parses GPX, validates authored photo metadata, and generates `public/trips/` assets and `docs/trip-inventory.md`.
- `gpx_map_data/` holds original exports; `data/trip-overrides.json` holds presentation corrections; `data/trip-photos.json` holds authored photo, caption, and place associations.
- `public/photos/` holds web-ready trip images. Keep originals and source archives out of generated trip data; follow `docs/photos.md` when importing or associating photos.
- `tests/*.test.ts` contains unit tests; `tests/browser/` and `tests/map-browser/` contain Playwright suites. Local terrain fixtures live in `tests/fixtures/`.

## Build, Test, and Development Commands

Use Node 22.12+ and install dependencies with `npm ci`.

- `npm run dev`: start Astro at localhost:4321; `npx astro dev stop` stops a background server.
- `npm run import:gpx`: regenerate trip assets and inventory.
- `npm run check`: check Astro and TypeScript, including importer/tests.
- `npm test`: run Node tests through the `tsx` loader.
- `npm run test:browser`: run desktop/mobile archive tests without a key.
- `npm run test:map`: exercise MapLibre using intercepted provider fixtures.
- `npm run build` / `npm run preview`: build and preview the static site.

Install Chromium with `npx playwright install chromium`, or set `CHROMIUM_PATH=/usr/bin/chromium`.

## Coding Style & Naming

Use TypeScript, ES modules, single-quoted JavaScript strings, and semicolons. Prefer two-space indentation for new multiline code; preserve surrounding formatting without unrelated rewrites. Use PascalCase component filenames and camelCase functions/variables. No formatter or ESLint configuration currently exists.

## Testing Guidelines

Name unit tests `*.test.ts` and browser tests `*.spec.ts`. Run checks, unit tests, and build before submitting code changes; run relevant browser suites for interface changes. Cover segment boundaries, missing values, stable IDs, URL history, stale requests, and photo associations when applicable. Photo viewer tests must include portrait and landscape assets and confirm the full image remains contained without cropping. No coverage percentage is enforced. Fixture tests do not establish live MapTiler correctness.

## Data & Configuration

Never edit original GPX files or generated JSON manually. Apply corrections through overrides and rerun the importer. Filename stems define stable trip IDs. Review inventory warnings and update reconciliation baselines when adding trips. Keep `.env` untracked; configure `PUBLIC_MAPTILER_KEY` using `.env.example` and restrict its approved domains.

Photo metadata is authored in `data/trip-photos.json` and merged into trip detail JSON by `npm run import:gpx`; do not hand-edit the generated copy in `public/trips/`. Keep photo IDs stable. Associate each photo with exactly one existing waypoint ID or an explicitly authored photo stop. Do not infer a location from a filename or silently snap a photo to the nearest route or waypoint. Store web-ready thumbnails and display images under `public/photos/<trip-id>/`, preserve their aspect ratios, reserve their intrinsic dimensions, and load full-size images only when requested. Expanded photos must use contained sizing so portrait and landscape images remain completely visible. See `docs/photos.md` for the manifest schema, asset guidance, validation behavior, and current Maine AT provenance.

Gaia export caveat (owner-confirmed): Removing elements from Gaia folders archives them rather than fully deleting them. Folder GPX exports can still contain archived or obsolete routes. Do not assume every exported route should appear on the site. Compare route names and geometry with the owner's intended trip, exclude obsolete routes using `pathIds` in `data/trip-overrides.json`, and rerun the importer to regenerate downstream assets. Path IDs depend on source order, so review `pathIds` and `statsPathIds` whenever an export is reordered.

For LSPP, publish only the updated portage route. Its fishing route and older portage version are obsolete even if they remain in the export. Preserve waypoint and campsite notes unless the owner asks to remove them.

For Maine AT 2026, the current gallery contains 86 unique photos from August 5–11, 2026. Preserve recorded EXIF positions, including the documented off-route coordinate; do not move photos onto the trail for visual convenience. Six photos without GPS have owner-approved temporary associations documented in `docs/photos.md`. Their public names and captions remain temporary until the owner supplies final text. The root `maine_at_photos.zip` is a local source archive, is ignored by Git, and must not be served by the site.

## Future Optimization Goal

Preserve the current lazy trip-detail loading and thinned archive previews. When doing a performance pass, prioritize these measured opportunities in order:

1. Dynamically import `MapCanvas`/MapLibre inside the existing client-only map island so the archive interface can become interactive before the map engine finishes loading.
2. Convert and subset the 112 KB Barlow TTF to WOFF2.
3. Register the terrain source only when terrain is enabled and avoid duplicate TileJSON/style initialization.
4. Throttle elevation-profile pointer updates with `requestAnimationFrame` and replace the linear nearest-point scan with binary search. Current profiles contain as many as 3,818 points.
5. Add production compression, immutable caching for hashed `_astro` assets, appropriate revalidation for trip JSON, and a MapTiler preconnect when deployment is configured.
6. Throttle waypoint grouping during map movement if the archive grows substantially.

Audit baseline from September 2026: Home ships no client JavaScript. The map’s first-party production load was about 669 KB compressed with provider responses mocked, including about 509 KB of JavaScript, a 31.6 KB trip index, and the 112 KB font. The index contained 12 trips, 2,403 preview coordinates, and 48 waypoints. Do not add vector tiling or server-side clustering at this scale without new evidence.

## Commits & Pull Requests

There are no commits yet, so no historical convention exists. Use concise imperative subjects, such as `Fix segment-aware elevation interaction`. Describe the behavior change, validation, relevant issues, and unresolved data/provider limitations. Include desktop/mobile screenshots for visual changes.
