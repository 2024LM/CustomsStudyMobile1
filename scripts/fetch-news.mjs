import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { collectLocalizedPages, discoverArabicUrls, isArabicText, preferArabicStories, stableNewsId } from './news-language.mjs';

import { inlineImage, feedImage, enrichArticleImages } from './news-images.mjs';

import { enrichNewsDocuments, publicationDate, plainNewsText, retainNewsFeed } from './news-document.mjs';

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
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function extractTableRows(html) {
  const rows = [];
  const rowRx = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRx.exec(html))) {
    const cells = [];
    const cellRx = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch;
    while ((cellMatch = cellRx.exec(rowMatch[1]))) {
      const value = strip(cellMatch[1]);
      if (value) cells.push(value);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function extractOfficialLinks(html, pageUrl, sourceId, category, matcher, limit = 35) {
  const items = [];
  const seen = new Set();
  const anchor = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html)) && items.length < limit) {
    const title = strip(match[2]);
    if (title.length < 18 || !matcher.test(title)) continue;
    const url = absoluteUrl(pageUrl, match[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const key = (url + title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: stableNewsId(sourceId, key),
      sourceId,
      title: title.slice(0, 280),
      imageUrl: inlineImage(match[2], pageUrl),
      summary: category,
      url,
      category,
    });
  }
  return items;
}


function articleFromBlock(sourceId, category, pageUrl, block, index) {
  const text = strip(block);
  if (text.length < 18) return null;
  const deadline = text.match(/(?:Limite de dépôt|Date limite|آخر أجل)\s*:?\s*([^|]{4,45})/i)?.[1]?.trim();
  const examDate = text.match(/(?:Date du concours|تاريخ المباراة)\s*:?\s*([^|]{4,45})/i)?.[1]?.trim();
  const posts = text.match(/(\d+)\s+postes?/i)?.[1];
  const title = text
    .replace(/\s+(Annonce|Résultat|Resultat|Ouvert|Fermé|Consulter)\b[\s\S]*$/i, '')
    .slice(0, 240)
    .trim();
  const meta = [
    posts ? `${posts} منصب` : '',
    deadline ? `آخر أجل: ${deadline}` : '',
    examDate ? `تاريخ المباراة: ${examDate}` : '',
  ].filter(Boolean).join(' • ');
  return {
    id: stableNewsId(sourceId, pageUrl + '|' + title),
    sourceId,
    title,
    summary: meta || category,
    content: text,
    url: pageUrl,
    category,
  };
}

function extractTextBlocks(plain, sourceId, category, pageUrl, startPattern, limit = 40) {
  const starts = [];
  const rx = new RegExp(startPattern.source, startPattern.flags.includes('g') ? startPattern.flags : startPattern.flags + 'g');
  let match;
  while ((match = rx.exec(plain)) && starts.length < limit + 1) starts.push(match.index);
  const items = [];
  for (let i = 0; i < starts.length && items.length < limit; i += 1) {
    const end = starts[i + 1] ?? Math.min(plain.length, starts[i] + 700);
    const item = articleFromBlock(sourceId, category, pageUrl, plain.slice(starts[i], end), i);
    if (item) items.push(item);
  }
  return items;
}

async function fetchEmploiPublic() {
  const pages = [
    { url: 'https://www.emploi-public.ma/ar/قائمة-المباريات', fallbackUrls: ['https://www.emploi-public.ma/fr/concours-liste'], category: 'مباريات التوظيف' },
    // The French page advertises its Arabic counterpart if one is available.
    { url: 'https://www.emploi-public.ma/fr/eap-liste', category: 'امتحانات الكفاءة المهنية' },
  ];
  const matcher = /(concours|recrutement|examen|aptitude|résultat|resultat|convocation|annulation|مباراة|مباريات|امتحان|توظيف)/i;
  return collectLocalizedPages(pages, fetchText, (html, url, page) => {
    const linked = extractOfficialLinks(html, url, 'emploi-public', page.category, matcher, 45);
    const rows = extractTextBlocks(strip(html), 'emploi-public', page.category, url,
      /(?:Avis de concours de recrutement de |(?:إعلان عن )?مباراة توظيف\s)/gi, 45);
    return linked.length ? linked : rows;
  });
}

