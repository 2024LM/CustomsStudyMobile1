import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Cpu,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
} from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import { AiProviderMonitor } from '../components/AiProviderMonitor';
import {
  aiEnabled,
  aiVerified,
  addVerifiedGeminiKey,
  deleteGeminiKeyById,
  GEMINI_MODELS,
  GeminiModel,
  geminiModel,
  findGeminiKeyNumber,
  GeminiKeyMeta,
  listGeminiKeys,
  cachedWebSearchCapability,
  refreshWebSearchCapability,
  WebSearchCapability,
  selectGeminiKey,
  setAiEnabled,
  setGeminiModel,
  verifyGeminiConnection,
} from '../services/geminiAi';

export const AiSettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [enabled, setEnabled] = useState(aiEnabled());
  const [verified, setVerified] = useState(aiVerified());
  const [model, setModel] = useState<GeminiModel>(geminiModel());
  const [draftKey, setDraftKey] = useState('');
  const [keys, setKeys] = useState<GeminiKeyMeta[]>([]);
  const [duplicateNumber, setDuplicateNumber] = useState<number | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [webCapability, setWebCapability] = useState<WebSearchCapability>(() => cachedWebSearchCapability());
  const [webChecking, setWebChecking] = useState(false);

  useEffect(() => {
    void listGeminiKeys().then(setKeys);
    setWebCapability(cachedWebSearchCapability());

  }, []);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    setAiEnabled(next);
    setStatus(next
      ? 'تم تفعيل الذكاء الاصطناعي. سيستخدم التطبيق Gemini API عبر الإنترنت.'
      : 'تم إخفاء أدوات الذكاء الاصطناعي من التطبيق.');
  };

  const saveKey = async () => {
    const clean = draftKey.trim();
    if (!clean) {
      setStatus('أدخل مفتاح Gemini API جديدًا أولًا.');
      return;
    }

    const duplicate = await findGeminiKeyNumber(clean);
    if (duplicate) {
      setDuplicateNumber(duplicate);
      setStatus(`هذا المفتاح محفوظ مسبقًا باسم «مفتاح ${duplicate}».`);
      return;
    }

    setBusy(true);
    setStatus('جارٍ اختبار المفتاح قبل حفظه…');
    try {
      const added = await addVerifiedGeminiKey(clean);
      setDraftKey('');
      setDuplicateNumber(null);
      setKeys(await listGeminiKeys());
      setVerified(true);
      setEnabled(true);
      setAiEnabled(true);
      setStatus(`نجح الاختبار وتم حفظه باسم «مفتاح ${added.number}».`);
    } catch (error: any) {
      setStatus(error?.message || 'فشل اختبار المفتاح، لذلك لم يتم حفظه.');
    } finally {
      setBusy(false);
    }
  };

  const handleDraftKeyChange = (value: string) => {
    setDraftKey(value);
    const clean = value.trim();
    if (!clean) {
      setDuplicateNumber(null);
      return;
    }
    void findGeminiKeyNumber(clean).then((number) => {
      setDuplicateNumber(number);
      if (number) setStatus(`هذا المفتاح محفوظ مسبقًا باسم «مفتاح ${number}».`);
      else if (status.includes('محفوظ مسبقًا')) setStatus('');
    });
  };


  const testConnection = async () => {
    setBusy(true);
    setStatus('جارٍ اختبار الاتصال بـ Gemini…');
    try {
      await verifyGeminiConnection();
      setKeys(await listGeminiKeys());
      setVerified(true);
      const active = (await listGeminiKeys()).find((key) => key.active);
      setStatus(active ? `تم الاتصال بنجاح باستخدام «مفتاح ${active.number}».` : 'تم الاتصال بـ Gemini بنجاح.');
    } catch (error: any) {
      setVerified(false);
      setStatus(error?.message || 'فشل اختبار الاتصال.');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async (id: string, number: number) => {
    if (!window.confirm(`حذف «مفتاح ${number}»؟`)) return;
    setBusy(true);
    try {
      await deleteGeminiKeyById(id);
      const next = await listGeminiKeys();
      setKeys(next);
      const hasVerified = next.some((key) => key.verifiedAt > 0);
      setVerified(hasVerified);
      if (!next.length) {
        setEnabled(false);
        setAiEnabled(false);
      }
      setStatus(next.length
        ? `تم حذف «مفتاح ${number}». سيتم استخدام مفتاح آخر تلقائيًا.`
        : 'تم حذف آخر مفتاح محفوظ وإيقاف AI السحابي.');
    } finally {
      setBusy(false);
    }
  };

  const makeActive = async (id: string, number: number) => {
    await selectGeminiKey(id);
    setKeys(await listGeminiKeys());
    setStatus(`أصبح «مفتاح ${number}» هو المفتاح النشط.`);
  };

  const changeModel = (value: GeminiModel) => {
    setModel(value);
    setGeminiModel(value);
    setVerified(false);
    setStatus('تم تغيير النموذج. أعد اختبار الاتصال قبل استخدام أدوات AI.');
  };

  const checkWebProvider = async () => {
    setWebChecking(true);
    setStatus('جارٍ فحص النماذج المتاحة وقدرة Google Search فعليًا…');
    try {
      const result = await refreshWebSearchCapability(true);
      setWebCapability(result);
      setStatus(
        result.status === 'ready'
          ? `Web Provider جاهز عبر ${result.model}.`
          : result.status === 'quota'
            ? 'Web Provider مدعوم لكن حصة Google Search الحالية ممتلئة.'
            : result.status === 'unsupported'
              ? 'لم يجد التطبيق نموذجًا متاحًا يدعم Google Search لهذا الحساب.'
              : (result.detail || 'تعذر فحص Web Provider.')
      );
    } catch (error: any) {
      setWebCapability(cachedWebSearchCapability());
      setStatus(error?.message || 'تعذر فحص Web Provider.');
    } finally {
      setWebChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader
        title="إعدادات الذكاء الاصطناعي"
        subtitle="إعداد Gemini API السحابي ومفاتيح الاتصال"
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
                الأدوات تظهر بعد التفعيل والتحقق من مفتاح Gemini API
              </div>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${enabled ? 'bg-[#5B3FD6]' : 'bg-gray-300'}`}>
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${enabled ? '-translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex items-center gap-3">
        <Cpu className="w-5 h-5 text-[#5B3FD6]" />
        <div>
          <h3 className="font-bold text-sm">Gemini API</h3>
          <p className="text-[11px] text-gray-400 mt-1">يعمل عبر الإنترنت باستخدام مفاتيح الاتصال المحفوظة.</p>
        </div>
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Gemini API Key — للسحابة</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {keys.length ? `${keys.length} مفاتيح محفوظة ومتحققة` : 'لم يتم حفظ مفتاح بعد'}
            </p>
          </div>
        </div>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={draftKey}
            onChange={(event) => handleDraftKeyChange(event.target.value)}
            placeholder={keys.length ? 'أضف Gemini API Key آخر' : 'ألصق Gemini API Key هنا'}
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
          disabled={busy || !draftKey.trim() || duplicateNumber !== null}
          className="h-11 rounded-[13px] bg-[#5B3FD6] text-white text-xs font-bold disabled:opacity-40"
        >
          {busy ? 'جارٍ الاختبار…' : 'اختبار وإضافة المفتاح'}
        </button>

        {duplicateNumber && (
          <div className="rounded-[12px] bg-amber-50 border border-amber-100 px-3 py-2.5 text-[11px] text-amber-700 font-semibold">
            هذا المفتاح محفوظ مسبقًا باسم «مفتاح {duplicateNumber}».
          </div>
        )}

        {keys.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-black text-[#2C2145]">المفاتيح المحفوظة</div>
            {keys.map((key) => (
              <div key={key.id} className={`rounded-[13px] border p-3 flex items-center gap-3 ${key.active ? 'border-[#5B3FD6] bg-[#F5F3FF]' : 'border-gray-100 bg-[#F8F9FD]'}`}>
                <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${key.active ? 'bg-[#5B3FD6] text-white' : 'bg-white text-[#5B3FD6]'}`}>
                  <KeyRound className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#2C2145]">مفتاح {key.number}</span>
                    {key.active && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#EAE4FF] text-[#5B3FD6]">نشط</span>}
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1 font-mono truncate">{key.masked}</div>
                  <div className="text-[9px] text-emerald-600 mt-0.5">تم التحقق ✓</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {!key.active && (
                    <button onClick={() => void makeActive(key.id, key.number)} disabled={busy} className="h-8 px-2.5 rounded-[9px] bg-white border border-gray-200 text-[9px] font-bold text-[#5B3FD6] disabled:opacity-40">
                      استخدام
                    </button>
                  )}
                  <button onClick={() => void removeKey(key.id, key.number)} disabled={busy} className="w-8 h-8 rounded-[9px] bg-red-50 text-red-600 flex items-center justify-center disabled:opacity-40" aria-label={`حذف مفتاح ${key.number}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="text-[10px] leading-5 text-gray-500">
              عند فشل المفتاح النشط بسبب المصادقة أو انتهاء الحصة، ينتقل التطبيق تلقائيًا إلى المفتاح التالي المتحقق.
            </div>
          </div>
        )}

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
            <h3 className="font-bold text-sm">قدرة البحث على الويب</h3>
            <p className="text-[11px] text-gray-400 mt-1">يفحص التطبيق النماذج المتاحة ويختبر Google Search فعليًا</p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            webCapability.status === 'ready'
              ? 'bg-emerald-50 text-emerald-600'
              : webCapability.status === 'quota'
                ? 'bg-amber-50 text-amber-600'
                : webCapability.status === 'unsupported' || webCapability.status === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-gray-100 text-gray-400'
          }`}>
            {webChecking ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Wifi className="w-5 h-5" />}
          </div>
        </div>

        <div className="rounded-[13px] bg-[#F8F9FD] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">الحالة</span>
            <span className={`text-[10px] font-black ${
              webCapability.status === 'ready'
                ? 'text-emerald-600'
                : webCapability.status === 'quota'
                  ? 'text-amber-600'
                  : webCapability.status === 'unknown'
                    ? 'text-gray-500'
                    : 'text-red-600'
            }`}>
              {webCapability.status === 'ready'
                ? 'جاهز'
                : webCapability.status === 'quota'
                  ? 'الحصة ممتلئة'
                  : webCapability.status === 'unsupported'
                    ? 'غير مدعوم'
                    : webCapability.status === 'error'
                      ? 'خطأ'
                      : 'لم يُفحص'}
            </span>
          </div>
          {webCapability.model && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[10px] text-gray-400">نموذج الويب</span>
              <span className="text-[10px] font-mono font-bold text-[#2C2145]">{webCapability.model}</span>
            </div>
          )}
          {webCapability.checkedAt > 0 && (
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[10px] text-gray-400">آخر فحص</span>
              <span className="text-[9px] text-gray-500">{new Date(webCapability.checkedAt).toLocaleString('ar-MA')}</span>
            </div>
          )}
          {webCapability.detail && (
            <p className="text-[9px] leading-5 text-gray-500 mt-2">{webCapability.detail}</p>
          )}
        </div>

        <button
          onClick={() => void checkWebProvider()}
          disabled={webChecking || keys.length === 0}
          className="h-11 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] text-xs font-bold disabled:opacity-40"
        >
          {webChecking ? 'جارٍ الفحص…' : 'فحص Web Provider'}
        </button>
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
          disabled={busy || keys.length === 0}
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

      <AiProviderMonitor />

    </div>
  );
};
