import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  icon?: LucideIcon;
  symbol?: string;
  label: string;
  value: string | number;
  bgColor: string;
  accentColor: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  symbol,
  label,
  value,
  bgColor,
  accentColor,
  className = '',
}) => {
  return (
    <div
      className={`rounded-[18px] p-3.5 flex flex-col items-center justify-center text-center gap-1 transition-transform active:scale-95 shadow-xs ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {Icon && <Icon className="w-5 h-5" style={{ color: accentColor }} />}
      {symbol && (
        <span className="text-lg font-bold" style={{ color: accentColor }}>
          {symbol}
        </span>
      )}
      <span
        className="text-xl font-bold leading-tight"
        style={{ color: accentColor }}
      >
        {value}
      </span>
      <span className="text-xs text-[#55515F] font-medium">{label}</span>
    </div>
  );
};
