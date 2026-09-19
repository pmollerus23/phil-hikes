import { test, expect } from '@playwright/test';
const id='maine-august-2026';
test('direct link loads trip, full profile, and selectable waypoint descriptions',async({page})=>{
 await page.goto(`/map?trip=${id}`);await expect(page.getByRole('heading',{name:'Rangeley to Flagstaff',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Explore elevation profile'})).toBeVisible();
 await expect(page.getByRole('slider')).toHaveAttribute('max','3440');await expect(page.locator('.trip-stats')).toContainText('61.5 mi');
 const source=page.getByText('Source geometry · 1 path',{exact:true});await source.click();await expect(source.locator('..')).toContainText('Maine AT Section Route');await expect(source.locator('..')).not.toContainText('Day 1');
 await page.getByRole('button',{name:/Sugarloaf Summit.*summit/}).click();await expect(page.getByRole('region',{name:'Waypoint details'})).toContainText('Cool summit.');
 await page.screenshot({path:`test-results/selected-${test.info().project.name}.png`,fullPage:true});
});
test('selection updates URL; back and forward restore selection and clear returns archive',async({page})=>{
 await page.goto('/map');await page.getByRole('button',{name:/01 Beartown to Tyringham/}).click();await expect(page).toHaveURL(/trip=beartown/);await expect(page.getByRole('heading',{name:'Beartown to Tyringham',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'← All trips'}).click();await expect(page).not.toHaveURL(/trip=/);
 await page.getByRole('button',{name:/Rangeley to Flagstaff Maine/}).click();await expect(page).toHaveURL(/trip=maine/);
 await page.goBack();await expect(page.getByRole('heading',{name:/Places worth/})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'Beartown to Tyringham',exact:true})).toBeVisible();await page.goForward();await expect(page.getByRole('heading',{name:/Places worth/})).toBeVisible();
});
test('unknown ID, panel collapse, keyboard access, and shared Home link',async({page})=>{
 await page.goto('/map?trip=unknown');await expect(page.getByRole('status')).toContainText('wasn’t found');await page.getByRole('button',{name:'Clear link'}).click();
 const toggle=page.getByRole('button',{name:/The trip archive/});await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(page.locator('#trip-panel-content')).toBeHidden();await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
 const trip=page.getByRole('button',{name:/Otter Creek West Virginia/});await trip.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/trip=otter/);await expect(page.getByRole('heading',{name:'Otter Creek',exact:true})).toBeVisible();
 const slider=page.getByRole('slider');await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).toHaveValue('1');
 await page.getByRole('link',{name:'Home',exact:true}).click();await expect(page).toHaveURL('/');await expect(page.getByRole('link',{name:/Explore the trip map/})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/home-${test.info().project.name}.png`,fullPage:true});
});
test('missing key setup, responsive layout and no unexpected JS errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/map');await expect(page.getByRole('heading',{name:/Places worth/})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your next view starts here.'})).toBeVisible();await expect(page.getByRole('button',{name:'Satellite',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:`test-results/archive-${test.info().project.name}.png`,fullPage:true});
});
test('empty archive and missing index show usable explanations',async({page})=>{
 await page.route('**/trips/index.json',r=>r.fulfill({json:[]}));await page.goto('/map');await expect(page.getByText(/No trips imported yet/)).toBeVisible();await page.unroute('**/trips/index.json');await page.route('**/trips/index.json',r=>r.fulfill({status:404}));await page.reload();await expect(page.getByRole('alert')).toContainText('Trip archive is missing');await expect(page.getByRole('button',{name:'Retry archive'})).toBeVisible();
});
test('failed detail retains summary and offers retry',async({page})=>{
 await page.route(`**/trips/${id}.json`,r=>r.fulfill({status:500}));await page.goto(`/map?trip=${id}`);await expect(page.getByRole('alert')).toContainText('detailed route could not load');await expect(page.getByRole('button',{name:'Retry detail'})).toBeVisible();await page.unroute(`**/trips/${id}.json`);await page.getByRole('button',{name:'Retry detail'}).click();await expect(page.getByRole('slider')).toBeVisible();
});
test('late detail response cannot replace a newer selection',async({page})=>{
 await page.route('**/trips/beartown-tyringham-solo-1-nighter-july-2026.json',async route=>{await new Promise(resolve=>setTimeout(resolve,600));try{await route.continue();}catch{/* request aborted by selection */}});
 await page.goto('/map');await page.getByRole('button',{name:/01 Beartown/}).click();await page.getByRole('button',{name:'← All trips'}).click();await page.getByRole('button',{name:/Rangeley to Flagstaff Maine/}).click();await expect(page.getByRole('slider')).toHaveAttribute('max','3440');await expect(page.getByRole('heading',{name:'Rangeley to Flagstaff',exact:true})).toBeVisible();
});
test('invalid index is rejected and original GPX is not served',async({page,request})=>{
 const original=await request.get('/gpx_map_data/shenandoah.gpx');expect(original.status()).toBeGreaterThanOrEqual(400);
 await page.route('**/trips/index.json',r=>r.fulfill({json:[{id:'broken'}]}));await page.goto('/map');await expect(page.getByRole('alert')).toContainText('Trip index is invalid');
});

test('photo demo connects trip gallery, place detail, captions, viewer keyboard, history, and failure fallback',async({page,isMobile})=>{
 await page.goto('/photo-demo?trip=little-rock-creek-lake-mt-2024');
 const photos=page.getByRole('button',{name:'Photos · 3'});await expect(photos).toBeVisible();
 await photos.click();await expect(page).toHaveURL(/gallery=photos/);await expect(page.getByRole('region',{name:'Trip photo gallery'})).toBeVisible();
 await expect(page.locator('.gallery-card')).toHaveCount(3);await expect(page.getByText('Creek crossing',{exact:true}).first()).toBeVisible();
 await expect.poll(()=>page.locator('.gallery-image img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
 await page.screenshot({path:`test-results/photo-gallery-${test.info().project.name}.png`,fullPage:true});
 const galleryOpener=page.getByRole('button',{name:/Enlarge photo 1/});await galleryOpener.click();
 const viewer=page.getByRole('dialog',{name:'Enlarged photo viewer'});await expect(viewer).toBeVisible();await expect(viewer).toContainText('TRIP COLLECTION · 01 / 03');await expect(viewer).toContainText('Last light settled');
 await page.screenshot({path:`test-results/photo-viewer-${test.info().project.name}.png`});
 await page.keyboard.press('ArrowRight');await expect(viewer).toContainText('A cold, clear morning');await expect(viewer).toContainText('02 / 03');
 await page.keyboard.press('ArrowRight');await expect(viewer).toContainText('The route crossed here');await expect(page).toHaveURL(/place=creek-crossing.*photo=demo-creek-crossing/);
 await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/place=wpt-1.*photo=demo-camp-morning/);
 await page.keyboard.press('Escape');await expect(viewer).toHaveCount(0);await expect(galleryOpener).toBeFocused();
 await page.getByRole('button',{name:'← Back to trip'}).click();
 await page.getByRole('button',{name:/Night campsite.*2 photos/}).click();await expect(page).toHaveURL(/place=wpt-1/);const detail=page.getByRole('region',{name:'Waypoint details'});await expect(detail).toContainText('Night campsite');await expect(detail).toContainText('Last light settled');
 await detail.getByRole('button',{name:'Next photo'}).click();await expect(detail).toContainText('A cold, clear morning');await expect(detail).toContainText('02 / 02');
 await detail.getByRole('button',{name:/Enlarge photo/}).click();await expect(viewer).toContainText('PLACE COLLECTION · 02 / 02');
 await page.keyboard.press('Tab');expect(await viewer.evaluate(node=>node.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');
 await detail.getByRole('button',{name:'← Back to trip'}).click();await page.getByText('GPS photo stops · 1',{exact:true}).click();await page.getByRole('button',{name:/Creek crossing.*1 photo/}).click();await expect(detail).toContainText('photo-only stop');await expect(detail).toContainText('The route crossed here');
 await page.screenshot({path:`test-results/photo-demo-${test.info().project.name}.png`,fullPage:true});
 if(isMobile){const panel=(await page.locator('.trip-panel').boundingBox())!,viewport=page.viewportSize()!;expect(panel.y).toBeGreaterThan(viewport.height*.3);expect(panel.height).toBeLessThanOrEqual(viewport.height*.64);}
 await page.route('**/demo/photos/creek-crossing.svg',route=>route.abort());await page.goto('/photo-demo?trip=little-rock-creek-lake-mt-2024');await page.getByRole('button',{name:'Photos · 3'}).click();await page.getByRole('button',{name:/Enlarge photo 3/}).click();await expect(viewer.getByText('Image unavailable')).toBeVisible();
});

test('normal archive remains clean when a trip has no photos',async({page})=>{
 await page.goto('/map?trip=little-rock-creek-lake-mt-2024');await expect(page.getByRole('button',{name:/Photos ·/})).toHaveCount(0);await expect(page.locator('.marker-photo-count')).toHaveCount(0);
});

test('Maine trip loads its authored GPS photo gallery and full-size images on demand',async({page})=>{
 await page.goto('/map?trip=maine-august-2026');const photos=page.getByRole('button',{name:'Photos · 86'});await expect(photos).toBeVisible();await photos.click();
 const gallery=page.getByRole('region',{name:'Trip photo gallery'});await expect(gallery).toBeVisible();await expect(gallery.locator('.gallery-card')).toHaveCount(86);
 const first=gallery.getByRole('button',{name:/Enlarge photo 1:/});await expect(first.locator('img')).toHaveAttribute('src','/photos/maine-august-2026/maine-at-photo-001-thumb.webp');
 await page.screenshot({path:`test-results/maine-photo-gallery-${test.info().project.name}.png`,fullPage:true});await first.click();
 const viewer=page.getByRole('dialog',{name:'Enlarged photo viewer'});await expect(viewer).toContainText('TRIP COLLECTION · 01 / 86');await expect(viewer).toContainText('Maine AT photo 01');await expect(viewer.locator('img')).toHaveAttribute('src','/photos/maine-august-2026/maine-at-photo-001.webp');
 expect(await viewer.locator('.lightbox-image img').evaluate(image=>{const imageBox=image.getBoundingClientRect(),frame=image.parentElement!.getBoundingClientRect(),style=getComputedStyle(image);return style.objectFit==='contain'&&imageBox.left>=frame.left&&imageBox.top>=frame.top&&imageBox.right<=frame.right&&imageBox.bottom<=frame.bottom;})).toBe(true);
 await page.screenshot({path:`test-results/maine-photo-viewer-${test.info().project.name}.png`});
});
