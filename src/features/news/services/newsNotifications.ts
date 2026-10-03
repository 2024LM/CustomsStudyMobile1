import {Capacitor,registerPlugin} from '@capacitor/core';
import {newsService} from './newsService';
import {newsStorage} from '../storage/newsStorage';
import {NewsArticle} from '../types';
import {cachedNewsTranslation} from './newsTranslation';
import {newsSummary} from './newsPresentation';
import {requestStudyAlarmPermission} from '../../../services/studyAlarm';

const NativeNews=registerPlugin<{
  configure(options:{sources:unknown[];baseline:unknown[];translations:unknown[]}):Promise<void>;
  consumePending():Promise<{article?:NewsArticle}>;
}>('NexusNewsUpdates');
export async function enableNewsNotifications():Promise<boolean>{
  if(!Capacitor.isNativePlatform())return false;
  const granted=await requestStudyAlarmPermission();
  if(granted){localStorage.setItem('raje3_news_notifications_allowed','1');await syncNewsNotifications();}
  return granted;
}
export async function syncNewsNotifications(){
  if(!Capacitor.isNativePlatform())return;
  const sources=localStorage.getItem('raje3_news_notifications_allowed')==='1'?newsService.sources().filter(s=>s.enabled&&s.notificationsEnabled!==false):[];
  const articles=newsService.cachedArticles();
  await NativeNews.configure({sources,baseline:sources.map(source=>({sourceId:source.id,urls:articles.filter(a=>a.sourceId===source.id).slice(0,10).map(a=>a.url)})),translations:articles.map(article=>({url:article.url,...cachedNewsTranslation(article.title,newsSummary(article.summary))})).filter(item=>item.title)});
}
export async function consumePendingNews():Promise<NewsArticle|undefined>{
  if(!Capacitor.isNativePlatform())return;
  const {article}=await NativeNews.consumePending();
  if(!article||!newsService.sources().some(s=>s.id===article.sourceId))return;
  newsStorage.saveArticles([...newsService.cachedArticles(),article],false);
  return newsService.cachedArticles().find(item=>item.url===article.url&&item.sourceId===article.sourceId);
}
export function startNewsMonitoring(){
  let stopped=false;
  const sync=()=>{void syncNewsNotifications().catch(()=>{});};
  const poll=()=>{if(!stopped&&navigator.onLine&&document.visibilityState==='visible')void newsService.refreshIfStale().catch(()=>{});};
  const unsubscribe=newsService.subscribe(sync);
  const timer=window.setInterval(poll,5*60*1000);
  window.addEventListener('online',poll);document.addEventListener('visibilitychange',poll);
  sync();poll();
  return()=>{stopped=true;clearInterval(timer);unsubscribe();window.removeEventListener('online',poll);document.removeEventListener('visibilitychange',poll);};
}
