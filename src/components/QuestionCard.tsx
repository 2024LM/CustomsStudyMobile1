import React, { useState } from 'react';
import { ChevronDown, Heart } from 'lucide-react';
import { QuizQuestion } from '../types';
import { db } from '../services/db';
import { ArabicText } from './ArabicText';
import { SpeakButton } from './SpeakButton';

interface QuestionCardProps {
  question: QuizQuestion;
  index?: number;
  expandedByDefault?: boolean;
  onFavoriteChange?: (fav: boolean) => void;
}

function typeLabel(type: QuizQuestion['questionType']): string {
  if (type === 'TRUE_FALSE') return 'صح / خطأ';
  if (type === 'OPEN') return 'مفتوح';
  if (type === 'ORAL') return 'شفهي';
  return 'اختيار متعدد';
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  expandedByDefault = false,
  onFavoriteChange,
}) => {
  const [favorite, setFavorite] = useState(() => db.isFavorite(question.rowId));
  const [expanded, setExpanded] = useState(expandedByDefault);
  const [showExplanation, setShowExplanation] = useState(false);

  React.useEffect(() => {
    setExpanded(expandedByDefault);
    if (!expandedByDefault) setShowExplanation(false);
  }, [expandedByDefault, question.rowId]);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !favorite;
    setFavorite(next);
    db.setFavorite(question.rowId, next);
    onFavoriteChange?.(next);
  };

  return (
    <div data-speech-scope className={`bg-white border transition-all ${expanded ? 'border-[#CFC4F6] shadow-xs' : 'border-transparent hover:bg-[#FCFBFF]'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
        className="px-4 py-3.5 flex items-start gap-3 cursor-pointer"
      >
        {typeof index === 'number' && (
          <div className="w-8 h-8 rounded-[10px] bg-[#F5F3FF] text-[#5B3FD6] text-[12px] font-black flex items-center justify-center shrink-0 mt-0.5">
            {index}
          </div>
        )}

        <div data-speech-text className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[12px] font-bold px-2 py-1 rounded-full bg-[#F5F3FF] text-[#5B3FD6]">
              {question.topic || 'عام'}
            </span>
            <span className="text-[12px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">
              {typeLabel(question.questionType)}
            </span>
          </div>

          <ArabicText
            value={question.question}
            as="p"
            className={`font-bold text-[#2C2145] leading-6 ${expanded ? 'text-[15px] sm:text-base' : 'text-sm sm:text-[15px] line-clamp-2'}`}
          />

          {expanded && (
            <div className="mt-3 pt-3 border-t border-[#EEEAF6] animate-in fade-in duration-150">
              <div className="flex items-start gap-2 text-[#16864B]">
                <span className="w-5 h-5 rounded-full bg-[#EAF8F0] text-[#16864B] text-[12px] font-black flex items-center justify-center shrink-0 mt-0.5">✓</span>
                <div className="min-w-0">
                  <div className="text-[12px] font-bold mb-1">الإجابة</div>
                  <ArabicText value={question.correctAnswer} className="text-xs sm:text-sm font-bold leading-6" />
                </div>
              </div>

              {question.explanation && (
                <div className="mt-3">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowExplanation((value) => !value);
                    }}
                    className="text-[12px] font-bold text-[#5B3FD6]"
                  >
                    {showExplanation ? 'إخفاء الشرح' : 'عرض الشرح'}
                  </button>

                  {showExplanation && (
                    <div className="mt-2 rounded-[12px] bg-[#FAF9FE] px-3 py-2.5 text-gray-600">
                      <div className="text-[12px] font-bold text-[#5B3FD6] mb-1">الشرح</div>
                      <ArabicText value={question.explanation} as="p" className="text-xs sm:text-sm leading-6" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <SpeakButton
            text={[question.question, expanded ? `الإجابة الصحيحة: ${question.correctAnswer}` : '', expanded && showExplanation && question.explanation ? `الشرح: ${question.explanation}` : ''].filter(Boolean).join('. ')}
            className="hover:bg-[#F5F3FF]"
            title="قراءة السؤال"
          />
          <button
            onClick={toggleFavorite}
            className="w-8 h-8 rounded-full hover:bg-gray-100 transition-colors active:scale-90 flex items-center justify-center"
            aria-pressed={favorite}
            aria-label={favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          >
            <Heart className={`w-4.5 h-4.5 transition-colors ${favorite ? 'fill-[#E84A67] text-[#E84A67]' : 'text-gray-500'}`} />
          </button>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180 text-[#5B3FD6]' : ''}`} />
        </div>
      </div>
    </div>
  );
};
