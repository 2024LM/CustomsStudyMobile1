import { Capacitor, registerPlugin } from '@capacitor/core';
import { needsArabicTranslation } from './newsLanguage';

export interface NewsTranslation { title: string; summary: string; }
interface NewsTranslatePlugin {
  translate(options: NewsTranslation): Promise<NewsTranslation>;
}
const NativeTranslate = registerPlugin<NewsTranslatePlugin>('NexusNewsTranslate');
const CACHE_KEY = 'raje3_news_translations_v1';
const pending = new Map<string, Promise<NewsTranslation>>();
type Entry = { key: string; result: NewsTranslation };
function entries(): Entry[] {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item?.key === 'string' && typeof item?.result?.title === 'string' && typeof item?.result?.summary === 'string') : [];
  } catch { return []; }
}
export function cachedNewsTranslation(title: string, summary = ''): NewsTranslation | undefined {
  const key = JSON.stringify([title, summary]);
  return entries().find(entry => entry.key === key)?.result;
}
export async function translateNews(title: string, summary = ''): Promise<NewsTranslation> {
  if (!needsArabicTranslation(title, summary)) return { title, summary };
  const key = JSON.stringify([title, summary]);
  const cached = cachedNewsTranslation(title, summary);
  if (cached) return cached;
  const current = pending.get(key);
  if (current) return current;
  const task = (async () => {
    let result: NewsTranslation;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      result = await NativeTranslate.translate({ title, summary });
    } else {
      const { translateNewsWithGemini } = await import('../../../services/geminiAi');
      result = await translateNewsWithGemini(title, summary);
    }
    if (!result || typeof result.title !== 'string' || !result.title.trim() || typeof result.summary !== 'string'
        || (summary.trim() && !result.summary.trim())) throw new Error('تعذر إكمال الترجمة. أعد المحاولة.');
    const clean = { title: result.title.trim(), summary: result.summary.trim() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify([...entries().filter(entry => entry.key !== key), { key, result: clean }])); } catch {throw new Error('تعذر حفظ الترجمة على الجهاز. حرر مساحة وأعد المحاولة.');}
    return clean;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}


function contentChunks(content:string):string[]{
  const chunks:string[]=[];
  let remaining=content;
  while(remaining.length){
    let end=Math.min(900,remaining.length);
    if(end<remaining.length){
      const boundary=Math.max(remaining.lastIndexOf(' ',end-1),remaining.lastIndexOf('\n',end-1));
      if(boundary>=450)end=boundary+1;
    }
    chunks.push(remaining.slice(0,end));remaining=remaining.slice(end);
  }
  return chunks;
}
export function cachedArticleBody(title:string,content:string):string|undefined{
  const chunks=contentChunks(content),saved=chunks.map(chunk=>cachedNewsTranslation(title,chunk));
  return chunks.length&&saved.every(Boolean)?saved.map(item=>item!.summary).join('\n'):undefined;
}
export async function translateArticleBody(title:string,content:string,shouldContinue:()=>boolean=()=>true):Promise<string>{
  const translated:string[]=[];
  for(const chunk of contentChunks(content.slice(0,12000))){
    if(!shouldContinue())throw new Error('توقفت الترجمة.');
    translated.push((await translateNews(title,chunk)).summary);
  }
  return translated.join('\n');
}
