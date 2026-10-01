import { createHash } from 'node:crypto';

export const isArabicText = (text = '') => {
  const arabic = (text.match(/[\u0621-\u064A\u066E-\u06D3]/g) || []).length;
  const latin = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  return arabic > 0 && arabic >= latin;
};
export function stableNewsId(sourceId, value) {
  return sourceId + '-' + createHash('sha256').update(value).digest('hex').slice(0, 24);
}
export function discoverArabicUrls(html, baseUrl) {
  const urls = new Set();
  const base = new URL(baseUrl);
  const tags = html.match(/<a\b[^>]*>[\s\S]*?<\/a>|<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const explicit = /\bhreflang\s*=\s*["']ar(?:-[^"']*)?["']/i.test(tag);
    const label = tag.replace(/<[^>]+>/g, ' ').trim();
    if (!href || (!explicit && !/^(?:العربية|عربي|Arabic)$/i.test(label))) continue;
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), base);
      if (url.protocol === 'https:' && url.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) urls.add(url.href);
    } catch {}
  }
  return [...urls].slice(0, 3);
}
export function preferArabicStories(articles) {
  const byStory = new Map();
  for (const item of articles) {
    let key = item.sourceId + '|' + item.url + '|' + item.title.trim().toLowerCase();
    try {
      const url = new URL(item.url);
      const uuid = url.pathname.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
      let path = decodeURIComponent(url.pathname).replace(/^\/(?:ar|fr|en)(?=\/)/i, '').replace(/\/+$/, '');
      for (const parameter of ['lang', 'language', 'locale']) url.searchParams.delete(parameter);
      if (uuid) key = item.sourceId + '|' + url.host + '|' + uuid.toLowerCase();
      else if (/\/(?:details|détails|تفاصيل|dataset|article|actualite|actualites)\//i.test(path) || /_a\d+\.html$/i.test(path)) key = item.sourceId + '|' + url.host + path + url.search;
    } catch {}
    const previous = byStory.get(key);
    if (!previous || (!isArabicText(previous.title) && isArabicText(item.title))) {
      byStory.set(key, { ...item, imageUrl: item.imageUrl || previous?.imageUrl });
    } else if (!previous.imageUrl && item.imageUrl) {
      byStory.set(key, { ...previous, imageUrl: item.imageUrl });
    }
  }
  return [...byStory.values()];
}
export async function collectLocalizedPages(pages, fetchText, extract) {
  const visited = new Set();
  const articles = [];
  for (const page of pages) {
    const candidates = [page.url, ...(page.fallbackUrls || [])];
    for (let i = 0; i < candidates.length && i < 6; i++) {
      const url = candidates[i];
      if (visited.has(url)) continue;
      visited.add(url);
      try {
        const html = await fetchText(url);
        const extracted = extract(html, url, page);
        articles.push(...extracted);
        // Use actual links advertised by the publisher rather than inventing /ar routes.
        for (const alternate of discoverArabicUrls(html, url)) if (!visited.has(alternate)) candidates.push(alternate);
        console.log('[news] ' + url + ': ' + extracted.length + ' articles, ' + extracted.filter(item => isArabicText(item.title)).length + ' Arabic');
      } catch (error) {
        console.warn('[news] ' + url + ': ' + (error instanceof Error ? error.message : error));
      }
    }
  }
  return preferArabicStories(articles);
}

export function localizedValue(value, fallback = '') {
  if (typeof value === 'string') {
    if (value.trim().startsWith('{')) {
      try { return localizedValue(JSON.parse(value), fallback); } catch {}
    }
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of ['ar', 'ar_MA', 'ar-MA', 'fr', 'en']) if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    return Object.values(value).find(item => typeof item === 'string' && item.trim()) || fallback;
  }
  return fallback;
}
