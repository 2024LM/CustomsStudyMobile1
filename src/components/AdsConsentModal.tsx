import React, { useState, useEffect } from 'react';

export const AdsConsentModal: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('ads_privacy_choice');
    if (saved === null) {
      setOpen(true);
    }
  }, []);

  const handleChoice = (personalized: boolean) => {
    localStorage.setItem('ads_privacy_choice', personalized ? '1' : '0');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] max-w-sm w-full p-6 shadow-xl border border-gray-100 flex flex-col gap-4 text-right">
        <h2 className="text-xl font-bold text-[#2C2145]">إعدادات الإعلانات</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          اختر نوع الإعلانات. يمكنك استخدام إعلانات مخصصة أو إعلانات غير مخصصة.
        </p>
        <div className="flex flex-col sm:flex-row-reverse gap-2.5 mt-2">
          <button
            onClick={() => handleChoice(true)}
            className="flex-1 py-3 px-4 rounded-[14px] bg-[#5B3FD6] text-white font-bold text-sm hover:bg-[#4C33B8] transition-colors shadow-xs active:scale-98"
          >
            إعلانات مخصصة
          </button>
          <button
            onClick={() => handleChoice(false)}
            className="flex-1 py-3 px-4 rounded-[14px] border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors active:scale-98"
          >
            غير مخصصة
          </button>
        </div>
      </div>
    </div>
  );
};
