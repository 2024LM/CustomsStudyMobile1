import { registerPlugin } from '@capacitor/core';

interface DeviceAlarmSound {
  id: string;
  title: string;
  uri: string;
}

interface NexusStudyAlarmPlugin {
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  requestAudioPermission(): Promise<{ granted: boolean }>;
  listDeviceSounds(): Promise<{ sounds: DeviceAlarmSound[]; audioPermissionGranted?: boolean }>;
  previewSound(options: { uri: string }): Promise<void>;
  previewCustomSound(options: { path: string }): Promise<void>;
  stopPreview(): Promise<void>;
  saveCustomSound(options: { base64: string; extension: string }): Promise<{ path: string }>;
  schedule(options: {
    triggerAt: number;
    title: string;
    message: string;
    sound: 'calm' | 'focus' | 'bell' | 'device' | 'custom';
    customPath?: string;
    deviceSoundUri?: string;
    customMessage?: string;
    repeatDaily: boolean;
    hour: number;
    minute: number;
  }): Promise<{ scheduled: boolean; exact?: boolean }>;
  scheduleQuestionReminder(options: { triggerAt: number; intervalHours: number }): Promise<{ scheduled: boolean; exact?: boolean }>;
  cancelQuestionReminder(): Promise<void>;
  consumePendingQuestion(): Promise<{ rowId?: number; bankId?: string }>;
  cancel(): Promise<void>;
}

const NexusStudyAlarm = registerPlugin<NexusStudyAlarmPlugin>('NexusStudyAlarm');

export type StudyAlarmSound = 'calm' | 'focus' | 'bell' | 'device' | 'custom';
export type { DeviceAlarmSound };

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

export async function requestDeviceAudioPermission(): Promise<boolean> {
  try {
    return (await NexusStudyAlarm.requestAudioPermission()).granted === true;
  } catch {
    return false;
  }
}

export async function listDeviceAlarmSounds(): Promise<DeviceAlarmSound[]> {
  try {
    const result = await NexusStudyAlarm.listDeviceSounds();
    return Array.isArray(result?.sounds) ? result.sounds : [];
  } catch {
    return [];
  }
}

export async function previewDeviceAlarmSound(uri: string): Promise<void> {
  if (!uri) return;
  await NexusStudyAlarm.previewSound({ uri });
}

export async function previewCustomAlarmSound(path: string): Promise<void> {
  if (!path) return;
  await NexusStudyAlarm.previewCustomSound({ path });
}

export async function stopDeviceAlarmPreview(): Promise<void> {
  try { await NexusStudyAlarm.stopPreview(); } catch {}
}

export async function scheduleStudyAlarm(options: {
  time: string;
  sound: StudyAlarmSound;
  customPath?: string;
  deviceSoundUri?: string;
  customMessage?: string;
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
    deviceSoundUri: options.deviceSoundUri || '',
    customMessage: options.customMessage || '',
    repeatDaily: options.repeatDaily,
    hour,
    minute,
  });
  return { exact: result.exact !== false };
}

export async function cancelStudyAlarm(): Promise<void> {
  await NexusStudyAlarm.cancel();
}


export function nextQuestionReminderTimestamp(time: string): number {
  return nextAlarmTimestamp(time);
}

export async function scheduleQuestionReminder(options: {
  startTime: string;
  intervalHours: number;
}): Promise<{ exact: boolean }> {
  const triggerAt = nextQuestionReminderTimestamp(options.startTime);
  if (!triggerAt) throw new Error('وقت بداية تذكير السؤال غير صالح');
  const intervalHours = Math.min(24, Math.max(1, Math.floor(options.intervalHours || 1)));
  const result = await NexusStudyAlarm.scheduleQuestionReminder({ triggerAt, intervalHours });
  return { exact: result.exact !== false };
}

export async function cancelQuestionReminder(): Promise<void> {
  try { await NexusStudyAlarm.cancelQuestionReminder(); } catch {}
}

export async function consumePendingQuestion(): Promise<{ rowId: number; bankId: string } | null> {
  try {
    const result = await NexusStudyAlarm.consumePendingQuestion();
    const rowId = Number(result?.rowId);
    const bankId = String(result?.bankId || '');
    if (Number.isFinite(rowId) && rowId > 0 && bankId) return { rowId, bankId };
  } catch {}
  return null;
}
