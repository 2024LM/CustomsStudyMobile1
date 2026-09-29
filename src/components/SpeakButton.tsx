import React, { useState } from 'react';
import { LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import { speakArabic, stopArabicTts } from '../services/arabicTts';

interface SpeakButtonProps {
  text: string;
  className?: string;
  compact?: boolean;
  title?: string;
  onError?: (message: string) => void;
}

export const SpeakButton: React.FC<SpeakButtonProps> = ({
  text,
  className = '',
  compact = true,
  title = 'استماع',
  onError,
}) => {
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const toggle = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!text.trim()) return;

    if (speaking) {
      await stopArabicTts();
      setSpeaking(false);
      return;
    }

    setBusy(true);
    try {
      await speakArabic(text);
      setSpeaking(true);
    } catch (error: any) {
      onError?.(error?.message || 'تعذر تشغيل الصوت.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => void toggle(event)}
      disabled={busy || !text.trim()}
      className={`${compact ? 'w-8 h-8' : 'h-10 px-3'} rounded-[10px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${speaking ? 'bg-[#EEE9FF] text-[#5B3FD6]' : 'bg-[#F8F9FD] text-gray-500'} ${className}`}
      aria-label={speaking ? 'إيقاف القراءة' : title}
      title={speaking ? 'إيقاف القراءة' : title}
    >
      {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      {!compact && <span className="text-[11px] font-bold">{speaking ? 'إيقاف' : title}</span>}
    </button>
  );
};
