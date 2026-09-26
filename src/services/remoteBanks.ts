export interface RemoteBankItem {
  id: string;
  name: string;
  description: string;
  downloadUrl: string;
  version: string;
}

const SHEET_ID = '1C20YbXadWaMSaHimzbxucd8Cq10P67KJVmPROc2ZxAk';
const SHEET_NAME = 'Sheet1';
const INDEX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const CACHE_KEY = 'customs_remote_banks_v1';
const MAX_BANK_BYTES = 5 * 1024 * 1024;
const BANK_FETCH_TIMEOUT_MS = 20000;

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

function normalize(rows: string[][]): RemoteBankItem[] {
  if (rows.length < 2) return [];
  const h = rows[0].map((v) => v.trim());
  const at = (n: string) => h.indexOf(n);
  const req = ['ID', 'اسم البنك', 'وصف مختصر', 'رابط التحميل', 'الإصدار'];
  if (req.some((x) => at(x) < 0)) throw new Error('صيغة فهرس البنوك غير متوافقة.');

  const seen = new Set<string>();
  return rows.slice(1)
    .map((r) => ({
      id: (r[at('ID')] || '').trim(),
      name: (r[at('اسم البنك')] || '').trim(),
      description: (r[at('وصف مختصر')] || '').trim(),
      downloadUrl: (r[at('رابط التحميل')] || '').trim(),
      version: (r[at('الإصدار')] || '').trim(),
    }))
    .filter((x) => {
      if (!x.id || !x.name || !/^https:\/\//i.test(x.downloadUrl) || seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
}

export async function fetchRemoteBanks(force = false): Promise<{ items: RemoteBankItem[]; cached: boolean }> {
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.items) && Date.now() - Number(p.savedAt || 0) < 15 * 60 * 1000) {
          return { items: p.items, cached: true };
        }
      }
    } catch {}
  }

  try {
    const res = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = normalize(parseCsv(await res.text()));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
    return { items, cached: false };
  } catch (e) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return { items: JSON.parse(raw).items || [], cached: true };
    } catch {}
    throw e;
  }
}

export function resolveBankDownloadUrl(url: string): string {
  const value = url.trim();

  const sheet = value.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (sheet) return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=xlsx`;

  const drive = value.match(/^https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (drive) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(drive[1])}`;

  const github = value.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (github) return `https://raw.githubusercontent.com/${github[1]}/${github[2]}/${github[3]}/${github[4]}`;

  return value;
}

export async function fetchRemoteBankFile(bank: RemoteBankItem): Promise<File> {
  const url = resolveBankDownloadUrl(bank.downloadUrl);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('رابط البنك غير آمن');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BANK_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`تعذر تنزيل الملف (HTTP ${res.status})`);

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) throw new Error('رابط البنك يعيد صفحة ويب بدل ملف XLSX');

    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) throw new Error('ملف البنك فارغ');
    if (buffer.byteLength > MAX_BANK_BYTES) throw new Error('حجم البنك يتجاوز 5 MB');

    const sig = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    const zipSignature =
      sig.length >= 4 &&
      sig[0] === 0x50 &&
      sig[1] === 0x4b &&
      (
        (sig[2] === 0x03 && sig[3] === 0x04) ||
        (sig[2] === 0x05 && sig[3] === 0x06) ||
        (sig[2] === 0x07 && sig[3] === 0x08)
      );

    if (!zipSignature) throw new Error('الملف الذي تم تنزيله ليس XLSX صالحًا');

    return new File(
      [buffer],
      `${bank.name.slice(0, 60) || bank.id}.xlsx`,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('انتهت مهلة تنزيل البنك');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
