import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Local deterministic provider fixtures. These tests do NOT validate MapTiler services.
test.beforeEach(async({page})=>{
 await page.route('https://api.maptiler.com/**',async r=>{
  const url=r.request().url();
  if(url.includes('/resources/'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><text y="15">Test map</text></svg>'});
  if(url.includes('/maps/'))return r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':url.includes('satellite')?'#263a37':'#e7eddc'}}]}});
  if(url.includes('tiles.json'))return r.fulfill({json:{tilejson:'3.0.0',tiles:['https://api.maptiler.com/fixture/{z}/{x}/{y}.png'],minzoom:0,maxzoom:14,attribution:'Local test fixture'}});
  return r.fulfill({path:'tests/fixtures/flat-dem.png',contentType:'image/png'});
 });
});

async function tapEmptyMap(page: Page, box: {x:number;y:number;width:number;height:number}, isMobile: boolean) {
  // Flag layout keeps arranging while the map settles, so a grid point that
  // was empty can be stale by tap time. Re-verify immediately before tapping
  // and never tap a known-stale point.
  for(let attempt=0;attempt<10;attempt++){
    const point=await page.evaluate(({x,y,width,height})=>{
      for(let localY=70;localY<height-70;localY+=30)for(let localX=30;localX<width-30;localX+=30){
        if(document.elementFromPoint(x+localX,y+localY)?.classList.contains('maplibregl-canvas'))return {x:x+localX,y:y+localY};
      }
      return null;
    },box);
    expect(point).not.toBeNull();
    const fresh=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('maplibregl-canvas')??false,point!);
    if(!fresh&&attempt<9)continue;
    if(isMobile)await page.touchscreen.tap(point!.x,point!.y);
    else await page.mouse.click(point!.x,point!.y);
    return;
  }
}
async function expectTripLabelsNotToOverlap(page: Page) { await expect.poll(async()=>{
  const boxes=await page.locator('.trip-marker-surface').evaluateAll(elements=>{
   const map=document.querySelector('.maplibregl-map')!.getBoundingClientRect();
   return elements.filter(element=>(element.parentElement as HTMLElement)?.dataset.hidden!=='true').map(element=>{
    const {x,y,width,height}=element.getBoundingClientRect();return {x,y,width,height,label:element.textContent?.trim()??'',offset:(element.parentElement as HTMLElement)?.dataset.offset??''};
   }).filter(box=>box.x<map.right&&box.x+box.width>map.left&&box.y<map.bottom&&box.y+box.height>map.top);
  });
  const overlaps:string[]=[];
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i],b=boxes[j];
   if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)overlaps.push(`${a.label} (${a.offset}; ${Math.round(a.x)},${Math.round(a.y)}) / ${b.label} (${b.offset}; ${Math.round(b.x)},${Math.round(b.y)})`);
  }
  return overlaps;
 }).toEqual([]);
}
test('regenerating trip assets keeps them available on the running dev server',async({request})=>{
  test.skip(test.info().project.name!=='desktop','Run the importer once to avoid concurrent writes.');
  const files=['index.json','inventory.json','lspp-may-2025-canoe-trip.json'];
  for(const file of files)expect((await request.get(`/trips/${file}`)).status()).toBe(200);
  await promisify(execFile)(process.execPath,['--import','tsx','scripts/import-gpx.ts']);
  for(const file of files)expect((await request.get(`/trips/${file}`)).status()).toBe(200);
  const detail=await (await request.get('/trips/lspp-may-2025-canoe-trip.json')).json();
  expect(detail.paths.map((path:{id:string})=>path.id)).toEqual(['rte-3']);
});
test('Maine shows one continuous route, a photo carousel, and trip info on demand',async({page,isMobile})=>{
  const inventory=await (await page.request.get('/trips/index.json')).json();
  await page.route('**/trips/index.json',route=>route.fulfill({json:inventory.filter((trip:{id:string})=>trip.id==='maine-august-2026')}));
  await page.goto('/map?trip=maine-august-2026');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const carousel=page.getByRole('list',{name:'Trip photos in route order'});
  await expect(carousel).toBeVisible();
  await expect(carousel.locator('.carousel-item')).toHaveCount(86);
  await expect(carousel.locator('.carousel-item').first().locator('img')).toHaveAttribute('src','/photos/maine-august-2026/maine-at-photo-001-thumb.webp');
  const footer=page.locator('.trip-footer');
  await expect(footer).toContainText('Rangeley to Flagstaff');
  await expect(footer).toContainText('August 2026');
  await expect(footer).toContainText('86 photos');
  const first=carousel.getByRole('button',{name:/Enlarge photo 1:/});
  const firstCaption=carousel.locator('.carousel-item').first().locator('.carousel-caption');
  if(!isMobile)await first.hover();
  await expect.poll(()=>firstCaption.evaluate(element=>getComputedStyle(element).opacity)).toBe('1');
  await expect(firstCaption).toContainText('Maine AT photo 01');
  await first.click();
  await expect(page.getByRole('dialog',{name:'Enlarged photo viewer'})).toContainText('TRIP COLLECTION · 01 / 86');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'ⓘ Trip info'}).click();
  await expect(page.getByRole('slider')).toHaveAttribute('max','3440');
  await expect(page.locator('.trip-stats')).toContainText('61.5 mi');
  await expect(page.locator('.waypoint-marker:not(.photo-stop-marker)')).toHaveCount(10);
  await expect(page.locator('.waypoint-marker[aria-label*="Campsite Night 3"][aria-label*="2 photos"]')).toBeVisible();
  await expect(page.locator('.waypoint-marker[aria-label*="Night 4"][aria-label*="2 photos"]')).toBeVisible();
  await expect(page.locator('.waypoint-marker[aria-label*="Sugarloaf Summit"][aria-label*="1 photo"]')).toBeVisible();
  const source=page.getByText('Source geometry · 1 path',{exact:true});await source.click();
  await expect(source.locator('..')).toContainText('Maine AT Section Route');
  await expect(source.locator('..')).not.toContainText('Day 1');
  await page.getByRole('button',{name:/Sugarloaf Summit.*summit/}).click();
  await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Cool summit.');
  await page.getByRole('button',{name:'← Photos'}).click();
  await expect(carousel).toBeVisible();
  await expect(carousel.locator('.carousel-item[data-active="true"]')).toHaveCount(1);
  await page.screenshot({path:`test-results/maine-continuous-route-${test.info().project.name}.png`,fullPage:true});
});
test('updated trips render their current routes, profiles, and waypoint notes',async({page})=>{
  const cases=[
    {id:'dolly-sods-june-2023',max:'1244',waypoints:5,paths:1,waypoint:/Camp Night 3.*camp/,note:'exploding river rock'},
    {id:'johnson-lake-loop-mt-2024',max:'1295',waypoints:2,paths:1,waypoint:/Night Campsite.*camp/,note:'Beautiful lakeside view',photos:57},
    {id:'lspp-may-2025-canoe-trip',max:'926',waypoints:6,paths:1,waypoint:/Base Camp.*camp/,note:'Ranger Cabin'},
  ];
  for(const trip of cases){
    await page.goto(`/map?trip=${trip.id}`);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    if(trip.photos){
      await expect(page.getByRole('list',{name:'Trip photos in route order'}).locator('.carousel-item')).toHaveCount(trip.photos);
      await page.getByRole('button',{name:'ⓘ Trip info'}).click();
    }
    await expect(page.getByRole('slider')).toHaveAttribute('max',trip.max);
    await expect(page.locator('.waypoint-marker:not(.photo-stop-marker)')).toHaveCount(trip.waypoints);
    await expect(page.getByText(`Source geometry · ${trip.paths} path`,{exact:false})).toBeVisible();
    if(trip.id==='lspp-may-2025-canoe-trip'){
      await expect(page.locator('.trip-stats')).toContainText('12.1 mi');
      await expect(page.locator('.data-notes').first()).not.toContainText('Fishing Route');
    }
    await page.getByRole('button',{name:trip.waypoint}).click();
    await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText(trip.note);
    await page.screenshot({path:`test-results/updated-${trip.id}-${test.info().project.name}.png`,fullPage:true});
  }
});
test('real MapLibre canvas, overlays, style switch, terrain control, and profile marker survive UI changes',async({page})=>{
  let demRequests=0,terrainTileJson=0;page.on('request',r=>{if(r.url().includes('/fixture/'))demRequests++;if(r.url().includes('terrain-rgb'))terrainTileJson++;});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();await expect(page.getByRole('slider')).toBeVisible();await expect(page.locator('.waypoint-marker')).toHaveCount(3);
  // The DEM source stays unmounted until terrain is first requested.
  expect(terrainTileJson).toBe(0);
 await expect.poll(async()=>{const a=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();const b=await page.getByRole('button',{name:/Start of mapped geometry · Little Rock/}).boundingBox();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}).toBeGreaterThan(60);
 const before=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();
 const canvas=await page.locator('.maplibregl-canvas').elementHandle();
 const slider=page.getByRole('slider');await slider.focus();await page.keyboard.press('ArrowRight');await expect(page.locator('.profile-marker')).toBeVisible();
 await page.getByRole('button',{name:'Satellite',exact:true}).click();await expect(page.getByRole('button',{name:'Satellite',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 const after=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();expect(Math.abs(before!.x-after!.x)).toBeLessThan(2);expect(Math.abs(before!.y-after!.y)).toBeLessThan(2);
 expect(await canvas?.evaluate(el=>el===document.querySelector('.maplibregl-canvas'))).toBe(true);
  await page.getByRole('button',{name:/3D terrain/}).click();await expect(page.getByRole('button',{name:/3D terrain/})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>terrainTileJson).toBeGreaterThan(0);await expect.poll(()=>demRequests).toBeGreaterThan(0);await page.getByRole('button',{name:/3D terrain/}).click();
 await page.getByRole('button',{name:'Topo',exact:true}).click();await expect(page.getByRole('heading',{name:'Little Rock Creek Lake',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Night campsite · Little Rock/}).click();await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Night campsite');
 await page.screenshot({path:`test-results/fixture-map-${test.info().project.name}.png`,fullPage:true});expect(errors).toEqual([]);
});
test('elevation hover follows the pointer, clears without a late marker, and never moves the camera',async({page,isMobile})=>{
  test.skip(!!isMobile,'Hover is desktop-only; the slider path is covered elsewhere.');
  await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
  const slider=page.getByRole('slider');
  await expect(slider).toBeVisible();
  const svg=page.locator('.profile svg');
  await expect(svg).toBeVisible();
  const anchor=page.getByRole('button',{name:/Night campsite · Little Rock/});
  // The engine chunk loads lazily: wait for initial framing before treating
  // any marker position as the camera-stationary baseline.
  await expect(page.locator('.map-loading')).toHaveCount(0);
  // The trip framing can still be settling when the detail panel appears, so
  // wait for a stationary marker before treating its position as the baseline.
  let center=await anchor.boundingBox();
  for(let i=0;i<10;i++){
    await page.waitForTimeout(400);
    const next=await anchor.boundingBox();
    if(next&&center&&Math.abs(next.x-center.x)<1&&Math.abs(next.y-center.y)<1){center=next;break;}
    center=next;
  }
  const box=(await svg.boundingBox())!;
  const sweep=async(fraction:number)=>{await page.mouse.move(box.x+box.width*fraction,box.y+box.height/2,{steps:5});};
  await sweep(0.2);
  await expect(page.locator('.profile-marker')).toBeVisible();
  const readout=page.locator('.profile-readout');
  const first=await readout.textContent();
  await sweep(0.8);
  await expect.poll(()=>readout.textContent()).not.toBe(first);
  const settled=await anchor.boundingBox();
  expect(Math.abs(settled!.x-center!.x)).toBeLessThan(2);
  expect(Math.abs(settled!.y-center!.y)).toBeLessThan(2);
  await page.mouse.move(box.x+box.width/2,box.y-60);
  await expect(page.locator('.profile-marker')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator('.profile-marker')).toHaveCount(0);
  await sweep(0.8);
  await expect(page.locator('.profile-marker')).toBeVisible();
  const returned=await anchor.boundingBox();
  expect(Math.abs(returned!.x-center!.x)).toBeLessThan(2);
  expect(Math.abs(returned!.y-center!.y)).toBeLessThan(2);
});
test('map route can be selected, and provider failure has an actionable message',async({page})=>{
 await page.goto('/map?trip=little-rock-creek-lake-mt-2024');await expect(page.locator('.waypoint-marker')).not.toHaveCount(0);
 const start=page.getByRole('button',{name:'Start of mapped geometry · Little Rock Creek Lake'});await expect(start).toBeVisible();
 // Marker anchor is an actual route vertex. Remove marker hit targets to exercise the line layer underneath.
 await page.locator('.panel-toggle').click();await page.getByRole('button',{name:'Satellite',exact:true}).click();await page.getByRole('button',{name:'Topo',exact:true}).click();await page.waitForTimeout(800);
 const box=await start.boundingBox();expect(box).not.toBeNull();await page.addStyleTag({content:'.waypoint-marker{visibility:hidden}'});await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
 await expect(page).toHaveURL(/trip=little-rock-creek/);
 await page.route('**/maps/satellite/style.json*',r=>r.fulfill({status:403,body:'Test denied'}));await page.getByRole('button',{name:'Satellite',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Map tiles could not load');
});
test('archive stays usable when the map engine import fails',async({page})=>{
  await page.route(/MapCanvas/,route=>route.abort());
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
  await expect(page.getByText('Map rendering is unavailable')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Little Rock Creek Lake',exact:true})).toBeVisible();
  await expect(page.getByRole('slider')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'← All trips',exact:true}).click();
  await expect(page).not.toHaveURL(/trip=/);
  await expect(page.getByRole('heading',{name:/Places worth/})).toBeVisible();
  expect(errors).toEqual([]);
});

test('a place selected while the engine loads is applied once ready',async({page})=>{
  await page.route(/MapCanvas/,async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/photo-demo?trip=little-rock-creek-lake-mt-2024');
  // The archive shell works before the engine chunk arrives.
  const carousel=page.getByRole('list',{name:'Trip photos in route order'});
  await expect(carousel.locator('.carousel-item')).toHaveCount(3);
  await page.getByRole('button',{name:'ⓘ Trip info'}).click();
  await page.getByRole('button',{name:/Night campsite.*2 photos/}).click();
  await expect(page).toHaveURL(/place=wpt-1/);
  await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Night campsite');
  // The delayed engine still mounts and honors the pending selection.
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.waypoint-marker.place-selected')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('unsupported WebGL retains the trip archive',async({page})=>{
  const engineRequests:string[]=[];page.on('request',request=>{if(/MapCanvas|maplibre/i.test(request.url()))engineRequests.push(request.url());});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:any[]){if(type==='webgl2')return null;return original.apply(this,[type,...args] as any);} as typeof original;});
  await page.goto('/map?trip=shenandoah');await expect(page.getByText('This browser cannot render WebGL maps.',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Shenandoah',exact:true})).toBeVisible();await expect(page.getByRole('slider')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  // Without WebGL the engine chunk and worker are never requested.
  expect(engineRequests).toEqual([]);
});

test('photo places stay synchronized between map markers, carousel, and detail',async({page})=>{
 await page.goto('/photo-demo?trip=little-rock-creek-lake-mt-2024');
 await expect(page.locator('.maplibregl-canvas')).toBeVisible();await expect(page.locator('.waypoint-marker')).toHaveCount(4);await expect(page.locator('.marker-photo-count')).toHaveCount(2);
 const carousel=page.getByRole('list',{name:'Trip photos in route order'});
 await expect(carousel.locator('.carousel-item')).toHaveCount(3);
 await expect(page.locator('.trip-footer')).toContainText('Little Rock Creek Lake');
 await carousel.getByRole('button',{name:/Jump to Night campsite on the map/}).first().click();
 await expect(page).toHaveURL(/place=wpt-1/);
 await expect(carousel.locator('.carousel-item[data-active="true"]')).toHaveCount(2);
 await page.locator('.panel-toggle').click();
 const camp=page.getByRole('button',{name:/Night campsite · Little Rock Creek Lake · 2 photos/});await camp.click({force:true});await expect(camp).toHaveClass(/place-selected/);await expect(page).toHaveURL(/place=wpt-1/);
 await expect(carousel.locator('.carousel-item')).toHaveCount(3);
 await carousel.getByRole('button',{name:/Enlarge photo 1/}).click();await expect(page.getByRole('dialog',{name:'Enlarged photo viewer'})).toContainText('TRIP COLLECTION · 01 / 03');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 const stop=page.getByRole('button',{name:/Creek crossing · photo stop/});await expect(stop).toHaveClass(/place-selected/);await expect(page.getByRole('dialog',{name:'Enlarged photo viewer'})).toContainText('Creek crossing');await expect(page).toHaveURL(/place=creek-crossing.*photo=demo-creek-crossing/);await page.keyboard.press('Escape');await expect(carousel).toBeVisible();
 await page.getByRole('button',{name:'ⓘ Trip info'}).click();
 const backToTrip=page.getByRole('button',{name:'← Back to trip'});
 if(await backToTrip.count()>0)await backToTrip.click();
 await page.locator('.waypoint-list button',{hasText:'Night campsite'}).click();await expect(page).toHaveURL(/place=wpt-1/);
 await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Last light settled');
 await page.screenshot({path:`test-results/photo-map-sync-${test.info().project.name}.png`,fullPage:true});
});

test('selecting a waypoint glides the map to it', async ({ page, isMobile }) => {
  // The drag-to-displace setup deselects the trip on touch viewports, so this
  // camera assertion runs on desktop; the focus path itself is shared.
  test.skip(!!isMobile, 'Touch drag setup deselects the trip; desktop covers the shared focus path.');
  await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
  const camp = page.getByRole('button', { name: /Night campsite · Little Rock/ });
  await expect(camp).toBeVisible();
  const canvas = page.locator('.maplibregl-canvas');
  const bounds = (await canvas.boundingBox())!;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const markerCenter = async () => {
    const box = await camp.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  const inSafeView = (point: { x: number; y: number } | null) => !!point
    && point.x > 70 && point.x < bounds.width - 70 && point.y > 80 && point.y < bounds.height - 70;
  // Nudge the marker toward the canvas center: it stays onscreen (where the
  // old camera code would not move at all) but leaves its framed position.
  // Synthetic drags occasionally land a stray empty-map click that drops the
  // trip selection, so reset and retry the setup until it sticks.
  let nudged: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
    await expect(camp).toBeVisible();
    const freshBounds = (await canvas.boundingBox())!;
    const freshCenter = { x: freshBounds.x + freshBounds.width / 2, y: freshBounds.y + freshBounds.height / 2 };
    const fresh = (await markerCenter())!;
    const dragX = fresh.x < freshCenter.x ? 150 : -150;
    const empty = await page.evaluate(({ x, y, width, height }) => {
      for (let localY = 120; localY < height - 120; localY += 40) for (let localX = 120; localX < width - 120; localX += 40) {
        if (document.elementFromPoint(x + localX, y + localY)?.classList.contains('maplibregl-canvas')) return { x: x + localX, y: y + localY };
      }
      return null;
    }, { x: freshBounds.x, y: freshBounds.y, width: freshBounds.width, height: freshBounds.height });
    expect(empty).not.toBeNull();
    await page.mouse.move(empty!.x, empty!.y);
    await page.mouse.down();
    await page.mouse.move(empty!.x + dragX, empty!.y, { steps: 12 });
    await page.mouse.up();
    const candidate = (await markerCenter())!;
    const stillSelected = page.url().includes('trip=little-rock');
    if (stillSelected && Math.hypot(candidate.x - fresh.x, candidate.y - fresh.y) > 100 && inSafeView(candidate)) {
      nudged = candidate;
      break;
    }
  }
  expect(nudged).not.toBeNull();
  await page.locator('.waypoint-list button', { hasText: 'Night campsite' }).click();
  await expect(page.getByRole('region', { name: 'Waypoint details' })).toContainText('Night campsite');
  // The selection glides the marker to the unobstructed focus target.
  const target = isMobile
    ? { x: center.x, y: center.y - bounds.height * 0.18 }
    : { x: center.x + 170, y: center.y };
  await expect.poll(async () => {
    const point = await markerCenter();
    return point ? Math.hypot(point.x - target.x, point.y - target.y) : Number.POSITIVE_INFINITY;
  }, { timeout: 8000 }).toBeLessThan(80);
});

test('trip flags show identifying titles and years',async({page,isMobile})=>{
  const inventory=await (await page.request.get('/trips/index.json')).json();
  const trips=inventory.filter((trip:{id:string})=>['lspp-may-2025-canoe-trip','vermud-2021'].includes(trip.id));
  await page.route('**/trips/index.json',route=>route.fulfill({json:trips}));
  await page.goto('/map');
  const lspp=page.getByRole('button',{name:'Trip · LSPP canoe trip',exact:true});
  const vermud=page.getByRole('button',{name:'Trip · Vermud · the Long Trail',exact:true});
  await expect(lspp).toBeVisible();
  await expect(vermud).toBeVisible();
  await expect(lspp.locator('.trip-marker-label')).toHaveText('LSPP 2025');
  await expect(vermud.locator('.trip-marker-label')).toHaveText('Vermud 2021');
  const viewport=page.viewportSize()!;
  const controls=(await page.locator('.maplibregl-ctrl-top-right').boundingBox())!;
  for(const flag of [lspp,vermud]){
    const box=(await flag.locator('.trip-marker-surface').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
    const overlapsControls=box.x<controls.x+controls.width&&box.x+box.width>controls.x&&box.y<controls.y+controls.height&&box.y+box.height>controls.y;
    expect(overlapsControls).toBe(false);
  }
  if(!isMobile){
    await lspp.hover();
    await expect.poll(()=>lspp.locator('.trip-marker-surface').evaluate(element=>getComputedStyle(element).transform)).not.toBe('none');
  }
  const offsetsBefore=await Promise.all([lspp,vermud].map(flag=>flag.getAttribute('data-offset')));
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(lspp).toBeVisible();
  await expect(vermud).toBeVisible();
  await page.waitForTimeout(500);
  const offsetsAfterZoom=await Promise.all([lspp,vermud].map(flag=>flag.getAttribute('data-offset')));
  expect(offsetsAfterZoom.filter((offset,index)=>offset!==offsetsBefore[index]).length).toBeLessThanOrEqual(1);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await expect.poll(()=>Promise.all([lspp,vermud].map(flag=>flag.getAttribute('data-offset')))).toEqual(offsetsAfterZoom);
  await page.screenshot({path:`test-results/trip-title-flags-${test.info().project.name}.png`,fullPage:true});
});

test('archive trip flags dynamically arrange without overlapping',async({page})=>{
 await page.goto('/map');
 await expect(page.locator('.trip-marker').first()).toBeVisible();
 await expectTripLabelsNotToOverlap(page);
 await page.locator('.panel-toggle').click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await expectTripLabelsNotToOverlap(page);
 const leaderPaths=await page.locator('.trip-marker[data-hidden=false] .trip-marker-tether path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d')??''));
 expect(leaderPaths.length).toBeGreaterThan(0);
 expect(leaderPaths.every(path=>!/[LQCSTA]/i.test(path))).toBe(true);
 await page.screenshot({path:`test-results/auto-arranged-trip-flags-${test.info().project.name}.png`,fullPage:true});
});

test('clearing selection restores other trips and gently zooms out around the current area', async({page,isMobile}) => {
  const inventory = await (await page.request.get('/trips/index.json')).json();
  const trips = inventory.filter((trip: {id:string}) => trip.id.startsWith('dolly-sods-') || trip.id==='little-rock-creek-lake-mt-2024');
  await page.route('**/trips/index.json', route => route.fulfill({json:trips}));
  await page.goto('/map?trip=dolly-sods-september-2025');
  // The engine chunk loads lazily: wait for initial framing before capturing geometry.
  await expect(page.locator('.map-loading')).toHaveCount(0);
  const summer = page.getByRole('button',{name:'Trip · Dolly Sods · summer',exact:true});
  const fall = page.getByRole('button',{name:'Trip · Dolly Sods · fall',exact:true});
  // Above-only leaders declutter to hidden flags (opacity 0, outside the
  // accessible tree) when no above spot fits, so anchor geometry uses a
  // text locator that resolves whether or not the flag is hidden.
  const summerFlag = page.locator('.trip-marker',{hasText:'Dolly Sods · summer 2023'});
  const distant = page.getByRole('button',{name:/ · Little Rock Creek Lake$/});
  await expect(page.getByRole('slider')).toBeVisible();
  await expect(summer).toBeVisible();
  await expect(summer.locator('.trip-marker-label')).toHaveText('Dolly Sods · summer 2023');
  await expect(distant).toHaveCount(0);
  await page.locator('.waypoint-list button').first().click();
  await expect(page.getByRole('region',{name:'Waypoint details'})).toBeVisible();
  await expect(page.locator('.profile-marker')).toHaveCount(1);
  const readScale = () => page.locator('.maplibregl-ctrl-scale').evaluate(el => {
    const label = el.textContent!.trim().replaceAll(',','');
    return parseFloat(label)*(label.endsWith('mi')?5280:1)/el.getBoundingClientRect().width;
  });
  await expect.poll(readScale).toBeGreaterThan(0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // The scale control can lag the camera under load: wait for consecutive
  // identical readings so the baseline reflects the settled waypoint glide.
  let scaleBefore=await readScale();
  for(let i=0;i<15;i++){
    await page.waitForTimeout(200);
    const next=await readScale();
    if(next===scaleBefore)break;
    scaleBefore=next;
  }
  const before = (await summerFlag.locator('.trip-marker-anchor').boundingBox())!;
  const canvas = page.locator('.maplibregl-canvas');
  const box = (await canvas.boundingBox())!;
  await tapEmptyMap(page, box, isMobile);
  await expect(page).not.toHaveURL(/trip=/);
  await expect(page.locator('.trip-list button')).toHaveCount(trips.length);
  await expect(page.getByRole('region',{name:'Waypoint details'})).toHaveCount(0);
  await expect(page.locator('.profile-marker')).toHaveCount(0);
  await expect(page.locator('.waypoint-marker[aria-label$="Dolly Sods · fall"]')).toHaveCount(0);
  await expect(fall).toHaveCount(1);
  await expect(distant).not.toHaveCount(0);
  await expect.poll(async()=>(await readScale())/scaleBefore).toBeGreaterThan(1.6);
  expect((await readScale())/scaleBefore).toBeLessThan(1.8);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after = (await summerFlag.locator('.trip-marker-anchor').boundingBox())!;
  // The flag's route anchor scales toward the same map center by 0.75 zoom levels.
  const ratio = 2**-.75;
  const centerX = box.x+box.width/2, centerY = box.y+box.height/2;
  const expectedX = centerX+(before.x+before.width/2-centerX)*ratio-after.width/2;
  const expectedY = centerY+(before.y+before.height/2-centerY)*ratio-after.height/2;
  expect(Math.abs(after.x-expectedX)).toBeLessThan(2);
  expect(Math.abs(after.y-expectedY)).toBeLessThan(2);
  // Clicking again with no selection must not continue zooming out.
  const scaleAfter = await readScale();
  await tapEmptyMap(page, box, isMobile);
  expect(await readScale()).toBe(scaleAfter);
  await page.screenshot({path:`test-results/deselected-map-${test.info().project.name}.png`,fullPage:true});
  await page.goBack();
  await expect(page).toHaveURL(/trip=dolly-sods-september-2025/);
  await expect(page.getByRole('slider')).toBeVisible();
  await expect(fall).toHaveCount(0);
  await expect(distant).toHaveCount(0);
  const scaleBeforeButton = await readScale();
  await page.getByRole('button',{name:'← All trips',exact:true}).click();
  await expect(page).not.toHaveURL(/trip=/);
  await expect.poll(async()=>(await readScale())/scaleBeforeButton).toBeGreaterThan(1.6);
  expect((await readScale())/scaleBeforeButton).toBeLessThan(1.8);
  await page.goBack();
  await expect(page).toHaveURL(/trip=dolly-sods-september-2025/);
  await page.goForward();
  await expect(page).not.toHaveURL(/trip=/);
  await expect(fall).toHaveCount(1);
});

test('zooming out groups each trip and its marker restores individual waypoints', async({page}) => {
 await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await page.locator('.panel-toggle').click();
 for(let i=0;i<6;i++) await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 const trip=page.getByRole('button',{name:'Trip · Little Rock Creek Lake',exact:true});
 await expect(trip).toBeVisible();
 await expect(trip).toHaveAttribute('aria-pressed','true');
 await expect(trip.locator('.trip-marker-label')).toHaveText('Little Rock Creek Lake 2024');
 await expect(page.locator('.waypoint-marker')).toHaveCount(0);
 await page.screenshot({path:`test-results/grouped-map-${test.info().project.name}.png`,fullPage:true});
 await trip.click();
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await expect(trip).toHaveCount(0);
 await page.locator('.panel-toggle').click();
 await page.getByRole('button',{name:'← All trips',exact:true}).click();
 await page.getByRole('button',{name:'Frame current trip or full archive',exact:true}).click();
 await expect(page.locator('.trip-marker')).not.toHaveCount(0);
 await page.getByRole('button',{name:'Trip · Little Rock Creek Lake',exact:true}).click();
 await expect(page).toHaveURL(/trip=little-rock-creek-lake-mt-2024/);
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
});

test('crosshair follows the map pointer without intercepting controls or touch', async({page,isMobile}) => {
 await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
 const canvas=page.locator('.maplibregl-canvas');
 const crosshair=page.locator('.map-crosshair');
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await expect(crosshair).toBeHidden();
 const bounds=(await canvas.boundingBox())!;
 if(isMobile){
  await page.touchscreen.tap(bounds.x+bounds.width*.6,bounds.y+160);
  await expect(crosshair).toBeHidden();
  await page.screenshot({path:'test-results/crosshair-mobile.png'});
  return;
 }
 const x=Math.round(bounds.width*.65),y=220;
 await expect.poll(async()=>{
  await page.mouse.move(bounds.x+x+1,bounds.y+y);
  await page.mouse.move(bounds.x+x,bounds.y+y);
  return crosshair.isVisible();
 }).toBe(true);
  await expect.poll(async () => {
    const raw = await crosshair.evaluate(el => el.style.getPropertyValue('--cursor-x'));
    return Math.abs(parseFloat(raw) - x) <= 1 ? 'snapped' : raw;
  }).toBe('snapped');
  await expect.poll(async () => {
    const raw = await crosshair.evaluate(el => el.style.getPropertyValue('--cursor-y'));
    return Math.abs(parseFloat(raw) - y) <= 1 ? 'snapped' : raw;
  }).toBe('snapped');
 await expect(canvas).toHaveCSS('cursor','none');
 const coordinates=page.locator('.crosshair-coordinate');
 await expect(coordinates).toHaveText(/^\d{1,2}\.\d{3}° [NS] · \d{1,3}\.\d{3}° [EW]$/);
 const firstCoordinates=await coordinates.textContent();
 await page.mouse.move(bounds.x+x+20,bounds.y+y+10);
 await expect.poll(()=>coordinates.textContent()).not.toBe(firstCoordinates);
 await page.mouse.move(bounds.x+x,bounds.y+y);
 const horizontal=(await page.locator('.crosshair-horizontal').boundingBox())!;
 const vertical=(await page.locator('.crosshair-vertical').boundingBox())!;
 expect(horizontal.width).toBe(bounds.width);
 expect(horizontal.height).toBe(1);
  expect(vertical.height).toBe(bounds.height);
  expect(vertical.width).toBe(1);
  // Guides resolve to whole viewport pixels so 1px lines never straddle rows.
  const snapped = await page.evaluate(() => {
    const h = document.querySelector('.crosshair-horizontal')!.getBoundingClientRect();
    const v = document.querySelector('.crosshair-vertical')!.getBoundingClientRect();
    return { dy: Math.abs(h.top - Math.round(h.top)), dx: Math.abs(v.left - Math.round(v.left)) };
  });
  expect(snapped.dy).toBeLessThan(0.01);
  expect(snapped.dx).toBeLessThan(0.01);
  const reticle = (await page.locator('.crosshair-reticle').boundingBox())!;
  expect(reticle.width).toBe(4);
  expect(reticle.height).toBe(4);
  expect(Math.abs(reticle.x + reticle.width / 2 - (bounds.x + x))).toBeLessThanOrEqual(1);
  expect(Math.abs(reticle.y + reticle.height / 2 - (bounds.y + y))).toBeLessThanOrEqual(1);
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('maplibregl-canvas'),{x:bounds.x+x,y:bounds.y+y})).toBe(true);
  await page.mouse.down();await page.mouse.move(bounds.x+x+30,bounds.y+y+20);await page.mouse.up();
  await expect.poll(async () => {
    const raw = await crosshair.evaluate(el => el.style.getPropertyValue('--cursor-x'));
    return Math.abs(parseFloat(raw) - (x + 30)) <= 1 ? 'snapped' : raw;
  }).toBe('snapped');
 await page.screenshot({path:'test-results/crosshair-desktop.png'});
 await page.locator('.trip-panel').hover();await expect(crosshair).toBeHidden();
 await page.getByRole('button',{name:'Satellite',exact:true}).click();
 await expect(crosshair).toBeHidden();
 await page.mouse.move(bounds.x+x,bounds.y+y);await expect(crosshair).toBeVisible();
 await expect(crosshair).toHaveClass(/map-crosshair-satellite/);
 await page.screenshot({path:'test-results/crosshair-satellite.png'});
 await page.keyboard.press('Tab');await expect(crosshair).toBeHidden();
 await page.mouse.move(bounds.x+x+2,bounds.y+y);await expect(crosshair).toBeVisible();
 await page.getByRole('link',{name:'Home',exact:true}).hover();await expect(crosshair).toBeHidden();
});

test('overlapping trips stay as labels until selected, and only the selected trip expands', async({page}) => {
 const inventory = await (await page.request.get('/trips/index.json')).json();
 const trips = inventory.filter((trip: { id: string }) => trip.id.startsWith('dolly-sods-'));
 await page.route('**/trips/index.json', route => route.fulfill({json:trips}));
 await page.goto('/map');
 const summer = page.getByRole('button',{name:'Trip · Dolly Sods · summer',exact:true});
 const fall = page.getByRole('button',{name:'Trip · Dolly Sods · fall',exact:true});
 await expect(summer).toBeVisible();
 await expect(fall).toBeVisible();
 await expect(page.locator('.waypoint-marker')).toHaveCount(0);
 await page.locator('.panel-toggle').click();
 for(let i=0;i<3;i++) await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(page.locator('.trip-marker')).toHaveCount(2);
  await expect(page.locator('.waypoint-marker')).toHaveCount(0);
  // Above-only leaders declutter to hidden flags when no above spot fits, so
  // only visible flags participate in the overlap check.
  const labelBoxes = await page.locator('.trip-marker[data-hidden="false"] .trip-marker-surface').evaluateAll(elements => {
    const map = document.querySelector('.maplibregl-map')!.getBoundingClientRect();
    return elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }).filter(box => box.x < map.right && box.x + box.width > map.left && box.y < map.bottom && box.y + box.height > map.top);
  });
  for (let i = 0; i < labelBoxes.length; i++) for (let j = i + 1; j < labelBoxes.length; j++) {
    const a = labelBoxes[i], b = labelBoxes[j];
    expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
  }
 // Restore the framing after zooming, then choose the route's floating label.
 await page.getByRole('button',{name:'Frame current trip or full archive'}).click();
 await fall.click();
 await expect(page).toHaveURL(/trip=dolly-sods-september-2025/);
 await expect(fall).toHaveCount(0);
 await expect(summer).toHaveCount(1);
 await expect(page.locator('.waypoint-marker')).toHaveCount(trips.find((trip: {id:string})=>trip.id==='dolly-sods-september-2025').waypoints.length);
 await expect(page.locator('.waypoint-marker').first()).toHaveAttribute('aria-label',/Dolly Sods · fall$/);
 await page.screenshot({path:`test-results/overlapping-trip-labels-${test.info().project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'← All trips',exact:true}).click();
 await expect(page.locator('.waypoint-marker')).toHaveCount(0);
 await expect(page.locator('.trip-marker')).toHaveCount(2);
 // Selection from the archive list has the same behavior as clicking a flag.
 await page.getByRole('button',{name:/01 Dolly Sods/}).click();
 await expect(page).toHaveURL(/trip=dolly-sods-june-2023/);
 await expect(summer).toHaveCount(0);
 await expect(fall).toHaveCount(1);
 await expect(page.locator('.waypoint-marker').first()).toHaveAttribute('aria-label',/Dolly Sods · summer$/);
 await page.goBack();
 await expect(page.locator('.waypoint-marker')).toHaveCount(0);
 await expect(page.locator('.trip-marker')).toHaveCount(2);
});
