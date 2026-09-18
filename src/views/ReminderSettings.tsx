import React, { useState } from 'react';
import {
  BellRing,
  Clock,
  Info,
  Save,
  Send,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { db } from '../services/db';
import { ScreenHeader } from '../components/ScreenHeader';

interface ReminderSettingsProps {
  onTriggerDirectQuestion?: () => void;
}

export const ReminderSettings: React.FC<ReminderSettingsProps> = ({
  onTriggerDirectQuestion,
}) => {
  const [enabled, setEnabled] = useState(
    () => db.setting('reminders_enabled', '0') === '1'
  );
  const [hours, setHours] = useState(() => {
    const val = parseInt(db.setting('reminder_hours', '1'), 10);
    return isNaN(val) ? 1 : Math.min(Math.max(val, 1), 24);
  });
  const [status, setStatus] = useState('');

  // Ads personalization preference (default to personalized '1' if not set)
  const [personalizedAds, setPersonalizedAds] = useState(() => {
    const saved = localStorage.getItem('ads_privacy_choice');
    return saved !== '0';
  });
  const [adsStatus, setAdsStatus] = useState('');

  const handleAdsChoice = (personalized: boolean) => {
    setPersonalizedAds(personalized);
    localStorage.setItem('ads_privacy_choice', personalized ? '1' : '0');
    setAdsStatus(
      personalized
        ? 'تم ضبط تفضيلات الإعلانات: إعلانات مخصصة'
        : 'تم ضبط تفضيلات الإعلانات: إعلانات غير مخصصة'
    );
    setTimeout(() => setAdsStatus(''), 3000);
  };

  const handleSave = async () => {
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          db.setSetting('reminders_enabled', '0');
          setEnabled(false);
          setStatus('لم يتم تفعيل التذكيرات لأن إذن الإشعارات غير ممنوح في المتصفح');
          return;
        }
      } catch {
        // Fallback
      }
    }

    db.setSetting('reminders_enabled', enabled ? '1' : '0');
    db.setSetting('reminder_hours', hours.toString());
    setStatus(enabled ? 'تم حفظ التذكير وتفعيله بنجاح' : 'تم إيقاف التذكير');
  };

  const handleTestNotification = () => {
    const randomQ = db.randomQuestion();
    if (!randomQ) {
      setStatus('لا توجد أسئلة جاهزة لإرسال تذكير');
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🎓 سؤال مراجعة الجمارك', {
          body: randomQ.question,
          icon: '/favicon.ico',
        });
      } catch {
        // ignore
      }
    }
    // Also trigger in-app review question
    onTriggerDirectQuestion?.();
  };

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader
        title="الإعدادات والتذكيرات"
        subtitle="تخصيص التذكيرات والخصوصية والإعلانات"
      />

      {/* Ads Personalization Permanent Section */}
      <div className="bg-white rounded-[22px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[14px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#2C2145]">تخصيص الإعلانات والخصوصية</span>
            <span className="text-xs text-gray-500">اختر نوع الإعلانات المناسب لك</span>
          </div>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          يمكنك تحديد ما إذا كنت تفضل إعلانات مخصصة تعتمد على اهتماماتك أو إعلانات عامة غير مخصصة. يمكنك تغيير هذا الخيار في أي وقت.
        </p>

        <div className="grid grid-cols-2 gap-2.5 mt-1">
          <button
            onClick={() => handleAdsChoice(true)}
            className={`py-3 px-3 rounded-[14px] text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
              personalizedAds
                ? 'bg-[#5B3FD6] text-white border-[#5B3FD6] shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-[#5B3FD6]/40'
            }`}
          >
            {personalizedAds && <Check className="w-4 h-4" />}
            <span>إعلانات مخصصة</span>
          </button>

          <button
            onClick={() => handleAdsChoice(false)}
            className={`py-3 px-3 rounded-[14px] text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
              !personalizedAds
                ? 'bg-[#5B3FD6] text-white border-[#5B3FD6] shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-[#5B3FD6]/40'
            }`}
          >
            {!personalizedAds && <Check className="w-4 h-4" />}
            <span>غير مخصصة</span>
          </button>
        </div>

        {adsStatus && (
          <div className="rounded-[12px] p-2.5 text-xs font-medium text-center bg-[#EAF8F0] text-[#16864B] border border-[#C2EED4] animate-in fade-in duration-200">
            {adsStatus}
          </div>
        )}
      </div>

      {/* Main Switch Card */}
      <div className="bg-white rounded-[22px] p-4.5 shadow-xs border border-gray-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[14px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
            <BellRing className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#2C2145]">تذكيرات المراجعة</span>
            <span className="text-xs text-gray-500">سؤال عشوائي من البنك النشط</span>
          </div>
        </div>

        {/* Custom Toggle Switch */}
        <button
          onClick={() => setEnabled(!enabled)}
          className={`w-12 h-6.5 rounded-full transition-colors relative flex items-center px-1 ${
            enabled ? 'bg-[#5B3FD6]' : 'bg-gray-300'
          }`}
          aria-label="تفعيل التذكيرات"
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
              enabled ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Intervals */}
      <div className="flex flex-col gap-2">
        <span className="font-bold text-sm text-[#2C2145]">الفاصل بين التذكيرات</span>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 4, 6].map((h) => {
            const isSelected = hours === h;
            return (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`py-2.5 rounded-[14px] text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#5B3FD6]/40'
                }`}
              >
                {isSelected && <Clock className="w-3.5 h-3.5" />}
                <span>{h === 1 ? 'ساعة' : `${h} س`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-[#F5F3FF] rounded-[18px] p-4 flex items-center gap-3 border border-[#EBE4FC]">
        <Info className="w-5 h-5 text-[#5B3FD6] shrink-0" />
        <p className="text-xs text-[#5B3FD6] leading-relaxed">
          سيصل إليك سؤال مراجعة عند كل فترة تختارها لترسيخ المعلومات. يمكنك إيقاف التذكيرات في أي وقت.
        </p>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full h-14 rounded-[18px] bg-[#5B3FD6] hover:bg-[#4C33B8] text-white font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98 cursor-pointer mt-1"
      >
        <Save className="w-5 h-5" />
        <span>حفظ الإعدادات</span>
      </button>

      {/* Test reminder button */}
      <button
        onClick={handleTestNotification}
        className="w-full py-3 rounded-[16px] border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-98"
      >
        <Send className="w-4 h-4 text-[#5B3FD6]" />
        <span>تجربة سؤال تذكير فوري الآن</span>
      </button>

      {/* Status banner */}
      {status && (
        <div
          className={`rounded-[14px] p-3.5 text-xs font-bold text-center border animate-in fade-in duration-200 ${
            enabled
              ? 'bg-[#EAF8F0] text-[#16864B] border-[#C2EED4]'
              : 'bg-[#FFEEED] text-[#C62828] border-[#FFCDD2]'
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
};
