import { NewsArticle, NewsSource } from '../types';

export async function fetchRss(source: NewsSource): Promise<NewsArticle[]> {
  if (!source.feedUrl) throw new Error('RSS_URL_MISSING');
  const response = await fetch(source.feedUrl, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error(`RSS_HTTP_${response.status}`);
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('RSS_INVALID_XML');
  return [...xml.querySelectorAll('item, entry')].slice(0, 50).map((node, index) => {
    const text = (selector: string) => node.querySelector(selector)?.textContent?.trim() || '';
    const linkNode = node.querySelector('link');
    const url = linkNode?.getAttribute('href') || text('link');
    const enclosure = node.querySelector('enclosure');
    const mediaContent = node.getElementsByTagName('media:content')[0];
    const mediaThumbnail = node.getElementsByTagName('media:thumbnail')[0];
    const imageUrl =
      (enclosure?.getAttribute('type')?.startsWith('image/') ? enclosure.getAttribute('url') : null) ||
      mediaContent?.getAttribute('url') ||
      mediaThumbnail?.getAttribute('url') ||
      undefined;
    return {
      id: `${source.id}-${text('guid, id') || url || index}`,
      sourceId: source.id,
      title: text('title') || 'بدون عنوان',
      summary: text('description, summary, content').replace(/<[^>]+>/g, '').slice(0, 500),
      url: url || source.url,
      imageUrl,
      publishedAt: text('pubDate, published, updated') || undefined,
    };
  });
}
