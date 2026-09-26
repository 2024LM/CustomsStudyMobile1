import { Capacitor, registerPlugin } from '@capacitor/core';

interface NexusStoragePlugin {
  loadSnapshot(): Promise<{ value?: string | null }>;
  saveSnapshot(options: { value: string }): Promise<void>;
}

const NexusStorage = registerPlugin<NexusStoragePlugin>('NexusStorage');

let writeQueue: Promise<void> = Promise.resolve();

export function isNativeAndroidStorage(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function loadNativeSnapshot(): Promise<string | null> {
  if (!isNativeAndroidStorage()) return null;

  try {
    const result = await NexusStorage.loadSnapshot();
    return typeof result?.value === 'string' && result.value.length > 0
      ? result.value
      : null;
  } catch (error) {
    console.warn('Native SQLite load failed; using localStorage fallback.', error);
    return null;
  }
}

export function saveNativeSnapshot(value: string): Promise<void> {
  if (!isNativeAndroidStorage()) return Promise.resolve();

  // Serialize writes so rapid answers/settings changes cannot race each other.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await NexusStorage.saveSnapshot({ value });
      } catch (error) {
        console.warn('Native SQLite save failed; localStorage remains the fallback.', error);
      }
    });

  return writeQueue;
}
