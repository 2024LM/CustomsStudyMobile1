import React from 'react';
import {
  AlertCircle,
  Heart,
  Library,
  Bell,
  ChevronLeft,
  RefreshCw,
  GitBranch,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { RemoteState } from '../types';
import { openUpdate } from '../services/remoteConfig';

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
      setCheckStatus('تم فحص التحديثات من GitHub بنجاح.');
    } catch {
      setCheckStatus('تعذر الاتصال بـ GitHub حاليًا.');
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
      subtitle: 'التذكيرات، الخصوصية وتخصيص الإعلانات',
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

      {/* Version & GitHub Remote Info */}
      <div className="mt-2 p-4 rounded-[20px] bg-white border border-gray-100 flex flex-col gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#5B3FD6]" />
            <span className="font-bold text-sm text-[#2C2145]">معلومات الإصدار والتحديثات</span>
          </div>
          {onRefreshRemote && (
            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#5B3FD6] hover:text-[#4C33B8] p-1.5 rounded-lg hover:bg-[#F5F3FF] transition-colors cursor-pointer disabled:opacity-50"
              title="إعادة فحص التحديثات من GitHub"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              <span>فحص التحديث</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/70 p-3 rounded-[14px]">
          <div>
            <span className="text-gray-400 block">الإصدار الحالي:</span>
            <span className="font-bold text-gray-800">1.0 (كود: 1)</span>
          </div>
          <div>
            <span className="text-gray-400 block">أحدث إصدار (GitHub):</span>
            <span className="font-bold text-[#5B3FD6]">
              {remote.latest ? `كود: ${remote.latest}` : 'جاري الفحص...'}
            </span>
          </div>
        </div>

        {checkStatus && (
          <p className="text-xs text-center text-emerald-600 font-medium">
            {checkStatus}
          </p>
        )}

        {remote.latest > 1 ? (
          <div className="flex items-center justify-between bg-[#F5F3FF] text-[#5B3FD6] p-3 rounded-[14px] text-xs">
            <div>
              <span className="font-bold block">{remote.updateTitle || 'يتوفر إصدار جديد!'}</span>
              <span className="text-gray-600 text-[11px]">{remote.updateMessage}</span>
            </div>
            {remote.updateUrl && (
              <button
                onClick={() => openUpdate(remote.updateUrl)}
                className="shrink-0 flex items-center gap-1 bg-[#5B3FD6] hover:bg-[#4C33B8] text-white px-3 py-1.5 rounded-[10px] font-bold text-xs shadow-xs cursor-pointer"
              >
                <span>تحميل</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50/80 px-3 py-2 rounded-[12px] text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>التطبيق متصل بـ GitHub ومتزامن بأحدث إصدار.</span>
          </div>
        )}
      </div>

      {/* App branding */}
      <div className="p-4 rounded-[20px] bg-white border border-gray-100 flex flex-col items-center text-center gap-1">
        <span className="font-bold text-sm text-[#5B3FD6]">منصة المراجعة - مفتشو الجمارك</span>
        <span className="text-xs text-gray-400 font-medium">طريقك نحو النجاح • إصدار الويب 1.0</span>
      </div>
    </div>
  );
};
