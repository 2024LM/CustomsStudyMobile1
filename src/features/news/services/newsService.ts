import { DEFAULT_NEWS_SOURCES } from '../config/defaultSources';
import { newsStorage } from '../storage/newsStorage';
import { fetchRss } from '../providers/rssProvider';
import { fetchCkan } from '../providers/ckanProvider';
import { NewsArticle, NewsFetchResult, NewsSource } from '../types';

function normalizeUrl(raw: string): URL {
  const parsed = new URL(raw.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('UNSUPPORTED_URL');
  return parsed;
}

async function bundledArticles(): Promise<NewsArticle[]> {
  try {
    const base = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${base}news-feed.json`, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json() as { articles?: NewsArticle[] };
    return Array.isArray(payload.articles) ? payload.articles : [];
  } catch {
    return [];
  }
}

export const newsService = {
  sources(): NewsSource[] {
    const byId = new Map(DEFAULT_NEWS_SOURCES.map((s) => [s.id, s]));
    newsStorage.customSources().forEach((s) => byId.set(s.id, s));
    return [...byId.values()];
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
  async refresh(): Promise<NewsFetchResult[]> {
    const results: NewsFetchResult[] = [];
    const bundled = await bundledArticles();
    for (const source of this.sources().filter((s) => s.enabled && s.kind !== 'web')) {
      try {
        const articles = source.kind === 'rss' ? await fetchRss(source) : await fetchCkan(source);
        results.push({ sourceId: source.id, articles });
      } catch (error) {
        results.push({ sourceId: source.id, articles: [], error: error instanceof Error ? error.message : 'FETCH_FAILED' });
      }
    }
    const fresh = [...bundled, ...results.flatMap((r) => r.articles)];
    const previous = newsStorage.articles();
    const timestamp = (value?: string) => {
      const parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const merged = [...fresh, ...previous.filter((old) => !fresh.some((item) => item.id === old.id))]
      .sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt));
    newsStorage.saveArticles(merged);
    return results;
  },
};
