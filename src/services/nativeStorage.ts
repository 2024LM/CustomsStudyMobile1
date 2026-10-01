import { Capacitor, registerPlugin } from '@capacitor/core';

interface NexusStoragePlugin {
  loadSnapshot(): Promise<{ value?: string | null }>;
  saveSnapshot(options: { value: string }): Promise<void>;
}

const NexusStorage = registerPlugin<NexusStoragePlugin>('NexusStorage');

let pendingSnapshot: string | null = null;
let writeQueue: Promise<void> | null = null;

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

  pendingSnapshot = value;
  if (!writeQueue) {
    writeQueue = Promise.resolve().then(async () => {
      while (pendingSnapshot !== null) {
        const latest = pendingSnapshot;
        pendingSnapshot = null;
        try {
          await NexusStorage.saveSnapshot({ value: latest });
        } catch (error) {
          console.warn('Native SQLite save failed; localStorage remains the fallback.', error);
        }
      }
    }).finally(() => {
      writeQueue = null;
      if (pendingSnapshot !== null) return saveNativeSnapshot(pendingSnapshot);
    });
  }
  return writeQueue;
}
