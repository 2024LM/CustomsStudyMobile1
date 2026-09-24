import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, Play } from 'lucide-react';
import { QuizQuestion } from '../types';
import { ArabicText } from './ArabicText';

type Reward = 'shield' | 'heart' | 'magnet' | 'double';
type Kind = 'barrier' | 'car' | 'cone' | 'gate';
type Obstacle = { id:number; lane:number; y:number; kind:Kind };
type Pickup = { id:number; lane:number; y:number };
interface Props { questions:QuizQuestion[]; onAnswer:(q:QuizQuestion,a:string)=>boolean; onFinish:()=>void; onExit:()=>void }

const rewards:Record<Reward,{icon:string;label:string}> = {
  shield:{icon:'🛡️',label:'درع'}, heart:{icon:'❤️',label:'حياة'}, magnet:{icon:'🧲',label:'مغناطيس'}, double:{icon:'✨',label:'نقاط ×2'}
};
const icons:Record<Kind,string> = { barrier:'🪵', car:'🚙', cone:'🚧', gate:'🚏' };
const roadX=(lane:number,y:number)=>50+(lane-1)*(9+Math.max(0,Math.min(1,(y-21)/79))*37)*.66;

export const AdventureGame:React.FC<Props>=({questions,onAnswer,onFinish,onExit})=>{
  const [lane,setLane]=useState(1),[jumping,setJumping]=useState(false),[sliding,setSliding]=useState(false);
  const [paused,setPaused]=useState(false),[gameOver,setGameOver]=useState(false),[exitPrompt,setExitPrompt]=useState(false);
  const [score,setScore]=useState(0),[distance,setDistance]=useState(0),[hearts,setHearts]=useState(3),[shield,setShield]=useState(0);
  const [magnetUntil,setMagnetUntil]=useState(0),[doubleUntil,setDoubleUntil]=useState(0);
  const [obstacles,setObstacles]=useState<Obstacle[]>([]),[pickups,setPickups]=useState<Pickup[]>([]);
  const [questionIndex,setQuestionIndex]=useState(0),[questionOpen,setQuestionOpen]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[rewardChoices,setRewardChoices]=useState<Reward[]|null>(null);
  const state=useRef({lane:1,jumping:false,sliding:false,shield:0,magnetUntil:0,doubleUntil:0});
  const world=useRef({distance:0,lastObstacle:0,lastPickup:0,nextId:1});
  const touchStart=useRef<{x:number;y:number}|null>(null),actionTimer=useRef<number|null>(null);
  const question=questions[questionIndex];
  const options=useMemo(()=>question?[question.correctAnswer,question.wrong1,question.wrong2,question.wrong3].filter(Boolean).map(value=>({value,n:Math.random()})).sort((a,b)=>a.n-b.n).map(x=>x.value):[],[question]);

  useEffect(()=>{state.current.lane=lane},[lane]); useEffect(()=>{state.current.shield=shield},[shield]);
  useEffect(()=>{state.current.magnetUntil=magnetUntil},[magnetUntil]); useEffect(()=>{state.current.doubleUntil=doubleUntil},[doubleUntil]);
  useEffect(()=>()=>{if(actionTimer.current!==null)clearTimeout(actionTimer.current)},[]);
  const left=useCallback(()=>setLane(v=>Math.max(0,v-1)),[]),right=useCallback(()=>setLane(v=>Math.min(2,v+1)),[]);
  const jump=useCallback(()=>{if(state.current.jumping||state.current.sliding)return;state.current.jumping=true;setJumping(true);actionTimer.current=window.setTimeout(()=>{state.current.jumping=false;setJumping(false)},720)},[]);
  const slide=useCallback(()=>{if(state.current.sliding||state.current.jumping)return;state.current.sliding=true;setSliding(true);actionTimer.current=window.setTimeout(()=>{state.current.sliding=false;setSliding(false)},650)},[]);

  useEffect(()=>{
    if(paused||questionOpen||gameOver||exitPrompt)return;
    let frameId=0,previous=performance.now(),scoreClock=0;
    const frame=(time:number)=>{
      const elapsed=Math.min((time-previous)/1000,.05); previous=time;
      const speed=Math.min(27,11+world.current.distance/150),step=speed*elapsed,now=Date.now();
      world.current.distance+=step; scoreClock+=elapsed; setDistance(world.current.distance);
      if(scoreClock>=.1){const ticks=Math.floor(scoreClock/.1);scoreClock-=ticks*.1;setScore(v=>v+ticks*(now<state.current.doubleUntil?2:1))}
      const gap=Math.max(34,62-world.current.distance/90);
      if(world.current.distance-world.current.lastObstacle>=gap){world.current.lastObstacle=world.current.distance;const kinds:Kind[]=['barrier','car','cone','gate'];setObstacles(v=>[...v,{id:world.current.nextId++,lane:Math.floor(Math.random()*3),y:20,kind:kinds[Math.floor(Math.random()*kinds.length)]}])}
      if(world.current.distance-world.current.lastPickup>=105){world.current.lastPickup=world.current.distance;setPickups(v=>[...v,{id:world.current.nextId++,lane:Math.floor(Math.random()*3),y:20}])}
      setObstacles(list=>{const next:Obstacle[]=[];let hit=false;for(const item of list){const moved={...item,y:item.y+step*1.18};const zone=moved.y>=82&&moved.y<=96,same=item.lane===state.current.lane;const avoided=item.kind==='gate'?state.current.sliding:item.kind==='car'?false:state.current.jumping;if(zone&&same&&!avoided)hit=true;else if(moved.y<108)next.push(moved)}if(hit){if(state.current.shield>0){state.current.shield--;setShield(state.current.shield)}else setHearts(v=>{const n=Math.max(0,v-1);if(!n)setGameOver(true);return n})}return next});
      setPickups(list=>{const next:Pickup[]=[];let collected=false;for(const item of list){const moved={...item,y:item.y+step*1.18};const magnetic=now<state.current.magnetUntil&&moved.y>58;if(moved.y>=80&&moved.y<=98&&(moved.lane===state.current.lane||magnetic))collected=true;else if(moved.y<108)next.push(moved)}if(collected&&questions.length){setSelected(null);setRewardChoices(null);setQuestionOpen(true)}return next});
      frameId=requestAnimationFrame(frame);
    }; frameId=requestAnimationFrame(frame); return()=>cancelAnimationFrame(frameId);
  },[paused,questionOpen,gameOver,exitPrompt,questions.length]);

  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(questionOpen||gameOver||paused||exitPrompt)return;if(e.key==='ArrowLeft')left();if(e.key==='ArrowRight')right();if(e.key==='ArrowUp')jump();if(e.key==='ArrowDown')slide()};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[questionOpen,gameOver,paused,exitPrompt,left,right,jump,slide]);
  const advance=()=>{const next=questionIndex+1;setQuestionOpen(false);setSelected(null);setRewardChoices(null);next>=questions.length?onFinish():setQuestionIndex(next)};
  const answer=(value:string)=>{if(selected||!question)return;setSelected(value);if(onAnswer(question,value)){setScore(v=>v+100);const all:Reward[]=['shield','heart','magnet','double'];setRewardChoices(all.sort(()=>Math.random()-.5).slice(0,3))}else window.setTimeout(advance,900)};
  const choose=(reward:Reward)=>{const now=Date.now();if(reward==='shield')setShield(v=>Math.min(2,v+1));if(reward==='heart')setHearts(v=>Math.min(5,v+1));if(reward==='magnet')setMagnetUntil(now+12000);if(reward==='double')setDoubleUntil(now+12000);advance()};
  const gestureEnd=(e:React.TouchEvent)=>{if(!touchStart.current||paused||questionOpen||gameOver||exitPrompt)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.current.x,dy=t.clientY-touchStart.current.y;touchStart.current=null;if(Math.max(Math.abs(dx),Math.abs(dy))<28)return;if(Math.abs(dx)>Math.abs(dy))dx>0?right():left();else dy<0?jump():slide()};

  return <div className="fixed inset-0 z-50 flex flex-col bg-[#dff3ff] select-none" dir="rtl">
    <header className="z-40 flex items-center justify-between gap-2 px-3 py-2 bg-white/92 backdrop-blur-md border-b shadow-sm">
      <button onClick={()=>setExitPrompt(true)} className="game-control" aria-label="الرجوع"><ArrowRight className="w-5 h-5"/></button>
      <div className="flex gap-2 text-xs font-bold"><span className="game-chip">❤️ {hearts}</span><span className="game-chip">⭐ {score}</span>{shield>0&&<span className="game-chip">🛡️ {shield}</span>}</div>
      <button onClick={()=>setPaused(v=>!v)} className="game-control" aria-label={paused?'متابعة':'إيقاف'}>{paused?<Play/>:<Pause/>}</button>
    </header>
    <main className="runner-world relative flex-1 overflow-hidden touch-none" onTouchStart={e=>{const t=e.touches[0];touchStart.current={x:t.clientX,y:t.clientY}}} onTouchEnd={gestureEnd}>
      <div className="runner-sky"/><div className="runner-sun"/><div className="runner-cloud runner-cloud-one"/><div className="runner-cloud runner-cloud-two"/>
      <div className="runner-city" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div><div className="runner-ground runner-ground-left"/><div className="runner-ground runner-ground-right"/>
      <div className="runner-road"><span className="runner-lane runner-lane-left"/><span className="runner-lane runner-lane-right"/><span className="runner-road-shine"/></div>
      {obstacles.map(o=><div key={o.id} className={`runner-obstacle runner-obstacle-${o.kind}`} style={{left:`${roadX(o.lane,o.y)}%`,top:`${o.y}%`,transform:`translate(-50%,-50%) scale(${.28+o.y/105})`}}>{icons[o.kind]}</div>)}
      {pickups.map(p=><div key={p.id} className="runner-pickup" style={{left:`${roadX(p.lane,p.y)}%`,top:`${p.y}%`,transform:`translate(-50%,-50%) scale(${.28+p.y/112})`}}>❓</div>)}
      <div className={`runner-player ${jumping?'is-jumping':''} ${sliding?'is-sliding':''} ${paused?'is-paused':''}`} style={{left:`${roadX(lane,94)}%`}} aria-label={jumping?'الشخصية تقفز':sliding?'الشخصية تنبطح':'الشخصية تجري'}>
        <div className="runner-shadow"/><div className="runner-avatar"><span className="runner-head"/><span className="runner-body"/><span className="runner-arm runner-arm-left"/><span className="runner-arm runner-arm-right"/><span className="runner-leg runner-leg-left"/><span className="runner-leg runner-leg-right"/></div>
      </div>
      <div className="absolute z-30 top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 text-[11px] text-white backdrop-blur-sm whitespace-nowrap">{Math.floor(distance)} م • اسحب للتحكم</div>
      {paused&&!questionOpen&&<div className="absolute inset-0 z-40 bg-[#18233a]/45 backdrop-blur-sm flex items-center justify-center"><div className="bg-white rounded-3xl px-7 py-5 font-bold shadow-xl">اللعبة متوقفة مؤقتًا</div></div>}
    </main>
    <div className="z-40 grid grid-cols-4 gap-2 p-2 bg-white/94 border-t" dir="ltr"><button onClick={left} className="game-action" aria-label="يسار"><ChevronLeft/></button><button onClick={jump} className="game-action game-action-primary" aria-label="قفز"><ChevronUp/></button><button onClick={slide} className="game-action" aria-label="انبطاح"><ChevronDown/></button><button onClick={right} className="game-action" aria-label="يمين"><ChevronRight/></button></div>
    {questionOpen&&question&&<div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"><div className="w-full max-w-sm bg-white rounded-[26px] p-5 text-right max-h-[90%] overflow-y-auto">{!rewardChoices?<><div className="text-center text-3xl mb-2">🎁</div><h3 className="font-bold text-center mb-4">أجب لتحصل على مكافأة</h3><ArabicText value={question.question} as="p" className="font-bold leading-relaxed mb-4"/><div className="flex flex-col gap-2">{options.map(opt=>{const chosen=selected===opt,correct=opt===question.correctAnswer,style=selected?(correct?'bg-green-50 border-green-500 text-green-700':chosen?'bg-red-50 border-red-400 text-red-700':'opacity-55'):'bg-white border-gray-200';return <button key={opt} disabled={Boolean(selected)} onClick={()=>answer(opt)} className={`p-3.5 rounded-2xl border text-right text-sm ${style}`}><ArabicText value={opt}/></button>})}</div>{selected&&selected!==question.correctAnswer&&<p className="text-xs text-red-600 mt-3">لم تحصل على المكافأة هذه المرة. الإجابة الصحيحة: {question.correctAnswer}</p>}</>:<><div className="text-center text-4xl mb-2">✨</div><h3 className="font-bold text-center">إجابة صحيحة! اختر مكافأتك</h3><div className="grid grid-cols-3 gap-2 mt-5">{rewardChoices.map(r=><button key={r} onClick={()=>choose(r)} className="p-3 rounded-2xl border border-[#D9D1F6] bg-[#F8F6FF] text-center"><span className="block text-3xl">{rewards[r].icon}</span><span className="text-xs font-bold mt-1 block">{rewards[r].label}</span></button>)}</div></>}</div></div>}
    {gameOver&&<div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-5"><div className="w-full max-w-sm bg-white rounded-[26px] p-6 text-center"><div className="text-5xl">🏁</div><h3 className="font-bold text-xl mt-3">انتهت الجولة</h3><p className="text-gray-500 text-sm mt-2">النقاط: {score} • المسافة: {Math.floor(distance)} م</p><button onClick={onFinish} className="w-full mt-5 py-3 rounded-2xl bg-[#5B3FD6] text-white font-bold">عرض نتيجة الأسئلة</button></div></div>}
    {exitPrompt&&<div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-5"><div className="w-full max-w-sm bg-white rounded-[24px] p-5 text-right"><h3 className="font-bold text-lg">إنهاء اللعبة؟</h3><p className="text-sm text-gray-500 mt-2">ستُحفظ إجابات الأسئلة التي أجبت عنها.</p><div className="grid grid-cols-2 gap-2 mt-5"><button onClick={onExit} className="py-3 rounded-2xl border border-red-200 text-red-600 font-bold">إنهاء</button><button onClick={()=>setExitPrompt(false)} className="py-3 rounded-2xl bg-[#5B3FD6] text-white font-bold">متابعة</button></div></div></div>}
  </div>
};
