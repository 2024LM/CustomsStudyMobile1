import React, { useState, useEffect } from 'react';
import {
  Home,
  BookOpen,
  PlayCircle,
  BookMarked,
  MoreHorizontal,
} from 'lucide-react';
import { Page, QuizQuestion, RemoteState } from './types';
import { db } from './services/db';
import { fetchRemoteConfig } from './services/remoteConfig';
import { showInterstitial } from './services/ads';
import { SplashScreen } from './components/SplashScreen';
import { AnnouncementModal } from './components/AnnouncementModal';
import { UpdateBanner } from './components/UpdateBanner';
import { DirectQuestionModal } from './components/DirectQuestionModal';
import { NotificationsModal } from './components/NotificationsModal';
import { Onboarding } from './components/Onboarding';
import { GuidedTour, TourStep } from './components/GuidedTour';
import { RatingPrompt } from './components/RatingPrompt';

import { HomePage } from './views/HomePage';
import { QuestionsPage } from './views/QuestionsPage';
import { SessionPage } from './views/SessionPage';
import { MistakesPage } from './views/MistakesPage';
import { FavoritesPage } from './views/FavoritesPage';
import { BanksPage } from './views/BanksPage';
import { ReminderSettings } from './views/ReminderSettings';
import { MorePage } from './views/MorePage';
import { ReferencesPage } from './views/ReferencesPage';

