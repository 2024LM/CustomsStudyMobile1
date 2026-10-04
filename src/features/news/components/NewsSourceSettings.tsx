import React,{useEffect,useState} from 'react';
import {Bell,ChevronDown,Languages,Trash2} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {enableNewsNotifications} from '../services/newsNotifications';
import {checkStudyAlarmPermission} from '../../../services/studyAlarm';
import {newsService} from '../services/newsService';
import {sourceTheme} from '../config/sourceTheme';
import { FloatingNotice } from '../../../components/FloatingNotice';

function Switch({checked,label,onChange}:{checked:boolean;label:string;onChange:()=>void}){
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className="min-w-11 min-h-11 flex items-center justify-center shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5B3FD6]">
    <span dir="ltr" className="relative block w-11 h-6 rounded-full transition-colors" style={{backgroundColor:checked?'#5B3FD6':'#9CA3AF'}}><span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked?'translate-x-5':''}`}/></span>
  </button>;
}

export function NewsSourceSettings(){
  const [,setVersion]=useState(0);
  const [expanded,setExpanded]=useState<string|null>(()=>newsService.sources()[0]?.id||null);
  const [error,setError]=useState(''),[status,setStatus]=useState('');
  const [permissionBusy,setPermissionBusy]=useState(false);
  const [notificationsGranted,setNotificationsGranted]=useState(false);
  const refreshPermission=()=>{void checkStudyAlarmPermission().then(granted=>{setNotificationsGranted(granted);if(!granted)localStorage.removeItem('raje3_news_notifications_allowed');});};
  useEffect(()=>{refreshPermission();const onFocus=()=>refreshPermission();window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[]);
  useEffect(()=>newsService.subscribe(()=>setVersion(value=>value+1)),[]);
  const sources=newsService.sources();
  const change=(action:()=>void)=>{try{action();setError('');setStatus('');}catch(error){setError(error instanceof Error?error.message:'تعذر حفظ الإعداد.');}};
  return <section className="space-y-4" aria-label="إعدادات مصادر الأخبار">
    <FloatingNotice message={status} onDismiss={() => setStatus('')} />
    <div className="flex items-center justify-between px-1"><h2 className="font-bold text-sm text-[#2C2145]">مصادر الأخبار</h2><span className="text-xs text-gray-500">{sources.length} مصادر</span></div>
    {error&&<p role="alert" className="text-red-600 text-sm bg-white rounded-xl border border-gray-100 p-3">{error}</p>}
    {status&&<p role="status" className="text-gray-600 text-sm bg-white rounded-xl border border-gray-100 p-3">{status}</p>}
    <div className="space-y-3">{sources.map(source=>{
      const theme=sourceTheme(source.id),Icon=theme.icon,open=expanded===source.id;
      return <div key={source.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2">
          <button type="button" onClick={()=>setExpanded(open?null:source.id)} aria-expanded={open} aria-controls={`source-options-${source.id}`} aria-label={`إعدادات مصدر ${source.name}`} className="flex items-center gap-3 min-h-14 flex-1 min-w-0 text-right">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:theme.light,color:theme.color}}><Icon className="w-5 h-5"/></span>
            <span className="flex-1 min-w-0"><span className="block font-bold text-sm text-[#2C2145]">{source.name}</span><span className="block text-[11px] text-gray-500 mt-1">{source.builtIn?'مصدر مدمج':'مصدر أضفته'} · {source.enabled?'مفعّل':'معطّل'}</span></span>
            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open?'rotate-180':''}`}/>
          </button>
          <Switch checked={source.enabled} label={`تفعيل مصدر ${source.name}`} onChange={()=>change(()=>newsService.setSourcePreferences(source.id,{enabled:!source.enabled}))}/>
        </div>
        <div id={`source-options-${source.id}`} hidden={!open} className="border-t border-gray-100 px-4">
          <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
            <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold text-[#2C2145]"><Bell className="w-4 h-4 text-gray-400"/>إشعارات الأخبار</p><p className="text-xs text-gray-500 leading-5 mt-1">{notificationsGranted?'متابعة الجديد وإرسال إشعار. إيقافها يُبقي الأخبار ظاهرة.':'إذن إشعارات الهاتف غير ممنوح؛ لن تُرسل إشعارات حتى تمنحه.'}</p></div>
            <Switch checked={notificationsGranted&&localStorage.getItem('raje3_news_notifications_allowed')==='1'&&source.notificationsEnabled!==false} label={`إشعارات مصدر ${source.name}`} onChange={()=>{if(!notificationsGranted||localStorage.getItem('raje3_news_notifications_allowed')!=='1'){setPermissionBusy(true);void enableNewsNotifications().then(ok=>{setNotificationsGranted(ok);if(ok){change(()=>newsService.setSourcePreferences(source.id,{notificationsEnabled:true}));setStatus('تم منح الإذن وتفعيل إشعارات الأخبار.');}else setStatus('إذن الإشعارات غير ممنوح؛ بقي الخيار غير مفعّل.');}).catch(()=>setStatus('تعذر التحقق من إذن الإشعارات.')).finally(()=>setPermissionBusy(false));return;}change(()=>newsService.setSourcePreferences(source.id,{notificationsEnabled:source.notificationsEnabled===false}));}}/>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold text-[#2C2145]"><Languages className="w-4 h-4 text-gray-400"/>الترجمة التلقائية</p><p className="text-xs text-gray-500 leading-5 mt-1">ترجمة الخبر غير العربي عند ظهوره، وحفظ الترجمة.</p></div>
            <Switch checked={source.autoTranslate===true} label={`ترجمة مصدر ${source.name} تلقائيًا`} onChange={()=>change(()=>newsService.setSourcePreferences(source.id,{autoTranslate:!source.autoTranslate}))}/>
          </div>
          {!source.enabled&&<p className="text-xs text-gray-500 leading-5 pb-3">مخفي من الرئيسية و«الكل». يمكنك فتح تبويبه لجلب أخباره يدويًا.</p>}
          {!source.builtIn&&<button type="button" onClick={()=>{if(window.confirm(`إزالة مصدر ${source.name} وأخباره المحفوظة؟ يمكنك إضافته مجددًا لاحقًا.`))change(()=>newsService.removeSource(source.id));}} className="flex items-center gap-2 w-full min-h-12 border-t border-gray-100 text-sm text-red-600 font-semibold"><Trash2 className="w-4 h-4"/>إزالة المصدر</button>}
        </div>
      </div>;
    })}</div>
    <p className="px-1 text-xs text-gray-500 leading-6">الترجمة اختيارية لكل مصدر. {Capacitor.isNativePlatform()?'تستخدم الترجمة المحلية على الهاتف، وقد يحتاج أول استخدام تنزيل حزمة اللغة.':'على الويب، يُرسل نص الخبر إلى Gemini باستخدام إعداداتك، وقد يستهلك من حصتك. يلزم إعداد مفتاح صالح.'}</p>
    {Capacitor.isNativePlatform()&&<button disabled={permissionBusy} className="w-full min-h-12 rounded-xl border border-gray-100 bg-white text-sm font-semibold text-[#5B3FD6]" onClick={()=>{
      setPermissionBusy(true);setError('');setStatus('');void enableNewsNotifications().then(ok=>{setNotificationsGranted(ok);setStatus(ok?'تم منح إذن إشعارات الهاتف.':'لم يُمنح إذن الإشعارات؛ بقيت الإشعارات غير مفعّلة.');}).catch(()=>setError('تعذر تفعيل إشعارات الهاتف.')).finally(()=>setPermissionBusy(false));
    }}>{permissionBusy?'جارٍ طلب الإذن…':'السماح بإشعارات الأخبار على الهاتف'}</button>}
  </section>;
}
