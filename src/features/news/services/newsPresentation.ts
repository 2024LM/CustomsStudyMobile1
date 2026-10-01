import { NewsArticle } from '../types';

export function latestNews(articles: NewsArticle[], limit = articles.length): NewsArticle[] {
  const timestamp = (value?: string) => {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...articles].sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt)).slice(0, limit);
}
export function newsDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('ar-MA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
