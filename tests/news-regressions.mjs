import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { collectLocalizedPages, discoverArabicUrls, preferArabicStories, stableNewsId } from '../scripts/news-language.mjs';
const sourceUrl = 'https://publisher.ma/fr/news';
assert.deepEqual(discoverArabicUrls('<link rel="stylesheet" href="style.css"><link href="/ar/news" hreflang="ar-MA" rel="alternate"><a href="https://unrelated.ma/ar">العربية</a>', sourceUrl), ['https://publisher.ma/ar/news']);
assert.deepEqual(discoverArabicUrls('<a href="/ar/news">العربية</a>', sourceUrl), ['https://publisher.ma/ar/news']);
const french = { id:'fr', sourceId:'test', url:'https://publisher.ma/fr/details/concours/11111111-1111-1111-1111-111111111111', title:'Concours de recrutement' };
const arabic = { ...french, id:'ar', url:'https://publisher.ma/ar/تفاصيل/المباريات/11111111-1111-1111-1111-111111111111', title:'مباراة توظيف مهندسين' };
const onlyFrench = { ...french, id:'fr-only', url:'https://publisher.ma/fr/details/concours/22222222-2222-2222-2222-222222222222' };
assert.equal(preferArabicStories([french,arabic,onlyFrench]).length, 2);
assert.equal(preferArabicStories([french,arabic])[0].title, arabic.title);
assert.equal(preferArabicStories([{ ...french,url:sourceUrl,title:'First' },{ ...french,url:sourceUrl,title:'Second' }]).length, 2, 'A listing URL can hold multiple different stories');
assert.notEqual(stableNewsId('test','https://same-prefix.ma/story/one'), stableNewsId('test','https://same-prefix.ma/story/two'));
const retained = await collectLocalizedPages([{url:'https://publisher.ma/ar/news',fallbackUrls:[sourceUrl]}], async url => {
  if (url.includes('/ar/')) throw new Error('404');
  return 'French';
}, () => [onlyFrench]);
assert.equal(retained[0].id, 'fr-only', 'Unavailable Arabic must not hide the available news');

function loadModule(path, imports, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in imports,'Unexpected import '+name);return imports[name];},console,URL,Map,Set,Promise,...globals});
  return exports;
}
const language = loadModule('src/features/news/services/newsLanguage.ts',{});
assert.equal(language.preferArabicArticles([french,arabic])[0].title,arabic.title);
assert.equal(language.needsArabicTranslation('عنوان عربي','Résumé en français'),true);
assert.equal(language.needsArabicTranslation('عنوان الخبر','ملخص عربي'),false);
assert.equal(language.localizedValue({fr:'French',ar:'العربية'}),'العربية');
assert.equal(language.localizedValue('{"fr":"French","ar":"العربية"}'),'العربية');

let calls=0, fail=false, release;
const storage = new Map();
const translation = loadModule('src/features/news/services/newsTranslation.ts',{
  '@capacitor/core':{
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},
    registerPlugin:()=>({translate:async({title,summary})=>{
      calls++;
      if(fail)throw new Error('Offline model not installed');
      if(release===undefined)await new Promise(resolve=>{release=resolve;});
      return{title:'عنوان مترجم',summary:summary?'ملخص مترجم':''};
    }}),
  },
  './newsLanguage':language,
},{
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
});
const first=translation.translateNews('Concours de recrutement','Résumé du concours');
const second=translation.translateNews('Concours de recrutement','Résumé du concours');
await Promise.resolve();release();
assert.equal((await first).title,'عنوان مترجم');await second;
assert.equal(calls,1,'Concurrent clicks share a translation request');
await translation.translateNews('Concours de recrutement','Résumé du concours');
assert.equal(calls,1,'Cached translations work without another request');
fail=true;
await assert.rejects(translation.translateNews('Autre titre','Résumé'),/Offline/);
assert.equal(translation.cachedNewsTranslation('Autre titre','Résumé'),undefined,'Failed translation must not replace original/cache');
assert.equal(translation.cachedNewsTranslation('Concours de recrutement','Changed summary'),undefined,'Cache depends on exact displayed text');

