"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { SlideScene } from "../../types/slideScene";
import { resizeSceneRect, type SceneResizeHandle } from "../../utils/slideSceneGeometry";
import { resizeSceneSelection, rotateSceneSelection, sceneSelectionBounds } from "../../utils/slideSceneGroupTransform";
import { sceneNeedsUniformScale } from "../../utils/slideSceneBounds";
import { expandSceneSelection } from "../../utils/slideSceneGroups";
type Props={scene:SlideScene;ids:string[];surfaceRef:React.RefObject<HTMLDivElement>;onPreview:(scene:SlideScene|null)=>void;onCommit:(scene:SlideScene,original:SlideScene)=>void};
type Session={kind:SceneResizeHandle|"rotation";pointerId:number;ids:string[];startX:number;startY:number;uniform:boolean;scene:SlideScene;bounds:{x:number;y:number;w:number;h:number}};
export function SlideSceneSelectionHandles({scene,ids,surfaceRef,onPreview,onCommit}:Props){
  const bounds=useMemo(()=>sceneSelectionBounds(scene,ids),[scene,ids]),[session,setSession]=useState<Session|null>(null);
  useEffect(()=>{
    if(!session)return;
    const create=(event:PointerEvent)=>{
      const frame=surfaceRef.current?.getBoundingClientRect();if(!frame?.width||!frame.height)return session.scene;
      const dx=(event.clientX-session.startX)*session.scene.width/frame.width,dy=(event.clientY-session.startY)*session.scene.height/frame.height;
      if(session.kind!=="rotation"){
        const uniform=session.uniform||event.shiftKey,target=resizeSceneRect(session.bounds,session.kind,dx,dy,uniform);
        if(uniform){target.h=session.bounds.h*target.w/session.bounds.w;target.y=session.kind.includes("n")?session.bounds.y+session.bounds.h-target.h:session.bounds.y;}
        return resizeSceneSelection(session.scene,session.ids,target);
      }
      const cx=session.bounds.x+session.bounds.w/2,cy=session.bounds.y+session.bounds.h/2;
      const initial=Math.atan2((session.startY-frame.top)*session.scene.height/frame.height-cy,(session.startX-frame.left)*session.scene.width/frame.width-cx);
      const current=Math.atan2((event.clientY-frame.top)*session.scene.height/frame.height-cy,(event.clientX-frame.left)*session.scene.width/frame.width-cx);
      let degrees=(current-initial)*180/Math.PI;if(event.shiftKey)degrees=Math.round(degrees/15)*15;
      return rotateSceneSelection(session.scene,session.ids,degrees);
    };
    const cancel=()=>{onPreview(null);setSession(null);};
    const move=(event:PointerEvent)=>{if(event.pointerId===session.pointerId)onPreview(create(event));};
    const end=(event:PointerEvent)=>{
      if(event.pointerId!==session.pointerId)return;
      if(Math.hypot(event.clientX-session.startX,event.clientY-session.startY)<3){cancel();return;}
      const next=create(event);cancel();if(next!==session.scene)onCommit(next,session.scene);
    };
    const pointerCancel=(event:PointerEvent)=>{if(event.pointerId===session.pointerId)cancel();};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",end);window.addEventListener("pointercancel",pointerCancel);window.addEventListener("keydown",key,true);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",end);window.removeEventListener("pointercancel",pointerCancel);window.removeEventListener("keydown",key,true);};
  },[session,surfaceRef,onPreview,onCommit]);
  if(!bounds||ids.length<2)return null;
  const start=(event:React.PointerEvent,kind:Session["kind"])=>{
    if(event.button!==0)return;event.stopPropagation();event.preventDefault();
    const expanded=expandSceneSelection(scene,ids),members=scene.objects.filter(o=>expanded.includes(o.id));if(members.some(o=>o.locked))return;
    setSession({kind,pointerId:event.pointerId,ids:expanded,startX:event.clientX,startY:event.clientY,uniform:event.shiftKey||sceneNeedsUniformScale(members),scene,bounds});
  };
  const style={left:`${bounds.x/scene.width*100}%`,top:`${bounds.y/scene.height*100}%`,width:`${bounds.w/scene.width*100}%`,height:`${bounds.h/scene.height*100}%`};
  return <div data-slide-selection-box className="absolute z-20 border-2 border-indigo-500" style={{...style,pointerEvents:"none",boxSizing:"border-box"}}>
    {(["nw","ne","sw","se"] as SceneResizeHandle[]).map(handle=><div key={handle} data-group-handle={handle} role="button" aria-label={`Resize selection ${handle}`} title="Rotated selections retain their aspect ratio; Escape cancels."
      onPointerDown={event=>start(event,handle)} className="absolute flex h-10 w-10 items-center justify-center rounded-md" style={{pointerEvents:"auto",touchAction:"none",transform:"scale(var(--slide-interaction-scale, 1))",transformOrigin:"center",cursor:`${handle}-resize`,left:handle.includes("w")?-20:undefined,right:handle.includes("e")?-20:undefined,top:handle.includes("n")?-20:undefined,bottom:handle.includes("s")?-20:undefined}}><span className="pointer-events-none h-3 w-3 rounded-sm border-2 border-indigo-600 bg-white shadow-sm"/></div>)}
    <div data-group-handle="rotation" role="button" aria-label="Rotate selection" title="Shift snaps to 15 degrees. Escape cancels." onPointerDown={event=>start(event,"rotation")}
      className="absolute left-1/2 top-0 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full"
      style={{pointerEvents:"auto",touchAction:"none",cursor:"grab",transform:"scale(var(--slide-interaction-scale, 1)) translateY(-52px)",transformOrigin:"center"}}>
      <span className="pointer-events-none absolute left-1/2 top-[85%] h-8 w-px bg-indigo-600"/>
      <span className="pointer-events-none h-4 w-4 rounded-full border-2 border-indigo-600 bg-white shadow-sm"/>
    </div>
  </div>;
}
