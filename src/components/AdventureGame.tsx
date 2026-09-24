import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, Play } from 'lucide-react';
import { QuizQuestion } from '../types';
import { ArabicText } from './ArabicText';

type Reward = 'shield' | 'heart' | 'magnet' | 'double';
type Obstacle = { id:number; lane:number; y:number; kind:'barrier'|'car'|'cone' };
type Pickup = { id:number; lane:number; y:number };

interface Props {
  questions: QuizQuestion[];
  onAnswer: (question: QuizQuestion, answer: string) => boolean;
  onFinish: () => void;
  onExit: () => void;
}

const LANES = [18, 50, 82];
const rewards: Record<Reward,{icon:string;label:string}> = {
  shield:{icon:'🛡️',label:'درع'}, heart:{icon:'❤️',label:'حياة'},
  magnet:{icon:'🧲',label:'مغناطيس'}, double:{icon:'✨',label:'نقاط ×2'}
};

export const AdventureGame: React.FC<Props> = ({questions,onAnswer,onFinish,onExit}) => {
  const [lane,setLane]=useState(1), [jumping,setJumping]=useState(false), [sliding,setSliding]=useState(false);
  const [paused,setPaused]=useState(false), [gameOver,setGameOver]=useState(false), [exitPrompt,setExitPrompt]=useState(false);
  const [score,setScore]=useState(0), [distance,setDistance]=useState(0), [hearts,setHearts]=useState(3), [shield,setShield]=useState(0);
  const [magnetUntil,setMagnetUntil]=useState(0), [doubleUntil,setDoubleUntil]=useState(0);
  const [obstacles,setObstacles]=useState<Obstacle[]>([]), [pickups,setPickups]=useState<Pickup[]>([]);
  const [questionIndex,setQuestionIndex]=useState(0), [questionOpen,setQuestionOpen]=useState(false);
  const [selected,setSelected]=useState<string|null>(null), [rewardChoices,setRewardChoices]=useState<Reward[]|null>(null);
  const nextId=useRef(1), lastObstacle=useRef(0), lastPickup=useRef(0), touchStart=useRef<{x:number;y:number}|null>(null);
  const question=questions[questionIndex % questions.length];
  const options=useMemo(()=>question ? [question.correctAnswer,question.wrong1,question.wrong2,question.wrong3].filter(Boolean).map(value=>({value,n:Math.random()})).sort((a,b)=>a.n-b.n).map(x=>x.value) : [],[question?.rowId]);

  const left=()=>setLane(v=>Math.max(0,v-1)), right=()=>setLane(v=>Math.min(2,v+1));
  const jump=()=>{if(jumping||sliding)return;setJumping(true);window.setTimeout(()=>setJumping(false),650)};
  const slide=()=>{if(sliding||jumping)return;setSliding(true);window.setTimeout(()=>setSliding(false),550)};

  useEffect(()=>{
    if(paused||questionOpen||gameOver||exitPrompt)return;
    const timer=window.setInterval(()=>{
      const now=Date.now(), speed=Math.min(4.4,1.55+distance/1800);
      setDistance(v=>v+speed); setScore(v=>v+(now<doubleUntil?2:1));
      if(distance-lastObstacle.current>Math.max(45,85-distance/70)){
        lastObstacle.current=distance;
        const kinds:Obstacle['kind'][]=['barrier','car','cone'];
        setObstacles(list=>[...list,{id:nextId.current++,lane:Math.floor(Math.random()*3),y:-8,kind:kinds[Math.floor(Math.random()*kinds.length)]}]);
      }
      if(distance-lastPickup.current>145){lastPickup.current=distance;setPickups(list=>[...list,{id:nextId.current++,lane:Math.floor(Math.random()*3),y:-8}])}
      setObstacles(list=>{
        const next:Obstacle[]=[]; let hit=false;
        for(const item of list){const moved={...item,y:item.y+speed};if(moved.y>76&&moved.y<94&&moved.lane===lane&&!jumping&&!sliding)hit=true;else if(moved.y<108)next.push(moved)}
        if(hit){if(shield>0)setShield(v=>Math.max(0,v-1));else setHearts(v=>{const n=v-1;if(n<=0)setGameOver(true);return Math.max(0,n)})}
        return next;
      });
      setPickups(list=>{
        const next:Pickup[]=[]; let collected=false;
        for(const item of list){const moved={...item,y:item.y+speed};const magnetic=now<magnetUntil&&moved.y>55;if(moved.y>75&&moved.y<98&&(moved.lane===lane||magnetic))collected=true;else if(moved.y<108)next.push(moved)}
        if(collected&&questions.length){setSelected(null);setRewardChoices(null);setQuestionOpen(true)}
        return next;
      });
    },50);
    return()=>window.clearInterval(timer);
  },[paused,questionOpen,gameOver,exitPrompt,distance,lane,jumping,sliding,shield,magnetUntil,doubleUntil,questions.length]);

  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(questionOpen||gameOver)return;if(e.key==='ArrowLeft')left();if(e.key==='ArrowRight')right();if(e.key==='ArrowUp')jump();if(e.key==='ArrowDown')slide()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[questionOpen,gameOver,jumping,sliding]);

  const answer=(value:string)=>{
    if(selected||!question)return;setSelected(value);const ok=onAnswer(question,value);
    if(ok){setScore(v=>v+100);const all:Reward[]=['shield','heart','magnet','double'];setRewardChoices(all.sort(()=>Math.random()-.5).slice(0,3))}
    else window.setTimeout(()=>{setQuestionIndex(v=>v+1);setQuestionOpen(false);setSelected(null)},900);
  };
  const choose=(r:Reward)=>{const now=Date.now();if(r==='shield')setShield(v=>Math.min(2,v+1));if(r==='heart')setHearts(v=>Math.min(5,v+1));if(r==='magnet')setMagnetUntil(now+12000);if(r==='double')setDoubleUntil(now+12000);setQuestionIndex(v=>v+1);setQuestionOpen(false);setSelected(null);setRewardChoices(null)};
  const gestureEnd=(e:React.TouchEvent)=>{if(!touchStart.current)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.current.x,dy=t.clientY-touchStart.current.y;touchStart.current=null;if(Math.max(Math.abs(dx),Math.abs(dy))<28)return;if(Math.abs(dx)>Math.abs(dy))dx>0?right():left();else dy<0?jump():slide()};

  return <div className="flex flex-col gap-3 pb-4 select-none" dir="rtl">
    <div className="flex items-center justify-between gap-2">
      <button onClick={()=>setExitPrompt(true)} className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center" aria-label="الرجوع"><ArrowRight className="w-5 h-5"/></button>
      <div className="flex gap-2 text-xs font-bold"><span className="bg-white border px-2.5 py-2 rounded-full">❤️ {hearts}</span><span className="bg-white border px-2.5 py-2 rounded-full">⭐ {score}</span>{shield>0&&<span className="bg-white border px-2.5 py-2 rounded-full">🛡️ {shield}</span>}</div>
      <button onClick={()=>setPaused(v=>!v)} className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center" aria-label="إيقاف">{paused?<Play/>:<Pause/>}</button>
    </div>
    <div className="relative overflow-hidden rounded-[26px] border border-gray-200 bg-[#87CEEB] h-[480px] touch-none" onTouchStart={e=>{const t=e.touches[0];touchStart.current={x:t.clientX,y:t.clientY}}} onTouchEnd={gestureEnd}>
      <div className="absolute top-0 inset-x-0 h-[30%] bg-gradient-to-b from-[#78C7EE] to-[#D8F0FA]"><div className="absolute bottom-2 left-3 text-5xl">🏢</div><div className="absolute bottom-2 right-5 text-4xl">🏠</div><div className="absolute bottom-3 left-[42%] text-4xl">🌳</div></div>
      <div className="absolute top-[27%] bottom-0 left-[8%] right-[8%] bg-[#4B4D52] [clip-path:polygon(30%_0,70%_0,100%_100%,0_100%)]"><div className="absolute inset-y-0 left-1/3 border-l-2 border-dashed border-white/70"/><div className="absolute inset-y-0 right-1/3 border-r-2 border-dashed border-white/70"/></div>
      {obstacles.map(o=><div key={o.id} className="absolute z-10 text-3xl" style={{left:LANES[o.lane]+'%',top:o.y+'%',transform:'translate(-50%,-50%) scale('+(.55+o.y/130)+')'}}>{o.kind==='car'?'🚗':o.kind==='cone'?'🚧':'🪵'}</div>)}
      {pickups.map(p=><div key={p.id} className="absolute z-10 text-3xl animate-pulse" style={{left:LANES[p.lane]+'%',top:p.y+'%',transform:'translate(-50%,-50%) scale('+(.55+p.y/130)+')'}}>❓</div>)}
      <div className="absolute z-20 bottom-8 text-5xl transition-all duration-150" style={{left:LANES[lane]+'%',transform:'translateX(-50%) translateY('+(jumping?'-70px':sliding?'12px':'0')+') scale('+(sliding?.72:1)+')'}}>🏃</div>
      <div className="absolute bottom-2 inset-x-0 text-center text-[10px] text-white/80">اسحب يمين/يسار • أعلى للقفز • أسفل للانزلاق</div>
      {paused&&!questionOpen&&<div className="absolute inset-0 z-30 bg-black/35 flex items-center justify-center"><div className="bg-white rounded-2xl px-6 py-4 font-bold">اللعبة متوقفة مؤقتًا</div></div>}
    </div>
    <div className="grid grid-cols-4 gap-2" dir="ltr"><button onClick={left} className="h-12 rounded-2xl bg-white border flex items-center justify-center"><ChevronLeft/></button><button onClick={jump} className="h-12 rounded-2xl bg-white border flex items-center justify-center"><ChevronUp/></button><button onClick={slide} className="h-12 rounded-2xl bg-white border flex items-center justify-center"><ChevronDown/></button><button onClick={right} className="h-12 rounded-2xl bg-white border flex items-center justify-center"><ChevronRight/></button></div>
    {questionOpen&&question&&<div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"><div className="w-full max-w-sm bg-white rounded-[26px] p-5 text-right max-h-[90%] overflow-y-auto">
      {!rewardChoices?<><div className="text-center text-3xl mb-2">🎁</div><h3 className="font-bold text-center mb-4">أجب لتحصل على مكافأة</h3><ArabicText value={question.question} as="p" className="font-bold leading-relaxed mb-4"/><div className="flex flex-col gap-2">{options.map(opt=>{const chosen=selected===opt,correct=opt===question.correctAnswer;const cls=selected?(correct?'bg-green-50 border-green-500 text-green-700':chosen?'bg-red-50 border-red-400 text-red-700':'opacity-55'):'bg-white border-gray-200';return <button key={opt} disabled={Boolean(selected)} onClick={()=>answer(opt)} className={'p-3.5 rounded-2xl border text-right text-sm '+cls}><ArabicText value={opt}/></button>})}</div>{selected&&selected!==question.correctAnswer&&<p className="text-xs text-red-600 mt-3">لم تحصل على المكافأة هذه المرة. الإجابة الصحيحة: {question.correctAnswer}</p>}</>
      :<><div className="text-center text-4xl mb-2">✨</div><h3 className="font-bold text-center">إجابة صحيحة! اختر مكافأتك</h3><div className="grid grid-cols-3 gap-2 mt-5">{rewardChoices.map(r=><button key={r} onClick={()=>choose(r)} className="p-3 rounded-2xl border border-[#D9D1F6] bg-[#F8F6FF] text-center"><span className="block text-3xl">{rewards[r].icon}</span><span className="text-xs font-bold mt-1 block">{rewards[r].label}</span></button>)}</div></>}
    </div></div>}
    {gameOver&&<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-5"><div className="w-full max-w-sm bg-white rounded-[26px] p-6 text-center"><div className="text-5xl">🏁</div><h3 className="font-bold text-xl mt-3">انتهت الجولة</h3><p className="text-gray-500 text-sm mt-2">النقاط: {score} • المسافة: {Math.floor(distance)} م</p><button onClick={onFinish} className="w-full mt-5 h-13 py-3 rounded-2xl bg-[#5B3FD6] text-white font-bold">عرض نتيجة الأسئلة</button></div></div>}
    {exitPrompt&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-5"><div className="w-full max-w-sm bg-white rounded-[24px] p-5 text-right"><h3 className="font-bold text-lg">إنهاء اللعبة؟</h3><p className="text-sm text-gray-500 mt-2">ستُحفظ إجابات الأسئلة التي أجبت عنها.</p><div className="grid grid-cols-2 gap-2 mt-5"><button onClick={onExit} className="py-3 rounded-2xl border border-red-200 text-red-600 font-bold">إنهاء</button><button onClick={()=>setExitPrompt(false)} className="py-3 rounded-2xl bg-[#5B3FD6] text-white font-bold">متابعة</button></div></div></div>}
  </div>;
};
