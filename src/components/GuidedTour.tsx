import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export interface TourStep { target: string; title: string; text: string; }

interface GuidedTourProps { steps: TourStep[]; onComplete: () => void; }

export const GuidedTour: React.FC<GuidedTourProps> = ({ steps, onComplete }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  const measure = () => {
    if (!step) return onComplete();
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => setTimeout(() => setRect(el.getBoundingClientRect()), 180));
  };

  useLayoutEffect(() => { measure(); }, [index, step?.target]);
  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step?.target]);

  if (!step) return null;
  const next = () => index >= steps.length - 1 ? onComplete() : setIndex((i) => i + 1);
  const pad = 7;
  const box = rect ? { top: Math.max(4, rect.top-pad), left: Math.max(4, rect.left-pad), width: Math.min(window.innerWidth-8,rect.width+pad*2), height: rect.height+pad*2 } : null;
  const preferAbove = box && box.top > window.innerHeight * .55;
  const cardStyle: React.CSSProperties = box ? preferAbove
    ? { bottom: Math.max(18,window.innerHeight-box.top+14),left:16,right:16 }
    : { top: Math.min(window.innerHeight-210,box.top+box.height+14),left:16,right:16 }
    : { top:'35%',left:16,right:16 };

  return <div className="fixed inset-0 z-[100] pointer-events-auto" dir="rtl" role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-black/60" />
    {box && <div className="fixed rounded-[24px] ring-4 ring-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.12)] pointer-events-none transition-all duration-200" style={{top:box.top,left:box.left,width:box.width,height:box.height}} />}
    <div className="fixed bg-white rounded-[20px] p-4 shadow-2xl border border-[#E9E5F8]" style={cardStyle}>
      <div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold text-[#5B3FD6]">{index+1} من {steps.length}</span><h3 className="font-bold text-base text-[#2C2145] mt-1">{step.title}</h3><p className="text-xs text-gray-500 leading-6 mt-1">{step.text}</p></div><button onClick={onComplete} aria-label="تخطي الدليل" className="w-8 h-8 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><X className="w-4 h-4"/></button></div>
      <div className="flex items-center justify-between mt-4 gap-3"><button onClick={onComplete} className="text-xs font-bold text-gray-400 px-2 py-2">تخطي</button><button onClick={next} className="bg-[#5B3FD6] text-white rounded-[12px] px-4 py-2.5 text-xs font-bold flex items-center gap-2"><span>{index===steps.length-1?'فهمت':'التالي'}</span>{index<steps.length-1&&<ArrowLeft className="w-4 h-4"/>}</button></div>
    </div>
  </div>;
};
