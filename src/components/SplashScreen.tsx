import React from 'react';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#241052] to-[#5B2CCB] text-white p-6 animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4.5 text-center">
        <div className="w-28 h-28 rounded-[28px] bg-[#6B3CE6] flex items-center justify-center shadow-xl text-5xl">
          🎓
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">منصة المراجعة</h1>
        <p className="text-[#E4D9FF] text-sm sm:text-base">طريقك نحو النجاح</p>
        <div className="w-[230px] h-2 bg-white/20 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-[#F4C95D] rounded-full animate-pulse w-3/4" />
        </div>
      </div>
    </div>
  );
};
