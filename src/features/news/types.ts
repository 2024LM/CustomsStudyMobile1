export type NewsSourceKind = 'rss' | 'web';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  kind: NewsSourceKind;
  builtIn: boolean;
  enabled: boolean;
}

export interface NewsArticle {
  id: string;
  internalId?: string;
  sourceId: string;
  title: string;
  summary?: string;
  content?: string;
  firstSeenAt?: string;
  url: string;
  imageUrl?: string;
  publishedAt?: string;
  publishedTimeKnown?: boolean;
  publishedLocalTime?: boolean;
  eventDate?: string;
  category?: string;
}

export interface NewsFetchResult {
  sourceId: string;
  articles: NewsArticle[];
  error?: string;
}
