import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Newspaper, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { newsService } from '../features/news/services/newsService';

export const NewsPage: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const sources = useMemo(() => newsService.sources(), [version]);
  const articles = useMemo(() => newsService.cachedArticles(), [version]);

  const refresh = async () => {
    setLoading(true); setFetchError('');
    const results = await newsService.refresh();
    const hasArticles = newsService.cachedArticles().length > 0;
    if (!hasArticles && results.length && results.every((r) => r.error)) {
      setFetchError('تعذر تحديث الأخبار الآن. حاول مجددًا لاحقًا أو افتح المصدر الرسمي.');
    }
    setVersion((v) => v + 1); setLoading(false);
  };

  useEffect(() => { if (!newsService.cachedArticles().length) void refresh(); }, []);

  const add = () => {
    try {
      newsService.addSource({ name, url });
      setName(''); setUrl(''); setError(''); setShowAdd(false); setVersion((v) => v + 1);
    } catch { setError('أدخل رابطًا صحيحًا يبدأ بـ https:// أو http://'); }
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center"><Newspaper className="w-6 h-6" /></div><div><h1 className="font-bold text-lg">أخبار المراجعة والمباريات</h1><p className="text-xs text-[#DDD5FF] mt-0.5">مصادر مغربية رسمية ومصادرك الخاصة</p></div></div>
          <div className="flex gap-2"><button onClick={() => void refresh()} disabled={loading} className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center" aria-label="تحديث الأخبار">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}</button><button onClick={() => setShowAdd(true)} className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center" aria-label="إضافة مصدر"><Plus /></button></div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sources.filter(s => s.enabled).map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-2 bg-white border border-[#E6E2F0] rounded-xl text-xs font-bold text-[#2C2145]">
            {source.name}
          </a>
        ))}
      </div>

      {fetchError && <div className="rounded-xl bg-amber-50 text-amber-700 p-3 text-xs font-semibold">{fetchError}</div>}

      {articles.length ? articles.map((article) => {
        const source = sources.find(s => s.id === article.sourceId);
        return <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="block bg-white border border-[#E6E2F0] rounded-[18px] p-4 shadow-xs">
          <div className="text-[11px] text-[#5B3FD6] font-bold mb-1">{source?.name || 'مصدر'}</div>
          <h2 className="font-black text-sm leading-6 text-[#2C2145]">{article.title}</h2>
          {article.summary && <p className="text-xs text-gray-500 mt-2 leading-5">{article.summary}</p>}
          <div className="mt-3 flex items-center gap-1 text-[11px] text-gray-400"><ExternalLink className="w-3.5 h-3.5" /> فتح المصدر الأصلي</div>
        </a>;
      }) : <div className="bg-white border border-[#E6E2F0] rounded-[18px] p-6 text-center">
        <Newspaper className="w-9 h-9 mx-auto text-[#5B3FD6] mb-2" />
        <p className="font-bold text-sm">لا توجد أخبار متاحة الآن</p>
        <p className="text-xs text-gray-400 mt-1 leading-5">جرّب تحديث الأخبار، أو افتح أحد المصادر الرسمية أعلاه.</p>
      </div>}

      {showAdd && <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[22px] p-5 text-right">
          <div className="flex justify-between items-center mb-4"><h2 className="font-black">إضافة مصدر أخبار</h2><button onClick={() => setShowAdd(false)}><X /></button></div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المصدر" className="w-full border border-[#E6E2F0] rounded-xl px-3 py-3 mb-3 outline-none" />
          <input value={url} onChange={e => setUrl(e.target.value)} dir="ltr" placeholder="https://example.ma" className="w-full border border-[#E6E2F0] rounded-xl px-3 py-3 outline-none text-left" />
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <button onClick={add} className="w-full mt-4 bg-[#5B3FD6] text-white rounded-xl py-3 font-bold">إضافة المصدر</button>
          {sources.some(s => !s.builtIn) && <div className="mt-4 border-t pt-3">{sources.filter(s => !s.builtIn).map(s => <div key={s.id} className="flex justify-between items-center py-2 text-xs"><span>{s.name}</span><button onClick={() => { newsService.removeSource(s.id); setVersion(v => v + 1); }} className="text-red-500"><Trash2 className="w-4 h-4" /></button></div>)}</div>}
        </div>
      </div>}
    </div>
  );
};
