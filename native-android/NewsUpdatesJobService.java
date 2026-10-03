package com.nexus.customsstudy;

import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.Manifest;
import android.os.Build;
import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import org.jsoup.parser.Parser;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class NewsUpdatesJobService extends JobService {
    static final Object LOCK=new Object();
    private volatile Thread task;
    private volatile boolean cancelled;
    private static final String BUNDLE="https://2024lm.github.io/CustomsStudyMobile1/news-feed.json";
    @Override public boolean onStartJob(JobParameters parameters){
        cancelled=false;
        task=new Thread(()->{
            try{poll();}catch(Exception ignored){}
            if(!cancelled)jobFinished(parameters,false);
        },"raje3-news");task.start();return true;
    }
    @Override public boolean onStopJob(JobParameters parameters){cancelled=true;if(task!=null)task.interrupt();return true;}
    static URL safeUrl(String raw)throws Exception{
        URL url=new URL(raw);String host=url.getHost().toLowerCase(Locale.ROOT);
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||(url.getPort()!=-1&&url.getPort()!=443)||!host.contains(".")||host.matches("[0-9.]+")||host.contains(":")||host.matches(".*(?:\\.local|\\.internal|\\.test|\\.invalid)$"))throw new IOException("Unsafe URL");
        for(InetAddress address:InetAddress.getAllByName(host))if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())throw new IOException("Private address");
        return url;
    }
    static String read(String raw)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)safeUrl(raw).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(12000);connection.setReadTimeout(12000);
        try{
            if(connection.getResponseCode()!=200)throw new IOException("HTTP failure");
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();if(out.size()+count>2*1024*1024)throw new IOException("Oversize");out.write(buffer,0,count);}
                return out.toString(StandardCharsets.UTF_8.name());
            }
        }finally{connection.disconnect();}
    }
    static String text(Element item,String selector){Element node=item.selectFirst(selector);return node==null?"":node.text();}
    static String bounded(String value,int max){return value.length()>max?value.substring(0,max):value;}
    static JSONArray extract(JSONObject source)throws Exception{
        String sourceUrl=source.getString("url"),feed=source.optString("feedUrl"),raw=read(feed.isEmpty()?sourceUrl:feed);
        boolean rss=raw.matches("(?s).*<(?:rss|feed|rdf:RDF)\\b.*");
        Document doc=Jsoup.parse(raw,sourceUrl,rss?Parser.xmlParser():Parser.htmlParser());
        doc.select("script,style,nav,footer,form").remove();JSONArray articles=new JSONArray();
        JSONObject settings=source.optJSONObject("extraction");
        if(settings==null&&!rss){
            settings=new JSONObject();
            switch(source.optString("id")){
                case "men":settings.put("item","article").put("title","h5").put("link","a");break;
                case "finances":settings.put("item",".row,.item").put("title","h2,h4").put("link","h2 a,h4 a");break;
                case "emploi-public":settings.put("item","a[href*=/تفاصيل/],a[href*=/details/]").put("title","h2,h4").put("link","a");break;
                case "alwadifa":settings.put("item","article.content-card[data-id^=offre_]").put("title","h2").put("link","h2 a").put("summary",".content-description");break;
            }
        }
        String itemSelector=rss?"item,entry":settings==null?"article,.news-item,.news-card,.content-card":settings.optString("item","article");
        Set<String> urls=new HashSet<>();
        for(Element item:doc.select(itemSelector)){
            String title=text(item,rss?"title":settings==null?"h2,h3,h4,h5":settings.optString("title","h2,h3"));
            String linkSelector=rss?"link":settings==null?"h2 a,h3 a,h4 a,h5 a,a":settings.optString("link","a");
            Element link=item.is(linkSelector)?item:item.selectFirst(linkSelector);
            if(link==null)continue;
            String linkValue=rss?(link.hasAttr("href")?link.attr("href"):link.text()):link.attr("href");
            URL url=safeUrl(new URL(new URL(sourceUrl),linkValue).toString());
            if(!url.getHost().replaceFirst("^www\\.","").equals(new URL(sourceUrl).getHost().replaceFirst("^www\\.",""))||title.length()<12||!urls.add(url.toString()))continue;
            String summary=text(item,rss?"description,summary,content":settings==null?"p":settings.optString("summary","p"));
            summary=Jsoup.parse(summary).text();
            articles.put(new JSONObject().put("id",source.getString("id")+"-"+url).put("sourceId",source.getString("id")).put("title",bounded(title,500)).put("url",url.toString()).put("summary",bounded(summary,500)));
            if(articles.length()==10)break;
        }
        return articles;
    }
    private boolean active(SharedPreferences prefs,String id)throws Exception{
        JSONArray sources=new JSONArray(prefs.getString("sources","[]"));
        for(int i=0;i<sources.length();i++)if(sources.getJSONObject(i).optString("id").equals(id))return true;
        return false;
    }
    private void poll()throws Exception{
        SharedPreferences prefs=getSharedPreferences("news_updates",MODE_PRIVATE);
        JSONArray sources=new JSONArray(prefs.getString("sources","[]"));
        if(sources.length()==0)return;
        JSONArray bundle=new JSONArray();
        if(java.util.stream.IntStream.range(0,sources.length()).anyMatch(i->sources.optJSONObject(i).optBoolean("builtIn"))) {
            try{bundle=new JSONObject(read(BUNDLE)).getJSONArray("articles");}catch(Exception ignored){}
        }
        for(int i=0;i<sources.length()&&!cancelled;i++){
            JSONObject source=sources.getJSONObject(i);String id=source.getString("id");JSONArray batch=new JSONArray();
            try{
                try{batch=extract(source);}catch(Exception ignored){}
                if(batch.length()==0&&source.optBoolean("builtIn")){
                    for(int j=0;j<bundle.length()&&batch.length()<10;j++)if(bundle.getJSONObject(j).optString("sourceId").equals(id))batch.put(bundle.getJSONObject(j));
                }
                if(batch.length()==0)continue;
                synchronized(LOCK){
                    if(cancelled||!active(prefs,id))continue;
                    String key="seen_"+id;JSONArray old=new JSONArray(prefs.getString(key,"[]"));Set<String> seen=new HashSet<>();
                    for(int j=0;j<old.length();j++)seen.add(old.getString(j));
                    JSONArray next=new JSONArray();boolean reachedKnown=false;

                    for(int j=0;j<batch.length();j++){
                        JSONObject article=batch.getJSONObject(j);String url=article.getString("url");safeUrl(url);next.put(url);
                        // The first successful fetch establishes a baseline, without flooding notifications.
                        if(seen.contains(url))reachedKnown=true;
                        if(old.length()>0&&!reachedKnown&&!seen.contains(url))show(article,prefs);
                    }
                    prefs.edit().putString(key,next.toString()).apply();
                }
            }catch(Exception ignored){/* Preserve the last baseline after a failed source. */}
        }
    }
    private void show(JSONObject article,SharedPreferences prefs)throws Exception{
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        String url=article.getString("url"),title=article.getString("title"),summary=article.optString("summary");
        JSONArray translations=new JSONArray(prefs.getString("translations","[]"));
        for(int i=0;i<translations.length();i++){JSONObject row=translations.getJSONObject(i);if(row.optString("url").equals(url)){title=row.optString("title",title);summary=row.optString("summary",summary);break;}}
        if(!title.matches("(?s).*[\\u0600-\\u06ff].*")){
            try{
                com.google.mlkit.nl.languageid.LanguageIdentifier detector=com.google.mlkit.nl.languageid.LanguageIdentification.getClient();
                String language;
                try{language=com.google.android.gms.tasks.Tasks.await(detector.identifyLanguage(title+" "+summary),10,java.util.concurrent.TimeUnit.SECONDS);}finally{detector.close();}
                String code=com.google.mlkit.nl.translate.TranslateLanguage.fromLanguageTag(language);
                if(code!=null&&!"ar".equals(code)){
                    com.google.mlkit.nl.translate.Translator translator=com.google.mlkit.nl.translate.Translation.getClient(new com.google.mlkit.nl.translate.TranslatorOptions.Builder().setSourceLanguage(code).setTargetLanguage("ar").build());
                    try{
                        // Translate using an already available local model; never download a model in a background job.
                        title=com.google.android.gms.tasks.Tasks.await(translator.translate(title),10,java.util.concurrent.TimeUnit.SECONDS);
                        summary=com.google.android.gms.tasks.Tasks.await(translator.translate(summary),10,java.util.concurrent.TimeUnit.SECONDS);
                    }finally{translator.close();}
                }
            }catch(Exception ignored){/* Missing offline model: retain truthful original text. */}
        }
        if(cancelled)return;
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        manager.createNotificationChannel(new NotificationChannel("news_updates","أخبار راجع",NotificationManager.IMPORTANCE_DEFAULT));
        Intent intent=new Intent(this,MainActivity.class).putExtra("newsArticle",article.toString()).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int notificationId=(article.getString("sourceId")+url).hashCode();
        PendingIntent pending=PendingIntent.getActivity(this,notificationId,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(this,"news_updates").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(bounded(summary,180)).setContentIntent(pending).setAutoCancel(true).build();
        manager.notify(notificationId,notification);
    }
}
