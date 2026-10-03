import { NewsArticle, NewsExtraction, NewsSource, NewsPageCursor, NewsPageResult } from '../types';
import { newsDocument, publicNewsUrl, samePublisher } from './sourceAccess';
import { parseRss } from './rssProvider';
import { discoverNextPage } from './newsPagination';

export interface SourcePreview { source: NewsSource; articles: NewsArticle[] }
export class UnsupportedNewsSource extends Error {
  constructor(public page: { text: string; url: string }) {
    super('عذرًا، لم نتعرف على قالب أخبار مناسب. لم يُضف الموقع. جرّب رابط قسم الأخبار، أو اطلب إعدادًا بمساعدة الذكاء الاصطناعي.');
  }
}
export function validateExtraction(value: unknown): NewsExtraction {
  if (!value || typeof value !== 'object') throw new Error('لم يُرجع الذكاء الاصطناعي إعدادات مدعومة.');
  const data = value as Record<string, unknown>, result: Record<string, string> = {};
  if (data.unsupported === true) throw new Error('لم يجد الذكاء الاصطناعي قائمة أخبار قابلة للاستخراج بالقوالب المدعومة حاليًا. لم يُضف الموقع؛ جرّب رابط قسم الأخبار.');
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
  document.querySelectorAll('script,style,iframe,object,embed,input,textarea,button,nav,body > header,body > footer,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
  // Some publishers wrap the entire archive in a form. Keep its text/cards.
  document.querySelectorAll('form').forEach(node => node.replaceWith(...node.childNodes));
  return document;
}
export function extractHtml(markup: string, source: NewsSource, settings: NewsExtraction, limit = 50): NewsArticle[] {
  const extraction = validateExtraction(settings), document = htmlDocument(markup), seen = new Set<string>();
  const articles: NewsArticle[] = [];
  for (const item of document.querySelectorAll(extraction.item)) {
    const select = (selector: string) => item.matches(selector) ? item : item.querySelector(selector);
    const title = select(extraction.title)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const link = select(extraction.link)?.getAttribute('href');
    const url = link ? samePublisher(link, source.url) : undefined;
    if (!url || url === source.url || seen.has(url) || title.length < 12 || title.length > 500 || /^(?:الرئيسية|اتصل بنا|تسجيل الدخول|home|contact|login)$/i.test(title)) continue;
    seen.add(url);
    const summary = extraction.summary ? select(extraction.summary)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) : undefined;
    const dateNode = extraction.date ? select(extraction.date) : undefined;
    const parentText=dateNode?.parentElement?.textContent?.trim()||'';
    const dateContext=(dateNode?.textContent||'')+(parentText.length<160?parentText:'');
    const deadline = dateContext.match(/آخر أجل|آخر موعد|deadline|date limite|closing date/i);
    const rawDate = deadline ? undefined : dateNode?.getAttribute('datetime') || dateNode?.textContent?.trim();
    const plainDate = rawDate?.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    const localDate = rawDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoDate = localDate ? `${localDate[3]}-${localDate[2].padStart(2,'0')}-${localDate[1].padStart(2,'0')}` : plainDate;
    // Explicit dates only; never infer publication from a title or deadline.
    const candidate = rawDate && /^\d{4}-\d{2}-\d{2}T[^\s]+$/.test(rawDate) ? rawDate : isoDate;
    const publishedAt = candidate && Number.isFinite(Date.parse(candidate)) && new Date(candidate.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === candidate.slice(0,10) ? candidate : undefined;
    articles.push({ id: `${source.id}-${url}`, sourceId: source.id, title, url, summary, publishedAt,
      publishedTimeKnown: !!publishedAt?.includes('T') });
    if (articles.length >= limit) break;
  }
  return articles;
}
const TEMPLATES: NewsExtraction[] = [
  { item: 'article', title: 'h1,h2,h3,h4,h5', link: 'h1 a,h2 a,h3 a,h4 a,h5 a,a', summary: 'p', date: 'time' },
  { item: '.news-item,.news-card,.post,.content-card', title: 'h2,h3,h4,.title,.entry-title', link: 'h2 a,h3 a,h4 a,a', summary: 'p,.summary,.description', date: 'time' },
  { item: '.bloc_une,.list-item', title: 'h2,h3,h4,.title', link: 'h2 a,h3 a,h4 a', summary: '.texte,p', date: '.date,time' },
  { item: '.news-list li,.entry-content li,.elementor-widget-text-editor li', title: 'a', link: 'a' },
];
export async function previewSource(name: string, rawUrl: string): Promise<SourcePreview> {
  let url = publicNewsUrl(rawUrl).href;
  const source: NewsSource = { id: 'preview', name: name.trim().slice(0, 100) || new URL(url).hostname, url, kind: 'web', builtIn: false, enabled: true };
  const page = await newsDocument(url);
  url=page.url;source.url=url;
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
  // AI sanitization intentionally starts from the raw DOM rather than htmlDocument().
  // htmlDocument() unwraps forms for publisher compatibility, which is correct for
  // article extraction but would preserve form text that must never be sent to AI.
  const document = new DOMParser().parseFromString(page.text, 'text/html');

  document
    .querySelectorAll(
      'script, style, noscript, template, form, iframe, object, embed, input, textarea, select, option, button, [hidden], [aria-hidden="true"]'
    )
    .forEach(node => node.remove());

  document.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (!['class', 'id', 'href', 'datetime'].includes(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }

    if (node.hasAttribute('href')) {
      const url = samePublisher(node.getAttribute('href') || '', page.url);
      if (url) {
        const clean = new URL(url);
        clean.search = '';
        clean.hash = '';
        node.setAttribute('href', clean.href);
      } else {
        node.removeAttribute('href');
      }
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


// Follow publisher-supplied pagination only; never invent a page URL.
let longPageDocument: {url:string;text:string;at:number}|undefined;
export async function fetchNewsPage(source: NewsSource, cursor?: NewsPageCursor, readDocument = newsDocument): Promise<NewsPageResult> {
  const requested=cursor?.url || source.feedUrl || source.url;
  const url=samePublisher(requested, source.url);
  if(!url) throw new Error('رابط الصفحة خارج موقع المصدر.');
  const cached=readDocument===newsDocument&&cursor?.offset&&longPageDocument?.url===url&&Date.now()-longPageDocument.at<120000?longPageDocument:undefined;
  const page=cached||await readDocument(url);
  const result=parseNewsPage(page.text,source,page.url,cursor?.offset);
  if(readDocument===newsDocument){
    if(result.next?.offset)longPageDocument={url:page.url,text:page.text,at:Date.now()};
    else if(longPageDocument?.url===url)longPageDocument=undefined;
  }
  return result;
}

export function parseNewsPage(markup: string, source: NewsSource, url: string, offset = 0): NewsPageResult {
  if(!samePublisher(url,source.url)||!Number.isInteger(offset)||offset<0)throw new Error('صفحة أخبار غير صالحة.');
  const xml=/<(?:rss|feed|rdf:RDF)\b/i.test(markup);
  const document=new DOMParser().parseFromString(markup,xml?'application/xml':'text/html');
  let articles:NewsArticle[]=[];
  if(xml) articles=parseRss(markup,source,Number.MAX_SAFE_INTEGER);
  else {
    const official:Record<string,NewsExtraction>={
      men:{item:'article',title:'h5',link:'a',date:'[datetime]'},
      finances:{item:'.row,.item',title:'h2,h4',link:'h2 a,h4 a',summary:'.col-md-7 p + p',date:'p'},
      'emploi-public':{item:'a.card[href]',title:'h2,h4',link:'a',summary:'.card-text,.card-footer'},
      alwadifa:{item:'article.content-card[data-id^="offre_"]',title:'h2',link:'h2 a',summary:'.content-description',date:'.content-meta'},
    };
    for(const template of source.extraction?[source.extraction]:official[source.id]?[official[source.id]]:TEMPLATES) {
      articles=extractHtml(markup,{...source,url},template,Number.MAX_SAFE_INTEGER);
      if(articles.length) break;
    }
  }
  if(!articles.length) throw new Error('لم نجد أخبارًا قابلة للاستخراج في هذه الصفحة.');
  // Long archives (including client-side pagination) must not be truncated.
  const batch=articles.slice(offset,offset+50);
  if(!batch.length)throw new Error('تغيّر محتوى صفحة الأرشيف. حدّث المصدر ثم أعد المحاولة.');
  if(offset+50<articles.length)return {articles:batch,next:{url,offset:offset+50}};
  const next=discoverNextPage(document,url);
  if(next)return {articles:batch,next:{url:next}};
  if(xml){
    const archive=[...document.querySelectorAll('*')].find(node=>node.localName.split(':').pop()==='link'&&node.getAttribute('rel')==='alternate'&&/html/i.test(node.getAttribute('type')||''));
    const channelLink=document.querySelector('channel > link')?.textContent?.trim();
    const archiveUrl=(archive?samePublisher(archive.getAttribute('href')||'',url):undefined)||
      (source.url!==url?samePublisher(source.url,url):undefined)||(channelLink?samePublisher(channelLink,url):undefined);
    if(archiveUrl&&archiveUrl!==url)return {articles:batch,next:{url:archiveUrl}};
    return {articles:batch,endReason:'feed-only'};
  }
  return {articles:batch,endReason:'end'};
}
