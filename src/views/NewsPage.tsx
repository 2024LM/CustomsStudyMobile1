import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  FileText,
  Landmark,
  Languages,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { newsService } from '../features/news/services/newsService';

const sourceTheme = (id: string) => {
  if (id === 'emploi-public') return { icon: Landmark, shell: 'from-[#2F5AA8] to-[#173B72]', chip: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (id === 'men') return { icon: FileText, shell: 'from-[#8B5CF6] to-[#5B21B6]', chip: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (id === 'finances') return { icon: Landmark, shell: 'from-[#0F766E] to-[#115E59]', chip: 'bg-teal-50 text-teal-700 border-teal-100' };
  if (id === 'hcp') return { icon: CalendarDays, shell: 'from-[#B45309] to-[#92400E]', chip: 'bg-amber-50 text-amber-700 border-amber-100' };
  if (id === 'open-data-ma') return { icon: Sparkles, shell: 'from-[#0F766E] to-[#0E7490]', chip: 'bg-cyan-50 text-cyan-700 border-cyan-100' };
  return { icon: Newspaper, shell: 'from-[#5B3FD6] to-[#392080]', chip: 'bg-[#F5F3FF] text-[#5B3FD6] border-[#E7E1FF]' };
};

function cleanSummary(value?: string) {
  if (!value) return '';
  const cleaned = value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|•·—-]+|[\s|•·—-]+$/g, '')
    .trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-MA', { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return '';
  }
}


function hasArabic(value?: string) {
  return Boolean(value && /[\u0600-\u06FF]/.test(value));
}

function articleIsArabic(title: string, summary?: string) {
  return hasArabic(title) || hasArabic(summary);
}

function translateUrl(url: string) {
  return `https://translate.google.com/translate?sl=auto&tl=ar&u=${encodeURIComponent(url)}`;
}

