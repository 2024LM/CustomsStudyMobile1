import React from 'react';
import { sourceTheme } from '../config/sourceTheme';

export function NewsSourceBadge({ sourceId, name, onSelect }: { sourceId: string; name?: string; onSelect?: (id:string)=>void }) {
  const theme = sourceTheme(sourceId);
  const Icon = theme.icon;
  const Tag=onSelect?'button':'span';
  return <Tag type={onSelect?'button':undefined} onClick={onSelect?()=>onSelect(sourceId):undefined} aria-label={onSelect?`عرض أخبار ${name||'المصدر'}`:undefined} className="inline-flex items-center gap-2 min-w-0" data-news-source={sourceId}>
    <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-white"
      style={{ background: `linear-gradient(135deg, ${theme.color}, ${theme.end})` }}>
      <Icon className="w-5 h-5" />
    </span>
    <span className="news-source-name font-bold text-[11px] leading-5 line-clamp-2" style={{ color: theme.color }}>{name || 'مصدر الخبر'}</span>
  </Tag>;
}
