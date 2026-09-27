import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Layers3, LoaderCircle, Save, Sparkles, X } from 'lucide-react';
import {
  aiReady,
  flashcardsFromReference,
  GeneratedFlashcard,
  questionsFromReference,
  summarizeReference,
} from '../services/geminiAi';
import { addFlashcard } from '../services/advancedStudyTools';

interface AiReferenceToolsProps {
  title: string;
  text: string;
}

type Action = 'summary' | 'questions' | 'flashcards';

export const AiReferenceTools: React.FC<AiReferenceToolsProps> = ({ title, text }) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<Action | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [cards, setCards] = useState<GeneratedFlashcard[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void aiReady().then((value) => {
      if (active) setReady(value);
    });
    return () => { active = false; };
  }, [title]);

  useEffect(() => {
    setResult('');
    setError('');
    setCards([]);
    setSaved(false);
    setLoading(null);
  }, [title, text]);

  const usableText = useMemo(() => text.trim(), [text]);
  if (!ready || !usableText) return null;

  const run = async (action: Action) => {
    if (loading) return;
    setLoading(action);
    setResult('');
    setError('');
    setCards([]);
    setSaved(false);
    try {
      if (action === 'summary') {
        setResult(await summarizeReference(title, usableText));
      } else if (action === 'questions') {
        setResult(await questionsFromReference(title, usableText));
      } else {
        setCards(await flashcardsFromReference(title, usableText));
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر استخدام Gemini على هذا المرجع.');
    } finally {
      setLoading(null);
    }
  };

  const saveCards = () => {
    let savedCount = 0;
    let skippedCount = 0;
    for (const card of cards) {
      try {
        addFlashcard(card.front, card.back);
        savedCount += 1;
      } catch {
        skippedCount += 1;
      }
    }
    setSaved(true);
    setResult(
      skippedCount > 0
        ? `تم حفظ ${savedCount} بطاقة، وتم تجاوز ${skippedCount} بطاقة.`
        : `تم حفظ ${savedCount} بطاقة في مركز الدراسة.`
    );
  };

  return (
    <div className="rounded-[18px] border border-[#DDD5FF] bg-gradient-to-b from-[#FBFAFF] to-white overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-[#EEEAF8]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-[#F0EBFF] text-[#5B3FD6] flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-xs text-[#2C2145]">أدوات Gemini للمرجع</div>
            <div className="text-[9px] text-gray-400">يتم إرسال نص المرجع المفتوح فقط</div>
          </div>
        </div>
        {(result || error || cards.length > 0) && (
          <button
            onClick={() => { setResult(''); setError(''); setCards([]); setSaved(false); }}
            className="w-8 h-8 rounded-full text-gray-400 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => void run('summary')}
          disabled={Boolean(loading)}
          className="min-h-16 rounded-[12px] bg-[#5B3FD6] text-white text-[10px] font-bold flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loading === 'summary' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          تلخيص المرجع
        </button>
        <button
          onClick={() => void run('questions')}
          disabled={Boolean(loading)}
          className="min-h-16 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] text-[10px] font-bold flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loading === 'questions' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <BookOpenCheck className="w-4 h-4" />}
          إنشاء أسئلة
        </button>
        <button
          onClick={() => void run('flashcards')}
          disabled={Boolean(loading)}
          className="min-h-16 rounded-[12px] bg-[#EEF9F2] text-[#16864B] text-[10px] font-bold flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loading === 'flashcards' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Layers3 className="w-4 h-4" />}
          Flashcards
        </button>
      </div>

      {cards.length > 0 && (
        <div className="mx-3 mb-3 rounded-[13px] bg-white border border-[#EEEAF8] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[11px] font-bold text-[#2C2145]">{cards.length} بطاقة مقترحة</div>
            <button
              onClick={saveCards}
              disabled={saved}
              className="h-8 px-3 rounded-[10px] bg-[#16864B] text-white text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saved ? 'تم الحفظ' : 'حفظ الكل'}
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {cards.map((card, index) => (
              <div key={index} className="rounded-[11px] bg-[#F8F9FD] p-2.5">
                <div className="text-[10px] font-bold text-[#5B3FD6]">{card.front}</div>
                <div className="text-[10px] text-gray-600 mt-1 leading-5">{card.back}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
