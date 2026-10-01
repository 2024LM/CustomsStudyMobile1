import { mkdir, writeFile } from 'node:fs/promises';

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Raje3-NewsFetcher/1.0 (+https://github.com/2024LM/CustomsStudyMobile1)',
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
      id: `${sourceId}-${Buffer.from(key).toString('base64url').slice(0, 48)}`,
      sourceId,
      title: title.slice(0, 280),
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
    id: `${sourceId}-text-${Buffer.from(title + index).toString('base64url').slice(0, 44)}`,
    sourceId,
    title,
    summary: meta || category,
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
    ['https://www.emploi-public.ma/fr/concours-liste', 'مباريات التوظيف'],
    ['https://www.emploi-public.ma/fr/eap-liste', 'امتحانات الكفاءة المهنية'],
  ];
  const articles = [];
  const matcher = /(concours|recrutement|examen|aptitude|résultat|resultat|convocation|annulation|مباراة|امتحان|توظيف)/i;

  for (const [url, category] of pages) {
    try {
      const html = await fetchText(url);
      const linked = extractOfficialLinks(html, url, 'emploi-public', category, matcher, 45);
      const plain = strip(html);
      const rows = extractTextBlocks(
        plain,
        'emploi-public',
        category,
        url,
        /Avis de concours de recrutement de /gi,
        45
      );
      articles.push(...(linked.length >= rows.length ? linked : rows));
    } catch (error) {
      console.warn('[news] emploi-public failed:', error instanceof Error ? error.message : error);
    }
  }
  return articles;
}

async function fetchMen() {
  const pages = [
    ['https://www.men.gov.ma/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA', 'مباريات وزارة التربية الوطنية', 'concours'],
    ['https://www.men.gov.ma/%D8%A5%D8%B9%D9%84%D8%A7%D9%86%D8%A7%D8%AA', 'إعلانات وزارة التربية الوطنية', 'annonces'],
  ];
  const articles = [];

  for (const [url, category, mode] of pages) {
    try {
      const html = await fetchText(url);
      const rows = extractTableRows(html);

      if (mode === 'concours') {
        for (const [index, cells] of rows.entries()) {
          const title = cells.find((cell) => /(?:Avis|Appel|Ouverture|recrutement|candidature|concours|مباراة|ترشيح|توظيف)/i.test(cell) && cell.length > 25);
          if (!title) continue;
          const deadline = cells.find((cell) => /\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i.test(cell) || /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/.test(cell));
          articles.push({
            id: `men-concours-${Buffer.from(title + index).toString('base64url').slice(0, 44)}`,
            sourceId: 'men',
            title: title.slice(0, 280),
            summary: deadline ? `آخر أجل: ${deadline}` : category,
            url,
            category,
          });
        }
      } else {
        for (const [index, cells] of rows.entries()) {
          const date = cells.find((cell) => /\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/i.test(cell) || /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/.test(cell));
          const title = cells.find((cell) => cell.length > 30 && cell !== date && !/Consulter|Télécharger/i.test(cell));
          if (!title) continue;
          articles.push({
            id: `men-annonce-${Buffer.from(title + index).toString('base64url').slice(0, 44)}`,
            sourceId: 'men',
            title: title.slice(0, 280),
            summary: date ? `نشر في: ${date}` : category,
            url,
            category,
          });
        }
      }
    } catch (error) {
      console.warn('[news] MEN failed:', error instanceof Error ? error.message : error);
    }
  }

  return articles;
}

async function fetchFinances() {
  const articles = [];

  try {
    const homeUrl = 'https://www.finances.gov.ma/ar/Pages/index.aspx';
    const html = await fetchText(homeUrl);
    const matcher = /(مباراة|توظيف|ترشيح|مترشح|لائحة|امتحان|الكفاءة المهنية|الجمارك)/i;
    const links = extractOfficialLinks(
      html,
      homeUrl,
      'finances',
      'مباريات ومستجدات وزارة الاقتصاد والمالية',
      matcher,
      45
    );
    articles.push(...links);
  } catch (error) {
    console.warn('[news] finances Arabic homepage failed:', error instanceof Error ? error.message : error);
  }

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
      const publishedAt = year && month && day ? `${year}-${month}-${day}` : undefined;
      articles.push({
        id: `finances-exam-${Buffer.from(grade + index).toString('base64url').slice(0, 44)}`,
        sourceId: 'finances',
        title: grade.slice(0, 280),
        summary: [
          examDate ? `تاريخ الامتحان: ${examDate}` : '',
          dates[1] ? `آخر أجل: ${dates[1]}` : '',
          posts ? `${posts} منصب` : '',
        ].filter(Boolean).join(' • '),
        url,
        publishedAt,
        category: 'امتحانات الكفاءة المهنية',
      });
    }
  } catch (error) {
    console.warn('[news] finances exams failed:', error instanceof Error ? error.message : error);
  }

  return articles;
}

