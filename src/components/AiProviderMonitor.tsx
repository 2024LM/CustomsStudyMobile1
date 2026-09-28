import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock3,
  Download,
  RefreshCcw,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  AiProviderLogEntry,
  aiProviderLogs,
  clearAiProviderLogs,
  downloadAiProviderLogJson,
  subscribeAiProviderLogs,
} from '../services/aiProviderDiagnostics';

type Filter = 'all' | 'success' | 'error';

function statusLabel(entry: AiProviderLogEntry): string {
  if (entry.status === 'success') return 'نجح';
  if (entry.status === 'retry') return 'إعادة محاولة';
  if (entry.status === 'error') return 'فشل';
  return 'معلومة';
}

function statusClass(entry: AiProviderLogEntry): string {
  if (entry.status === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (entry.status === 'retry') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (entry.status === 'error') return 'bg-red-50 text-red-700 border-red-100';
  return 'bg-gray-50 text-gray-600 border-gray-100';
}

function formatTime(value: number): string {
  try {
    return new Date(value).toLocaleTimeString('ar-MA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export const AiProviderMonitor: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [logs, setLogs] = useState<AiProviderLogEntry[]>(() => aiProviderLogs());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => setLogs(aiProviderLogs());

  useEffect(() => subscribeAiProviderLogs(refresh), []);

  const filtered = useMemo(() => {
    if (filter === 'success') return logs.filter((entry) => entry.status === 'success');
    if (filter === 'error') return logs.filter((entry) => entry.status === 'error' || entry.status === 'retry');
    return logs;
  }, [logs, filter]);

  const errors = logs.filter((entry) => entry.status === 'error').length;
  const retries = logs.filter((entry) => entry.status === 'retry').length;

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full p-4 flex items-center justify-between gap-3 text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[#2C2145]">مراقبة مزود AI</div>
            <div className="text-[10px] text-gray-400 mt-1">
              {logs.length} سجل • {errors} أخطاء • {retries} انتقالات/إعادات
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', 'الكل'],
              ['success', 'ناجح'],
              ['error', 'أخطاء'],
            ] as Array<[Filter, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`h-8 px-3 rounded-[10px] text-[10px] font-bold border ${filter === id ? 'bg-[#5B3FD6] border-[#5B3FD6] text-white' : 'bg-white border-gray-200 text-gray-500'}`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => downloadAiProviderLogJson()}
              disabled={logs.length === 0}
              className="h-8 px-3 rounded-[10px] bg-[#F5F3FF] text-[#5B3FD6] text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-40"
              aria-label="تحميل سجل JSON"
              title="تحميل سجل JSON"
            >
              <Download className="w-3.5 h-3.5" />
              تحميل JSON
            </button>
            <button
              type="button"
              onClick={refresh}
              className="w-8 h-8 rounded-[10px] border border-gray-200 text-gray-500 flex items-center justify-center"
              aria-label="تحديث السجل"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!logs.length || window.confirm('مسح سجل مراقبة مزود AI؟')) {
                  clearAiProviderLogs();
                  setExpandedId(null);
                  refresh();
                }
              }}
              className="w-8 h-8 rounded-[10px] bg-red-50 text-red-600 flex items-center justify-center"
              aria-label="مسح السجل"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-[12px] bg-[#F8F9FD] px-3 py-2 text-[9px] leading-4 text-gray-500">
            لا يتم حفظ قيم API Keys أو Base64 للصور والملفات. السجل يحتفظ بملخصات آمنة وآخر 100 محاولة فقط.
          </div>

          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-gray-400">
              لا توجد استعلامات مسجلة ضمن هذا الفلتر.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
              {filtered.map((entry) => {
                const expanded = expandedId === entry.id;
                return (
                  <div key={entry.id} className="rounded-[14px] border border-gray-100 bg-[#FCFCFE] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      className="w-full p-3 text-right"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-[10px] border flex items-center justify-center shrink-0 ${statusClass(entry)}`}>
                          {entry.status === 'success'
                            ? <CheckCircle2 className="w-4 h-4" />
                            : entry.status === 'error'
                              ? <AlertTriangle className="w-4 h-4" />
                              : <CircleDot className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-black text-[#2C2145]">{entry.operation}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-[8px] font-bold ${statusClass(entry)}`}>
                              {statusLabel(entry)}
                            </span>
                            {entry.httpStatus !== undefined && (
                              <span className="text-[9px] font-mono text-gray-500">
                                HTTP {entry.httpStatus}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[9px] text-gray-400">
                            <span>{entry.provider === 'gemini-nano' ? 'Nano' : 'Gemini API'}</span>
                            {entry.model && <span>{entry.model}</span>}
                            {entry.keyNumber && <span>مفتاح {entry.keyNumber}</span>}
                            {entry.attempt && <span>محاولة {entry.attempt}</span>}
                            {entry.durationMs !== undefined && <span>{entry.durationMs}ms</span>}
                            <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{formatTime(entry.at)}</span>
                          </div>
                        </div>

                        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-100 p-3 flex flex-col gap-2">
                        {entry.requestSummary && (
                          <div>
                            <div className="text-[9px] font-black text-gray-500 mb-1">الطلب</div>
                            <div className="rounded-[10px] bg-white border border-gray-100 p-2.5 text-[9px] leading-5 whitespace-pre-wrap break-words text-gray-600">
                              {entry.requestSummary}
                            </div>
                          </div>
                        )}
                        {entry.responseSummary && (
                          <div>
                            <div className="text-[9px] font-black text-gray-500 mb-1">الاستجابة</div>
                            <div className="rounded-[10px] bg-white border border-gray-100 p-2.5 text-[9px] leading-5 whitespace-pre-wrap break-words text-gray-600">
                              {entry.responseSummary}
                            </div>
                          </div>
                        )}
                        {entry.error && (
                          <div>
                            <div className="text-[9px] font-black text-red-600 mb-1">الخطأ</div>
                            <div className="rounded-[10px] bg-red-50 border border-red-100 p-2.5 text-[9px] leading-5 whitespace-pre-wrap break-words text-red-700">
                              {entry.error}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
