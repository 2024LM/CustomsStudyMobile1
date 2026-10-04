import React, { useState } from 'react';
import {
  Bell,
  X,
  Sparkles,
  Download,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { AppNotification, RemoteState } from '../types';
import { openUpdate } from '../services/remoteConfig';
import { db } from '../services/db';

interface NotificationsModalProps {
  remote: RemoteState;
  onClose: () => void;
  onRefresh?: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  remote,
  onClose,
  onRefresh,
}) => {
  const [, setRerender] = useState({});

  // Notifications are persisted when remote config is synchronized.
  // The center reads from app storage so older GitHub notifications remain available.
  const items = db.storedNotifications();

  // Handle Mark Read
  const handleItemClick = (item: AppNotification) => {
    db.markNotificationAsRead(item.id);
    setRerender({});
  };

  const handleOpenLink = (item: AppNotification) => {
    db.markNotificationAsRead(item.id);
    setRerender({});
    if (item.url) openUpdate(item.url);
  };

  const handleMarkAllRead = () => {
    db.markAllNotificationsAsRead(items.map((i) => i.id));
    setRerender({});
  };

  const unreadCount = items.filter((i) => !db.isNotificationRead(i.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#201C2B] text-[#2C2145] dark:text-[#F0ECF8] rounded-[26px] max-w-md w-full p-5 shadow-2xl border border-gray-100 dark:border-[#3A3348] flex flex-col gap-4 text-right max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#3A3348] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative w-10 h-10 rounded-[14px] bg-[#F5F3FF] dark:bg-[#302844] flex items-center justify-center text-[#5B3FD6] dark:text-[#C4B5FD] shrink-0">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#E11D48] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <h2 className="text-base font-bold text-[#2C2145] dark:text-[#F0ECF8]">مركز الإشعارات</h2>
              <span className="text-xs text-gray-500">
                {items.length === 0
                  ? 'لا توجد إشعارات جديدة'
                  : `${unreadCount} غير مقروء من أصل ${items.length}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-[#5B3FD6] hover:text-[#4C33B8] px-2 py-1 rounded-[8px] hover:bg-[#F5F3FF] transition-colors cursor-pointer"
              >
                تحديد كمقروء
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-[#2A2535] hover:bg-gray-200 dark:hover:bg-[#342E41] flex items-center justify-center text-gray-600 dark:text-[#B9B2C8] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
          {items.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3 text-gray-400">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-600">كل شيء محدّث!</p>
              <p className="text-xs text-gray-400 max-w-[220px]">
                لا توجد إعلانات أو تحديثات جديدة مرسلة للتطبيق في الوقت الحالي.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isRead = db.isNotificationRead(item.id);
              const isAlert = item.type === 'alert';
              const isUpdate = item.type === 'update';

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-3.5 rounded-[18px] border transition-all text-right flex flex-col gap-2 cursor-pointer ${
                    isRead
                      ? 'bg-gray-50/70 dark:bg-[#292531] border-gray-100 dark:border-[#3A3348] hover:bg-gray-100/60 dark:hover:bg-[#302A3C] opacity-80'
                      : isAlert
                      ? 'bg-[#FFF5F5] dark:bg-[#382126] border-[#FFCDD2] dark:border-[#6B343A] shadow-xs'
                      : isUpdate
                      ? 'bg-[#FAF8FF] dark:bg-[#292238] border-[#E8E1FA] dark:border-[#493B66] shadow-xs'
                      : 'bg-white dark:bg-[#211D2C] border-gray-200/80 dark:border-[#3A3348] shadow-xs hover:border-[#5B3FD6]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-[10px] flex items-center justify-center shrink-0 ${
                          isAlert
                            ? 'bg-[#FFE8E8] text-[#C62828]'
                            : isUpdate
                            ? 'bg-[#EFEAFF] text-[#5B3FD6]'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {isAlert ? (
                          <AlertCircle className="w-4 h-4" />
                        ) : isUpdate ? (
                          <Download className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex flex-col">
                        <span
                          className={`text-xs font-bold ${
                            isRead ? 'text-gray-700 dark:text-[#C9C1D3]' : 'text-[#2C2145] dark:text-[#F0ECF8]'
                          }`}
                        >
                          {item.title}
                        </span>
                        {item.date && (
                          <span className="text-[10px] text-gray-400 font-medium">
                            {item.date}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#5B3FD6] shrink-0 mt-1" />
                    )}
                  </div>

                  <p className="text-xs text-gray-600 dark:text-[#C9C1D3] leading-relaxed pr-9 whitespace-pre-line">
                    {item.message}
                  </p>

                  {item.url && (
                    <div className="mr-9 mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenLink(item);
                        }}
                        className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-[10px] text-[11px] font-bold transition-all shadow-xs ${
                          isAlert
                            ? 'bg-[#C62828] text-white hover:bg-[#B71C1C]'
                            : 'bg-[#5B3FD6] text-white hover:bg-[#4C33B8]'
                        }`}
                      >
                        <span>{isUpdate || isAlert ? 'تنزيل التحديث' : 'فتح الرابط'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & Refresh button */}
        <div className="pt-2 border-t border-gray-100 dark:border-[#3A3348] flex items-center justify-between text-[11px] text-gray-500 dark:text-[#B9B2C8]">
          <span>المصدر: {remote.source === 'github' ? 'مباشر' : 'محلي'}</span>
          <button
            onClick={() => {
              if (onRefresh) onRefresh();
              setRerender({});
            }}
            className="text-[#5B3FD6] font-bold hover:underline cursor-pointer"
          >
            تحديث القائمة
          </button>
        </div>
      </div>
    </div>
  );
};
