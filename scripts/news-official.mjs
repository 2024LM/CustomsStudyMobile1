import { stableNewsId } from './news-language.mjs';
import { inlineImage } from './news-images.mjs';
import { plainNewsText, publicationDate } from './news-document.mjs';

function urlFor(href, base) {
  try {
    const url = new URL(href.replace(/&amp;/g, '&'), base);
    return url.protocol === 'https:' && url.hostname === new URL(base).hostname ? url.href : undefined;
  } catch { return undefined; }
}
const text = html => plainNewsText(html).replace(/\s+/g, ' ').trim();
function item(sourceId, url, title, category, extra = {}) {
  return { id: stableNewsId(sourceId, url), sourceId, url, title: title.slice(0, 280), category, ...extra };
}

/* Match actual publisher cards, never navigation links or keyword hits. */
export function extractMenUpdates(html, base) {
  const results = [];
  for (const block of html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || []) {
    const title = text(block.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || '');
    const href = block.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const url = href && urlFor(href, base);
    if (!url || title.length < 18) continue;
    const date = block.match(/\bdatetime=["']([^"']+)["']/i)?.[1];
    results.push(item('men', url, title, 'مستجدات وزارة التربية الوطنية', {
      ...publicationDate(date), imageUrl: inlineImage(block, base),
    }));
  }
  return results;
}

export function extractFinancesUpdates(html, base) {
  const results = [];
  // The official archive renders each news row with an h2 link, date and summary.
  const rows = html.split(/<div\b[^>]*class=["'](?:row|item(?:\s+active)?)\s*["'][^>]*>/i).slice(1);
  for (const block of rows) {
    const heading = block.match(/<h[24]\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[24]>/i);
    if (!heading) continue;
    const url = urlFor(heading[1], base);
    if (!url || !/\/مستجدة\.aspx$/i.test(decodeURIComponent(new URL(url).pathname)) || !/^\d+$/.test(new URL(url).searchParams.get('fiche') || '')) continue;
    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => text(match[1]));
    const date = paragraphs.find(value => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value));
    const summary = paragraphs.find(value => value.length > 35);
    results.push(item('finances', url, text(heading[2]), 'مستجدات الاقتصاد والمالية', {
      ...publicationDate(date), summary: summary?.slice(0, 500), content: summary,
      imageUrl: inlineImage(block, base),
    }));
    if (results.length >= 30) break;
  }
  return results;
}

export function extractEmploiAnnouncements(html, base, category) {
  const results = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = urlFor(match[1], base);
    if (!url) continue;
    const path = decodeURIComponent(new URL(url).pathname);
    if (!/^\/(?:ar|fr)\/(?:تفاصيل|details)\/[^/]+\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/?$/i.test(path)) continue;
    const block = match[2];
    const title = text(block.match(/<h[24]\b[^>]*>([\s\S]*?)<\/h[24]>/i)?.[1] || block);
    if (title.length < 18) continue;
    const agency = text(block.match(/<div\b[^>]*class=["']card-text["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const footer = text(block.match(/<div\b[^>]*class=["']card-footer["'][^>]*>([\s\S]*)/i)?.[1] || '');
    results.push(item('emploi-public', url, title, category, {
      summary: [agency, footer].filter(Boolean).join(' • ').slice(0, 500) || category,
      content: plainNewsText(block), imageUrl: inlineImage(block, base),
    }));
    if (results.length >= 40) break;
  }
  return results;
}
