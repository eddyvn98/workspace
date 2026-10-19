"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { SlideScene } from "../../types/slideScene";
import { resizeSceneRect, type SceneResizeHandle } from "../../utils/slideSceneGeometry";
import { resizeSceneSelection, rotateSceneSelection, sceneSelectionBounds } from "../../utils/slideSceneGroupTransform";

type Props = {
  scene: SlideScene; ids: string[];
  surfaceRef: React.RefObject<HTMLDivElement>;
  onPreview: (scene: SlideScene | null) => void;
  onCommit: (scene: SlideScene) => void;
};
type Session = {
  kind: SceneResizeHandle | "rotation";
  startX: number; startY: number;
  shift: boolean;
  scene: SlideScene;
  bounds: {x:number;y:number;w:number;h:number};
};

export function SlideSceneSelectionHandles({scene,ids,surfaceRef,onPreview,onCommit}:Props) {
  const bounds = useMemo(()=>sceneSelectionBounds(scene,ids),[scene,ids]);
  const [session,setSession] = useState<Session|null>(null);
  useEffect(()=>{
    if(!session)return;
    const create=(event:PointerEvent)=>{
      const frame=surfaceRef.current?.getBoundingClientRect();
      if(!frame || !frame.width || !frame.height)return session.scene;
      const dx=(event.clientX-session.startX)*scene.width/frame.width;
      const dy=(event.clientY-session.startY)*scene.height/frame.height;
      if(session.kind!=="rotation")return resizeSceneSelection(session.scene,ids,resizeSceneRect(session.bounds,session.kind,dx,dy,session.shift || event.shiftKey));
      const cx=session.bounds.x+session.bounds.w/2,cy=session.bounds.y+session.bounds.h/2;
      const initial=Math.atan2((session.startY-frame.top)*scene.height/frame.height-cy,(session.startX-frame.left)*scene.width/frame.width-cx);
      const current=Math.atan2((event.clientY-frame.top)*scene.height/frame.height-cy,(event.clientX-frame.left)*scene.width/frame.width-cx);
      let degrees=(current-initial)*180/Math.PI;
      if(event.shiftKey)degrees=Math.round(degrees/15)*15;
      return rotateSceneSelection(session.scene,ids,degrees);
    };
    const move=(event:PointerEvent)=>onPreview(create(event));
    const end=(event:PointerEvent)=>{
      const transformed=create(event);
      onPreview(null);setSession(null);
      if(transformed!==session.scene)onCommit(transformed);
    };
    const cancel=()=>{onPreview(null);setSession(null);};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",end);
    window.addEventListener("pointercancel",cancel);
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",cancel);};
  },[session,scene.width,scene.height,surfaceRef,ids,onPreview,onCommit]);
  if(!bounds || ids.length<2)return null;
  const style={left:`${bounds.x/scene.width*100}%`,top:`${bounds.y/scene.height*100}%`,width:`${bounds.w/scene.width*100}%`,height:`${bounds.h/scene.height*100}%`};
  const start=(event:React.PointerEvent,kind:Session["kind"])=>{
    event.stopPropagation();event.preventDefault();
    setSession({kind,startX:event.clientX,startY:event.clientY,shift:event.shiftKey,scene,bounds});
  };
  return <div data-slide-selection-box className="absolute z-20 border-2 border-indigo-500" style={{...style,pointerEvents:"none",boxSizing:"border-box"}}>
    {(["nw","ne","sw","se"] as SceneResizeHandle[]).map(handle=><div key={handle}
      data-group-handle={handle} role="button" aria-label={`Resize selection ${handle}`}
      onPointerDown={event=>start(event,handle)}
      className="absolute h-3 w-3 rounded-sm border-2 border-indigo-600 bg-white"
      style={{pointerEvents:"auto",cursor:`${handle}-resize`,left:handle.includes("w")?-6:undefined,right:handle.includes("e")?-6:undefined,top:handle.includes("n")?-6:undefined,bottom:handle.includes("s")?-6:undefined}}/>)}
    <div className="absolute left-1/2 -top-7 h-6 w-px bg-indigo-600"/>
    <div data-group-handle="rotation" role="button" aria-label="Rotate selection"
      onPointerDown={event=>start(event,"rotation")}
      className="absolute -top-9 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-indigo-600 bg-white"
      style={{pointerEvents:"auto",cursor:"grab"}}/>
  </div>;
}
