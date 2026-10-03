import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { NewsArticleDetail } from '../features/news/components/NewsArticleDetail';
import { NewsArticle } from '../features/news/types';
import { NewsArticleCard } from '../features/news/components/NewsArticleCard';
import { latestNews } from '../features/news/services/newsPresentation';
import { newsService } from '../features/news/services/newsService';

import { previewSource, previewConfiguredSource, aiPageExcerpt, UnsupportedNewsSource, SourcePreview } from '../features/news/providers/customProvider';
import { proposeNewsExtraction } from '../services/geminiAi';
import { sourceTheme } from '../features/news/config/sourceTheme';

export const NewsPage: React.FC<{ initialArticleId?: string; onClearInitial?: () => void }> = ({initialArticleId,onClearInitial}) => {
  const [opened,setOpened] = useState<NewsArticle | undefined>(()=>initialArticleId?newsService.cachedArticles().find(item=>item.internalId===initialArticleId||item.id===initialArticleId):undefined);
  const [version, setVersion] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [unsupportedPage, setUnsupportedPage] = useState<{ text: string; url: string } | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sourceLoading, setSourceLoading] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');

  const sources = useMemo(() => newsService.sources().filter((source) => source.enabled), [version]);
  const articles = useMemo(() => newsService.cachedArticles(), [version]);
  const filteredArticles = useMemo(() => {
    const selected = selectedSource === 'ALL'
      ? articles
      : articles.filter((article) => article.sourceId === selectedSource);
    return latestNews(selected);
  }, [articles, selectedSource]);

  const articleCountBySource = useMemo(() => {
    const counts = new Map<string, number>();
    articles.forEach((article) => counts.set(article.sourceId, (counts.get(article.sourceId) || 0) + 1));
    return counts;
  }, [articles]);

  const refresh = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const results = await newsService.refresh();
      const hasArticles = newsService.cachedArticles().length > 0;
      if (!hasArticles && results.length && results.every((result) => result.error)) {
        setFetchError('تعذر تحديث الأخبار الآن. حاول مجددًا بعد قليل.');
      }
      setVersion((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!newsService.cachedArticles().length) void refresh();
  }, []);

  useEffect(() => {
    if (selectedSource !== 'ALL' && !sources.some((source) => source.id === selectedSource)) {
      setSelectedSource('ALL');
    }
  }, [selectedSource, sources]);

  const selectSource = async (sourceId: string) => {
    setSelectedSource(sourceId);
    setSourceLoading(sourceId);
    setFetchError('');
    const startedAt = Date.now();
    try {
      const results = await newsService.refresh();
      const sourceError = results.find(result => result.sourceId === sourceId)?.error;
      if (sourceError) setFetchError(sourceError);
      else if (sources.some(source => source.id === sourceId && !source.builtIn && source.kind === 'web' && !source.extraction)) {
        setFetchError('هذا المصدر أُضيف بالطريقة القديمة دون فحص. احذفه وأعد إضافته لاختبار قالب الأخبار.');
      }
      setVersion((value) => value + 1);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) await new Promise((resolve) => setTimeout(resolve, 650 - elapsed));
      setSourceLoading(null);
    }
  };

  const resetCheck = () => { setPreview(null); setUnsupportedPage(null); setAiConsent(false); setError(''); };
  const check = async (withAi = false) => {
    setChecking(true); setError(''); setPreview(null);
    if (!withAi) { setUnsupportedPage(null); setAiConsent(false); }
    try {
      const result = withAi && unsupportedPage && aiConsent
        ? previewConfiguredSource(name, unsupportedPage, await proposeNewsExtraction(aiPageExcerpt(unsupportedPage)))
        : await previewSource(name, url);
      setPreview(result); setUnsupportedPage(null); setAiConsent(false);
    } catch (error) {
      if (error instanceof UnsupportedNewsSource) setUnsupportedPage(error.page);
      setError(error instanceof Error ? error.message : 'تعذر فحص المصدر. لم يُضف الموقع.');
    } finally { setChecking(false); }
  };
  const add = () => {
    if (!preview || checking) return;
    try {
      const source = newsService.addSource(preview);
      setName(''); setUrl(''); resetCheck(); setShowAdd(false);
      setSelectedSource(source.id); setVersion(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر حفظ المصدر على الجهاز.');
    }
  };

  useEffect(()=>{
    if(!initialArticleId)return;
    const article=newsService.cachedArticles().find(item=>item.internalId===initialArticleId||item.id===initialArticleId);
    if(article)setOpened(article);
  },[initialArticleId,version]);

  const featured = filteredArticles[0];
  const rest = filteredArticles.slice(1);

  if(opened)return <NewsArticleDetail article={opened} sourceName={sources.find(source=>source.id===opened.sourceId)?.name} onBack={()=>{setOpened(undefined);onClearInitial?.();}} />;

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h1 className="font-black text-[22px] leading-8 text-[#2C2145]">أخبار المراجعة والمباريات</h1>
          <p className="text-xs text-gray-500 mt-1">أحدث المحتويات من المصادر المغربية.</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => void refresh()} disabled={loading} className="w-11 h-11 rounded-md border border-gray-100 flex items-center justify-center text-[#5B3FD6]" aria-label="تحديث الأخبار">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          </button>
          <button onClick={() => { resetCheck(); setShowAdd(true); }} className="w-11 h-11 rounded-md border border-gray-100 flex items-center justify-center text-[#5B3FD6]" aria-label="إضافة مصدر"><Plus className="w-5 h-5" /></button>
        </div>
      </header>

      <div className="-mx-1 px-1 overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-1">
          <button
            onClick={() => void selectSource('ALL')}
            className={`px-4 py-2.5 rounded-md border text-xs font-black transition-all ${selectedSource === 'ALL' ? 'bg-[#2C2145] text-white border-[#2C2145] shadow-sm' : 'bg-white text-[#544B63] border-gray-100'}`}
          >
            الكل <span className="opacity-60 mr-1">{articles.length}</span>
          </button>
          {sources.map((source) => {
            const theme = sourceTheme(source.id);
            const Icon = theme.icon;
            const active = selectedSource === source.id;
            return (
              <button
                key={source.id}
                style={active ? { background: `linear-gradient(135deg, ${theme.color}, ${theme.end})`, borderColor: theme.color } : undefined}
                onClick={() => void selectSource(source.id)}
                className={`px-3.5 py-2.5 rounded-md border text-xs font-black flex items-center gap-2 transition-all ${active ? 'text-white shadow-sm' : theme.chip}`}
              >
                <Icon className="w-4 h-4" />
                <span>{source.name}</span>
                {!!articleCountBySource.get(source.id) && <span className={`text-[10px] ${active ? 'text-white/70' : 'opacity-55'}`}>{articleCountBySource.get(source.id)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {fetchError && <div className="rounded-md bg-amber-50 border border-amber-100 text-amber-800 px-4 py-3 text-xs font-semibold">{fetchError}</div>}

      {sourceLoading === selectedSource ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="bg-white border border-gray-100 rounded-lg p-5 shadow-xs overflow-hidden">
            <div className="flex items-center gap-3 mb-5">
              <Loader2 className="w-5 h-5 text-[#5B3FD6] animate-spin" />
              <div>
                <p className="font-black text-sm text-[#2C2145]">جارٍ جلب أحدث الأخبار…</p>
                <p className="text-[11px] text-gray-400 mt-1">يتم فحص المصدر وتحديث المحتوى.</p>
              </div>
            </div>
            <div className="h-4 w-3/4 rounded-full bg-gray-100 animate-pulse mb-3" />
            <div className="h-3 w-full rounded-full bg-gray-100 animate-pulse mb-2" />
            <div className="h-3 w-2/3 rounded-full bg-gray-100 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map((item) => (
              <div key={item} className="bg-white border border-gray-100 rounded-lg p-4">
                <div className="h-3 w-1/3 rounded-full bg-gray-100 animate-pulse mb-4" />
                <div className="h-4 w-full rounded-full bg-gray-100 animate-pulse mb-2" />
                <div className="h-4 w-4/5 rounded-full bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : featured ? (
        <NewsArticleCard onOpen={setOpened} article={featured} featured sourceName={sources.find(source => source.id === featured.sourceId)?.name} />
      ) : (
        <div className="bg-white border border-gray-100 rounded-lg p-7 text-center shadow-xs">
          <div className="w-14 h-14 rounded-md bg-[#F3F0FF] text-[#5B3FD6] flex items-center justify-center mx-auto mb-3"><Newspaper className="w-7 h-7" /></div>
          <p className="font-black text-[#2C2145]">لا توجد أخبار في هذا القسم الآن</p>
          <p className="text-xs text-gray-400 mt-2">جرّب مصدرًا آخر أو حدّث الأخبار.</p>
        </div>
      )}

      {!!rest.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rest.map(article => <NewsArticleCard onOpen={setOpened} key={article.internalId || article.id} article={article} sourceName={sources.find(source => source.id === article.sourceId)?.name} />)}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto bg-white rounded-lg p-5 text-right shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-black text-[#2C2145]">إضافة مصدر</h2>
                <p className="text-xs text-gray-400 mt-1">نفحص قالب الأخبار أولًا، ثم تعرض المعاينة قبل الحفظ.</p>
              </div>
              <button disabled={checking} aria-label="إغلاق إضافة المصدر" onClick={() => setShowAdd(false)} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <input aria-label="اسم المصدر" disabled={checking} maxLength={100} value={name} onChange={(event) => { setName(event.target.value); resetCheck(); }} placeholder="اسم المصدر" className="w-full bg-[#F8F9FD] border border-gray-100 rounded-md px-4 py-3 mb-3 outline-none text-sm" />
            <input aria-label="رابط قسم الأخبار أو RSS" disabled={checking} maxLength={2000} value={url} onChange={(event) => { setUrl(event.target.value); resetCheck(); }} dir="ltr" placeholder="https://example.ma" className="w-full bg-[#F8F9FD] border border-gray-100 rounded-md px-4 py-3 outline-none text-left text-sm" />
            {error && <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>}
            <button disabled={checking || !url.trim()} onClick={() => void check()} className="w-full mt-4 bg-[#5B3FD6] text-white rounded-md py-3.5 font-black disabled:opacity-50">{checking ? 'جارٍ فحص المصدر…' : 'فحص ومعاينة الأخبار'}</button>
            <p className="text-xs text-gray-400 mt-2">أدخل رابط قسم الأخبار أو RSS مباشرًا. بعض المواقع تمنع الجلب من نسخة الويب.</p>
            {unsupportedPage && !preview && (
              <div className="mt-4 border border-gray-100 rounded-md p-3">
                <label className="flex gap-2 items-start text-xs text-gray-500">
                  <input type="checkbox" checked={aiConsent} disabled={checking} onChange={event => setAiConsent(event.target.checked)} />
                  <span>أوافق على إرسال مقتطف من الصفحة إلى Gemini بمفتاحي المتحقق لاقتراح إعدادات استخراج. لن يُحفظ المصدر إلا بعد نجاح الاختبار ومعاينتي.</span>
                </label>
                <button disabled={!aiConsent || checking} onClick={() => void check(true)} className="w-full mt-3 border border-gray-100 rounded-md py-3 text-sm font-bold disabled:opacity-50">محاولة إعداد المصدر بالذكاء الاصطناعي</button>
              </div>
            )}
            {preview && (
              <section aria-label="معاينة أخبار المصدر" className="mt-4 border border-gray-100 rounded-md p-3">
                <h3 className="font-bold text-sm text-[#2C2145]">معاينة {preview.source.name}</h3>
                <p className="text-xs text-gray-500 mt-1">استخرجنا {preview.articles.length} خبرًا عبر {preview.source.kind === 'rss' ? 'RSS' : 'قالب HTML'}. تأكد أن العناوين أخبار فعلية قبل الاعتماد؛ النص الأصلي يُعرض دون تنفيذ HTML.</p>
                <ul className="mt-3 space-y-3">
                  {preview.articles.slice(0, 3).map(article => (
                    <li key={article.url} className="text-xs border-t border-gray-100 pt-2">
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#5B3FD6]">{article.title}</a>
                      <p className="text-gray-500 mt-1">{article.publishedAt || 'تاريخ النشر غير متاح'}</p>
                    </li>
                  ))}
                </ul>
                <button disabled={checking} onClick={add} className="w-full mt-4 bg-[#5B3FD6] text-white rounded-md py-3 font-black">اعتماد وإضافة المصدر</button>
              </section>
            )}

            {sources.some((source) => !source.builtIn) && (
              <div className="mt-5 border-t border-gray-100 pt-3">
                <div className="text-[11px] font-bold text-gray-400 mb-1">مصادرك</div>
                {sources.filter((source) => !source.builtIn).map((source) => (
                  <div key={source.id} className="flex justify-between items-center py-2.5 text-xs">
                    <span className="font-bold text-[#2C2145]">{source.name}</span>
                    <button
                      onClick={() => {
                        try {
                          newsService.removeSource(source.id);
                          if (selectedSource === source.id) setSelectedSource('ALL');
                          setVersion((value) => value + 1);
                        } catch (error) { setError(error instanceof Error ? error.message : 'تعذر حذف المصدر.'); }
                      }}
                      className="w-8 h-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"
                      aria-label={`حذف ${source.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
