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
              initialTopic={Array.isArray(sessionTopic) ? sessionTopic[0] ?? null : sessionTopic}
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
        <nav className="fixed bottom-0 max-w-md w-full bg-white/95 backdrop-blur-md border-t border-gray-100 py-1 px-2 z-40 flex items-center justify-around shadow-sm">
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
        </nav>
      </div>
    </div>
  );
}

export default App;
