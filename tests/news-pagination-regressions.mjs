import assert from 'node:assert/strict';
import { newsEngine } from '../scripts/news-engine.mjs';
const engine=await newsEngine();
const source={id:'user-one',name:'مصدر المستخدم',url:'https://publisher.ma/news',kind:'web',builtIn:false,enabled:true,
  extraction:{item:'.story',title:'h2',link:'h2 a',summary:'p',date:'time'}};
const story=(n)=>`<article class="story"><h2><a href="/story/${n}">عنوان خبر مستقل للاختبار ${n}</a></h2><p>ملخص الخبر</p><time datetime="2026-10-01"></time></article>`;
const parse=(markup,url=source.url,offset)=>engine.parseNewsPage(markup,source,url,offset);
assert.equal(parse(story(1)+'<ul class="pagination"><li class="active">1</li><li><a href="?page=2">2</a></li></ul>').next.url,source.url+'?page=2');
assert.equal(parse(story(1)+'<nav class="pager"><span aria-current="page">٢</span><a href="?page=1">١</a><a href="?page=3">٣</a></nav>',source.url+'?page=2').next.url,source.url+'?page=3');
assert.equal(parse(story(1)+'<ul class="pagination"><li class="active">1</li><a href="?page=1">2</a></ul>').next.url,source.url+'?page=1','Drupal starts at zero but labels start at one');
assert.equal(parse(story(1)+'<a rel="next" href="https://evil.ma/?page=2">التالي</a><ul class="pagination"><span class="active">1</span><a href="?page=2">2</a></ul>').next.url,source.url+'?page=2','Unsafe first link must not mask safe pagination');
assert.equal(parse(story(1)+'<a rel="next" href="#">التالي</a>').next,undefined);
assert.equal(parse(story(1)+'<div class="pagination"><a class="disabled next" href="?page=2">التالي</a></div>').next,undefined);
assert.equal(parse(story(1)+'<div class="nav-links"><div class="nav-previous"><a href="/page/2">Older entries</a></div></div>').next.url,'https://publisher.ma/page/2');

const longArchive='<form>'+Array.from({length:120},(_,n)=>story(n)).join('')+'</form>';
const first=parse(longArchive),second=parse(longArchive,source.url,50),last=parse(longArchive,source.url,100);
assert.equal(first.articles.length,50);assert.equal(second.articles.length,50);assert.equal(last.articles.length,20);
assert.equal(first.next.offset,50);assert.equal(second.next.offset,100);assert.equal(last.next,undefined);
assert.equal(new Set([...first.articles,...second.articles,...last.articles].map(article=>article.url)).size,120,'Form wrapper and per-page limits must not discard archive stories');
assert.equal(parse(story(1).replace('2026-10-01','2026-02-30')).articles[0].publishedAt,undefined,'Invalid calendar dates stay unknown');
assert.equal(parse(story(1).replace('2026-10-01','2026-10-01T00:30:00+0200')).articles[0].publishedAt,'2026-10-01T00:30:00+0200','Timezone offsets do not invalidate the local publication date');

const rssSource={...source,feedUrl:'https://publisher.ma/feed',kind:'rss'};
const rss='<rss><channel><title>News</title><item><title>عنوان خبر حديث طويل</title><link>https://publisher.ma/story/1</link><description>ملخص</description></item></channel></rss>';
assert.deepEqual(engine.parseNewsPage(rss,rssSource,rssSource.feedUrl).next,{url:source.url},'RSS falls back to the publisher archive for user sources too');
const pagedRss=rss.replace('</channel>','<atom:link xmlns:atom="http://www.w3.org/2005/Atom" rel="next" href="?page=2"/></channel>');
assert.equal(engine.parseNewsPage(pagedRss,rssSource,rssSource.feedUrl).next.url,rssSource.feedUrl+'?page=2');
assert.equal(engine.parseNewsPage(rss,{...rssSource,url:rssSource.feedUrl},rssSource.feedUrl).endReason,'feed-only');

const requested={url:source.url};
const snapshot={schemaVersion:1,sourceUrl:source.url,request:engine.cursorIdentity(requested),...first};
const rebound=engine.parseArchivePage(snapshot,{...source,id:'user-two'},requested);
assert.equal(rebound.articles[0].sourceId,'user-two','Snapshots are rebound to the actual source rather than built-in IDs');
assert.equal(engine.parseArchivePage({...snapshot,request:'wrong'},source,requested),undefined,'A hash collision or wrong page is rejected');
assert.equal(engine.parseArchivePage({...snapshot,next:{url:'https://evil.ma/'}},source,requested),undefined,'Snapshot pagination cannot leave publisher');
assert.equal(engine.parseArchivePage({...snapshot,articles:[{title:'Bad link',url:'http://publisher.ma/story/1'}]},source,requested),undefined);
assert.notEqual(engine.archivePageKey(requested),engine.archivePageKey({...requested,offset:50}));
const originalFetch=globalThis.fetch;
try {
  let requestedUrls=[];
  globalThis.fetch=async(url,options)=>{
    requestedUrls.push(url);assert.equal(options.redirect,'manual');
    return url===source.url?new Response(null,{status:301,headers:{location:'/news/'}}):new Response(story(1));
  };
  const redirected=await engine.newsDocument(source.url);
  assert.equal(redirected.url,source.url+'/');assert.equal(requestedUrls.length,2);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://evil.ma/'}});
  await assert.rejects(()=>engine.newsDocument(source.url),/غير آمن/);
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:source.url}});
  await assert.rejects(()=>engine.newsDocument(source.url),/متكرر/);
}finally{globalThis.fetch=originalFetch;}
console.log('Shared numeric/RTL/feed pagination, long archives, user-source identity and unsafe-link regressions passed');
