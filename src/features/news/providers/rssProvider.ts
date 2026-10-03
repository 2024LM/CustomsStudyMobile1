import { NewsArticle, NewsSource } from '../types';
import { newsDocument, publicNewsUrl, samePublisher } from './sourceAccess';

export async function fetchRss(source: NewsSource): Promise<NewsArticle[]> {
  if (!source.feedUrl) throw new Error('RSS_URL_MISSING');
  const document = await newsDocument(source.feedUrl);
  return parseRss(document.text, source);
}

export function parseRss(markup: string, source: NewsSource): NewsArticle[] {
  const xml = new DOMParser().parseFromString(markup, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('RSS_INVALID_XML');
  return [...xml.querySelectorAll('item, entry')].slice(0, 50).map((node, index) => {
    const text = (selector: string) => node.querySelector(selector)?.textContent?.trim() || '';
    const linkNode = node.querySelector('link[rel="alternate"]') || node.querySelector('link:not([rel="self"])');
    const url = samePublisher(linkNode?.getAttribute('href') || text('link'), source.url);
    const base = url || source.feedUrl;
    const safeImage = (value: string | null | undefined) => {
      try {
        if (!value?.trim()) return undefined;
        return publicNewsUrl(value, base).href;
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
    const contentMarkup=node.getElementsByTagName('content:encoded')[0]?.textContent||text('content, description, summary');
    const contentDocument=new DOMParser().parseFromString(contentMarkup,'text/html');
    contentDocument.querySelectorAll('script,style,nav,footer').forEach(element=>element.remove());
    contentDocument.querySelectorAll('br,p,li').forEach(element=>element.append('\n'));
    const content=(contentDocument.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,12000);
    const rawDate=text('pubDate, published')||node.getElementsByTagName('dc:date')[0]?.textContent?.trim();
    const publishedAt=rawDate && Number.isFinite(Date.parse(rawDate)) ? rawDate : undefined;
    return {
      id: `${source.id}-${text('guid, id') || url || index}`,
      sourceId: source.id,
      title: text('title').slice(0, 500) || 'بدون عنوان',
      summary: content.slice(0, 500),
      content: content || undefined,
      url: url || source.url,
      imageUrl,
      publishedAt,
      publishedTimeKnown: !!publishedAt && /(?:T|\s)\d{1,2}:\d{2}/.test(publishedAt),
    };
  }).filter(article => article.url !== source.url && article.title !== 'بدون عنوان');
}
