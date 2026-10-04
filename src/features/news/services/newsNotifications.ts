import {Capacitor,registerPlugin} from '@capacitor/core';
import {newsService} from './newsService';
import {newsStorage} from '../storage/newsStorage';
import {NewsArticle} from '../types';
import {cachedNewsTranslation} from './newsTranslation';
import {newsSummary} from './newsPresentation';
import {checkStudyAlarmPermission,requestStudyAlarmPermission} from '../../../services/studyAlarm';
import {samePublisher} from '../providers/sourceAccess';

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
  const permissionGranted=await checkStudyAlarmPermission();
  const allowed=permissionGranted&&localStorage.getItem('raje3_news_notifications_allowed')==='1';
  if(!permissionGranted) localStorage.removeItem('raje3_news_notifications_allowed');
  const sources=allowed?newsService.sources().filter(s=>s.enabled&&s.notificationsEnabled===true):[];
  const articles=newsService.cachedArticles();
  await NativeNews.configure({sources,baseline:sources.map(source=>({sourceId:source.id,urls:articles.filter(a=>a.sourceId===source.id).slice(0,10).map(a=>a.url)})),translations:articles.map(article=>({url:article.url,...cachedNewsTranslation(article.title,newsSummary(article.summary))})).filter(item=>item.title)});
}
export async function consumePendingNews():Promise<NewsArticle|undefined>{
  if(!Capacitor.isNativePlatform())return;
  const {article}=await NativeNews.consumePending();
  if(!article||typeof article.title!=='string'||typeof article.url!=='string')return;
  const source=newsService.sources().find(s=>s.id===article.sourceId);
  if(!source||!samePublisher(article.url,source.url))return;
  const safeArticle:NewsArticle={id:article.url,sourceId:source.id,url:article.url,title:article.title.slice(0,1000),summary:typeof article.summary==='string'?article.summary.slice(0,3000):undefined,content:typeof article.content==='string'?article.content.slice(0,12000):undefined,publishedAt:typeof article.publishedAt==='string'&&Number.isFinite(Date.parse(article.publishedAt))?article.publishedAt:undefined,publishedTimeKnown:article.publishedTimeKnown===true};
  newsStorage.saveArticles([...newsService.cachedArticles(),safeArticle],false);
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
