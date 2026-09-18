export interface ReferenceItem {
  id: string;
  categories: string[];
  title: string;
  description: string;
  url: string;
  type: string;
}

const SHEET_ID = '1wnL7pZRqmSixUA7dyR6d6bJ-a4tM8UDtPUQ0Oo3yrW4';
const SHEET_NAME = 'Sheet1';
const INDEX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const CACHE_KEY = 'customs_reference_index_v1';
const CONTENT_CACHE_PREFIX = 'customs_reference_content_v1:';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function normalize(rows: string[][]): ReferenceItem[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((v) => v.trim());
  const at = (name: string) => header.indexOf(name);
  const required = ['ID', 'التصنيفات', 'العنوان', 'وصف مختصر', 'رابط الملف', 'نوع الملف'];
  if (required.some((h) => at(h) < 0)) throw new Error('صيغة فهرس المراجع غير متوافقة مع التطبيق.');

  return rows.slice(1).map((r) => ({
    id: (r[at('ID')] || '').trim(),
    categories: (r[at('التصنيفات')] || '').split('|').map((x) => x.trim()).filter(Boolean),
    title: (r[at('العنوان')] || '').trim(),
    description: (r[at('وصف مختصر')] || '').trim(),
    url: (r[at('رابط الملف')] || '').trim(),
    type: (r[at('نوع الملف')] || '').trim(),
  })).filter((x) => x.id && x.title && /^https:\/\//i.test(x.url));
}

export async function fetchReferenceIndex(force = false): Promise<{ items: ReferenceItem[]; cached: boolean }> {
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && Date.now() - Number(parsed.savedAt || 0) < 15 * 60 * 1000) {
          return { items: parsed.items, cached: true };
        }
      }
    } catch { /* refresh below */ }
  }
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = normalize(parseCsv(await res.text()));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
    return { items, cached: false };
  } catch (error) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return { items: JSON.parse(raw).items || [], cached: true };
    } catch { /* no cache */ }
    throw error;
  }
}

function googleDocExportUrl(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? `https://docs.google.com/document/d/${match[1]}/export?format=txt` : null;
}

export async function fetchReferenceContent(item: ReferenceItem): Promise<string> {
  const key = CONTENT_CACHE_PREFIX + item.id;
  const target = item.type.toLowerCase().includes('google')
    ? googleDocExportUrl(item.url)
    : item.url;
  if (!target) throw new Error('رابط المستند غير صالح.');

  try {
    const res = await fetch(target, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('المستند فارغ.');
    localStorage.setItem(key, JSON.stringify({ text, savedAt: Date.now() }));
    return text;
  } catch (error) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return String(JSON.parse(raw).text || '');
    } catch { /* no cache */ }
    throw error;
  }
}

export function isInlineReadable(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('md') || t.includes('txt') || t.includes('google');
}
