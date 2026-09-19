# Adding trip photos

Photo metadata is authored in `data/trip-photos.json`. The importer validates it and copies it into the selected trip’s generated detail JSON; the archive index remains small. Original GPX exports and generated files in `public/trips/` must not be edited.

Store image assets under `public/photos/<trip-id>/`. Filenames are only asset names: they never establish a trip, waypoint, or location association. Use stable, lowercase descriptive names such as `night-camp-lake-01.avif`; changing an authored photo `id` can break shared links.

For new exports, prefer AVIF or WebP and keep the original aspect ratio. A practical set is:

- Thumbnail: 480 px on the long edge, usually 30–100 KB.
- Display image: 1,600 px on the long edge, usually 150–500 KB.
- Optional large variant: 2,400 px on the long edge for high-density viewers.

JPEG is also supported. Record the intrinsic pixel `width` and `height` of the main `src`. Do not upscale small images. Write concise alt text describing what is visible; put the trip story or context in `caption`.

Find stable trip and waypoint IDs after a GPX import:

```sh
npm run import:gpx
node -e "const t=require('./public/trips/index.json').find(t=>t.id==='little-rock-creek-lake-mt-2024'); console.table(t.waypoints.map(({id,name})=>({id,name})))"
```

Waypoint IDs come from GPX source order (`wpt-1`, `wpt-2`, and so on), so review associations whenever Gaia reorders an export. Derived route endpoints also have IDs such as `derived-start`. A waypoint photo entry looks like this:

```json
{
  "schemaVersion": 1,
  "trips": {
    "little-rock-creek-lake-mt-2024": {
      "stops": [],
      "photos": [
        {
          "id": "little-rock-night-camp-01",
          "waypointId": "wpt-1",
          "src": "/photos/little-rock-creek-lake-mt-2024/night-camp-01.avif",
          "thumbnailSrc": "/photos/little-rock-creek-lake-mt-2024/night-camp-01-thumb.avif",
          "variants": [
            {"src": "/photos/little-rock-creek-lake-mt-2024/night-camp-01-1600.avif", "width": 1600, "height": 1067},
            {"src": "/photos/little-rock-creek-lake-mt-2024/night-camp-01-2400.avif", "width": 2400, "height": 1600}
          ],
          "width": 2400,
          "height": 1600,
          "alt": "Orange tent beside a still mountain lake at dusk",
          "caption": "Last light across the lake after setting camp.",
          "order": 1,
          "capturedAt": "2024-07-18",
          "credit": "Phil"
        }
      ]
    }
  }
}
```

`variants`, `thumbnailSrc`, `capturedAt`, and `credit` are optional. Each photo must have exactly one of `waypointId` or `stopId`. For a photographed place that is not an existing GPX waypoint, author the coordinates explicitly rather than inferring them from a filename or choosing the nearest waypoint:

```json
{
  "stops": [
    {
      "id": "creek-crossing",
      "name": "Creek crossing",
      "description": "Broad stepping stones just above the current.",
      "kind": "photo",
      "lon": -114.3065,
      "lat": 46.0342,
      "elevation": null,
      "time": null
    }
  ],
  "photos": [
    {
      "id": "little-rock-creek-crossing-01",
      "stopId": "creek-crossing",
      "src": "/photos/little-rock-creek-lake-mt-2024/creek-crossing-01.webp",
      "width": 1800,
      "height": 1200,
      "alt": "Stepping stones crossing a mountain creek",
      "caption": "The route crossed here above the faster water.",
      "order": 2
    }
  ]
}
```

Run `npm run import:gpx` after every manifest change. The import aborts before replacing output when it finds an unknown trip or waypoint, a duplicate photo/stop ID, a missing asset, an invalid coordinate, invalid dimensions, or ambiguous association. Then run `npm run check`, `npm test`, and `npm run build`.

The synthetic, clearly labeled interaction preview is available at `/photo-demo?trip=little-rock-creek-lake-mt-2024`. Its fixtures live under `public/demo/` and are not part of the normal `/map` archive.

## Maine AT 2026 import notes

`maine_at_photos.zip` contained 90 files. The imported set is the 86 unique photos captured August 5–11, 2026. One duplicate copy of `IMG_0048.JPG` and three older photos dated 2023/2024 were excluded. The source ZIP remains local and is ignored by Git; the site uses the optimized WebP assets in `public/photos/maine-august-2026/`.

Eighty photos had embedded GPS coordinates. Their markers use the recorded positions and combine photos only when every image remains within 75 meters of the marker. One recorded position is about 11.4 km from the route and is intentionally preserved instead of being moved onto the trail.

Six files had capture times but no GPS tags. Their temporary associations were owner-authorized using adjacent timestamps and visible landmarks:

- Photos 32–33 (`IMG_0050.JPG`, `IMG_9812.jpeg`): `wpt-5`, Campsite Night 3.
- Photo 43 (`IMG_9839.jpeg`): `maine-at-stop-030`, matching photos taken 27 seconds later.
- Photos 50–51 (`IMG_0051.JPG`, `IMG_9859.jpeg`): `wpt-6`, Night 4 shelter/campsite.
- Photo 56 (`IMG_3988.JPG`): `wpt-8`, Sugarloaf Summit, based on the visible ski lift.

The public labels and captions are intentionally temporary: `Maine AT photo 01` through `Maine AT photo 86`.

## Vermud 2021 import notes

`vermud-2021-photos.zip` contained 55 files. The imported set is the 32 unique still photos captured July 2–5, 2021. Twenty-two `.MOV` files and one `.MP4` file were excluded (the site has no video support), and no duplicates were found. The source ZIP remains local and is ignored by Git; the site uses the optimized WebP assets in `public/photos/vermud-2021/`.

Twenty-three photos had embedded GPS coordinates, all within 140 meters of the mapped route, and their markers use the recorded positions. Photos combine into one stop only when every image stays within 75 meters of the marker; the Stratton Pond evening and morning groups are about 170 meters apart, so they stay separate stops. One recorded position (photo 27) is about 137 meters off the route and is intentionally preserved instead of being moved onto the trail.

Eight files had capture times but no GPS tags, plus one shared image with neither. Their temporary associations were owner-authorized using adjacent timestamps and visible landmarks:

- Photos 04–06 (`IMG_5866.JPEG`, `IMG_5875.JPEG`, `IMG_5888.JPEG`, July 2 evening): `wpt-1`, Night 1 Goddard Shelter camp; photo 04 shows the Glastenbury Wilderness sign on the way in.
- Photo 07 (`IMG_5895.JPEG`, July 3 mid-morning): `wpt-1`, camp before hiking out.
- Photo 10 (`IMG_5921.JPEG`, July 3 afternoon): `wpt-2`, Night 2 Story Spring Shelter, reached by the 18:10 photos.
- Photo 13 (`IMG_5939.JPEG`, July 4 early morning): `wpt-2`, tent and shelter-cooking morning.
- Photo 16 (`IMG_5982.JPEG`, 13 minutes after photo 15): `vermud-stop-06`, same viewpoint.
- Photo 18 (`IMG_5995.JPEG`, 6 minutes before photo 19): `vermud-stop-08`, Stratton Pond evening camp.
- Photo 23 (`IMG_6020.JPEG`, between photos 22 and 25): `vermud-stop-09`, Stratton Pond morning.
- Photo 32 (`A2156062-….jpg`, no timestamp or GPS): `vermud-stop-09`; the misty pond-morning coffee scene matches the July 5 Stratton Pond group.

The public labels and captions are intentionally temporary: `Vermud photo 01` through `Vermud photo 32`.
