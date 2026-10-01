import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'home-news-'));
await build({
  stdin:{contents:"import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {HomeNewsPreview} from './src/features/news/components/HomeNewsPreview';import {NewsPage} from './src/views/NewsPage';import {BottomNavigation} from './src/components/BottomNavigation';function Harness(){const [page,setPage]=useState('HOME');return <div className='app-shell'><main className='p-4 pb-24'>{page==='HOME'?<HomeNewsPreview onOpenNews={()=>setPage('NEWS')}/>:page==='NEWS'?<NewsPage/>:<h1>{page}</h1>}</main><BottomNavigation page={page} onNavigate={setPage}/></div>};createRoot(document.getElementById('app')).render(<Harness/>);",resolveDir:process.cwd(),sourcefile:'home-news-harness.tsx',loader:'tsx'},
  bundle:true,outfile:path.join(temp,'app.js'),format:'iife',platform:'browser',
  plugins:[{name:'controlled-news',setup(builder){
    builder.onResolve({filter:/news\/services\/newsService$|^\.\.\/services\/newsService$/},()=>({path:'service',namespace:'fake'}));
    builder.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:"let articles=Array.from({length:12},(_,i)=>({id:'item-'+(i+1),sourceId:['emploi-public','men','finances','hcp'][i%4],imageUrl:i===11?'https://images.test/landscape':i===9?'https://images.test/broken':i===8?'https://images.test/portrait':undefined,title:'خبر رقم '+(i+1),summary:'ملخص عربي لهذا الخبر',url:'https://publisher.ma/article/'+(i+1),publishedAt:'2026-09-'+String(i+1).padStart(2,'0')}));const listeners=new Set();window.__pushNews=()=>{articles=[{id:'new',sourceId:'emploi-public',title:'خبر جديد',summary:'محتوى عربي جديد',url:'https://publisher.ma/article/new',publishedAt:'2026-10-01'},...articles];listeners.forEach(fn=>fn())};window.__refreshes=0;export const newsService={sources:()=>[{id:'emploi-public',name:'التشغيل العمومي',enabled:true,builtIn:true},{id:'men',name:'وزارة التربية الوطنية',enabled:true,builtIn:true},{id:'finances',name:'وزارة الاقتصاد والمالية',enabled:true,builtIn:true},{id:'hcp',name:'المندوبية السامية للتخطيط',enabled:true,builtIn:true}],cachedArticles:()=>articles,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},refreshIfStale:async()=>{window.__refreshes++;return[]},refresh:async()=>[],addSource:()=>{},removeSource:()=>{}};",loader:'js'}));
  }}]
});
const styles=fs.readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync(path.join('dist/assets',name),'utf8')).join('\n');
const html='<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
const server=createServer((request,response)=>{
  const css=request.url==='/app.css',js=request.url==='/app.js';
  response.setHeader('Content-Type',css?'text/css; charset=utf-8':js?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  response.end(css?styles:js?fs.readFileSync(path.join(temp,'app.js')):html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:320,height:800}});
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://images.test/**',route=>{
    if(route.request().url().endsWith('/broken'))return route.abort();
    const portrait=route.request().url().endsWith('/portrait');
    return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="'+(portrait?160:320)+'" height="'+(portrait?800:160)+'"><rect width="100%" height="100%" fill="teal"/></svg>'});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  const rail=page.locator('[data-home-news-rail]');
  await rail.waitFor();
  assert.equal(await rail.locator('article').count(),8,'Limit the home preview to eight recent items');
  assert.equal(await rail.locator('article').first().getAttribute('data-news-card'),'item-12','Newest dated news comes first');
  assert.equal(await page.getByRole('button',{name:'الخبر السابق',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'الخبر التالي',exact:true}).click();
  await page.getByText('2 / 8',{exact:true}).waitFor();
  await rail.press('ArrowLeft');
  await page.getByText('3 / 8',{exact:true}).waitFor();
  await page.locator('[data-news-card="item-10"] [data-news-image-state="failed"]').waitFor({state:'attached'});
  await rail.press('ArrowLeft');
  await page.getByText('4 / 8',{exact:true}).waitFor();
  await page.locator('[data-news-card="item-9"] .news-preview-photo').waitFor({state:'visible'});
  const compact=await rail.locator('article').evaluateAll(nodes=>nodes.map(node=>({
    height:node.getBoundingClientRect().height,
    footer:node.querySelector('footer').getBoundingClientRect().top,
    accent:node.style.getPropertyValue('--news-accent'),
    icon:!!node.querySelector('[data-news-source] svg')
  })));
  assert.ok(compact.every(card=>card.height===300&&Math.abs(card.footer-compact[0].footer)<1),'Mixed images, missing images and portrait images keep the same height and footer alignment');
  assert.ok(compact.every(card=>card.icon),'Every news item has a distinct source badge icon');
  assert.deepEqual([...new Set(compact.map(card=>card.accent))].sort(),['#0F766E','#2F5AA8','#8B5CF6','#B45309'].sort(),'Original source colors are retained');
  assert.equal(await page.locator('[data-news-card="item-10"] img').count(),0,'A failed preview image leaves no broken element');
  assert.equal(await page.locator('[data-news-card="item-11"] img').count(),0,'A text-only preview adds no fake image');
  const missingTextWidth=await page.locator('[data-news-card="item-11"] .news-preview-body > div').first().evaluate(node=>node.getBoundingClientRect().width);
  const failedTextWidth=await page.locator('[data-news-card="item-10"] .news-preview-body > div').first().evaluate(node=>node.getBoundingClientRect().width);
  assert.ok(Math.abs(missingTextWidth-failedTextWidth)<1,'A failed image leaves no flex gap and text receives the full available width');
  assert.equal(await page.locator('[data-news-card="item-9"] .news-preview-photo').evaluate(node=>getComputedStyle(node).objectFit),'contain','Portrait previews preserve the full picture');
  await page.getByRole('button',{name:'الخبر السابق',exact:true}).click();
  await page.getByText('3 / 8',{exact:true}).waitFor();
  await page.getByRole('button',{name:'الخبر السابق',exact:true}).click();
  await page.getByText('2 / 8',{exact:true}).waitFor();
  await page.evaluate(()=>window.__pushNews());
  await page.waitForFunction(()=>document.querySelector('[data-home-news-rail] article')?.getAttribute('data-news-card')==='new');
  assert.equal(await rail.locator('article').first().getAttribute('data-news-card'),'new','A refresh updates home preview without reopening it');
  assert.equal(await page.evaluate(()=>window.__refreshes),1,'Home refresh is issued once');
  const nav=page.getByRole('navigation',{name:'التنقل الرئيسي'});
  for (const width of [320,360,768]) {
    await page.setViewportSize({width,height:800});
    assert.equal(await nav.getByRole('button').count(),6);
    const boxes=await nav.getByRole('button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}));
    assert.ok(boxes.every(box=>box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1),'All six destinations fit with usable touch targets');
    assert.ok(boxes.every(box=>Math.abs(box.y-boxes[0].y)<1),'Navigation remains one row');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'The carousel does not overflow the page');
  }
  await page.setViewportSize({width:320,height:800});
  await page.getByRole('button',{name:'كل الأخبار',exact:true}).click();
  await page.getByRole('heading',{name:'أخبار المراجعة والمباريات',exact:true}).waitFor();
  assert.equal(await nav.getByRole('button',{name:'الأخبار',exact:true}).getAttribute('aria-current'),'page');
  await nav.getByRole('button',{name:'الرئيسية',exact:true}).click();
  await rail.waitFor();
  await nav.getByRole('button',{name:'الأخبار',exact:true}).click();
  await page.getByRole('heading',{name:'أخبار المراجعة والمباريات',exact:true}).waitFor();
  await page.getByRole('button',{name:/التشغيل العمومي/}).click();
  assert.ok((await page.getByRole('button',{name:/التشغيل العمومي/}).getAttribute('style')).includes('rgb(47, 90, 168)'),'The selected source filter retains its own color');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  assert.deepEqual(errors,[]);
  console.log('Home news and six-destination navigation passed: sorting, limits, live refresh, RTL scrolling, keyboard, navigation, touch targets and widths.');
} finally {
  await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
}
