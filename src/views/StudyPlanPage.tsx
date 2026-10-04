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
  PlayCircle,
  Square,
  XCircle,
} from 'lucide-react';
import { PurpleSubpageHeader } from '../components/PurpleSubpageHeader';
import { db } from '../services/db';
import {
  cancelStudyAlarm,
  cancelQuestionReminder,
  listDeviceAlarmSounds,
  previewDeviceAlarmSound,
  previewCustomAlarmSound,
  stopDeviceAlarmPreview,
  saveAlarmAudio,
  requestStudyAlarmPermission,
  checkStudyAlarmPermission,
  scheduleStudyAlarm,
  scheduleQuestionReminder,
  DeviceAlarmSound,
  StudyAlarmSound,
} from '../services/studyAlarm';
import { FloatingNotice } from '../components/FloatingNotice';

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
  const [alarmSound, setAlarmSound] = useState<StudyAlarmSound>(() => {
    const saved = db.setting('study_alarm_sound', 'device') as StudyAlarmSound;
    return saved === 'custom' ? 'custom' : 'device';
  });
  const [customPath, setCustomPath] = useState(() => db.setting('study_alarm_custom_path', ''));
  const [customName, setCustomName] = useState(() => db.setting('study_alarm_custom_name', ''));
  const [customMessage, setCustomMessage] = useState(() => db.setting('study_alarm_custom_message', ''));
  const [deviceSounds, setDeviceSounds] = useState<DeviceAlarmSound[]>([]);
  const [deviceSoundUri, setDeviceSoundUri] = useState(() => db.setting('study_alarm_device_sound_uri', ''));
  const [previewing, setPreviewing] = useState(false);
  const [repeatDaily, setRepeatDaily] = useState(() => db.setting('study_alarm_repeat_daily', '1') === '1');
  const [questionReminderEnabled, setQuestionReminderEnabled] = useState(() => db.setting('question_reminder_enabled', '0') === '1');
  const [questionReminderStart, setQuestionReminderStart] = useState(() => db.setting('question_reminder_start_time', '09:00'));
  const [questionReminderHours, setQuestionReminderHours] = useState(() => {
    const value = Number(db.setting('question_reminder_interval_hours', '2'));
    return Number.isFinite(value) ? Math.min(24, Math.max(1, Math.floor(value))) : 2;
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const loadSounds = async () => {
      const items = await listDeviceAlarmSounds();
      if (!active) return;
      setDeviceSounds(items);
      if (!deviceSoundUri && items.length > 0) {
        setDeviceSoundUri(items[0].uri);
      }
      if (db.setting('study_alarm_sound', 'device') !== 'custom') {
        setAlarmSound('device');
      }
    };
    void loadSounds();
    return () => {
      active = false;
      void stopDeviceAlarmPreview();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void checkStudyAlarmPermission().then(granted => {
      if (!active || granted) return;
      setAlarmEnabled(false);
      setQuestionReminderEnabled(false);
      db.setSetting('study_alarm_enabled','0');
      db.setSetting('question_reminder_enabled','0');
      void cancelStudyAlarm().catch(()=>{});
      void cancelQuestionReminder().catch(()=>{});
    });
    return () => { active = false; };
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
    db.setSetting('question_reminder_enabled', questionReminderEnabled ? '1' : '0');
    db.setSetting('question_reminder_start_time', questionReminderStart);
    db.setSetting('question_reminder_interval_hours', String(questionReminderHours));
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
        setAlarmEnabled(false);
        db.setSetting('study_alarm_enabled','0');
        setStatus('تم حفظ موعد الامتحان والخطة، لكن إذن الإشعارات غير ممنوح؛ لذلك بقي المنبّه غير مفعّل.');
        return;
      }

      const result = await scheduleStudyAlarm({
        time: alarmTime,
        sound: alarmSound === 'custom' && customPath ? 'custom' : 'device',
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

      const needsPermission = alarmEnabled || questionReminderEnabled;
      if (needsPermission) {
        const permissionGranted = await requestStudyAlarmPermission();
        if (!permissionGranted) {
          setAlarmEnabled(false);
          setQuestionReminderEnabled(false);
          db.setSetting('study_alarm_enabled','0');
          db.setSetting('question_reminder_enabled','0');
          try { await cancelStudyAlarm(); } catch {}
          try { await cancelQuestionReminder(); } catch {}
          setStatus('تم حفظ الإعدادات، لكن إذن الإشعارات غير ممنوح؛ لذلك بقيت التذكيرات غير مفعّلة.');
          return;
        }
      }

      if (questionReminderEnabled) {
        await scheduleQuestionReminder({
          startTime: questionReminderStart,
          intervalHours: questionReminderHours,
        });
      } else {
        await cancelQuestionReminder();
      }

      if (!alarmEnabled) {
        try { await cancelStudyAlarm(); } catch {}
        setStatus(questionReminderEnabled
          ? `تم حفظ الخطة وتفعيل سؤال مراجعة كل ${questionReminderHours} ساعة بدءًا من ${questionReminderStart}.`
          : 'تم حفظ خطة المراجعة وإيقاف التنبيهات.');
        return;
      }

      if (alarmSound === 'device' && !deviceSoundUri) {
        setStatus('تم حفظ الخطة وتذكير السؤال، لكن لم يتم العثور على صوت من الهاتف لمنبّه الخطة.');
        return;
      }
      if (alarmSound === 'custom' && !customPath) {
        setStatus('تم حفظ الخطة وتذكير السؤال، لكن منبّه الخطة يحتاج ملفًا صوتيًا خاصًا.');
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
        ? (questionReminderEnabled
          ? `تم حفظ الخطة والمنبّه وتفعيل سؤال دوري كل ${questionReminderHours} ساعة.`
          : 'تم حفظ الخطة وجدولة المنبّه.')
        : 'تم حفظ الإعدادات، وقد يؤخر Android بعض التنبيهات قليلًا لعدم توفر الإذن الدقيق.');
    } catch (error: any) {
      setStatus(error?.message || 'تعذر حفظ الخطة أو جدولة التنبيهات.');
    } finally {
      setBusy(false);
    }
  };

  const startReview = () => {
    persistPlanSettings();
    db.setActiveBank(nextBankForReview);
    onStartReview(reviewSessionSize);
  };


  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <PurpleSubpageHeader title="خطة المراجعة" subtitle="خطة يومية تتكيف مع تقدمك حتى موعد الامتحان" onBack={onBack} />

      <FloatingNotice message={status} onDismiss={() => setStatus('')} />

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
              <div className="text-xs font-bold mb-2">صوت التنبيه من الهاتف</div>
              <div className="rounded-[16px] border border-gray-100 bg-[#F8F9FD] overflow-hidden">
                {deviceSounds.length === 0 ? (
                  <div className="p-4 text-xs text-gray-400 text-center">
                    لم يتم العثور على أصوات متاحة في الهاتف.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-auto divide-y divide-gray-100">
                    {deviceSounds.map((sound) => {
                      const selected = alarmSound === 'device' && deviceSoundUri === sound.uri;
                      return (
                        <div
                          key={sound.id}
                          className={`flex items-center gap-2 p-2.5 ${selected ? 'bg-[#F5F3FF]' : 'bg-white'}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setAlarmSound('device');
                              setDeviceSoundUri(sound.uri);
                              setPreviewing(false);
                              void stopDeviceAlarmPreview();
                            }}
                            className="flex-1 min-w-0 text-right"
                          >
                            <div className={`text-xs truncate ${selected ? 'font-black text-[#5B3FD6]' : 'font-semibold text-[#2C2145]'}`}>
                              {sound.title}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const isCurrentPreview = previewing && deviceSoundUri === sound.uri;
                              if (isCurrentPreview) {
                                await stopDeviceAlarmPreview();
                                setPreviewing(false);
                              } else {
                                setAlarmSound('device');
                                setDeviceSoundUri(sound.uri);
                                await previewDeviceAlarmSound(sound.uri);
                                setPreviewing(true);
                              }
                            }}
                            className="w-10 h-10 shrink-0 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center"
                            aria-label={previewing && deviceSoundUri === sound.uri ? 'إيقاف الصوت' : 'تشغيل الصوت'}
                          >
                            {previewing && deviceSoundUri === sound.uri
                              ? <Square className="w-4 h-4 fill-current" />
                              : <PlayCircle className="w-5 h-5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setAlarmSound('custom');
                  setPreviewing(false);
                  void stopDeviceAlarmPreview();
                }}
                className={`w-full py-2.5 rounded-[12px] border text-xs font-bold ${alarmSound === 'custom' ? 'border-[#5B3FD6] bg-[#F5F3FF] text-[#5B3FD6]' : 'border-gray-100 bg-white text-gray-600'}`}
              >
                استخدام ملف صوتي خاص
              </button>
            </div>

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
            {alarmSound === 'custom' && (
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => audioInputRef.current?.click()}
                  className="flex-1 py-3 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {customName ? `تغيير الملف · ${customName}` : 'رفع موسيقى أو صوت خاص'}
                </button>
                {customPath && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (previewing) {
                        await stopDeviceAlarmPreview();
                        setPreviewing(false);
                      } else {
                        await previewCustomAlarmSound(customPath);
                        setPreviewing(true);
                      }
                    }}
                    className="w-12 rounded-[13px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center"
                    aria-label={previewing ? 'إيقاف المعاينة' : 'تشغيل المعاينة'}
                  >
                    {previewing ? <Square className="w-4 h-4 fill-current" /> : <PlayCircle className="w-5 h-5" />}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="bg-white rounded-[22px] p-4 border border-gray-100 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-black text-sm text-[#2C2145]">سؤال مراجعة دوري</div>
            <div className="text-[11px] text-gray-400 mt-1">يرسل سؤالًا من البنك النشط كل فترة حتى عند إغلاق التطبيق</div>
          </div>
          <button
            type="button"
            onClick={() => setQuestionReminderEnabled((value) => !value)}
            className={`w-12 h-7 rounded-full p-1 transition-colors ${questionReminderEnabled ? 'bg-[#5B3FD6]' : 'bg-gray-200'}`}
            aria-label="تفعيل سؤال المراجعة الدوري"
          >
            <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${questionReminderEnabled ? '-translate-x-5' : ''}`} />
          </button>
        </div>

        {questionReminderEnabled && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold">يبدأ من الساعة</label>
              <input
                type="time"
                value={questionReminderStart}
                onChange={(e) => setQuestionReminderStart(e.target.value)}
                className="mt-2 w-full rounded-[13px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold">الفاصل بين الأسئلة</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[1, 2, 4, 6].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setQuestionReminderHours(hours)}
                    className={`py-2.5 rounded-[12px] text-xs font-bold border ${questionReminderHours === hours ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]' : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    {hours === 1 ? 'ساعة' : `${hours} س`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={questionReminderHours}
                  onChange={(e) => setQuestionReminderHours(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-24 rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-2.5 text-sm text-center"
                />
                <span className="text-[11px] text-gray-400">ساعة — من 1 إلى 24</span>
              </div>
            </div>

            <div className="rounded-[14px] bg-[#F5F3FF] p-3 text-[11px] leading-relaxed text-[#5B3FD6]">
              سيختار التطبيق سؤالًا جاهزًا من البنك النشط في كل مرة. عند الضغط على الإشعار يفتح نفس السؤال داخل التطبيق.
            </div>
          </div>
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
