import { Capacitor, registerPlugin } from '@capacitor/core';

interface NexusPdfPlugin {
  load(options: { base64: string }): Promise<{ pages: number }>;
  render(options: { page: number; width: number }): Promise<{
    imageBase64: string;
    width: number;
    height: number;
  }>;
  close(): Promise<void>;
}

const NexusPdf = registerPlugin<NexusPdfPlugin>('NexusPdf');

export function nativePdfReaderAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read PDF'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(blob);
  });
}

export async function openNativePdf(blob: Blob): Promise<number> {
  if (!nativePdfReaderAvailable()) throw new Error('Native PDF reader is unavailable.');
  const result = await NexusPdf.load({ base64: await blobToBase64(blob) });
  return Math.max(0, Number(result.pages) || 0);
}

export async function renderNativePdfPage(page: number, width: number): Promise<string> {
  const result = await NexusPdf.render({
    page: Math.max(0, Math.floor(page)),
    width: Math.max(480, Math.min(Math.floor(width), 2400)),
  });
  if (!result.imageBase64) throw new Error('PDF page returned no image.');
  return `data:image/png;base64,${result.imageBase64}`;
}

export async function closeNativePdf(): Promise<void> {
  try { await NexusPdf.close(); } catch {}
}
