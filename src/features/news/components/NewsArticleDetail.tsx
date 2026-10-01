import React from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { NewsArticle } from '../types';
import { newsDate } from '../services/newsPresentation';
import { sourceTheme } from '../config/sourceTheme';
import { NewsSourceBadge } from './NewsSourceBadge';
import { NewsArticleContent } from './NewsArticleContent';
import { NewsImage } from './NewsImage';

export function NewsArticleDetail({ article, sourceName, onBack }: { article: NewsArticle; sourceName?: string; onBack: () => void }) {
  const theme=sourceTheme(article.sourceId);
  const date=newsDate(article.publishedAt,article.publishedTimeKnown,article.publishedLocalTime);
  const content=article.content?.trim();
  return <article data-news-detail={article.internalId || article.id} className="bg-white border border-gray-100 rounded-lg overflow-hidden text-right"
    style={{'--news-light':theme.light} as React.CSSProperties}>
    <header className="px-4 py-3 border-b border-gray-100">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 min-h-11 text-sm font-bold text-[#5B3FD6]"><ArrowRight className="w-4 h-4" />العودة إلى الأخبار</button>
      <div className="flex flex-wrap justify-between items-center gap-3 mt-2">
        <NewsSourceBadge sourceId={article.sourceId} name={sourceName} />
        {date ? <time dateTime={article.publishedAt} className="text-xs font-bold text-gray-600">نُشر: {date}{article.publishedTimeKnown===false?' · الساعة غير متاحة':''}</time> : <span className="text-xs text-gray-500">المصدر لم يحدد تاريخ النشر</span>}
      </div>
    </header>
    <NewsImage url={article.imageUrl} featured />
    <div className="p-4 space-y-4">
      <NewsArticleContent article={article} featured translationLabel="ترجمة العنوان والملخص" />
      {article.category && <p className="text-xs text-gray-500">{article.category}</p>}
      <section aria-label="معلومات الخبر" className="text-sm leading-8 text-[#2C2145]">
        {(content || article.summary || '').split(/\n+/).filter(Boolean).map((paragraph,index)=><p key={index} dir="auto" className="whitespace-pre-wrap break-words mb-3">{paragraph}</p>)}
        {!content && <p className="text-xs text-gray-500">هذه المعلومات المتاحة من المصدر. يمكن الاطلاع على التفاصيل والمرفقات عبر الرابط أدناه.</p>}
      </section>
    </div>
    <footer className="p-4 border-t border-gray-100">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 min-h-12 px-4 py-3 rounded-md font-bold text-white"
        style={{background:theme.end}}>التوجه إلى المصدر <ExternalLink className="w-4 h-4" /></a>
    </footer>
  </article>;
}
