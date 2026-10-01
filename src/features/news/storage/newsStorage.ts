import { NewsArticle, NewsSource } from '../types';

const SOURCES_KEY = 'raje3_news_sources_v1';
const CACHE_KEY = 'raje3_news_cache_v1';

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export const newsStorage = {
  customSources: (): NewsSource[] => parse(localStorage.getItem(SOURCES_KEY), []),
  saveCustomSources: (sources: NewsSource[]) => localStorage.setItem(SOURCES_KEY, JSON.stringify(sources)),
  articles: (): NewsArticle[] => parse(localStorage.getItem(CACHE_KEY), []),
  saveArticles: (articles: NewsArticle[]) => localStorage.setItem(CACHE_KEY, JSON.stringify(articles.slice(0, 250))),
};
