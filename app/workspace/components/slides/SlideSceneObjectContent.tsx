"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneShadowCss } from "../../types/slideScenePaint";
import { SlideSceneInlineText } from "./SlideSceneInlineText";
import { SlideSceneTextView } from "./SlideSceneTextView";
import { SlideSceneShapeView } from "./SlideSceneShapeView";
import { SlideSceneTableView } from "./SlideSceneTableView";
import { SlideSceneImageView } from "./SlideSceneImageView";
type Props={object:SlideSceneObject;sceneWidth:number;editingText:boolean;onTextCommit?:(text:string)=>void;onTextCancel?:()=>void};
export function SlideSceneObjectContent({object:o,sceneWidth,editingText,onTextCommit,onTextCancel}:Props){
  return <div className="h-full w-full" style={{filter:sceneShadowCss(o.shadow,sceneWidth)}}><div className="h-full w-full overflow-hidden">
    {o.kind==="text"&&<div className="h-full w-full" style={{color:o.color,fontSize:`${(o.fontSize??44)/sceneWidth*100}cqw`,fontFamily:o.fontFamily??"Arial",fontWeight:o.fontWeight,textAlign:o.align,whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.12}}>
      {editingText?<SlideSceneInlineText object={o} onCommit={text=>onTextCommit?.(text)} onCancel={()=>onTextCancel?.()}/>:<SlideSceneTextView object={o} sceneWidth={sceneWidth}/>}
    </div>}
    {o.kind==="shape"&&<SlideSceneShapeView object={o}/>}
    {o.kind==="table"&&o.table&&<SlideSceneTableView object={o} sceneWidth={sceneWidth}/>}
    {o.kind==="chart"&&o.series&&<div className="flex h-full w-full flex-col justify-end gap-1 rounded bg-white p-[3%]">
      <div className="flex min-h-0 flex-1 items-end justify-around gap-2 border-b border-slate-300">{o.series.map((item,i)=><div key={i} title={`${item.label}: ${item.value}`} className="min-w-0 flex-1 rounded-t" style={{background:o.fill||"#4f46e5",height:`${Math.max(0,item.value/Math.max(1,...o.series!.map(x=>x.value))*100)}%`}}/>)}</div>
      <div className="flex justify-around gap-2">{o.series.map((item,i)=><span key={i} className="min-w-0 flex-1 truncate text-center" style={{fontSize:"1.25cqw"}}>{item.label}</span>)}</div>
    </div>}
    {o.kind==="image"&&o.src&&<SlideSceneImageView object={o}/>}
  </div></div>;
}
