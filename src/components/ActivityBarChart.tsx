import React, { useState } from 'react';
import { BarChart2, Calendar, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { ActivityBucket, QuestionBank } from '../types';

interface ActivityBarChartProps {
  buckets: ActivityBucket[];
  period: 'daily' | 'weekly' | 'monthly';
  onPeriodChange: (p: 'daily' | 'weekly' | 'monthly') => void;
  banks?: QuestionBank[];
  selectedBankId?: string;
  onBankChange?: (bankId: string) => void;
}

export const ActivityBarChart: React.FC<ActivityBarChartProps> = ({
  buckets,
  period,
  onPeriodChange,
  banks = [],
  selectedBankId = 'ALL',
  onBankChange,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const totalPeriodAnswered = buckets.reduce((acc, b) => acc + b.total, 0);
  const totalPeriodCorrect = buckets.reduce((acc, b) => acc + b.correct, 0);
  const totalPeriodWrong = buckets.reduce((acc, b) => acc + b.wrong, 0);
  const successRate = totalPeriodAnswered > 0 ? Math.round((totalPeriodCorrect * 100) / totalPeriodAnswered) : 0;

  // Currently focused bucket (either hovered/clicked, or the latest active one)
  const activeBucket = selectedIdx !== null ? buckets[selectedIdx] : buckets[buckets.length - 1];

  return (
    <div className="bg-white rounded-[24px] p-5 shadow-xs border border-gray-100 flex flex-col gap-4 text-right">
      {/* Header with Title & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#2C2145]">نشاط المراجعة</span>
            <span className="text-xs text-gray-500">
              {period === 'daily' ? 'نشاط آخر 7 أيام' : period === 'weekly' ? 'نشاط آخر 6 أسابيع' : 'نشاط آخر 6 أشهر'}
            </span>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex bg-gray-100/80 p-1 rounded-[14px] self-start sm:self-auto">
          {(
            [
              { key: 'daily', label: 'يومي' },
              { key: 'weekly', label: 'أسبوعي' },
              { key: 'monthly', label: 'شهري' },
            ] as const
          ).map((t) => {
            const isSel = period === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  onPeriodChange(t.key);
                  setSelectedIdx(null);
                }}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer ${
                  isSel
                    ? 'bg-[#5B3FD6] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {banks.length > 1 && onBankChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 shrink-0">البنك:</span>
          <select
            value={selectedBankId}
            onChange={(e) => { onBankChange(e.target.value); setSelectedIdx(null); }}
            className="min-w-0 flex-1 bg-[#F8F9FD] border border-[#E6E2F0] rounded-[12px] px-3 py-2 text-xs font-bold text-[#2C2145] focus:outline-hidden focus:border-[#5B3FD6]"
          >
            <option value="ALL">جميع البنوك</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>{bank.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-3 gap-2 bg-[#F8F9FD] p-3 rounded-[16px] text-center">
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500 font-medium">إجمالي الإجابات</span>
          <span className="font-bold text-base text-[#2C2145]">{totalPeriodAnswered}</span>
        </div>
        <div className="flex flex-col border-x border-gray-200/70">
          <span className="text-[11px] text-gray-500 font-medium">نسبة النجاح</span>
          <span className="font-bold text-base text-[#5B3FD6]">{successRate}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500 font-medium">إجابات صحيحة</span>
          <span className="font-bold text-base text-[#16864B]">{totalPeriodCorrect}</span>
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="pt-4 pb-2 w-full overflow-hidden">
        <div className="w-full overflow-x-auto overscroll-x-contain pb-1" dir="rtl">
          <div className="h-44 flex items-end gap-2 px-1 border-b border-gray-100 pb-2 min-w-max">
          {buckets.map((b, idx) => {
            const heightPercent = maxTotal > 0 && b.total > 0 ? Math.max((b.total / maxTotal) * 100, 10) : 4;
            const correctPercent = b.total > 0 ? (b.correct / b.total) * 100 : 0;
            const isSelected = selectedIdx === idx || (selectedIdx === null && idx === buckets.length - 1);

            return (
              <div
                key={idx}
                onClick={() => setSelectedIdx(idx)}
                className="w-[46px] min-w-[46px] flex flex-col items-center gap-1.5 h-full justify-end cursor-pointer group"
              >
                {/* Total count bubble on top of bar */}
                <span
                  className={`text-[10px] font-bold transition-all ${
                    isSelected
                      ? 'text-[#5B3FD6] scale-110'
                      : b.total > 0
                      ? 'text-gray-500 group-hover:text-gray-900'
                      : 'text-gray-300'
                  }`}
                >
                  {b.total}
                </span>

                {/* Stacked Vertical Bar */}
                <div
                  className={`w-full max-w-[28px] rounded-t-[8px] overflow-hidden flex flex-col-reverse transition-all duration-300 ${
                    b.total === 0 ? 'bg-gray-100 min-h-[6px]' : 'shadow-xs'
                  } ${
                    isSelected
                      ? 'ring-2 ring-[#5B3FD6] ring-offset-1'
                      : 'group-hover:opacity-90'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                >
                  {/* Correct Answers (Green/Purple gradient) */}
                  <div
                    className="bg-[#5B3FD6] w-full transition-all"
                    style={{ height: `${correctPercent}%` }}
                  />
                  {/* Wrong Answers (Red / Soft Pink) */}
                  <div
                    className="bg-[#F87171] w-full transition-all flex-1"
                  />
                </div>

                {/* Label & Date */}
                <div className="flex flex-col items-center mt-1">
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap leading-none transition-colors ${
                      isSelected ? 'text-[#5B3FD6]' : 'text-gray-700'
                    }`}
                  >
                    {b.label}
                  </span>
                  {b.subLabel && (
                    <span className="text-[9px] text-gray-400 font-medium mt-0.5 whitespace-nowrap">
                      {b.subLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Details Box for Focused Column */}
      {activeBucket && (
        <div className="bg-[#FAF9FE] border border-[#EBE4FC] p-3 rounded-[16px] flex items-center justify-between text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#5B3FD6]" />
            <span className="font-bold text-[#2C2145]">
              {activeBucket.label} {activeBucket.subLabel ? `(${activeBucket.subLabel})` : ''}:
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[#16864B]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="font-bold">{activeBucket.correct} صحيحة</span>
            </div>
            <div className="flex items-center gap-1 text-[#C62828]">
              <XCircle className="w-3.5 h-3.5" />
              <span className="font-bold">{activeBucket.wrong} خاطئة</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
