import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { QuizQuestion } from '../types';
import { db } from '../services/db';
import { ArabicText } from './ArabicText';

interface QuestionCardProps {
  question: QuizQuestion;
  onFavoriteChange?: (fav: boolean) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onFavoriteChange,
}) => {
  const [favorite, setFavorite] = useState(() => db.isFavorite(question.rowId));
  const [showExplanation, setShowExplanation] = useState(false);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !favorite;
    setFavorite(next);
    db.setFavorite(question.rowId, next);
    onFavoriteChange?.(next);
  };

  return (
    <div className="bg-white rounded-[20px] p-4 sm:p-5 shadow-xs border border-gray-100/80 flex flex-col gap-3 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="bg-[#F5F3FF] text-[#5B3FD6] text-xs font-semibold px-2.5 py-1 rounded-[10px]">
          {question.topic || 'عام'}
        </span>
        <button
          onClick={toggleFavorite}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors active:scale-90"
          aria-label={favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
        >
          <Heart
            className={`w-5 h-5 transition-colors ${
              favorite ? 'fill-[#E84A67] text-[#E84A67]' : 'text-gray-400'
            }`}
          />
        </button>
      </div>

      <ArabicText
        value={question.question}
        as="p"
        className="font-bold text-[#2C2145] text-base sm:text-lg leading-relaxed"
      />

      <div className="h-px bg-[#F0EDF6] my-0.5" />

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-[#16864B] font-medium">
          <span>الإجابة:</span>
          <ArabicText value={question.correctAnswer} className="font-semibold" />
        </div>
        {question.explanation && (
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-xs text-[#5B3FD6] hover:underline font-medium"
          >
            {showExplanation ? 'إخفاء الشرح' : 'عرض الشرح 💡'}
          </button>
        )}
      </div>

      {showExplanation && question.explanation && (
        <div className="mt-1 p-3 bg-[#F9F8FD] rounded-[14px] border border-[#ECE8F8] text-xs sm:text-sm text-gray-700 leading-relaxed">
          <span className="font-bold text-[#5B3FD6] block mb-1">💡 الشرح:</span>
          <ArabicText value={question.explanation} as="p" />
        </div>
      )}
    </div>
  );
};
