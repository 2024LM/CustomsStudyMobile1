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
    for (const source of this.sources().filter((s) => s.enabled && s.kind !== 'web')) {
      try {
        const articles = source.kind === 'rss' ? await fetchRss(source) : await fetchCkan(source);
        results.push({ sourceId: source.id, articles });
      } catch (error) {
        results.push({ sourceId: source.id, articles: [], error: error instanceof Error ? error.message : 'FETCH_FAILED' });
      }
    }
    const fresh = results.flatMap((r) => r.articles);
    const previous = newsStorage.articles();
    const merged = [...fresh, ...previous.filter((old) => !fresh.some((item) => item.id === old.id))]
      .sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));
    newsStorage.saveArticles(merged);
    return results;
  },
};
