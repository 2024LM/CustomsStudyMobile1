import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Home,
  BookOpen,
  BookMarked,
  MoreHorizontal,
  Sparkles,
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
const NewsPage = lazy(() => import('./views/NewsPage').then(module => ({ default: module.NewsPage })));
const StudyPage = lazy(() => import('./views/StudyPage').then(module => ({ default: module.StudyPage })));
const MistakesPage = lazy(() => import('./views/MistakesPage').then(module => ({ default: module.MistakesPage })));
const FavoritesPage = lazy(() => import('./views/FavoritesPage').then(module => ({ default: module.FavoritesPage })));
const BanksPage = lazy(() => import('./views/BanksPage').then(module => ({ default: module.BanksPage })));
const DomainsPage = lazy(() => import('./views/DomainsPage').then(module => ({ default: module.DomainsPage })));
const MorePage = lazy(() => import('./views/MorePage').then(module => ({ default: module.MorePage })));
const ReferencesPage = lazy(() => import('./views/ReferencesPage').then(module => ({ default: module.ReferencesPage })));
const StudyPlanPage = lazy(() => import('./views/StudyPlanPage').then(module => ({ default: module.StudyPlanPage })));
const DownloadsPage = lazy(() => import('./views/DownloadsPage').then(module => ({ default: module.DownloadsPage })));
const AdvancedStudyPage = lazy(() => import('./views/AdvancedStudyPage').then(module => ({ default: module.AdvancedStudyPage })));
const AiSettingsPage = lazy(() => import('./views/AiSettingsPage').then(module => ({ default: module.AiSettingsPage })));
const AiAssistantPage = lazy(() => import('./views/AiAssistantPage').then(module => ({ default: module.AiAssistantPage })));
const VoiceSettingsPage = lazy(() => import('./views/VoiceSettingsPage').then(module => ({ default: module.VoiceSettingsPage })));
import { consumePendingQuestion } from './services/studyAlarm';

type ThemeMode = 'system' | 'light' | 'dark';

function getSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState(() => localStorage.getItem('profile_username')?.trim() || '');
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('onboarding_version') === '1' && Boolean(localStorage.getItem('profile_username')?.trim()));
  const [tourRefresh, setTourRefresh] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('app_theme');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });
  const [systemDark, setSystemDark] = useState(() => getSystemDark());
  const darkMode = themeMode === 'dark' || (themeMode === 'system' && systemDark);
  const [startupAdHandled, setStartupAdHandled] = useState(false);
  const [page, setPage] = useState<Page>('HOME');
  const [sessionTopic, setSessionTopic] = useState<string | string[] | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [sessionMode, setSessionMode] = useState<'classic' | 'review' | 'mistakes' | 'favorites' | 'smart'>('classic');
  const [sessionAutoStart, setSessionAutoStart] = useState(false);
  const [remote, setRemote] = useState<RemoteState>(() => db.cachedRemote());
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [directQuestion, setDirectQuestion] = useState<QuizQuestion | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [sessionFocus, setSessionFocus] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    localStorage.setItem('app_theme', themeMode);
  }, [darkMode, themeMode]);

  useEffect(() => {
    const onStorageStatus = (event: Event) => {
      setStorageWarning(!(event as CustomEvent<boolean>).detail);
    };
    window.addEventListener('raje3-storage-status', onStorageStatus);
    return () => window.removeEventListener('raje3-storage-status', onStorageStatus);
  }, []);

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

  useEffect(() => {
    if (!ready || !onboardingComplete) return;

    let active = true;
    const openPendingQuestion = async () => {
      const pending = await consumePendingQuestion();
      if (!active || !pending) return;
      const question = db.questionByRowId(pending.rowId, pending.bankId);
      if (question) {
        setDirectQuestion(question);
      }
    };

    void openPendingQuestion();
    const onFocus = () => void openPendingQuestion();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void openPendingQuestion();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ready, onboardingComplete]);

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

  // Remote configuration:
  // - read once on app start
  // - refresh when the app returns to the foreground if the last check is older than 5 minutes
  // - refresh every 30 minutes while the app remains open
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;
    const PERIODIC_REFRESH_MS = 30 * 60 * 1000;

    const refreshRemoteConfig = async (force = false) => {
      if (!active || inFlight) return;

      const cached = db.cachedRemote();
      const lastCheckedAt = Number(cached.lastCheckedAt || 0);
      if (!force && lastCheckedAt && Date.now() - lastCheckedAt < FOREGROUND_REFRESH_MS) {
        return;
      }

      inFlight = true;
      try {
        const fetched = await fetchRemoteConfig();
        if (active && fetched) {
          db.saveRemote(fetched);
          setRemote(fetched);
        }
      } finally {
        inFlight = false;
      }
    };

    void refreshRemoteConfig(true);

    const onFocus = () => void refreshRemoteConfig(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshRemoteConfig(false);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshRemoteConfig(true);
      }
    }, PERIODIC_REFRESH_MS);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
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

  const startSessionWithTopic = (
    topic?: string | string[],
    count?: number,
    mode: 'classic' | 'review' | 'mistakes' | 'favorites' | 'smart' = 'classic',
    autoStart: boolean = false
  ) => {
    setSessionTopic(topic || null);
    setSessionCount(count || null);
    setSessionMode(mode);
    setSessionAutoStart(autoStart);
    setPage('SESSION');
  };


  const tourDefinitions: Partial<Record<Page, TourStep[]>> = {
    HOME: [
      { target: 'home-hero', title: 'هذه صفحتك الرئيسية', text: 'هنا يظهر اسمك والبنك النشط، ومن هنا تصل إلى الإشعارات وتغيير المظهر.' },
      { target: 'home-progress', title: 'تقدمك العام', text: 'راقب عدد إجاباتك ونسبة نجاحك أثناء المراجعة.' },
      { target: 'home-activity', title: 'نشاط المراجعة', text: 'تابع نشاطك يوميًا وأسبوعيًا وشهريًا، واختر بنكًا محددًا عند توفر أكثر من بنك.' },
      { target: 'home-start-session', title: 'ابدأ جلسة مراجعة', text: 'ابدأ جلسة جديدة للمراجعة من هنا.' },
      { target: 'bottom-navigation', title: 'التنقل داخل التطبيق', text: 'استخدم هذا الشريط للوصول إلى الأسئلة والمراجعة والذكاء الاصطناعي والمراجع والمزيد.' },
    ],
    QUESTIONS: [
      { target: 'study-mode-switch', title: 'الأسئلة والجلسات في مكان واحد', text: 'بدّل هنا بين تصفح بنك الأسئلة وإعداد جلسة اختبار.' },
      { target: 'questions-search', title: 'البحث في الأسئلة', text: 'ابحث عن سؤال أو محور داخل البنك النشط.' },
      { target: 'questions-filter', title: 'فلترة نوع السؤال', text: 'اعرض جميع الأسئلة أو أسئلة الاختيار المتعدد أو المفتوحة أو الشفهية.' },
      { target: 'questions-list', title: 'قائمة الأسئلة', text: 'من هنا تتصفح الأسئلة وبياناتها وتراجع محتوى البنك.' },
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
    { p: 'AI_ASSISTANT' as Page, title: 'AI', icon: Sparkles },
    { p: 'REFERENCES' as Page, title: 'مراجع', icon: BookMarked },
    { p: 'MORE' as Page, title: 'المزيد', icon: MoreHorizontal },
  ];

  return (
    <div className="app-shell h-[100dvh] min-h-0 overflow-hidden bg-[#F8F9FD] flex justify-center text-[#2C2145]">
      {/* Container - Styled as native mobile/tablet shell */}
      <div className="w-full h-[100dvh] min-h-0 bg-[#F8F9FD] flex flex-col relative">
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
        {storageWarning && (
          <div role="alert" className="shrink-0 bg-red-50 text-red-600 px-4 py-3 text-sm font-semibold">
            تعذر حفظ آخر تغييراتك على هذا الجهاز. قد تفقدها عند إغلاق التطبيق. حرر مساحة تخزين وحاول مجددًا.
          </div>
        )}
        <main className="flex-1 min-h-0 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain">
          <Suspense fallback={<div className="py-12 text-center text-sm text-gray-400" role="status">جارٍ التحميل…</div>}>
          {page === 'HOME' && (
            <HomePage
              dataVersion={dbVersion}
              onStartSession={startSessionWithTopic}
              onViewQuestions={() => setPage('QUESTIONS')}
              onViewMistakes={() => setPage('MISTAKES')}
              onOpenNews={() => setPage('NEWS')}
              onOpenNotifications={() => setShowNotificationsModal(true)}
              onOpenStudyCenter={() => setPage('ADVANCED')}
              unreadNotificationsCount={unreadNotificationsCount}
              darkMode={darkMode}
              themeMode={themeMode}
              onCycleTheme={() => setThemeMode((mode) => mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system')}
              username={username}
            />
          )}

          {page === 'NEWS' && <NewsPage />}

          {(page === 'QUESTIONS' || page === 'SESSION') && (
            <StudyPage
              key={[
                page,
                Array.isArray(sessionTopic) ? sessionTopic.join('|') : (sessionTopic || 'all'),
                sessionMode,
                sessionCount || 0,
                sessionAutoStart ? 'auto' : 'manual',
              ].join(':')}
              initialView={page === 'SESSION' || sessionAutoStart ? 'session' : 'browse'}
              initialTopic={sessionTopic}
              initialMode={sessionMode}
              initialCount={sessionCount}
              autoStart={sessionAutoStart}
              onActiveChange={setSessionFocus}
              onSessionExit={() => {
                setSessionTopic(null);
                setSessionCount(null);
                setSessionMode('classic');
                setSessionAutoStart(false);
                setPage('QUESTIONS');
              }}
            />
          )}

          {page === 'REFERENCES' && <ReferencesPage />}

          {page === 'MISTAKES' && <MistakesPage onBack={() => setPage('MORE')} />}

          {page === 'FAVORITES' && <FavoritesPage onBack={() => setPage('MORE')} />}

          {page === 'BANKS' && <BanksPage onBankSelected={() => setPage('HOME')} onBack={() => setPage('MORE')} />}

          {page === 'DOMAINS' && <DomainsPage onDomainSelected={() => setPage('HOME')} onBack={() => setPage('MORE')} />}

          {page === 'PLAN' && (
            <StudyPlanPage
              onBack={() => setPage('MORE')}
              onStartReview={(count) => startSessionWithTopic(undefined, count, 'classic', true)}
            />
          )}

          {page === 'DOWNLOADS' && <DownloadsPage onBack={() => setPage('MORE')} />}

          {page === 'ADVANCED' && <AdvancedStudyPage onBack={() => setPage('MORE')} />}

          {page === 'AI_SETTINGS' && <AiSettingsPage onBack={() => setPage('MORE')} />}

          {page === 'VOICE_SETTINGS' && <VoiceSettingsPage onBack={() => setPage('MORE')} />}

          {page === 'AI_ASSISTANT' && (
            <AiAssistantPage onOpenSettings={() => setPage('AI_SETTINGS')} />
          )}



          {page === 'MORE' && (
            <MorePage
              onGoToMistakes={() => setPage('MISTAKES')}
              onGoToFavorites={() => setPage('FAVORITES')}
              onGoToBanks={() => setPage('BANKS')}
              onGoToDomains={() => setPage('DOMAINS')}
              onGoToPlan={() => setPage('PLAN')}
              onGoToDownloads={() => setPage('DOWNLOADS')}
              onGoToAdvanced={() => setPage('ADVANCED')}
              onGoToAiSettings={() => setPage('AI_SETTINGS')}
              onGoToVoiceSettings={() => setPage('VOICE_SETTINGS')}
              onOpenNotifications={() => setShowNotificationsModal(true)}
              unreadNotificationsCount={unreadNotificationsCount}
              remote={remote}
              onRefreshRemote={refreshRemote}
            />
          )}
          </Suspense>
        </main>

        {/* Bottom Navigation Bar */}
        {!sessionFocus && (
          <nav data-tour="bottom-navigation" className="fixed bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] px-1 z-40 shadow-sm">
            <div className="flex items-center justify-around">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isSelected =
                  page === item.p ||
                  (item.p === 'QUESTIONS' && page === 'SESSION') ||
                  (item.p === 'MORE' &&
                    ['MISTAKES', 'FAVORITES', 'BANKS', 'DOMAINS', 'PLAN', 'DOWNLOADS', 'ADVANCED', 'AI_SETTINGS', 'VOICE_SETTINGS'].includes(page));

                return (
                  <button
                    key={item.p}
                    onClick={() => {
                      if (item.p === 'QUESTIONS') {
                        setSessionTopic(null);
                        setSessionCount(null);
                        setSessionMode('classic');
                        setSessionAutoStart(false);
                      }
                      setPage(item.p);
                    }}
                    className="flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 relative transition-colors cursor-pointer"
                  >
                    <div className={`w-10 h-8 rounded-full flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-[#F5F3FF] text-[#5B3FD6]' : 'text-gray-400 hover:text-gray-600'
                    }`}>
                      <Icon className={`w-5 h-5 ${item.p === 'AI_ASSISTANT' ? 'stroke-[2.3]' : ''}`} />
                    </div>
                    <span className={`text-[12px] sm:text-[12px] font-semibold tracking-tight mt-0.5 truncate max-w-full ${
                      isSelected ? 'text-[#5B3FD6] font-bold' : 'text-gray-400'
                    }`}>
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

export default App;
