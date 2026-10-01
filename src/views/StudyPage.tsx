import React, { useEffect, useState } from 'react';
import { BookOpen, PlayCircle } from 'lucide-react';
import { QuestionsPage } from './QuestionsPage';
import { SessionPage } from './SessionPage';

interface StudyPageProps {
  initialView?: 'browse' | 'session';
  initialTopic?: string | string[] | null;
  initialMode?: 'classic' | 'review' | 'mistakes' | 'favorites' | 'smart';
  initialCount?: number | null;
  autoStart?: boolean;
  onActiveChange?: (active: boolean) => void;
  onSessionExit?: () => void;
}

export const StudyPage: React.FC<StudyPageProps> = ({
  initialView = 'browse',
  initialTopic = null,
  initialMode = 'classic',
  initialCount = null,
  autoStart = false,
  onActiveChange,
  onSessionExit,
}) => {
  const [view, setView] = useState<'browse' | 'session'>(initialView);
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => {
    setView(initialView);
  }, [initialView, initialTopic, initialMode, initialCount, autoStart]);

  const handleSessionActive = (active: boolean) => {
    setSessionActive(active);
    onActiveChange?.(active);
  };

  return (
    <div className="flex flex-col gap-3 pb-8 text-right">
      {!sessionActive && (
        <>
          <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-lg">الأسئلة والمراجعة</h1>
                <p className="text-xs text-[#DDD5FF] mt-0.5">تصفح بنك الأسئلة أو ابدأ جلسة اختبار من نفس المكان</p>
              </div>
            </div>
          </div>

          <div data-tour="study-mode-switch" className="grid grid-cols-2 gap-1.5 bg-white border border-[#E6E2F0] rounded-[16px] p-1.5 shadow-xs">
            <button
              type="button"
              onClick={() => setView('browse')}
              className={`h-11 rounded-[12px] flex items-center justify-center gap-2 text-xs font-black transition-all ${
                view === 'browse'
                  ? 'bg-[#5B3FD6] text-white shadow-sm'
                  : 'text-gray-500 bg-transparent'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              تصفح الأسئلة
            </button>
            <button
              type="button"
              onClick={() => setView('session')}
              className={`h-11 rounded-[12px] flex items-center justify-center gap-2 text-xs font-black transition-all ${
                view === 'session'
                  ? 'bg-[#5B3FD6] text-white shadow-sm'
                  : 'text-gray-500 bg-transparent'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              جلسة اختبار
            </button>
          </div>
        </>
      )}

      {view === 'browse' ? (
        <QuestionsPage embedded />
      ) : (
        <SessionPage
          key={[
            Array.isArray(initialTopic) ? initialTopic.join('|') : (initialTopic || 'all'),
            initialMode,
            initialCount || 0,
            autoStart ? 'auto' : 'manual',
          ].join(':')}
          initialTopic={initialTopic}
          initialMode={initialMode}
          initialCount={initialCount}
          autoStart={autoStart}
          embedded
          onActiveChange={handleSessionActive}
          onExit={() => {
            setSessionActive(false);
            onActiveChange?.(false);
            setView('browse');
            onSessionExit?.();
          }}
        />
      )}
    </div>
  );
};
