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
  else if(url.includes('men.gov.ma/مستجدات'))body='<nav><a href="/مباريات">مباراة توظيف من القائمة</a></nav><article><a href="/update-one/المستجدات"><h5>مستجد تربوي أول للتحقق من الاستخراج</h5><span datetime="2026-10-01T12:00:00+0100">1 أكتوبر</span></a></article><article><a href="/update-two/المستجدات"><h5>مستجد تربوي ثان للتحقق من الاستخراج</h5></a></article>';
  return {ok:true,text:async()=>body};
};
try {
  const {fetchEmploiPublic,fetchMen}=await import('../scripts/fetch-news.mjs');
  const emploi=await fetchEmploiPublic();
  assert.equal(emploi.length,2,'Prefer Arabic equivalent and retain French-only item');
  assert.ok(emploi.some(item=>item.title.includes('مهندسين')));
  assert.ok(emploi.some(item=>item.title.includes('techniciens')));
  assert.equal((await fetchMen()).length,2,'Extract MEN update cards, excluding navigation');
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

const defaultsText=fs.readFileSync('src/features/news/config/defaultSources.ts','utf8');
assert.equal(defaultsText.includes('open-data-ma'),false,'Removed API source is not configured');
assert.equal(fs.readFileSync('scripts/fetch-news.mjs','utf8').includes('data.gov.ma'),false,'Build does not fetch the removed API source');
const identity=loadModule('src/features/news/services/newsIdentity.ts',{});
const presentation=loadModule('src/features/news/services/newsPresentation.ts',{});
const newsStorageTest=loadModule('src/features/news/storage/newsStorage.ts',{'../services/newsIdentity':identity,'../services/newsPresentation':presentation},{
  localStorage:{getItem:key=>key.includes('cache')?JSON.stringify([{id:'api',sourceId:'open-data-ma',title:'API',url:'https://data.gov.ma/story'},{id:'kept',sourceId:'hcp',title:'Retained story',url:'https://www.hcp.ma/retained_a1.html'}]):null,setItem:()=>{}}
});
assert.equal(newsStorageTest.newsStorage.articles().length,1,'Previously cached API news are removed');
assert.equal(newsStorageTest.newsStorage.articles()[0].id,'kept','Other cached sources are preserved');

const {publicationDate,newsDocument,plainNewsText,retainNewsFeed}=await import('../scripts/news-document.mjs');
assert.equal(publicationDate('04/10/2026').publishedAt,'2026-10-04');
assert.equal(publicationDate('04/10/2026').publishedTimeKnown,false);
assert.equal(publicationDate('31/02/2026').publishedAt,undefined);
assert.equal(publicationDate('2026-10-04T14:32:00+01:00').publishedAt,'2026-10-04T13:32:00.000Z');
assert.equal(publicationDate('2026-10-04T14:32').publishedLocalTime,true);
assert.equal(publicationDate('Not a date').publishedAt,undefined);
const documentFixture=newsDocument('<meta property="article:published_time" content="2026-10-04T14:32:00+01:00"><article><nav>Menu</nav><p>'+('Useful official information. '.repeat(6))+'</p><script>alert(1)</script></article>');
assert.equal(documentFixture.publishedTimeKnown,true);
assert.ok(documentFixture.content.includes('Useful official information'));
assert.equal(documentFixture.content.includes('alert'),false);
assert.equal(plainNewsText('&lt;p&gt;Safe text&lt;/p&gt;').includes('<p>'),false);
const articleBase={id:'external-id',sourceId:'hcp',title:'Original title',url:'https://www.hcp.ma/test_a1.html',publishedAt:'2026-10-01T10:00:00Z',publishedTimeKnown:true};
assert.equal(identity.internalNewsId(articleBase),identity.internalNewsId({...articleBase,title:'Changed title',id:'different-provider-id'}),'Editing the title does not change a concrete story identity');
assert.notEqual(identity.internalNewsId(articleBase),identity.internalNewsId({...articleBase,sourceId:'men'}),'Identities are scoped to a source');
const many=Array.from({length:15},(_,index)=>({...articleBase,id:'id'+index,url:'https://www.hcp.ma/test_a'+(index+1)+'.html',publishedAt:'2026-09-'+String(index+1).padStart(2,'0')}));
const kept=identity.retainLatestNews([...many,...many.map(article=>({...article,sourceId:'men'}))]);
assert.equal(kept.filter(article=>article.sourceId==='hcp').length,10);
assert.equal(kept.filter(article=>article.sourceId==='men').length,10);
assert.equal(kept[0].id,'id14','Most recent publication first');
assert.equal(retainNewsFeed(many).length,10,'Build feed uses the same retention bound');
const persistent=new Map();
persistent.set('raje3_news_cache_v1',JSON.stringify(many));
const stateStorage=loadModule('src/features/news/storage/newsStorage.ts',{'../services/newsIdentity':identity,'../services/newsPresentation':presentation},{
  localStorage:{getItem:key=>persistent.get(key)||null,setItem:(key,value)=>persistent.set(key,value)}
}).newsStorage;
assert.equal(stateStorage.articles().length,10);
assert.equal(JSON.parse(persistent.get('raje3_news_cache_v1')).length,10,'Migration physically drops old article bodies');
stateStorage.saveArticles(many);
assert.equal(stateStorage.pendingNewArticles().length,0,'Initial population is a baseline');
const newItem={...articleBase,id:'brand-new',url:'https://www.hcp.ma/new_a99.html',content:'Detailed text'};
stateStorage.saveArticles([newItem,...many]);
assert.equal(stateStorage.pendingNewArticles().length,1);
const newId=stateStorage.pendingNewArticles()[0].internalId;
stateStorage.saveArticles([{...newItem,title:'Updated title'},...many]);
assert.equal(stateStorage.pendingNewArticles().length,1,'Re-fetching or editing a story does not queue it twice');
stateStorage.markNewsNotified([newId]);
assert.equal(stateStorage.pendingNewArticles().length,0);
assert.ok(Object.values(JSON.parse(persistent.get('raje3_news_tracker_v1'))).every(source=>source.seenIds.length<=10&&source.pendingIds.length<=10),'Notification metadata is bounded');

assert.notEqual(presentation.newsDate('2026-10-01T10:30:00Z',true),presentation.newsDate('2026-10-01',false),'Known hours are displayed while date-only publications do not acquire a fake time');
console.log('News publication, identity, retention, detail extraction and future-notification baseline checks passed');

const { extractMenUpdates, extractFinancesUpdates, extractEmploiAnnouncements } = await import('../scripts/news-official.mjs');
const menCards = extractMenUpdates('<nav><a href="/مباريات">مباراة توظيف وهمية في التنقل</a></nav><article><a href="/school/المستجدات"><h5>افتتاح الموسم الدراسي الجديد بالمؤسسات التعليمية</h5><span datetime="2026-09-07T15:47:44+0100">7 شتنبر</span></a></article>', 'https://www.men.gov.ma/مستجدات');
assert.equal(menCards.length,1);
assert.equal(menCards[0].publishedAt,'2026-09-07T14:47:44.000Z');
assert.equal(extractMenUpdates('<article><a href="https://unrelated.ma/story"><h5>خبر خارجي لا ينتمي إلى المصدر الرسمي</h5></a></article>','https://www.men.gov.ma/مستجدات').length,0);
const financeCards = extractFinancesUpdates('<a href="/document.pdf">توظيف فائض الخزينة لمدة ستة أيام</a><div class="row"><div><h2><a href="مستجدة.aspx?fiche=7815">تمويل برنامج تطوير البنيات التحتية للمطارات</a></h2><p>29/09/2026</p><p>ملخص رسمي لبرنامج تمويل البنيات التحتية والمطارات المغربية.</p></div></div>', 'https://www.finances.gov.ma/ar/Pages/مستجدات.aspx');
assert.equal(financeCards.length,1);
assert.equal(financeCards[0].publishedAt,'2026-09-29');
assert.ok(financeCards[0].summary.includes('ملخص رسمي'));
assert.equal(extractEmploiAnnouncements('<a href="/ar/الجدول-الزمني/المباريات">الجدول الزمني للمباريات</a>', 'https://www.emploi-public.ma/ar/قائمة-المباريات').length,0);
const bundles=loadModule('src/features/news/services/newsBundle.ts',{});
const corrected={id:'new',sourceId:'men',title:'مستجد صحيح',url:'https://www.men.gov.ma/news'};
const previous=[{...corrected,id:'wrong',title:'قائمة قديمة'}, {...corrected,id:'user',sourceId:'user-1'}];
const bundle=bundles.parseNewsBundle({schemaVersion:2,refreshedSourceIds:['men','finances','user-1'],articles:[corrected,{...corrected,id:'bad',url:'javascript:alert(1)'}]});
assert.equal(bundle.articles.length,1);
assert.equal(bundles.mergeNewsBundle(bundle,previous).length,2,'Successful snapshots replace only their own old official news');
assert.ok(bundles.mergeNewsBundle(bundle,previous).some(item=>item.id==='user'),'Custom-source cache survives');
assert.equal(bundles.mergeNewsBundle(bundles.parseNewsBundle({schemaVersion:2,refreshedSourceIds:['men'],articles:[]}),previous).length,2,'Empty fetch preserves last successful cache');
console.log('Official source sections, navigation exclusion, dates and snapshot recovery checks passed');

const cleanMen=newsDocument('<article><div class="content article__body"><p>هذا متن خبر تربوي رسمي طويل بما يكفي لاختبار استخراج المحتوى من حاوية الخبر الصحيحة.</p><div><p>تفاصيل إضافية داخل حاوية متداخلة يجب الاحتفاظ بها.</p></div></div><h4>شارك هذا المقال</h4><p>المزيد من المستجدات وخبر آخر غير مرتبط</p></article>');
assert.ok(cleanMen.content.includes('تفاصيل إضافية'));
assert.equal(cleanMen.content.includes('شارك هذا المقال'),false);
assert.equal(cleanMen.content.includes('خبر آخر'),false);
