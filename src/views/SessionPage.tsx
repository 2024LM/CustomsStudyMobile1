import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowRight, Clock3, Eye, Shuffle, Gauge, FastForward, PlayCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { db } from '../services/db';
import { QuizQuestion, StudyStats } from '../types';
import { ArabicText } from '../components/ArabicText';
import { CircularProgress } from '../components/CircularProgress';
import { MetricCard } from '../components/MetricCard';
import { ReferenceBannerAd } from '../components/ReferenceBannerAd';
import { showInterstitial } from '../services/ads';

interface SessionPageProps {
  initialTopic?: string | string[] | null;
  initialMode?: 'classic' | 'review' | 'mistakes' | 'favorites' | 'smart';
  initialCount?: number | null;
  autoStart?: boolean;
  onActiveChange?: (active: boolean) => void;
  onExit?: () => void;
}

export const SessionPage: React.FC<SessionPageProps> = ({
  initialTopic = null,
  initialMode = 'classic',
  initialCount = null,
  autoStart = false,
  onActiveChange,
  onExit,
}) => {
  const initialTopics = Array.isArray(initialTopic) ? initialTopic : initialTopic ? [initialTopic] : [];
  const [count, setCount] = useState<number>(initialCount || 20);
  const [sessionMode, setSessionMode] = useState<'classic' | 'review' | 'mistakes' | 'favorites' | 'smart'>(initialMode);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopics);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [index, setIndex] = useState<number>(0);
  const [done, setDone] = useState<boolean>(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [exitPrompt, setExitPrompt] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [questionTimeLimit, setQuestionTimeLimit] = useState<number>(() => {
    const value = Number(db.setting('session_question_time_limit', '0'));
    return [0, 15, 30, 60].includes(value) ? value : 0;
  });
  const [autoAdvance, setAutoAdvance] = useState(() => db.setting('session_auto_advance', '0') === '1');
  const [showExplanation, setShowExplanation] = useState(() => db.setting('session_show_explanation', '1') === '1');
  const [shuffleOptions, setShuffleOptions] = useState(() => db.setting('session_shuffle_options', '1') === '1');
  const [showProgress, setShowProgress] = useState(() => db.setting('session_show_progress', '1') === '1');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const topics = useMemo(() => db.topics(), []);
  const playableCount = db.playableQuestionCount();
  const dueReviewCount = db.dueReviewQuestions(500).length;
  const mistakesCount = db.mistakes().filter((q) => q.qcmStatus === 'READY').length;
  const favoritesCount = db.favorites().filter((q) => q.qcmStatus === 'READY').length;
  const smartCount = db.smartQuestionPool(500).length;
  const sessionActive = questions.length > 0 && sessionId !== null && !done;
  const autoStartHandled = useRef(false);

  useEffect(() => {
    onActiveChange?.(sessionActive);
    return () => onActiveChange?.(false);
  }, [sessionActive, onActiveChange]);

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

  const persistSessionPreferences = () => {
    db.setSetting('session_question_time_limit', String(questionTimeLimit));
    db.setSetting('session_auto_advance', autoAdvance ? '1' : '0');
    db.setSetting('session_show_explanation', showExplanation ? '1' : '0');
    db.setSetting('session_shuffle_options', shuffleOptions ? '1' : '0');
    db.setSetting('session_show_progress', showProgress ? '1' : '0');
  };

  const handleStartSession = () => {
    persistSessionPreferences();
    const topicFilter = selectedTopics.length > 0 ? selectedTopics : null;
    let qList: QuizQuestion[] = [];
    if (sessionMode === 'review') {
      qList = db.dueReviewQuestions(count, topicFilter);
    } else if (sessionMode === 'mistakes') {
      qList = db.mistakes()
        .filter((q) => q.qcmStatus === 'READY')
        .filter((q) => !topicFilter || (Array.isArray(topicFilter) ? topicFilter.includes(q.topic) : q.topic === topicFilter))
        .slice(0, count);
    } else if (sessionMode === 'favorites') {
      qList = db.favorites()
        .filter((q) => q.qcmStatus === 'READY')
        .filter((q) => !topicFilter || (Array.isArray(topicFilter) ? topicFilter.includes(q.topic) : q.topic === topicFilter))
        .slice(0, count);
    } else if (sessionMode === 'smart') {
      qList = db.smartQuestionPool(500)
        .filter((q) => !topicFilter || (Array.isArray(topicFilter) ? topicFilter.includes(q.topic) : q.topic === topicFilter))
        .slice(0, count);
    } else {
      qList = db.sessionQuestions(count, topicFilter);
    }
    if (qList.length > 0) {
      const sid = db.createSession(qList.length, db.activeBankId(), sessionMode);
      db.attachSessionQuestions(sid, qList);
      setQuestions(qList);
      setSessionId(sid);
      setIndex(0);
      setDone(false);
      setSelectedAnswer(null);
      setStreak(0);
      setBestStreak(0);
      setXp(0);
    }
  };

  useEffect(() => {
    if (!autoStart || autoStartHandled.current || sessionId !== null || questions.length > 0) return;
    autoStartHandled.current = true;
    handleStartSession();
  }, [autoStart, sessionId, questions.length]);

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
    setStreak(0);
    setBestStreak(0);
    setXp(0);
    setRemainingSeconds(0);
  };

  const requestExit = () => setExitPrompt(true);
  const confirmExit = () => {
    if (sessionId !== null) db.finishSession(sessionId);
    setExitPrompt(false);
    handleReset();
    onExit?.();
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
    const options = [
      currentQuestion.correctAnswer,
      currentQuestion.wrong1,
      currentQuestion.wrong2,
      currentQuestion.wrong3,
    ].filter(Boolean);
    return shuffleOptions ? options.sort(() => 0.5 - Math.random()) : options;
  }, [currentQuestion?.rowId, shuffleOptions]);

  useEffect(() => {
    if (!sessionActive || !currentQuestion || questionTimeLimit <= 0 || selectedAnswer !== null) return;
    setRemainingSeconds(questionTimeLimit);
  }, [sessionActive, currentQuestion?.rowId, questionTimeLimit]);

  useEffect(() => {
    if (!sessionActive || questionTimeLimit <= 0 || selectedAnswer !== null || remainingSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [sessionActive, questionTimeLimit, selectedAnswer, remainingSeconds]);

  useEffect(() => {
    if (
      !sessionActive ||
      !currentQuestion ||
      questionTimeLimit <= 0 ||
      selectedAnswer !== null ||
      remainingSeconds !== 0
    ) {
      return;
    }

    setSelectedAnswer('__TIMEOUT__');
    db.recordAnswer(currentQuestion.rowId, '__TIMEOUT__', sessionId);
    setStreak(0);
  }, [sessionActive, currentQuestion?.rowId, questionTimeLimit, remainingSeconds, selectedAnswer, sessionId]);

  useEffect(() => {
    if (!sessionActive || !autoAdvance || selectedAnswer === null) return;

    const timer = window.setTimeout(() => {
      void handleNext();
    }, showExplanation ? 1800 : 900);

    return () => window.clearTimeout(timer);
  }, [sessionActive, autoAdvance, selectedAnswer, showExplanation, index, questions.length]);

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

  // 2. Active classic session
  if (questions.length > 0 && sessionId !== null && currentQuestion) {
    const isAnswered = selectedAnswer !== null;
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    const progressPercent = ((index + 1) / questions.length) * 100;

    const handleSelectOption = (opt: string) => {
      if (selectedAnswer !== null) return;
      setSelectedAnswer(opt);
      const correct = db.recordAnswer(currentQuestion.rowId, opt, sessionId);
      if (correct) {
        const next = streak + 1;
        setStreak(next);
        setBestStreak((best) => Math.max(best, next));
        setXp((value) => value + 10 + Math.min(next - 1, 5) * 2);
      } else {
        setStreak(0);
      }
    };

    return (
      <div className="flex flex-col gap-4 pb-8 text-right animate-in fade-in duration-200">
        {/* Focus-mode header */}
        <div className="flex flex-col gap-2 sticky top-0 z-20 bg-[#F8F9FD]/95 backdrop-blur-md pb-2">
          <div className="flex items-center justify-between gap-2">
            <button onClick={requestExit} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#2C2145]" aria-label="الرجوع">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="bg-[#FFF4D6] text-[#8A5B00] px-2.5 py-1.5 rounded-full">🔥 {streak}</span>
              <span className="bg-[#F5F3FF] text-[#5B3FD6] px-2.5 py-1.5 rounded-full">{xp} XP</span>
              {questionTimeLimit > 0 && (
                <span className={`px-2.5 py-1.5 rounded-full ${
                  remainingSeconds <= 5 ? 'bg-[#FFEEED] text-[#C62828]' : 'bg-white text-gray-700 border border-gray-200'
                }`}>
                  ⏱ {remainingSeconds}
                </span>
              )}
            </div>
            {showProgress && <span className="font-bold text-sm text-[#2C2145]">{index + 1} / {questions.length}</span>}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">{
              sessionMode === 'review' ? '🧠 مراجعة مستحقة'
                : sessionMode === 'mistakes' ? '❌ مراجعة الأخطاء'
                  : sessionMode === 'favorites' ? '❤️ المفضلة'
                    : sessionMode === 'smart' ? '✨ اختيار ذكي'
                      : '📚 مراجعة كلاسيكية'
            }</span>
            <span className="bg-[#F5F3FF] text-[#5B3FD6] text-xs font-semibold px-2.5 py-1 rounded-[12px]">{currentQuestion.topic || 'عام'}</span>
          </div>
          {showProgress && (
            <div className="w-full bg-[#E7E2F8] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#5B3FD6] h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
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
                className={`w-full p-4 rounded-[18px] border transition-all text-right ${cardBg} active:scale-98 cursor-pointer`}
              >
                <div className="flex items-center justify-between gap-3">
                  <ArabicText value={opt} className="flex-1 text-sm sm:text-base" />
                  <span className={`text-lg font-bold shrink-0 ${markColor}`}>
                    {markText}
                  </span>
                </div>

                {isAnswered && correct && (
                  <div className="mt-3 pt-3 border-t border-[#31A866]/20">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-[#16864B]">
                      <span className="w-5 h-5 rounded-full bg-[#31A866] text-white flex items-center justify-center text-[10px]">✓</span>
                      <span>الإجابة الصحيحة</span>
                    </div>
                    {showExplanation && currentQuestion.explanation && (
                      <div className="mt-2 rounded-[12px] bg-white/65 px-3 py-2.5 text-[#315F43]">
                        <div className="text-[10px] font-bold mb-1">الشرح</div>
                        <ArabicText
                          value={currentQuestion.explanation}
                          as="p"
                          className="text-xs sm:text-sm leading-6 font-medium"
                        />
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {exitPrompt && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5" onClick={() => setExitPrompt(false)}>
            <div className="w-full max-w-sm bg-white rounded-[24px] p-5 shadow-xl text-right" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-lg text-[#2C2145]">إنهاء الجلسة؟</h3>
              <p className="text-sm text-gray-500 mt-2">وصلت إلى السؤال {index + 1} من {questions.length}. ستُحفظ إجاباتك الحالية.</p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                <button onClick={confirmExit} className="py-3 rounded-[14px] border border-red-200 text-red-600 font-bold text-sm">إنهاء والخروج</button>
                <button onClick={() => setExitPrompt(false)} className="py-3 rounded-[14px] bg-[#5B3FD6] text-white font-bold text-sm">متابعة الجلسة</button>
              </div>
            </div>
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
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0">
            <PlayCircle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg">جلسة المراجعة</h1>
            <p className="text-xs text-[#DDD5FF] mt-0.5">اختر نوع الجلسة وعدد الأسئلة والمحاور</p>
          </div>
        </div>
      </div>

      {/* Session Mode */}
      <div className="bg-white rounded-[20px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-[#2C2145]">نوع الجلسة</h3>
          <span className="text-[11px] text-gray-400">اختر المصدر الأنسب للمراجعة</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['classic', '📚 كلاسيكية', `${playableCount} جاهز`],
            ['smart', '✨ ذكية', `${smartCount} مقترح`],
            ['review', '🧠 مستحقة', `${dueReviewCount} مستحق`],
            ['mistakes', '❌ أخطائي', `${mistakesCount} سؤال`],
            ['favorites', '❤️ المفضلة', `${favoritesCount} سؤال`],
          ].map(([mode, title, subtitle]) => {
            const unavailable =
              (mode === 'review' && dueReviewCount === 0) ||
              (mode === 'mistakes' && mistakesCount === 0) ||
              (mode === 'favorites' && favoritesCount === 0) ||
              (mode === 'smart' && smartCount === 0);
            return (
              <button
                key={mode}
                onClick={() => setSessionMode(mode as 'classic' | 'review' | 'mistakes' | 'favorites' | 'smart')}
                disabled={unavailable}
                className={`p-3.5 rounded-[16px] border text-right transition-all disabled:opacity-40 ${
                  sessionMode === mode
                    ? 'bg-[#F5F3FF] border-[#5B3FD6] text-[#5B3FD6]'
                    : 'bg-white border-[#E7E3EF] text-gray-700'
                }`}
              >
                <span className="block text-sm font-bold">{title}</span>
                <span className="block text-[11px] mt-1 opacity-70">{subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

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

      {/* Comfortable question settings */}
      <div className="bg-white rounded-[20px] p-4.5 shadow-xs border border-gray-100 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-sm text-[#2C2145]">إعدادات الأسئلة</h3>
          <p className="text-[11px] text-gray-400 mt-1">تُحفظ اختياراتك تلقائيًا للجلسات القادمة</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2C2145]">
            <Clock3 className="w-4 h-4 text-[#5B3FD6]" />
            الوقت لكل سؤال
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              [0, 'بدون'],
              [15, '15ث'],
              [30, '30ث'],
              [60, '60ث'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setQuestionTimeLimit(Number(value))}
                className={`py-2.5 rounded-[12px] text-xs font-bold border transition-all ${
                  questionTimeLimit === Number(value)
                    ? 'bg-[#5B3FD6] text-white border-[#5B3FD6]'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {[
          {
            icon: FastForward,
            title: 'الانتقال التلقائي',
            description: 'ينتقل للسؤال التالي بعد ظهور النتيجة',
            value: autoAdvance,
            toggle: () => setAutoAdvance((value) => !value),
          },
          {
            icon: Eye,
            title: 'إظهار الشرح بعد الإجابة',
            description: 'عرض تفسير السؤال إن كان متوفرًا',
            value: showExplanation,
            toggle: () => setShowExplanation((value) => !value),
          },
          {
            icon: Shuffle,
            title: 'خلط ترتيب الخيارات',
            description: 'يغيّر موضع الإجابة الصحيحة في كل سؤال',
            value: shuffleOptions,
            toggle: () => setShuffleOptions((value) => !value),
          },
          {
            icon: Gauge,
            title: 'إظهار تقدم الجلسة',
            description: 'إظهار رقم السؤال وشريط التقدم',
            value: showProgress,
            toggle: () => setShowProgress((value) => !value),
          },
        ].map(({ icon: Icon, title, description, value, toggle }) => (
          <button
            key={title}
            onClick={toggle}
            className="w-full flex items-center justify-between gap-3 text-right"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-[12px] bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#2C2145]">{title}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{description}</div>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full p-1 transition-colors shrink-0 ${
              value ? 'bg-[#5B3FD6]' : 'bg-gray-300'
            }`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                value ? '-translate-x-5' : 'translate-x-0'
              }`} />
            </div>
          </button>
        ))}
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
        disabled={
          playableCount === 0 ||
          (sessionMode === 'review' && dueReviewCount === 0) ||
          (sessionMode === 'mistakes' && mistakesCount === 0) ||
          (sessionMode === 'favorites' && favoritesCount === 0) ||
          (sessionMode === 'smart' && smartCount === 0)
        }
        className={`w-full h-14 rounded-[18px] font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98 ${
          playableCount > 0 &&
          !(
            (sessionMode === 'review' && dueReviewCount === 0) ||
            (sessionMode === 'mistakes' && mistakesCount === 0) ||
            (sessionMode === 'favorites' && favoritesCount === 0) ||
            (sessionMode === 'smart' && smartCount === 0)
          )
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
