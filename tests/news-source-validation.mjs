import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'news-source-validation-'));
await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {NewsPage} from './src/views/NewsPage';
import * as custom from './src/features/news/providers/customProvider';
import * as access from './src/features/news/providers/sourceAccess';
import {parseRss} from './src/features/news/providers/rssProvider';
import {newsService} from './src/features/news/services/newsService';
import {newsStorage} from './src/features/news/storage/newsStorage';
window.api={...custom,...access,parseRss,newsService,newsStorage};
window.__fixtures={}; window.__aiCalls=[]; window.__nativeCalls=[];
window.__native=false; window.__settings={item:'.story',title:'.headline',link:'a',summary:'.intro'};
window.fetch=async(raw, options)=>{
 const url=String(raw); window.__requests=(window.__requests||[]).concat(url);
 if(url.includes('news-feed.json')) return new Response(JSON.stringify({articles:[]}));
 if(!(url in window.__fixtures)) throw new TypeError('Network/CORS unavailable');
 const fixture=window.__fixtures[url]; if(fixture.error) throw new TypeError('Blocked');
 return new Response(fixture.body,{status:fixture.status||200});
};
const root=createRoot(document.getElementById('app')); window.__mount=()=>root.render(<NewsPage/>);
`, resolveDir: process.cwd(), sourcefile: 'source-harness.tsx', loader: 'tsx' }, bundle: true,
  outfile: path.join(temp,'app.js'), format:'iife', platform:'browser', define: {'import.meta.env.BASE_URL':'"/"'},
  plugins:[{name:'source-boundaries',setup(builder){
    builder.onResolve({filter:/^@capacitor\/core$/},()=>({path:'native',namespace:'fixture'}));
    builder.onResolve({filter:/services\/geminiAi$/},()=>({path:'ai',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='native'?`
      export const Capacitor={isNativePlatform:()=>window.__native,getPlatform:()=>window.__native?'android':'web'};
      export const CapacitorHttp={get:async(options)=>{window.__nativeCalls.push(options);return{status:200,data:'native text'};}};
      export const registerPlugin=()=>({});
    `:`export const proposeNewsExtraction=async(excerpt)=>{window.__aiCalls.push(excerpt);return window.__settings;};
      export const translateNewsWithGemini=async()=>{throw new Error('Not used');};` }));
  }}] });
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/app.js'?fs.readFileSync(path.join(temp,'app.js')):'<html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div id="app"></div><script src="/app.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:390,height:844}});
page.on('pageerror',error=>console.error('Harness page error:',error.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(()=>!!window.api,{},{timeout:5000});
const results=await page.evaluate(async()=>{
 const {api}=window, verified=[];
 const check=(value,label)=>{if(!value)throw new Error(label);verified.push(label);};
 for(const url of ['http://publisher.ma/news','https://user:pass@publisher.ma/','https://127.0.0.1/','https://localhost/','https://private.local/','https://publisher.ma:8000/','javascript:alert(1)']){
   let rejected=false;try{api.publicNewsUrl(url);}catch{rejected=true;}check(rejected,'reject '+url);
 }
 check(!api.samePublisher('https://evil.ma/story','https://publisher.ma/news'),'external publisher rejected');
 const markup='<nav><article><h2><a href="/menu">Navigation menu title</a></h2></article></nav>'+[1,2].map(i=>'<article><h2><a href="/news/'+i+'">عنوان خبر مهم للمباراة '+i+'</a></h2><p>ملخص خبر حقيقي</p><time datetime="2026-10-03"></time></article>').join('');
 window.__fixtures['https://publisher.ma/news']={body:markup};
 const html=await api.previewSource('مصدر اختبار','https://publisher.ma/news');
 check(html.articles.length===2,'HTML cards exclude navigation');
 check(html.articles[0].publishedAt==='2026-10-03','explicit publication date');
 check(api.newsService.sources().every(s=>s.name!=='مصدر اختبار'),'preview does not persist');
 const saved=api.newsService.addSource(html);
 check(api.newsService.cachedArticles().filter(a=>a.sourceId===saved.id).length===2,'approval persists preview articles');
 let duplicate=false;try{api.newsService.addSource(html);}catch{duplicate=true;}check(duplicate,'duplicate source rejected');
 window.__fixtures['https://publisher.ma/news']={body:markup.replace('عنوان خبر مهم','عنوان خبر محدث')};
 await api.newsService.refresh();
 check(api.newsService.cachedArticles().some(a=>a.sourceId===saved.id&&a.title.includes('محدث')),'custom HTML refresh actually fetches');
 const regularFetch=window.fetch;let release;let startedResolve;
 const started=new Promise(resolve=>{startedResolve=resolve;});
 window.fetch=async(raw,options)=>{
   if(String(raw)==='https://publisher.ma/news') {startedResolve();return new Promise(resolve=>{release=()=>resolve(new Response(markup));});}
   return regularFetch(raw,options);
 };
 const pendingRefresh=api.newsService.refresh();await started;
 api.newsService.removeSource(saved.id);release();await pendingRefresh;window.fetch=regularFetch;
 check(!api.newsService.cachedArticles().some(a=>a.sourceId===saved.id),'deleted source cannot return after pending refresh');
 const rss='<rss><channel><item><title>عنوان RSS صحيح</title><link>https://publisher.ma/news/1</link><pubDate>bad date</pubDate><description><![CDATA[<script>alert(1)</script><p>متن آمن</p>]]></description></item><item><title>خبر خارجي</title><link>javascript:alert(1)</link></item></channel></rss>';
 window.__fixtures['https://publisher.ma/feed']={body:rss};
 window.__fixtures['https://publisher.ma/']={body:'<link rel="alternate" type="application/rss+xml" href="/feed">'};
 const feed=await api.previewSource('RSS','https://publisher.ma/');
 check(feed.source.kind==='rss'&&feed.source.feedUrl==='https://publisher.ma/feed','advertised RSS discovery');
 check(feed.articles.length===1&&!feed.articles[0].publishedAt&&!feed.articles[0].content.includes('alert'),'RSS unsafe links, scripts and invalid dates rejected');
 const atom=api.parseRss('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>عنوان خبر Atom</title><link rel="self" href="https://publisher.ma/api/1"/><link rel="alternate" href="https://publisher.ma/news/atom"/></entry></feed>',feed.source);
 check(atom[0].url.endsWith('/news/atom'),'Atom uses article alternate link');
 window.__fixtures['https://publisher.ma/empty']={body:'<p>صفحة عامة دون أخبار</p>'};
 let unsupported=false;try{await api.previewSource('فارغ','https://publisher.ma/empty');}catch(e){unsupported=e instanceof api.UnsupportedNewsSource;}check(unsupported,'unsupported listing rejected');
 let network=false;try{await api.previewSource('شبكة','https://publisher.ma/blocked');}catch(e){network=!(e instanceof api.UnsupportedNewsSource)&&e.message.includes('الوصول');}check(network,'network errors distinct from format errors');
 const pageData={url:'https://publisher.ma/ai',text:'<form>secret form</form><script>secret script</script><div class="story"><a href="/a?token=secret"><span class="headline">خبر مهني مهم رقم واحد</span></a><p class="intro">وصف</p></div><div class="story"><a href="/b"><span class="headline">خبر مهني مهم رقم اثنين</span></a></div>'};
 const excerpt=api.aiPageExcerpt(pageData);
 check(!excerpt.includes('secret')&&!excerpt.includes('script'),'AI excerpt excludes forms scripts and query strings');
 const configured=api.previewConfiguredSource('مخصص',pageData,window.__settings);
 check(configured.articles.length===2,'AI selectors tested against real DOM');
 let fabricated=false;try{api.previewConfiguredSource('خيال',pageData,{item:'.missing',title:'h2',link:'a'});}catch{fabricated=true;}check(fabricated,'fabricated AI selectors rejected');
 let unsafe=false;try{api.validateExtraction({item:'article;alert(1)',title:'h2',link:'a'});}catch{unsafe=true;}check(unsafe,'code-like selector rejected');
 const before={...localStorage};const set=Storage.prototype.setItem;let fail=true;
 Storage.prototype.setItem=function(k,v){if(k==='raje3_news_tracker_v1'&&fail){fail=false;throw new Error('quota');}return set.call(this,k,v);};
 let quota=false;try{api.newsService.addSource(configured);}catch(e){quota=e.message.includes('الحفظ');}finally{Storage.prototype.setItem=set;}
 check(quota&&JSON.stringify({...localStorage})===JSON.stringify(before),'failed save rolls back all news keys');
 window.__native=true;await api.newsDocument('https://publisher.ma/native');window.__native=false;
 check(window.__nativeCalls[0].disableRedirects===true,'native request forbids redirects');
 window.__fixtures['https://publisher.ma/ai']={body:pageData.text};
 return verified;
});
assert.ok(results.length>=20);
await page.evaluate(()=>window.__mount());
await page.getByRole('button',{name:'إضافة مصدر',exact:true}).click();
await page.getByLabel('اسم المصدر',{exact:true}).fill('مصدر مخصص');
await page.getByLabel('رابط قسم الأخبار أو RSS').fill('https://publisher.ma/ai');
await page.getByRole('button',{name:'فحص ومعاينة الأخبار'}).click();
await page.getByRole('alert').waitFor();
const ai=page.getByRole('button',{name:'محاولة إعداد المصدر بالذكاء الاصطناعي'});
assert.equal(await ai.isEnabled(),false,'AI requires explicit consent');
assert.equal(await page.evaluate(()=>window.__aiCalls.length),0);
await page.getByRole('checkbox').check();await ai.click();
await page.getByRole('region',{name:'معاينة أخبار المصدر'}).waitFor();
assert.equal(await page.evaluate(()=>window.api.newsService.sources().filter(s=>!s.builtIn).length),0,'AI preview not yet saved');
assert.equal(await page.evaluate(()=>window.__aiCalls.length),1);
await page.getByRole('button',{name:'اعتماد وإضافة المصدر'}).click();
await page.waitForFunction(()=>window.api.newsService.sources().filter(s=>!s.builtIn).length===1);
await page.getByRole('button',{name:/مصدر مخصص\s*2/}).waitFor();
assert.equal(await page.getByRole('region',{name:'معاينة أخبار المصدر'}).count(),0,'approval closes preview');
assert.equal(await page.evaluate(()=>window.api.newsService.cachedArticles().filter(a=>a.sourceId.startsWith('user-')).length),2,'approved news visible in cache');
assert.equal(await page.evaluate(()=>window.api.newsService.sources().filter(s=>!s.builtIn).length),1);
console.log('News source validation passed: '+results.length+' parser/security/storage checks; consent, preview and approval UI.');
} finally {await browser.close();server.close();fs.rmSync(temp,{recursive:true,force:true});}
