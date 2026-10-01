import { NewsArticle, NewsSource } from '../types';

export async function fetchCkan(source: NewsSource): Promise<NewsArticle[]> {
  if (!source.apiUrl) throw new Error('CKAN_URL_MISSING');
  const endpoint = new URL(source.apiUrl);
  endpoint.searchParams.set('q', '*:*');
  endpoint.searchParams.set('rows', '30');
  endpoint.searchParams.set('sort', 'metadata_modified desc');
  const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`CKAN_HTTP_${response.status}`);
  const payload = await response.json() as { success?: boolean; result?: { results?: Array<Record<string, unknown>> } };
  if (!payload.success) throw new Error('CKAN_INVALID_RESPONSE');
  return (payload.result?.results || []).map((item, index) => {
    const title = String(item.title || item.name || 'بيانات مغربية');
    const name = String(item.name || '');
    const organization = (item.organization || {}) as Record<string, unknown>;
    const imageUrl = String(organization.image_display_url || organization.image_url || '') || undefined;
    return {
      id: `${source.id}-${name || index}`,
      sourceId: source.id,
      title,
      summary: String(item.notes || '').slice(0, 500) || undefined,
      url: name ? `${source.url.replace(/\/$/, '')}/dataset/${encodeURIComponent(name)}` : source.url,
      imageUrl,
      publishedAt: String(item.metadata_modified || item.metadata_created || '') || undefined,
      category: 'بيانات مفتوحة',
    };
  });
}
