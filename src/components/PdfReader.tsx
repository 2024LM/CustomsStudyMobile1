import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  closeNativePdf,
  nativePdfReaderAvailable,
  openNativePdf,
  renderNativePdfPage,
} from '../services/pdfReader';

interface PdfReaderProps {
  blob: Blob;
  title: string;
}

const PDFJS_VERSION = '4.10.38';
const PDFJS_MODULE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;

type WebPdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<void>; cancel?: () => void };
  }>;
  destroy?: () => Promise<void>;
};

async function loadWebPdf(blob: Blob): Promise<WebPdfDocument> {
  const pdfjs: any = await import(/* @vite-ignore */ PDFJS_MODULE);
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  return await task.promise as WebPdfDocument;
}

async function renderWebPdfPage(
  pdfDocument: WebPdfDocument,
  pageNumber: number,
  zoom: number
): Promise<string> {
  const pdfPage = await pdfDocument.getPage(pageNumber);
  const viewport = pdfPage.getViewport({ scale: Math.max(0.8, Math.min(3, 1.45 * zoom)) });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('تعذر تجهيز لوحة عرض PDF.');

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png', 0.96);
}

export const PdfReader: React.FC<PdfReaderProps> = ({ blob, title }) => {
  const native = useMemo(() => nativePdfReaderAvailable(), []);
  const webDocumentRef = useRef<WebPdfDocument | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderToken = useRef(0);
  const renderingPages = useRef<Set<number>>(new Set());
  const loadedPages = useRef<Set<number>>(new Set());

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    setPage(1);
    setPages(0);
    setZoom(1);
    setPageImages({});
    setError('');
    setLoading(true);
    renderingPages.current.clear();
    loadedPages.current.clear();

    const open = async () => {
      try {
        if (native) {
          const count = await openNativePdf(blob);
          if (!count) throw new Error('PDF لا يحتوي على صفحات قابلة للعرض.');
          if (active) setPages(count);
          return;
        }

        const doc = await loadWebPdf(blob);
        if (!active) {
          await doc.destroy?.();
          return;
        }
        webDocumentRef.current = doc;
        if (!doc.numPages) throw new Error('PDF لا يحتوي على صفحات قابلة للعرض.');
        setPages(doc.numPages);
      } catch (err: any) {
        if (active) {
          const message = String(err?.message || '');
          setError(
            message.includes('Failed to fetch dynamically imported module')
              ? 'تعذر تحميل محرك PDF للويب. تحقق من الاتصال ثم أعد المحاولة.'
              : (message || 'تعذر فتح ملف PDF.')
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void open();

    return () => {
      active = false;
      renderToken.current += 1;
      renderingPages.current.clear();
      if (native) {
        void closeNativePdf();
      } else {
        const doc = webDocumentRef.current;
        webDocumentRef.current = null;
        void doc?.destroy?.();
      }
    };
  }, [blob, native]);

  const renderPage = async (pageNumber: number, token: number) => {
    if (
      pageNumber < 1 ||
      pageNumber > pages ||
      loadedPages.current.has(pageNumber) ||
      renderingPages.current.has(pageNumber)
    ) return;

    renderingPages.current.add(pageNumber);
    try {
      let url: string;
      if (native) {
        const width = Math.round(960 * zoom);
        url = await renderNativePdfPage(pageNumber - 1, width);
      } else {
        const doc = webDocumentRef.current;
        if (!doc) return;
        url = await renderWebPdfPage(doc, pageNumber, zoom);
      }
      if (renderToken.current !== token) return;
      loadedPages.current.add(pageNumber);
      setPageImages((current) => current[pageNumber] ? current : { ...current, [pageNumber]: url });
    } catch (err: any) {
      if (renderToken.current === token) {
        setError(err?.message || 'تعذر عرض إحدى صفحات PDF.');
      }
    } finally {
      renderingPages.current.delete(pageNumber);
    }
  };

  useEffect(() => {
    if (!pages || loading || error) return;
    const token = ++renderToken.current;
    setPageImages({});
    renderingPages.current.clear();
    loadedPages.current.clear();

    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible: Array<{ page: number; ratio: number }> = [];

        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pdfPage || 0);
          if (!pageNumber) continue;

          if (entry.isIntersecting) {
            visible.push({ page: pageNumber, ratio: entry.intersectionRatio });
            void renderPage(pageNumber, token);
            void renderPage(pageNumber - 1, token);
            void renderPage(pageNumber + 1, token);
          }
        }

        if (visible.length) {
          visible.sort((a, b) => b.ratio - a.ratio || a.page - b.page);
          setPage(visible[0].page);
        }
      },
      {
        root,
        rootMargin: '900px 0px',
        threshold: [0.05, 0.25, 0.5, 0.75],
      }
    );

    pageRefs.current.forEach((element) => observer.observe(element));
    void renderPage(1, token);
    void renderPage(2, token);

    return () => observer.disconnect();
  }, [pages, loading, error, native, zoom]);

  const goPage = (next: number) => {
    if (!pages) return;
    const target = Math.min(Math.max(1, Math.floor(next)), pages);
    const element = pageRefs.current.get(target);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPage(target);
    }
  };

  const setSafeZoom = (value: number) => {
    setZoom(Math.min(2.25, Math.max(0.7, Math.round(value * 100) / 100)));
  };

  const shellClass = fullscreen
    ? 'fixed inset-0 z-[100] bg-[#EEF0F5] flex flex-col'
    : 'rounded-[18px] overflow-hidden border border-gray-100 bg-[#EEF0F5] min-h-[72vh] flex flex-col';

  return (
    <div className={shellClass} dir="rtl">
      <div className="z-20 bg-white border-b border-gray-100 px-2.5 py-2 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-[150px]">
          <div className="text-[11px] font-bold text-[#2C2145] truncate">{title}</div>
          <div className="text-[10px] text-gray-400">
            {pages ? `الصفحة ${page} من ${pages}` : 'قارئ PDF'}
          </div>
        </div>

        {pages > 0 && (
          <div className="flex items-center gap-1 order-3 w-full sm:order-none sm:w-auto">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="w-9 h-9 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center disabled:opacity-35"
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="h-9 min-w-[76px] px-2 rounded-[11px] bg-[#F8F9FD] flex items-center justify-center gap-1 text-[11px] font-bold text-[#44385E]">
              <input
                value={page}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) goPage(value);
                }}
                inputMode="numeric"
                className="w-8 bg-transparent text-center outline-none"
                aria-label="رقم الصفحة"
              />
              <span className="text-gray-400">/ {pages}</span>
            </div>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= pages}
              className="w-9 h-9 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center disabled:opacity-35"
              aria-label="الصفحة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 ms-auto">
          <button
            onClick={() => setSafeZoom(zoom - 0.15)}
            disabled={zoom <= 0.7 || !pages}
            className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-600 flex items-center justify-center disabled:opacity-35"
            aria-label="تصغير"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSafeZoom(1)}
            disabled={!pages}
            className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-600 flex items-center justify-center disabled:opacity-35"
            aria-label="إعادة التكبير"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSafeZoom(zoom + 0.15)}
            disabled={zoom >= 2.25 || !pages}
            className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-600 flex items-center justify-center disabled:opacity-35"
            aria-label="تكبير"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFullscreen((value) => !value)}
            className="w-9 h-9 rounded-[11px] bg-[#5B3FD6] text-white flex items-center justify-center"
            aria-label={fullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-auto overscroll-contain p-2 sm:p-3 scroll-smooth">
        {loading && (
          <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">
            جاري تجهيز PDF...
          </div>
        )}

        {error && (
          <div className="min-h-[50vh] flex items-center justify-center px-6 text-center text-sm text-[#C62828]">
            {error}
          </div>
        )}

        {!loading && !error && pages > 0 && (
          <div
            className="flex flex-col items-center gap-3 pb-6"
            style={{ minWidth: zoom > 1 ? `${Math.round(100 * zoom)}%` : '100%' }}
          >
            {Array.from({ length: pages }, (_, index) => {
              const pageNumber = index + 1;
              const imageUrl = pageImages[pageNumber];

              return (
                <div
                  key={pageNumber}
                  ref={(element) => {
                    if (element) pageRefs.current.set(pageNumber, element);
                    else pageRefs.current.delete(pageNumber);
                  }}
                  data-pdf-page={pageNumber}
                  className="w-full flex justify-center scroll-mt-3"
                >
                  <div
                    className="relative bg-white shadow-sm rounded-[5px] overflow-hidden"
                    style={{
                      width: `${Math.max(70, Math.round(100 * zoom))}%`,
                      maxWidth: zoom <= 1 ? '980px' : 'none',
                      minHeight: imageUrl ? undefined : `${Math.round(620 * zoom)}px`,
                    }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`${title} - الصفحة ${pageNumber}`}
                        draggable={false}
                        className="block w-full h-auto select-none"
                      />
                    ) : (
                      <div className="min-h-[620px] flex flex-col items-center justify-center gap-2 text-xs text-gray-400 bg-white">
                        <span>جاري تحميل الصفحة {pageNumber}...</span>
                      </div>
                    )}
                    <div className="absolute bottom-2 start-2 rounded-full bg-black/55 text-white px-2 py-0.5 text-[9px]">
                      {pageNumber}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="bg-white/95 border-t border-gray-100 px-3 py-2 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={pages}
            value={page}
            onChange={(event) => goPage(Number(event.target.value))}
            className="flex-1 accent-[#5B3FD6]"
            aria-label="التنقل بين صفحات PDF"
          />
          <span className="text-[10px] font-bold text-gray-500 min-w-[48px] text-center">{page}/{pages}</span>
        </div>
      )}
    </div>
  );
};
