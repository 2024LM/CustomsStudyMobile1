import { Capacitor, registerPlugin } from '@capacitor/core';

export type AiProviderLogStatus = 'success' | 'error' | 'retry' | 'info';

export interface AiProviderLogEntry {
  id: string;
  at: number;
  provider: 'gemini-api';
  operation: string;
  model?: string;
  keyNumber?: number;
  attempt?: number;
  status: AiProviderLogStatus;
  httpStatus?: number | 'network';
  durationMs?: number;
  requestSummary?: string;
  responseSummary?: string;
  error?: string;
}

interface FileExportPlugin {
  saveTextFile(options: {
    filename: string;
    content: string;
    mimeType: string;
  }): Promise<{ saved: boolean; cancelled?: boolean; uri?: string }>;
}

const FileExport = registerPlugin<FileExportPlugin>('NexusFileExport');

const STORAGE_KEY = 'ai_provider_diagnostics_v1';
const EVENT_NAME = 'ai-provider-log-updated';
const MAX_ENTRIES = 100;

function clean(value?: string, max = 1200): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[API_KEY]')
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[INLINE_DATA]')
    .replace(/[A-Za-z0-9+/=]{400,}/g, '[LARGE_DATA]')
    .trim()
    .slice(0, max) || undefined;
}

export function aiProviderLogs(): AiProviderLogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function logAiProviderEvent(input: Omit<AiProviderLogEntry, 'id' | 'at'>): AiProviderLogEntry {
  const entry: AiProviderLogEntry = {
    ...input,
    id: 'aip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    at: Date.now(),
    requestSummary: clean(input.requestSummary),
    responseSummary: clean(input.responseSummary),
    error: clean(input.error, 2000),
  };

  try {
    const next = [entry, ...aiProviderLogs()].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {}

  return entry;
}

export function clearAiProviderLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {}
}

export function subscribeAiProviderLogs(callback: () => void): () => void {
  const listener = () => callback();
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}


export interface AiProviderLogExport {
  schemaVersion: 1;
  exportedAt: string;
  total: number;
  summary: {
    success: number;
    errors: number;
    retries: number;
    info: number;
  };
  entries: AiProviderLogEntry[];
}

export function aiProviderLogExport(): AiProviderLogExport {
  const entries = aiProviderLogs()
    .slice()
    .sort((a, b) => a.at - b.at);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    total: entries.length,
    summary: {
      success: entries.filter((entry) => entry.status === 'success').length,
      errors: entries.filter((entry) => entry.status === 'error').length,
      retries: entries.filter((entry) => entry.status === 'retry').length,
      info: entries.filter((entry) => entry.status === 'info').length,
    },
    entries,
  };
}

export async function downloadAiProviderLogJson(): Promise<string> {
  const payload = aiProviderLogExport();
  const json = JSON.stringify(payload, null, 2);

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');

  const filename = `ai-provider-log-${stamp}.json`;

  if (Capacitor.getPlatform() === 'android') {
    const result = await FileExport.saveTextFile({
      filename,
      content: json,
      mimeType: 'application/json',
    });
    if (!result.saved && !result.cancelled) {
      throw new Error('تعذر حفظ ملف JSON.');
    }
    return filename;
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
