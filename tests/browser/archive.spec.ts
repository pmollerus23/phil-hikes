import { test, expect } from '@playwright/test';
const id='maine-august-2026';
test('direct link loads trip, full profile, and selectable waypoint descriptions',async({page})=>{
 await page.goto(`/map?trip=${id}`);await expect(page.getByRole('heading',{name:'Rangeley to Flagstaff',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Explore elevation profile'})).toBeVisible();
 await expect(page.getByRole('slider')).toHaveAttribute('max','3440');await expect(page.locator('.trip-stats')).toContainText('61.5 mi');
 await page.getByText('Source geometry · 1 path',{exact:true}).click();await expect(page.locator('.data-notes').first()).toContainText('Maine AT Section Route');await expect(page.locator('.data-notes').first()).not.toContainText('Day 1');
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
