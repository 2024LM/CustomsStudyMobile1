import React, { useState, useMemo } from 'react';
import { QuizQuestion } from '../types';
import { db } from '../services/db';
import { ArabicText } from './ArabicText';

interface DirectQuestionModalProps {
  question: QuizQuestion;
  onClose: () => void;
}

export const DirectQuestionModal: React.FC<DirectQuestionModalProps> = ({
  question,
  onClose,
}) => {
  const [selected, setSelected] = useState<string | null>(null);

  const options = useMemo(() => {
    return [
      question.correctAnswer,
      question.wrong1,
      question.wrong2,
      question.wrong3,
    ]
      .filter(Boolean)
      .sort(() => 0.5 - Math.random());
  }, [question.rowId]);

  const handleSelect = (option: string) => {
    if (selected !== null) return;
    setSelected(option);
    db.recordAnswer(question.rowId, option, null);
  };

  const isAnswered = selected !== null;
  const isCorrect = selected === question.correctAnswer;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-[24px] max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 text-right my-auto">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-[#5B3FD6] font-bold hover:underline"
          >
            ← العودة إلى الرئيسية
          </button>
          <span className="bg-[#F5F3FF] text-[#5B3FD6] text-xs font-semibold px-2.5 py-1 rounded-[10px]">
            {question.topic || 'سؤال المراجعة'}
          </span>
        </div>

        <div className="bg-white rounded-[18px] p-5 shadow-xs border border-gray-100 text-center">
          <ArabicText
            value={question.question}
            as="p"
            className="text-lg sm:text-xl font-bold text-[#2C2145] leading-snug"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          {options.map((option, idx) => {
            const chosen = option === selected;
            const correct = option === question.correctAnswer;

            let btnStyle = 'bg-white text-gray-800 border-gray-200 hover:border-[#5B3FD6]/50';
            if (isAnswered) {
              if (correct) {
                btnStyle = 'bg-[#E5F8EC] text-[#16864B] border-[#16864B] font-bold';
              } else if (chosen) {
                btnStyle = 'bg-[#FFE8E8] text-[#C62828] border-[#C62828] font-bold';
              } else {
                btnStyle = 'bg-gray-50 text-gray-400 border-gray-200 opacity-60';
              }
            }

            return (
              <button
                key={idx}
                disabled={isAnswered}
                onClick={() => handleSelect(option)}
                className={`w-full py-3.5 px-4 rounded-[14px] border text-sm sm:text-base transition-all flex items-center justify-between gap-3 text-right ${btnStyle} active:scale-98`}
              >
                <ArabicText value={option} className="flex-1" />
                {isAnswered && correct && <span className="text-lg shrink-0">✓</span>}
                {isAnswered && chosen && !correct && (
                  <span className="text-lg shrink-0">✕</span>
                )}
              </button>
            );
          })}
        </div>

        {isAnswered && (
          <div
            className={`p-4 rounded-[18px] border text-sm flex flex-col gap-2 ${
              isCorrect
                ? 'bg-[#E5F8EC] text-[#16864B] border-[#C2EED4]'
                : 'bg-[#FFE8E8] text-[#C62828] border-[#FFCDD2]'
            }`}
          >
            <span className="font-bold">
              {isCorrect ? 'إجابة صحيحة ✓' : 'إجابة خاطئة ✕'}
            </span>
            <div>
              <span className="font-semibold ml-1">الجواب الصحيح:</span>
              <ArabicText value={question.correctAnswer} className="font-bold" />
            </div>
            {question.explanation && (
              <div className="mt-1 pt-2 border-t border-current/20 text-xs sm:text-sm">
                <span className="font-bold block mb-1">💡 الشرح:</span>
                <ArabicText value={question.explanation} as="p" />
              </div>
            )}
          </div>
        )}

        {isAnswered && (
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-[16px] bg-[#5B3FD6] text-white font-bold text-base hover:bg-[#4C33B8] transition-colors shadow-xs active:scale-98"
          >
            العودة إلى الرئيسية
          </button>
        )}
      </div>
    </div>
  );
};
