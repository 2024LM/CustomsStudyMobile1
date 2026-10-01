import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-layout-'));
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReferenceBannerAd } from './src/components/ReferenceBannerAd';
window.__requests = [];
window.__positions = [];
window.__pending = {};
window.__failures = {};
window.__resumes = [];
window.__native = true;
const root = createRoot(document.getElementById('app'));
window.__mount = () => root.render(<>
  <section id="flex" className="stack">
    <div id="before-flex">Before</div>
    <ReferenceBannerAd slot="flex" format="banner" />
    <div id="after-flex">After</div>
  </section>
  <section id="grid" className="grid">
    <div id="before-grid">Before</div>
    <ReferenceBannerAd slot="grid" className="span-two" />
    <div id="after-grid">After</div>
  </section>
</>);
window.__mount();
`;
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'banner-harness.tsx', loader: 'tsx' },
  bundle: true, outfile: path.join(temp, 'app.js'), format: 'iife', platform: 'browser',
  plugins: [{
    name: 'controlled-ad-provider',
    setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'capacitor', namespace: 'fake' }));
      builder.onResolve({ filter: /services\/ads$/ }, () => ({ path: 'ads', namespace: 'fake' }));
      builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({
        contents: args.path === 'capacitor'
          ? "export const Capacitor = { getPlatform: () => window.__native ? 'android' : 'web' };"
          : `
export const adsAvailable = () => window.__native && navigator.onLine && document.visibilityState === 'visible';
export const showBanner = (slot, rect, format) => {
  window.__requests.push({slot, rect, format});
  return new Promise(resolve => { window.__pending[slot] = resolve; });
};
export const updateBanner = async (slot, rect) => { window.__positions.push({slot, rect}); };
export const hideBanner = async () => {};
export const onAdsResumed = async listener => {
  window.__resumes.push(listener);
  return { remove: async () => { window.__resumes = window.__resumes.filter(item => item !== listener); } };
};
export const onBannerFailed = async (slot, listener) => {
  window.__failures[slot] = listener;
  return { remove: async () => { delete window.__failures[slot]; } };
};
`,
        loader: 'js',
      }));
    },
  }],
});
const html = `<!doctype html><html><head><style>
body { margin:0; padding:16px; font:16px sans-serif; }
.stack { display:flex; flex-direction:column; gap:16px; position:relative; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px; position:relative; }
.grid > div:not(.reference-banner-ad), .span-two { grid-column:1 / -1; }
section > div:not(.reference-banner-ad) { height:24px; background:#eee; }
</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/app.js' ? fs.readFileSync(path.join(temp, 'app.js')) : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.__requests.length === 2);
  const gap = name => page.evaluate(name => {
    const before = document.getElementById('before-' + name).getBoundingClientRect();
    const after = document.getElementById('after-' + name).getBoundingClientRect();
    return after.top - before.bottom;
  }, name);
  assert.equal(await gap('flex'), 16, 'Pending banner must not create a flex gap');
  assert.equal(await gap('grid'), 16, 'Pending banner must not create an empty grid row');
  await page.evaluate(() => Object.values(window.__pending).forEach(resolve => resolve({ loaded:false, height:0 })));
  await page.waitForTimeout(120);
  assert.equal(await gap('flex'), 16, 'No-fill banner must collapse completely');
  assert.equal(await gap('grid'), 16);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => window.__requests.length === 4);
  await page.evaluate(() => Object.values(window.__pending).forEach(resolve => resolve({ loaded:true, height:50 })));
  await page.waitForFunction(() => [...document.querySelectorAll('.reference-banner-ad')].every(node => node.getBoundingClientRect().height === 50));
  assert.equal(await gap('flex'), 82, 'Loaded banner gets its actual height and normal spacing');
  assert.equal(await gap('grid'), 82);
  await page.waitForFunction(() => window.__positions.some(item => item.rect.visible));
  await page.evaluate(() => Object.values(window.__failures).forEach(callback => callback()));
  await page.waitForFunction(() => [...document.querySelectorAll('.reference-banner-ad')].every(node => node.getBoundingClientRect().height === 0));
  assert.equal(await gap('flex'), 16, 'SDK refresh failures must remove previously allocated space');
  assert.equal(await gap('grid'), 16);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => window.__requests.length === 6);
  await page.evaluate(() => Object.values(window.__pending).forEach(resolve => resolve({ loaded:true, height:50 })));
  await page.waitForFunction(() => document.querySelector('.reference-banner-ad').getBoundingClientRect().height === 50);
  await page.context().setOffline(true);
  await page.waitForFunction(() => [...document.querySelectorAll('.reference-banner-ad')].every(node => node.getBoundingClientRect().height === 0));
  assert.equal(await gap('flex'), 16, 'Offline transition removes the ad gap');
  await page.context().setOffline(false);
  await page.waitForFunction(() => window.__requests.length === 8);
  assert.deepEqual(errors, []);
  console.log('Banner layout checks passed: loading, no-fill, success, SDK refresh failure and reconnect.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive:true, force:true });
}
