import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle,
  LineChart,
  XCircle,
} from 'lucide-react';
import { ActivityBucket, QuestionBank } from '../types';

interface ActivityBarChartProps {
  buckets: ActivityBucket[];
  period: 'daily' | 'weekly' | 'monthly';
  onPeriodChange: (p: 'daily' | 'weekly' | 'monthly') => void;
  banks?: QuestionBank[];
  selectedBankId?: string;
  onBankChange?: (bankId: string) => void;
}

type ChartMode = 'bars' | 'lines';
type LineSeries = 'total' | 'correct' | 'wrong';

const SERIES_META: Record<LineSeries, { label: string; stroke: string; fill: string }> = {
  total: { label: 'الإجابات', stroke: '#5B3FD6', fill: 'rgba(91,63,214,0.14)' },
  correct: { label: 'الصحيحة', stroke: '#16A34A', fill: 'rgba(22,163,74,0.12)' },
  wrong: { label: 'الخاطئة', stroke: '#EF4444', fill: 'rgba(239,68,68,0.10)' },
};

export const ActivityBarChart: React.FC<ActivityBarChartProps> = ({
  buckets,
  period,
  onPeriodChange,
  banks = [],
  selectedBankId = 'ALL',
  onBankChange,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>('bars');
  const [visibleSeries, setVisibleSeries] = useState<Record<LineSeries, boolean>>({ total: true, correct: true, wrong: true });

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const totalPeriodAnswered = buckets.reduce((acc, b) => acc + b.total, 0);
  const totalPeriodCorrect = buckets.reduce((acc, b) => acc + b.correct, 0);
  const successRate = totalPeriodAnswered > 0
    ? Math.round((totalPeriodCorrect * 100) / totalPeriodAnswered)
    : 0;

  const activeBucket = selectedIdx !== null
    ? buckets[selectedIdx]
    : buckets[buckets.length - 1];

  const lineGeometry = useMemo(() => {
    const width = 640;
    const height = 220;
    const left = 24;
    const right = 18;
    const top = 18;
    const bottom = 34;
    const innerW = width - left - right;
    const innerH = height - top - bottom;
    const maxY = Math.max(
      1,
      ...buckets.flatMap((b) => [b.total, b.correct, b.wrong])
    );

    const xFor = (index: number) => {
      if (buckets.length <= 1) return left + innerW / 2;
      return left + (index / (buckets.length - 1)) * innerW;
    };
    const yFor = (value: number) => top + innerH - (value / maxY) * innerH;

    const series = (key: LineSeries) => {
      const points = buckets.map((bucket, index) => ({
        x: xFor(index),
        y: yFor(bucket[key]),
        value: bucket[key],
      }));
      const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
      const area = points.length
        ? `${left},${top + innerH} ${polyline} ${left + innerW},${top + innerH}`
        : '';
      return { points, polyline, area };
    };

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      innerW,
      innerH,
      total: series('total'),
      correct: series('correct'),
      wrong: series('wrong'),
    };
  }, [buckets]);

  return (
    <div className="bg-white rounded-[26px] p-5 shadow-xs border border-gray-100 flex flex-col gap-4 text-right">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
            {chartMode === 'bars' ? <BarChart3 className="w-5 h-5" /> : <LineChart className="w-5 h-5" />}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#2C2145]">نشاط المراجعة</span>
            <span className="text-xs text-gray-500">
              {period === 'daily' ? 'نشاط آخر 7 أيام' : period === 'weekly' ? 'نشاط آخر 6 أسابيع' : 'نشاط آخر 6 أشهر'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex bg-[#F4F2FA] p-1 rounded-[13px]">
            <button
              onClick={() => setChartMode('bars')}
              className={`w-9 h-8 rounded-[9px] flex items-center justify-center transition-all ${
                chartMode === 'bars' ? 'bg-white text-[#5B3FD6] shadow-xs' : 'text-gray-400'
              }`}
              aria-label="عرض الأعمدة"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartMode('lines')}
              className={`w-9 h-8 rounded-[9px] flex items-center justify-center transition-all ${
                chartMode === 'lines' ? 'bg-white text-[#5B3FD6] shadow-xs' : 'text-gray-400'
              }`}
              aria-label="عرض الخطوط"
            >
              <LineChart className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-gray-100/80 p-1 rounded-[14px]">
            {([
              { key: 'daily', label: 'يومي' },
              { key: 'weekly', label: 'أسبوعي' },
              { key: 'monthly', label: 'شهري' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  onPeriodChange(t.key);
                  setSelectedIdx(null);
                }}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all ${
                  period === t.key
                    ? 'bg-[#5B3FD6] text-white shadow-xs'
                    : 'text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {banks.length > 1 && onBankChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 shrink-0">البنك:</span>
          <select
            value={selectedBankId}
            onChange={(e) => {
              onBankChange(e.target.value);
              setSelectedIdx(null);
            }}
            className="min-w-0 flex-1 bg-[#F8F9FD] border border-[#E6E2F0] rounded-[12px] px-3 py-2 text-xs font-bold text-[#2C2145] focus:outline-hidden focus:border-[#5B3FD6]"
          >
            <option value="ALL">جميع البنوك</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>{bank.name}</option>
            ))}
          </select>
        </div>
      )}

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

      {chartMode === 'bars' ? (
        <div className="pt-2 pb-1 w-full overflow-hidden">
          <div className="w-full overflow-x-auto overscroll-x-contain pb-1" dir="rtl">
            <div className="h-48 flex items-end gap-3 px-2 pb-2 min-w-max">
              {buckets.map((b, idx) => {
                const heightPercent = maxTotal > 0 && b.total > 0
                  ? Math.max((b.total / maxTotal) * 100, 12)
                  : 5;
                const correctPercent = b.total > 0 ? (b.correct / b.total) * 100 : 0;
                const isSelected = selectedIdx === idx || (selectedIdx === null && idx === buckets.length - 1);

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedIdx(idx)}
                    className="w-[52px] min-w-[52px] flex flex-col items-center gap-2 h-full justify-end group"
                  >
                    <span className={`text-[10px] font-bold transition-all ${
                      isSelected ? 'text-[#5B3FD6] translate-y-0' : 'text-gray-400'
                    }`}>
                      {b.total}
                    </span>

                    <div className="relative h-[124px] w-8 flex items-end justify-center">
                      <div className="absolute inset-x-1 bottom-0 top-0 rounded-full bg-[#F2F0F8]" />
                      <div
                        className={`relative w-6 rounded-full overflow-hidden flex flex-col-reverse transition-all duration-300 ${
                          isSelected
                            ? 'shadow-[0_8px_22px_rgba(91,63,214,0.22)] scale-[1.04]'
                            : 'opacity-90 group-hover:opacity-100'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      >
                        <div
                          className="bg-gradient-to-t from-[#4C33B8] to-[#7558E8] w-full transition-all duration-300"
                          style={{ height: `${correctPercent}%` }}
                        />
                        <div className="bg-gradient-to-t from-[#EF6464] to-[#F79A9A] w-full flex-1 transition-all duration-300" />
                      </div>
                      {isSelected && (
                        <span className="absolute -bottom-2 w-1.5 h-1.5 rounded-full bg-[#5B3FD6]" />
                      )}
                    </div>

                    <div className="flex flex-col items-center mt-1">
                      <span className={`text-[11px] font-bold whitespace-nowrap ${
                        isSelected ? 'text-[#5B3FD6]' : 'text-gray-700'
                      }`}>
                        {b.label}
                      </span>
                      {b.subLabel && (
                        <span className="text-[9px] text-gray-400 font-medium mt-0.5 whitespace-nowrap">
                          {b.subLabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto">
            {(Object.keys(SERIES_META) as LineSeries[]).map((series) => {
              const meta = SERIES_META[series];
              const enabled = visibleSeries[series];
              return (
                <button
                  key={series}
                  onClick={() => {
                    const nextEnabled = !enabled;
                    const enabledCount = Object.values(visibleSeries).filter(Boolean).length;
                    if (!nextEnabled && enabledCount === 1) return;
                    setVisibleSeries((current) => ({ ...current, [series]: nextEnabled }));
                  }}
                  className={`shrink-0 px-3 py-2 rounded-[11px] text-[11px] font-bold border transition-all flex items-center gap-2 ${
                    enabled
                      ? 'bg-white text-[#2C2145] border-gray-200 shadow-xs'
                      : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: meta.stroke }}
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full overflow-hidden rounded-[18px] bg-gradient-to-b from-[#FCFBFF] to-white border border-gray-100">
            <svg
              viewBox={`0 0 ${lineGeometry.width} ${lineGeometry.height}`}
              className="w-full h-[230px]"
              preserveAspectRatio="none"
              onMouseLeave={() => setSelectedIdx(null)}
            >
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1={lineGeometry.left}
                  x2={lineGeometry.width - lineGeometry.right}
                  y1={lineGeometry.top + lineGeometry.innerH * p}
                  y2={lineGeometry.top + lineGeometry.innerH * p}
                  stroke="#EEEAF7"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              ))}

              {(Object.keys(SERIES_META) as LineSeries[]).map((series) => {
                if (!visibleSeries[series]) return null;
                const meta = SERIES_META[series];
                const geo = lineGeometry[series];
                return (
                  <g key={series}>
                    {geo.area && (
                      <polygon points={geo.area} fill={meta.fill} />
                    )}
                    <polyline
                      points={geo.polyline}
                      fill="none"
                      stroke={meta.stroke}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {geo.points.map((point, index) => {
                      const bucket = buckets[index];
                      const isPointSelected = selectedIdx === index;
                      return (
                        <g key={index}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={isPointSelected ? 5.5 : 3.5}
                            fill="#fff"
                            stroke={meta.stroke}
                            strokeWidth="2.5"
                          />
                          <rect
                            x={point.x - 18}
                            y={lineGeometry.top}
                            width="36"
                            height={lineGeometry.innerH}
                            fill="transparent"
                            onMouseEnter={() => setSelectedIdx(index)}
                            onClick={() => setSelectedIdx(index)}
                          />
                          {isPointSelected && (
                            <>
                              <line
                                x1={point.x}
                                x2={point.x}
                                y1={lineGeometry.top}
                                y2={lineGeometry.top + lineGeometry.innerH}
                                stroke={meta.stroke}
                                strokeOpacity="0.14"
                                strokeWidth="2"
                              />
                              <rect
                                x={Math.max(6, Math.min(point.x - 30, lineGeometry.width - 66))}
                                y={Math.max(8, point.y - 34)}
                                width="60"
                                height="24"
                                rx="10"
                                fill={meta.stroke}
                              />
                              <text
                                x={Math.max(36, Math.min(point.x, lineGeometry.width - 36))}
                                y={Math.max(24, point.y - 18)}
                                textAnchor="middle"
                                fontSize="11"
                                fontWeight="700"
                                fill="#fff"
                              >
                                {point.value}
                              </text>
                            </>
                          )}
                          <text
                            x={point.x}
                            y={lineGeometry.height - 12}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight={index === selectedIdx ? '700' : '500'}
                            fill={index === selectedIdx ? '#5B3FD6' : '#8B849D'}
                          >
                            {bucket.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {activeBucket && (
        <div className="bg-[#FAF9FE] border border-[#EBE4FC] p-3 rounded-[16px] flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#5B3FD6]" />
            <span className="font-bold text-[#2C2145]">
              {activeBucket.label} {activeBucket.subLabel ? `(${activeBucket.subLabel})` : ''}
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
