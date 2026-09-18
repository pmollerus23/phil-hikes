# GPX inventory

Imported 12 files. Counts below are source counts; derived endpoint markers are excluded from waypoints. Route segments include an empty route. Elevation/time counts refer to geometry points, not waypoints.

| Trip | Tracks | Routes | Track / route segments | Empty | Waypoints | Camps | Points | Elevation / time points |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| beartown-tyringham-solo-1-nighter-july-2026 | 0 | 2 | 0 / 2 | 0 | 3 | 1 | 3818 | 3818 / 3818 |
| dolly-sods-june-2023 | 0 | 1 | 0 / 1 | 0 | 5 | 3 | 1245 | 1245 / 1245 |
| dolly-sods-september-2025 | 0 | 1 | 0 / 1 | 0 | 1 | 1 | 446 | 446 / 446 |
| johnson-lake-loop-mt-2024 | 0 | 1 | 0 / 1 | 0 | 2 | 1 | 1250 | 1250 / 1250 |
| little-rock-creek-lake-mt-2024 | 0 | 1 | 0 / 1 | 0 | 1 | 1 | 769 | 769 / 769 |
| lspp-may-2025-canoe-trip | 0 | 2 | 0 / 2 | 0 | 3 | 3 | 1711 | 1711 / 1711 |
| maine-august-2026 | 0 | 9 | 0 / 9 | 1 | 10 | 6 | 7349 | 7349 / 7349 |
| mt-everret-jug-end-loop-2020 | 0 | 1 | 0 / 1 | 0 | 2 | 1 | 1438 | 1438 / 1438 |
| otter-creek-august-2025 | 0 | 1 | 0 / 1 | 0 | 3 | 2 | 677 | 677 / 677 |
| shenandoah | 0 | 1 | 0 / 1 | 0 | 3 | 2 | 2532 | 2532 / 2532 |
| vermont-june-2026 | 0 | 1 | 0 / 1 | 0 | 3 | 2 | 2294 | 2294 / 2294 |
| vermud-2021 | 0 | 1 | 0 / 1 | 0 | 3 | 3 | 2524 | 2524 / 2524 |

## Parsing and interpretation issues

### Beartown to Tyringham
- rte-1-s1: identical point timestamps; not travel timing
- rte-2-s1: identical point timestamps; not travel timing
- Multiple planned routes may overlap or be alternatives; totals are mapped geometry, not measured travel.
- Metadata note: First solo overnight. Two route plans are preserved; the first extends beyond the marked starting point. Combined route distance may exceed the actual trip.

### Dolly Sods · summer
- rte-1-s1: identical point timestamps; not travel timing

### Dolly Sods · fall
- rte-1-s1: identical point timestamps; not travel timing

### Johnson Lake loop
- rte-1-s1: identical point timestamps; not travel timing

### Little Rock Creek Lake
- rte-1-s1: identical point timestamps; not travel timing

### LSPP canoe trip
- rte-1-s1: identical point timestamps; not travel timing
- rte-2-s1: identical point timestamps; not travel timing
- Multiple planned routes may overlap or be alternatives; totals are mapped geometry, not measured travel.
- Metadata note: The supplied coordinates appear to be in Ontario, Canada, despite the US-only brief. Both portage and approximate fishing routes are preserved; their combined distance is not measured travel.

### Rangeley to Flagstaff
- rte-1-s1: identical point timestamps; not travel timing
- rte-2-s1: identical point timestamps; not travel timing
- rte-3-s1: identical point timestamps; not travel timing
- rte-4-s1: identical point timestamps; not travel timing
- rte-5-s1: identical point timestamps; not travel timing
- rte-6-s1: identical point timestamps; not travel timing
- rte-7-s1: identical point timestamps; not travel timing
- rte-8-s1: identical point timestamps; not travel timing
- rte-9: empty or single-point segment preserved; cannot draw a line
- Multiple planned routes may overlap or be alternatives; totals are mapped geometry, not measured travel.
- Metadata note: Summary and profile use the full Rangeley–Flagstaff itinerary to avoid adding overlapping day plans. All nine source routes remain available on the map, including one empty route. The description says August 3–13; exact traveled dates are unconfirmed.

### Mount Everett & Jug End
- rte-1-s1: identical point timestamps; not travel timing

### Otter Creek
- rte-1-s1: identical point timestamps; not travel timing

### Shenandoah
- rte-1-s1: identical point timestamps; not travel timing
- Trip date unavailable; route and waypoint creation times are not used as trip dates.

### Stratton & Bourne Ponds
- rte-1-s1: identical point timestamps; not travel timing

### Vermud · the Long Trail
- rte-1-s1: identical point timestamps; not travel timing

## Source format

All supplied exports use GPX 1.1 with creator GaiaGPS. There are no recorded tracks, track segments, metadata blocks, waypoint type tags, or Gaia object identifiers. Planned routes use rte/rtept. Names and descriptions are on routes and waypoints. Symbols include emoji-⛺, emoji-🗻, car-24, and bus; some waypoints have no symbol. Route extensions contain gpx_style/0/2 line/color values. All nonempty routes have elevations and a single repeated timestamp per route. Waypoints have timestamps but no elevation. Timestamp values often date to export day and must not imply trip dates. Filesystem modification times are not trip dates.

See public/trips/inventory.json for source SHA-256 hashes and machine-readable counts.