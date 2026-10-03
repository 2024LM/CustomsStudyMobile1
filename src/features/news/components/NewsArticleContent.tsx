import React, { useEffect, useRef, useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { NewsArticle } from '../types';
import { needsArabicTranslation } from '../services/newsLanguage';
import { cachedNewsTranslation, NewsTranslation, translateNews } from '../services/newsTranslation';

import { newsSummary } from '../services/newsPresentation';
import {useNewsAutoTranslation} from './useNewsAutoTranslation';

export const NewsArticleContent: React.FC<{ article: NewsArticle; featured?: boolean; compact?:boolean; translationLabel?: string;onOpen?:()=>void }> = ({ article, featured = false, compact=false, translationLabel = 'ترجمة للعربية',onOpen }) => {
  const summary = newsSummary(article.summary);
  const key = JSON.stringify([article.title, summary]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const [result, setResult] = useState<NewsTranslation>();
  const [translated, setTranslated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const container=useRef<HTMLDivElement>(null);
  const autoTranslate=useNewsAutoTranslation(article.sourceId);
  useEffect(() => {
    activeKey.current = key;
    const saved=cachedNewsTranslation(article.title,summary);
    setResult(saved); setTranslated(!!saved); setBusy(false); setError('');
    return () => { activeKey.current = ''; };
  }, [key]);
  useEffect(()=>{
    const node=container.current;
    if(!node||!autoTranslate||cachedNewsTranslation(article.title,summary)||!needsArabicTranslation(article.title,summary))return;
    let alive=true,started=false;
    const observer=new IntersectionObserver(entries=>{
      if(started||!entries.some(entry=>entry.isIntersecting)||document.visibilityState==='hidden')return;
      started=true;observer.disconnect();setBusy(true);setError('');
      void translateNews(article.title,summary).then(next=>{if(alive&&activeKey.current===key){setResult(next);setTranslated(true);}}).catch(err=>{if(alive&&activeKey.current===key)setError(err instanceof Error?err.message:'تعذر ترجمة الخبر.');}).finally(()=>{if(alive&&activeKey.current===key)setBusy(false);});
    },{threshold:0.1});
    observer.observe(node);
    return()=>{alive=false;observer.disconnect();setBusy(false);};
  },[key,autoTranslate]);
  const translate = async () => {
    if (busy) return;
    if (translated) { setTranslated(false); return; }
    if (result) { setTranslated(true); return; }
    setError('');
    const cached = cachedNewsTranslation(article.title, summary);
    if (cached) { setResult(cached); setTranslated(true); return; }
    setBusy(true);
    try {
      const next = await translateNews(article.title, summary);
      if (activeKey.current === key) { setResult(next); setTranslated(true); }
    } catch (err: any) {
      if (activeKey.current === key) setError(err?.message || 'تعذر ترجمة الخبر الآن. حاول مجددًا.');
    } finally {
      if (activeKey.current === key) setBusy(false);
    }
  };
  const text = translated && result ? result : { title: article.title, summary };
  const Heading = featured ? 'h2' : 'h3';
  return <div ref={container}>
    <Heading dir="auto" className={(featured ? 'text-[19px] leading-8 font-black text-[#2C2145]' : 'font-black text-[14px] leading-6 text-[#2C2145]')+(compact?' line-clamp-3':'')}>{onOpen?<button className="text-start" onClick={onOpen}>{text.title}</button>:text.title}</Heading>
    {!!text.summary && <p dir="auto" className={'text-xs text-gray-500 mt-2 '+(compact?'leading-5 line-clamp-2':'leading-6')}>{text.summary}</p>}
    {!compact&&needsArabicTranslation(article.title, summary) && <div className="mt-3">
      <button type="button" disabled={busy} onClick={() => void translate()} aria-label={translated ? 'عرض النص الأصلي' : 'ترجمة الخبر إلى العربية'}
        className={'inline-flex items-center gap-1.5 text-xs font-bold rounded-md px-3 py-2 disabled:opacity-60 ' + 'text-[#5B3FD6] bg-[#F5F3FF]'}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
        {busy ? 'جارٍ الترجمة…' : translated ? 'عرض الأصل' : translationLabel}
      </button>
      {translated && <span className={'text-[10px] mr-2 ' + 'text-gray-400'}>ترجمة آلية</span>}
      {busy && <p role="status" className={'text-[11px] mt-2 ' + 'text-gray-500'}>قد يحتاج أول استخدام تنزيل حزمة اللغة.</p>}
      {error && <p role="alert" className={'text-xs mt-2 ' + 'text-red-600'}>{error}</p>}
    </div>}
    {compact&&busy&&<p role="status" className="text-[10px] text-gray-500 mt-1">جارٍ الترجمة…</p>}
    {compact&&error&&<p role="alert" className="text-[10px] text-red-600 mt-1 line-clamp-1">{error}</p>}
  </div>;
};
