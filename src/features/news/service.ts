import { DEFAULT_NEWS_SOURCES } from './defaultSources';
import { NewsArticle, NewsSource } from './types';

const SOURCES_KEY = 'raje3_news_sources_v1';
const CACHE_KEY = 'raje3_news_cache_v1';

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export const newsService = {
  sources(): NewsSource[] {
    const custom = safeParse<NewsSource[]>(localStorage.getItem(SOURCES_KEY), []);
    const byId = new Map(DEFAULT_NEWS_SOURCES.map((s) => [s.id, s]));
    custom.forEach((s) => byId.set(s.id, s));
    return [...byId.values()];
  },
  addSource(input: Pick<NewsSource, 'name' | 'url'>): NewsSource {
    const parsed = new URL(input.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('UNSUPPORTED_URL');
    const source: NewsSource = {
      id: `user-${Date.now()}`, name: input.name.trim() || parsed.hostname,
      url: parsed.toString(), kind: 'web', builtIn: false, enabled: true,
    };
    const custom = safeParse<NewsSource[]>(localStorage.getItem(SOURCES_KEY), []);
    localStorage.setItem(SOURCES_KEY, JSON.stringify([...custom, source]));
    return source;
  },
  removeSource(id: string) {
    const custom = safeParse<NewsSource[]>(localStorage.getItem(SOURCES_KEY), []);
    localStorage.setItem(SOURCES_KEY, JSON.stringify(custom.filter((s) => s.id !== id)));
  },
  cachedArticles(): NewsArticle[] {
    return safeParse<NewsArticle[]>(localStorage.getItem(CACHE_KEY), []);
  },
  saveCache(articles: NewsArticle[]) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(articles.slice(0, 250)));
  },
};
