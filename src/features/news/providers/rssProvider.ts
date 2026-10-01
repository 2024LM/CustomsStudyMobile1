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
    const base = url || source.feedUrl;
    const safeImage = (value: string | null | undefined) => {
      try {
        if (!value?.trim()) return undefined;
        const parsed = new URL(value, base);
        return /^https?:$/.test(parsed.protocol) ? parsed.href : undefined;
      } catch { return undefined; }
    };
    const attachments = [...node.getElementsByTagName('*')].filter(element =>
      ['enclosure', 'content', 'thumbnail'].includes(element.localName) &&
      (element.localName === 'enclosure' || element.prefix === 'media'));
    let imageUrl: string | undefined;
    for (const attachment of attachments) {
      const type = attachment.getAttribute('type') || '';
      const medium = attachment.getAttribute('medium') || '';
      if ((type && !type.startsWith('image/')) || (medium && medium !== 'image')) continue;
      const candidate = safeImage(attachment.getAttribute('url'));
      if (candidate && (type.startsWith('image/') || medium === 'image' || attachment.localName === 'thumbnail' ||
        /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(candidate))) {
        imageUrl = candidate;
        break;
      }
    }
    if (!imageUrl) {
      const markup = text('description, summary, content');
      const document = new DOMParser().parseFromString(markup, 'text/html');
      for (const image of document.querySelectorAll('img')) {
        imageUrl = safeImage(image.getAttribute('data-src') || image.getAttribute('src'));
        if (imageUrl) break;
      }
    }
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
