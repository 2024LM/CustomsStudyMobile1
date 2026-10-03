import React from 'react';
import {PurpleSubpageHeader} from '../components/PurpleSubpageHeader';
import {NewsSourceSettings} from '../features/news/components/NewsSourceSettings';

export function NewsSettingsPage({onBack}:{onBack:()=>void}){
  return <div className="flex flex-col gap-5 pb-8 text-right">
    <PurpleSubpageHeader title="إعدادات الأخبار" subtitle="تحكّم في المصادر والإشعارات والترجمة" onBack={onBack}/>
    <NewsSourceSettings/>
  </div>;
}
