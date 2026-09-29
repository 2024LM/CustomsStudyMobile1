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
  document: WebPdfDocument,
  pageNumber: number,
  zoom: number
): Promise<string> {
  const pdfPage = await document.getPage(pageNumber);
  const viewport = pdfPage.getViewport({ scale: Math.max(0.8, Math.min(3, 1.45 * zoom)) });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
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
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const renderToken = useRef(0);

  useEffect(() => {
    let active = true;
    setPage(1);
    setPages(0);
    setZoom(1);
    setImageUrl('');
    setError('');
    setLoading(true);

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
      if (native) {
        void closeNativePdf();
      } else {
        const doc = webDocumentRef.current;
        webDocumentRef.current = null;
        void doc?.destroy?.();
      }
    };
  }, [blob, native]);

  useEffect(() => {
    if (!pages || loading) return;
    const token = ++renderToken.current;
    setRendering(true);
    setError('');

    const render = async () => {
      if (native) {
        const width = Math.round(960 * zoom);
        return await renderNativePdfPage(page - 1, width);
      }

      const doc = webDocumentRef.current;
      if (!doc) throw new Error('محرك PDF غير جاهز.');
      return await renderWebPdfPage(doc, page, zoom);
    };

    void render()
      .then((url) => {
        if (renderToken.current === token) setImageUrl(url);
      })
      .catch((err: any) => {
        if (renderToken.current === token) {
          setError(err?.message || 'تعذر عرض صفحة PDF.');
        }
      })
      .finally(() => {
        if (renderToken.current === token) setRendering(false);
      });
  }, [native, page, pages, zoom, loading]);

  const goPage = (next: number) => {
    if (!pages) return;
    setPage(Math.min(Math.max(1, Math.floor(next)), pages));
  };

  const setSafeZoom = (value: number) => {
    setZoom(Math.min(2.25, Math.max(0.7, Math.round(value * 100) / 100)));
  };

  const shellClass = fullscreen
    ? 'fixed inset-0 z-[100] bg-[#EEF0F5] flex flex-col'
    : 'rounded-[18px] overflow-hidden border border-gray-100 bg-[#EEF0F5] min-h-[72vh] flex flex-col';

  return (
    <div className={shellClass} dir="rtl">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-2.5 py-2 flex flex-wrap items-center gap-2">
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
              disabled={page <= 1 || rendering}
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
              disabled={page >= pages || rendering}
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

      <div className="relative flex-1 overflow-auto overscroll-contain p-2 sm:p-3">
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

        {!loading && !error && (
          <div className="min-h-[60vh] flex justify-center items-start">
            {imageUrl ? (
              <div
                className="relative bg-white shadow-sm rounded-[8px] overflow-hidden shrink-0"
                style={{ width: native ? `${Math.round(100 * zoom)}%` : 'auto', minWidth: native ? '100%' : undefined }}
              >
                <img
                  src={imageUrl}
                  alt={`${title} - الصفحة ${page}`}
                  draggable={false}
                  className={native ? 'block w-full h-auto select-none' : 'block max-w-none h-auto select-none'}
                  style={!native ? { width: `${Math.max(100, Math.round(100 * zoom))}%`, maxWidth: 'none' } : undefined}
                />
                {rendering && (
                  <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center text-xs text-gray-500">
                    جاري تحسين الصفحة...
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-sm text-gray-400">جاري رسم الصفحة...</div>
            )}
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
