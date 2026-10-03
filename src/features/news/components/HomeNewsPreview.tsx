import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { newsService } from '../services/newsService';
import { latestNews } from '../services/newsPresentation';
import { NewsArticleCard } from './NewsArticleCard';

export function HomeNewsPreview({ onOpenNews }: { onOpenNews: (articleId?: string,sourceId?:string) => void }) {
  const read = () => {
    const enabled = new Set(newsService.sources().filter(source => source.enabled).map(source => source.id));
    return latestNews(newsService.cachedArticles().filter(article => enabled.has(article.sourceId)), 8);
  };
  const [articles, setArticles] = useState(read);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const touchStart=useRef<number>();
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const update = () => { if (alive) setArticles(read()); };
    const unsubscribe = newsService.subscribe(update);
    setLoading(true);
    void newsService.refreshIfStale().catch(() => {}).finally(() => {
      if (alive) { update(); setLoading(false); }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);
  useEffect(() => setActive(value => Math.min(value, Math.max(0, articles.length - 1))), [articles]);
  const syncActive = () => {
    if (!rail.current) return;
    const right = rail.current.getBoundingClientRect().right;
    const cards = [...rail.current.children] as HTMLElement[];
    const distances = cards.map(card => Math.abs(card.getBoundingClientRect().right - right));
    const closest = distances.indexOf(Math.min(...distances));
    if (closest >= 0) setActive(closest);
  };
  const move = (index: number) => {
    const target = rail.current?.children[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
  };
  const atEnd = () => {
    const node=rail.current;
    return active===articles.length-1 || !!node && Math.abs(node.scrollLeft)>=node.scrollWidth-node.clientWidth-2;
  };
  const sources = newsService.sources();
  return <section aria-label="آخر الأخبار" className="sm:col-span-2 min-w-0 bg-white border border-gray-100 rounded-lg overflow-hidden">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
      <div>
        <h2 className="font-black text-base text-[#2C2145]">آخر الأخبار</h2>
        <p className="text-[11px] text-gray-500 mt-1">أخبار المراجعة والمباريات</p>
      </div>
      <button onClick={()=>onOpenNews()} type="button" className="text-xs font-bold text-[#5B3FD6] min-h-11 px-2">كل الأخبار</button>
    </div>
    {articles.length ? <>
      <div ref={rail} dir="rtl" data-home-news-rail tabIndex={0} aria-label="تصفح آخر الأخبار"
        onTouchStart={event=>{touchStart.current=event.touches[0]?.clientX;}}
        onTouchEnd={event=>{const start=touchStart.current;touchStart.current=undefined;if(start!==undefined&&atEnd()&&event.changedTouches[0].clientX-start>60)onOpenNews();}}
        onScroll={syncActive} onKeyDown={event => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); if(atEnd())onOpenNews();else move(active+1); }
          if (event.key === 'ArrowRight' && active > 0) { event.preventDefault(); move(active - 1); }
        }}
        className="home-news-rail flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain p-3">
        {articles.map(article => <div key={article.id} className="shrink-0 w-[88%] sm:w-[360px] snap-start">
          <NewsArticleCard onSelectSource={id=>onOpenNews(undefined,id)} preview onOpen={item=>onOpenNews(item.internalId || item.id)} article={article} sourceName={sources.find(source => source.id === article.sourceId)?.name} />
        </div>)}
      </div>
      <div className="flex items-center justify-between px-3 pb-3">
        <span aria-live="polite" className="text-[11px] text-gray-500">{active + 1} / {articles.length}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => move(active - 1)} disabled={active === 0} aria-label="الخبر السابق" className="w-11 h-11 flex items-center justify-center rounded-md border border-gray-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          <button type="button" onClick={() => atEnd()?onOpenNews():move(active+1)} aria-label="الخبر التالي" className="w-11 h-11 flex items-center justify-center rounded-md border border-gray-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
        </div>
      </div>
    </> : <div className="px-4 py-5 text-xs text-gray-500" role="status">
      {loading ? <span className="inline-flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" />جارٍ جلب آخر الأخبار…</span> : 'لا توجد أخبار متاحة الآن. افتح الأخبار للتحديث.'}
    </div>}
  </section>;
}
