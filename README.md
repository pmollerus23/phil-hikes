# Phil’s field notes

An Astro portfolio shell with an isolated React/TypeScript hiking archive at `/map`. All 12 supplied Gaia exports are imported. Original GPX files remain unchanged in `gpx_map_data/`, outside `public/` and the build output. The development server also denies direct requests to that directory.

## Run locally

Use Node 22.12+ (verified on Node 26) and npm.

```sh
npm ci
cp .env.example .env
# Set PUBLIC_MAPTILER_KEY in .env, then:
npm run dev
```

Open http://localhost:4321/map. No key is necessary to browse trip summaries, notes, waypoints, or elevation profiles. The map shows setup instructions until configured; no fallback tile service is used. Restart the server after editing `.env` (`npx astro dev stop` first if it is running in the background).

```sh
npm run import:gpx    # regenerate static assets and inventory
npm run check         # Astro/React and importer/test TypeScript checks
npm test              # parser, reconciliation, profile, and URL tests
npm run build         # static site in dist/
npm run preview       # preview the production build
npx playwright install chromium
npm run test:browser  # desktop + mobile archive tests, no map key
npm run test:map      # actual MapLibre, using intercepted local provider fixtures
```

For system Chromium, prefix browser commands with `CHROMIUM_PATH=/usr/bin/chromium`. Browser tests start their own local Astro server; close an existing server with a real key before running the no-key suite. The fixture suite uses port 4332 and a test-only key; it intercepts provider requests and does not verify MapTiler. No public deployment is configured or performed.

## MapTiler

Set `PUBLIC_MAPTILER_KEY` to your **public browser key**. It is visible to visitors and included in the built JavaScript. Restrict the key to approved domains in the MapTiler dashboard, including localhost for development. Do not put a private token here. A static production build must be rebuilt when the key changes.

