import { mergeNewsBundle, parseNewsBundle, NewsBundle } from './newsBundle';
import { preferArabicArticles } from './newsLanguage';
import { DEFAULT_NEWS_SOURCES } from '../config/defaultSources';
import { newsStorage } from '../storage/newsStorage';
import { fetchCustomSource, SourcePreview } from '../providers/customProvider';
import { publicNewsUrl } from '../providers/sourceAccess';
import { fetchRss } from '../providers/rssProvider';
import { NewsFetchResult, NewsSource } from '../types';

let refreshTask: Promise<NewsFetchResult[]> | undefined;
let refreshedAt = 0;
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
    return [...byId.values()].filter(source => source.id !== 'open-data-ma' && ['rss', 'web'].includes(source.kind));
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
    return source;
  },
  removeSource(id: string) {
    if (this.sources().find(source => source.id === id)?.builtIn) return;
    newsStorage.removeCustomSource(id);
  },
  cachedArticles: () => newsStorage.articles(),
  pendingNewArticles: () => newsStorage.pendingNewArticles(),
  markNewsNotified: (ids: string[]) => newsStorage.markNewsNotified(ids),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  refreshIfStale(): Promise<NewsFetchResult[]> {
    return refreshedAt && Date.now() - refreshedAt < 5 * 60 * 1000
      ? Promise.resolve([]) : this.refresh();
  },
  refresh(): Promise<NewsFetchResult[]> {
    if (refreshTask) return refreshTask;
    const sources = this.sources().filter(s => s.enabled && (s.kind === 'rss' || (!s.builtIn && !!s.extraction)));
    refreshTask = (async () => {
    const results: NewsFetchResult[] = [];
    const bundle = await bundledArticles();
    const bundled = bundle.articles;
    if (bundled.length) {
      const cached = newsStorage.articles();
      newsStorage.saveArticles(preferArabicArticles(mergeNewsBundle(bundle, cached)));
      for (const listener of listeners) { try { listener(); } catch {} }
    }
    for (const source of sources) {
      try {
        const articles = source.kind === 'rss' ? await fetchRss(source) : await fetchCustomSource(source);
        results.push({ sourceId: source.id, articles });
      } catch (error) {
        results.push({ sourceId: source.id, articles: [], error: error instanceof Error ? error.message : 'FETCH_FAILED' });
      }
    }
    // A source removed while its request was pending must not return to the cache.
    const activeIds = new Set(this.sources().filter(source => source.enabled).map(source => source.id));
    const fresh = preferArabicArticles([...bundled, ...results.flatMap((r) => r.articles)].filter(article => activeIds.has(article.sourceId)));

    const previous = newsStorage.articles();
    const timestamp = (value?: string) => {
      const parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const merged = preferArabicArticles([...fresh, ...previous.filter((old) => !fresh.some((item) => item.id === old.id))])
      .sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt));
    newsStorage.saveArticles(merged);
    refreshedAt = Date.now();
    for (const listener of listeners) { try { listener(); } catch {} }
    return results;
    })().finally(() => { refreshTask = undefined; });
    return refreshTask;
  },
};
