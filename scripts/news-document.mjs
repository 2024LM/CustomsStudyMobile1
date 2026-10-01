import { articleImage } from './news-images.mjs';

function decode(value = '') {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => {
    const code=Number(n); return code<=0x10ffff ? String.fromCodePoint(code) : '';
  });
}
export function plainNewsText(html = '') {
  return decode(html).replace(/<(script|style|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
}
export function publicationDate(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  let raw=value.trim().replace(/[٠-٩]/g, digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const numeric=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(numeric)raw=numeric[3]+'-'+numeric[2].padStart(2,'0')+'-'+numeric[1].padStart(2,'0');
  const months=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const french=raw.match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/i);
  if(french&&months.includes(french[2].toLowerCase()))raw=french[3]+'-'+String(months.indexOf(french[2].toLowerCase())+1).padStart(2,'0')+'-'+french[1].padStart(2,'0');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const date=new Date(raw+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw)return {};
    return {publishedAt:raw,publishedTimeKnown:false};
  }
  if(!/(?:T|\s)\d{1,2}:\d{2}/.test(raw))return {};
  // Morocco is the source locale; never let a runner's timezone reinterpret a local time.
  const local=raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if(local&&!publicationDate(local[1]).publishedAt)return {};
  if(local&&(+local[2].slice(0,2)>23||+local[2].slice(3,5)>59))return {};
  if(local)return {publishedAt:local[1]+'T'+local[2],publishedTimeKnown:true,publishedLocalTime:true};
  const isoDay=raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if(isoDay&&!publicationDate(isoDay[1]).publishedAt)return {};
  const date=new Date(raw);
  return Number.isFinite(date.getTime())?{publishedAt:date.toISOString(),publishedTimeKnown:true}:{};
}
function attr(tag,name){return decode(tag.match(new RegExp('\\b'+name+'\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]','i'))?.[1]||'');}
export function newsDocument(html) {
  const result={};
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
    const name=(attr(tag,'property')||attr(tag,'name')||attr(tag,'itemprop')).toLowerCase();
    if(['article:published_time','datepublished','pubdate','publishdate','dc.date.issued','dcterms.issued'].includes(name)){
      const parsed=publicationDate(attr(tag,'content'));
      if(parsed.publishedAt&&!result.publishedAt)Object.assign(result,parsed);
    }
  }
  const walk=value=>{
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(!value||typeof value!=='object')return;
    const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
    if(types.some(type=>/^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle)$/.test(type||''))){
      if(!result.publishedAt)Object.assign(result,publicationDate(value.datePublished));
      if(typeof value.articleBody==='string')result.content=plainNewsText(value.articleBody);
    }
    if(value['@graph'])walk(value['@graph']);
  };
  for(const tag of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]){
    try{walk(JSON.parse(tag.replace(/^<script\b[^>]*>/i,'').replace(/<\/script>$/i,'')));}catch{}
  }
  const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if(article){
    if(!result.publishedAt){
      const time=(article.match(/<time\b[^>]*>/i)||[])[0];
      if(time)Object.assign(result,publicationDate(attr(time,'datetime')));
    }
    if(!result.content){
      const body=plainNewsText(article);
      if(body.length>=80)result.content=body;
    }
  }
  return result;
}
export async function enrichNewsDocuments(articles,fetchText){
  const counts=new Map();
  articles.forEach(article=>counts.set(article.url,(counts.get(article.url)||0)+1));
  let cursor=0;
  const candidates=articles.filter(article=>counts.get(article.url)===1&&/^https?:\/\//i.test(article.url)&&!/\.(pdf|docx?|zip|xlsx?)(?:[?#]|$)/i.test(article.url)&&!/(?:concours-liste|eap-liste|قائمة-|\/(?:index\.aspx|مباريات|إعلانات)\/?(?:[?#]|$))/i.test((()=>{try{return decodeURI(article.url)}catch{return article.url}})()));
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{
    while(cursor<candidates.length){
      const article=candidates[cursor++];
      try{
        const html=await fetchText(article.url);
        const document=newsDocument(html);
        if(document.publishedAt&&!article.publishedAt)Object.assign(article,{publishedAt:document.publishedAt,publishedTimeKnown:document.publishedTimeKnown,publishedLocalTime:document.publishedLocalTime});
        if(document.content)article.content=document.content;
        if(!article.imageUrl)article.imageUrl=articleImage(html,article.url);
      }catch{}
    }
  }));
  return articles;
}

export function retainNewsFeed(articles,limit=10){
  const counts=new Map();
  const stamp=article=>Date.parse(article.publishedAt||'')||0;
  return [...articles].sort((a,b)=>stamp(b)-stamp(a)).filter(article=>{
    const count=counts.get(article.sourceId)||0;
    counts.set(article.sourceId,count+1);return count<limit;
  });
}
