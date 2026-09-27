import React, { useEffect, useState } from 'react';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import { QuizQuestion } from '../types';
import {
  aiReady,
  explainMistake,
  explainQuestion,
  similarQuestion,
} from '../services/geminiAi';

interface AiQuestionToolsProps {
  question: QuizQuestion;
  selectedAnswer: string | null;
}

type Action = 'explain' | 'mistake' | 'similar';

export const AiQuestionTools: React.FC<AiQuestionToolsProps> = ({
  question,
  selectedAnswer,
}) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<Action | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void aiReady().then((value) => {
      if (active) setReady(value);
    });
    return () => { active = false; };
  }, [question.rowId]);

  useEffect(() => {
    setResult('');
    setError('');
    setLoading(null);
  }, [question.rowId]);

  if (!ready) return null;

  const run = async (action: Action) => {
    if (loading) return;
    setLoading(action);
    setResult('');
    setError('');
    try {
      const text = action === 'explain'
        ? await explainQuestion(question)
        : action === 'mistake'
          ? await explainMistake(question, selectedAnswer)
          : await similarQuestion(question);
      setResult(text);
    } catch (err: any) {
      setError(err?.message || 'تعذر استخدام Gemini حاليًا.');
    } finally {
      setLoading(null);
    }
  };

  const wrongAnswer = Boolean(
    selectedAnswer &&
    selectedAnswer !== '__TIMEOUT__' &&
    selectedAnswer !== question.correctAnswer
  );

  return (
    <div className="rounded-[18px] border border-[#DDD5FF] bg-gradient-to-b from-[#FBFAFF] to-white overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-[#EEEAF8]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-[#F0EBFF] text-[#5B3FD6] flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs text-[#2C2145]">مساعد Gemini</div>
            <div className="text-[9px] text-gray-400">يستخدم مفتاح API الخاص بك</div>
          </div>
        </div>
        {(result || error) && (
          <button onClick={() => { setResult(''); setError(''); }} className="w-8 h-8 rounded-full text-gray-400 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-3 flex flex-wrap gap-2">
        <button
          onClick={() => void run('explain')}
          disabled={Boolean(loading)}
          className="px-3 py-2 rounded-[11px] bg-[#5B3FD6] text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading === 'explain' && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
          اشرح السؤال
        </button>

        {wrongAnswer && (
          <button
            onClick={() => void run('mistake')}
            disabled={Boolean(loading)}
            className="px-3 py-2 rounded-[11px] bg-red-50 text-red-600 text-[11px] font-bold disabled:opacity-50"
          >
            لماذا إجابتي خاطئة؟
          </button>
        )}

        <button
          onClick={() => void run('similar')}
          disabled={Boolean(loading)}
          className="px-3 py-2 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] text-[11px] font-bold disabled:opacity-50"
        >
          سؤال مشابه
        </button>
      </div>

      {(result || error) && (
        <div className={`mx-3 mb-3 rounded-[13px] p-3 text-xs leading-6 whitespace-pre-wrap ${
          error ? 'bg-red-50 text-red-700' : 'bg-white border border-[#EEEAF8] text-gray-700'
        }`}>
          {error || result}
        </div>
      )}
    </div>
  );
};
