import { NewsArticle, NewsSource } from '../types';
import { internalNewsId, retainLatestNews } from '../services/newsIdentity';

import { newsSummary } from '../services/newsPresentation';

const SOURCES_KEY='raje3_news_sources_v1';
const CACHE_KEY='raje3_news_cache_v1';
const TRACK_KEY='raje3_news_tracker_v1';
type SourceTracker={seenIds:string[];pendingIds:string[];latestPublished:number};
function parse<T>(value:string|null,fallback:T):T{
  if(!value)return fallback;
  try{return JSON.parse(value) as T}catch{return fallback}
}
function rawArticles():NewsArticle[]{
  const value=parse<unknown>(localStorage.getItem(CACHE_KEY),[]);
  return Array.isArray(value)?value:[];
}
function tracker():Record<string,SourceTracker>{
  const value=parse<unknown>(localStorage.getItem(TRACK_KEY),{});
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,SourceTracker>:{};
}
function pruneTranslations(kept:NewsArticle[]){
  const key='raje3_news_translations_v1';
  const raw=localStorage.getItem(key);
  if(!raw)return;
  const value=parse<unknown>(raw,[]);
  if(!Array.isArray(value))return;
  const allowed=new Set(kept.map(article=>JSON.stringify([article.title,newsSummary(article.summary)])));
  const encoded=JSON.stringify(value.filter(entry=>typeof entry?.key==='string'&&allowed.has(entry.key)));
  if(encoded!==raw)localStorage.setItem(key,encoded);
}
function migrate():NewsArticle[]{
  const old=rawArticles();
  const kept=retainLatestNews(old,old);
  const encoded=JSON.stringify(kept);
  if(encoded!==JSON.stringify(old))localStorage.setItem(CACHE_KEY,encoded);
  pruneTranslations(kept);
  return kept;
}
export const newsStorage={
  customSources:():NewsSource[]=>parse(localStorage.getItem(SOURCES_KEY),[]),
  saveCustomSources:(sources:NewsSource[])=>localStorage.setItem(SOURCES_KEY,JSON.stringify(sources)),
  articles:():NewsArticle[]=>migrate(),
  saveArticles:(articles:NewsArticle[],trackChanges=true)=>{
    const previous=migrate();
    const kept=retainLatestNews(articles,previous);
    const state=tracker();
    for(const sourceId of new Set(kept.map(article=>article.sourceId))){
      const batch=kept.filter(article=>article.sourceId===sourceId);
      const old=state[sourceId];
      const previousIds=new Set(previous.filter(article=>article.sourceId===sourceId).map(article=>article.internalId||internalNewsId(article)));
      const seen=new Set(old?.seenIds||[...previousIds]);
      const watermark=old?.latestPublished||Math.max(0,...previous.filter(article=>article.sourceId===sourceId).map(article=>Date.parse(article.publishedAt||'')||0));
      const maxPublished= Math.max(watermark,...batch.map(article=>Date.parse(article.publishedAt||'')||0));
      const baseline=!!old||previousIds.size>0;
      const discovered=trackChanges&&baseline?batch.filter(article=>{
        const id=article.internalId!;
        const published=Date.parse(article.publishedAt||'')||0;
        return !seen.has(id)&&(!published||(article.publishedTimeKnown===false?published>=watermark:published>watermark));
      }).map(article=>article.internalId!):[];
      const ids=batch.map(article=>article.internalId!);
      state[sourceId]={
        seenIds:ids,pendingIds:[...new Set([...(old?.pendingIds||[]),...discovered])].filter(id=>ids.includes(id)),
        latestPublished:maxPublished,
      };
    }
    for(const sourceId of Object.keys(state))if(!kept.some(article=>article.sourceId===sourceId))delete state[sourceId];
    localStorage.setItem(CACHE_KEY,JSON.stringify(kept));
    localStorage.setItem(TRACK_KEY,JSON.stringify(state));
    pruneTranslations(kept);
    return kept;
  },
  pendingNewArticles:():NewsArticle[]=>{
    const state=tracker(),pending=new Set(Object.values(state).flatMap(source=>source.pendingIds||[]));
    return migrate().filter(article=>pending.has(article.internalId!));
  },
  markNewsNotified:(ids:string[])=>{
    const state=tracker(),handled=new Set(ids);
    for(const source of Object.values(state))source.pendingIds=(source.pendingIds||[]).filter(id=>!handled.has(id));
    localStorage.setItem(TRACK_KEY,JSON.stringify(state));
  },
};
