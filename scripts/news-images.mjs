const decode = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
export function imageUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(decode(value.trim()), base);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
function attribute(tag, name) {
  return tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))', 'i'))?.slice(1).find(value => value !== undefined);
}
export function inlineImage(html, base) {
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const url = imageUrl(attribute(tag, 'data-src') || attribute(tag, 'data-original') || attribute(tag, 'src'), base);
    if (url && !/(?:logo|icon|avatar|spinner|pixel|spacer)(?:[_.\/-]|$)/i.test(url)) return url;
  }
}
export function articleImage(html, base) {
  for (const kind of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      if ((attribute(tag, 'property') || attribute(tag, 'name') || '').toLowerCase() !== kind) continue;
      const url = imageUrl(attribute(tag, 'content'), base);
      if (url) return url;
    }
  }
  // Restrict inline fallback to article content, avoiding site-wide logos and navigation.
  const content = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  return content ? inlineImage(content, base) : undefined;
}
export function feedImage(item, base) {
  for (const tag of item.match(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*>/gi) || []) {
    const type = attribute(tag, 'type') || '';
    const medium = attribute(tag, 'medium') || '';
    if (type && !type.startsWith('image/') || medium && medium !== 'image') continue;
    const url = imageUrl(attribute(tag, 'url'), base);
    if (url && (type.startsWith('image/') || medium === 'image' || /<media:thumbnail/i.test(tag) || /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(url))) return url;
  }
  return inlineImage(item.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'), base);
}
export async function enrichArticleImages(articles, fetchText, limit = 180) {
  const counts = new Map();
  for (const article of articles) counts.set(article.url, (counts.get(article.url) || 0) + 1);
  const candidates = articles.filter(article => !article.imageUrl && counts.get(article.url) === 1 &&
    /^https?:\/\//i.test(article.url) &&
    !/\.(?:pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(article.url) &&
    !/(?:concours-liste|eap-liste|قائمة-|\/(?:index\.aspx|actualites|مباريات|إعلانات)\/?(?:[?#]|$))/i.test((() => { try { return decodeURI(article.url); } catch { return article.url; } })()));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, candidates.length, limit) }, async () => {
    while (cursor < Math.min(candidates.length, limit)) {
      const article = candidates[cursor++];
      try { article.imageUrl = articleImage(await fetchText(article.url), article.url); } catch {}
    }
  }));
  return articles;
}
