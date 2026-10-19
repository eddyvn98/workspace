"use client";
import React, { useEffect, useRef, useState } from "react";
type Props={children:React.ReactNode};
const clamp=(value:number)=>Math.max(240,Math.min(480,Math.round(value)));
/** Desktop Inspector splitter; mobile stays a full-width bottom panel. */
export function SlideSceneResizableInspector({children}:Props){
  const [width,setWidth]=useState(288),[resizing,setResizing]=useState(false);
  const start=useRef<{pointerId:number;x:number;width:number}|null>(null);
  useEffect(()=>{
    if(!resizing)return;
    const move=(event:PointerEvent)=>{
      const first=start.current;if(!first||first.pointerId!==event.pointerId)return;
      const maximum=typeof window==="undefined"?480:Math.max(240,Math.min(480,window.innerWidth-360));
      setWidth(clamp(Math.min(maximum,first.width+first.x-event.clientX)));
    };
    const end=(event:PointerEvent)=>{
      if(event.pointerId!==start.current?.pointerId)return;start.current=null;setResizing(false);
    };
    const cancel=()=>{start.current=null;setResizing(false);};
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape")return;
      event.preventDefault();event.stopPropagation();cancel();
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",end);window.addEventListener("pointercancel",end);
    window.addEventListener("blur",cancel);window.addEventListener("keydown",escape,true);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);
      window.removeEventListener("blur",cancel);window.removeEventListener("keydown",escape,true);};
  },[resizing]);
  return <aside aria-label="Slide inspector"
    className="relative max-h-60 w-full shrink-0 overflow-auto border-t border-slate-200 bg-white p-3 text-xs lg:max-h-none lg:w-[var(--inspector-width)] lg:border-t-0 lg:border-l"
    style={{"--inspector-width":`${width}px`} as React.CSSProperties}>
    <div role="separator" tabIndex={0} aria-label="Resize inspector" aria-orientation="vertical"
      aria-valuemin={240} aria-valuemax={480} aria-valuenow={width}
      title="Drag or use Left/Right arrows to resize Inspector"
      className="absolute left-0 top-0 z-20 hidden h-full w-3 cursor-col-resize select-none hover:bg-indigo-100 focus-visible:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 lg:block"
      style={{touchAction:"none"}} onPointerDown={event=>{
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();
        start.current={pointerId:event.pointerId,x:event.clientX,width};setResizing(true);
      }} onKeyDown={event=>{
        if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
        event.preventDefault();event.stopPropagation();setWidth(previous=>clamp(previous+(event.key==="ArrowLeft"?16:-16)));
      }}>
      <span className="pointer-events-none absolute left-1 top-1/2 h-14 w-0.5 -translate-y-1/2 rounded bg-slate-300"/>
    </div>
    {children}
  </aside>;
}
