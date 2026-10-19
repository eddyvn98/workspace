"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideScene } from "../../types/slideScene";
import { compileSceneTimeline, sceneBuildDuration } from "../../utils/slideScenePlayback";
import { SlideSceneSurface } from "./SlideSceneSurface";
type Props = {scene:SlideScene;backgroundColor?:string;onClose:()=>void};
export function SlideSceneAnimationPreview({scene,backgroundColor="#ffffff",onClose}:Props) {
  const timeline=useMemo(()=>compileSceneTimeline(scene.objects),[scene.objects]);
  const [step,setStep]=useState(0),[paused,setPaused]=useState(false),[cursor,setCursor]=useState(0),[seekAt,setSeekAt]=useState(0),[replay,setReplay]=useState(0);
  const dialog=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
  const duration=sceneBuildDuration(timeline,step);
  const jump=(next:number)=>{setStep(Math.max(0,Math.min(timeline.clickCount,next)));setCursor(0);setSeekAt(0);setReplay(v=>v+1);setPaused(false);};
  useEffect(()=>{
    const prior=document.activeElement as HTMLElement|null;close.current?.focus();
    return ()=>prior?.focus?.();
  },[]);
  useEffect(()=>{
    if(paused)return;
    let raf=0;const start=performance.now();
    const tick=()=>{const time=Math.min(duration,seekAt+performance.now()-start);setCursor(time);if(time>=duration){setSeekAt(duration);setPaused(true);}else raf=requestAnimationFrame(tick);};
    raf=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(raf);
  },[paused,step,duration,seekAt,replay]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Animation preview" ref={dialog}
    className="fixed inset-0 z-[1100] flex flex-col gap-3 bg-slate-950 p-4 text-white" onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{
      e.stopPropagation();
      if(e.key==="Escape"){e.preventDefault();onClose();}
      if(e.key==="Tab"){
        const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex="0"]')??[]);
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }}>
    <header className="flex items-center justify-between"><strong>Animation preview</strong><button ref={close} type="button" className="rounded border px-3 py-1" onClick={onClose}>Close</button></header>
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="relative w-full max-w-6xl overflow-hidden shadow-2xl" style={{backgroundColor,aspectRatio:`${scene.width}/${scene.height}`,maxHeight:"100%",maxWidth:`min(72rem,calc((100vh - 12rem) * ${scene.width/scene.height}))`}}>
        <SlideSceneSurface scene={scene} step={step} paused={paused} playheadMs={seekAt} replayKey={replay}/>
      </div>
    </div>
    <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3 rounded border border-slate-700 p-3 text-sm">
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={step===0} onClick={()=>jump(step-1)}>Previous build</button>
      <span>Build {step} / {timeline.clickCount}</span>
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={step===timeline.clickCount} onClick={()=>jump(step+1)}>Next click</button>
      <button type="button" className="rounded border px-3 py-1" onClick={()=>{setSeekAt(cursor>=duration?0:cursor);if(cursor>=duration)setCursor(0);setPaused(v=>!v);}}>{paused?"Play":"Pause"}</button>
      <button type="button" className="rounded border px-3 py-1" onClick={()=>jump(step)}>Replay build</button>
      <input type="range" aria-label="Animation playhead" className="min-w-32 flex-1" min={0} max={Math.max(1,duration)} step={10} value={cursor} onChange={e=>{const time=Number(e.target.value);setPaused(true);setSeekAt(time);setCursor(time);}}/>
      <output>{(cursor/1000).toFixed(1)} / {(duration/1000).toFixed(1)} s</output>
    </div>
  </div>,document.body);
}
