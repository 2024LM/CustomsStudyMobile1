import { NewsArticle } from '../types';

const OFFICIAL_SOURCES = new Set(['men', 'finances', 'emploi-public', 'hcp']);
export interface NewsBundle {
  articles: NewsArticle[];
  refreshedSourceIds: string[];
}
export function parseNewsBundle(payload: unknown): NewsBundle {
  if (!payload || typeof payload !== 'object') return { articles: [], refreshedSourceIds: [] };
  const data = payload as { schemaVersion?: number; articles?: unknown; refreshedSourceIds?: unknown };
  const articles = Array.isArray(data.articles) ? data.articles.filter((item): item is NewsArticle => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.title !== 'string' ||
      typeof item.sourceId !== 'string' || typeof item.url !== 'string' || item.sourceId === 'open-data-ma') return false;
    try { return ['https:', 'http:'].includes(new URL(item.url).protocol); } catch { return false; }
  }) : [];
  // An empty/failed source must never erase the user's last successful snapshot.
  const refreshedSourceIds = data.schemaVersion === 2 && Array.isArray(data.refreshedSourceIds)
    ? data.refreshedSourceIds.filter((id): id is string => typeof id === 'string' && OFFICIAL_SOURCES.has(id) && articles.some(item => item.sourceId === id)) : [];
  return { articles, refreshedSourceIds };
}
export function mergeNewsBundle(bundle: NewsBundle, cached: NewsArticle[]): NewsArticle[] {
  const refreshed = new Set(bundle.refreshedSourceIds);
  const ids = new Set(bundle.articles.map(item => item.id));
  return [...bundle.articles, ...cached.filter(old => !refreshed.has(old.sourceId) && !ids.has(old.id))];
}
