"use client";
import React from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { sceneShadowCss } from "../../types/slideScenePaint";
import { SlideSceneInlineText } from "./SlideSceneInlineText";
import { SlideSceneTextView } from "./SlideSceneTextView";
import { SlideSceneShapeView } from "./SlideSceneShapeView";
import { SlideSceneTableView } from "./SlideSceneTableView";
import { SlideSceneImageView } from "./SlideSceneImageView";
import { SlideSceneChartView } from "./SlideSceneChartView";
type Props={object:SlideSceneObject;sceneWidth:number;editingText:boolean;onTextCommit?:(text:string)=>void;onTextCancel?:()=>void};
export function SlideSceneObjectContent({object:o,sceneWidth,editingText,onTextCommit,onTextCancel}:Props){
  return <div className="h-full w-full" style={{filter:sceneShadowCss(o.shadow,sceneWidth)}}><div className="h-full w-full overflow-hidden">
    {o.kind==="text"&&<div className="h-full w-full" style={{color:o.color,fontSize:`${(o.fontSize??44)/sceneWidth*100}cqw`,fontFamily:o.fontFamily??"Arial",fontWeight:o.fontWeight,textAlign:o.align,whiteSpace:"pre-wrap",overflowWrap:"anywhere",lineHeight:1.12}}>
      {editingText?<SlideSceneInlineText object={o} onCommit={text=>onTextCommit?.(text)} onCancel={()=>onTextCancel?.()}/>:<SlideSceneTextView object={o} sceneWidth={sceneWidth}/>}
    </div>}
    {o.kind==="shape"&&<SlideSceneShapeView object={o}/>}
    {o.kind==="table"&&o.table&&<SlideSceneTableView object={o} sceneWidth={sceneWidth}/>}
    {o.kind==="chart"&&<SlideSceneChartView object={o}/>}
    {o.kind==="image"&&o.src&&<SlideSceneImageView object={o}/>}
  </div></div>;
}
