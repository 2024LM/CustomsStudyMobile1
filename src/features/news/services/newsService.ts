import { mergeNewsBundle, parseNewsBundle, NewsBundle } from './newsBundle';
import { preferArabicArticles } from './newsLanguage';
import { DEFAULT_NEWS_SOURCES } from '../config/defaultSources';
import { newsStorage } from '../storage/newsStorage';
import { fetchRss } from '../providers/rssProvider';
import { NewsFetchResult, NewsSource } from '../types';

let refreshTask: Promise<NewsFetchResult[]> | undefined;
let refreshedAt = 0;
const listeners = new Set<() => void>();

function normalizeUrl(raw: string): URL {
  const parsed = new URL(raw.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('UNSUPPORTED_URL');
  return parsed;
}

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
  addSource(input: Pick<NewsSource, 'name' | 'url'>): NewsSource {
    const parsed = normalizeUrl(input.url);
    const source: NewsSource = { id: `user-${Date.now()}`, name: input.name.trim() || parsed.hostname, url: parsed.toString(), kind: 'web', builtIn: false, enabled: true };
    newsStorage.saveCustomSources([...newsStorage.customSources(), source]);
    return source;
  },
  removeSource(id: string) {
    newsStorage.saveCustomSources(newsStorage.customSources().filter((s) => s.id !== id));
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
    const sources = this.sources().filter(s => s.enabled && s.kind !== 'web');
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
        const articles = await fetchRss(source);
        results.push({ sourceId: source.id, articles });
      } catch (error) {
        results.push({ sourceId: source.id, articles: [], error: error instanceof Error ? error.message : 'FETCH_FAILED' });
      }
    }
    const fresh = preferArabicArticles([...bundled, ...results.flatMap((r) => r.articles)]);
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
