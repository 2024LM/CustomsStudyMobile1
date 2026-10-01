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

async function fetchEmploiPublic() {
  const pages = [
    ['https://www.emploi-public.ma/fr/concours-liste?procedure=avis&stat=service_etat', 'مباريات التوظيف'],
    ['https://www.emploi-public.ma/fr/eap-liste', 'امتحانات الكفاءة المهنية'],
  ];
  const articles = [];

  for (const [url, category] of pages) {
    try {
      const html = await fetchText(url);
      const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = anchor.exec(html)) && articles.length < 80) {
        const title = strip(match[2]);
        if (title.length < 35) continue;
        if (!/(concours|recrutement|examen|aptitude|publication|résultat|resultat|convocation|مباراة|امتحان)/i.test(title)) continue;
        const articleUrl = absoluteUrl(url, match[1]);
        if (!articleUrl.startsWith('https://www.emploi-public.ma/')) continue;
        articles.push({
          id: `emploi-public-${Buffer.from(articleUrl + title).toString('base64url').slice(0, 48)}`,
          sourceId: 'emploi-public',
          title: title.slice(0, 280),
          summary: category,
          url: articleUrl,
          category,
        });
      }
    } catch (error) {
      console.warn('[news] emploi-public failed:', error instanceof Error ? error.message : error);
    }
  }
  return articles;
}

async function fetchHcpRss() {
  const sourceUrl = 'https://www.cnd.hcp.ma/xml/syndication.rss';
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
  const url = new URL('https://data.gov.ma/data/api/3/action/package_search');
  url.searchParams.set('q', 'concours OR examen OR recrutement OR education');
  url.searchParams.set('rows', '20');
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
      url: item.name ? `https://data.gov.ma/data/dataset/${encodeURIComponent(item.name)}` : 'https://data.gov.ma/',
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
  ...(await fetchHcpRss()),
  ...(await fetchOpenData()),
]).slice(0, 120);

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2) + '\n', 'utf8');
console.log(`[news] wrote ${articles.length} articles to public/news-feed.json`);
