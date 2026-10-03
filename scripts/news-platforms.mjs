import { stableNewsId } from './news-language.mjs';
import { feedImage, inlineImage } from './news-images.mjs';
import { plainNewsText, publicationDate } from './news-document.mjs';

const text = value => plainNewsText(value || '').replace(/\s+/g, ' ').trim();
function publisherUrl(raw, base) {
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'), base);
    return url.protocol === 'https:' && url.hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '') ? url.href : undefined;
  } catch { return undefined; }
}
export function opportunityCategory(value) {
  if (/نتائج|لوائح|استدعاء|résultat|convoqu/i.test(value)) return 'النتائج والاستدعاءات';
  if (/ماستر|master|doctorat|دكتوراه/i.test(value)) return 'الماستر والدراسات العليا';
  if (/منح|bourse/i.test(value)) return 'المنح الدراسية';
  if (/توظيف|recrutement/i.test(value)) return 'مباريات التوظيف';
  return 'المباريات والتكوين';
}
export function extractTawjihFeed(xml, base = 'https://www.tawjihnet.net/') {
  const articles = [];
  for (const block of (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).slice(0, 30)) {
    const raw = tag => (block.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1');
    const url = publisherUrl(text(raw('link')), base);
    const title = text(raw('title'));
    if (!url || title.length < 12) continue;
    const summary = text(raw('description')).slice(0, 500);
    articles.push({ id: stableNewsId('tawjihnet', url), sourceId: 'tawjihnet', title: title.slice(0, 280),
      url, summary, content: plainNewsText(raw('content:encoded') || raw('description')) || undefined,
      imageUrl: feedImage(block, url), ...publicationDate(text(raw('pubDate'))),
      category: opportunityCategory(title + ' ' + summary),
    });
  }
  return articles;
}
export function extractAlwadifaPublic(html, base = 'https://alwadifa-maroc.com/offre/public') {
  const articles = [];
  for (const block of html.match(/<article\b[^>]*class=["'][^"']*\bcontent-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi) || []) {
    if (!/\bdata-id=["']offre_\d+["']/i.test(block.slice(0, block.indexOf('>') + 1))) continue;
    const heading = block.match(/<h2\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!heading) continue;
    const url = publisherUrl(heading[1], base);
    if (!url || !/^\/offre\/show\/id\/\d+\/?$/.test(new URL(url).pathname)) continue;
    const title = text(heading[2]);
    if (title.length < 18) continue;
    const description = block.match(/<div\b[^>]*class=["']content-description["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const meta = block.match(/<div\b[^>]*class=["']content-meta["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const date = text(meta).match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    articles.push({ id: stableNewsId('alwadifa', url), sourceId: 'alwadifa', title: title.slice(0, 280),
      url, summary: text(description).slice(0, 500), imageUrl: inlineImage(block, base),
      ...publicationDate(date), category: opportunityCategory(title),
    });
    if (articles.length >= 30) break;
  }
  return articles;
}
