import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
} from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import {
  aiEnabled,
  aiVerified,
  deleteGeminiKey,
  GEMINI_MODELS,
  GeminiModel,
  geminiModel,
  getGeminiKey,
  saveGeminiKey,
  setAiEnabled,
  setGeminiModel,
  verifyGeminiConnection,
} from '../services/geminiAi';

export const AiSettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [enabled, setEnabled] = useState(aiEnabled());
  const [verified, setVerified] = useState(aiVerified());
  const [model, setModel] = useState<GeminiModel>(geminiModel());
  const [draftKey, setDraftKey] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void getGeminiKey().then((value) => setHasStoredKey(Boolean(value)));
  }, []);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    setAiEnabled(next);
    setStatus(next
      ? (verified ? 'أدوات الذكاء الاصطناعي مفعّلة.' : 'فعّلت الميزة. اختبر الاتصال حتى تظهر أدوات AI داخل التطبيق.')
      : 'تم إخفاء أدوات الذكاء الاصطناعي من التطبيق.');
  };

  const saveKey = async () => {
    if (!draftKey.trim()) {
      setStatus('أدخل مفتاح Gemini API جديدًا أولًا.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      await saveGeminiKey(draftKey);
      setDraftKey('');
      setHasStoredKey(true);
      setVerified(false);
      setStatus('تم حفظ المفتاح. اضغط «اختبار الاتصال» للتحقق منه.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ المفتاح.');
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setStatus('جارٍ اختبار الاتصال بـ Gemini…');
    try {
      await verifyGeminiConnection();
      setVerified(true);
      setStatus('تم الاتصال بـ Gemini بنجاح. أدوات AI جاهزة للاستخدام.');
    } catch (error: any) {
      setVerified(false);
      setStatus(error?.message || 'فشل اختبار الاتصال.');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (!window.confirm('حذف مفتاح Gemini وإيقاف أدوات الذكاء الاصطناعي؟')) return;
    setBusy(true);
    try {
      await deleteGeminiKey();
      setDraftKey('');
      setHasStoredKey(false);
      setEnabled(false);
      setVerified(false);
      setStatus('تم حذف المفتاح وإيقاف الذكاء الاصطناعي.');
    } finally {
      setBusy(false);
    }
  };

  const changeModel = (value: GeminiModel) => {
    setModel(value);
    setGeminiModel(value);
    setVerified(false);
    setStatus('تم تغيير النموذج. أعد اختبار الاتصال قبل استخدام أدوات AI.');
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader
        title="إعدادات الذكاء الاصطناعي"
        subtitle="استخدم مفتاح Gemini الخاص بك وتحكم بظهور أدوات AI"
        onBack={onBack}
      />

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs">
        <button onClick={toggleEnabled} className="w-full flex items-center justify-between gap-3 text-right">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[14px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-[#2C2145]">تفعيل الذكاء الاصطناعي</div>
              <div className="text-[11px] text-gray-400 mt-1">
                الأدوات لا تظهر إلا بعد التفعيل ونجاح اختبار API
              </div>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${enabled ? 'bg-[#5B3FD6]' : 'bg-gray-300'}`}>
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${enabled ? '-translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Gemini API Key</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {hasStoredKey ? 'يوجد مفتاح محفوظ على هذا الجهاز' : 'لم يتم حفظ مفتاح بعد'}
            </p>
          </div>
        </div>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder={hasStoredKey ? 'أدخل مفتاحًا جديدًا لاستبدال المحفوظ' : 'ألصق Gemini API Key هنا'}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-[14px] bg-[#F8F9FD] border border-gray-200 px-3 py-3 pl-11 text-sm outline-none focus:border-[#5B3FD6] font-mono"
          />
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-label={showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
          >
            {showKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        </div>

        <button
          onClick={() => void saveKey()}
          disabled={busy || !draftKey.trim()}
          className="h-11 rounded-[13px] bg-[#5B3FD6] text-white text-xs font-bold disabled:opacity-40"
        >
          حفظ المفتاح
        </button>

        <div className="rounded-[13px] bg-[#F8F9FD] p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#16864B] shrink-0 mt-0.5" />
          <p className="text-[10px] leading-5 text-gray-500">
            في Android يُشفّر المفتاح باستخدام Android Keystore. في نسخة الويب يبقى التخزين محليًا في المتصفح، لذلك يفضّل استخدام APK عند حفظ مفتاح دائم.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
        <div>
          <h3 className="font-bold text-sm">النموذج</h3>
          <p className="text-[11px] text-gray-400 mt-1">يمكن تغييره لاحقًا وإعادة اختبار الاتصال</p>
        </div>

        {GEMINI_MODELS.map((item) => (
          <button
            key={item.id}
            onClick={() => changeModel(item.id)}
            className={`w-full rounded-[14px] border p-3 text-right transition-all ${
              model === item.id
                ? 'bg-[#F5F3FF] border-[#5B3FD6]'
                : 'bg-white border-gray-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-xs text-[#2C2145]">{item.label}</span>
              {model === item.id && <CheckCircle2 className="w-4 h-4 text-[#5B3FD6]" />}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{item.description}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm">حالة الاتصال</h3>
            <p className={`text-[11px] mt-1 font-semibold ${verified ? 'text-emerald-600' : 'text-amber-600'}`}>
              {verified ? 'تم التحقق من المفتاح ✓' : 'غير متحقق'}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {busy ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Wifi className="w-5 h-5" />}
          </div>
        </div>

        <button
          onClick={() => void testConnection()}
          disabled={busy || !hasStoredKey}
          className="h-12 rounded-[14px] bg-[#2C2145] text-white font-bold text-sm disabled:opacity-40"
        >
          اختبار الاتصال
        </button>

        {status && (
          <div className="rounded-[12px] bg-[#F8F9FD] px-3 py-2.5 text-[11px] leading-5 text-gray-600">
            {status}
          </div>
        )}
      </div>

      {hasStoredKey && (
        <button
          onClick={() => void removeKey()}
          disabled={busy}
          className="h-12 rounded-[14px] border border-red-100 bg-red-50 text-red-600 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
          حذف المفتاح وإيقاف AI
        </button>
      )}
    </div>
  );
};
