export type NewsSourceKind = 'rss' | 'web';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  extraction?: NewsExtraction;
  kind: NewsSourceKind;
  builtIn: boolean;
  enabled: boolean;
  notificationsEnabled?: boolean;
  autoTranslate?: boolean;
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

export interface NewsExtraction {
  item: string;
  title: string;
  link: string;
  summary?: string;
  date?: string;
}
