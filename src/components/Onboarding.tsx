import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, GraduationCap, Sparkles, CalendarClock, UserRound } from 'lucide-react';
import { appConfig } from '../config/appConfig';

interface OnboardingProps { onComplete: (name: string) => void; }

const slides = [
  {
    icon: GraduationCap,
    title: `مرحبًا بك في ${appConfig.appName}`,
    text: 'Raje3 يجمع الأسئلة والجلسات والمراجع وخطة المراجعة والإحصائيات في مكان واحد.',
  },
  {
    icon: BookOpen,
    title: 'أسئلة وجلسات في شاشة واحدة',
    text: 'تصفح بنك الأسئلة أو انتقل مباشرة إلى جلسة اختبار، وحدد المحاور وعدد الأسئلة وطريقة المراجعة.',
  },
  {
    icon: Sparkles,
    title: 'مساعد ذكاء اصطناعي',
    text: 'استخدم Gemini للمساعدة في إنشاء البنوك والملخصات واقتراح المصادر، ويمكنك إضافة مصادر وروابطك يدويًا أيضًا.',
  },
  {
    icon: CalendarClock,
    title: 'خطة وتنبيهات للمراجعة',
    text: 'حدد موعد الامتحان ليحسب Raje3 هدفك اليومي، واضبط تنبيه الخطة أو سؤال مراجعة دوري في الوقت الذي تختاره.',
  },
  {
    icon: BarChart3,
    title: 'اعرف مستواك بوضوح',
    text: 'تابع الصحيح والخطأ ونسبة النجاح والنشاط اليومي والأسبوعي والشهري وأضعف المحاور وأكثر الأسئلة خطأ.',
  },
] as const;

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const isNameStep = step === slides.length;
  const cleanName = useMemo(() => name.trim().replace(/\s+/g, ' '), [name]);
  const canFinish = cleanName.length >= 2;

  const next = () => setStep((s) => Math.min(s + 1, slides.length));
  const previous = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="app-shell h-[100dvh] min-h-0 bg-[#F8F9FD] flex justify-center text-[#2C2145] overflow-hidden" dir="rtl">
      <div className="w-full max-w-md h-[100dvh] min-h-0 bg-white flex flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#5B3FD6]">{appConfig.appName}</span>
          <span className="text-xs text-gray-400">{step + 1} / {slides.length + 1}</span>
        </div>

        <div className="flex gap-1.5 mt-4">
          {Array.from({ length: slides.length + 1 }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[#5B3FD6]' : 'bg-[#E9E5F8]'}`} />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center py-4">
          {!isNameStep ? (() => {
            const slide = slides[step];
            const Icon = slide.icon;
            return (
              <div className="flex flex-col items-center text-center gap-5">
                <div className="w-28 h-28 rounded-[32px] bg-gradient-to-br from-[#6841E8] to-[#392080] flex items-center justify-center shadow-lg">
                  <Icon className="w-14 h-14 text-white" />
                </div>
                <div className="flex flex-col gap-3">
                  <h1 className="text-2xl font-bold text-[#2C2145]">{slide.title}</h1>
                  <p className="text-sm text-gray-500 leading-7 max-w-sm">{slide.text}</p>
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-28 h-28 rounded-[32px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6]">
                <UserRound className="w-14 h-14" />
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-[#2C2145]">كيف نناديك؟</h1>
                <p className="text-sm text-gray-500 leading-6">أدخل اسمك للمتابعة. سيُحفظ على هذا الجهاز ويُستخدم لتخصيص الترحيب داخل التطبيق.</p>
              </div>
              <div className="w-full mt-2">
                <label htmlFor="onboarding-name" className="block text-right text-xs font-bold text-[#2C2145] mb-2">اسم المستخدم</label>
                <input
                  id="onboarding-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canFinish) onComplete(cleanName); }}
                  placeholder="مثال: يوسف"
                  autoComplete="name"
                  className="w-full bg-[#F8F9FD] rounded-[16px] py-3.5 px-4 border border-[#E6E2F0] focus:border-[#5B3FD6] focus:outline-hidden text-sm"
                />
                {!canFinish && name.length > 0 && <p className="text-[11px] text-red-500 mt-2 text-right">أدخل اسمًا من حرفين على الأقل.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {step > 0 && (
            <button onClick={previous} className="w-12 h-12 rounded-[15px] border border-[#E6E2F0] bg-white flex items-center justify-center text-gray-600">
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          {!isNameStep ? (
            <button onClick={next} className="flex-1 h-12 rounded-[15px] bg-[#5B3FD6] text-white font-bold text-sm flex items-center justify-center gap-2">
              <span>التالي</span><ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button disabled={!canFinish} onClick={() => onComplete(cleanName)} className="flex-1 h-12 rounded-[15px] bg-[#5B3FD6] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              ابدأ المراجعة
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
