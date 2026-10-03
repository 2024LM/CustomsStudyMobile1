import { samePublisher } from './sourceAccess';

const PAGERS = '.pagination,.pager,.nav-links,.page-numbers,[class*="pagination"],nav[aria-label*="page"],nav[aria-label*="صفحة"]';
const digits = (text: string) => text.replace(/[٠-٩۰-۹]/g, char => String('٠١٢٣٤٥٦٧٨٩'.includes(char) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(char) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));

// Follow actual publisher links, including numeric and zero-based pagers.
export function discoverNextPage(document: Document, base: string): string | undefined {
  const valid = (node: Element) => {
    if (node.closest('[aria-disabled="true"],.disabled,[hidden]')) return undefined;
    const href = node.getAttribute('href');
    if (!href?.trim() || href.trim().startsWith('#')) return undefined;
    const url = samePublisher(href, base);
    return url && url !== base ? url : undefined;
  };
  const namespacedLinks = [...document.querySelectorAll('*')].filter(node => node.localName.split(':').pop()==='link' && (node.getAttribute('rel')||'').split(/\s+/).includes('next'));
  for (const node of [...namespacedLinks,...document.querySelectorAll('link[rel~="next"],a[rel~="next"],a.next,.pagination-next a,.nav-previous a,.older-posts a')]) {
    const url = valid(node); if (url) return url;
  }
  const links = [...document.querySelectorAll(`${PAGERS.split(',').map(selector => `${selector} a`).join(',')}`)];
  for (const node of links) {
    const label = [node.textContent, node.getAttribute('aria-label'), node.getAttribute('title')].join(' ').trim();
    if (/التالي|التالية|أقدم|اقدم|suivant|next|older/i.test(label)) {
      const url = valid(node); if (url) return url;
    }
  }
  // Compare displayed page numbers, rather than assuming ?page starts at 1.
  for (const pager of document.querySelectorAll(PAGERS)) {
    const active = pager.querySelector('[aria-current="page"],.active,.current');
    const activeNumber = Number(digits(active?.textContent?.trim() || ''));
    const numbered = [...pager.querySelectorAll('a[href]')].map(node => ({node, number: Number(digits(node.textContent?.trim() || ''))}))
      .filter(item => Number.isInteger(item.number) && item.number > 0);
    let current = activeNumber > 0 ? activeNumber : undefined;
    if (!current) current = numbered.find(item => samePublisher(item.node.getAttribute('href') || '', base) === base)?.number;
    // When the current page is omitted from the pager, use an explicit query/path index.
    if (!current) {
      const url = new URL(base), raw = url.searchParams.get('page') || url.searchParams.get('paged') || url.pathname.match(/\/page\/(\d+)\/?$/)?.[1];
      current = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
    }
    for (const item of numbered.filter(item => item.number === current! + 1)) {
      const url = valid(item.node); if (url) return url;
    }
  }
  return undefined;
}
