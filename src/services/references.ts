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
const LEGACY_CACHE_KEY = 'customs_reference_index_v1';
const LEGACY_CONTENT_CACHE_PREFIX = 'customs_reference_content_v1:';
const FETCH_TIMEOUT_MS = 12000;

async function safeFetch(url: string): Promise<Response> {
  const parsed = new URL(url, window.location.href);
  if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('رابط غير آمن.');
  if (parsed.username || parsed.password) throw new Error('رابط غير صالح.');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(parsed.toString(), { cache: 'no-store', signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

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

export async function fetchReferenceIndex(_force = false): Promise<{ items: ReferenceItem[]; cached: boolean }> {
  // References are intentionally network-only: do not persist the index on the device.
  // Remove caches created by older versions as part of the migration.
  try {
    localStorage.removeItem(LEGACY_CACHE_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_CONTENT_CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* storage may be unavailable */ }

  const res = await safeFetch(INDEX_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = normalize(parseCsv(await res.text()));
  return { items, cached: false };
}

function googleDocExportUrl(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? `https://docs.google.com/document/d/${match[1]}/export?format=txt` : null;
}

function isWordType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('docx') || t.includes('word');
}

export async function fetchReferenceDocx(item: ReferenceItem): Promise<ArrayBuffer> {
  if (!isWordType(item.type)) throw new Error('نوع الملف ليس Word.');
  const res = await safeFetch(item.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) throw new Error('الرابط لا يشير إلى ملف Word مباشر.');
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > 15 * 1024 * 1024) throw new Error('حجم ملف Word غير مدعوم.');
  const signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
    throw new Error('الملف ليس DOCX صالحًا.');
  }
  return buffer;
}

export async function fetchReferenceContent(item: ReferenceItem): Promise<string> {
  const target = item.type.toLowerCase().includes('google')
    ? googleDocExportUrl(item.url)
    : item.url;
  if (!target) throw new Error('رابط المستند غير صالح.');

  const res = await safeFetch(target);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error('المستند فارغ.');
  return text;
}

export function isInlineReadable(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes('md') || t.includes('txt') || t.includes('google') || isWordType(t);
}
