import { NewsArticle } from '../types';

export function isArabicText(value = ''): boolean {
  const arabic = (value.match(/[\u0621-\u064A\u066E-\u06D3]/g) || []).length;
  const latin = (value.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  return arabic > 0 && arabic >= latin;
}

export function needsArabicTranslation(title: string, summary = ''): boolean {
  return [title, summary].some(text => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text) && !isArabicText(text));
}

function storyKey(article: NewsArticle): string {
  try {
    const url = new URL(article.url);
    const path = decodeURIComponent(url.pathname).replace(/^\/(?:ar|fr|en)(?=\/)/i, '').replace(/\/+$/, '');
    for (const key of ['lang', 'language', 'locale', 'utm_source', 'utm_medium', 'utm_campaign']) url.searchParams.delete(key);
    // Only unify language variants for a concrete detail URL. Listing pages hold many stories.
    const uuid = url.pathname.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
    if (uuid) return article.sourceId + '|' + url.host + '|' + uuid.toLowerCase();
    const detail = /\/(?:details|détails|تفاصيل|dataset|article|actualite|actualites)\//i.test(path) || /_a\d+\.html$/i.test(path);
    return detail ? article.sourceId + '|' + url.host + path + url.search : article.sourceId + '|' + article.url + '|' + article.title.trim().toLowerCase();
  } catch { return article.sourceId + '|' + article.id; }
}

export function preferArabicArticles(articles: NewsArticle[]): NewsArticle[] {
  const stories = new Map<string, NewsArticle>();
  for (const article of articles) {
    const key = storyKey(article);
    const previous = stories.get(key);
    if (!previous || (!isArabicText(previous.title) && isArabicText(article.title))) stories.set(key, article);
  }
  return [...stories.values()];
}

export function localizedValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try { return localizedValue(JSON.parse(trimmed), fallback); } catch {}
    }
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const map = value as Record<string, unknown>;
    for (const key of ['ar', 'ar_MA', 'ar-MA', 'fr', 'en']) if (typeof map[key] === 'string' && map[key].trim()) return map[key] as string;
    return Object.values(map).find(item => typeof item === 'string' && item.trim()) as string || fallback;
  }
  return fallback;
}
