import React, { useMemo, useRef, useState } from 'react';
import { BellRing, CalendarDays, Music, Save, Upload, Volume2, XCircle } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { db } from '../services/db';
import {
  cancelStudyAlarm,
  saveAlarmAudio,
  requestStudyAlarmPermission,
  scheduleStudyAlarm,
  StudyAlarmSound,
} from '../services/studyAlarm';

export const StudyPlanPage: React.FC = () => {
  const [examDate, setExamDate] = useState(() => db.setting('study_plan_exam_date', ''));
  const [dailyTarget, setDailyTarget] = useState(() => Number(db.setting('study_plan_daily_target', '20')) || 20);
  const [alarmEnabled, setAlarmEnabled] = useState(() => db.setting('study_alarm_enabled', '0') === '1');
  const [alarmTime, setAlarmTime] = useState(() => db.setting('study_alarm_time', '20:00'));
  const [alarmSound, setAlarmSound] = useState<StudyAlarmSound>(() => (db.setting('study_alarm_sound', 'focus') as StudyAlarmSound));
  const [customPath, setCustomPath] = useState(() => db.setting('study_alarm_custom_path', ''));
  const [customName, setCustomName] = useState(() => db.setting('study_alarm_custom_name', ''));
  const [repeatDaily, setRepeatDaily] = useState(() => db.setting('study_alarm_repeat_daily', '1') === '1');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const totalPlayable = db.banks().reduce((sum, bank) => sum + db.playableQuestionCount(bank.id), 0);

  const daysRemaining = useMemo(() => {
    if (!examDate) return null;
    const target = new Date(`${examDate}T23:59:59`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.max(0, Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  }, [examDate]);

  const suggestedDaily = daysRemaining && daysRemaining > 0
    ? Math.max(1, Math.ceil(totalPlayable / daysRemaining))
    : null;

  const handleAudio = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setStatus('جارٍ حفظ الصوت داخل التطبيق…');
    try {
      const path = await saveAlarmAudio(file);
      setCustomPath(path);
      setCustomName(file.name.slice(0, 120));
      setAlarmSound('custom');
      setStatus('تم حفظ الصوت الخاص ويمكن استخدامه للمنبّه.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ الملف الصوتي.');
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    setBusy(true);
    setStatus('');
    try {
      db.setSetting('study_plan_exam_date', examDate);
      db.setSetting('study_plan_daily_target', String(Math.min(Math.max(dailyTarget, 1), 500)));
      db.setSetting('study_alarm_enabled', alarmEnabled ? '1' : '0');
      db.setSetting('study_alarm_time', alarmTime);
      db.setSetting('study_alarm_sound', alarmSound);
      db.setSetting('study_alarm_custom_path', customPath);
      db.setSetting('study_alarm_custom_name', customName);
      db.setSetting('study_alarm_repeat_daily', repeatDaily ? '1' : '0');

      if (alarmEnabled) {
        if (alarmSound === 'custom' && !customPath) throw new Error('اختر ملفًا صوتيًا خاصًا أولًا.');
        const permissionGranted = await requestStudyAlarmPermission();
        if (!permissionGranted) throw new Error('يجب السماح بإشعارات التطبيق حتى يعمل منبّه المراجعة.');
        const result = await scheduleStudyAlarm({
          time: alarmTime,
          sound: alarmSound,
          customPath,
          repeatDaily,
          title: `🎓 وقت المراجعة: ${db.activeDomain().name}`,
          message: `هدفك اليومي ${dailyTarget} سؤال. حان وقت البدء.`,
        });
        setStatus(result.exact
          ? 'تم حفظ الخطة وجدولة المنبّه.'
          : 'تم حفظ الخطة وجدولة المنبّه، لكن Android قد يؤخره قليلًا لأن الإذن الدقيق غير متاح.');
      } else {
        await cancelStudyAlarm();
        setStatus('تم حفظ الخطة وإيقاف المنبّه.');
      }
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ الخطة أو جدولة المنبّه.');
    } finally {
      setBusy(false);
    }
  };

  const sounds: Array<{ id: StudyAlarmSound; title: string; subtitle: string }> = [
    { id: 'calm', title: 'هادئ', subtitle: 'تنبيه متباعد وخفيف' },
    { id: 'focus', title: 'تركيز', subtitle: 'نغمة واضحة للمراجعة' },
    { id: 'bell', title: 'جرس', subtitle: 'تنبيه أقوى ومتكرر' },
    { id: 'custom', title: 'صوت خاص', subtitle: customName || 'ارفع موسيقى أو صوتًا من هاتفك' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader title="خطة المراجعة" subtitle="الهدف اليومي، موعد الامتحان ومنبّه المراجعة" />

      {status && <div className="rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-xs font-semibold">{status}</div>}

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 flex flex-col gap-3">
        <label className="text-xs font-bold">تاريخ الامتحان</label>
        <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
          className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />

        <label className="text-xs font-bold">هدفك اليومي من الأسئلة</label>
        <input type="number" min={1} max={500} value={dailyTarget}
          onChange={(e) => setDailyTarget(Number(e.target.value) || 1)}
          className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
      </div>

      {examDate && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-[17px] p-4 border border-gray-100">
            <CalendarDays className="w-5 h-5 text-[#5B3FD6] mb-2" />
            <div className="text-xs text-gray-400">الأيام المتبقية</div>
            <div className="text-2xl font-bold">{daysRemaining ?? '—'}</div>
          </div>
          <div className="bg-white rounded-[17px] p-4 border border-gray-100">
            <BellRing className="w-5 h-5 text-[#5B3FD6] mb-2" />
            <div className="text-xs text-gray-400">المقترح اليومي</div>
            <div className="text-2xl font-bold">{suggestedDaily ?? '—'}</div>
            <div className="text-[10px] text-gray-400">من {totalPlayable} سؤال جاهز</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[20px] p-4 border border-gray-100 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">منبّه المراجعة الصوتي</div>
            <div className="text-[11px] text-gray-400 mt-1">يعمل من Android حتى عند إغلاق واجهة التطبيق</div>
          </div>
          <button
            onClick={() => setAlarmEnabled((value) => !value)}
            className={`w-12 h-7 rounded-full p-1 transition-colors ${alarmEnabled ? 'bg-[#5B3FD6]' : 'bg-gray-200'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${alarmEnabled ? '-translate-x-5' : ''}`} />
          </button>
        </div>

        {alarmEnabled && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold">وقت المنبّه</label>
                <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)}
                  className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm" />
              </div>
              <label className="flex-1 rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 flex items-center gap-2 mt-6">
                <input type="checkbox" checked={repeatDaily} onChange={(e) => setRepeatDaily(e.target.checked)} />
                <span className="text-xs font-bold">يوميًا</span>
              </label>
            </div>

            <div>
              <div className="text-xs font-bold mb-2">صوت المنبّه</div>
              <div className="grid grid-cols-2 gap-2">
                {sounds.map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => setAlarmSound(sound.id)}
                    className={`rounded-[14px] border p-3 text-right ${alarmSound === sound.id ? 'border-[#5B3FD6] bg-[#F5F3FF]' : 'border-gray-100 bg-[#F8F9FD]'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-[#5B3FD6]" />
                      <span className="text-xs font-bold">{sound.title}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">{sound.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>

            <input ref={audioInputRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = '';
                void handleAudio(file);
              }} />
            <button disabled={busy} onClick={() => audioInputRef.current?.click()}
              className="w-full py-3 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Upload className="w-4 h-4" />
              {customName ? 'تغيير الصوت الخاص' : 'رفع موسيقى أو صوت من الهاتف'}
            </button>
          </>
        )}
      </div>

      <button disabled={busy} onClick={() => void savePlan()}
        className="w-full py-3.5 rounded-[14px] bg-[#5B3FD6] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
        <Save className="w-4 h-4" />
        {busy ? 'جارٍ الحفظ…' : 'حفظ الخطة والمنبّه'}
      </button>

      {alarmEnabled && (
        <button disabled={busy} onClick={async () => {
          await cancelStudyAlarm();
          setAlarmEnabled(false);
          db.setSetting('study_alarm_enabled', '0');
          setStatus('تم إلغاء المنبّه.');
        }} className="w-full py-3 rounded-[13px] bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-2">
          <XCircle className="w-4 h-4" />
          إلغاء المنبّه
        </button>
      )}
    </div>
  );
};
