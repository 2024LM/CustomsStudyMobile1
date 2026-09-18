import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../services/db';
import { QuizQuestion, StudyStats } from '../types';
import { ScreenHeader } from '../components/ScreenHeader';
import { ArabicText } from '../components/ArabicText';
import { CircularProgress } from '../components/CircularProgress';
import { MetricCard } from '../components/MetricCard';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';
import { showInterstitial } from '../services/ads';

interface SessionPageProps {
  initialTopic?: string | null;
}

export const SessionPage: React.FC<SessionPageProps> = ({ initialTopic = null }) => {
  const [count, setCount] = useState<number>(20);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopic ? [initialTopic] : []);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [index, setIndex] = useState<number>(0);
  const [done, setDone] = useState<boolean>(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const topics = useMemo(() => db.topics(), []);
  const qcmCount = db.qcmReadyCount();

  // Check for open session to resume
  useEffect(() => {
    const open = db.openSessionId();
    if (open !== null) {
      const resumed = db.resumeSessionQuestions(open);
      if (resumed.length > 0) {
        const answered = db.sessionAnsweredQuestionIds(open);
        if (resumed.every((q) => answered.has(q.rowId))) {
          db.finishSession(open);
          setSessionId(open);
          setQuestions(resumed);
          setDone(true);
        } else {
          setSessionId(open);
          setQuestions(resumed);
          const firstUnanswered = resumed.findIndex((q) => !answered.has(q.rowId));
          setIndex(Math.max(firstUnanswered, 0));
        }
      }
    }
  }, []);

  const handleStartSession = () => {
    const qList = db.sessionQuestions(count, selectedTopics.length > 0 ? selectedTopics : null);
    if (qList.length > 0) {
      const sid = db.createSession(qList.length, db.activeBankId(), selectedTopics.length > 0 ? 'topics' : 'mixed');
      db.attachSessionQuestions(sid, qList);
      setQuestions(qList);
      setSessionId(sid);
      setIndex(0);
      setDone(false);
      setSelectedAnswer(null);
    }
  };

  const handleNext = async () => {
    if (index + 1 >= questions.length) {
      if (sessionId !== null) {
        db.finishSession(sessionId);
      }
      await showInterstitial();
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setSelectedAnswer(null);
    }
  };

  const handleReset = () => {
    setQuestions([]);
    setSessionId(null);
    setIndex(0);
    setDone(false);
    setSelectedAnswer(null);
  };

  // Trigger celebration on result screen if success rate >= 70%
  useEffect(() => {
    if (done && sessionId !== null) {
      const s = db.sessionStats(sessionId);
      if (s.successRate >= 70) {
        try {
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
      }
    }
  }, [done, sessionId]);

  // Current question options
  const currentQuestion = questions[index];
  const shuffledOptions = useMemo(() => {
    if (!currentQuestion) return [];
    return [
      currentQuestion.correctAnswer,
      currentQuestion.wrong1,
      currentQuestion.wrong2,
      currentQuestion.wrong3,
    ]
      .filter(Boolean)
      .sort(() => 0.5 - Math.random());
  }, [currentQuestion?.rowId]);

  // 1. Session Result Screen
  if (done && sessionId !== null) {
    const sessionStats = db.sessionStats(sessionId);
    const rate = Math.min(Math.max(sessionStats.successRate, 0), 100);
    const isPassed = rate >= 70;

    return (
      <div className="flex flex-col items-center gap-5 pb-8 text-center animate-in fade-in duration-300">
        <h1 className="text-2xl font-bold text-[#2C2145] mt-2">نتيجة الجلسة</h1>

        <span className="text-6xl my-1">{isPassed ? '🏆' : '📘'}</span>

        <h2 className="text-xl font-bold text-[#2C2145]">
          {isPassed ? 'أحسنت عملاً!' : 'استمر في المراجعة'}
        </h2>

        <div className="my-2">
          <CircularProgress
            percentage={rate}
            size={132}
            strokeWidth={12}
            color={isPassed ? '#25A763' : '#5B3FD6'}
            trackColor="#E7E3F2"
            textSize="text-3xl"
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5 w-full">
          <MetricCard
            symbol="✓"
            label="صحيحة"
            value={sessionStats.correct}
            bgColor="#EAF8F0"
            accentColor="#16864B"
          />
          <MetricCard
            symbol="✕"
            label="خاطئة"
            value={sessionStats.wrong}
            bgColor="#FFEEED"
            accentColor="#C62828"
          />
          <MetricCard
            symbol="∑"
            label="المجموع"
            value={sessionStats.answered}
            bgColor="#F5F3FF"
            accentColor="#5B3FD6"
          />
        </div>

        <button
          onClick={handleReset}
          className="w-full mt-6 py-4 rounded-[18px] bg-[#5B3FD6] hover:bg-[#4C33B8] text-white font-bold text-base transition-all shadow-xs active:scale-98 cursor-pointer"
        >
          جلسة جديدة
        </button>
      </div>
    );
  }

  // 2. Active Session Screen
  if (questions.length > 0 && sessionId !== null && currentQuestion) {
    const isAnswered = selectedAnswer !== null;
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    const progressPercent = ((index + 1) / questions.length) * 100;

    const handleSelectOption = (opt: string) => {
      if (selectedAnswer !== null) return;
      setSelectedAnswer(opt);
      db.recordAnswer(currentQuestion.rowId, opt, sessionId);
    };

    return (
      <div className="flex flex-col gap-4 pb-8 text-right animate-in fade-in duration-200">
        {/* Progress & Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[#2C2145]">
              السؤال {index + 1} من {questions.length}
            </span>
            <span className="bg-[#F5F3FF] text-[#5B3FD6] text-xs font-semibold px-2.5 py-1 rounded-[12px]">
              {currentQuestion.topic || 'عام'}
            </span>
          </div>
          <div className="w-full bg-[#E7E2F8] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#5B3FD6] h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-[24px] p-6 shadow-xs border border-gray-100 min-h-[120px] flex items-center justify-center text-center">
          <ArabicText
            value={currentQuestion.question}
            as="p"
            className="text-lg sm:text-xl font-bold text-[#2C2145] leading-relaxed"
          />
        </div>

        {/* 4 Shuffled Options */}
        <div className="flex flex-col gap-2.5">
          {shuffledOptions.map((opt, i) => {
            const chosen = opt === selectedAnswer;
            const correct = opt === currentQuestion.correctAnswer;

            let cardBg = 'bg-white border-[#E4E0EC] hover:border-[#5B3FD6]/50';
            let markText = '○';
            let markColor = 'text-gray-300';

            if (isAnswered) {
              if (correct) {
                cardBg = 'bg-[#E8F8EF] border-[#31A866] text-[#16864B] font-bold';
                markText = '✓';
                markColor = 'text-[#31A866]';
              } else if (chosen) {
                cardBg = 'bg-[#FFECEC] border-[#E05757] text-[#C62828] font-bold';
                markText = '✕';
                markColor = 'text-[#E05757]';
              } else {
                cardBg = 'bg-white border-gray-100 opacity-60';
              }
            }

            return (
              <button
                key={i}
                disabled={isAnswered}
                onClick={() => handleSelectOption(opt)}
                className={`w-full p-4 rounded-[18px] border transition-all flex items-center justify-between gap-3 text-right ${cardBg} active:scale-98 cursor-pointer`}
              >
                <ArabicText value={opt} className="flex-1 text-sm sm:text-base" />
                <span className={`text-lg font-bold shrink-0 ${markColor}`}>
                  {markText}
                </span>
              </button>
            );
          })}
        </div>

        {/* Feedback card */}
        {isAnswered && (
          <div
            className={`p-4 rounded-[20px] border flex flex-col gap-2 animate-in fade-in duration-200 ${
              isCorrect
                ? 'bg-[#EAF8F0] text-[#16864B] border-[#B7E5C8]'
                : 'bg-[#FFEEED] text-[#C62828] border-[#FFCDD2]'
            }`}
          >
            <span className="font-bold text-sm">
              {isCorrect ? 'إجابة صحيحة ✓' : 'إجابة خاطئة ✕'}
            </span>
            <div className="text-xs sm:text-sm">
              <span className="font-semibold ml-1">الجواب الصحيح:</span>
              <ArabicText value={currentQuestion.correctAnswer} className="font-bold" />
            </div>
            {currentQuestion.explanation && (
              <div className="mt-1 pt-2 border-t border-current/20 text-xs sm:text-sm">
                <span className="font-bold block mb-1">💡 الشرح:</span>
                <ArabicText value={currentQuestion.explanation} as="p" />
              </div>
            )}
          </div>
        )}

        {/* Bottom banner during the active session */}
        <ReferenceBannerAd slot="session-bottom" />

        {/* Next Question / Finish Session Button */}
        {isAnswered && (
          <button
            onClick={handleNext}
            className="w-full h-14 rounded-[18px] bg-[#5B3FD6] hover:bg-[#4C33B8] text-white font-bold text-base transition-all shadow-xs active:scale-98 cursor-pointer"
          >
            {index + 1 === questions.length ? 'إنهاء الجلسة' : 'السؤال التالي  ←'}
          </button>
        )}
      </div>
    );
  }

  // 3. Setup Screen
  return (
    <div className="flex flex-col gap-4 pb-8 text-right">
      <ScreenHeader
        title="إعداد الجلسة"
        subtitle="اختر معايير المراجعة حسب احتياجاتك"
      />

      {/* Question Count Setting */}
      <div data-tour="session-count" className="bg-white rounded-[20px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-3">
        <h3 className="font-bold text-sm text-[#2C2145]">عدد الأسئلة</h3>
        <div className="grid grid-cols-3 gap-2">
          {[10, 20, 50].map((n) => {
            const isSelected = count === n;
            return (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`py-2.5 rounded-[14px] text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#5B3FD6]/40'
                }`}
              >
                {n} سؤال
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-topic Filter Setting */}
      <div data-tour="session-topics" className="bg-white rounded-[20px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-bold text-sm text-[#2C2145]">المحاور</h3>
            <span className="text-[11px] text-gray-400">
              {selectedTopics.length === 0 ? 'كل المحاور' : `${selectedTopics.length} محدد`}
            </span>
          </div>
          {selectedTopics.length > 0 && (
            <button
              onClick={() => setSelectedTopics([])}
              className="text-xs text-[#5B3FD6] font-bold hover:underline"
            >
              إلغاء التحديد
            </button>
          )}
        </div>

        <button
          onClick={() => setSelectedTopics([])}
          className={`w-full p-3.5 rounded-[16px] border text-right transition-all flex items-center gap-3 ${
            selectedTopics.length === 0
              ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6] font-bold'
              : 'bg-white border-[#E7E3EF] text-gray-700 hover:border-[#5B3FD6]/40'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center shrink-0 ${
              selectedTopics.length === 0 ? 'border-[#5B3FD6] bg-[#5B3FD6]' : 'border-gray-300'
            }`}
          >
            {selectedTopics.length === 0 && <span className="text-white text-xs leading-none">✓</span>}
          </div>
          <span className="text-sm">كل المحاور (مراجعة شاملة)</span>
        </button>

        <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-0.5">
          {topics.map((t) => {
            const isSelected = selectedTopics.includes(t);
            return (
              <button
                key={t}
                onClick={() =>
                  setSelectedTopics((current) =>
                    current.includes(t)
                      ? current.filter((item) => item !== t)
                      : [...current, t]
                  )
                }
                className={`w-full p-3.5 rounded-[16px] border text-right transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6] font-bold'
                    : 'bg-white border-[#E7E3EF] text-gray-700 hover:border-[#5B3FD6]/40'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-[#5B3FD6] bg-[#5B3FD6]' : 'border-gray-300'
                  }`}
                >
                  {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                </div>
                <span className="text-sm flex-1">{t}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Start Button */}
      <button data-tour="session-start"
        onClick={handleStartSession}
        disabled={qcmCount === 0}
        className={`w-full h-14 rounded-[18px] font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98 ${
          qcmCount > 0
            ? 'bg-[#5B3FD6] hover:bg-[#4C33B8] text-white cursor-pointer'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <span>ابدأ الجلسة</span>
        <span>▶</span>
      </button>
    </div>
  );
};
