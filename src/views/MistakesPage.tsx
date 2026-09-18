import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { db } from '../services/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { ArabicText } from '../components/ArabicText';

export const MistakesPage: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const mistakes = db.mistakes();

  const handleClear = (rowId: number) => {
    db.clearMistake(rowId);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="flex flex-col gap-3 pb-8 text-right">
      <ScreenHeader
        title="الأخطاء"
        subtitle="راجع النقاط التي تحتاج إلى تركيز"
      />

      {mistakes.length === 0 ? (
        <div className="bg-white rounded-[22px] p-10 text-center flex flex-col items-center gap-3 border border-gray-100 shadow-xs mt-4">
          <div className="w-14 h-14 rounded-full bg-[#EAF8F0] flex items-center justify-center text-[#16864B]">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-[#2C2145]">لا توجد أخطاء محفوظة</h3>
          <p className="text-sm text-gray-500">استمر بهذا الأداء المتميز في مراجعتك!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {mistakes.map((q) => (
            <div
              key={q.rowId}
              className="bg-white rounded-[19px] p-4.5 shadow-xs border border-gray-100/90 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="bg-[#FFEEED] text-[#C62828] text-xs font-semibold px-2.5 py-1 rounded-[9px]">
                  {q.topic || 'عام'}
                </span>
              </div>

              <ArabicText
                value={q.question}
                as="p"
                className="font-bold text-base text-[#2C2145] leading-relaxed"
              />

              <div className="flex items-center gap-1.5 text-sm text-[#16864B] font-semibold">
                <span>الإجابة الصحيحة:</span>
                <ArabicText value={q.correctAnswer} />
              </div>

              {q.explanation && (
                <div className="p-2.5 bg-gray-50 rounded-[12px] text-xs text-gray-600">
                  <span className="font-bold text-[#5B3FD6] block mb-0.5">💡 الشرح:</span>
                  <ArabicText value={q.explanation} as="p" />
                </div>
              )}

              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => handleClear(q.rowId)}
                  className="py-1.5 px-3 rounded-[10px] text-xs font-bold text-[#5B3FD6] hover:bg-[#F5F3FF] transition-colors"
                >
                  تمت المراجعة  ✓
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
