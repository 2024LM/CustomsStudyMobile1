import React from 'react';
import {
  AlertCircle,
  Heart,
  Library,
  Bell,
  ChevronLeft,
} from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { RemoteState } from '../types';

interface MorePageProps {
  onGoToMistakes: () => void;
  onGoToFavorites: () => void;
  onGoToBanks: () => void;
  onGoToSettings: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  remote: RemoteState;
  onRefreshRemote?: () => Promise<void>;
}

export const MorePage: React.FC<MorePageProps> = ({
  onGoToMistakes,
  onGoToFavorites,
  onGoToBanks,
  onGoToSettings,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  remote,
  onRefreshRemote,
}) => {
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const [checkStatus, setCheckStatus] = React.useState<string | null>(null);

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
      icon: Bell,
      title: 'الإشعارات والتحديثات',
      subtitle: unreadNotificationsCount > 0 ? `لديك ${unreadNotificationsCount} إشعار جديد` : 'عرض إعلانات وتحديثات التطبيق',
      action: onOpenNotifications || onGoToSettings,
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
      icon: Bell,
      title: 'الإعدادات والتذكيرات',
      subtitle: 'تخصيص تذكيرات المراجعة',
      action: onGoToSettings,
    },
  ];

  return (
    <div className="flex flex-col gap-3 pb-8 text-right">
      <ScreenHeader
        title="المزيد"
        subtitle="أدوات وإعدادات منصة المراجعة"
      />

      <div className="flex flex-col gap-2.5">
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

      {/* App branding */}
      <div className="p-4 rounded-[20px] bg-white border border-gray-100 flex flex-col items-center text-center gap-1">
        <span className="font-bold text-sm text-[#5B3FD6]">منصة المراجعة - مفتشو الجمارك</span>
        <span className="text-xs text-gray-400 font-medium">طريقك نحو النجاح • إصدار الويب 1.0</span>
      </div>
    </div>
  );
};
