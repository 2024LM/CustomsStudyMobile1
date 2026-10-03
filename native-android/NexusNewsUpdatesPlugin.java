package com.nexus.customsstudy;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name="NexusNewsUpdates")
public class NexusNewsUpdatesPlugin extends Plugin {
    static final int JOB_ID=7408;
    @PluginMethod public void configure(PluginCall call) {
        JSONArray sources=call.getArray("sources",new JSArray());
        SharedPreferences prefs=getContext().getSharedPreferences("news_updates",Context.MODE_PRIVATE);
        synchronized(NewsUpdatesJobService.LOCK) {
            SharedPreferences.Editor edit=prefs.edit().putString("sources",sources.toString())
                .putString("translations",call.getArray("translations",new JSArray()).toString());
            JSONArray baseline=call.getArray("baseline",new JSArray());
            for(int i=0;i<baseline.length();i++) {
                org.json.JSONObject row=baseline.optJSONObject(i);
                if(row==null)continue;
                String key="seen_"+row.optString("sourceId");
                JSONArray urls=row.optJSONArray("urls");
                if(!prefs.contains(key)&&urls!=null&&urls.length()>0)edit.putString(key,urls.toString());
            }
            if(!edit.commit()){call.reject("تعذر حفظ إعدادات الأخبار");return;}
        }
        JobScheduler scheduler=(JobScheduler)getContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if(sources.length()==0){scheduler.cancel(JOB_ID);call.resolve();return;}
        if(scheduler.getPendingJob(JOB_ID)==null){
            JobInfo job=new JobInfo.Builder(JOB_ID,new ComponentName(getContext(),NewsUpdatesJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(30*60*1000L).setPersisted(true).build();
            if(scheduler.schedule(job)!=JobScheduler.RESULT_SUCCESS){call.reject("تعذر جدولة فحص الأخبار");return;}
        }
        call.resolve();
    }
    @PluginMethod public void consumePending(PluginCall call){
        SharedPreferences prefs=getContext().getSharedPreferences("news_updates",Context.MODE_PRIVATE);
        String pending=prefs.getString("pending_article",null);
        JSObject result=new JSObject();
        try{if(pending!=null)result.put("article",new JSObject(pending));}catch(Exception ignored){}
        prefs.edit().remove("pending_article").apply();call.resolve(result);
    }
}
