import React,{useState} from 'react';
import {Bell,CheckCircle2,Headphones,ArrowLeft} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {requestStudyAlarmPermission,requestDeviceAudioPermission} from '../services/studyAlarm';
import {enableNewsNotifications} from '../features/news/services/newsNotifications';

export function FirstRunPermissions({onComplete}:{onComplete:()=>void}){
  const [notifications,setNotifications]=useState<'idle'|'granted'|'denied'>('idle');
  const [audio,setAudio]=useState<'idle'|'granted'|'denied'>('idle');
  const [busy,setBusy]=useState(false);
  const requestNotifications=async()=>{
    setBusy(true);
    try{
      const granted=Capacitor.isNativePlatform()?await enableNewsNotifications():false;
      setNotifications(granted?'granted':'denied');
    }catch{setNotifications('denied');}
    finally{setBusy(false);}
  };
  const requestAudio=async()=>{
    setBusy(true);
    try{setAudio(await requestDeviceAudioPermission()?'granted':'denied');}
    catch{setAudio('denied');}
    finally{setBusy(false);}
  };
  const status=(value:string)=>value==='granted'?'ممنوح':value==='denied'?'لم يُمنح بعد':'لم يُطلب';
  return <div dir="rtl" className="min-h-[100dvh] bg-[#F8F9FD] text-[#2C2145] flex items-center justify-center p-5">
    <div className="w-full max-w-md bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-[#F5F3FF] text-[#5B3FD6] flex items-center justify-center mb-4"><Bell className="w-7 h-7"/></div>
      <h1 className="text-xl font-black">إعداد الأذونات</h1>
      <p className="text-sm text-gray-500 leading-6 mt-2">اختر الأذونات التي تريد منحها. إذا رفضت أي إذن، سيبقى غير مفعّل ويمكنك تغييره لاحقًا من إعدادات الهاتف.</p>
      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-gray-100 p-4">
          <div className="flex gap-3 items-start"><Bell className="w-5 h-5 text-[#5B3FD6] mt-0.5"/><div className="flex-1"><div className="font-bold text-sm">إشعارات الأخبار</div><p className="text-xs text-gray-500 leading-5 mt-1">تنبيهك عند توفر أخبار جديدة من المصادر التي تختارها.</p><p className="text-xs mt-2">الحالة: {status(notifications)}</p></div></div>
          <button disabled={busy||notifications==='granted'} onClick={()=>void requestNotifications()} className="mt-3 w-full min-h-11 rounded-xl bg-[#5B3FD6] text-white text-sm font-bold disabled:opacity-50">{notifications==='granted'?'تم منح الإذن':'طلب إذن الإشعارات'}</button>
        </div>
        <div className="rounded-2xl border border-gray-100 p-4">
          <div className="flex gap-3 items-start"><Headphones className="w-5 h-5 text-[#5B3FD6] mt-0.5"/><div className="flex-1"><div className="font-bold text-sm">الوصول إلى ملفات الصوت</div><p className="text-xs text-gray-500 leading-5 mt-1">اختياري؛ لا يلزم للقراءة الصوتية العادية، لكنه يسمح باختيار ملفات موسيقى من الهاتف كنغمة للمنبّه.</p><p className="text-xs mt-2">الحالة: {status(audio)}</p></div></div>
          <button disabled={busy||audio==='granted'} onClick={()=>void requestAudio()} className="mt-3 w-full min-h-11 rounded-xl border border-[#E7E1FF] text-[#5B3FD6] text-sm font-bold disabled:opacity-50">{audio==='granted'?'تم منح الإذن':'طلب إذن ملفات الصوت (اختياري)'}</button>
        </div>
      </div>
      <button disabled={busy} onClick={onComplete} className="mt-5 w-full min-h-12 rounded-xl bg-[#2C2145] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"><CheckCircle2 className="w-5 h-5"/>متابعة إلى التطبيق<ArrowLeft className="w-4 h-4"/></button>
      <p className="text-[11px] text-gray-400 leading-5 mt-3 text-center">يمكنك المتابعة حتى إذا رفضت الأذونات. لن نعرض الميزة على أنها مفعّلة ما دام الإذن غير ممنوح.</p>
    </div>
  </div>;
}
