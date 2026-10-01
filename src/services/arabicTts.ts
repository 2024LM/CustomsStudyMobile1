import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface TtsVoiceOption {
  id: string;
  name: string;
  locale: string;
  language: string;
  country: string;
  networkRequired: boolean;
  quality?: number;
  latency?: number;
  platform: 'android' | 'web';
}

interface NexusTtsPlugin {
  status(): Promise<{ ready: boolean; arabic: boolean; locale: string; voice: string }>;
  voices(): Promise<{ ready: boolean; voices: Array<{
    name: string;
    locale: string;
    language: string;
    country: string;
    networkRequired: boolean;
    quality?: number;
    latency?: number;
  }> }>;
  addListener(eventName: 'playback', listener: (event: TtsPlaybackState) => void): Promise<PluginListenerHandle>;
  playback(): Promise<TtsPlaybackState>;
  speak(options: { text: string; rate?: number; voice?: string; requestId?: string }): Promise<{ started: boolean; locale: string; voice: string }>;
  stop(): Promise<void>;
}

const NexusTts = registerPlugin<NexusTtsPlugin>('NexusTts');
export interface TtsPlaybackState {
  requestId: string;
  state: 'idle' | 'loading' | 'speaking' | 'done' | 'stopped' | 'error';
}
let playbackState: TtsPlaybackState = { requestId: '', state: 'idle' };
const playbackSubscribers = new Set<(state: TtsPlaybackState) => void>();
let nativeListener: Promise<PluginListenerHandle> | undefined;
let requestSequence = 0;
let rejectBrowserStart: ((error: Error) => void) | undefined;

function publishPlayback(state: TtsPlaybackState): void {
  playbackState = state;
  playbackSubscribers.forEach(listener => listener(state));
}
export function currentTtsPlayback(): TtsPlaybackState { return playbackState; }
export function subscribeTtsPlayback(listener: (state: TtsPlaybackState) => void): () => void {
  playbackSubscribers.add(listener);
  return () => { playbackSubscribers.delete(listener); };
}
function receiveNativePlayback(event: TtsPlaybackState): void {
  if (event.requestId !== playbackState.requestId) return;
  // A queued start event must not revive a locally cancelled or completed request.
  if (['stopped', 'done', 'error'].includes(playbackState.state)) return;
  publishPlayback(event);
}
async function ensureNativePlayback(): Promise<void> {
  if (!nativeListener) {
    nativeListener = NexusTts.addListener('playback', receiveNativePlayback);
    nativeListener.catch(() => { nativeListener = undefined; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void NexusTts.playback().then(receiveNativePlayback).catch(() => {});
      }
    });
  }
  await nativeListener;
}
export function readingFrameEnabled(): boolean {
  try { return localStorage.getItem('tts_reading_frame_v1') !== '0'; } catch { return true; }
}
export function saveReadingFrameEnabled(enabled: boolean): void {
  try { localStorage.setItem('tts_reading_frame_v1', enabled ? '1' : '0'); } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tts-frame-setting'));
}

const VOICE_KEY = 'tts_selected_voice_v1';
const RATE_KEY = 'tts_rate_v1';
const SOFT_TAA_KEY = 'tts_soft_taa_marbuta_v1';
const SENTENCE_PAUSE_KEY = 'tts_sentence_pause_v1';

export function selectedTtsVoiceId(): string {
  try { return localStorage.getItem(VOICE_KEY) || ''; } catch { return ''; }
}

export function saveSelectedTtsVoiceId(id: string): void {
  try {
    if (id) localStorage.setItem(VOICE_KEY, id);
    else localStorage.removeItem(VOICE_KEY);
  } catch {}
}

export function selectedTtsRate(): number {
  try {
    const stored = localStorage.getItem(RATE_KEY);
    if (stored === null || stored.trim() === '') return 1;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.min(1.5, Math.max(0.5, value)) : 1;
  } catch {
    return 1;
  }
}

export function saveSelectedTtsRate(rate: number): void {
  const safe = Math.min(1.5, Math.max(0.5, rate));
  try { localStorage.setItem(RATE_KEY, String(safe)); } catch {}
}

export function softenFinalTaaMarbuta(): boolean {
  try {
    const value = localStorage.getItem(SOFT_TAA_KEY);
    return value === null ? false : value === '1';
  } catch {
    return false;
  }
}

export function saveSoftenFinalTaaMarbuta(enabled: boolean): void {
  try { localStorage.setItem(SOFT_TAA_KEY, enabled ? '1' : '0'); } catch {}
}

