import { NewsArticle, NewsExtraction, NewsSource } from '../types';
import { newsDocument, publicNewsUrl, samePublisher } from './sourceAccess';
import { parseRss } from './rssProvider';

export interface SourcePreview { source: NewsSource; articles: NewsArticle[] }
export class UnsupportedNewsSource extends Error {
  constructor(public page: { text: string; url: string }) {
    super('عذرًا، لم نتعرف على قالب أخبار مناسب. لم يُضف الموقع. جرّب رابط قسم الأخبار، أو اطلب إعدادًا بمساعدة الذكاء الاصطناعي.');
  }
}
export function validateExtraction(value: unknown): NewsExtraction {
  if (!value || typeof value !== 'object') throw new Error('لم يُرجع الذكاء الاصطناعي إعدادات مدعومة.');
  const data = value as Record<string, unknown>, result: Record<string, string> = {};
  for (const key of ['item', 'title', 'link', 'summary', 'date']) {
    const selector = data[key];
    if (selector === undefined || selector === '') { if (['item', 'title', 'link'].includes(key)) throw new Error('إعدادات الاستخراج ناقصة.'); continue; }
    if (typeof selector !== 'string' || selector.length > 180 || /[{};\\]|:has\(|:nth-/i.test(selector)) throw new Error('إعدادات الاستخراج خارج الحدود المدعومة.');
    try { new DOMParser().parseFromString('<article></article>', 'text/html').querySelector(selector); }
    catch { throw new Error('محددات قالب الأخبار غير صالحة.'); }
    result[key] = selector;
  }
  return result as unknown as NewsExtraction;
}
function htmlDocument(markup: string): Document {
  const document = new DOMParser().parseFromString(markup, 'text/html');
  document.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button,nav,body > header,body > footer,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
  return document;
}
export function extractHtml(markup: string, source: NewsSource, settings: NewsExtraction): NewsArticle[] {
  const extraction = validateExtraction(settings), document = htmlDocument(markup), seen = new Set<string>();
  const articles: NewsArticle[] = [];
  for (const item of [...document.querySelectorAll(extraction.item)].slice(0, 100)) {
    const select = (selector: string) => item.matches(selector) ? item : item.querySelector(selector);
    const title = select(extraction.title)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const link = select(extraction.link)?.getAttribute('href');
    const url = link ? samePublisher(link, source.url) : undefined;
    if (!url || url === source.url || seen.has(url) || title.length < 12 || title.length > 500 || /^(?:الرئيسية|اتصل بنا|تسجيل الدخول|home|contact|login)$/i.test(title)) continue;
    seen.add(url);
    const summary = extraction.summary ? select(extraction.summary)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) : undefined;
    const dateNode = extraction.date ? select(extraction.date) : undefined;
    const deadline = dateNode?.parentElement?.textContent?.match(/آخر أجل|آخر موعد|deadline|date limite|closing date/i);
    const rawDate = deadline ? undefined : dateNode?.getAttribute('datetime') || dateNode?.textContent?.trim();
    // Only explicit ISO publication dates are accepted. Unknown dates remain unknown.
    const publishedAt = rawDate && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(rawDate) && Number.isFinite(Date.parse(rawDate)) ? rawDate : undefined;
    articles.push({ id: `${source.id}-${url}`, sourceId: source.id, title, url, summary, publishedAt,
      publishedTimeKnown: !!publishedAt?.includes('T') });
    if (articles.length === 10) break;
  }
  return articles;
}
const TEMPLATES: NewsExtraction[] = [
  { item: 'article', title: 'h1,h2,h3,h4,h5', link: 'h1 a,h2 a,h3 a,h4 a,h5 a,a', summary: 'p', date: 'time' },
  { item: '.news-item,.news-card,.post,.content-card', title: 'h2,h3,h4,.title,.entry-title', link: 'h2 a,h3 a,h4 a,a', summary: 'p,.summary,.description', date: 'time' },
];
export async function previewSource(name: string, rawUrl: string): Promise<SourcePreview> {
  const url = publicNewsUrl(rawUrl).href;
  const source: NewsSource = { id: 'preview', name: name.trim().slice(0, 100) || new URL(url).hostname, url, kind: 'web', builtIn: false, enabled: true };
  const page = await newsDocument(url);
  // RSS requires a genuine feed root and at least one usable publisher article.
  if (/<(?:rss|feed|rdf:RDF)\b/i.test(page.text)) {
    const rss = { ...source, kind: 'rss' as const, feedUrl: url };
    const articles = parseRss(page.text, rss);
    if (articles.length) return { source: rss, articles: articles.slice(0, 10) };
  }
  const document = new DOMParser().parseFromString(page.text, 'text/html');
  const feedLinks = [...document.querySelectorAll('link[rel~="alternate"][href]')]
    .filter(node => /(?:rss|atom)\+xml/i.test(node.getAttribute('type') || ''))
    .map(node => samePublisher(node.getAttribute('href') || '', url)).filter((link): link is string => !!link);
  for (const feedUrl of [...new Set(feedLinks)].slice(0, 3)) {
    try {
      const feed = await newsDocument(feedUrl), rss = { ...source, kind: 'rss' as const, feedUrl };
      const articles = parseRss(feed.text, rss);
      if (articles.length) return { source: rss, articles: articles.slice(0, 10) };
    } catch { /* A failed advertised feed may still have a usable HTML listing. */ }
  }
  for (const extraction of TEMPLATES) {
    const articles = extractHtml(page.text, source, extraction);
    if (articles.length >= 2) return { source: { ...source, extraction }, articles };
  }
  throw new UnsupportedNewsSource(page);
}
export function previewConfiguredSource(name: string, page: { text: string; url: string }, settings: unknown): SourcePreview {
  const extraction = validateExtraction(settings);
  const source: NewsSource = { id: 'preview', name: name.trim().slice(0, 100) || new URL(page.url).hostname,
    url: publicNewsUrl(page.url).href, kind: 'web', extraction, builtIn: false, enabled: true };
  const articles = extractHtml(page.text, source, extraction);
  if (articles.length < 2) throw new Error('لم ينجح اختبار الإعدادات في استخراج خبرين مختلفين. لم يُضف الموقع؛ قد يحتاج طريقة جلب غير مدعومة حاليًا.');
  return { source, articles };
}
export function aiPageExcerpt(page: { text: string; url: string }): string {
  const document = htmlDocument(page.text);
  document.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (!['class', 'id', 'href', 'datetime'].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
    if (node.hasAttribute('href')) {
      const url = samePublisher(node.getAttribute('href') || '', page.url);
      if (url) { const clean = new URL(url); clean.search = ''; node.setAttribute('href', clean.href); }
      else node.removeAttribute('href');
    }
  });
  return document.body.innerHTML.slice(0, 30000);
}
export async function fetchCustomSource(source: NewsSource): Promise<NewsArticle[]> {
  if (!source.extraction) throw new Error('هذا المصدر القديم يحتاج فحصًا جديدًا قبل جلب الأخبار.');
  const page = await newsDocument(source.url);
  const articles = extractHtml(page.text, source, source.extraction);
  if (!articles.length) throw new Error('تعذر استخراج أخبار من القالب المحفوظ؛ قد يكون تصميم الموقع تغيّر.');
  return articles;
}
