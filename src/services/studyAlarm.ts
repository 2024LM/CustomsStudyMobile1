import { registerPlugin } from '@capacitor/core';

interface NexusStudyAlarmPlugin {
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  saveCustomSound(options: { base64: string; extension: string }): Promise<{ path: string }>;
  schedule(options: {
    triggerAt: number;
    title: string;
    message: string;
    sound: 'calm' | 'focus' | 'bell' | 'custom';
    customPath?: string;
    repeatDaily: boolean;
    hour: number;
    minute: number;
  }): Promise<{ scheduled: boolean; exact?: boolean }>;
  cancel(): Promise<void>;
}

const NexusStudyAlarm = registerPlugin<NexusStudyAlarmPlugin>('NexusStudyAlarm');

export type StudyAlarmSound = 'calm' | 'focus' | 'bell' | 'custom';

export function nextAlarmTimestamp(time: string): number {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 0;

  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export async function saveAlarmAudio(file: File): Promise<string> {
  if (file.size <= 0) throw new Error('الملف الصوتي فارغ');
  if (file.size > 12 * 1024 * 1024) throw new Error('حجم الملف الصوتي يتجاوز 12 MB');

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'mp3';
  if (!['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(extension)) {
    throw new Error('الصيغ المدعومة: MP3 و M4A و WAV و OGG و AAC');
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }

  const result = await NexusStudyAlarm.saveCustomSound({
    base64: btoa(binary),
    extension,
  });
  if (!result.path) throw new Error('تعذر حفظ الصوت داخل التطبيق');
  return result.path;
}

export async function requestStudyAlarmPermission(): Promise<boolean> {
  try {
    return (await NexusStudyAlarm.requestNotificationPermission()).granted === true;
  } catch {
    return false;
  }
}

export async function scheduleStudyAlarm(options: {
  time: string;
  sound: StudyAlarmSound;
  customPath?: string;
  repeatDaily: boolean;
  title?: string;
  message?: string;
}): Promise<{ exact: boolean }> {
  const triggerAt = nextAlarmTimestamp(options.time);
  if (!triggerAt) throw new Error('وقت المنبّه غير صالح');

  const [hour, minute] = options.time.split(':').map(Number);
  const result = await NexusStudyAlarm.schedule({
    triggerAt,
    title: options.title || 'وقت المراجعة',
    message: options.message || 'حان وقت جلسة المراجعة.',
    sound: options.sound,
    customPath: options.customPath || '',
    repeatDaily: options.repeatDaily,
    hour,
    minute,
  });
  return { exact: result.exact !== false };
}

export async function cancelStudyAlarm(): Promise<void> {
  await NexusStudyAlarm.cancel();
}
