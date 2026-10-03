import React from 'react';
import {NewsSourceSettings} from '../features/news/components/NewsSourceSettings';
import {
  AlertCircle,
  Heart,
  Library,
  Layers3,
  Bell,
  CalendarDays,
  HardDrive,
  BrainCircuit,
  ChevronLeft,
  MoreHorizontal,
  Sparkles,
  Volume2,
  Facebook,
  Instagram,
  Youtube,
  Globe2,
} from 'lucide-react';
import { RemoteState } from '../types';
import { appConfig } from '../config/appConfig';
import { fetchSocialLinks, SocialLinks } from '../services/socialLinks';

const DiscordIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M19.54 5.34A16.6 16.6 0 0 0 15.44 4l-.2.4c1.5.45 2.2.9 3.12 1.55a12.7 12.7 0 0 0-12.72 0A12.7 12.7 0 0 1 8.76 4.4L8.56 4a16.6 16.6 0 0 0-4.1 1.34C1.86 9.2 1.15 12.95 1.5 16.65A16.8 16.8 0 0 0 6.55 19.2l1.22-1.68a10.8 10.8 0 0 1-1.92-.92l.47-.36c3.7 1.72 7.7 1.72 11.36 0l.47.36a10.8 10.8 0 0 1-1.92.92l1.22 1.68a16.8 16.8 0 0 0 5.05-2.55c.42-4.28-.72-7.98-2.96-11.31ZM8.25 14.65c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28 2.02 1.03 2 2.28c0 1.26-.9 2.28-2 2.28Zm7.5 0c-1.1 0-2-1.02-2-2.28s.88-2.28 2-2.28 2.02 1.03 2 2.28c0 1.26-.9 2.28-2 2.28Z" />
  </svg>
);

interface MorePageProps {
  onGoToMistakes: () => void;
  onGoToFavorites: () => void;
  onGoToBanks: () => void;
  onGoToDomains: () => void;
  onGoToPlan: () => void;
  onGoToDownloads: () => void;
  onGoToAdvanced: () => void;
  onGoToAiSettings: () => void;
  onGoToVoiceSettings: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  remote: RemoteState;
  onRefreshRemote?: () => Promise<void>;
}

