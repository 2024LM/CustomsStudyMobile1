import React, { useEffect, useState, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Library,
  Trash2,
  Plus,
  HelpCircle,
  CheckCircle,
  Download,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { db } from '../services/db';
import { ExcelPreview } from '../types';
import { parseExcelFile } from '../services/excelImporter';
import { ScreenHeader } from '../components/ScreenHeader';
import { showInterstitial } from '../services/ads';
import { fetchRemoteBanks, RemoteBankItem } from '../services/remoteBanks';

interface BanksPageProps {
  onBankSelected: () => void;
}

export const BanksPage: React.FC<BanksPageProps> = ({ onBankSelected }) => {
  const [activeId, setActiveId] = useState(() => db.activeBankId());
  const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [bankName, setBankName] = useState('');
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [remoteBanks, setRemoteBanks] = useState<RemoteBankItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState('');
  const [downloadingBankId, setDownloadingBankId] = useState<string | null>(null);

  const loadRemoteBanks = async (force = false) => {
    setRemoteLoading(true); setRemoteError('');
    try { setRemoteBanks((await fetchRemoteBanks(force)).items); }
    catch { setRemoteError('تعذر تحميل قائمة البنوك المتاحة للتنزيل.'); }
    finally { setRemoteLoading(false); }
  };

  useEffect(() => { void loadRemoteBanks(); }, []);

  const downloadRemoteBank = async (bank: RemoteBankItem) => {
    if (downloadingBankId) return;
    setDownloadingBankId(bank.id);
    setPreview(null);
    setStatus('جارٍ تحميل البنك وفحصه…');
    try {
      await showInterstitial();
      const res = await fetch(bank.downloadUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`تعذر تنزيل الملف (HTTP ${res.status})`);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const blob = await res.blob();
      if (blob.size > 5 * 1024 * 1024) throw new Error('حجم البنك يتجاوز 5 MB');
      if (blob.size === 0) throw new Error('ملف البنك فارغ');
      if (contentType.includes('text/html')) throw new Error('الرابط لا يشير إلى ملف XLSX مباشر');
      const file = new File([blob], `${bank.name.slice(0, 60) || bank.id}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const parsed = await parseExcelFile(file);
      setPreview(parsed);
      setBankName(bank.name.slice(0, 80));
      setStatus(parsed.valid ? 'تم تنزيل البنك وفحصه. راجع البيانات ثم أكد الاستيراد.' : 'تم تنزيل الملف لكنه لم يجتز فحص صيغة البنك.');
    } catch (e: any) {
      setStatus(e?.message || 'تعذر تحميل البنك أو فحصه');
    } finally {
      setDownloadingBankId(null);
    }
  };

  const banks = db.banks();

  const handleImportClick = async () => {
    if (importing) return;
    await showInterstitial();
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    setPreview(null);
    setStatus('جارٍ فحص الملف…');
    try {
      const parsed = await parseExcelFile(file);
      setPreview(parsed);
      const defaultName = file.name.replace(/\.[^/.]+$/, '').slice(0, 80) || 'بنك أسئلة';
      setBankName(defaultName);
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'تعذر فحص الملف');
    } finally {
      setImporting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleConfirmImport = () => {
    if (!preview || !preview.valid || bankName.trim().length < 2) return;
    try {
      const id = db.importQuestionBank(
        bankName,
        'بنك مستورد من Excel',
        preview
      );
      db.setActiveBank(id);
      setActiveId(id);
      setPreview(null);
      setBankName('');
      setRefresh((r) => r + 1);
      setStatus('تم استيراد البنك وتفعيله بنجاح');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setStatus(e?.message || 'تعذر استيراد البنك');
    }
  };

  const handleSelectBank = (id: string) => {
    db.setActiveBank(id);
    setActiveId(id);
    onBankSelected();
  };

  const handleDeleteBank = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('هل أنت متأكد من رغبتك في إزالة هذا البنك؟')) {
      db.deleteUserBank(id);
      setActiveId(db.activeBankId());
      setRefresh((r) => r + 1);
      setStatus('تمت إزالة البنك مع الاحتفاظ بسجل المراجعة');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader
        title="بنوك الأسئلة"
        subtitle="اختر المحتوى الذي تريد المراجعة منه"
      />

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Import Button / Card */}
      <div
        onClick={() => void handleImportClick()}
        className={`w-full bg-[#F5F3FF] rounded-[22px] p-4.5 border border-[#D9D0FA] flex items-center justify-between gap-3 cursor-pointer transition-all hover:bg-[#EFEAFF] active:scale-98 ${
          importing ? 'opacity-60 cursor-wait' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[14px] bg-white flex items-center justify-center text-[#5B3FD6] shadow-xs">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#2C2145]">
              {importing ? 'جارٍ فحص الملف…' : 'استيراد بنك جديد'}
            </span>
            <span className="text-xs text-gray-500">ملف Excel بصيغة XLSX</span>
          </div>
        </div>
        <Plus className="w-5 h-5 text-[#5B3FD6]" />
      </div>

      {/* Accepted Excel format guide */}
      <div className="bg-white rounded-[18px] p-4 border border-gray-100 shadow-xs flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4.5 h-4.5 text-[#5B3FD6] shrink-0" />
          <span className="font-bold text-sm text-[#2C2145]">كيف تُجهّز ملف Excel مقبولًا؟</span>
        </div>
        <p className="text-xs text-gray-600 leading-5">
          استخدم ملف <span className="font-bold" dir="ltr">XLSX</span> بحجم لا يتجاوز 5 MB، وضع البيانات في أول ورقة. يجب أن يكون الصف الأول بالعناوين التالية وبنفس الترتيب:
        </p>
        <div className="bg-[#F8F9FD] rounded-[13px] p-3 text-[11px] text-[#4B4560] leading-6 overflow-x-auto" dir="rtl">
          <span className="whitespace-nowrap">ID ← السؤال ← الجواب الصحيح ← خيار خاطئ 1 ← خيار خاطئ 2 ← خيار خاطئ 3 ← الشرح ← المحور</span>
        </div>
        <div className="text-[11px] text-gray-500 leading-5">
          <p>• الحقول من <b>ID</b> إلى <b>خيار خاطئ 3</b> إلزامية، بينما الشرح والمحور اختياريان.</p>
          <p>• يجب أن يكون ID فريدًا لكل سؤال، وأن تكون الإجابة الصحيحة والخيارات الخاطئة الثلاثة مختلفة.</p>
          <p>• الحد الأقصى 5000 سؤال، ولا تُقبل الصيغ داخل الخلايا.</p>
        </div>
      </div>

      {/* Preview Card */}
      {preview && (
        <div className="bg-white rounded-[20px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {preview.valid ? (
              <CheckCircle2 className="w-5 h-5 text-[#16864B]" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#C62828]" />
            )}
            <span className="font-bold text-sm text-[#2C2145]">
              {preview.valid ? 'الملف جاهز للاستيراد' : 'يحتاج الملف إلى تصحيح'}
            </span>
          </div>

          <p className="text-xs text-gray-600 font-medium">
            {preview.rows.length} سؤال صالح
          </p>

          {preview.errors.length > 0 && (
            <div className="flex flex-col gap-1 p-3 bg-[#FFEEED] rounded-[12px] text-xs text-[#C62828]">
              {preview.errors.slice(0, 4).map((err, i) => (
                <span key={i}>• {err}</span>
              ))}
              {preview.errors.length > 4 && (
                <span className="font-bold">... و {preview.errors.length - 4} أخطاء أخرى</span>
              )}
            </div>
          )}

          {preview.valid && (
            <div className="flex flex-col gap-2.5 pt-1">
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value.slice(0, 80))}
                placeholder="اسم البنك..."
                className="w-full bg-[#F8F9FD] rounded-[14px] py-2.5 px-3 border border-gray-200 text-sm focus:border-[#5B3FD6] focus:outline-hidden"
              />
              <button
                onClick={handleConfirmImport}
                disabled={bankName.trim().length < 2}
                className="w-full py-3 rounded-[14px] bg-[#5B3FD6] text-white text-sm font-bold hover:bg-[#4C33B8] transition-colors disabled:opacity-50"
              >
                تأكيد الاستيراد
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status message */}
      {status && (
        <div className="bg-[#F5F3FF] text-[#5B3FD6] rounded-[14px] p-3 text-xs font-semibold">
          {status}
        </div>
      )}

      {/* Downloadable Banks Catalog */}
      <div data-tour="banks-download" className="flex items-center justify-between mt-1">
        <h3 className="font-bold text-base text-[#2C2145]">بنوك متاحة للتحميل</h3>
        <button onClick={() => void loadRemoteBanks(true)} disabled={remoteLoading} className="w-9 h-9 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${remoteLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {remoteError && <div className="flex items-center gap-2 bg-red-50 text-[#C62828] rounded-[14px] p-3 text-xs"><WifiOff className="w-4 h-4" />{remoteError}</div>}
      {!remoteLoading && !remoteError && remoteBanks.length === 0 && <div className="bg-[#F8F9FD] rounded-[14px] p-3 text-xs text-gray-500">لا توجد بنوك منشورة حاليًا.</div>}
      <div className="flex flex-col gap-2.5">
        {remoteBanks.map((bank) => (
          <div key={bank.id} className="bg-white rounded-[19px] p-4 border border-gray-100 shadow-xs flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="font-bold text-sm text-[#2C2145]">{bank.name}</span>{bank.version && <span className="text-[10px] text-gray-400">v{bank.version}</span>}</div>
              {bank.description && <p className="text-xs text-gray-500 mt-1 leading-5">{bank.description}</p>}
            </div>
            <button
              onClick={() => void downloadRemoteBank(bank)}
              disabled={downloadingBankId !== null}
              className="shrink-0 flex items-center gap-1.5 bg-[#5B3FD6] text-white px-3 py-2 rounded-[11px] text-xs font-bold disabled:opacity-50"
            >
              {downloadingBankId === bank.id
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              <span>{downloadingBankId === bank.id ? 'جارٍ التحميل' : 'تحميل'}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Available Banks List */}
      <h3 data-tour="banks-list" className="font-bold text-base text-[#2C2145] mt-1">البنوك المتاحة</h3>
      <div className="flex flex-col gap-2.5">
        {banks.map((bank) => {
          const isChosen = activeId === bank.id;
          const qCount = db.questionCount(bank.id);
          const readyCount = db.qcmReadyCount(bank.id);

          return (
            <div
              key={bank.id}
              onClick={() => handleSelectBank(bank.id)}
              className={`rounded-[20px] p-4.5 border transition-all cursor-pointer flex flex-col gap-3 shadow-xs ${
                isChosen
                  ? 'bg-[#F5F3FF] border-[#5B3FD6]'
                  : 'bg-white border-[#E8E4EF] hover:border-[#5B3FD6]/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-[13px] flex items-center justify-center shrink-0 ${
                      isChosen ? 'bg-white text-[#5B3FD6]' : 'bg-[#F5F3FF] text-[#5B3FD6]'
                    }`}
                  >
                    <Library className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-[#2C2145]">
                      {bank.name}
                    </span>
                    {bank.description && (
                      <span className="text-xs text-gray-500">
                        {bank.description}
                      </span>
                    )}
                  </div>
                </div>

                {isChosen && <CheckCircle className="w-5 h-5 text-[#5B3FD6] shrink-0" />}
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] bg-white border border-gray-200/80 px-2.5 py-1 rounded-full text-gray-700">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                  {qCount} سؤال
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] bg-white border border-gray-200/80 px-2.5 py-1 rounded-full text-gray-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16864B]" />
                  {readyCount} جاهز
                </span>
              </div>

              {!bank.builtIn && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={(e) => handleDeleteBank(bank.id, e)}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold p-1 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>إزالة البنك</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
