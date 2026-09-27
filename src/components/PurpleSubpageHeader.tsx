import React from 'react';
import { ArrowRight } from 'lucide-react';

interface PurpleSubpageHeaderProps {
  title: string;
  subtitle: string;
  onBack: () => void;
}

export const PurpleSubpageHeader: React.FC<PurpleSubpageHeaderProps> = ({
  title,
  subtitle,
  onBack,
}) => (
  <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
    <div className="flex items-center gap-3">
      <button
        onClick={onBack}
        aria-label="العودة"
        className="w-10 h-10 rounded-[13px] bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 active:scale-95 transition-all"
      >
        <ArrowRight className="w-5 h-5" />
      </button>
      <div className="min-w-0">
        <h1 className="font-bold text-lg truncate">{title}</h1>
        <p className="text-xs text-[#DDD5FF] mt-0.5 leading-5">{subtitle}</p>
      </div>
    </div>
  </div>
);
