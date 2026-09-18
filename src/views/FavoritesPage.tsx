import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { db } from '../services/db';
import { ScreenHeader } from '../components/ScreenHeader';
import { ArabicText } from '../components/ArabicText';

export const FavoritesPage: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const favorites = db.favorites();

  const handleRemove = (rowId: number) => {
    db.setFavorite(rowId, false);
    setRefresh((r) => r + 1);
  };

  return (
    <div className="flex flex-col gap-3 pb-8 text-right">
      <ScreenHeader
        title="المفضلة"
        subtitle="أسئلتك المحفوظة للعودة إليها"
      />

      {favorites.length === 0 ? (
        <div className="bg-white rounded-[22px] p-10 text-center flex flex-col items-center gap-3 border border-gray-100 shadow-xs mt-4">
          <div className="w-14 h-14 rounded-full bg-[#FFF0F3] flex items-center justify-center text-[#E84A67]">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-[#2C2145]">لا توجد أسئلة مفضلة</h3>
          <p className="text-sm text-gray-500">
            اضغط رمز القلب بجانب أي سؤال أثناء التصفح لحفظه هنا
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {favorites.map((q) => (
            <div
              key={q.rowId}
              className="bg-white rounded-[19px] p-4.5 shadow-xs border border-gray-100/90 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#5B3FD6] bg-[#F5F3FF] px-2.5 py-1 rounded-[8px]">
                  {q.topic || 'عام'}
                </span>
                <Heart className="w-5 h-5 fill-[#E84A67] text-[#E84A67]" />
              </div>

              <ArabicText
                value={q.question}
                as="p"
                className="font-bold text-base text-[#2C2145] leading-relaxed"
              />

              <div className="flex items-center gap-1.5 text-sm text-[#16864B] font-semibold">
                <span>الإجابة:</span>
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
                  onClick={() => handleRemove(q.rowId)}
                  className="py-1.5 px-3 rounded-[10px] text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  إزالة من المفضلة
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
