import React, { useEffect, useMemo, useState } from 'react';
import * as mammoth from 'mammoth';
import { BookMarked, ChevronLeft, FileText, FolderOpen, RefreshCw, Search, WifiOff, X, Upload, Trash2, Download, Cloud, HardDrive, UserRound } from 'lucide-react';
import { downloadableReferenceType, fetchReferenceContent, fetchReferenceDocx, fetchReferenceDownload, fetchReferenceIndex, isInlineReadable, ReferenceItem } from '../services/references';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';
import { showReferenceInterstitial } from '../services/ads';
import { addLocalReference, deleteLocalReference, listLocalReferences, LocalReference, saveDownloadedReference } from '../services/localReferences';
import { db } from '../services/db';
import { AiReferenceTools } from '../components/AiReferenceTools';
import { PdfReader } from '../components/PdfReader';
import { SpeakButton } from '../components/SpeakButton';
import { FloatingNotice } from '../components/FloatingNotice';


function htmlToPlainText(html: string): string {
  if (!html.trim()) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}

function sanitizeWordHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocked = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','META','LINK','BASE','SVG','MATH']);
  const allowedAttrs = new Set(['href','src','alt','title','colspan','rowspan']);
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (blocked.has(el.tagName)) { el.remove(); continue; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowedAttrs.has(name)) el.removeAttribute(attr.name);
    }
    if (el.hasAttribute('href')) {
      try {
        const url = new URL(el.getAttribute('href') || '', window.location.href);
        if (url.protocol !== 'https:') el.removeAttribute('href');
        else { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      } catch { el.removeAttribute('href'); }
    }
    if (el.hasAttribute('src')) {
      const src = el.getAttribute('src') || '';
      if (!src.startsWith('data:image/')) el.removeAttribute('src');
    }
  }
  return doc.body.innerHTML;
}

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
    <article className="reference-document text-[#3D3550] text-[14px] leading-8">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-3" />;
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const size = heading[1].length === 1 ? 'text-xl' : heading[1].length === 2 ? 'text-lg' : heading[1].length === 3 ? 'text-base' : 'text-sm';
          return <h2 key={i} className={`${size} font-bold text-[#2C2145] mt-4 mb-1`}>{renderInline(heading[2])}</h2>;
        }
        const bullet = line.match(/^[-*+]\s+(.+)$/);
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

function looksLikeMarkdown(text: string): boolean {
  const sample = text.replace(/\r\n/g, '\n');
  return /(^|\n)#{1,6}\s+\S/.test(sample)
    || /(^|\n)>\s+\S/.test(sample)
    || /(^|\n)(?:[-*+]\s+|\d+\.\s+)\S/.test(sample)
    || /\*\*[^*]+\*\*/.test(sample)
    || /\[[^\]]+\]\(https:\/\/[^\s)]+\)/.test(sample)
    || /(^|\n)---+\s*(?:\n|$)/.test(sample);
}

