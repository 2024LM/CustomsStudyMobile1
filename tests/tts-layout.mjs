import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-layout-'));
await build({
  stdin: { contents: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { SpeakButton } from './src/components/SpeakButton';\nwindow.__spoken = [];\nwindow.__nativeListener = null;\nconst root = createRoot(document.getElementById('app'));\nwindow.__mount = text => root.render(<>\n<section data-speech-scope id=\"a\"><div data-speech-text>{text}</div><SpeakButton text={text}/></section>\n<section data-speech-scope id=\"b\"><div data-speech-text>نص ثان</div><SpeakButton text=\"نص ثان\"/></section>\n</>);\nwindow.__mount('النسبة 12.5٪');\nwindow.__event = state => window.__nativeListener({requestId:window.__spoken.at(-1).requestId,state});\nwindow.__frame = enabled => {localStorage.setItem('tts_reading_frame_v1',enabled?'1':'0');window.dispatchEvent(new Event('tts-frame-setting'));};", resolveDir: process.cwd(), sourcefile: 'tts-harness.tsx', loader: 'tsx' },
  bundle: true, outfile: path.join(temp, 'app.js'), format: 'iife', platform: 'browser',
  plugins: [{
    name: 'fake-native-tts',
    setup(builder) {
      builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'capacitor', namespace: 'fake' }));
      builder.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: "export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android'};\nexport const registerPlugin=()=>({\naddListener:async(name,listener)=>{window.__nativeListener=listener;return{remove:async()=>{}};},\nplayback:async()=>({requestId:'',state:'idle'}),\nspeak:async options=>{window.__spoken.push(options);return{started:true,locale:'ar-SA',voice:'Arabic'};},\nstop:async()=>{}\n});", loader: 'js' }));
    },
  }],
});
const styles = fs.readFileSync('src/index.css', 'utf8');
const css = styles.slice(styles.indexOf('/* Mark the block'));
const html = '<!doctype html><html><head><meta charset="utf-8"><style>section{padding:16px;margin:16px}'+css+'</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  response.end(request.url === '/app.js' ? fs.readFileSync(path.join(temp, 'app.js')) : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#a button').click();
  await page.waitForFunction(() => window.__spoken.length === 1);
  assert.equal(await page.locator('.tts-reading-frame').count(), 0, 'No outline before actual speech starts');
  await page.evaluate(() => window.__event('speaking'));
  await page.waitForSelector('#a .tts-reading-frame');
  assert.equal(await page.locator('#a [data-speech-text]').textContent(), 'النسبة 12.5٪', 'Visible text stays unchanged');
  assert.equal(await page.evaluate(() => window.__spoken[0].text), 'النسبة 12.5 في المئة');
  assert.equal(await page.locator('#a [data-speech-text]').evaluate(el => getComputedStyle(el).outlineWidth), '2px');
  await page.evaluate(() => window.__frame(false));
  await page.waitForFunction(() => !document.querySelector('.tts-reading-frame'));
  await page.evaluate(() => window.__frame(true));
  await page.waitForSelector('#a .tts-reading-frame');
  await page.locator('#b button').click();
  await page.waitForFunction(() => window.__spoken.length === 2);
  await page.evaluate(() => window.__event('speaking'));
  await page.waitForSelector('#b .tts-reading-frame');
  assert.equal(await page.locator('#a .tts-reading-frame').count(), 0);
  await page.evaluate(() => window.__event('done'));
  await page.waitForFunction(() => !document.querySelector('.tts-reading-frame'));
  assert.equal(await page.locator('#b button').getAttribute('aria-pressed'), 'false');
  await page.locator('#a button').click();
  await page.waitForFunction(() => window.__spoken.length === 3);
  await page.evaluate(() => window.__event('speaking'));
  await page.waitForSelector('#a .tts-reading-frame');
  await page.locator('#a button').click();
  await page.waitForFunction(() => !document.querySelector('.tts-reading-frame'));
  await page.locator('#a button').click();
  await page.waitForFunction(() => window.__spoken.length === 4);
  await page.evaluate(() => window.__event('speaking'));
  await page.waitForSelector('#a .tts-reading-frame');
  await page.evaluate(() => window.__event('error'));
  await page.waitForFunction(() => !document.querySelector('.tts-reading-frame'));
  await page.locator('#a button').click();
  await page.waitForFunction(() => window.__spoken.length === 5);
  await page.evaluate(() => window.__event('speaking'));
  await page.waitForSelector('#a .tts-reading-frame');
  await page.evaluate(() => window.__mount('سؤال جديد'));
  await page.waitForFunction(() => !document.querySelector('.tts-reading-frame'));
  assert.deepEqual(errors, []);
  console.log('Reading frame checks passed: start, switch, finish, stop, failure, changed text and setting.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