export function sentencePauseEnabled(): boolean {
  try {
    const value = localStorage.getItem(SENTENCE_PAUSE_KEY);
    return value === null ? true : value === '1';
  } catch {
    return true;
  }
}

export function saveSentencePauseEnabled(enabled: boolean): void {
  try { localStorage.setItem(SENTENCE_PAUSE_KEY, enabled ? '1' : '0'); } catch {}
}

export function prepareTextForSpeech(text: string): string {
  // Prepare only the spoken copy. Preserve diacritics, decimal points and identifiers.
  let prepared = text.normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/ـ/g, '')
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|mailto:)[^\s)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*\x60{3}[^\n]*$/gm, '')
    .replace(/(\*\*|__)([^\n]+?)\1/g, '$2')
    .replace(/\x60([^\x60\n]+)\x60/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim();
  if (/[\u0600-\u06FF]/.test(prepared)) {
    prepared = prepared
      .replace(/([0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?)\s*[%٪]/g, '$1 في المئة')
      .replace(/([0-9٠-٩۰-۹])\s*°\s*([Cc]|م)(?=$|[\s،,.;؛])/g, '$1 درجة مئوية');
  }

  if (softenFinalTaaMarbuta()) {
    // TTS-only normalization: keep stored/displayed text untouched.
    // Soften ة only at a real sentence boundary, not after commas/colons or ordinary spaces.
    // Supported endings: . ! ? ؟ ؛ … line break, end of text, with optional closing quotes/brackets.
    prepared = prepared.replace(/ة(?=(?:["'»”’\)\]\}]*[.!?؟؛…]+|["'»”’\)\]\}]*\n|["'»”’\)\]\}]*$))/g, 'ه');
  }

  if (!sentencePauseEnabled()) {
    // When sentence pauses are disabled, soften sentence-ending punctuation into spaces.
    prepared = prepared.replace(/[.!?؟؛]+/g, (mark, offset, source) =>
      mark === '.' && /[0-9٠-٩۰-۹]/.test(source[offset - 1] || '') && /[0-9٠-٩۰-۹]/.test(source[offset + 1] || '') ? mark : ' ');
  }

  return prepared.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function browserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices() || [];
}

async function waitForBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  const current = browserVoices();
  if (current.length) return current;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return await new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(browserVoices()), 1200);
    const handler = () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(browserVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
  });
}

export async function listTtsVoices(): Promise<TtsVoiceOption[]> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const result = await NexusTts.voices();
      if (!result.ready) return [];
      return (result.voices || []).map((voice) => ({
        id: voice.name,
        name: voice.name,
        locale: voice.locale || '',
        language: voice.language || '',
        country: voice.country || '',
        networkRequired: Boolean(voice.networkRequired),
        quality: voice.quality,
        latency: voice.latency,
        platform: 'android' as const,
      }));
    } catch {
      return [];
    }
  }

  const voices = await waitForBrowserVoices();
  return voices
    .map((voice) => ({
      id: voice.voiceURI,
      name: voice.name,
      locale: voice.lang || '',
      language: (voice.lang || '').split('-')[0] || '',
      country: (voice.lang || '').split('-')[1] || '',
      networkRequired: !voice.localService,
      platform: 'web' as const,
    }))
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name));
}

export async function arabicTtsStatus() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      return await NexusTts.status();
    } catch {
      return { ready: false, arabic: false, locale: '', voice: '' };
    }
  }

  const voices = await waitForBrowserVoices();
  const selectedId = selectedTtsVoiceId();
  const selected = voices.find((voice) => voice.voiceURI === selectedId) || voices.find((voice) => /^ar(?:-|$)/i.test(voice.lang));
  return {
    ready: voices.length > 0,
    arabic: Boolean(selected && /^ar(?:-|$)/i.test(selected.lang)),
    locale: selected?.lang || '',
    voice: selected?.name || '',
  };
}

