import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Layers3, LoaderCircle, Save, Sparkles, X, XCircle } from 'lucide-react';
import {
  aiReady,
  flashcardsFromReference,
  GeneratedFlashcard,
  GeneratedReferenceQuestion,
  questionsFromReference,
  summarizeReference,
} from '../services/geminiAi';
import { addFlashcard } from '../services/advancedStudyTools';
import { db } from '../services/db';

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
  const [questions, setQuestions] = useState<GeneratedReferenceQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [bankName, setBankName] = useState(title.slice(0, 80));
  const [bankSaved, setBankSaved] = useState(false);
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
    setQuestions([]);
    setQuestionIndex(0);
    setSelectedAnswer('');
    setBankName(title.slice(0, 80));
    setBankSaved(false);
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
    setQuestions([]);
    setQuestionIndex(0);
    setSelectedAnswer('');
    setBankSaved(false);
    setSaved(false);
    try {
      if (action === 'summary') {
        setResult(await summarizeReference(title, usableText));
      } else if (action === 'questions') {
        const generated = await questionsFromReference(title, usableText);
        setQuestions(generated);
        setBankName(title.slice(0, 80));
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

  const saveQuestionsAsBank = () => {
    if (!questions.length || bankSaved) return;
    const cleanName = bankName.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (cleanName.length < 2) {
      setError('اكتب اسمًا صالحًا للبنك.');
      return;
    }

    try {
      db.importQuestionBank(
        cleanName,
        `أسئلة مولدة من المرجع: ${title}`,
        {
          valid: true,
          errors: [],
          sourceName: `AI Reference: ${title}`.slice(0, 200),
          rows: questions.map((item, index) => ({
            externalId: `ai_ref_${Date.now().toString(36)}_${index + 1}`,
            questionType: item.type,
            question: item.question,
            answer: item.correctAnswer,
            wrong1: item.type === 'TRUE_FALSE' ? '' : item.wrongAnswers[0],
            wrong2: item.type === 'TRUE_FALSE' ? '' : item.wrongAnswers[1],
            wrong3: item.type === 'TRUE_FALSE' ? '' : item.wrongAnswers[2],
            explanation: item.explanation,
            topic: item.topic || title,
          })),
        }
      );
      setBankSaved(true);
      setError('');
      setResult(`تم حفظ ${questions.length} سؤالًا في بنك «${cleanName}».`);
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ بنك الأسئلة.');
    }
  };

  const activeQuestion = questions[questionIndex];
  const questionOptions = activeQuestion
    ? activeQuestion.type === 'TRUE_FALSE'
      ? ['صحيح', 'خطأ']
      : [activeQuestion.correctAnswer, ...activeQuestion.wrongAnswers]
    : [];

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
        {(result || error || cards.length > 0 || questions.length > 0) && (
          <button
            onClick={() => { setResult(''); setError(''); setCards([]); setQuestions([]); setQuestionIndex(0); setSelectedAnswer(''); setBankSaved(false); setSaved(false); }}
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

      {questions.length > 0 && activeQuestion && (
        <div className="mx-3 mb-3 rounded-[16px] bg-white border border-[#EEEAF8] p-3.5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] text-gray-400">جلسة أسئلة من المرجع</div>
              <div className="text-sm font-black text-[#2C2145] mt-0.5">السؤال {questionIndex + 1} من {questions.length}</div>
            </div>
            <div className="text-[10px] font-bold text-[#5B3FD6] bg-[#F5F3FF] rounded-full px-2.5 py-1">
              {activeQuestion.type === 'TRUE_FALSE' ? 'صح / خطأ' : 'QCM'}
            </div>
          </div>

          <div className="h-1.5 rounded-full bg-[#F0EDFF] overflow-hidden mb-4">
            <div
              className="h-full bg-[#5B3FD6] transition-all"
              style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }}
            />
          </div>

          <div className="text-sm font-bold text-[#2C2145] leading-7 mb-3">{activeQuestion.question}</div>

          <div className="grid grid-cols-1 gap-2">
            {questionOptions.map((option) => {
              const chosen = selectedAnswer === option;
              const revealed = Boolean(selectedAnswer);
              const correct = option === activeQuestion.correctAnswer;
              const stateClass = revealed
                ? correct
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : chosen
                    ? 'border-red-400 bg-red-50 text-red-600'
                    : 'border-gray-100 bg-[#F8F9FD] text-gray-500'
                : 'border-gray-100 bg-[#F8F9FD] text-[#2C2145] hover:border-[#5B3FD6]/40';

              return (
                <button
                  key={option}
                  type="button"
                  disabled={revealed}
                  onClick={() => setSelectedAnswer(option)}
                  className={`w-full rounded-[13px] border p-3 text-right flex items-center justify-between gap-3 text-xs font-bold transition-all ${stateClass}`}
                >
                  <span>{option}</span>
                  {revealed && correct && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  {revealed && chosen && !correct && <XCircle className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          {selectedAnswer && (
            <div className="mt-3 rounded-[12px] bg-[#F8F9FD] p-3">
              <div className={`text-[11px] font-black ${selectedAnswer === activeQuestion.correctAnswer ? 'text-emerald-600' : 'text-red-500'}`}>
                {selectedAnswer === activeQuestion.correctAnswer ? 'إجابة صحيحة' : `الإجابة الصحيحة: ${activeQuestion.correctAnswer}`}
              </div>
              {activeQuestion.explanation && (
                <div className="text-[11px] text-gray-600 leading-5 mt-1.5">{activeQuestion.explanation}</div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-4">
            <button
              type="button"
              disabled={questionIndex === 0}
              onClick={() => { setQuestionIndex((i) => Math.max(0, i - 1)); setSelectedAnswer(''); }}
              className="h-9 px-3 rounded-[11px] bg-[#F5F3FF] text-[#5B3FD6] text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              السابق
            </button>
            <button
              type="button"
              disabled={questionIndex >= questions.length - 1}
              onClick={() => { setQuestionIndex((i) => Math.min(questions.length - 1, i + 1)); setSelectedAnswer(''); }}
              className="h-9 px-3 rounded-[11px] bg-[#5B3FD6] text-white text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
            >
              التالي
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EEEAF8]">
            <div className="text-[10px] font-bold text-gray-500 mb-2">حفظ الأسئلة كبنك</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                maxLength={80}
                disabled={bankSaved}
                className="flex-1 h-10 rounded-[11px] bg-[#F8F9FD] border border-gray-100 px-3 text-xs font-semibold outline-none focus:border-[#5B3FD6]"
                aria-label="اسم بنك الأسئلة"
              />
              <button
                type="button"
                onClick={saveQuestionsAsBank}
                disabled={bankSaved}
                className="h-10 px-4 rounded-[11px] bg-[#16864B] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {bankSaved ? 'تم الحفظ' : 'حفظ كبنك'}
              </button>
            </div>
            <div className="text-[9px] text-gray-400 mt-1.5">الاسم مأخوذ تلقائيًا من اسم المرجع ويمكن تعديله قبل الحفظ.</div>
          </div>
        </div>
      )}

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
