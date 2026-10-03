import { NewsArticle } from '../types';

export const NEWS_LIMIT_PER_SOURCE = 10;
export function internalNewsId(article: Pick<NewsArticle,'sourceId'|'url'|'title'>): string {
  let identity = article.url;
  try {
    const url=new URL(article.url);
    const uuid=url.pathname.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
    const path=decodeURIComponent(url.pathname).replace(/^\/(?:ar|fr|en)(?=\/)/i,'').replace(/\/+$/,'');
    for(const key of ['lang','language','locale','utm_source','utm_medium','utm_campaign'])url.searchParams.delete(key);
    const listing=!path||/(?:concours-liste|eap-liste|قائمة-|\/(?:index\.aspx|مباريات|إعلانات)$)/i.test(path);
    identity=uuid?url.host.replace(/^www\./,'')+'|'+uuid.toLowerCase():url.host.replace(/^www\./,'')+path+url.search+(listing?'|'+article.title.trim().toLowerCase():'');
  } catch { identity=article.url+'|'+article.title.trim(); }
  let a=0x811c9dc5,b=0x9e3779b9;
  for(let i=0;i<identity.length;i++){
    a=Math.imul(a^identity.charCodeAt(i),0x01000193);
    b=Math.imul(b^identity.charCodeAt(i),0x85ebca6b);
  }
  return article.sourceId+':'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function retainLatestNews(articles: NewsArticle[], previous: NewsArticle[] = [], now = new Date().toISOString()): NewsArticle[] {
  const old=new Map(previous.map(article=>[article.internalId||internalNewsId(article),article]));
  const byId=new Map<string,NewsArticle>();
  for(let article of articles){
    if(!article||typeof article.title!=='string'||!article.sourceId||article.sourceId==='open-data-ma')continue;
    if(article.sourceId==='finances'&&article.category==='امتحانات الكفاءة المهنية'&&article.publishedAt&&!article.eventDate){
      article={...article,eventDate:article.publishedAt,publishedAt:undefined,publishedTimeKnown:false};
    }
    const internalId=internalNewsId(article);
    const existing=byId.get(internalId),cached=old.get(internalId);
    if(existing){
      byId.set(internalId,{...existing,
        content:existing.content||article.content,imageUrl:existing.imageUrl||article.imageUrl,
        publishedAt:existing.publishedAt||article.publishedAt,
        publishedTimeKnown:existing.publishedAt?existing.publishedTimeKnown:article.publishedTimeKnown});
    }else byId.set(internalId,{...article,publishedTimeKnown:article.publishedTimeKnown??(!!article.publishedAt&&/(?:T|\s)\d{1,2}:\d{2}/.test(article.publishedAt)),content:article.content?.slice(0,12000),internalId,firstSeenAt:cached?.firstSeenAt||article.firstSeenAt||now});
  }
  const stamp=(article:NewsArticle)=>{
    const value=Date.parse(article.publishedAt||'');
    return Number.isFinite(value)?value:0;
  };
  // Browsing history is independent from the ten-ID notification watermark.
  return [...byId.values()].sort((a,b)=>stamp(b)-stamp(a));
}
