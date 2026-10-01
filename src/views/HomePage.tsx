import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Flame,
  FolderOpen,
  GraduationCap,
  Moon,
  Monitor,
  RotateCcw,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { HomeNewsPreview } from '../features/news/components/HomeNewsPreview';
import { db } from '../services/db';
import { ActivityBarChart } from '../components/ActivityBarChart';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';
import { focusMinutesToday } from '../services/advancedStudyTools';

interface HomePageProps {
  dataVersion: number;
  onStartSession: (topic?: string | string[], count?: number, mode?: 'classic' | 'review' | 'mistakes' | 'favorites' | 'smart', autoStart?: boolean) => void;
  onViewQuestions: () => void;
  onViewMistakes: () => void;
  onOpenNews?: (articleId?: string) => void;
  onOpenNotifications?: () => void;
  onOpenStudyCenter?: () => void;
  unreadNotificationsCount?: number;
  darkMode?: boolean;
  themeMode?: 'system' | 'light' | 'dark';
  onCycleTheme?: () => void;
  username?: string;
}

function rateLabel(rate: number): string {
  if (rate >= 80) return 'مستوى قوي';
  if (rate >= 60) return 'مستوى متوسط';
  if (rate > 0) return 'يحتاج مراجعة';
  return 'ابدأ المراجعة';
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartSession,
  onViewQuestions,
  onViewMistakes,
  onOpenNews,
  onOpenNotifications,
  onOpenStudyCenter,
  unreadNotificationsCount = 0,
  darkMode = false,
  themeMode = 'system',
  onCycleTheme,
  username = '',
  dataVersion,
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [statsBankId, setStatsBankId] = useState<string>('ALL');
  const bank = db.activeBank();
  const banks = db.banks();

  const selectedBankId = statsBankId === 'ALL' ? null : statsBankId;
  const analytics = useMemo(
    () => db.dashboardAnalytics(selectedBankId),
    [selectedBankId, dataVersion]
  );

  const activityBuckets = db.getActivityStats(period, selectedBankId);
  const streak = db.studyStreak();
  const focusToday = focusMinutesToday();
  const topics = db.topics().slice(0, 8);
  const weeklyDelta = analytics.weeklyDelta;
  const smartPlan = db.smartSessionPlan(20);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-8 text-right">
      <div data-tour="home-hero" className="sm:col-span-2 -mx-4 -mt-4 px-6 pt-6 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white">الرئيسية</h2>
            <div className="flex items-center gap-2">
              {onCycleTheme && (
                <button
                  onClick={onCycleTheme}
                  title={themeMode === 'system' ? 'المظهر: حسب الهاتف' : themeMode === 'light' ? 'المظهر: نهاري' : 'المظهر: ليلي'}
                  aria-label={themeMode === 'system' ? 'المظهر يتبع إعداد الهاتف' : themeMode === 'light' ? 'الوضع النهاري' : 'الوضع الليلي'}
                  className="w-11 h-11 rounded-[14px] bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  {themeMode === 'system'
                    ? <Monitor className="w-5 h-5" />
                    : darkMode
                      ? <Moon className="w-5 h-5" />
                      : <Sun className="w-5 h-5" />}
                </button>
              )}

              {onOpenNotifications && (
                <button
                  onClick={onOpenNotifications}
                  title="الإشعارات والتحديثات"
                  className="relative w-11 h-11 rounded-[14px] bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#E11D48] text-white text-[12px] font-bold rounded-full flex items-center justify-center border-2 border-[#392080]">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              )}

              {onOpenStudyCenter && (
                <button
                  onClick={onOpenStudyCenter}
                  title="مركز الدراسة"
                  aria-label="فتح مركز الدراسة"
                  className="w-11 h-11 rounded-[14px] bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  <GraduationCap className="w-6 h-6 text-white" />
                </button>
              )}
            </div>
          </div>

          <div className="h-2" />
          <h1 className="text-2xl font-bold">مرحباً {username || 'بك'} 👋</h1>
          <p className="text-[#E6DFFF] text-sm font-semibold">{bank.name}</p>
          <p className="text-[#D8CDFB] text-xs">تابع تقدمك وحدد أولويتك التالية بسرعة</p>
        </div>
      </div>

      {onOpenNews && <HomeNewsPreview onOpenNews={onOpenNews} />}

      <div className="sm:col-span-2 bg-white rounded-[20px] p-3 border border-gray-100">
        <label className="text-[12px] font-bold text-gray-500">إحصائيات</label>
        <select
          value={statsBankId}
          onChange={(e) => setStatsBankId(e.target.value)}
          className="w-full mt-2 rounded-[12px] bg-[#F8F9FD] border border-gray-100 p-3 text-sm font-semibold"
        >
          <option value="ALL">كل بنوك المجال</option>
          {banks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>

      <div data-tour="home-progress" className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-gray-400">نسبة النجاح</div>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-4xl font-black text-[#2C2145]">{analytics.stats.successRate}%</span>
              <span className="text-xs font-bold text-[#5B3FD6] mb-1">{rateLabel(analytics.stats.successRate)}</span>
            </div>
            <div className="text-[12px] text-gray-400 mt-1">{analytics.stats.answered} إجابة مسجلة</div>
          </div>

          <div className={`px-3 py-2 rounded-[12px] text-xs font-bold flex items-center gap-1.5 ${
            weeklyDelta > 0
              ? 'bg-emerald-50 text-emerald-700'
              : weeklyDelta < 0
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-500'
          }`}>
            {weeklyDelta > 0 ? <TrendingUp className="w-4 h-4" /> : weeklyDelta < 0 ? <TrendingDown className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
            {weeklyDelta > 0 ? '+' : ''}{weeklyDelta}%
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-[14px] bg-[#F8F9FD] p-3">
            <div className="text-[12px] text-gray-400">هذا الأسبوع</div>
            <div className="font-bold text-lg">{analytics.currentWeek.rate}%</div>
            <div className="text-[12px] text-gray-400">{analytics.currentWeek.total} إجابة</div>
          </div>
          <div className="rounded-[14px] bg-[#F8F9FD] p-3">
            <div className="text-[12px] text-gray-400">الأسبوع السابق</div>
            <div className="font-bold text-lg">{analytics.previousWeek.rate}%</div>
            <div className="text-[12px] text-gray-400">{analytics.previousWeek.total} إجابة</div>
          </div>
        </div>
      </div>

      <div className="sm:col-span-2 grid grid-cols-4 gap-2">
        {[
          { icon: CheckCircle2, label: 'صحيح', value: analytics.stats.correct, className: 'bg-emerald-50 text-emerald-700' },
          { icon: XCircle, label: 'خطأ', value: analytics.stats.wrong, className: 'bg-red-50 text-red-600' },
          { icon: Target, label: 'مستحق', value: analytics.dueReview, className: 'bg-amber-50 text-amber-700' },
          { icon: BookOpen, label: 'جديد', value: analytics.unseen, className: 'bg-[#F5F3FF] text-[#5B3FD6]' },
        ].map(({ icon: Icon, label, value, className }) => (
          <div key={label} className={`rounded-[16px] p-3 text-center ${className}`}>
            <Icon className="w-4 h-4 mx-auto mb-1" />
            <div className="text-lg font-black">{value}</div>
            <div className="text-[12px] font-bold">{label}</div>
          </div>
        ))}
      </div>

      <div className="sm:col-span-2 bg-gradient-to-l from-[#2F1A73] to-[#5B3FD6] rounded-[22px] p-4 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] text-[#DDD5FF] font-bold">المراجعة المقترحة الآن</div>
            <h3 className="text-base font-black mt-1">ماذا أراجع الآن؟</h3>
            <p className="text-[12px] text-[#E7E1FF] mt-1 leading-5">
              جلسة ذكية من {smartPlan.questions.length} سؤال حسب أخطائك ومواعيد المراجعة والأسئلة الجديدة.
            </p>
          </div>
          <Target className="w-7 h-7 text-white shrink-0" />
        </div>

        <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
          <div className="rounded-[10px] bg-white/10 p-2">
            <div className="text-base font-black">{smartPlan.mistakes}</div>
            <div className="text-[12px] text-[#E7E1FF]">أخطاء</div>
          </div>
          <div className="rounded-[10px] bg-white/10 p-2">
            <div className="text-base font-black">{smartPlan.due}</div>
            <div className="text-[12px] text-[#E7E1FF]">مستحقة</div>
          </div>
          <div className="rounded-[10px] bg-white/10 p-2">
            <div className="text-base font-black">{smartPlan.unseen}</div>
            <div className="text-[12px] text-[#E7E1FF]">جديدة</div>
          </div>
          <div className="rounded-[10px] bg-white/10 p-2">
            <div className="text-base font-black">{smartPlan.other}</div>
            <div className="text-[12px] text-[#E7E1FF]">تعزيز</div>
          </div>
        </div>

        <button
          onClick={() => onStartSession(undefined, Math.max(smartPlan.questions.length, 1), 'smart', true)}
          disabled={smartPlan.questions.length === 0}
          className="w-full mt-3 py-3 rounded-[13px] bg-white text-[#4C33B8] text-sm font-black disabled:opacity-50"
        >
          ابدأ الجلسة الذكية الآن
        </button>
      </div>

      <div data-tour="home-activity" className="sm:col-span-2">
        <ActivityBarChart
          buckets={activityBuckets}
          period={period}
          onPeriodChange={setPeriod}
          banks={banks}
          selectedBankId={statsBankId}
          onBankChange={setStatsBankId}
        />
      </div>

      <div className="bg-white rounded-[20px] p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">نشاط آخر 28 يومًا</h3>
          <div className="flex items-center gap-1 text-[12px] text-gray-400">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            {streak} يوم متتالٍ
          </div>
        </div>
        <div className="grid grid-cols-14 gap-1">
          {analytics.heatmap.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.total}`}
              className={`aspect-square rounded-[4px] ${
                day.total === 0 ? 'bg-gray-100' : day.total < 5 ? 'bg-[#DDD5FF]' : day.total < 15 ? 'bg-[#A58EF4]' : 'bg-[#5B3FD6]'
              }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-[12px] bg-[#F8F9FD] p-3">
            <div className="text-[12px] text-gray-400">وقت التركيز اليوم</div>
            <div className="font-bold text-base">{focusToday} دقيقة</div>
          </div>
          <div className="rounded-[12px] bg-[#F8F9FD] p-3">
            <div className="text-[12px] text-gray-400">أسئلة جاهزة</div>
            <div className="font-bold text-base">{analytics.playableQuestions} / {analytics.totalQuestions}</div>
          </div>
        </div>
      </div>

      {analytics.weakTopics.length > 0 && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100">
          <h3 className="font-bold text-sm mb-3">أضعف المحاور</h3>
          <div className="flex flex-col gap-2">
            {analytics.weakTopics.map((item) => (
              <button
                key={item.topic}
                onClick={() => onStartSession(item.topic)}
                className="w-full rounded-[13px] bg-[#F8F9FD] p-3 text-right flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{item.topic}</div>
                  <div className="text-[12px] text-gray-400 mt-1">{item.wrong} خطأ من {item.attempts} محاولة</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-red-500">{item.successRate}%</div>
                  <div className="text-[12px] text-[#5B3FD6]">راجع الآن</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {analytics.strongTopics.length > 0 && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100">
          <h3 className="font-bold text-sm mb-3">أقوى المحاور</h3>
          <div className="flex flex-col gap-2">
            {analytics.strongTopics.slice(0, 3).map((item) => (
              <div key={item.topic} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{item.topic}</div>
                  <div className="text-[12px] text-gray-400">{item.attempts} محاولة</div>
                </div>
                <div className="text-emerald-600 font-bold text-sm">{item.successRate}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.topMistakes.length > 0 && (
        <div className="bg-white rounded-[20px] p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">أكثر الأسئلة خطأ</h3>
            <button onClick={onViewMistakes} className="text-[12px] font-bold text-[#5B3FD6]">عرض الكل</button>
          </div>
          <div className="flex flex-col gap-2">
            {analytics.topMistakes.map((item) => (
              <div key={item.question.rowId} className="rounded-[13px] bg-red-50/50 p-3">
                <div className="text-xs font-bold leading-5">{item.question.question}</div>
                <div className="text-[12px] text-red-500 mt-1">{item.wrongCount} مرات خطأ</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ReferenceBannerAd slot="home-below-stats" className="sm:col-span-2" />

      <button
        data-tour="home-start-session"
        
        onClick={() => onStartSession()}
        disabled={analytics.playableQuestions === 0}
        className={`sm:col-span-2 w-full h-14 rounded-[18px] font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98 ${
          analytics.playableQuestions > 0
            ? 'bg-[#5B3FD6] hover:bg-[#4C33B8] text-white cursor-pointer'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <span>{analytics.playableQuestions > 0 ? 'ابدأ جلسة مراجعة' : 'لا توجد أسئلة تفاعلية جاهزة'}</span>
        {analytics.playableQuestions > 0 && <span>▶</span>}
      </button>

      <div className="sm:col-span-2 flex flex-col gap-2.5 mt-1">
        <h3 className="font-bold text-base text-[#2C2145]">وصول سريع</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onViewQuestions}
            className="bg-white rounded-[18px] p-4 text-right border border-gray-100/80 shadow-xs hover:border-[#5B3FD6]/30 transition-all flex flex-col gap-1.5 active:scale-98"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6]">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-[#2C2145] mt-1">جميع الأسئلة</span>
            <span className="text-xs text-gray-500 font-medium">{analytics.playableQuestions} جاهز</span>
          </button>

          <button
            onClick={onViewMistakes}
            className="bg-white rounded-[18px] p-4 text-right border border-gray-100/80 shadow-xs hover:border-[#C62828]/30 transition-all flex flex-col gap-1.5 active:scale-98"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#FFEEED] flex items-center justify-center text-[#C62828]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-[#2C2145] mt-1">مراجعة الأخطاء</span>
            <span className="text-xs text-gray-500 font-medium">{analytics.stats.wrong} خطأ</span>
          </button>
        </div>
      </div>

      {topics.length > 0 && (
        <div className="sm:col-span-2 flex flex-col gap-2.5 mt-1">
          <h3 className="font-bold text-base text-[#2C2145]">المحاور</h3>
          <div className="flex flex-col gap-2">
            {topics.map((topic, i) => (
              <button
                key={i}
                onClick={() => onStartSession(topic)}
                className="w-full bg-white rounded-[18px] p-3.5 px-4 text-right border border-gray-100/80 shadow-xs hover:border-[#5B3FD6]/40 transition-all flex items-center justify-between gap-3 active:scale-98 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
                    <FolderOpen className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-semibold text-sm text-[#2C2145]">{topic}</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