async function fetchMen() {
  const pages = [
    { url: 'https://www.men.gov.ma/مباريات', category: 'مباريات وزارة التربية الوطنية', mode: 'concours' },
    { url: 'https://www.men.gov.ma/إعلانات', fallbackUrls: ['https://www.men.gov.ma/Ar/Pages/AdminActualite.aspx'], category: 'إعلانات وزارة التربية الوطنية', mode: 'annonces' },
  ];
  return collectLocalizedPages(pages, fetchText, (html, url, page) => {
    const items = [];
    for (const cells of extractTableRows(html)) {
      const candidates = cells.filter(cell => cell.length > 25 && !/^(?:Consulter|Télécharger|تحميل|اطلاع)$/i.test(cell));
      const eligible = page.mode === 'concours' ? candidates.filter(cell => /(?:Avis|Appel|Ouverture|recrutement|candidature|concours|مباراة|مباريات|ترشيح|توظيف)/i.test(cell)) : candidates;
      const title = eligible.find(isArabicText) || eligible[0];
      if (!title) continue;
      const date = cells.find(cell => /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/.test(cell) || /\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i.test(cell));
      items.push({
        id: stableNewsId('men', url + '|' + title), sourceId: 'men', title: title.slice(0, 280),
        summary: date ? (page.mode === 'concours' ? 'آخر أجل: ' : 'نشر في: ') + date : page.category,
        content: cells.join('\n'),
        ...(page.mode === 'annonces' ? publicationDate(date) : {}),
        url, category: page.category,
      });
    }
    const links = extractOfficialLinks(html, url, 'men', page.category,
      /(?:Avis|recrutement|concours|communiqué|مباراة|مباريات|ترشيح|توظيف|إعلان|بلاغ)/i, 40);
    return [...items, ...links];
  });
}

async function fetchFinances() {
  const articles = [];

  const homeItems = await collectLocalizedPages([
    { url: 'https://www.finances.gov.ma/ar/Pages/index.aspx', fallbackUrls: ['https://www.finances.gov.ma/fr/Pages/index.aspx'] }
  ], fetchText, (html, url) => extractOfficialLinks(html, url, 'finances',
    'مباريات ومستجدات وزارة الاقتصاد والمالية',
    /(مباراة|توظيف|ترشيح|مترشح|لائحة|امتحان|الكفاءة المهنية|الجمارك|concours|recrutement|candidature|examen|douane)/i, 45));
  articles.push(...homeItems);

  try {
    const url = 'https://www.finances.gov.ma/ar/%D9%84%D8%AA%D9%88%D8%AC%D9%8A%D9%87%D9%83%D9%85/Pages/%D8%A7%D9%85%D8%AA%D8%AD%D8%A7%D9%86-%D8%A7%D9%84%D9%83%D9%81%D8%A7%D8%A1%D8%A9-%D8%A7%D9%84%D9%85%D9%87%D9%86%D9%8A%D8%A9.aspx';
    const html = await fetchText(url);
    const rows = extractTableRows(html);
    for (const [index, cells] of rows.entries()) {
      if (cells.length < 4) continue;
      const grade = cells[0];
      if (/الدرجة|تاريخ امتحان/i.test(grade) || grade.length < 3) continue;
      const dates = cells.filter((cell) => /\b\d{2}\/\d{2}\/\d{4}\b/.test(cell));
      const posts = cells.find((cell) => /^\d+$/.test(cell));
      if (!dates.length) continue;
      const examDate = dates[0];
      const [day, month, year] = examDate.split('/');
      const eventDate = year && month && day ? `${year}-${month}-${day}` : undefined;
      articles.push({
        id: stableNewsId('finances', url + '|' + grade),
        sourceId: 'finances',
        title: grade.slice(0, 280),
        summary: [
          examDate ? `تاريخ الامتحان: ${examDate}` : '',
          dates[1] ? `آخر أجل: ${dates[1]}` : '',
          posts ? `${posts} منصب` : '',
        ].filter(Boolean).join(' • '),
        url,
        eventDate,
        content: cells.join('\n'),
        category: 'امتحانات الكفاءة المهنية',
      });
    }
  } catch (error) {
    console.warn('[news] finances exams failed:', error instanceof Error ? error.message : error);
  }

  return articles;
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
  articles = retainNewsFeed(articles);
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2) + '\n', 'utf8');
  console.log('[news] wrote ' + articles.length + ' articles to public/news-feed.json');
  return articles;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await refreshNews();
