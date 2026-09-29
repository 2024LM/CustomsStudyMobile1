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

export const PdfReader: React.FC<PdfReaderProps> = ({ blob, title }) => {
  const native = useMemo(() => nativePdfReaderAvailable(), []);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [imageUrl, setImageUrl] = useState('');
  const [webUrl, setWebUrl] = useState('');
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

    if (!native) {
      const url = URL.createObjectURL(blob);
      setWebUrl(url);
      setLoading(false);
      return () => URL.revokeObjectURL(url);
    }

    void openNativePdf(blob)
      .then((count) => {
        if (!active) return;
        if (!count) throw new Error('PDF لا يحتوي على صفحات قابلة للعرض.');
        setPages(count);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'تعذر فتح ملف PDF.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      void closeNativePdf();
    };
  }, [blob, native]);

  useEffect(() => {
    if (!native || !pages || loading || error) return;
    const token = ++renderToken.current;
    setRendering(true);
    setError('');

    const width = Math.round(960 * zoom);
    void renderNativePdfPage(page - 1, width)
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
  }, [native, page, pages, zoom, loading, error]);

  const goPage = (next: number) => {
    if (!pages) return;
    setPage(Math.min(Math.max(1, next), pages));
  };

  const setSafeZoom = (value: number) => {
    setZoom(Math.min(2.25, Math.max(0.7, Math.round(value * 100) / 100)));
  };

  const shellClass = fullscreen
    ? 'fixed inset-0 z-[100] bg-[#EEF0F5] flex flex-col'
    : 'rounded-[18px] overflow-hidden border border-gray-100 bg-[#EEF0F5] min-h-[72vh] flex flex-col';

  const webSrc = webUrl
    ? `${webUrl}#page=${page}&zoom=${Math.round(zoom * 100)}`
    : '';

  return (
    <div className={shellClass} dir="rtl">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-2.5 py-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-[#2C2145] truncate">{title}</div>
          <div className="text-[10px] text-gray-400">
            {native ? (pages ? `الصفحة ${page} من ${pages}` : 'قارئ PDF') : 'قارئ PDF'}
          </div>
        </div>

        {native && pages > 0 && (
          <div className="flex items-center gap-1">
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

        <div className="flex items-center gap-1">
          <button
            onClick={() => setSafeZoom(zoom - 0.15)}
            disabled={zoom <= 0.7}
            className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-600 flex items-center justify-center disabled:opacity-35"
            aria-label="تصغير"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSafeZoom(1)}
            className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-600 flex items-center justify-center"
            aria-label="إعادة التكبير"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSafeZoom(zoom + 0.15)}
            disabled={zoom >= 2.25}
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

        {!loading && !error && native && (
          <div className="min-h-[60vh] flex justify-center items-start">
            {imageUrl ? (
              <div className="relative bg-white shadow-sm rounded-[8px] overflow-hidden max-w-none">
                <img
                  src={imageUrl}
                  alt={`${title} - الصفحة ${page}`}
                  draggable={false}
                  className="block max-w-none h-auto select-none"
                  style={{ width: `${Math.round(100 * zoom)}%`, minWidth: '100%' }}
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

        {!loading && !error && !native && webSrc && (
          <iframe
            key={webSrc}
            title={title}
            src={webSrc}
            className="w-full min-h-[72vh] border-0 rounded-[12px] bg-white"
          />
        )}
      </div>

      {native && pages > 1 && (
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
