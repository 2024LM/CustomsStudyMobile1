import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Play,
  Save,
  Sparkles,
  Target,
  Upload,
  Volume2,
  PlayCircle,
  Square,
  XCircle,
} from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import { db } from '../services/db';
import {
  cancelStudyAlarm,
  listDeviceAlarmSounds,
  previewDeviceAlarmSound,
  stopDeviceAlarmPreview,
  saveAlarmAudio,
  requestStudyAlarmPermission,
  scheduleStudyAlarm,
  DeviceAlarmSound,
  StudyAlarmSound,
} from '../services/studyAlarm';

type PlanScope = 'ALL' | string;

export const StudyPlanPage: React.FC<{
  onBack: () => void;
  onStartReview: (count: number) => void;
}> = ({ onBack, onStartReview }) => {
  const banks = db.banks();
  const [examDate, setExamDate] = useState(() => db.setting('study_plan_exam_date', ''));
  const [dailyTarget, setDailyTarget] = useState(() => Number(db.setting('study_plan_daily_target', '20')) || 20);
  const [autoTarget, setAutoTarget] = useState(() => db.setting('study_plan_auto_target', '1') !== '0');
  const [scope, setScope] = useState<PlanScope>(() => {
    const saved = db.setting('study_plan_scope', 'ALL');
    return saved === 'ALL' || banks.some((bank) => bank.id === saved) ? saved : 'ALL';
  });
  const [alarmEnabled, setAlarmEnabled] = useState(() => db.setting('study_alarm_enabled', '0') === '1');
  const [alarmTime, setAlarmTime] = useState(() => db.setting('study_alarm_time', '20:00'));
  const [alarmSound, setAlarmSound] = useState<StudyAlarmSound>(() => (db.setting('study_alarm_sound', 'focus') as StudyAlarmSound));
  const [customPath, setCustomPath] = useState(() => db.setting('study_alarm_custom_path', ''));
  const [customName, setCustomName] = useState(() => db.setting('study_alarm_custom_name', ''));
  const [customMessage, setCustomMessage] = useState(() => db.setting('study_alarm_custom_message', ''));
  const [deviceSounds, setDeviceSounds] = useState<DeviceAlarmSound[]>([]);
  const [deviceSoundUri, setDeviceSoundUri] = useState(() => db.setting('study_alarm_device_sound_uri', ''));
  const [previewing, setPreviewing] = useState(false);
  const [repeatDaily, setRepeatDaily] = useState(() => db.setting('study_alarm_repeat_daily', '1') === '1');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listDeviceAlarmSounds().then((items) => {
      if (!active) return;
      setDeviceSounds(items);
      if (!deviceSoundUri && items.length > 0) {
        setDeviceSoundUri(items[0].uri);
      }
    });
    return () => {
      active = false;
      void stopDeviceAlarmPreview();
    };
  }, []);

  const bankId = scope === 'ALL' ? null : scope;
  const analytics = db.studyPlanAnalytics(bankId);

  const daysRemaining = useMemo(() => {
    if (!examDate) return null;
    const target = new Date(`${examDate}T23:59:59`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.max(0, Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  }, [examDate]);

  const examExpired = Boolean(examDate && daysRemaining === 0 && new Date(`${examDate}T23:59:59`).getTime() < Date.now());

  const suggestedDaily = daysRemaining && daysRemaining > 0
    ? Math.max(1, Math.ceil(analytics.unseenPlayable / daysRemaining))
    : null;

  const effectiveTarget = Math.min(
    500,
    Math.max(1, autoTarget && suggestedDaily ? suggestedDaily : dailyTarget)
  );
  const todayDone = analytics.todayAnswered;
  const todayRemaining = Math.max(0, effectiveTarget - todayDone);
  const todayProgress = Math.min(100, Math.round((todayDone / Math.max(1, effectiveTarget)) * 100));
  const coverageProgress = analytics.playable
    ? Math.round((analytics.reviewedPlayable / analytics.playable) * 100)
    : 0;
  const sessionSize = Math.max(1, Math.min(50, todayRemaining || effectiveTarget, analytics.playable || 1));

  const selectedScopeLabel = scope === 'ALL'
    ? 'كل البنوك'
    : banks.find((bank) => bank.id === scope)?.name || 'البنك المحدد';

  const nextBankForReview = useMemo(() => {
    if (bankId) return bankId;
    const ranked = banks
      .map((bank) => ({ bank, plan: db.studyPlanAnalytics(bank.id) }))
      .filter((item) => item.plan.playable > 0)
      .sort((a, b) =>
        b.plan.unseenPlayable - a.plan.unseenPlayable
        || b.plan.playable - a.plan.playable
      );
    return ranked[0]?.bank.id || db.activeBankId();
  }, [bankId, banks]);

  const nextBankAnalytics = db.studyPlanAnalytics(nextBankForReview);
  const reviewSessionSize = Math.max(
    1,
    Math.min(
      sessionSize,
      nextBankAnalytics.playable || 1,
      nextBankAnalytics.unseenPlayable || nextBankAnalytics.playable || 1
    )
  );

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

  const persistPlanSettings = (examDateOverride?: string) => {
    const safeTarget = Math.min(Math.max(dailyTarget, 1), 500);
    db.setSetting('study_plan_exam_date', examDateOverride ?? examDate);
    db.setSetting('study_plan_daily_target', String(safeTarget));
    db.setSetting('study_plan_auto_target', autoTarget ? '1' : '0');
    db.setSetting('study_plan_scope', scope);
    db.setSetting('study_alarm_enabled', alarmEnabled ? '1' : '0');
    db.setSetting('study_alarm_time', alarmTime);
    db.setSetting('study_alarm_sound', alarmSound);
    db.setSetting('study_alarm_custom_path', customPath);
    db.setSetting('study_alarm_custom_name', customName);
    db.setSetting('study_alarm_custom_message', customMessage.trim());
    db.setSetting('study_alarm_device_sound_uri', deviceSoundUri);
    db.setSetting('study_alarm_repeat_daily', repeatDaily ? '1' : '0');
    return safeTarget;
  };

  const handleExamDateChange = async (value: string) => {
    setExamDate(value);
    persistPlanSettings(value);

    if (!value) {
      setAlarmEnabled(false);
      db.setSetting('study_alarm_enabled', '0');
      try { await cancelStudyAlarm(); } catch {}
      setStatus('تم حذف موعد الامتحان وإيقاف إشعارات الخطة اليومية.');
      return;
    }

    const examEnd = new Date(`${value}T23:59:59`);
    if (Number.isNaN(examEnd.getTime()) || examEnd.getTime() < Date.now()) {
      setStatus('تم حفظ التاريخ، لكنه تاريخ منتهٍ. اختر موعدًا قادمًا لتفعيل الخطة اليومية.');
      return;
    }

    setAlarmEnabled(true);
    setRepeatDaily(true);
    db.setSetting('study_alarm_enabled', '1');
    db.setSetting('study_alarm_repeat_daily', '1');

    try {
      const permissionGranted = await requestStudyAlarmPermission();
      if (!permissionGranted) {
        setStatus('تم حفظ موعد الامتحان والخطة، لكن يجب السماح بالإشعارات لتصلك خطة اليوم يوميًا.');
        return;
      }

      const result = await scheduleStudyAlarm({
        time: alarmTime,
        sound: alarmSound === 'custom' && !customPath ? 'focus' : alarmSound,
        customPath: alarmSound === 'custom' ? customPath : '',
        deviceSoundUri: alarmSound === 'device' ? deviceSoundUri : '',
        customMessage: customMessage.trim(),
        repeatDaily: true,
        title: '🎓 خطة مراجعة اليوم',
        message: 'سيتم حساب هدف اليوم تلقائيًا عند وقت التذكير.',
      });

      setStatus(result.exact
        ? 'تم حفظ موعد الامتحان وتفعيل إشعار خطة اليوم يوميًا.'
        : 'تم حفظ الموعد وتفعيل إشعار يومي، وقد يؤخره Android قليلًا لعدم توفر الإذن الدقيق.');
    } catch (error: any) {
      setStatus(error?.message || 'تم حفظ الموعد، لكن تعذر جدولة إشعار الخطة اليومية.');
    }
  };

  const savePlan = async () => {
    setBusy(true);
    setStatus('');
    try {
      persistPlanSettings();

      if (!alarmEnabled) {
        try { await cancelStudyAlarm(); } catch {}
        setStatus('تم حفظ خطة المراجعة وإيقاف المنبّه.');
        return;
      }

      if (alarmSound === 'custom' && !customPath) {
        setStatus('تم حفظ الخطة، لكن المنبّه لم يُجدول: اختر ملفًا صوتيًا خاصًا أولًا.');
        return;
      }

      const permissionGranted = await requestStudyAlarmPermission();
      if (!permissionGranted) {
        setStatus('تم حفظ خطة المراجعة، لكن المنبّه يحتاج إذن الإشعارات من Android.');
        return;
      }

      const result = await scheduleStudyAlarm({
        time: alarmTime,
        sound: alarmSound,
        customPath,
        deviceSoundUri: alarmSound === 'device' ? deviceSoundUri : '',
        customMessage: customMessage.trim(),
        repeatDaily: Boolean(examDate) ? true : repeatDaily,
        title: `🎓 وقت المراجعة: ${db.activeDomain().name}`,
        message: `هدف اليوم ${effectiveTarget} سؤال. المتبقي الآن ${todayRemaining}.`,
      });
      setStatus(result.exact
        ? 'تم حفظ الخطة وجدولة المنبّه.'
        : 'تم حفظ الخطة وجدولة المنبّه، وقد يؤخره Android قليلًا لعدم توفر الإذن الدقيق.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ الخطة أو جدولة المنبّه.');
    } finally {
      setBusy(false);
    }
  };

  const startReview = () => {
    persistPlanSettings();
    db.setActiveBank(nextBankForReview);
    onStartReview(reviewSessionSize);
  };

  const sounds: Array<{ id: StudyAlarmSound; title: string; subtitle: string }> = [
    { id: 'calm', title: 'هادئ', subtitle: 'تنبيه متباعد وخفيف' },
    { id: 'focus', title: 'تركيز', subtitle: 'نغمة واضحة للمراجعة' },
    { id: 'bell', title: 'جرس', subtitle: 'تنبيه أقوى ومتكرر' },
    { id: 'custom', title: 'صوت خاص', subtitle: customName || 'ارفع موسيقى أو صوتًا من هاتفك' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader title="خطة المراجعة" subtitle="خطة يومية تتكيف مع تقدمك حتى موعد الامتحان" onBack={onBack} />

      {status && (
        <div className="rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] px-3 py-2 text-xs font-semibold">
          {status}
        </div>
      )}

      <section className="bg-white rounded-[22px] p-4 border border-gray-100 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-5 h-5 text-[#5B3FD6]" />
          <h2 className="font-black text-sm text-[#2C2145]">موعد الامتحان</h2>
        </div>
        <input
          type="date"
          value={examDate}
          onChange={(e) => void handleExamDateChange(e.target.value)}
          className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
        />

        {examDate && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[15px] bg-[#F8F9FD] p-3">
            <div>
              <div className="text-[10px] text-gray-400">الأيام المتبقية</div>
              <div className={`text-2xl font-black ${examExpired ? 'text-red-500' : 'text-[#2C2145]'}`}>
                {examExpired ? 'انتهى الموعد' : daysRemaining ?? '—'}
              </div>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-gray-400">نطاق الخطة</div>
              <div className="text-xs font-bold text-[#5B3FD6] mt-1">{selectedScopeLabel}</div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-gradient-to-l from-[#392080] to-[#6841E8] text-white rounded-[24px] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[#DDD5FF]">خطة اليوم</div>
            <div className="text-2xl font-black mt-1">{todayDone} / {effectiveTarget}</div>
          </div>
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center">
            <Target className="w-7 h-7" />
          </div>
        </div>

        <div className="mt-4 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${todayProgress}%` }} />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-[14px] bg-white/10 p-3">
            <div className="text-[10px] text-[#DDD5FF]">أُنجز</div>
            <div className="text-lg font-black">{todayDone}</div>
          </div>
          <div className="rounded-[14px] bg-white/10 p-3">
            <div className="text-[10px] text-[#DDD5FF]">متبقي</div>
            <div className="text-lg font-black">{todayRemaining}</div>
          </div>
          <div className="rounded-[14px] bg-white/10 p-3">
            <div className="text-[10px] text-[#DDD5FF]">صحيح اليوم</div>
            <div className="text-lg font-black">{analytics.todayCorrect}</div>
          </div>
        </div>

        <button
          onClick={startReview}
          disabled={analytics.playable === 0}
          className="w-full mt-4 py-3.5 rounded-[15px] bg-white text-[#5B3FD6] text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          {todayRemaining === 0 ? `جلسة إضافية · ${reviewSessionSize} سؤال` : `ابدأ المراجعة · ${reviewSessionSize} سؤال`}
        </button>
      </section>

      <section className="bg-white rounded-[22px] p-4 border border-gray-100 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-[#5B3FD6]" />
          <h2 className="font-black text-sm text-[#2C2145]">الخطة الذكية</h2>
        </div>

        <label className="text-xs font-bold">مصدر الأسئلة</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
        >
          <option value="ALL">كل البنوك</option>
          {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
        </select>

        <div className="mt-4 rounded-[16px] bg-[#F8F9FD] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold">حساب الهدف تلقائيًا</div>
              <div className="text-[10px] text-gray-400 mt-1">الأسئلة التي لم تراجعها ÷ الأيام المتبقية</div>
            </div>
            <button
              type="button"
              onClick={() => setAutoTarget((v) => !v)}
              className={`w-12 h-7 rounded-full p-1 transition-colors ${autoTarget ? 'bg-[#5B3FD6]' : 'bg-gray-200'}`}
              aria-label="تفعيل الهدف التلقائي"
            >
              <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${autoTarget ? '-translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {!autoTarget && (
          <div className="mt-4">
            <label className="text-xs font-bold">هدفك اليومي من الأسئلة</label>
            <input
              type="number"
              min={1}
              max={500}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-[16px] border border-gray-100 p-3">
            <BookOpenCheck className="w-4 h-4 text-[#5B3FD6] mb-2" />
            <div className="text-[10px] text-gray-400">لم تُراجع بعد</div>
            <div className="text-xl font-black text-[#2C2145]">{analytics.unseenPlayable}</div>
          </div>
          <div className="rounded-[16px] border border-gray-100 p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mb-2" />
            <div className="text-[10px] text-gray-400">تمت مراجعتها</div>
            <div className="text-xl font-black text-[#2C2145]">{analytics.reviewedPlayable}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[10px] mb-1.5">
            <span className="text-gray-400">تغطية بنك الأسئلة</span>
            <span className="font-bold text-[#5B3FD6]">{coverageProgress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#E7E2F8] overflow-hidden">
            <div className="h-full bg-[#5B3FD6] rounded-full" style={{ width: `${coverageProgress}%` }} />
          </div>
        </div>

        {autoTarget && (
          <div className="mt-3 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] p-3 text-xs font-semibold">
            {suggestedDaily
              ? `الهدف المقترح حاليًا: ${suggestedDaily} سؤال يوميًا.`
              : examDate
                ? 'لا يمكن حساب هدف تلقائي بعد انتهاء الموعد.'
                : 'حدد تاريخ الامتحان ليحسب التطبيق الهدف اليومي تلقائيًا.'}
          </div>
        )}
      </section>

      <section className="bg-white rounded-[22px] p-4 border border-gray-100 flex flex-col gap-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-black text-sm">تذكير المراجعة</div>
            <div className="text-[11px] text-gray-400 mt-1">تنبيه Android حتى عند إغلاق واجهة التطبيق</div>
          </div>
          <button
            onClick={() => setAlarmEnabled((value) => !value)}
            className={`w-12 h-7 rounded-full p-1 transition-colors ${alarmEnabled ? 'bg-[#5B3FD6]' : 'bg-gray-200'}`}
            aria-label="تفعيل منبه المراجعة"
          >
            <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${alarmEnabled ? '-translate-x-5' : ''}`} />
          </button>
        </div>

        {alarmEnabled && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold">وقت المنبّه</label>
                <input
                  type="time"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
                />
              </div>
              <div className="flex-1 rounded-[13px] bg-[#F5F3FF] border border-[#E7E2F8] p-3 flex items-center gap-2 mt-6">
                <span className="w-5 h-5 rounded-full bg-[#5B3FD6] text-white text-[11px] flex items-center justify-center">✓</span>
                <span className="text-xs font-bold text-[#5B3FD6]">يوميًا حتى الامتحان</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold">رسالة التنبيه</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value.slice(0, 180))}
                placeholder="اختياري — اتركه فارغًا لعرض خطة اليوم تلقائيًا"
                rows={2}
                className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm resize-none"
              />
              <div className="text-[10px] text-gray-400 mt-1">
                إذا كتبت رسالة هنا ستظهر بدل نص الخطة الديناميكي في الإشعار.
              </div>
            </div>

            <div>
              <div className="text-xs font-bold mb-2">صوت التنبيه</div>
              <select
                value={alarmSound}
                onChange={(e) => {
                  setAlarmSound(e.target.value as StudyAlarmSound);
                  setPreviewing(false);
                  void stopDeviceAlarmPreview();
                }}
                className="w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
              >
                <option value="device">نغمة من الهاتف</option>
                <option value="focus">تركيز</option>
                <option value="calm">هادئ</option>
                <option value="bell">جرس</option>
                <option value="custom">ملف صوتي خاص</option>
              </select>
            </div>

            {alarmSound === 'device' && (
              <div className="rounded-[16px] bg-[#F8F9FD] border border-gray-100 p-3">
                <label className="text-xs font-bold">موسيقى / نغمة الهاتف</label>
                <div className="flex gap-2 mt-2">
                  <select
                    value={deviceSoundUri}
                    onChange={(e) => {
                      setDeviceSoundUri(e.target.value);
                      setPreviewing(false);
                      void stopDeviceAlarmPreview();
                    }}
                    className="flex-1 min-w-0 rounded-[12px] bg-white border border-gray-100 p-2.5 text-xs"
                  >
                    {deviceSounds.length === 0 && <option value="">لم يتم العثور على نغمات</option>}
                    {deviceSounds.map((sound) => (
                      <option key={sound.id} value={sound.uri}>{sound.title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!deviceSoundUri}
                    onClick={async () => {
                      if (previewing) {
                        await stopDeviceAlarmPreview();
                        setPreviewing(false);
                      } else {
                        await previewDeviceAlarmSound(deviceSoundUri);
                        setPreviewing(true);
                      }
                    }}
                    className="w-11 h-11 shrink-0 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center disabled:opacity-40"
                    aria-label={previewing ? 'إيقاف المعاينة' : 'تشغيل المعاينة'}
                  >
                    {previewing ? <Square className="w-4 h-4 fill-current" /> : <PlayCircle className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {alarmSound !== 'device' && alarmSound !== 'custom' && (
              <div className="rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-xs text-gray-500">
                سيتم استخدام نغمة التطبيق: {sounds.find((sound) => sound.id === alarmSound)?.title || 'الافتراضية'}.
              </div>
            )}

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = '';
                void handleAudio(file);
              }}
            />
            <button
              disabled={busy}
              onClick={() => audioInputRef.current?.click()}
              className="w-full py-3 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {customName ? 'تغيير الصوت الخاص' : 'رفع موسيقى أو صوت من الهاتف'}
            </button>
          </>
        )}
      </section>

      <button
        disabled={busy}
        onClick={() => void savePlan()}
        className="w-full py-3.5 rounded-[14px] bg-[#5B3FD6] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {busy ? 'جارٍ الحفظ…' : 'حفظ خطة المراجعة'}
      </button>

      {alarmEnabled && (
        <button
          disabled={busy}
          onClick={async () => {
            await cancelStudyAlarm();
            setAlarmEnabled(false);
            db.setSetting('study_alarm_enabled', '0');
            setStatus('تم إلغاء المنبّه مع الإبقاء على خطة المراجعة.');
          }}
          className="w-full py-3 rounded-[13px] bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-2"
        >
          <XCircle className="w-4 h-4" />
          إلغاء المنبّه
        </button>
      )}
    </div>
  );
};