export function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem('profile_username')?.trim() || '');
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('onboarding_version') === '1' && Boolean(localStorage.getItem('profile_username')?.trim()));
  const [tourRefresh, setTourRefresh] = useState(0);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('app_theme') === 'dark');
  const [startupAdHandled, setStartupAdHandled] = useState(false);
  const [page, setPage] = useState<Page>('HOME');
  const [sessionTopic, setSessionTopic] = useState<string | string[] | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [remote, setRemote] = useState<RemoteState>(() => db.cachedRemote());
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [directQuestion, setDirectQuestion] = useState<QuizQuestion | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [, setDbVersion] = useState(0);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [sessionFocus, setSessionFocus] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('app_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Subscribe to DB changes so any child updates trigger fresh reads
  useEffect(() => {
    return db.subscribe(() => setDbVersion((v) => v + 1));
  }, []);

  // 800ms Splash Delay (identical to Compose LaunchedEffect(Unit) { delay(800); ready = true })
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Show one interstitial after the splash screen for returning users only.
  // First-run onboarding stays ad-free so setup cannot be interrupted.
  useEffect(() => {
    if (!ready || startupAdHandled || !onboardingComplete) return;
    let active = true;
    const run = async () => {
      await showInterstitial();
      if (active) setStartupAdHandled(true);
    };
    void run();
    return () => {
      active = false;
    };
  }, [ready, startupAdHandled, onboardingComplete]);

  // Remote Config fetch
  useEffect(() => {
    fetchRemoteConfig().then((fetched) => {
      if (fetched) {
        db.saveRemote(fetched);
        setRemote(fetched);
      }
    });
  }, []);


  // Track real app use and show the remotely-controlled rating prompt only
  // after the configured age/launch thresholds and cooldown have elapsed.
  useEffect(() => {
    if (!onboardingComplete) return;
    const now = Date.now();
    const firstUse = Number(localStorage.getItem('rating_first_use_at')) || now;
    const launches = (Number(localStorage.getItem('rating_launch_count')) || 0) + 1;
    localStorage.setItem('rating_first_use_at', String(firstUse));
    localStorage.setItem('rating_launch_count', String(launches));
  }, [onboardingComplete]);

  useEffect(() => {
    const cfg = remote.ratingPrompt;
    if (!ready || !startupAdHandled || !onboardingComplete || !cfg?.enabled || !cfg.storeUrl) {
      setShowRatingPrompt(false);
      return;
    }
    const firstUse = Number(localStorage.getItem('rating_first_use_at')) || Date.now();
    const launches = Number(localStorage.getItem('rating_launch_count')) || 0;
    const lastPrompt = Number(localStorage.getItem('rating_last_prompt_at')) || 0;
    const day = 24 * 60 * 60 * 1000;
    const eligible = Date.now() - firstUse >= cfg.minUsageDays * day
      && launches >= cfg.minLaunches
      && (!lastPrompt || Date.now() - lastPrompt >= cfg.repeatAfterDays * day);
    if (!eligible) return;
    const timer = window.setTimeout(() => setShowRatingPrompt(true), 45000);
    return () => window.clearTimeout(timer);
  }, [remote.ratingPrompt, ready, startupAdHandled, onboardingComplete]);

  // Periodic Reminder background check (if reminders enabled)
  useEffect(() => {
    const interval = setInterval(() => {
      const enabled = db.setting('reminders_enabled', '0') === '1';
      if (enabled && 'Notification' in window && Notification.permission === 'granted') {
        const randomQ = db.randomQuestion();
        if (randomQ) {
          try {
            new Notification('🎓 تذكير مراجعة الجمارك', {
              body: randomQ.question,
              icon: '/favicon.ico',
            });
          } catch {
            // ignore
          }
        }
      }
    }, 60 * 60 * 1000); // 1 hour check
    return () => clearInterval(interval);
  }, []);

  if (!ready) {
    return <SplashScreen />;
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={(name) => {
          const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
          if (clean.length < 2) return;
          localStorage.setItem('profile_username', clean);
          localStorage.setItem('onboarding_version', '1');
          setUsername(clean);
          setOnboardingComplete(true);
          setStartupAdHandled(true);
          setTourRefresh((v) => v + 1);
        }}
      />
    );
  }

  if (!startupAdHandled) {
    return <SplashScreen />;
  }

  const showAnnouncement =
    remote.announcementEnabled &&
    Boolean(remote.announcementId) &&
    !announcementDismissed &&
    !db.announcementSeen(remote.announcementId);

  // Count persisted notifications, including older GitHub messages no longer in remote_config.
  const unreadNotificationsCount = db.storedNotifications().filter((n) => !db.isNotificationRead(n.id)).length;

  const refreshRemote = async () => {
    const fetched = await fetchRemoteConfig();
    if (fetched) {
      db.saveRemote(fetched);
      setRemote(fetched);
    }
  };

  const startSessionWithTopic = (topic?: string | string[], count?: number) => {
    setSessionTopic(topic || null);
    setSessionCount(count || null);
    setPage('SESSION');
  };


  const tourDefinitions: Partial<Record<Page, TourStep[]>> = {
    HOME: [
      { target: 'home-hero', title: 'هذه صفحتك الرئيسية', text: 'هنا يظهر اسمك والبنك النشط، ومن هنا تصل إلى الإشعارات وتغيير المظهر.' },
      { target: 'home-progress', title: 'تقدمك العام', text: 'راقب عدد إجاباتك ونسبة نجاحك أثناء المراجعة.' },
      { target: 'home-activity', title: 'نشاط المراجعة', text: 'تابع نشاطك يوميًا وأسبوعيًا وشهريًا، واختر بنكًا محددًا عند توفر أكثر من بنك.' },
      { target: 'home-start-session', title: 'ابدأ جلسة مراجعة', text: 'ابدأ جلسة جديدة للمراجعة من هنا.' },
      { target: 'bottom-navigation', title: 'التنقل داخل التطبيق', text: 'استخدم هذا الشريط للوصول إلى الأسئلة والجلسات والمراجع والمزيد.' },
    ],
    QUESTIONS: [
      { target: 'questions-search', title: 'البحث في الأسئلة', text: 'ابحث عن سؤال أو محور داخل البنك النشط.' },
      { target: 'questions-filter', title: 'فلترة نوع السؤال', text: 'اعرض جميع الأسئلة أو أسئلة الاختيار المتعدد أو المفتوحة أو الشفهية.' },
      { target: 'questions-list', title: 'قائمة الأسئلة', text: 'من هنا تتصفح الأسئلة وبياناتها وتراجع محتوى البنك.' },
    ],
    SESSION: [
      { target: 'session-count', title: 'عدد أسئلة الجلسة', text: 'حدد حجم جلسة المراجعة الذي يناسب وقتك.' },
      { target: 'session-topics', title: 'اختيار المحاور', text: 'يمكنك اختيار محور واحد أو عدة محاور، أو تركها بدون تحديد لجلسة متنوعة.' },
      { target: 'session-start', title: 'بدء الجلسة', text: 'بعد ضبط خياراتك، ابدأ جلسة المراجعة من هنا.' },
    ],
    REFERENCES: [
      { target: 'references-library', title: 'مكتبة المراجع', text: 'هنا تظهر المراجع والقوالب والمستندات المنشورة للتطبيق.' },
      { target: 'references-search', title: 'البحث في المراجع', text: 'ابحث بسرعة عن المرجع الذي تحتاج إليه.' },
      { target: 'references-categories', title: 'تصنيفات المراجع', text: 'استخدم التصنيفات لتضييق النتائج والوصول إلى المحتوى المطلوب.' },
    ],
    MORE: [
      { target: 'more-menu', title: 'أدوات إضافية', text: 'من هنا تصل إلى أخطائك والمفضلة وبنوك الأسئلة والإشعارات والإعدادات.' },
    ],
    BANKS: [
      { target: 'banks-import', title: 'استيراد بنك', text: 'يمكنك إضافة بنك أسئلة من ملف XLSX متوافق.' },
      { target: 'banks-download', title: 'بنوك قابلة للتحميل', text: 'البنوك المنشورة للتطبيق تظهر هنا ويمكن تنزيلها وفحصها قبل الاستيراد.' },
      { target: 'banks-list', title: 'البنوك الموجودة', text: 'اختر البنك الذي تريد استخدامه للمراجعة من قائمة البنوك المتاحة.' },
    ],
  };
  const currentTourSteps = tourDefinitions[page];
  const currentTourKey = `guided_tour_${page.toLowerCase()}_v1`;
  const shouldShowCurrentTour = Boolean(
    onboardingComplete &&
    currentTourSteps?.length &&
    localStorage.getItem(currentTourKey) !== '1'
  );

  const navItems = [
    { p: 'HOME' as Page, title: 'الرئيسية', icon: Home },
    { p: 'QUESTIONS' as Page, title: 'الأسئلة', icon: BookOpen },
    { p: 'SESSION' as Page, title: 'جلسة', icon: PlayCircle },
    { p: 'REFERENCES' as Page, title: 'مراجع', icon: BookMarked },
    { p: 'MORE' as Page, title: 'المزيد', icon: MoreHorizontal },
  ];

  return (
    <div className="app-shell min-h-screen bg-[#F8F9FD] flex justify-center text-[#2C2145]">
      {/* Container - Styled as native mobile/tablet shell */}
      <div className="w-full max-w-md min-h-screen bg-[#F8F9FD] flex flex-col relative pb-20 shadow-md border-x border-gray-100">
        {shouldShowCurrentTour && currentTourSteps && (
          <GuidedTour
            key={`${page}-${tourRefresh}`}
            steps={currentTourSteps}
            onComplete={() => {
              localStorage.setItem(currentTourKey, '1');
              setTourRefresh((v) => v + 1);
            }}
          />
        )}

        {showRatingPrompt && remote.ratingPrompt && !shouldShowCurrentTour && !showAnnouncement && !showNotificationsModal && !directQuestion && (
          <RatingPrompt
            config={remote.ratingPrompt}
            onDismiss={() => {
              localStorage.setItem('rating_last_prompt_at', String(Date.now()));
              setShowRatingPrompt(false);
            }}
            onRated={(stars) => {
              localStorage.setItem('rating_last_prompt_at', String(Date.now()));
              localStorage.setItem('rating_last_stars', String(stars));
              setShowRatingPrompt(false);
              window.open(remote.ratingPrompt!.storeUrl, '_blank', 'noopener,noreferrer');
            }}
          />
        )}

        {/* Update Banner */}
        <UpdateBanner remote={remote} />

        {/* Remote Announcement Dialog */}
        {showAnnouncement && (
          <AnnouncementModal
            remote={remote}
            onClose={() => setAnnouncementDismissed(true)}
          />
        )}

        {/* Notifications Modal */}
        {showNotificationsModal && (
          <NotificationsModal
            remote={remote}
            onClose={() => setShowNotificationsModal(false)}
            onRefresh={refreshRemote}
          />
        )}

        {/* Direct Review Question Modal */}
        {directQuestion && (
          <DirectQuestionModal
            question={directQuestion}
            onClose={() => setDirectQuestion(null)}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 overflow-y-auto">
          {page === 'HOME' && (
            <HomePage
              onStartSession={startSessionWithTopic}
              onViewQuestions={() => setPage('QUESTIONS')}
              onViewMistakes={() => setPage('MISTAKES')}
              onOpenNotifications={() => setShowNotificationsModal(true)}
              unreadNotificationsCount={unreadNotificationsCount}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((value) => !value)}
              username={username}
            />
          )}

          {page === 'QUESTIONS' && <QuestionsPage />}

          {page === 'SESSION' && (
            <SessionPage
              key={Array.isArray(sessionTopic) ? sessionTopic.join('|') : (sessionTopic || 'all')}
              initialTopic={sessionTopic}
              onActiveChange={setSessionFocus}
              onExit={() => setPage('HOME')}
            />
          )}

          {page === 'REFERENCES' && <ReferencesPage />}

          {page === 'MISTAKES' && <MistakesPage />}

          {page === 'FAVORITES' && <FavoritesPage />}

          {page === 'BANKS' && <BanksPage onBankSelected={() => setPage('HOME')} />}

          {page === 'SETTINGS' && (
            <ReminderSettings
              onTriggerDirectQuestion={() => {
                const randomQ = db.randomQuestion();
                if (randomQ) setDirectQuestion(randomQ);
              }}
            />
          )}

          {page === 'MORE' && (
            <MorePage
              onGoToMistakes={() => setPage('MISTAKES')}
              onGoToFavorites={() => setPage('FAVORITES')}
              onGoToBanks={() => setPage('BANKS')}
              onGoToSettings={() => setPage('SETTINGS')}
              onOpenNotifications={() => setShowNotificationsModal(true)}
              unreadNotificationsCount={unreadNotificationsCount}
              remote={remote}
              onRefreshRemote={refreshRemote}
            />
          )}
        </main>

        {/* Bottom Navigation Bar */}
        {!sessionFocus && <nav data-tour="bottom-navigation" className="fixed bottom-0 max-w-md w-full bg-white/95 backdrop-blur-md border-t border-gray-100 py-1 px-2 z-40 flex items-center justify-around shadow-sm">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected =
              page === item.p ||
              (item.p === 'MORE' &&
                ['MISTAKES', 'FAVORITES', 'BANKS', 'SETTINGS'].includes(page));

            return (
              <button
                key={item.p}
                onClick={() => {
                  if (item.p === 'SESSION') {
                    setSessionTopic(null);
                  }
                  setPage(item.p);
                }}
                className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 relative transition-colors cursor-pointer"
              >
                <div
                  className={`w-12 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#F5F3FF] text-[#5B3FD6]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[11px] font-semibold tracking-tight mt-0.5 ${
                    isSelected ? 'text-[#5B3FD6] font-bold' : 'text-gray-400'
                  }`}
                >
                  {item.title}
                </span>
              </button>
            );
          })}
        </nav>}
      </div>
    </div>
  );
}

export default App;