Outdoor uses `outdoor-v4`, Satellite uses `satellite`, and optional terrain uses the `terrain-rgb-v2` raster DEM with exaggeration 1. Default is 2D. Style switches retain the MapLibre instance, selection, camera, and trip sources. Provider attribution and the MapTiler logo remain visible. See [MapTiler styles](https://docs.maptiler.com/sdk-js/api-reference/variables/Externals.MAP_STYLE_CONFIG/) and [terrain sources](https://docs.maptiler.com/sdk-js/api/sources/).

## Import and add trips

1. Place an original Gaia `.gpx` export in `gpx_map_data/` (one file per trip).
2. Give it a permanent, descriptive filename. The normalized filename stem is the stable trip ID; changing a display title does not change links. Renaming a file does change its ID.
3. Optionally add an entry in `data/trip-overrides.json`, keyed by that ID.
4. Run `npm run import:gpx`, inspect `docs/trip-inventory.md`, then run tests and build.

The importer is deterministic, validates all files before replacing generated assets, and aborts on malformed XML/coordinates, invalid references, or ID collisions. Existing output is retained on input parsing failure. A missing input directory is an explicit error. The reconciliation test deliberately asserts the current 12-file baseline; update that baseline when deliberately adding new trips. Do not edit generated JSON by hand.

Example override (dates may retain month/year precision without inventing days):

```json
{
  "my-permanent-filename": {
    "title": "A better display title",
    "dates": { "label": "June 2026", "source": "Owner confirmation" },
    "region": "Vermont",
    "tags": ["backpacking"],
    "notes": "Optional trip notes.",
    "statsPathIds": ["rte-1"],
    "statsLabel": "Main itinerary",
    "waypoints": {
      "wpt-1": { "kind": "camp", "name": "Camp", "description": "Corrected note" }
    }
  }
}
```

Optional `dates.start`/`dates.end` use ISO date strings when known. Waypoint overrides also support `lat`/`lon` corrections. Path and waypoint IDs use their 1-based position within the source type (`rte-2`, `trk-1`, `wpt-3`); inspect a detail asset before making an override. Source reordering requires reviewing these references. Original symbols/types, point times, descriptions, extensions, and source files are retained; corrected presentation fields are applied only to generated assets.

## Format and assumptions

- Typed contracts: `src/features/map/model.ts`. Static index: `public/trips/index.json`. Each trip includes dates with provenance, bounds, statistics, overview GeoJSON, waypoints, optional notes/region/tags, and extension points for photos. Full detail is fetched from `/trips/<id>.json` only on selection.
- GPX 1.1 `trk/trkseg/trkpt` and `rte/rtept` are supported separately. Each track segment and each planned route is a distinct line. Empty/single-point segments remain in detail and the inventory but cannot form a line. No connection is drawn or measured between segments or routes.
- All supplied exports contain planned routes, not recorded tracks. `rte` does not imply that a route was actually traveled. There are no GPX metadata blocks or Gaia object IDs in these exports. Style extensions contain line colors. Parsed extension values are retained; namespace prefixes are normalized by the XML parser.
- Detail points explicitly pair longitude, latitude, elevation (meters or null), and original timestamp (or null). GeoJSON elevations are also preserved. These point records are the full-resolution profile source. Route and waypoint names, descriptions, symbols, types, and available extensions are retained. No elapsed time or speed is inferred from repeated route timestamps.
- Distance is a horizontal haversine sum using mean Earth radius 6,371,008.8 m, computed within each segment. Display rounds to tenths of a mile. It is mapped distance, not a GPS odometer or terrain-adjusted distance.
- Elevation gain sums positive consecutive elevation differences **without smoothing** and without crossing segment boundaries. This can overestimate ascent in noisy or planned data. Any incomplete segment elevation, or absence of a usable pair, yields unavailable gain (`null`), distinct from flat terrain (`0`). Display rounds to tens of feet. Missing elevations break the profile stroke.
- Summary paths default to recorded tracks if present, otherwise planned routes. Overrides can choose an ordered subset for statistics/profile without deleting alternative geometry. Maine uses its full itinerary (`rte-2`), avoiding duplicate totals from day routes. Beartown and LSPP still have potentially overlapping/approximate plans and are explicitly labeled.
- Preview geometry keeps every Nth point, plus endpoints, to approximately 201 vertices per segment. Bounds and statistics always use full points. Selected profiles preserve every point, use cumulative within-segment distance, and add small visual gaps between segments. The slider identifies the exact segment/point; missing elevations and times stay null.
- Explicit start/end names and clearly worded descriptions take precedence over symbols. Recognized Gaia tent/mountain/car/bus symbols map to distinct icons; unknown symbols use a generic diamond and produce a warning. Missing endpoints derive from the first/last summary geometry in file/override order; they are marked as derived, not asserted travel direction.
- Dates use reliable filename year/month or explicit metadata overrides. Filesystem modification dates and route/waypoint creation times are not trip dates. Shenandoah remains undated.

## Interface and boundaries

Shared 48px Astro navigation, `/` home, browser-only React island at `/map`, keyboard-accessible trip list, collapsible desktop panel/mobile bottom sheet, selectable camps/waypoints, full-resolution profile with pointer/touch/keyboard interaction, Outdoor/Satellite styles, optional terrain, archive reset, and `/map?trip=<id>` links with browser back/forward support. No React router; Astro owns page navigation. Home includes no map/React script payload.

Map state is uncontrolled during camera movement. Geometry is rendered in layers; only the small number of waypoints use HTML markers. Profile movement updates a local profile component and an imperative map marker, not the entire interface. Fetches are validated and aborted on selection change/unmount; map listeners and profile markers are cleaned up. Missing/invalid files, empty archives, failed requests, provider errors, unsupported WebGL, and missing configuration have visible fallback states.

Deferred: playback, galleries, advanced filtering, uploads/editing, accounts, private collections, synchronization, offline maps, and a geospatial backend. Large archives would benefit from geometry tiling and waypoint clustering. MapLibre remains a sizable map-only JavaScript chunk; it is not sent to Home.

## Inventory and verification

[Generated inventory for all 12 trips](docs/trip-inventory.md) includes source counts, elevation/time availability, warnings, and metadata notes. Machine-readable inventory and source SHA-256 hashes are in `public/trips/inventory.json`.

Baseline: **12 trips, 0 tracks, 22 routes (one empty), 26,053 geometry points, 39 source waypoints, 26 campsites**. Every geometry point has elevation and a timestamp, but each nonempty route repeats one timestamp. Counts reconcile exactly with independently inspected XML. LSPP coordinates appear to be in Ontario, contrary to the original US-only description; they are preserved and flagged for owner review. Beartown’s plan extends beyond its marked start; Maine has overlapping day plans and an empty ninth route. Shenandoah has no reliable trip date.

Build/type checks and automated parser/URL/profile/reconciliation tests are required. Browser suites cover desktop/mobile direct links, history, selection, profile slider, waypoint details, collapse/reopen, and error states. Renderer tests use local fixtures only. **No live MapTiler key was available during implementation:** real Outdoor/Satellite tiles, provider attribution content, terrain elevation accuracy, and live provider style behavior still need checking with an authorized key. The local fixtures do not replace those checks.

[Implementation verification results](docs/verification.md): build and type checks passed; 11 unit cases, 16 archive browser cases, and 6 fixture-renderer browser cases passed. Desktop and mobile screenshots were inspected.
