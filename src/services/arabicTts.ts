import { registerPlugin } from '@capacitor/core';

interface NexusTtsPlugin {
  status(): Promise<{ ready: boolean; arabic: boolean; locale: string; voice: string }>;
  speak(options: { text: string; rate?: number }): Promise<{ started: boolean; locale: string; voice: string }>;
  stop(): Promise<void>;
}

const NexusTts = registerPlugin<NexusTtsPlugin>('NexusTts');

export async function arabicTtsStatus() {
  try {
    return await NexusTts.status();
  } catch {
    return { ready: false, arabic: false, locale: '', voice: '' };
  }
}

export async function speakArabic(text: string, rate = 0.92): Promise<{ locale: string; voice: string }> {
  const clean = text.trim();
  if (!clean) throw new Error('لا يوجد نص للقراءة.');
  try {
    const result = await NexusTts.speak({ text: clean, rate });
    return { locale: result.locale || '', voice: result.voice || '' };
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('arabic voice')) {
      throw new Error('لا يوجد صوت عربي مثبت على الهاتف. ثبّت حزمة صوت عربية من إعدادات تحويل النص إلى كلام في Android.');
    }
    throw new Error('تعذر تشغيل القراءة العربية على هذا الجهاز.');
  }
}

export async function stopArabicTts(): Promise<void> {
  try { await NexusTts.stop(); } catch {}
}
