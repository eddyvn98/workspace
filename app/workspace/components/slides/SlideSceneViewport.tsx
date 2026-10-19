"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Hand, Maximize, Minus, Plus } from "lucide-react";
import type { SlideScene } from "../../types/slideScene";

type View={zoom:number;x:number;y:number};
type Drag={pointerId:number;startX:number;startY:number;x:number;y:number};
const clamp=(n:number)=>Math.max(0.5,Math.min(4,Math.round(n*100)/100));
function isTyping(target:EventTarget|null) {
  return target instanceof HTMLElement && !!target.closest('input,textarea,select,button,a,[role="button"],[contenteditable="true"]');
}
/** Screen-space view only: no document geometry, object position or history write occurs. */
export function SlideSceneViewport({scene,backgroundColor,children,onStagePointerDown}:{
  scene:SlideScene;backgroundColor:string;children:React.ReactNode;
  onStagePointerDown?:(event:React.PointerEvent<HTMLDivElement>)=>void;
}){
  const viewport=useRef<HTMLDivElement>(null),space=useRef(false),hover=useRef(false),drag=useRef<Drag|null>(null);
  const [view,setView]=useState<View>({zoom:1,x:0,y:0}),[hand,setHand]=useState(false),[dragging,setDragging]=useState(false);
  const zoomAt=useCallback((zoom:number,clientX?:number,clientY?:number)=>{
    setView(prev=>{
      const next=clamp(zoom);if(next===prev.zoom)return prev;
      const bounds=viewport.current?.getBoundingClientRect();
      const ax=bounds&&clientX!==undefined?clientX-bounds.left-bounds.width/2:0;
      const ay=bounds&&clientY!==undefined?clientY-bounds.top-bounds.height/2:0;
      const ratio=next/prev.zoom;
      return {zoom:next,x:ax-(ax-prev.x)*ratio,y:ay-(ay-prev.y)*ratio};
    });
  },[]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const wheel=(event:WheelEvent)=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();event.stopPropagation();
      setView(prev=>{
        const bounds=node.getBoundingClientRect(),ax=event.clientX-bounds.left-bounds.width/2,ay=event.clientY-bounds.top-bounds.height/2;
        const zoom=clamp(prev.zoom*Math.exp(-event.deltaY*0.004));
        const ratio=zoom/prev.zoom;
        return {zoom,x:ax-(ax-prev.x)*ratio,y:ay-(ay-prev.y)*ratio};
      });
    };
    node.addEventListener("wheel",wheel,{passive:false});
    return()=>node.removeEventListener("wheel",wheel);
  },[]);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      if(event.code!=="Space"||event.repeat||isTyping(event.target))return;
      const root=viewport.current?.closest('[aria-label="Slide scene editor"]');
      if(!hover.current&&!root?.contains(document.activeElement))return;
      space.current=true;event.preventDefault();
    };
    const up=(event:KeyboardEvent)=>{if(event.code==="Space")space.current=false;};
    const blur=()=>{space.current=false;drag.current=null;setDragging(false);};
    window.addEventListener("keydown",down,true);window.addEventListener("keyup",up,true);window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("keydown",down,true);window.removeEventListener("keyup",up,true);window.removeEventListener("blur",blur);};
  },[]);
  useEffect(()=>{
    if(!dragging)return;
    const move=(event:PointerEvent)=>{
      const current=drag.current;if(!current||event.pointerId!==current.pointerId)return;
      setView(prev=>({...prev,x:current.x+event.clientX-current.startX,y:current.y+event.clientY-current.startY}));
    };
    const end=(event:PointerEvent)=>{if(event.pointerId!==drag.current?.pointerId)return;drag.current=null;setDragging(false);};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",end);
    window.addEventListener("pointercancel",end);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",end);};
  },[dragging]);
  const startPan=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||(!hand&&!space.current)||((event.target as Element).closest('[aria-label="Canvas view controls"]')))return;
    event.preventDefault();event.stopPropagation();
    drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:view.x,y:view.y};
    setDragging(true);
  };
  const zoomText=`${Math.round(view.zoom*100)}%`;
  return <div ref={viewport} data-slide-viewport
    className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-200 p-4"
    style={{containerType:"size",cursor:hand||dragging?"grab":undefined,touchAction:hand?"none":undefined}}
    onPointerEnter={()=>{hover.current=true;}} onPointerLeave={()=>{hover.current=false;}}
    onPointerDownCapture={startPan}>
    <div data-slide-stage className="relative shrink-0 overflow-hidden border border-slate-300 shadow-xl"
      style={{aspectRatio:`${scene.width}/${scene.height}`,
        width:`min(calc(100cqw - 32px), calc((100cqh - 32px) * ${scene.width/scene.height}))`,
        height:`min(calc((100cqw - 32px) * ${scene.height/scene.width}), calc(100cqh - 32px))`,
        backgroundColor,transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,transformOrigin:"center center",
        "--slide-interaction-scale":1/view.zoom} as React.CSSProperties}
      onPointerDown={onStagePointerDown}>
      {children}
    </div>
    <div role="group" aria-label="Canvas view controls"
      onPointerDown={event=>event.stopPropagation()}
      className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-300 bg-white/95 p-1 shadow-md backdrop-blur-sm">
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.zoom<=0.5} onClick={()=>zoomAt(view.zoom/1.25)} className="min-h-10 min-w-10 rounded hover:bg-slate-100 disabled:opacity-40"><Minus className="mx-auto h-4 w-4"/></button>
      <output aria-label="Canvas zoom" className="min-w-12 text-center text-xs font-semibold tabular-nums">{zoomText}</output>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.zoom>=4} onClick={()=>zoomAt(view.zoom*1.25)} className="min-h-10 min-w-10 rounded hover:bg-slate-100 disabled:opacity-40"><Plus className="mx-auto h-4 w-4"/></button>
      <button type="button" aria-label="Fit slide" title="Fit slide (100%)" onClick={()=>setView({zoom:1,x:0,y:0})} className="flex min-h-10 items-center gap-1 rounded px-2 text-xs hover:bg-slate-100"><Maximize className="h-4 w-4"/>Fit</button>
      <button type="button" aria-label="Pan canvas" aria-pressed={hand} title="Pan canvas (or hold Space and drag)" onClick={()=>setHand(v=>!v)} className={`flex min-h-10 items-center gap-1 rounded px-2 text-xs ${hand?"bg-indigo-100 text-indigo-700":"hover:bg-slate-100"}`}><Hand className="h-4 w-4"/>Pan</button>
    </div>
  </div>;
}
