import { test, expect } from '@playwright/test';
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
test('real MapLibre canvas, overlays, style switch, terrain control, and profile marker survive UI changes',async({page})=>{
 let demRequests=0;page.on('request',r=>{if(r.url().includes('/fixture/'))demRequests++;});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
 await expect(page.locator('.maplibregl-canvas')).toBeVisible();await expect(page.getByRole('slider')).toBeVisible();await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await expect.poll(async()=>{const a=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();const b=await page.getByRole('button',{name:/Start of mapped geometry · Little Rock/}).boundingBox();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}).toBeGreaterThan(60);
 const before=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();
 const canvas=await page.locator('.maplibregl-canvas').elementHandle();
 const slider=page.getByRole('slider');await slider.focus();await page.keyboard.press('ArrowRight');await expect(page.locator('.profile-marker')).toBeVisible();
 await page.getByRole('button',{name:'Satellite',exact:true}).click();await expect(page.getByRole('button',{name:'Satellite',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 const after=await page.getByRole('button',{name:/Night campsite · Little Rock/}).boundingBox();expect(Math.abs(before!.x-after!.x)).toBeLessThan(2);expect(Math.abs(before!.y-after!.y)).toBeLessThan(2);
 expect(await canvas?.evaluate(el=>el===document.querySelector('.maplibregl-canvas'))).toBe(true);
 await page.getByRole('button',{name:/3D terrain/}).click();await expect(page.getByRole('button',{name:/3D terrain/})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>demRequests).toBeGreaterThan(0);await page.getByRole('button',{name:/3D terrain/}).click();
 await page.getByRole('button',{name:'Topo',exact:true}).click();await expect(page.getByRole('heading',{name:'Little Rock Creek Lake',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Night campsite · Little Rock/}).click();await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Night campsite');
 await page.screenshot({path:`test-results/fixture-map-${test.info().project.name}.png`,fullPage:true});expect(errors).toEqual([]);
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
test('unsupported WebGL retains the trip archive',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:any[]){if(type==='webgl2')return null;return original.apply(this,[type,...args] as any);} as typeof original;});
 await page.goto('/map?trip=shenandoah');await expect(page.getByText('This browser cannot render WebGL maps.',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Shenandoah',exact:true})).toBeVisible();await expect(page.getByRole('slider')).toBeVisible();
});

test('zooming out groups each trip and its marker restores individual waypoints', async({page}) => {
 await page.goto('/map?trip=little-rock-creek-lake-mt-2024');
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await page.locator('.panel-toggle').click();
 for(let i=0;i<6;i++) await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 const trip=page.getByRole('button',{name:'Trip · Little Rock Creek Lake',exact:true});
 await expect(trip).toBeVisible();
 await expect(page.locator('.waypoint-marker')).toHaveCount(0);
 await page.screenshot({path:`test-results/grouped-map-${test.info().project.name}.png`,fullPage:true});
 await trip.click();
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
 await expect(trip).toHaveCount(0);
 await page.locator('.panel-toggle').click();
 await page.getByRole('button',{name:'← All trips',exact:true}).click();
 await expect(page.locator('.trip-marker')).not.toHaveCount(0);
 await page.getByRole('button',{name:'Trip · Little Rock Creek Lake',exact:true}).click();
 await expect(page).toHaveURL(/trip=little-rock-creek-lake-mt-2024/);
 await expect(page.locator('.waypoint-marker')).toHaveCount(3);
});
