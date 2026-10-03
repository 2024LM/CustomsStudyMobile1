import { parseNewsBundle, NewsBundle } from './newsBundle';
import { preferArabicArticles } from './newsLanguage';
import { DEFAULT_NEWS_SOURCES } from '../config/defaultSources';
import { newsStorage } from '../storage/newsStorage';
import { fetchNewsPage, SourcePreview } from '../providers/customProvider';
import { publicNewsUrl } from '../providers/sourceAccess';
import { NewsFetchResult, NewsSource } from '../types';

let refreshTask: Promise<NewsFetchResult[]> | undefined;
let refreshedAt = 0;
const pageState = new Map<string,{next?:string;visited:Set<string>;loaded:boolean}>();
const pageTasks = new Map<string,Promise<boolean>>();
function changed(){ for(const listener of listeners){try{listener();}catch{}} }

const listeners = new Set<() => void>();

async function bundledArticles(): Promise<NewsBundle> {
  try {
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}news-feed.json`, { cache: 'no-store' });
    if (!response.ok) return { articles: [], refreshedSourceIds: [] };
    return parseNewsBundle(await response.json());
  } catch {
    return { articles: [], refreshedSourceIds: [] };
  }
}

export const newsService = {
  sources(): NewsSource[] {
    const byId = new Map(DEFAULT_NEWS_SOURCES.map((s) => [s.id, s]));
    newsStorage.customSources().forEach((s) => byId.set(s.id, s));
    return [...byId.values()].map(source=>({...source,...newsStorage.preferences()[source.id]})).filter(source => source.id !== 'open-data-ma' && ['rss', 'web'].includes(source.kind));
  },
  addSource(preview: SourcePreview): NewsSource {
    const parsed = publicNewsUrl(preview.source.url);
    if (this.sources().some(source => [source.url, source.feedUrl].some(url => !!url && url.replace(/\/$/, '').replace('://www.', '://') === parsed.href.replace(/\/$/, '').replace('://www.', '://')))) {
      throw new Error('هذا الموقع موجود بالفعل ضمن المصادر.');
    }
    if (preview.source.feedUrl && this.sources().some(source => source.feedUrl === preview.source.feedUrl)) throw new Error('تغذية الأخبار هذه موجودة بالفعل ضمن المصادر.');
    if (!preview.articles.length || (preview.source.kind === 'rss' ? !preview.source.feedUrl : !preview.source.extraction)) {
      throw new Error('يجب اختبار المصدر ومعاينة أخباره قبل حفظه.');
    }
    const source: NewsSource = { ...preview.source, id: `user-${crypto.randomUUID()}`, builtIn: false, enabled: true };
    newsStorage.addValidatedSource(source, preview.articles.map(article => ({ ...article,
      id: `${source.id}-${article.url}`, sourceId: source.id })));
    changed(); return source;
  },
  removeSource(id: string) {
    if (this.sources().find(source => source.id === id)?.builtIn) return;
    newsStorage.removeCustomSource(id); pageState.delete(id); changed();
  },
  setSourcePreferences(id:string,value:{enabled?:boolean;notificationsEnabled?:boolean;autoTranslate?:boolean}) {
    if(!this.sources().some(source=>source.id===id)) throw new Error('المصدر غير موجود.');
    newsStorage.savePreferences(id,value); refreshedAt=0; changed();
  },
  async loadOlder(sourceId:string):Promise<boolean> {
    const current=pageTasks.get(sourceId); if(current)return current;
    const source=this.sources().find(item=>item.id===sourceId);
    if(!source)return false;
    const state=pageState.get(sourceId);
    if(state?.loaded&&!state.next)return false;
    const task=(async()=>{
      const page=await fetchNewsPage(source,state?.next);
      if(!this.sources().some(item=>item.id===sourceId))return false;
      const visited=state?.visited||new Set<string>();
      visited.add(state?.next||source.feedUrl||source.url);
      const next=page.next&&!visited.has(page.next)?page.next:undefined;
      pageState.set(sourceId,{next,visited,loaded:true});
      newsStorage.saveArticles([...newsStorage.articles(),...page.articles],false);changed();
      return !!next;
    })().finally(()=>pageTasks.delete(sourceId));
    pageTasks.set(sourceId,task);return task;
  },
  cachedArticles: () => newsStorage.articles(),
  pendingNewArticles: () => { const active=new Set(newsService.sources().filter(s=>s.enabled&&s.notificationsEnabled!==false).map(s=>s.id)); return newsStorage.pendingNewArticles().filter(a=>active.has(a.sourceId)); },
  markNewsNotified: (ids: string[]) => newsStorage.markNewsNotified(ids),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  refreshIfStale(): Promise<NewsFetchResult[]> {
    return refreshedAt && Date.now() - refreshedAt < 5 * 60 * 1000
      ? Promise.resolve([]) : this.refresh();
  },
  refresh(sourceId?:string): Promise<NewsFetchResult[]> {
    if (refreshTask) return sourceId ? refreshTask.then(()=>this.refresh(sourceId)) : refreshTask;
    const allowed=this.sources().filter(s=>sourceId ? s.id===sourceId : s.enabled&&s.notificationsEnabled!==false);
    const allowedIds=new Set(allowed.map(s=>s.id));
    const sources = allowed;
    refreshTask = (async () => {
    const results: NewsFetchResult[] = [];
    const bundle = await bundledArticles();
    const bundled = bundle.articles.filter(a=>allowedIds.has(a.sourceId));
    const fetched=await Promise.all(sources.map(async source=>{
      try{
        let articles;
        try{articles=(await fetchNewsPage(source)).articles;}
        catch(error){const fallback=bundled.filter(item=>item.sourceId===source.id);if(!fallback.length)throw error;articles=fallback;}
        return {sourceId:source.id,articles};
      }catch(error){return {sourceId:source.id,articles:[],error:error instanceof Error?error.message:'FETCH_FAILED'};}
    }));
    results.push(...fetched);
    // A source removed while its request was pending must not return to the cache.
    const activeIds = new Set(this.sources().filter(source => sourceId ? source.id===sourceId : source.enabled&&source.notificationsEnabled!==false).map(source => source.id));
    const fresh = preferArabicArticles([...results.flatMap((r) => r.articles), ...bundled].filter(article => activeIds.has(article.sourceId)));

    const previous = newsStorage.articles();
    const timestamp = (value?: string) => {
      const parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const merged = preferArabicArticles([...fresh, ...previous.filter((old) => !fresh.some((item) => item.id === old.id))])
      .sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt));
    newsStorage.saveArticles(merged);
    if(!sourceId)refreshedAt = Date.now();
    for (const listener of listeners) { try { listener(); } catch {} }
    return results;
    })().finally(() => { refreshTask = undefined; });
    return refreshTask;
  },
};
