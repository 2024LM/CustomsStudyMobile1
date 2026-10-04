import React, { useEffect, useState } from 'react';
import { Database, FileText, HardDrive, Trash2 } from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import { db } from '../services/db';
import {
import { FloatingNotice } from '../components/FloatingNotice';
  deleteLocalReference,
  listLocalReferences,
  LocalReference,
  localReferenceStorageSummary,
} from '../services/localReferences';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const DownloadsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [items, setItems] = useState<LocalReference[]>([]);
  const [summary, setSummary] = useState({
    totalBytes: 0,
    uploadedBytes: 0,
    downloadedBytes: 0,
    uploadedCount: 0,
    downloadedCount: 0,
  });
  const [status, setStatus] = useState('');

  const reload = async () => {
    try {
      const domainId = db.activeDomainId();
      const [refs, storage] = await Promise.all([
        listLocalReferences(domainId),
        localReferenceStorageSummary(domainId),
      ]);
      setItems(refs);
      setSummary(storage);
    } catch {
      setStatus('تعذر قراءة الملفات المحلية.');
    }
  };

  useEffect(() => { void reload(); }, []);

  const downloaded = items.filter((item) => item.source === 'download');
  const uploaded = items.filter((item) => item.source === 'upload');
  const importedBanks = db.banks().filter((bank) => !bank.builtIn);

  const removeReference = async (item: LocalReference) => {
    if (!window.confirm(`حذف "${item.name}" من الجهاز؟`)) return;
    await deleteLocalReference(item.id);
    setStatus('تم حذف الملف المحلي.');
    await reload();
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader title="إدارة التنزيلات" subtitle="الملفات والبنوك المخزنة على الجهاز" onBack={onBack} />

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-[18px] p-4 border border-gray-100">
          <HardDrive className="w-5 h-5 text-[#5B3FD6] mb-2" />
          <div className="text-xs text-gray-400">المراجع Offline</div>
          <div className="text-xl font-bold">{summary.downloadedCount}</div>
          <div className="text-[11px] text-gray-400">{formatBytes(summary.downloadedBytes)}</div>
        </div>
        <div className="bg-white rounded-[18px] p-4 border border-gray-100">
          <FileText className="w-5 h-5 text-[#5B3FD6] mb-2" />
          <div className="text-xs text-gray-400">ملفاتك الخاصة</div>
          <div className="text-xl font-bold">{summary.uploadedCount}</div>
          <div className="text-[11px] text-gray-400">{formatBytes(summary.uploadedBytes)}</div>
        </div>
      </div>

      <div className="bg-white rounded-[18px] p-4 border border-gray-100 flex items-center justify-between">
        <span className="font-bold text-sm">إجمالي ملفات المراجع</span>
        <span className="font-bold text-[#5B3FD6]">{formatBytes(summary.totalBytes)}</span>
      </div>

      <FloatingNotice message={status} onDismiss={() => setStatus('')} />

      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-sm">المراجع المنزلة للعمل بدون إنترنت</h3>
        {downloaded.length === 0 ? (
          <div className="bg-white rounded-[16px] p-4 border border-gray-100 text-xs text-gray-400 text-center">لا توجد مراجع منزلة.</div>
        ) : downloaded.map((item) => (
          <div key={item.id} className="bg-white rounded-[16px] p-3 border border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-xs truncate">{item.name}</div>
              <div className="text-[10px] text-gray-400 mt-1">{item.type.toUpperCase()} • {formatBytes(item.size)}</div>
            </div>
            <button onClick={() => void removeReference(item)} className="w-9 h-9 rounded-[11px] bg-red-50 text-red-500 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-sm">الملفات التي رفعتها أنت</h3>
        {uploaded.length === 0 ? (
          <div className="bg-white rounded-[16px] p-4 border border-gray-100 text-xs text-gray-400 text-center">لا توجد ملفات خاصة.</div>
        ) : uploaded.map((item) => (
          <div key={item.id} className="bg-white rounded-[16px] p-3 border border-gray-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-xs truncate">{item.name}</div>
              <div className="text-[10px] text-gray-400 mt-1">{item.type.toUpperCase()} • {formatBytes(item.size)}</div>
            </div>
            <button onClick={() => void removeReference(item)} className="w-9 h-9 rounded-[11px] bg-red-50 text-red-500 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-sm">البنوك المستوردة</h3>
        {importedBanks.length === 0 ? (
          <div className="bg-white rounded-[16px] p-4 border border-gray-100 text-xs text-gray-400 text-center">لا توجد بنوك مستوردة.</div>
        ) : importedBanks.map((bank) => (
          <div key={bank.id} className="bg-white rounded-[16px] p-3 border border-gray-100 flex items-center gap-3">
            <Database className="w-5 h-5 text-[#5B3FD6]" />
            <div>
              <div className="font-bold text-xs">{bank.name}</div>
              <div className="text-[10px] text-gray-400 mt-1">{db.questionCount(bank.id)} سؤال • الإصدار {bank.version}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
