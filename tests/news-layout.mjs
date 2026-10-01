import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'news-layout-'));
await build({
stdin:{contents:"import React from 'react';\nimport {createRoot} from 'react-dom/client';\nimport {NewsPage} from './src/views/NewsPage';\nwindow.__nativeRequests=[];\nwindow.__pending=[];\nwindow.__errors=[];\nconst root=createRoot(document.getElementById('app'));\nlet generation=0;\nwindow.__mount=()=>root.render(<NewsPage key={++generation}/>);\nwindow.__mount();",resolveDir:process.cwd(),sourcefile:'news-harness.tsx',loader:'tsx'},
bundle:true,outfile:path.join(temp,'app.js'),format:'iife',platform:'browser',
plugins:[{name:'controlled-news',setup(builder){
builder.onResolve({filter:/^@capacitor\/core$/},()=>({path:'native',namespace:'fake'}));
builder.onResolve({filter:/news\/services\/newsService$/},()=>({path:'service',namespace:'fake'}));
builder.onResolve({filter:/services\/geminiAi$/},()=>({path:'gemini',namespace:'fake'}));
builder.onLoad({filter:/.*/,namespace:'fake'},args=>({contents:args.path==='native'?"export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android'};\nexport const registerPlugin=()=>({translate:options=>{\nwindow.__nativeRequests.push(options);\nreturn new Promise((resolve,reject)=>window.__pending.push({resolve,reject}));\n}});":args.path==='service'?"const articles=[\n{id:'fr',imageUrl:'https://images.example.test/featured.png',sourceId:'emploi-public',title:'Concours de recrutement',summary:'Résumé du concours',url:'https://www.emploi-public.ma/fr/details/concours/11111111-1111-1111-1111-111111111111',publishedAt:'2026-10-01'},\n{id:'ar',imageUrl:'https://images.example.test/broken.png',sourceId:'men',title:'مباراة توظيف مدرسين',summary:'ملخص عربي',url:'https://www.men.gov.ma/مباريات',publishedAt:'2026-09-30'},\n{id:'mixed',sourceId:'hcp',title:'عنوان عربي',summary:'Résumé en français',url:'https://www.hcp.ma/story',publishedAt:'2026-09-29'}\n];\nexport const newsService={\nsources:()=>[{id:'emploi-public',name:'التشغيل العمومي',enabled:true,builtIn:true},{id:'men',name:'وزارة التربية',enabled:true,builtIn:true},{id:'hcp',name:'المندوبية',enabled:true,builtIn:true}],\ncachedArticles:()=>articles,refresh:async()=>[],addSource:()=>{},removeSource:()=>{}\n};":"export const translateNewsWithGemini=async()=>{throw new Error('Not used');};",loader:'js'}));
}}]});
const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
const server=createServer((request,response)=>{
response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
response.end(request.url==='/app.js'?fs.readFileSync(path.join(temp,'app.js')):html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:360,height:800}});
const errors=[];let popups=0;
page.on('pageerror',error=>errors.push(error.message));page.on('popup',()=>popups++);
let releaseImage;
const imageGate=new Promise(resolve=>{releaseImage=resolve});
await page.route('https://images.example.test/featured.png',async route=>{
  await imageGate;
  await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="blue"/></svg>'});
});
await page.route('https://images.example.test/broken.png', route => route.request().url().endsWith('broken.png') ? route.abort() : route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="blue"/></svg>'}));
await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
await page.locator('img[src="https://images.example.test/featured.png"]').waitFor({state:'attached'});
assert.equal(await page.locator('img[src="https://images.example.test/featured.png"]').isVisible(),false,'A pending image never appears');
assert.equal(await page.getByRole('heading',{name:'Concours de recrutement',exact:true}).count(),1,'The news remains readable while its image is prepared');
releaseImage();
await page.waitForFunction(()=>document.querySelector('img[src="https://images.example.test/featured.png"]')?.complete && !document.querySelector('img[src="https://images.example.test/broken.png"]'));
await page.locator('img[src="https://images.example.test/featured.png"]').waitFor({state:'visible'});
await page.getByRole('heading',{name:'مباراة توظيف مدرسين',exact:true}).scrollIntoViewIfNeeded();
await page.locator('[data-news-image-state="failed"]').first().waitFor();
assert.equal(await page.locator('[data-news-image-state="failed"] img').count(),0,'Failed images leave no broken element or image gap');
assert.equal(await page.getByText('مباراة توظيف مدرسين',{exact:true}).count(),1,'Image failure preserves the news');
assert.equal(await page.getByRole('button',{name:'ترجمة الخبر إلى العربية',exact:true}).count(),2,'Arabic news needs no translation; a French summary still does');
await page.getByRole('button',{name:'ترجمة الخبر إلى العربية',exact:true}).first().click();
await page.waitForFunction(()=>window.__nativeRequests.length===1);
assert.equal(await page.getByRole('heading',{name:'Concours de recrutement',exact:true}).count(),1,'Keep original while loading');
await page.evaluate(()=>window.__pending[0].resolve({title:'مباراة توظيف',summary:'ملخص المباراة'}));
await page.getByRole('heading',{name:'مباراة توظيف',exact:true}).waitFor();
assert.equal(await page.getByText('ملخص المباراة',{exact:true}).count(),1);
assert.equal(await page.getByRole('link',{name:/قراءة الخبر/}).getAttribute('href'),'https://www.emploi-public.ma/fr/details/concours/11111111-1111-1111-1111-111111111111','Translation must retain the official link');
await page.getByRole('button',{name:'عرض النص الأصلي'}).click();
await page.getByRole('heading',{name:'Concours de recrutement',exact:true}).waitFor();
await page.evaluate(()=>window.__mount());
await page.getByRole('button',{name:'ترجمة الخبر إلى العربية',exact:true}).first().click();
await page.getByRole('heading',{name:'مباراة توظيف',exact:true}).waitFor();
assert.equal(await page.evaluate(()=>window.__nativeRequests.length),1,'Use stored translation on a fresh mount');
await page.getByRole('button',{name:'ترجمة الخبر إلى العربية',exact:true}).click();
await page.waitForFunction(()=>window.__nativeRequests.length===2);
await page.evaluate(()=>window.__pending[1].reject(new Error('تعذر تنزيل حزمة الترجمة.')));
await page.getByRole('alert').waitFor();
assert.equal(await page.getByRole('heading',{name:'عنوان عربي',exact:true}).count(),1,'Failure preserves the original');
assert.equal(await page.getByText('Résumé en français',{exact:true}).count(),1);
assert.equal(popups,0,'Translation must remain in the application');
assert.deepEqual(errors,[]);
console.log('News inline translation UI checks passed: opt-in, loading, success, original, cached reload, mixed language and failure.');
}finally{
await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
}
