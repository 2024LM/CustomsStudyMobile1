import React from 'react';
import { Home, Newspaper, BookOpen, Sparkles, BookMarked, MoreHorizontal } from 'lucide-react';
import { Page } from '../types';

const items: { page: Page; title: string; icon: typeof Home }[] = [
  { page: 'HOME', title: 'الرئيسية', icon: Home },
  { page: 'NEWS', title: 'الأخبار', icon: Newspaper },
  { page: 'QUESTIONS', title: 'الأسئلة', icon: BookOpen },
  { page: 'AI_ASSISTANT', title: 'AI', icon: Sparkles },
  { page: 'REFERENCES', title: 'مراجع', icon: BookMarked },
  { page: 'MORE', title: 'المزيد', icon: MoreHorizontal },
];
export function BottomNavigation({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  return <nav aria-label="التنقل الرئيسي" data-tour="bottom-navigation"
    className="fixed bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] px-1 z-40 shadow-sm">
    <div className="grid grid-cols-6">
      {items.map(item => {
        const Icon = item.icon;
        const selected = page === item.page ||
          (item.page === 'QUESTIONS' && page === 'SESSION') ||
          (item.page === 'MORE' && ['MISTAKES', 'FAVORITES', 'BANKS', 'DOMAINS', 'PLAN', 'DOWNLOADS', 'ADVANCED', 'AI_SETTINGS', 'VOICE_SETTINGS'].includes(page));
        return <button key={item.page} type="button" aria-current={selected ? 'page' : undefined}
          onClick={() => onNavigate(item.page)}
          className="min-w-0 min-h-14 flex flex-col items-center justify-center px-0.5 py-1 text-[11px] font-semibold">
          <span className={`w-9 h-7 rounded-md flex items-center justify-center ${selected ? 'bg-[#F5F3FF] text-[#5B3FD6]' : 'text-gray-400'}`}>
            <Icon className="w-5 h-5" />
          </span>
          <span className={`mt-1 whitespace-nowrap ${selected ? 'text-[#5B3FD6] font-bold' : 'text-gray-400'}`}>{item.title}</span>
        </button>;
      })}
    </div>
  </nav>;
}
