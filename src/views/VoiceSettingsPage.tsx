import React, { useEffect, useMemo, useState } from 'react';
import { Headphones, LoaderCircle, Play, RefreshCw, Volume2, Wifi } from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import {
  listTtsVoices,
  previewTtsVoice,
  saveSelectedTtsRate,
  saveSelectedTtsVoiceId,
  selectedTtsRate,
  selectedTtsVoiceId,
  TtsVoiceOption,
} from '../services/arabicTts';

export const VoiceSettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [voices, setVoices] = useState<TtsVoiceOption[]>([]);
  const [selected, setSelected] = useState(() => selectedTtsVoiceId());
  const [rate, setRate] = useState(() => selectedTtsRate());
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setStatus('');
    try {
      const result = await listTtsVoices();
      setVoices(result);
      const current = selectedTtsVoiceId();
      if (!current && result.length) {
        const preferred = result.find((voice) => /^ar(?:-|$)/i.test(voice.locale)) || result[0];
        saveSelectedTtsVoiceId(preferred.id);
        setSelected(preferred.id);
      } else {
        setSelected(current);
      }
    } catch (error: any) {
      setStatus(error?.message || 'تعذر جلب أصوات الهاتف.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, TtsVoiceOption[]>();
    for (const voice of voices) {
      const key = voice.locale || 'غير محدد';
      const list = map.get(key) || [];
      list.push(voice);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const arA = /^ar(?:-|$)/i.test(a) ? 0 : 1;
      const arB = /^ar(?:-|$)/i.test(b) ? 0 : 1;
      return arA - arB || a.localeCompare(b);
    });
  }, [voices]);

  const choose = (voice: TtsVoiceOption) => {
    saveSelectedTtsVoiceId(voice.id);
    setSelected(voice.id);
    setStatus(`تم اختيار الصوت: ${voice.name}`);
  };

  const preview = async (voice: TtsVoiceOption) => {
    setPreviewing(voice.id);
    setStatus('');
    try {
      await previewTtsVoice(voice.id, voice.locale);
    } catch (error: any) {
      setStatus(error?.message || 'تعذر تشغيل معاينة الصوت.');
    } finally {
      setPreviewing('');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader title="إعدادات الصوت" subtitle="اختر صوت القراءة المستخدم في AI والأسئلة والمراجع" onBack={onBack} />

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center">
            <Headphones className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm text-[#2C2145]">سرعة القراءة</div>
            <div className="text-[11px] text-gray-400 mt-1">{rate.toFixed(2)}×</div>
          </div>
          <button onClick={() => void load()} className="w-9 h-9 rounded-[11px] bg-[#F8F9FD] text-gray-500 flex items-center justify-center" aria-label="تحديث الأصوات">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.05"
          value={rate}
          onChange={(event) => {
            const value = Number(event.target.value);
            setRate(value);
            saveSelectedTtsRate(value);
          }}
          className="w-full mt-4 accent-[#5B3FD6]"
        />
      </div>

      {status && <div className="rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-[11px] font-semibold">{status}</div>}

      {loading ? (
        <div className="py-12 flex justify-center"><LoaderCircle className="w-6 h-6 animate-spin text-[#5B3FD6]" /></div>
      ) : voices.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-gray-100 p-6 text-center text-sm text-gray-500">
          لم يعثر التطبيق على أصوات TTS متاحة. ثبّت محرك تحويل النص إلى كلام أو حزمة أصوات من إعدادات الهاتف.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([locale, items]) => (
            <div key={locale} className="bg-white rounded-[20px] border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-[#FAF9FE] border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-black text-[#2C2145]">{locale}</span>
                <span className="text-[10px] text-gray-400">{items.length} صوت</span>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((voice) => {
                  const active = selected === voice.id;
                  return (
                    <div key={voice.id} className={`p-3 flex items-center gap-3 ${active ? 'bg-[#F8F6FF]' : ''}`}>
                      <button type="button" onClick={() => choose(voice)} className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-2">
                          <Volume2 className={`w-4 h-4 shrink-0 ${active ? 'text-[#5B3FD6]' : 'text-gray-400'}`} />
                          <span className={`text-xs font-bold truncate ${active ? 'text-[#5B3FD6]' : 'text-[#2C2145]'}`}>{voice.name}</span>
                          {active && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#EDE8FF] text-[#5B3FD6] font-bold">المختار</span>}
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1 pr-6 flex items-center gap-2">
                          <span>{voice.locale || 'لغة غير محددة'}</span>
                          {voice.networkRequired && <span className="inline-flex items-center gap-1"><Wifi className="w-3 h-3" /> يحتاج إنترنت</span>}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void preview(voice)}
                        disabled={Boolean(previewing)}
                        className="w-9 h-9 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center disabled:opacity-40"
                        aria-label="معاينة الصوت"
                      >
                        {previewing === voice.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