export const MorePage: React.FC<MorePageProps> = ({
  onGoToMistakes,
  onGoToFavorites,
  onGoToBanks,
  onGoToDomains,
  onGoToPlan,
  onGoToDownloads,
  onGoToAdvanced,
  onGoToAiSettings,
  onGoToVoiceSettings,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  remote,
  onRefreshRemote,
}) => {
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const [checkStatus, setCheckStatus] = React.useState<string | null>(null);
  const [socialLinks, setSocialLinks] = React.useState<SocialLinks>({});

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      const links = await fetchSocialLinks();
      if (active) setSocialLinks(links);
    };

    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleCheckUpdate = async () => {
    if (!onRefreshRemote || checkingUpdate) return;
    setCheckingUpdate(true);
    setCheckStatus(null);
    try {
      await onRefreshRemote();
      setCheckStatus('تم فحص التحديثات بنجاح.');
    } catch {
      setCheckStatus('تعذر الاتصال بخدمة التحديثات حاليًا.');
    } finally {
      setCheckingUpdate(false);
      setTimeout(() => setCheckStatus(null), 4000);
    }
  };
  const menuItems = [
    {
      icon: BrainCircuit,
      title: 'مركز الدراسة',
      subtitle: 'بحث، ملاحظات، Flashcards، مراجعة ذكية، Pomodoro، البنوك والتحليلات',
      action: onGoToAdvanced,
    },
    {
      icon: Sparkles,
      title: 'الذكاء الاصطناعي',
      subtitle: 'Gemini API، التفعيل واختبار الاتصال',
      action: onGoToAiSettings,
    },
    {
      icon: Volume2,
      title: 'الصوت والقراءة',
      subtitle: 'اختيار صوت الهاتف وسرعة القراءة في AI والأسئلة والمراجع',
      action: onGoToVoiceSettings,
    },
    {
      icon: CalendarDays,
      title: 'خطة المراجعة',
      subtitle: 'موعد الامتحان، الهدف اليومي ومنبّه صوتي',
      action: onGoToPlan,
    },
    {
      icon: HardDrive,
      title: 'إدارة التنزيلات',
      subtitle: 'إدارة المراجع والملفات والبنوك المحلية',
      action: onGoToDownloads,
    },
    {
      icon: Bell,
      title: 'الإشعارات والتحديثات',
      subtitle: unreadNotificationsCount > 0 ? `لديك ${unreadNotificationsCount} إشعار جديد` : 'عرض إعلانات وتحديثات التطبيق',
      action: onOpenNotifications || (() => {}),
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
    },
    {
      icon: AlertCircle,
      title: 'أخطائي',
      subtitle: 'راجع الإجابات التي أخطأت فيها',
      action: onGoToMistakes,
    },
    {
      icon: Heart,
      title: 'المفضلة',
      subtitle: 'الأسئلة التي حفظتها للعودة إليها',
      action: onGoToFavorites,
    },
    {
      icon: Library,
      title: 'بنوك الأسئلة',
      subtitle: 'إدارة واختيار بنك المراجعة',
      action: onGoToBanks,
    },
    {
      icon: Layers3,
      title: 'مجالات الدراسة',
      subtitle: 'فصل التخصصات وإدارة البنوك لكل مجال',
      action: onGoToDomains,
    },
  ];

  return (
    <div className="min-h-full flex flex-col gap-3 pb-8 text-right">
      <div className="-mx-4 -mt-4 px-5 pt-5 pb-5 bg-gradient-to-l from-[#392080] to-[#6841E8] text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-white/15 flex items-center justify-center shrink-0">
            <MoreHorizontal className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg">المزيد</h1>
            <p className="text-xs text-[#DDD5FF] mt-0.5">أدوات وإعدادات {appConfig.appName}</p>
          </div>
        </div>
      </div>

      <NewsSourceSettings />

      <div data-tour="more-menu" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={item.action}
              className="w-full bg-white rounded-[19px] p-4 text-right border border-gray-100/90 shadow-xs hover:border-[#5B3FD6]/30 transition-all flex items-center justify-between gap-3 active:scale-98 cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-[13px] bg-[#F5F3FF] flex items-center justify-center text-[#5B3FD6] shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#2C2145]">
                      {item.title}
                    </span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#E11D48] text-white text-[10px] font-bold">
                        {item.badge} جديد
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {item.subtitle}
                  </span>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
          );
        })}
      </div>

      {/* App footer */}
      <div className="mt-auto pt-3 shrink-0">
        <div className="rounded-[18px] bg-white border border-gray-100 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right min-w-0">
              <div className="font-black text-sm text-[#5B3FD6] leading-tight">{appConfig.appName}</div>
              <div className="text-[11px] text-gray-400 font-medium mt-1">طريقك نحو النجاح • الإصدار 1.0</div>
            </div>

            {Object.values(socialLinks).some(Boolean) && (
              <div className="flex items-center gap-1.5 shrink-0" aria-label="التواصل الاجتماعي">
                {[
                  { key: 'facebook', icon: Facebook, label: 'Facebook' },
                  { key: 'instagram', icon: Instagram, label: 'Instagram' },
                  { key: 'youtube', icon: Youtube, label: 'YouTube' },
                  { key: 'discord', icon: DiscordIcon, label: 'Discord' },
                  { key: 'website', icon: Globe2, label: 'الموقع' },
                ]
                  .filter((item) => Boolean(socialLinks[item.key as keyof SocialLinks]))
                  .map(({ key, icon: Icon, label }) => (
                    <a
                      key={key}
                      href={socialLinks[key as keyof SocialLinks]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-[10px] text-[#6A55C7] hover:bg-[#F5F3FF] active:bg-[#EEE9FF] flex items-center justify-center transition-colors"
                      aria-label={label}
                      title={label}
                    >
                      <Icon className="w-[15px] h-[15px]" />
                    </a>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
