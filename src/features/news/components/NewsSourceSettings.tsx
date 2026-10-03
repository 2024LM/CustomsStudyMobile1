import React,{useEffect,useState} from 'react';
import {enableNewsNotifications} from '../services/newsNotifications';
import {newsService} from '../services/newsService';

export function NewsSourceSettings(){
  const [version,setVersion]=useState(0),[error,setError]=useState('');
  useEffect(()=>newsService.subscribe(()=>setVersion(value=>value+1)),[]);
  const sources=newsService.sources();
  const change=(action:()=>void)=>{try{action();setError('');setVersion(version+1);}catch(error){setError(error instanceof Error?error.message:'تعذر حفظ الإعداد.');}};
  return <section className="bg-white border border-gray-100 rounded-lg p-4 text-right" aria-label="إعدادات مصادر الأخبار">
    <h2 className="font-black text-[#2C2145]">مصادر الأخبار</h2>
    <p className="text-xs text-gray-500 leading-6 mt-2">المصدر المعطّل يبقى متاحًا في تبويبه عند فتحه. كتم الإشعارات يوقف الفحص الدوري، وتبقى الأخبار ظاهرة.</p>
    <button className="min-h-11 text-xs font-bold text-[#5B3FD6]" onClick={()=>{void enableNewsNotifications().then(ok=>setError(ok?'تم تفعيل إشعارات أخبار الهاتف.':'إشعارات الخلفية تتطلب أندرويد وإذن الإشعارات.')).catch(()=>setError('تعذر تفعيل إشعارات الهاتف.'));}}>تفعيل إشعارات الهاتف</button>
    {error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}
    {sources.map(source=><div key={source.id} className="border-t border-gray-100 mt-3 pt-3">
      <p className="font-bold text-sm">{source.name} {source.builtIn&&<span className="text-xs text-gray-500">· مدمج</span>}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
        <label className="flex items-center gap-2 min-h-11 text-xs"><input type="checkbox" checked={source.enabled} onChange={event=>change(()=>newsService.setSourcePreferences(source.id,{enabled:event.target.checked}))}/>تفعيل المصدر</label>
        <label className="flex items-center gap-2 min-h-11 text-xs"><input type="checkbox" checked={source.notificationsEnabled!==false} onChange={event=>change(()=>newsService.setSourcePreferences(source.id,{notificationsEnabled:event.target.checked}))}/>فحص الجديد والإشعارات</label>
        {!source.builtIn&&<button className="text-red-600 min-h-11 text-xs font-bold" onClick={()=>{if(window.confirm(`حذف مصدر ${source.name} وأخباره المحفوظة؟`))change(()=>newsService.removeSource(source.id));}}>حذف المصدر</button>}
      </div>
    </div>)}
  </section>;
}
