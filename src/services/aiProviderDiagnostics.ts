export type AiProviderLogStatus = 'success' | 'error' | 'retry' | 'info';

export interface AiProviderLogEntry {
  id: string;
  at: number;
  provider: 'gemini-api' | 'gemini-nano';
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
