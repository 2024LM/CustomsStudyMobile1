import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, ChevronLeft, FileText, FolderOpen, RefreshCw, Search, WifiOff, X } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { fetchReferenceContent, fetchReferenceIndex, isInlineReadable, ReferenceItem } from '../services/references';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\`[^\`]+\`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-[#2C2145]">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="px-1.5 py-0.5 rounded bg-[#F5F3FF] text-[#5B3FD6] text-[12px]" dir="ltr">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-[#5B3FD6] underline underline-offset-2">{link[1]}</a>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function MarkdownReader({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <article className="text-[#3D3550] text-[14px] leading-8">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-3" />;
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const size = heading[1].length === 1 ? 'text-xl' : heading[1].length === 2 ? 'text-lg' : 'text-base';
          return <h2 key={i} className={`${size} font-bold text-[#2C2145] mt-4 mb-1`}>{renderInline(heading[2])}</h2>;
        }
        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) return <div key={i} className="flex items-start gap-2 pr-1"><span className="text-[#5B3FD6] font-bold">•</span><p className="flex-1">{renderInline(bullet[1])}</p></div>;
        const numbered = line.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) return <div key={i} className="flex items-start gap-2 pr-1"><span className="text-[#5B3FD6] font-bold min-w-5">{numbered[1]}.</span><p className="flex-1">{renderInline(numbered[2])}</p></div>;
        const quote = line.match(/^>\s?(.+)$/);
        if (quote) return <blockquote key={i} className="my-2 border-r-4 border-[#D8CDFB] bg-[#F8F7FF] rounded-l-[12px] px-3 py-2 text-gray-600">{renderInline(quote[1])}</blockquote>;
        if (/^---+$/.test(line.trim())) return <hr key={i} className="my-4 border-gray-100" />;
        return <p key={i} className="font-medium">{renderInline(line)}</p>;
      })}
    </article>
  );
}

function DocumentReader({ text, type }: { text: string; type: string }) {
  const markdown = type.toLowerCase().includes('md');
  return markdown
    ? <MarkdownReader text={text} />
    : <div className="whitespace-pre-wrap leading-8 text-[14px] text-[#3D3550] font-medium">{text}</div>;
}

export const ReferencesPage: React.FC = () => {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [category, setCategory] = useState('الكل');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ReferenceItem | null>(null);
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState('');

  const load = async (force = false) => {
    setLoading(true); setError('');
    try {
      const result = await fetchReferenceIndex(force);
      setItems(result.items); setCached(result.cached);
    } catch {
      setError('تعذر تحميل فهرس المراجع. تأكد من الاتصال وإتاحة ملف الفهرس للقراءة.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => ['الكل', ...Array.from(new Set(items.flatMap((x) => x.categories)))], [items]);
  const filtered = useMemo(() => items.filter((x) => {
    const inCategory = category === 'الكل' || x.categories.includes(category);
    const q = query.trim().toLowerCase();
    return inCategory && (!q || x.title.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
  }), [items, category, query]);

  const openItem = async (item: ReferenceItem) => {
    if (!isInlineReadable(item.type)) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setSelected(item); setContent(''); setContentError(''); setContentLoading(true);
    try { setContent(await fetchReferenceContent(item)); }
    catch { setContentError('تعذر قراءة هذا المستند داخل التطبيق. تحقق من صلاحية الرابط وإتاحة الملف للقراءة.'); }
    finally { setContentLoading(false); }
  };

  if (selected) {
    return (
      <div className="flex flex-col gap-3 pb-8 text-right">
        <div className="sticky top-0 z-20 bg-[#F8F9FD]/95 backdrop-blur-md py-1">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setSelected(null)} className="w-10 h-10 rounded-[13px] bg-white border border-gray-100 flex items-center justify-center text-[#5B3FD6] shadow-xs cursor-pointer"><ChevronLeft className="w-5 h-5 rotate-180" /></button>
            <div className="flex-1 min-w-0"><h1 className="font-bold text-base text-[#2C2145] truncate">{selected.title}</h1><p className="text-[11px] text-gray-400">{selected.type}</p></div>
            <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full text-gray-400 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="bg-white rounded-[22px] p-5 border border-gray-100 shadow-xs">
          {contentLoading && <div className="py-12 text-center text-sm text-gray-400">جاري تحميل المستند...</div>}
          {contentError && <div className="py-8 text-center text-sm text-[#C62828]">{contentError}</div>}
          {!contentLoading && !contentError && <DocumentReader text={content} type={selected.type} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader title="المراجع" subtitle="مكتبة المراجعة والقوالب والمستندات" action={
        <button onClick={() => void load(true)} disabled={loading} className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center cursor-pointer disabled:opacity-50"><RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin' : ''}`} /></button>
      } />

      <ReferenceBannerAd slot="top" />

      <div className="bg-gradient-to-l from-[#392080] to-[#6841E8] rounded-[24px] p-5 text-white shadow-sm">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center"><BookMarked className="w-6 h-6" /></div><div><h2 className="font-bold text-lg">مكتبة المراجع</h2><p className="text-xs text-[#DDD5FF] mt-0.5">{items.length} مرجع متاح</p></div></div>
      </div>

      <div className="relative">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في المراجع..." className="w-full h-12 pr-11 pl-4 rounded-[16px] bg-white border border-gray-100 outline-none focus:border-[#5B3FD6]/40 text-sm shadow-xs" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => <button key={c} onClick={() => setCategory(c)} className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${category === c ? 'bg-[#5B3FD6] text-white' : 'bg-white border border-gray-100 text-gray-500'}`}>{c}</button>)}
      </div>

      {cached && !loading && <div className="text-[11px] text-amber-700 bg-amber-50 rounded-[12px] px-3 py-2">يتم عرض نسخة محفوظة محليًا، ويمكن تحديثها من زر التحديث.</div>}
      {error && <div className="bg-white rounded-[18px] p-5 border border-red-100 text-center"><WifiOff className="w-6 h-6 text-[#C62828] mx-auto mb-2" /><p className="text-sm text-[#C62828]">{error}</p></div>}
      {loading && <div className="py-10 text-center text-sm text-gray-400">جاري تحميل المراجع...</div>}

      {!loading && !error && <div className="flex flex-col gap-2.5">
        {filtered.map((item, index) => (
          <React.Fragment key={item.id}>
            <button onClick={() => void openItem(item)} className="w-full bg-white rounded-[19px] p-4 text-right border border-gray-100 shadow-xs hover:border-[#5B3FD6]/30 transition-all active:scale-98 cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0"><div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">{item.type.toLowerCase().includes('google') ? <FileText className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}</div><div className="min-w-0"><h3 className="font-bold text-sm text-[#2C2145]">{item.title}</h3><p className="text-xs text-gray-500 mt-1 leading-5">{item.description}</p><div className="flex flex-wrap gap-1 mt-2">{item.categories.slice(0, 3).map((c) => <span key={c} className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#5B3FD6] text-[10px] font-semibold">{c}</span>)}</div></div></div>
                <ChevronLeft className="w-4 h-4 text-gray-400 shrink-0 mt-3" />
              </div>
            </button>
            {(index + 1) % 4 === 0 && <ReferenceBannerAd slot={`list-${index + 1}`} />}
          </React.Fragment>
        ))}
        {filtered.length === 0 && <div className="py-10 text-center text-sm text-gray-400">لا توجد مراجع مطابقة.</div>}
      </div>}
    </div>
  );
};
