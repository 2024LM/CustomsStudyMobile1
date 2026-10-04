import { NewsArticle, NewsSource } from '../types';
import { internalNewsId, mergeNewsForBrowsing, retainLatestNews, NEWS_LIMIT_PER_SOURCE } from '../services/newsIdentity';

const SOURCES_KEY='raje3_news_sources_v1';
const CACHE_KEY='raje3_news_cache_v1';
const PREFS_KEY='raje3_news_preferences_v1';
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
function compactTracker(state:Record<string,SourceTracker>, articles:NewsArticle[]){
  const bySource=new Map<string,NewsArticle[]>();
  for(const article of articles){
    const list=bySource.get(article.sourceId)||[];
    list.push(article);
    bySource.set(article.sourceId,list);
  }
  for(const sourceId of Object.keys(state)){
    const ids=new Set((bySource.get(sourceId)||[]).slice(0,NEWS_LIMIT_PER_SOURCE).map(article=>article.internalId||internalNewsId(article)));
    state[sourceId]={
      ...state[sourceId],
      seenIds:(state[sourceId].seenIds||[]).filter(id=>ids.has(id)),
      pendingIds:(state[sourceId].pendingIds||[]).filter(id=>ids.has(id)),
    };
    if(!ids.size)delete state[sourceId];
  }
  return state;
}
function compactCache():NewsArticle[]{
  const old=rawArticles();
  const kept=retainLatestNews(old,old);
  if(JSON.stringify(kept)!==JSON.stringify(old))localStorage.setItem(CACHE_KEY,JSON.stringify(kept));
  const state=compactTracker(tracker(),kept);
  localStorage.setItem(TRACK_KEY,JSON.stringify(state));
  return kept;
}
function sourceTransaction<T>(write: () => T):T {
  const keys = [SOURCES_KEY, CACHE_KEY, TRACK_KEY, PREFS_KEY, 'raje3_news_translations_v1'];
  const previous = keys.map(key => localStorage.getItem(key));
  try { return write(); } catch {
    let recovered = true;
    keys.forEach((key, index) => {
      try {
        if (previous[index] === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous[index]!);
      } catch { recovered = false; }
    });
    throw new Error(recovered ? 'تعذر الحفظ على الجهاز. لم تُعتمد الإضافة.' : 'تعذر الحفظ واستعادة بعض بيانات الأخبار؛ تحقق من مساحة الجهاز قبل إعادة المحاولة.');
  }
}

export const newsStorage={
  addValidatedSource:(source:NewsSource,articles:NewsArticle[])=>sourceTransaction(()=>{
    newsStorage.saveCustomSources([...newsStorage.customSources(),source]);
    newsStorage.saveArticles([...newsStorage.articles(),...articles],false);
  }),
  removeCustomSource:(id:string)=>sourceTransaction(()=>{
    newsStorage.saveCustomSources(newsStorage.customSources().filter(source=>source.id!==id));
    newsStorage.saveArticles(newsStorage.articles().filter(article=>article.sourceId!==id),false);
  }),
  preferences:():Record<string,{enabled?:boolean;notificationsEnabled?:boolean;autoTranslate?:boolean}>=>{
    const raw=parse<unknown>(localStorage.getItem(PREFS_KEY),{});
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
    return Object.fromEntries(Object.entries(raw).filter(([,value])=>value&&typeof value==='object'&&!Array.isArray(value)).map(([id,value])=>{
      const flags=value as Record<string,unknown>;
      return [id,{...(typeof flags.enabled==='boolean'?{enabled:flags.enabled}:{}),...(typeof flags.notificationsEnabled==='boolean'?{notificationsEnabled:flags.notificationsEnabled}:{}),...(typeof flags.autoTranslate==='boolean'?{autoTranslate:flags.autoTranslate}:{})}];
    }));
  },
  savePreferences:(id:string,value:{enabled?:boolean;notificationsEnabled?:boolean;autoTranslate?:boolean})=>sourceTransaction(()=>{
    const state=newsStorage.preferences();
    localStorage.setItem(PREFS_KEY,JSON.stringify({...state,[id]:{...state[id],...value}}));
    if(value.enabled!==undefined||value.notificationsEnabled!==undefined)newsStorage.markNewsNotified(newsStorage.articles().filter(item=>item.sourceId===id).map(item=>item.internalId!));
  }),
  customSources:():NewsSource[]=>parse(localStorage.getItem(SOURCES_KEY),[]),
  saveCustomSources:(sources:NewsSource[])=>localStorage.setItem(SOURCES_KEY,JSON.stringify(sources)),
  articles:():NewsArticle[]=>rawArticles(),
  saveArticles:(articles:NewsArticle[],trackChanges=true):NewsArticle[]=>sourceTransaction(()=>{
    const previous=rawArticles();
    const merged=mergeNewsForBrowsing(articles,previous);
    const state=tracker();
    for(const sourceId of new Set(merged.map(article=>article.sourceId))){
      const batch=merged.filter(article=>article.sourceId===sourceId).slice(0,NEWS_LIMIT_PER_SOURCE);
      const old=state[sourceId];
      const previousIds=new Set(previous.filter(article=>article.sourceId===sourceId).map(article=>article.internalId||internalNewsId(article)));
      const seen=new Set(old?.seenIds||[...previousIds].slice(0,NEWS_LIMIT_PER_SOURCE));
      const watermark=old?.latestPublished||Math.max(0,...previous.filter(article=>article.sourceId===sourceId).map(article=>Date.parse(article.publishedAt||'')||0));
      const maxPublished=Math.max(watermark,...batch.map(article=>Date.parse(article.publishedAt||'')||0));
      const baseline=!!old||previousIds.size>0;
      const discovered=trackChanges&&baseline?batch.filter(article=>{
        const id=article.internalId!;
        const published=Date.parse(article.publishedAt||'')||0;
        return !seen.has(id)&&(!published||(article.publishedTimeKnown===false?published>=watermark:published>watermark));
      }).map(article=>article.internalId!):[];
      const ids=batch.map(article=>article.internalId!);
      state[sourceId]={seenIds:ids,pendingIds:[...new Set([...(old?.pendingIds||[]),...discovered])].filter(id=>ids.includes(id)),latestPublished:maxPublished};
    }
    localStorage.setItem(CACHE_KEY,JSON.stringify(merged));
    localStorage.setItem(TRACK_KEY,JSON.stringify(state));
    return merged;
  }),
  compact:()=>sourceTransaction(()=>compactCache()),
  pendingNewArticles:():NewsArticle[]=>{
    const state=tracker(),pending=new Set(Object.values(state).flatMap(source=>source.pendingIds||[]));
    return rawArticles().filter(article=>pending.has(article.internalId||internalNewsId(article)));
  },
  markNewsNotified:(ids:string[])=>{
    const state=tracker(),handled=new Set(ids);
    for(const source of Object.values(state))source.pendingIds=(source.pendingIds||[]).filter(id=>!handled.has(id));
    localStorage.setItem(TRACK_KEY,JSON.stringify(state));
  },
};
