import { NewsPageCursor, NewsPageResult, NewsSource } from '../types';
import { publicNewsUrl, samePublisher } from './sourceAccess';

export function cursorIdentity(cursor: NewsPageCursor): string {
  return JSON.stringify([publicNewsUrl(cursor.url).href,cursor.offset||0]);
}
export function archivePageKey(cursor: NewsPageCursor): string {
  let a=0x811c9dc5,b=0x9e3779b9;
  for(const char of cursorIdentity(cursor)){
    a=Math.imul(a^char.charCodeAt(0),0x01000193);
    b=Math.imul(b^char.charCodeAt(0),0x85ebca6b);
  }
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}

export function parseArchivePage(value: unknown, source: NewsSource, requested: NewsPageCursor): NewsPageResult | undefined {
  if(!value||typeof value!=='object')return undefined;
  const record=value as Record<string,unknown>;
  if(record.schemaVersion!==1||record.request!==cursorIdentity(requested)||record.sourceUrl!==publicNewsUrl(source.url).href||!Array.isArray(record.articles))return undefined;
  const articles=record.articles.filter(item=>item&&typeof item.title==='string'&&item.title.length<=500&&typeof item.url==='string'&&samePublisher(item.url,source.url))
    .slice(0,50).map(item=>({...item,id:`${source.id}-${item.url}`,internalId:undefined,sourceId:source.id}));
  if(!articles.length)return undefined;
  let next:NewsPageCursor|undefined;
  if(record.next&&typeof record.next==='object'){
    const cursor=record.next as NewsPageCursor;
    if(typeof cursor.url!=='string'||!samePublisher(cursor.url,source.url)||!Number.isInteger(cursor.offset||0)||(cursor.offset||0)<0)return undefined;
    next={url:publicNewsUrl(cursor.url).href,offset:cursor.offset};
  }
  return {articles,next,endReason:record.endReason==='feed-only'?'feed-only':next?undefined:'end'};
}

export async function bundledNewsPage(source: NewsSource, cursor?: NewsPageCursor): Promise<NewsPageResult | undefined> {
  const requested=cursor||{url:source.feedUrl||source.url};
  // Only local published data is used; no third-party proxy receives user URLs.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const base=import.meta.env.BASE_URL||'/';
    const response=await fetch(`${base}news-pages/${archivePageKey(requested)}.json`,{signal:controller.signal});
    if(!response.ok)return undefined;
    const text=await response.text();
    if(text.length>512000)return undefined;
    return parseArchivePage(JSON.parse(text),source,requested);
  }catch{return undefined;}finally{clearTimeout(timer);}
}
