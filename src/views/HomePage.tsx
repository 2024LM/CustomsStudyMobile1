import React, { useState } from 'react';
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  AlertCircle,
  FolderOpen,
  ChevronLeft,
  Bell,
  Moon,
  Sun,
} from 'lucide-react';
import { db } from '../services/db';
import { CircularProgress } from '../components/CircularProgress';
import { MetricCard } from '../components/MetricCard';
import { ActivityBarChart } from '../components/ActivityBarChart';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';

interface HomePageProps {
  onStartSession: (topic?: string) => void;
  onViewQuestions: () => void;
  onViewMistakes: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  username?: string;
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartSession,
  onViewQuestions,
  onViewMistakes,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  darkMode = false,
  onToggleDarkMode,
  username = '',
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [activityBankId, setActivityBankId] = useState<string>('ALL');
  const bank = db.activeBank();
  const total = db.questionCount();
  const qcm = db.qcmReadyCount();
  const stats = db.stats();
  const rate = Math.min(Math.max(stats.successRate, 0), 100);
  const topics = db.topics().slice(0, 8);
  const banks = db.banks();
  const activityBuckets = db.getActivityStats(period, activityBankId === 'ALL' ? null : activityBankId);

  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      {/* Hero Banner Card */}
      <div className="w-full bg-gradient-to-l from-[#392080] to-[#6841E8] rounded-[28px] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white">الرئيسية</h2>
            <div className="flex items-center gap-2">
              {onToggleDarkMode && (
                <button
                  onClick={onToggleDarkMode}
                  title={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
                  aria-label={darkMode ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
                  className="w-11 h-11 rounded-[14px] bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
              )}

              {/* Notifications Button */}
              {onOpenNotifications && (
                <button
                  onClick={onOpenNotifications}
                  title="الإشعارات والتحديثات"
                  className="relative w-11 h-11 rounded-[14px] bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#E11D48] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#392080] animate-pulse">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              )}

              <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
          <div className="h-2" />
          <h1 className="text-2xl font-bold">مرحباً {username || 'بك'} 👋</h1>
          <p className="text-[#E6DFFF] text-sm font-semibold">{bank.name}</p>
          <p className="text-[#D8CDFB] text-xs">كل خطوة صغيرة تقرّبك من هدفك</p>
        </div>
      </div>

      {/* General Progress Card */}
      <div className="bg-white rounded-[24px] p-5 shadow-xs border border-gray-100 flex items-center gap-4.5">
        <CircularProgress
          percentage={rate}
          size={86}
          strokeWidth={9}
          color="#5B3FD6"
          trackColor="#E9E5F8"
        />
        <div className="flex-1 flex flex-col gap-2">
          <h3 className="font-bold text-base text-[#2C2145]">تقدمك العام</h3>
          <p className="text-xs text-gray-500 font-medium">
            {stats.answered} إجابة حتى الآن
          </p>
          {/* Linear Progress Bar */}
          <div className="w-full bg-[#EAE6FA] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#5B3FD6] h-full rounded-full transition-all duration-500"
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <MetricCard
          icon={CheckCircle2}
          label="صحيحة"
          value={stats.correct}
          bgColor="#EAF8F0"
          accentColor="#16864B"
        />
        <MetricCard
          icon={XCircle}
          label="أخطاء"
          value={stats.wrong}
          bgColor="#FFEEED"
          accentColor="#C62828"
        />
        <MetricCard
          icon={HelpCircle}
          label="الأسئلة"
          value={total}
          bgColor="#F0EDFF"
          accentColor="#5B3FD6"
        />
      </div>

      {/* Activity Statistics Bar Chart (Daily / Weekly / Monthly) */}
      <ActivityBarChart
        buckets={activityBuckets}
        period={period}
        onPeriodChange={setPeriod}
        banks={banks}
        selectedBankId={activityBankId}
        onBankChange={setActivityBankId}
      />

      {/* Banner directly below activity statistics */}
      <ReferenceBannerAd slot="home-below-stats" />

      {/* Start Session Primary CTA */}
      <button
        onClick={() => onStartSession()}
        disabled={qcm === 0}
        className={`w-full h-14 rounded-[18px] font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98 ${
          qcm > 0
            ? 'bg-[#5B3FD6] hover:bg-[#4C33B8] text-white cursor-pointer'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <span>{qcm > 0 ? 'ابدأ جلسة مراجعة' : 'لا توجد أسئلة QCM جاهزة'}</span>
        {qcm > 0 && <span>▶</span>}
      </button>

      {/* Quick Access */}
      <div className="flex flex-col gap-2.5 mt-1">
        <h3 className="font-bold text-base text-[#2C2145]">وصول سريع</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onViewQuestions}
            className="bg-white rounded-[18px] p-4 text-right border border-gray-100/80 shadow-xs hover:border-[#5B3FD6]/30 transition-all flex flex-col gap-1.5 active:scale-98"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6]">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-[#2C2145] mt-1">
              جميع الأسئلة
            </span>
            <span className="text-xs text-gray-500 font-medium">{qcm} جاهز</span>
          </button>

          <button
            onClick={onViewMistakes}
            className="bg-white rounded-[18px] p-4 text-right border border-gray-100/80 shadow-xs hover:border-[#C62828]/30 transition-all flex flex-col gap-1.5 active:scale-98"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#FFEEED] flex items-center justify-center text-[#C62828]">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-[#2C2145] mt-1">
              مراجعة الأخطاء
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {stats.wrong} خطأ
            </span>
          </button>
        </div>
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="flex flex-col gap-2.5 mt-1">
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
                  <span className="font-semibold text-sm text-[#2C2145]">
                    {topic}
                  </span>
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
