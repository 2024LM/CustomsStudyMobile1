export type NewsSourceKind = 'rss' | 'ckan' | 'web';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  apiUrl?: string;
  kind: NewsSourceKind;
  builtIn: boolean;
  enabled: boolean;
}

export interface NewsArticle {
  id: string;
  sourceId: string;
  title: string;
  summary?: string;
  url: string;
  imageUrl?: string;
  publishedAt?: string;
  category?: string;
}

export interface NewsFetchResult {
  sourceId: string;
  articles: NewsArticle[];
  error?: string;
}