function splitBrowserSpeech(text: string, limit = 900): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let remaining = clean;

  while (remaining.length > limit) {
    const searchStart = Math.max(0, limit - 250);
    let cut = -1;
    for (let i = limit; i >= searchStart; i--) {
      if (/[.!?؟؛،,;]/.test(remaining[i - 1] || '')) {
        cut = i;
        break;
      }
    }
    if (cut < 0) {
      const space = remaining.lastIndexOf(' ', limit);
      cut = space > searchStart ? space : limit;
    }
    const part = remaining.slice(0, cut).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function speakInBrowser(text: string, rate: number, selectedId: string, requestId: string): Promise<{ locale: string; voice: string }> {
  return new Promise((resolve, reject) => {
    rejectBrowserStart = reject;
    void waitForBrowserVoices().then(voices => {
      if (playbackState.requestId !== requestId || playbackState.state === 'stopped') { reject(new Error('تم إيقاف القراءة.')); return; }
      if (!('speechSynthesis' in window)) { reject(new Error('تحويل النص إلى كلام غير مدعوم في هذا المتصفح.')); return; }
      const selected = voices.find(voice => voice.voiceURI === selectedId)
        || voices.find(voice => /^ar(?:-|$)/i.test(voice.lang)) || voices[0];
      const chunks = splitBrowserSpeech(text);
      let started = false;
      let index = 0;
      const speakNext = () => {
        if (playbackState.requestId !== requestId || playbackState.state === 'stopped') return;
        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.rate = rate;
        if (selected) { utterance.voice = selected; utterance.lang = selected.lang; }
        utterance.onstart = () => {
          if (playbackState.requestId !== requestId || ['stopped', 'done', 'error'].includes(playbackState.state)) return;
          publishPlayback({ requestId, state: 'speaking' });
          if (!started) {
            started = true;
            rejectBrowserStart = undefined;
            resolve({ locale: selected?.lang || '', voice: selected?.name || '' });
          }
        };
        utterance.onerror = () => {
          if (playbackState.requestId !== requestId || playbackState.state === 'stopped') return;
          publishPlayback({ requestId, state: 'error' });
          rejectBrowserStart = undefined;
          reject(new Error('تعذر تشغيل الصوت في المتصفح.'));
        };
        utterance.onend = () => {
          if (playbackState.requestId !== requestId || playbackState.state === 'stopped') return;
          index += 1;
          if (index < chunks.length) speakNext();
          else publishPlayback({ requestId, state: 'done' });
        };
        window.speechSynthesis.speak(utterance);
      };
      speakNext();
    }).catch(reject);
  });
}

export async function speakArabic(text: string, rate = selectedTtsRate(), requestId = 'tts-' + (++requestSequence)): Promise<{ locale: string; voice: string }> {
  const clean = prepareTextForSpeech(text);
  if (!clean) throw new Error('لا يوجد نص للقراءة.');
  const selectedId = selectedTtsVoiceId();
  const safeRate = Math.min(1.5, Math.max(0.5, rate));
  rejectBrowserStart?.(new Error('تم إيقاف القراءة.'));
  rejectBrowserStart = undefined;
  publishPlayback({ requestId, state: 'loading' });
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      try { window.speechSynthesis?.cancel(); } catch {}
      return await speakInBrowser(clean, safeRate, selectedId, requestId);
    }
    await ensureNativePlayback();
    if (playbackState.requestId !== requestId || playbackState.state === 'stopped') {
      throw new Error('تم إيقاف القراءة.');
    }
    const result = await NexusTts.speak({ text: clean, rate: safeRate, voice: selectedId || undefined, requestId });
    return { locale: result.locale || '', voice: result.voice || '' };
  } catch (error: any) {
    if (playbackState.requestId === requestId && playbackState.state !== 'stopped') {
      publishPlayback({ requestId, state: 'error' });
    }
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('not ready')) {
      throw new Error('محرك تحويل النص إلى كلام غير جاهز على الهاتف.');
    }
    throw new Error(message || 'تعذر تشغيل القراءة الصوتية على هذا الجهاز.');
  }
}

export async function previewTtsVoice(voiceId: string, locale = ''): Promise<void> {
  const previous = selectedTtsVoiceId();
  saveSelectedTtsVoiceId(voiceId);
  try {
    const sample = /^fr/i.test(locale)
      ? 'Bonjour, ceci est un test de la voix sélectionnée.'
      : /^en/i.test(locale)
        ? 'Hello, this is a preview of the selected voice.'
        : 'مرحبًا، هذا اختبار للصوت الذي اخترته في تطبيق منصة المراجعة.';
    await speakArabic(sample, selectedTtsRate());
  } finally {
    saveSelectedTtsVoiceId(previous);
  }
}

export async function stopArabicTts(): Promise<void> {
  publishPlayback({ requestId: playbackState.requestId, state: 'stopped' });
  rejectBrowserStart?.(new Error('تم إيقاف القراءة.'));
  rejectBrowserStart = undefined;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    try { window.speechSynthesis?.cancel(); } catch {}
    return;
  }
  try { await NexusTts.stop(); } catch {}
}