const originalFetch=globalThis.fetch;
globalThis.fetch=async raw=>{
  const url=decodeURIComponent(String(raw));
  let body='';
  if(url.includes('emploi-public.ma/ar/قائمة-المباريات')) body='<a href="/ar/تفاصيل/المباريات/11111111-1111-1111-1111-111111111111">مباراة توظيف مهندسين وتقنيين</a>';
  else if(url.includes('emploi-public.ma/fr/concours-liste')) body='<a href="'+french.url.replace('publisher.ma','www.emploi-public.ma')+'">Concours de recrutement des ingénieurs</a><a href="'+onlyFrench.url.replace('publisher.ma','www.emploi-public.ma')+'">Concours de recrutement de techniciens</a>';
  else if(url.includes('emploi-public.ma'))body='';
  else if(url.includes('men.gov.ma/مباريات'))body='<table><tr><td>مباراة توظيف أساتذة التعليم الابتدائي</td><td>01/10/2026</td></tr><tr><td>مباراة توظيف أساتذة التعليم الثانوي</td><td>02/10/2026</td></tr></table>';
  return {ok:true,text:async()=>body};
};
try {
  const {fetchEmploiPublic,fetchMen}=await import('../scripts/fetch-news.mjs');
  const emploi=await fetchEmploiPublic();
  assert.equal(emploi.length,2,'Prefer Arabic equivalent and retain French-only item');
  assert.ok(emploi.some(item=>item.title.includes('مهندسين')));
  assert.ok(emploi.some(item=>item.title.includes('techniciens')));
  assert.equal((await fetchMen()).length,2,'Preserve different MEN entries with one listing URL');
} finally {globalThis.fetch=originalFetch;}
console.log('News Arabic preference, fallback, exact-content translation cache and parser checks passed.');

const { imageUrl, inlineImage, articleImage, feedImage, enrichArticleImages } = await import('../scripts/news-images.mjs');
assert.equal(imageUrl('/photo.jpg?a=1&amp;b=2', 'https://publisher.ma/news/1'), 'https://publisher.ma/photo.jpg?a=1&b=2');
assert.equal(imageUrl('javascript:alert(1)', sourceUrl), undefined);
assert.equal(articleImage('<meta content="/photo.jpg" property="og:image">', sourceUrl), 'https://publisher.ma/photo.jpg');
assert.equal(articleImage('<img src="/logo.png"><article><img data-src="/news.jpg"></article>', sourceUrl), 'https://publisher.ma/news.jpg');
assert.equal(articleImage('<header><img src="/logo.png"></header>', sourceUrl), undefined);
assert.equal(feedImage('<enclosure type="audio/mp3" url="/audio.mp3"/><description><![CDATA[<img src="/news.jpg">]]></description>', sourceUrl), 'https://publisher.ma/news.jpg');
assert.equal(feedImage('<media:thumbnail url="/thumb.jpg"/>', sourceUrl), 'https://publisher.ma/thumb.jpg');
assert.equal(feedImage('<media:content medium="video" url="/movie.mp4"/>', sourceUrl), undefined);
const imageArticles = [
  {url:'https://publisher.ma/news/1'}, {url:'https://publisher.ma/news/2'},
  {url:'https://publisher.ma/list'}, {url:'https://publisher.ma/list'},
  {url:'https://publisher.ma/file.pdf'}, {url:'https://publisher.ma/news/3',imageUrl:'https://publisher.ma/existing.jpg'}
];
const fetchedImages=[];
await enrichArticleImages(imageArticles,async url=>{
  fetchedImages.push(url);
  if(url.endsWith('/2'))throw new Error('Offline');
  return '<meta property="og:image" content="/news.jpg">';
});
assert.equal(imageArticles[0].imageUrl,'https://publisher.ma/news.jpg');
assert.equal(imageArticles[1].imageUrl,undefined);
assert.deepEqual(fetchedImages,['https://publisher.ma/news/1','https://publisher.ma/news/2']);
console.log('News image extraction and bounded enrichment regressions passed');

assert.equal(preferArabicStories([{...french,imageUrl:'https://publisher.ma/story.jpg'},arabic])[0].imageUrl,'https://publisher.ma/story.jpg','Arabic preference retains the same story image');
assert.equal(preferArabicStories([arabic,{...arabic,imageUrl:'https://publisher.ma/story.jpg'}])[0].imageUrl,'https://publisher.ma/story.jpg','Image from a duplicate enriches the original');

assert.equal(feedImage('<media:content medium="image" url="/image?id=1"/>', sourceUrl), 'https://publisher.ma/image?id=1');