async function fetchHcpRss() {
  const sourceUrl = 'https://www.hcp.ma/xml/syndication.rss';
  try {
    const xml = await fetchText(sourceUrl);
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    return items.slice(0, 30).map((item, index) => {
      const get = (tag) => {
        const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return strip((m?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
      };
      const url = get('link') || 'https://www.hcp.ma/';
      const enclosure = item.match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i)
        || item.match(/<media:(?:content|thumbnail)\b[^>]*url=["']([^"']+)["']/i);
      const imageUrl = enclosure?.[1] || undefined;
      return {
        id: `hcp-${Buffer.from(url + index).toString('base64url').slice(0, 48)}`,
        sourceId: 'hcp',
        title: get('title') || 'المندوبية السامية للتخطيط',
        summary: get('description').slice(0, 500) || undefined,
        url,
        imageUrl,
        publishedAt: get('pubDate') || undefined,
        category: 'أخبار وإحصائيات',
      };
    });
  } catch (error) {
    console.warn('[news] HCP RSS failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

async function fetchOpenData() {
  const arabicNewsUrl = 'https://data.gov.ma/index.php/ar/actualites';
  try {
    const html = await fetchText(arabicNewsUrl);
    const rows = extractTableRows(html);
    const linked = extractOfficialLinks(
      html,
      arabicNewsUrl,
      'open-data-ma',
      'مستجدات البيانات المفتوحة',
      /[\u0600-\u06FF]{8,}/i,
      40
    );

    const plain = strip(html);
    const dateRx = /(\d{2}\/\d{2}\/\d{4})/g;
    const dates = [...plain.matchAll(dateRx)];
    const textItems = [];
    for (let i = 0; i < dates.length; i += 1) {
      const current = dates[i];
      const start = i === 0 ? 0 : (dates[i - 1].index || 0) + dates[i - 1][0].length;
      const end = current.index || plain.length;
      const block = plain.slice(start, end).trim();
      const title = block.split(/المزيد|\s{2,}/).find((part) => /[\u0600-\u06FF]/.test(part) && part.length > 25);
      if (!title) continue;
      const [day, month, year] = current[1].split('/');
      textItems.push({
        id: `open-data-ar-${Buffer.from(title + i).toString('base64url').slice(0, 44)}`,
        sourceId: 'open-data-ma',
        title: title.slice(0, 280),
        summary: 'مستجدات البوابة الوطنية للبيانات المفتوحة',
        url: arabicNewsUrl,
        publishedAt: year && month && day ? `${year}-${month}-${day}` : undefined,
        category: 'البيانات المفتوحة',
      });
    }

    const arabicItems = [...linked, ...textItems].filter((item) => /[\u0600-\u06FF]/.test(item.title));
    if (arabicItems.length) return arabicItems;
  } catch (error) {
    console.warn('[news] data.gov.ma Arabic news failed:', error instanceof Error ? error.message : error);
  }

  const url = new URL('https://data.gov.ma/data/api/3/action/package_search');
  url.searchParams.set('q', '*:*');
  url.searchParams.set('rows', '30');
  url.searchParams.set('sort', 'metadata_modified desc');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    if (!payload?.success) return [];
    return (payload.result?.results || []).map((item, index) => ({
      id: `open-data-ma-${item.name || index}`,
      sourceId: 'open-data-ma',
      title: String(item.title || item.name || 'بيانات مغربية'),
      summary: strip(String(item.notes || '')).slice(0, 500) || undefined,
      url: item.name ? `https://data.gov.ma/ar/dataset/${encodeURIComponent(item.name)}` : 'https://data.gov.ma/ar',
      imageUrl: item.organization?.image_display_url || item.organization?.image_url || undefined,
      publishedAt: item.metadata_modified || item.metadata_created || undefined,
      category: 'بيانات مفتوحة',
    }));
  } catch (error) {
    console.warn('[news] data.gov.ma failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

const dedupe = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = (item.url || item.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const articles = dedupe([
  ...(await fetchEmploiPublic()),
  ...(await fetchMen()),
  ...(await fetchFinances()),
  ...(await fetchHcpRss()),
  ...(await fetchOpenData()),
]).slice(0, 180);

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2) + '\n', 'utf8');
console.log(`[news] wrote ${articles.length} articles to public/news-feed.json`);
