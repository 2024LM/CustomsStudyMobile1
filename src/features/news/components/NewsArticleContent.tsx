import React, { useEffect, useRef, useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { NewsArticle } from '../types';
import { needsArabicTranslation } from '../services/newsLanguage';
import { cachedNewsTranslation, NewsTranslation, translateNews } from '../services/newsTranslation';

function displayedSummary(value = '') {
  const text = value.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').replace(/^[\s|•·—-]+|[\s|•·—-]+$/g, '').trim();
  return text.length > 180 ? text.slice(0, 177) + '…' : text;
}
export const NewsArticleContent: React.FC<{ article: NewsArticle; featured?: boolean }> = ({ article, featured = false }) => {
  const summary = displayedSummary(article.summary);
  const key = JSON.stringify([article.title, summary]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const [result, setResult] = useState<NewsTranslation>();
  const [translated, setTranslated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    activeKey.current = key;
    setResult(undefined); setTranslated(false); setBusy(false); setError('');
    return () => { activeKey.current = ''; };
  }, [key]);
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
  return <>
    <Heading dir="auto" className={featured ? 'text-[19px] leading-8 font-black' : 'font-black text-[14px] leading-6 text-[#2C2145]'}>{text.title}</Heading>
    {!!text.summary && <p dir="auto" className={featured ? 'text-xs leading-6 text-white/80 mt-2' : 'text-xs text-gray-500 mt-2 leading-5'}>{text.summary}</p>}
    {needsArabicTranslation(article.title, summary) && <div className="mt-3">
      <button type="button" disabled={busy} onClick={() => void translate()} aria-label={translated ? 'عرض النص الأصلي' : 'ترجمة الخبر إلى العربية'}
        className={'inline-flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 disabled:opacity-60 ' + (featured ? 'text-white bg-white/15 border border-white/15' : 'text-[#5B3FD6] bg-[#F5F3FF]')}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
        {busy ? 'جارٍ الترجمة…' : translated ? 'عرض الأصل' : 'ترجمة للعربية'}
      </button>
      {translated && <span className={'text-[10px] mr-2 ' + (featured ? 'text-white/75' : 'text-gray-400')}>ترجمة آلية</span>}
      {busy && <p role="status" className={'text-[11px] mt-2 ' + (featured ? 'text-white/80' : 'text-gray-500')}>قد يحتاج أول استخدام تنزيل حزمة اللغة.</p>}
      {error && <p role="alert" className={'text-xs mt-2 ' + (featured ? 'text-white' : 'text-red-600')}>{error}</p>}
    </div>}
  </>;
};
