import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { collectLocalizedPages, discoverArabicUrls, preferArabicStories, stableNewsId } from './news-language.mjs';

import { feedImage, enrichArticleImages } from './news-images.mjs';

import { enrichNewsDocuments, publicationDate, plainNewsText, retainNewsFeed } from './news-document.mjs';

import { extractMenUpdates, extractFinancesUpdates, extractEmploiAnnouncements } from './news-official.mjs';

const OUT = new URL('../public/news-feed.json', import.meta.url);

const strip = (value = '') => value
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

function absoluteUrl(base, href) {
  try { return new URL(href, base).toString(); } catch { return base; }
}

const pageCache = new Map();
async function fetchText(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const task = fetchTextUncached(url);
  pageCache.set(url, task);
  return task;
}
async function fetchTextUncached(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Raje3-NewsFetcher/1.0 (+https://github.com/2024LM/CustomsStudyMobile1)',
      'accept-language': 'ar,fr;q=0.8,en;q=0.5',
      accept: 'text/html,application/xhtml+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchEmploiPublic() {
  return collectLocalizedPages([
    { url: 'https://www.emploi-public.ma/ar/قائمة-المباريات', fallbackUrls: ['https://www.emploi-public.ma/fr/concours-liste'], category: 'مباريات التوظيف' },
  ], fetchText, (html, url, page) => extractEmploiAnnouncements(html, url, page.category));
}

async function fetchMen() {
  return collectLocalizedPages([
    { url: 'https://www.men.gov.ma/مستجدات' },
  ], fetchText, extractMenUpdates);
}

async function fetchFinances() {
  for (const url of ['https://www.finances.gov.ma/ar/Pages/مستجدات.aspx', 'https://www.finances.gov.ma/ar/Pages/index.aspx']) {
    try {
      const articles = extractFinancesUpdates(await fetchText(url), url);
      console.log('[news] ' + url + ': ' + articles.length + ' updates');
      if (articles.length) return articles;
    } catch (error) { console.warn('[news] finances: ' + (error instanceof Error ? error.message : error)); }
  }
  return [];
}

function rssFeedUrls(html, base) {
  const urls = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\btype=["']application\/(?:rss|atom)\+xml["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href) {
      const url = absoluteUrl(base, href);
      if (new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '')) urls.push(url);
    }
  }
  return urls;
}
async function fetchHcpRss() {
  const root = 'https://www.hcp.ma/';
  const feeds = ['https://www.hcp.ma/xml/syndication.rss'];
  try {
    const html = await fetchText(root);
    // Discover the publisher's Arabic version and its feed; keep the standard RSS as fallback.
    for (const alternate of discoverArabicUrls(html, root)) {
      try { feeds.unshift(...rssFeedUrls(await fetchText(alternate), alternate)); } catch {}
    }
  } catch {}
  const articles = [];
  for (const sourceUrl of [...new Set(feeds)].slice(0, 4)) {
    try {
      const xml = await fetchText(sourceUrl);
      const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
      for (const item of items.slice(0, 30)) {
        const get = tag => {
          const match = item.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
          return strip((match?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
        };
        const url = get('link') || root;
        const image = feedImage(item, url);
        articles.push({ id: stableNewsId('hcp', url), sourceId: 'hcp', title: get('title') || 'المندوبية السامية للتخطيط',
          summary: get('description').slice(0, 500) || undefined,
          content: plainNewsText((item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] || item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')) || undefined,
          url, imageUrl: image, ...publicationDate(get('pubDate')), category: 'أخبار وإحصائيات' });
      }
      console.log('[news] HCP feed ' + sourceUrl + ': ' + items.length + ' items');
    } catch (error) { console.warn('[news] HCP RSS failed:', error instanceof Error ? error.message : error); }
  }
  return preferArabicStories(articles);
}

export { fetchEmploiPublic, fetchMen, fetchFinances, fetchHcpRss };
export async function refreshNews() {
  const batches = await Promise.all([fetchEmploiPublic(), fetchMen(), fetchFinances(), fetchHcpRss()]);
  let articles = preferArabicStories(batches.flat()).slice(0, 180);
  await enrichNewsDocuments(articles, fetchText);
  await enrichArticleImages(articles, fetchText);
  const refreshedSourceIds = [...new Set(articles.map(article => article.sourceId))];
  // Publisher outages must not turn the last successful source into an empty feed.
  try {
    const previous = JSON.parse(await readFile(OUT, 'utf8'));
    if (previous.schemaVersion === 2 && Array.isArray(previous.articles)) {
      articles.push(...previous.articles.filter(article => !refreshedSourceIds.includes(article.sourceId)));
    }
  } catch {}
  articles = retainNewsFeed(articles);
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify({ schemaVersion: 2, refreshedSourceIds, generatedAt: new Date().toISOString(), articles }, null, 2) + '\n', 'utf8');
  console.log('[news] wrote ' + articles.length + ' articles to public/news-feed.json');
  return articles;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await refreshNews();