export const NewsPage: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sourceLoading, setSourceLoading] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');

  const sources = useMemo(() => newsService.sources().filter((source) => source.enabled), [version]);
  const articles = useMemo(() => newsService.cachedArticles(), [version]);
  const filteredArticles = useMemo(() => {
    const selected = selectedSource === 'ALL'
      ? articles
      : articles.filter((article) => article.sourceId === selectedSource);
    return [...selected].sort((a, b) => {
      const arabicA = articleIsArabic(a.title, a.summary) ? 1 : 0;
      const arabicB = articleIsArabic(b.title, b.summary) ? 1 : 0;
      return arabicB - arabicA;
    });
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
      await newsService.refresh();
      setVersion((value) => value + 1);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 650) await new Promise((resolve) => setTimeout(resolve, 650 - elapsed));
      setSourceLoading(null);
    }
  };

  const add = () => {
    try {
      const source = newsService.addSource({ name, url });
      setName('');
      setUrl('');
      setError('');
      setShowAdd(false);
      setSelectedSource(source.id);
      setVersion((value) => value + 1);
    } catch {
      setError('أدخل رابطًا صحيحًا يبدأ بـ https:// أو http://');
    }
  };

  const featured = filteredArticles[0];
  const rest = filteredArticles.slice(1);

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-6 bg-gradient-to-br from-[#2B1766] via-[#4C2FC4] to-[#7257F4] text-white shadow-sm overflow-hidden relative">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 right-10 w-44 h-44 rounded-full bg-fuchsia-300/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/10 flex items-center justify-center">
                <Newspaper className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-white/70">راجِع | الأخبار</span>
            </div>
            <h1 className="font-black text-[22px] leading-8">أخبار المراجعة والمباريات</h1>
            <p className="text-xs text-white/70 mt-1">مختارات مغربية مفيدة ومباشرة.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => void refresh()} disabled={loading} className="w-10 h-10 rounded-2xl bg-white/15 border border-white/10 flex items-center justify-center active:scale-95" aria-label="تحديث الأخبار">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            </button>
            <button onClick={() => setShowAdd(true)} className="w-10 h-10 rounded-2xl bg-white text-[#4C2FC4] flex items-center justify-center active:scale-95 shadow-sm" aria-label="إضافة مصدر">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="-mx-1 px-1 overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-1">
          <button
            onClick={() => void selectSource('ALL')}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-black transition-all ${selectedSource === 'ALL' ? 'bg-[#2C2145] text-white border-[#2C2145] shadow-sm' : 'bg-white text-[#544B63] border-gray-100'}`}
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
                onClick={() => void selectSource(source.id)}
                className={`px-3.5 py-2.5 rounded-2xl border text-xs font-black flex items-center gap-2 transition-all ${active ? 'bg-[#5B3FD6] text-white border-[#5B3FD6] shadow-sm' : theme.chip}`}
              >
                <Icon className="w-4 h-4" />
                <span>{source.name}</span>
                {!!articleCountBySource.get(source.id) && <span className={`text-[10px] ${active ? 'text-white/70' : 'opacity-55'}`}>{articleCountBySource.get(source.id)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {fetchError && <div className="rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 px-4 py-3 text-xs font-semibold">{fetchError}</div>}

      {sourceLoading === selectedSource ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="bg-white border border-gray-100 rounded-[26px] p-5 shadow-xs overflow-hidden">
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
              <div key={item} className="bg-white border border-gray-100 rounded-[22px] p-4">
                <div className="h-3 w-1/3 rounded-full bg-gray-100 animate-pulse mb-4" />
                <div className="h-4 w-full rounded-full bg-gray-100 animate-pulse mb-2" />
                <div className="h-4 w-4/5 rounded-full bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : featured ? (() => {
        const source = sources.find((item) => item.id === featured.sourceId);
        const theme = sourceTheme(featured.sourceId);
        const Icon = theme.icon;
        const summary = cleanSummary(featured.summary);
        const date = formatDate(featured.publishedAt);
        const needsTranslation = !articleIsArabic(featured.title, summary);
        return (
          <div className="relative overflow-hidden min-h-[230px] rounded-[28px] shadow-sm border border-white/10 text-white block">
            {featured.imageUrl ? (
              <img src={featured.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${theme.shell}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5" />
            <div className="absolute top-4 right-4 w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md border border-white/15 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            <div className="relative min-h-[230px] p-5 flex flex-col justify-end">
              <div className="flex items-center gap-2 text-[11px] text-white/75 mb-2">
                <span className="font-bold">{source?.name || 'مصدر موثوق'}</span>
                {date && <><span className="w-1 h-1 rounded-full bg-white/50" /><span>{date}</span></>}
              </div>
              <h2 className="text-[19px] leading-8 font-black">{featured.title}</h2>
              {summary && <p className="text-xs leading-6 text-white/80 mt-2 line-clamp-2">{summary}</p>}
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <a href={featured.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-white/90 bg-white/10 border border-white/10 rounded-xl px-3 py-2">
                  قراءة الخبر <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {needsTranslation && (
                  <a
                    href={translateUrl(featured.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 border border-white/15 rounded-xl px-3 py-2"
                    aria-label="ترجمة الخبر إلى العربية"
                    title="ترجمة إلى العربية"
                  >
                    <Languages className="w-4 h-4" /> ترجمة
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="bg-white border border-gray-100 rounded-[26px] p-7 text-center shadow-xs">
          <div className="w-14 h-14 rounded-[20px] bg-[#F3F0FF] text-[#5B3FD6] flex items-center justify-center mx-auto mb-3"><Newspaper className="w-7 h-7" /></div>
          <p className="font-black text-[#2C2145]">لا توجد أخبار في هذا القسم الآن</p>
          <p className="text-xs text-gray-400 mt-2">جرّب مصدرًا آخر أو حدّث الأخبار.</p>
        </div>
      )}

      {!!rest.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rest.map((article) => {
            const source = sources.find((item) => item.id === article.sourceId);
            const theme = sourceTheme(article.sourceId);
            const Icon = theme.icon;
            const summary = cleanSummary(article.summary);
            const date = formatDate(article.publishedAt);
            const needsTranslation = !articleIsArabic(article.title, summary);
            return (
              <div key={article.id} className="group bg-white border border-gray-100 rounded-[22px] overflow-hidden shadow-xs">
                {article.imageUrl ? (
                  <div className="h-36 overflow-hidden bg-gray-100">
                    <img src={article.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" loading="lazy" />
                  </div>
                ) : (
                  <div className={`h-20 bg-gradient-to-br ${theme.shell} relative overflow-hidden`}>
                    <div className="absolute -left-3 -top-4 w-20 h-20 rounded-full bg-white/10" />
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                      <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/10 text-white flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                      <span className="text-[11px] font-bold text-white/75">{source?.name || 'مصدر'}</span>
                    </div>
                  </div>
                )}
                <div className="p-4">
                  {article.imageUrl && <div className="text-[11px] font-bold text-[#5B3FD6] mb-1">{source?.name || 'مصدر'}</div>}
                  <h3 className="font-black text-[14px] leading-6 text-[#2C2145]">{article.title}</h3>
                  {summary && <p className="text-xs text-gray-500 mt-2 leading-5 line-clamp-2">{summary}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                    <span>{date}</span>
                    <div className="flex items-center gap-1.5">
                      {needsTranslation && (
                        <a
                          href={translateUrl(article.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#5B3FD6] font-bold bg-[#F5F3FF] rounded-lg px-2 py-1.5"
                          aria-label="ترجمة الخبر إلى العربية"
                          title="ترجمة إلى العربية"
                        >
                          <Languages className="w-3.5 h-3.5" /> ترجمة
                        </a>
                      )}
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#5B3FD6] font-bold px-2 py-1.5">
                        فتح <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[28px] p-5 text-right shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-black text-[#2C2145]">إضافة مصدر</h2>
                <p className="text-xs text-gray-400 mt-1">أضف موقعًا تريد متابعته داخل قسم الأخبار.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم المصدر" className="w-full bg-[#F8F9FD] border border-gray-100 rounded-2xl px-4 py-3 mb-3 outline-none text-sm" />
            <input value={url} onChange={(event) => setUrl(event.target.value)} dir="ltr" placeholder="https://example.ma" className="w-full bg-[#F8F9FD] border border-gray-100 rounded-2xl px-4 py-3 outline-none text-left text-sm" />
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <button onClick={add} className="w-full mt-4 bg-[#5B3FD6] text-white rounded-2xl py-3.5 font-black">إضافة المصدر</button>

            {sources.some((source) => !source.builtIn) && (
              <div className="mt-5 border-t border-gray-100 pt-3">
                <div className="text-[11px] font-bold text-gray-400 mb-1">مصادرك</div>
                {sources.filter((source) => !source.builtIn).map((source) => (
                  <div key={source.id} className="flex justify-between items-center py-2.5 text-xs">
                    <span className="font-bold text-[#2C2145]">{source.name}</span>
                    <button
                      onClick={() => {
                        newsService.removeSource(source.id);
                        if (selectedSource === source.id) setSelectedSource('ALL');
                        setVersion((value) => value + 1);
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
