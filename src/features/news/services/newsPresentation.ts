import { NewsArticle } from '../types';

export function latestNews(articles:NewsArticle[],limit=articles.length):NewsArticle[]{
  const timestamp=(value?:string)=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0;};
  return [...articles].sort((a,b)=>timestamp(b.publishedAt)-timestamp(a.publishedAt)).slice(0,limit);
}
export function newsDate(value?:string,timeKnown?:boolean,localTime=false):string{
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value);
  const known=!dateOnly&&(timeKnown??/(?:T|\s)\d{1,2}:\d{2}/.test(value));
  const local=localTime||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const parsed=new Date(local?value+'Z':dateOnly?value+'T00:00:00Z':value);
  const options:Intl.DateTimeFormatOptions={
    day:'numeric',month:'short',year:'numeric',timeZone:dateOnly||local?'UTC':'Africa/Casablanca',
    ...(known?{hour:'2-digit',minute:'2-digit'}:{})
  };
  return new Intl.DateTimeFormat('ar-MA',options).format(parsed);
}

export function newsSummary(value=''):string{
  const text=value.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').replace(/^[\s|•·—-]+|[\s|•·—-]+$/g,'').trim();
  return text.length>180?text.slice(0,177)+'…':text;
}
