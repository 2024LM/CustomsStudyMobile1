import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { RatingPromptConfig } from '../types';

interface RatingPromptProps {
  config: RatingPromptConfig;
  onDismiss: () => void;
  onRated: (stars: number) => void;
}

export const RatingPrompt: React.FC<RatingPromptProps> = ({ config, onDismiss, onRated }) => {
  const [stars, setStars] = useState(0);
  return (
    <div className="fixed inset-0 z-[110] bg-black/55 flex items-center justify-center p-5" dir="rtl" role="dialog" aria-modal="true" aria-label="تقييم التطبيق">
      <div className="w-full max-w-sm bg-white rounded-[24px] p-5 shadow-2xl text-center">
        <div className="flex justify-end"><button onClick={onDismiss} aria-label="لاحقًا" className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
        <div className="text-4xl mb-2">⭐</div>
        <h2 className="text-lg font-bold text-[#2C2145]">{config.title}</h2>
        <p className="text-sm text-gray-500 leading-6 mt-2">{config.message}</p>
        <div className="flex justify-center gap-2 my-5" dir="ltr">
          {[1,2,3,4,5].map((n) => <button key={n} onClick={() => setStars(n)} aria-label={`${n} نجوم`} className="p-1"><Star className={`w-9 h-9 ${n <= stars ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}/></button>)}
        </div>
        <button disabled={stars===0} onClick={() => onRated(stars)} className="w-full h-12 rounded-[15px] bg-[#5B3FD6] text-white font-bold text-sm disabled:opacity-40">قيّم التطبيق</button>
        <button onClick={onDismiss} className="mt-3 text-xs font-bold text-gray-400 px-4 py-2">ربما لاحقًا</button>
      </div>
    </div>
  );
};
