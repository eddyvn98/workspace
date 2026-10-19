"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SlideScene } from "../../types/slideScene";
import { resizeSceneRect, type SceneResizeHandle } from "../../utils/slideSceneGeometry";
import { compileSceneTimeline, createScenePlayback, sceneBuildState, type ScenePlaybackController } from "../../utils/slideScenePlayback";
import { SlideSceneInlineText } from "./SlideSceneInlineText";
import { SlideSceneTextView } from "./SlideSceneTextView";
import { SlideSceneShapeView } from "./SlideSceneShapeView";
import { SlideSceneSelectionHandles } from "./SlideSceneSelectionHandles";
import { SlideSceneTableView } from "./SlideSceneTableView";
type Props={
  scene:SlideScene;selected?:string|null;selectedIds?:string[];editing?:boolean;
  onSelect?:(id:string,additive?:boolean)=>void;onMove?:(id:string,x:number,y:number)=>void;
  onResize?:(id:string,rect:{x:number;y:number;w:number;h:number})=>void;
  editingTextId?:string|null;onRequestTextEdit?:(id:string)=>void;onTextCommit?:(id:string,text:string)=>void;onTextCancel?:()=>void;
  onTransformSelection?:(next:SlideScene)=>void;step?:number;paused?:boolean;playheadMs?:number;replayKey?:number;
};
export function SlideSceneSurface({scene,selected,selectedIds=[],editing=false,onSelect,onMove,onResize,editingTextId,onRequestTextEdit,onTextCommit,onTextCancel,onTransformSelection,step,paused=false,playheadMs,replayKey=0}:Props){
  const ref=useRef<HTMLDivElement>(null),playback=useRef<ScenePlaybackController|null>(null);
  const [drag,setDrag]=useState<{id:string;x:number;y:number;left:number;top:number}|null>(null);
  const [resize,setResize]=useState<{id:string;handle:SceneResizeHandle;startX:number;startY:number;x:number;y:number;w:number;h:number;ratio:boolean}|null>(null);
  const [resizeOffset,setResizeOffset]=useState({dx:0,dy:0}),[transformPreview,setTransformPreview]=useState<SlideScene|null>(null),[offset,setOffset]=useState({x:0,y:0});
  const previewScene=transformPreview??scene;
  const signature=JSON.stringify(scene.objects.map(({id,motion,animations})=>({id,motion,animations})));
  const timeline=useMemo(()=>compileSceneTimeline(JSON.parse(signature)),[signature]);
  const presenting=!editing&&step!==undefined;
  useLayoutEffect(()=>{
    if(!presenting||!ref.current||step===undefined)return;
    const controller=createScenePlayback(ref.current,timeline,step,window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false);
    playback.current=controller;
    if(playheadMs!==undefined)controller.seek(playheadMs);
    if(paused)controller.pause();else controller.play();
    return ()=>{controller.cancel();playback.current=null;};
  },[timeline,step,presenting,replayKey,scene.width,scene.height]);
  useLayoutEffect(()=>{if(playheadMs!==undefined)playback.current?.seek(playheadMs);if(paused)playback.current?.pause();else playback.current?.play();},[paused,playheadMs]);
  useEffect(()=>{
    if(!drag)return;
    const move=(e:PointerEvent)=>{const box=ref.current?.getBoundingClientRect();if(!box?.width||!box.height)return;setOffset({x:(e.clientX-drag.left)*scene.width/box.width,y:(e.clientY-drag.top)*scene.height/box.height});};
    const cancel=()=>{setDrag(null);setOffset({x:0,y:0});};
    const up=(e:PointerEvent)=>{
      const box=ref.current?.getBoundingClientRect();
      if(box?.width&&box.height&&Math.hypot(e.clientX-drag.left,e.clientY-drag.top)>=3)onMove?.(drag.id,Math.round(drag.x+(e.clientX-drag.left)*scene.width/box.width),Math.round(drag.y+(e.clientY-drag.top)*scene.height/box.height));
      cancel();
    };
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);};
  },[drag,scene.width,scene.height,onMove]);
  useEffect(()=>{
    if(!resize)return;
    const dimensions=(e:PointerEvent)=>{const box=ref.current?.getBoundingClientRect();return box?.width&&box.height?{dx:(e.clientX-resize.startX)*scene.width/box.width,dy:(e.clientY-resize.startY)*scene.height/box.height}:{dx:0,dy:0};};
    const move=(e:PointerEvent)=>setResizeOffset(dimensions(e)),cancel=()=>{setResize(null);setResizeOffset({dx:0,dy:0});};
    const up=(e:PointerEvent)=>{if(Math.hypot(e.clientX-resize.startX,e.clientY-resize.startY)>=3){const delta=dimensions(e);onResize?.(resize.id,resizeSceneRect(resize,resize.handle,delta.dx,delta.dy,resize.ratio));}cancel();};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);};
  },[resize,scene.width,scene.height,onResize]);
  return <div ref={ref} data-scene-width={scene.width} data-scene-height={scene.height} className="absolute inset-0 overflow-hidden" style={{containerType:"size"}}>
    {previewScene.objects.map(o=>{
      const before=presenting?sceneBuildState(timeline,o.id,step):{visible:true,x:0,y:0};
      const rect=resize?.id===o.id?resizeSceneRect(resize,resize.handle,resizeOffset.dx,resizeOffset.dy,resize.ratio):o;
      const movePreview=drag&&!o.locked&&(o.id===drag.id||selectedIds.includes(drag.id)&&selectedIds.includes(o.id));
      return <div key={o.id} data-scene-object={o.id}
        onPointerDown={e=>{
          if(!editing||o.locked||editingTextId===o.id)return;e.preventDefault();e.stopPropagation();
          if(e.shiftKey||!selectedIds.includes(o.id))onSelect?.(o.id,e.shiftKey);
          if(e.shiftKey||(o.kind==="text"&&e.detail>=2))return;
          if(selectedIds.includes(o.id)&&scene.objects.some(item=>selectedIds.includes(item.id)&&item.locked))return;
          setDrag({id:o.id,x:o.x,y:o.y,left:e.clientX,top:e.clientY});setOffset({x:0,y:0});
        }} onDoubleClick={e=>{if(editing&&!o.locked&&o.kind==="text"){e.stopPropagation();onRequestTextEdit?.(o.id);}}}
        className={editing&&!o.locked?"cursor-move":""}
        style={{position:"absolute",left:`${(rect.x+(movePreview?offset.x:0))/scene.width*100}%`,top:`${(rect.y+(movePreview?offset.y:0))/scene.height*100}%`,width:`${rect.w/scene.width*100}%`,height:`${rect.h/scene.height*100}%`,transform:`rotate(${o.rotation}deg)`,opacity:o.opacity??1,
          outline:editing&&(selected===o.id||selectedIds.includes(o.id))?"2px solid #6366f1":undefined,transformOrigin:"center",overflow:presenting?"visible":"hidden",pointerEvents:editing?"auto":"none"}}>
        {editing&&selected===o.id&&selectedIds.length<=1&&!o.locked&&(["nw","ne","sw","se"] as SceneResizeHandle[]).map(handle=><div key={handle} data-resize-handle={handle} role="button" aria-label={`Resize ${handle}`} onPointerDown={e=>{e.stopPropagation();e.preventDefault();setResize({id:o.id,handle,startX:e.clientX,startY:e.clientY,x:o.x,y:o.y,w:o.w,h:o.h,ratio:e.shiftKey});setResizeOffset({dx:0,dy:0});}} style={{position:"absolute",width:12,height:12,background:"#fff",border:"2px solid #4f46e5",borderRadius:2,zIndex:10,cursor:`${handle}-resize`,left:handle.includes("w")?0:undefined,right:handle.includes("e")?0:undefined,top:handle.includes("n")?0:undefined,bottom:handle.includes("s")?0:undefined}}/>)}
        <div data-scene-motion={o.id} className="h-full w-full" style={{opacity:before.visible?1:0}}><div className="h-full w-full overflow-hidden">
          {o.kind==="text"&&<div className="h-full w-full" style={{color:o.color,fontSize:`${(o.fontSize||44)/scene.width*100}cqw`,fontFamily:o.fontFamily||"Arial",fontWeight:o.fontWeight,textAlign:o.align,whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.12}}>{editingTextId===o.id?<SlideSceneInlineText object={o} onCommit={text=>onTextCommit?.(o.id,text)} onCancel={()=>onTextCancel?.()}/>:<SlideSceneTextView object={o} sceneWidth={scene.width}/>}</div>}
          {o.kind==="shape"&&<SlideSceneShapeView object={o}/>}
          {o.kind==="table"&&o.table&&<SlideSceneTableView object={o} sceneWidth={scene.width}/>}
          {o.kind==="chart"&&o.series&&<div className="flex h-full w-full flex-col justify-end gap-1 rounded bg-white p-[3%]"><div className="flex min-h-0 flex-1 items-end justify-around gap-2 border-b border-slate-300">{o.series.map((item,i)=><div key={i} title={`${item.label}: ${item.value}`} className="min-w-0 flex-1 rounded-t" style={{background:o.fill||"#4f46e5",height:`${Math.max(0,item.value/Math.max(1,...o.series!.map(x=>x.value))*100)}%`}}/>)}</div><div className="flex justify-around gap-2">{o.series.map((item,i)=><span key={i} className="min-w-0 flex-1 truncate text-center" style={{fontSize:"1.25cqw"}}>{item.label}</span>)}</div></div>}
          {o.kind==="image"&&o.src&&<img alt="" src={o.src} draggable={false} className="h-full w-full" style={{objectFit:o.imageFit||"cover",objectPosition:`${(o.imageFocusX??0.5)*100}% ${(o.imageFocusY??0.5)*100}%`}}/>}
        </div></div>
      </div>;
    })}
    {editing&&selectedIds.length>1&&!editingTextId&&!scene.objects.some(o=>selectedIds.includes(o.id)&&o.locked)&&<SlideSceneSelectionHandles scene={previewScene} ids={selectedIds} surfaceRef={ref} onPreview={setTransformPreview} onCommit={next=>onTransformSelection?.(next)}/>}
  </div>;
}
