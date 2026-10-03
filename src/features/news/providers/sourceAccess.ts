import { Capacitor, CapacitorHttp } from '@capacitor/core';

export function publicNewsUrl(raw: string, base?: string): URL {
  let url: URL;
  try { url = new URL(raw.trim(), base); } catch { throw new Error('أدخل رابطًا صحيحًا يبدأ بـ https://'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) {
    throw new Error('يلزم رابط HTTPS لموقع عام، دون بيانات دخول أو عنوان شبكة محلية.');
  }
  url.hash = '';
  return url;
}
export function samePublisher(raw: string, base: string): string | undefined {
  try {
    const url = publicNewsUrl(raw, base), publisher = publicNewsUrl(base);
    return url.hostname.replace(/^www\./, '') === publisher.hostname.replace(/^www\./, '') ? url.href : undefined;
  } catch { return undefined; }
}
const MAX_BYTES = 2 * 1024 * 1024;
export async function newsDocument(raw: string): Promise<{ text: string; url: string }> {
  const publisher = publicNewsUrl(raw).href;
  let url = publisher;
  const visited = new Set<string>();
  const follow = (location: string | null | undefined) => {
    const next = location && samePublisher(location,url);
    if(!next || !samePublisher(next,publisher) || visited.has(next))throw new Error('أعاد المصدر التوجيه إلى رابط غير آمن أو متكرر.');
    return next;
  };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    for(let hop=0;hop<4;hop++) {
      visited.add(url);
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 12000, readTimeout: 12000,
          disableRedirects: true, headers: { Accept: 'application/rss+xml, application/atom+xml, text/html, application/xml' } });
        if([301,302,303,307,308].includes(response.status)) {
          const location=Object.entries(response.headers||{}).find(([name])=>name.toLowerCase()==='location')?.[1];
          url=follow(location);continue;
        }
        if (response.status < 200 || response.status >= 300) throw new Error(`تعذر قراءة الموقع (HTTP ${response.status}).`);
        const text = typeof response.data === 'string' ? response.data : '';
        if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('صفحة المصدر أكبر من الحد المدعوم.');
        return { text, url };
      }
      // Node's build job exposes Location. Browsers may hide it behind an opaque redirect.
      const response = await fetch(url, { credentials: 'omit', redirect: 'manual', signal: controller.signal });
      if(response.type==='opaqueredirect')throw new Error('يحجب المتصفح إعادة توجيه المصدر. يلزم رابطه المباشر أو صفحة أرشيف محفوظة.');
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');
        await response.body?.cancel();url=follow(location);continue;
      }
      if (!response.ok) throw new Error(`تعذر قراءة الموقع (HTTP ${response.status}).`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('لم يُرجع الموقع محتوى قابلًا للقراءة.');
      const decoder = new TextDecoder(); let text = '', bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) throw new Error('صفحة المصدر أكبر من الحد المدعوم.');
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); }
      return { text, url };
    }
    throw new Error('أعاد المصدر التوجيه مرات كثيرة. جرّب الرابط المباشر.');
  } catch (error) {
    if (error instanceof TypeError) throw new Error('تعذر الوصول إلى الموقع. قد يمنع الجلب من الويب؛ الأخبار المعروضة سابقًا تبقى محفوظة.');
    if (error instanceof Error && error.name === 'AbortError') throw new Error('انتهت مهلة قراءة الموقع. أعد المحاولة لاحقًا.');
    throw error;
  } finally { clearTimeout(timer); }
}
