import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const fixtureMaps=process.env.MAP_TEST==='1';
const port=fixtureMaps?4332:4321;
const chromiumPath=process.env.CHROMIUM_PATH
 ?? ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
export default defineConfig({
 testDir:fixtureMaps?'./tests/map-browser':'./tests/browser',fullyParallel:true,workers:4,
 outputDir:fixtureMaps?'test-results/map':'test-results/archive',
 use:{reducedMotion:'reduce',baseURL:`http://127.0.0.1:${port}`,launchOptions:{...(chromiumPath?{executablePath:chromiumPath}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{command:`npm run dev -- --port ${port} --ignore-lock`,url:`http://127.0.0.1:${port}`,reuseExistingServer:!fixtureMaps,env:{PUBLIC_MAPTILER_KEY:fixtureMaps?'local-test-fixture':''}},reporter:'list',
});