function DocumentReader({ text, type }: { text: string; type: string }) {
  // Google Docs exported as text can still contain Markdown syntax. Detect the
  // content itself instead of relying only on the spreadsheet file-type label.
  const markdown = type.toLowerCase().includes('md') || looksLikeMarkdown(text);
  return markdown
    ? <MarkdownReader text={text} />
    : <div className="reference-document whitespace-pre-wrap leading-8 text-[14px] text-[#3D3550] font-medium">{text}</div>;
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
  const [wordHtml, setWordHtml] = useState('');
  const [localItems, setLocalItems] = useState<LocalReference[]>([]);
  const [localSelected, setLocalSelected] = useState<LocalReference | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [localStatus, setLocalStatus] = useState('');
  const [sourceTab, setSourceTab] = useState<'online' | 'downloaded' | 'uploaded'>('online');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = async (force = false) => {
    setLoading(true); setError('');
    try {
      const result = await fetchReferenceIndex(force);
      setItems(result.items); setCached(result.cached);
    } catch {
      setError('تعذر تحميل فهرس المراجع. تأكد من الاتصال وإتاحة ملف الفهرس للقراءة.');
    } finally { setLoading(false); }
  };

  const loadLocal = async () => {
    try {
      setLocalItems(await listLocalReferences(db.activeDomainId()));
    } catch {
      setLocalStatus('تعذر قراءة المراجع المحلية.');
    }
  };

  useEffect(() => {
    void load();
    void loadLocal();
  }, []);

  const uploadedItems = useMemo(() => localItems.filter((item) => item.source === 'upload'), [localItems]);
  const downloadedItems = useMemo(() => localItems.filter((item) => item.source === 'download'), [localItems]);
  const downloadedByRemoteId = useMemo(() => {
    const map = new Map<string, LocalReference>();
    for (const item of downloadedItems) {
      if (item.remoteId) map.set(item.remoteId, item);
    }
    return map;
  }, [downloadedItems]);

  const onlineById = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);

  const categories = useMemo(() => ['الكل', ...Array.from(new Set(items.flatMap((x) => x.categories)))], [items]);
  const filtered = useMemo(() => items.filter((x) => {
    const inCategory = category === 'الكل' || x.categories.includes(category);
    const q = query.trim().toLowerCase();
    return inCategory && (!q || x.title.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
  }), [items, category, query]);

  const handleLocalUpload = async (file: File | null) => {
    if (!file) return;
    setLocalStatus('');
    try {
      await addLocalReference(file, db.activeDomainId());
      await loadLocal();
      setLocalStatus('تمت إضافة المرجع إلى مكتبتك.');
    } catch (error: any) {
      setLocalStatus(error?.message || 'تعذر إضافة المرجع');
    }
  };

  const openLocalItem = async (item: LocalReference) => {
    await showReferenceInterstitial();
    setSelected(null);
    setLocalSelected(item);
    setContent('');
    setWordHtml('');
    setPdfBlob(null);
    setContentError('');
    setContentLoading(true);

    try {
      if (item.type === 'pdf') {
        setPdfBlob(item.data);
      } else if (item.type === 'docx') {
        const result = await mammoth.convertToHtml(
          { arrayBuffer: await item.data.arrayBuffer() },
          { convertImage: mammoth.images.imgElement(async (image: { contentType: string; read: (encoding: string) => Promise<string> }) => ({ src: await image.read('base64').then((b: string) => `data:${image.contentType};base64,${b}`) })) }
        );
        setWordHtml(sanitizeWordHtml(result.value));
      } else {
        setContent(await item.data.text());
      }
    } catch {
      setContentError('تعذر فتح هذا المرجع داخل التطبيق.');
    } finally {
      setContentLoading(false);
    }
  };

  const removeLocalItem = async (item: LocalReference, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`حذف المرجع "${item.name}" من الجهاز؟`)) return;
    try {
      await deleteLocalReference(item.id);
      if (localSelected?.id === item.id) {
        setLocalSelected(null);
        setPdfBlob(null);
      }
      await loadLocal();
      setLocalStatus('تم حذف المرجع.');
    } catch {
      setLocalStatus('تعذر حذف المرجع.');
    }
  };

  const downloadOnlineItem = async (item: ReferenceItem, event: React.MouseEvent) => {
    event.stopPropagation();
    if (downloadingId) return;
    const supportedType = downloadableReferenceType(item.type);
    if (!supportedType) {
      setLocalStatus('هذا النوع لا يدعم التنزيل داخل التطبيق حاليًا.');
      return;
    }

    setDownloadingId(item.id);
    setLocalStatus('');
    try {
      const downloaded = await fetchReferenceDownload(item);
      await saveDownloadedReference({
        remoteId: item.id,
        title: item.title,
        description: item.description,
        categories: item.categories,
        originalUrl: item.url,
        version: item.version,
        updatedAt: item.updatedAt,
        type: downloaded.type,
        mimeType: downloaded.mimeType,
        data: downloaded.blob,
        domainId: db.activeDomainId(),
      });
      await loadLocal();
      setLocalStatus(downloadedByRemoteId.has(item.id) ? 'تم تحديث المرجع إلى أحدث إصدار.' : 'تم تنزيل المرجع وأصبح متاحًا بدون إنترنت.');
    } catch (error: any) {
      setLocalStatus(error?.message || 'تعذر تنزيل المرجع.');
    } finally {
      setDownloadingId(null);
    }
  };

  const openItem = async (item: ReferenceItem) => {
    await showReferenceInterstitial();
    const referenceType = downloadableReferenceType(item.type);
    if (!isInlineReadable(item.type) && referenceType !== 'pdf') {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }

    setSelected(item);
    setLocalSelected(null);
    setContent('');
    setWordHtml('');
    setPdfBlob(null);
    setContentError('');
    setContentLoading(true);

    try {
      if (referenceType === 'pdf') {
        const downloaded = await fetchReferenceDownload(item);
        setPdfBlob(downloaded.blob);
      } else {
        const word = /docx|word/i.test(item.type);
        if (word) {
          const result = await mammoth.convertToHtml(
            { arrayBuffer: await fetchReferenceDocx(item) },
            { convertImage: mammoth.images.imgElement(async (image: { contentType: string; read: (encoding: string) => Promise<string> }) => ({ src: await image.read('base64').then((b: string) => `data:${image.contentType};base64,${b}`) })) }
          );
          setWordHtml(sanitizeWordHtml(result.value));
        } else {
          setContent(await fetchReferenceContent(item));
        }
      }
    }
    catch { setContentError('تعذر قراءة هذا المستند داخل التطبيق. تحقق من صلاحية الرابط وإتاحة الملف للقراءة.'); }
    finally { setContentLoading(false); }
  };

  if (localSelected) {
    return (
      <div data-speech-scope className="flex flex-col gap-3 pb-8 text-right">
        <div className="sticky top-0 z-20 bg-[#F8F9FD]/95 backdrop-blur-md py-1">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setLocalSelected(null);
                setPdfBlob(null);
              }}
              className="w-10 h-10 rounded-[13px] bg-white border border-gray-100 flex items-center justify-center text-[#5B3FD6] shadow-xs"
            >
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base text-[#2C2145] truncate">{localSelected.name}</h1>
              <p className="text-[11px] text-gray-400">مرجع محلي • {localSelected.type.toUpperCase()}</p>
            </div>
            {localSelected.type !== 'pdf' && !contentLoading && !contentError && (
              <SpeakButton
                text={content || htmlToPlainText(wordHtml)}
                title="استماع"
                onError={setLocalStatus}
                className="shrink-0 bg-white border border-gray-100 shadow-xs"
              />
            )}
            <button onClick={() => { setLocalSelected(null); setPdfBlob(null); }} className="w-9 h-9 rounded-full text-gray-400 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!contentLoading && !contentError && localSelected.type !== 'pdf' && (
          <AiReferenceTools
            title={localSelected.name}
            text={content || htmlToPlainText(wordHtml)}
          />
        )}

        <div data-speech-text className="reference-reader bg-white rounded-[22px] p-3 border border-gray-100 shadow-xs min-h-[70vh]">
          {contentLoading && <div className="py-12 text-center text-sm text-gray-400">جاري فتح المرجع...</div>}
          {contentError && <div className="py-8 text-center text-sm text-[#C62828]">{contentError}</div>}
          {!contentLoading && !contentError && localSelected.type === 'pdf' && pdfBlob && (
            <PdfReader blob={pdfBlob} title={localSelected.name} />
          )}
          {!contentLoading && !contentError && localSelected.type === 'docx' && wordHtml && (
            <div className="reference-document word-document p-2" dangerouslySetInnerHTML={{ __html: wordHtml }} />
          )}
          {!contentLoading && !contentError && (localSelected.type === 'md' || localSelected.type === 'txt') && (
            <div className="p-2">
              <DocumentReader text={content} type={localSelected.type} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div data-speech-scope className="flex flex-col gap-3 pb-8 text-right">
        <div className="sticky top-0 z-20 bg-[#F8F9FD]/95 backdrop-blur-md py-1">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => { setSelected(null); setPdfBlob(null); }} className="w-10 h-10 rounded-[13px] bg-white border border-gray-100 flex items-center justify-center text-[#5B3FD6] shadow-xs cursor-pointer"><ChevronLeft className="w-5 h-5 rotate-180" /></button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base text-[#2C2145] truncate">{selected.title}</h1>
              <p className="text-[11px] text-gray-400">{selected.type}</p>
            </div>
            {downloadableReferenceType(selected.type) !== 'pdf' && !contentLoading && !contentError && (
              <SpeakButton
                text={content || htmlToPlainText(wordHtml)}
                title="استماع"
                onError={setContentError}
                className="shrink-0 bg-white border border-gray-100 shadow-xs"
              />
            )}
            <button onClick={() => { setSelected(null); setPdfBlob(null); }} className="w-9 h-9 rounded-full text-gray-400 flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {!contentLoading && !contentError && downloadableReferenceType(selected.type) !== 'pdf' && (
          <AiReferenceTools
            title={selected.title}
            text={content || htmlToPlainText(wordHtml)}
          />
        )}

        <div data-speech-text className="reference-reader bg-white rounded-[22px] p-5 border border-gray-100 shadow-xs">
          {contentLoading && <div className="py-12 text-center text-sm text-gray-400">جاري تحميل المستند...</div>}
          {contentError && <div className="py-8 text-center text-sm text-[#C62828]">{contentError}</div>}
          {!contentLoading && !contentError && downloadableReferenceType(selected.type) === 'pdf' && pdfBlob && (
            <PdfReader blob={pdfBlob} title={selected.title} />
          )}
          {!contentLoading && !contentError && downloadableReferenceType(selected.type) !== 'pdf' && wordHtml && <div className="reference-document word-document" dangerouslySetInnerHTML={{ __html: wordHtml }} />}
          {!contentLoading && !contentError && downloadableReferenceType(selected.type) !== 'pdf' && !wordHtml && <DocumentReader text={content} type={selected.type} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <div data-tour="references-library" className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0">
              <BookMarked className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg">المراجع</h1>
              <p className="text-xs text-[#DDD5FF] mt-0.5">{items.length} عبر الإنترنت • {downloadedItems.length} منزّل • {uploadedItems.length} خاص</p>
            </div>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="w-10 h-10 rounded-[12px] bg-white/15 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
            aria-label="تحديث المراجع"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <ReferenceBannerAd slot="top" format="banner" />

      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'online', label: 'عبر الإنترنت', icon: Cloud, count: items.length },
          { id: 'downloaded', label: 'تم تنزيلها', icon: HardDrive, count: downloadedItems.length },
          { id: 'uploaded', label: 'رفعتها أنت', icon: UserRound, count: uploadedItems.length },
        ].map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setSourceTab(id as 'online' | 'downloaded' | 'uploaded')}
            className={`rounded-[16px] border p-3 flex flex-col items-center gap-1.5 transition-all ${
              sourceTab === id
                ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6]'
                : 'bg-white border-gray-100 text-gray-500'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-bold">{label}</span>
            <span className="text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <FloatingNotice message={localStatus} onDismiss={() => setLocalStatus('')} />

      {sourceTab === 'uploaded' && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-[#2C2145]">مراجع رفعتها أنت</h3>
              <p className="text-[11px] text-gray-400 mt-1">ملفاتك الشخصية محفوظة على هذا الجهاز</p>
            </div>
            <label className="shrink-0 h-10 px-3 rounded-[13px] bg-[#5B3FD6] text-white text-xs font-bold flex items-center gap-2 justify-center cursor-pointer">
              <Upload className="w-4 h-4" />
              رفع مرجع
              <input
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleLocalUpload(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          {uploadedItems.length === 0 ? (
            <div className="rounded-[14px] bg-[#F8F9FD] px-3 py-5 text-center text-xs text-gray-400">
              لم ترفع أي مرجع خاص بعد.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {uploadedItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openLocalItem(item)}
                  className="w-full rounded-[15px] bg-[#F8F9FD] border border-gray-100 p-3 flex items-center justify-between gap-3 text-right cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-[#5B3FD6] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#2C2145] truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{item.type.toUpperCase()} • {(item.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  </div>
                  <button onClick={(event) => void removeLocalItem(item, event)} className="w-9 h-9 rounded-[11px] text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sourceTab === 'downloaded' && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
          <div>
            <h3 className="font-bold text-sm text-[#2C2145]">مراجع تم تنزيلها</h3>
            <p className="text-[11px] text-gray-400 mt-1">تعمل بدون اتصال بالإنترنت</p>
          </div>
          {downloadedItems.length === 0 ? (
            <div className="rounded-[14px] bg-[#F8F9FD] px-3 py-5 text-center text-xs text-gray-400">
              لم تنزّل أي مرجع بعد. انتقل إلى «عبر الإنترنت» واضغط زر التنزيل.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {downloadedItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openLocalItem(item)}
                  className="w-full rounded-[15px] bg-[#F8F9FD] border border-gray-100 p-3 flex items-center justify-between gap-3 text-right cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <HardDrive className="w-5 h-5 text-[#5B3FD6] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#2C2145] truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        متاح Offline • {item.type.toUpperCase()} • v{item.downloadedVersion || 1}
                      </div>
                      {item.remoteId && onlineById.get(item.remoteId) && onlineById.get(item.remoteId)!.version > (item.downloadedVersion || 1) && (
                        <div className="text-[10px] font-bold text-amber-600 mt-1">
                          تحديث متوفر: v{onlineById.get(item.remoteId)!.version}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.remoteId && onlineById.get(item.remoteId) && onlineById.get(item.remoteId)!.version > (item.downloadedVersion || 1) && (
                      <button
                        onClick={(event) => void downloadOnlineItem(onlineById.get(item.remoteId!)!, event)}
                        disabled={downloadingId === item.remoteId}
                        className="h-9 px-2.5 rounded-[11px] bg-amber-50 text-amber-700 text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {downloadingId === item.remoteId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        تحديث
                      </button>
                    )}
                    <button onClick={(event) => void removeLocalItem(item, event)} className="w-9 h-9 rounded-[11px] text-red-500 hover:bg-red-50 flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sourceTab === 'online' && (
        <>
      <div data-tour="references-search" className="relative">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في المراجع..." className="w-full h-12 pr-11 pl-4 rounded-[16px] bg-white border border-gray-100 outline-none focus:border-[#5B3FD6]/40 text-sm shadow-xs" />
      </div>

      <div data-tour="references-categories" className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => <button key={c} onClick={() => setCategory(c)} className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${category === c ? 'bg-[#5B3FD6] text-white' : 'bg-white border border-gray-100 text-gray-500'}`}>{c}</button>)}
      </div>

      {cached && !loading && <div className="text-[11px] text-amber-700 bg-amber-50 rounded-[12px] px-3 py-2">يتم عرض نسخة محفوظة محليًا، ويمكن تحديثها من زر التحديث.</div>}
      {error && <div className="bg-white rounded-[18px] p-5 border border-red-100 text-center"><WifiOff className="w-6 h-6 text-[#C62828] mx-auto mb-2" /><p className="text-sm text-[#C62828]">{error}</p></div>}
      {loading && <div className="py-10 text-center text-sm text-gray-400">جاري تحميل المراجع...</div>}

      {!loading && !error && <div className="flex flex-col gap-2.5">
        {filtered.map((item, index) => (
          <React.Fragment key={item.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => void openItem(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void openItem(item);
              }}
              className="w-full bg-white rounded-[19px] p-4 text-right border border-gray-100 shadow-xs hover:border-[#5B3FD6]/30 transition-all active:scale-98 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0"><div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">{item.type.toLowerCase().includes('google') ? <FileText className="w-5 h-5" /> : <FolderOpen className="w-5 h-5" />}</div><div className="min-w-0"><h3 className="font-bold text-sm text-[#2C2145]">{item.title}</h3><p className="text-xs text-gray-500 mt-1 leading-5">{item.description}</p><div className="flex flex-wrap gap-1 mt-2">{item.categories.slice(0, 3).map((c) => <span key={c} className="px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#5B3FD6] text-[10px] font-semibold">{c}</span>)}</div>
                  <div className="text-[10px] text-gray-400 mt-1">الإصدار {item.version}{item.updatedAt ? ` • ${item.updatedAt}` : ''}</div></div></div>
                <div className="flex items-center gap-1 shrink-0 mt-1">
                  {downloadableReferenceType(item.type) && (() => {
                      const local = downloadedByRemoteId.get(item.id);
                      const needsUpdate = Boolean(local && item.version > (local.downloadedVersion || 1));
                      const isCurrent = Boolean(local && !needsUpdate);
                      return (
                        <button
                          onClick={(event) => void downloadOnlineItem(item, event)}
                          disabled={downloadingId === item.id || isCurrent}
                          className={`h-9 px-2.5 rounded-[11px] flex items-center justify-center gap-1 text-[10px] font-bold disabled:opacity-45 ${
                            needsUpdate ? 'bg-amber-50 text-amber-700' : 'bg-[#F5F3FF] text-[#5B3FD6]'
                          }`}
                          aria-label={needsUpdate ? 'تحديث المرجع' : 'تنزيل المرجع'}
                        >
                          {downloadingId === item.id
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : needsUpdate
                              ? <><RefreshCw className="w-4 h-4" /><span>تحديث</span></>
                              : isCurrent
                                ? <HardDrive className="w-4 h-4" />
                                : <Download className="w-4 h-4" />}
                        </button>
                      );
                    })()}
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
            {(index + 1) % 4 === 0 && <ReferenceBannerAd slot={`list-${index + 1}`} />}
          </React.Fragment>
        ))}
        {filtered.length === 0 && <div className="py-10 text-center text-sm text-gray-400">لا توجد مراجع مطابقة.</div>}
      </div>}
        </>
      )}
    </div>
  );
};
