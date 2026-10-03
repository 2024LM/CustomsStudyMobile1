import React from 'react';
import { ExternalLink } from 'lucide-react';
import { NewsArticle } from '../types';
import {cachedNewsTranslation} from '../services/newsTranslation';
import {newsSummary} from '../services/newsPresentation';
import { newsDate } from '../services/newsPresentation';
import { sourceTheme } from '../config/sourceTheme';
import { NewsSourceBadge } from './NewsSourceBadge';
import { NewsImage } from './NewsImage';
import { NewsArticleContent } from './NewsArticleContent';

export function NewsArticleCard({ article, sourceName, featured = false, preview = false, onOpen, onSelectSource }: { article: NewsArticle; sourceName?: string; featured?: boolean; preview?: boolean; onSelectSource?: (id:string)=>void; onOpen?: (article: NewsArticle) => void }) {
  const date = newsDate(article.publishedAt,article.publishedTimeKnown,article.publishedLocalTime);
  const theme = sourceTheme(article.sourceId);
  const style = { '--news-accent': theme.color, '--news-light': theme.light, borderInlineStartColor: theme.color } as React.CSSProperties;
  const saved=cachedNewsTranslation(article.title,newsSummary(article.summary));
  const summary = (article.summary || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return <article data-news-card={article.id} onClick={onOpen?event=>{if(!(event.target as Element).closest('button,a,input'))onOpen(article);}:undefined} style={style}
    className={`news-content-card bg-white border border-gray-100 border-s-4 rounded-lg overflow-hidden text-right ${preview ? 'news-preview-card' : 'h-full'}`}>
    <header className="news-card-header flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-3">
      <NewsSourceBadge sourceId={article.sourceId} name={sourceName} onSelect={onSelectSource} />
      {date && <time dateTime={article.publishedAt} title={date} className="text-gray-600 text-[10px] font-bold text-left max-w-[45%]">{date}</time>}
    </header>
    {preview ? <div className="news-preview-body flex items-start gap-3 px-3 pt-3">
      <div className="min-w-0 flex-1">
        <h3 dir="auto" className="font-black text-[14px] leading-6 text-[#2C2145] line-clamp-3">{onOpen?<button className="text-start" onClick={()=>onOpen(article)}>{saved?.title||article.title}</button>:saved?.title||article.title}</h3>
        {summary && <p dir="auto" className="text-xs text-gray-500 leading-5 mt-2 line-clamp-2">{saved?.summary||summary}</p>}
      </div>
      <NewsImage url={article.imageUrl} imageClassName="news-preview-photo" />
    </div> : <>
      <NewsImage url={article.imageUrl} featured={featured} />
      <div className={featured ? 'p-5' : 'p-4'}><NewsArticleContent onOpen={onOpen?()=>onOpen(article):undefined} article={article} featured={featured} /></div>
    </>}
    <footer className={`border-t border-gray-100 px-3 py-2 ${preview ? 'mt-auto' : 'mt-1'}`}>
      {onOpen ? <button type="button" onClick={()=>onOpen(article)} className="news-source-name inline-flex items-center gap-1.5 min-h-11 text-xs font-bold" style={{color:theme.color}}>قراءة داخل التطبيق</button> : <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-source-name inline-flex items-center gap-1.5 min-h-11 text-xs font-bold" style={{ color: theme.color }}>
        {featured ? 'قراءة الخبر' : 'فتح المصدر'} <ExternalLink className="w-3.5 h-3.5" />
      </a>}
    </footer>
  </article>;
}
