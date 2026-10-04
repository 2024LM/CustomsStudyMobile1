import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type NoticeType = 'success' | 'error' | 'warning' | 'info';

interface FloatingNoticeProps {
  message: string;
  onDismiss: () => void;
  type?: NoticeType;
}

function inferNoticeType(message: string): NoticeType {
  const text = message.trim();

  if (/تعذر|فشل|خطأ|غير صالح|رفض|لم يتم|غير ممنوح|لم يُمنح|لا توجد|لا يوجد/.test(text)) {
    return 'error';
  }

  if (/تحذير|حد أقصى|انتبه|غير متاح|مطلوب|يمكن إضافة|يمكن اعتماد/.test(text)) {
    return 'warning';
  }

  if (/^تم |^تمت |نجح|اكتملت|تم حفظ|تم حذف|تم إنشاء|تم تغيير|تم اختيار|تمت إضافة|تمت استعادة/.test(text)) {
    return 'success';
  }

  return 'info';
}

const META = {
  success: {
    icon: CheckCircle2,
    box: 'bg-emerald-500/16 text-emerald-950 dark:text-emerald-50 border-emerald-400/35',
    iconBox: 'bg-emerald-500/18 text-emerald-700 dark:text-emerald-300',
  },
  error: {
    icon: XCircle,
    box: 'bg-red-500/16 text-red-950 dark:text-red-50 border-red-400/35',
    iconBox: 'bg-red-500/18 text-red-700 dark:text-red-300',
  },
  warning: {
    icon: AlertTriangle,
    box: 'bg-amber-500/16 text-amber-950 dark:text-amber-50 border-amber-400/35',
    iconBox: 'bg-amber-500/18 text-amber-700 dark:text-amber-300',
  },
  info: {
    icon: Info,
    box: 'bg-violet-500/16 text-violet-950 dark:text-violet-50 border-violet-400/35',
    iconBox: 'bg-violet-500/18 text-violet-700 dark:text-violet-300',
  },
} as const;

export const FloatingNotice: React.FC<FloatingNoticeProps> = ({
  message,
  onDismiss,
  type,
}) => {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const resolvedType = useMemo(() => type ?? inferNoticeType(message), [message, type]);
  const meta = META[resolvedType];
  const Icon = meta.icon;

  useEffect(() => {
    setLeaving(false);
    setShown(false);
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [message]);

  useEffect(() => {
    const dismiss = () => {
      if (leaving) return;
      setLeaving(true);
      window.setTimeout(onDismiss, 170);
    };

    window.addEventListener('pointerdown', dismiss, true);
    return () => window.removeEventListener('pointerdown', dismiss, true);
  }, [leaving, onDismiss]);

  if (!message) return null;

  return (
    <div
      role={resolvedType === 'error' ? 'alert' : 'status'}
      aria-live={resolvedType === 'error' ? 'assertive' : 'polite'}
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+14px)] z-[9999] flex justify-center px-4 pointer-events-none"
    >
      <div
        className={`pointer-events-auto w-full max-w-md rounded-[18px] border px-4 py-3.5 shadow-[0_14px_42px_rgba(0,0,0,0.16)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-200 ease-out ${meta.box} ${
          leaving || !shown
            ? '-translate-y-3 opacity-0 scale-[0.98]'
            : 'translate-y-0 opacity-100 scale-100'
        }`}
      >
        <div className="flex items-center gap-3" dir="rtl">
          <div className={`w-9 h-9 rounded-[12px] ${meta.iconBox} flex items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold leading-6 flex-1">{message}</div>
        </div>
      </div>
    </div>
  );
};
