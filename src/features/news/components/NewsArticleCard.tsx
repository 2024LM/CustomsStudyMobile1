import React from 'react';
import { ExternalLink } from 'lucide-react';
import { NewsArticle } from '../types';
import { newsDate } from '../services/newsPresentation';
import { NewsImage } from './NewsImage';
import { NewsArticleContent } from './NewsArticleContent';

export function NewsArticleCard({ article, sourceName, featured = false }: { article: NewsArticle; sourceName?: string; featured?: boolean }) {
  const date = newsDate(article.publishedAt);
  return <article data-news-card={article.id} className="h-full bg-white border border-gray-100 rounded-lg overflow-hidden text-right">
    <NewsImage url={article.imageUrl} featured={featured} />
    <div className={featured ? 'p-5' : 'p-4'}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 mb-3 text-[11px]">
        <span className="font-bold text-[#5B3FD6]">{sourceName || 'مصدر الخبر'}</span>
        {date && <time dateTime={article.publishedAt} className="text-gray-500 shrink-0">{date}</time>}
      </div>
      <NewsArticleContent article={article} featured={featured} />
      <div className="border-t border-gray-100 mt-4 pt-3">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-[#5B3FD6]">
          {featured ? 'قراءة الخبر' : 'فتح المصدر'} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  </article>;
}
