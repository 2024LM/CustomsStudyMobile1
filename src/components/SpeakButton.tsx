
import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import {
  currentTtsPlayback, readingFrameEnabled, speakArabic, stopArabicTts,
  subscribeTtsPlayback, TtsPlaybackState,
} from '../services/arabicTts';

interface SpeakButtonProps {
  text: string;
  className?: string;
  compact?: boolean;
  title?: string;
  onError?: (message: string) => void;
}
let buttonSequence = 0;
export const SpeakButton: React.FC<SpeakButtonProps> = ({
  text, className = '', compact = true, title = 'استماع', onError,
}) => {
  const [playback, setPlayback] = useState(currentTtsPlayback);
  const [frameEnabled, setFrameEnabled] = useState(readingFrameEnabled);
  const requestId = useRef('');
  const button = useRef<HTMLButtonElement>(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const own = Boolean(requestId.current && playback.requestId === requestId.current);
  const busy = own && playback.state === 'loading';
  const speaking = own && playback.state === 'speaking';

  useEffect(() => {
    const unsubscribe = subscribeTtsPlayback((state: TtsPlaybackState) => {
      setPlayback(state);
      if (state.requestId === requestId.current && state.state === 'error') {
        errorHandler.current?.('تعذر إكمال القراءة الصوتية.');
      }
    });
    const updateFrame = () => setFrameEnabled(readingFrameEnabled());
    window.addEventListener('tts-frame-setting', updateFrame);
    return () => { unsubscribe(); window.removeEventListener('tts-frame-setting', updateFrame); };
  }, []);

  const previousText = useRef(text);
  useEffect(() => {
    if (previousText.current !== text && requestId.current
        && currentTtsPlayback().requestId === requestId.current) void stopArabicTts();
    previousText.current = text;
  }, [text]);

  useEffect(() => {
    if (!speaking || !frameEnabled) return;
    const scope = button.current?.closest('[data-speech-scope]');
    if (!scope) return;
    const marked = Array.from(scope.querySelectorAll<HTMLElement>('[data-speech-text]'));
    const targets = marked.length ? marked : [scope as HTMLElement];
    targets.forEach(target => target.classList.add('tts-reading-frame'));
    return () => targets.forEach(target => target.classList.remove('tts-reading-frame'));
  }, [speaking, frameEnabled, text]);

  const toggle = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!text.trim()) return;
    if (speaking || busy) { await stopArabicTts(); return; }
    requestId.current = 'reader-' + (++buttonSequence);
    try {
      await speakArabic(text, undefined, requestId.current);
    } catch (error: any) {
      if (currentTtsPlayback().state !== 'stopped' && currentTtsPlayback().requestId === requestId.current
          && currentTtsPlayback().state !== 'error') {
        errorHandler.current?.(error?.message || 'تعذر تشغيل الصوت.');
      }
    }
  };

  return (
    <button ref={button} type="button" onClick={event => void toggle(event)} disabled={!text.trim()}
      aria-pressed={speaking || busy}
      className={`${compact ? 'w-8 h-8' : 'h-10 px-3'} rounded-[10px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 ${speaking ? 'bg-[#EEE9FF] text-[#5B3FD6]' : 'bg-[#F8F9FD] text-gray-500'} ${className}`}
      aria-label={speaking || busy ? 'إيقاف القراءة' : title}
      title={speaking || busy ? 'إيقاف القراءة' : title}>
      {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      {!compact && <span className="text-[11px] font-bold">{speaking || busy ? 'إيقاف' : title}</span>}
    </button>
  );
};
