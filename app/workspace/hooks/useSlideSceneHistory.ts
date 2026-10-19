"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeSlideScene, type SlideScene } from "../types/slideScene";
export type SlideSceneHistoryState={undo:SlideScene[];redo:SlideScene[];expected:string};
export type SlideSceneHistorySlot={current:SlideSceneHistoryState};
type History=SlideSceneHistoryState;
export function useSlideSceneHistory(scene:SlideScene,onChange:(scene:SlideScene)=>void,readOnly:boolean,historySlot?:SlideSceneHistorySlot){
  const signature=useMemo(()=>JSON.stringify(scene),[scene]);
  const localHistory=useRef<History>({undo:[],redo:[],expected:signature});
  // The host may change the editor DOM root when entering fullscreen Studio.
  // A host-owned slot preserves Undo/Redo across that view-only remount.
  const history=historySlot??localHistory;
  const latest=useRef({scene,onChange,readOnly,signature});
  latest.current={scene,onChange,readOnly,signature};
  const mounted=useRef(true);
  const [,refresh]=useState(0);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(history.current.expected===signature)return;
    history.current={undo:[],redo:[],expected:signature};refresh(v=>v+1);
  },[signature]);
  const commit=useCallback((input:SlideScene):boolean=>{
    const current=latest.current;
    if(!mounted.current||current.readOnly)return false;
    const next=normalizeSlideScene(input,input.height===960?"4:3":"16:9");
    if(!next)return false;
    const after=JSON.stringify(next);
    if(after===current.signature)return false;
    history.current.undo.push(current.scene);
    if(history.current.undo.length>60)history.current.undo.shift();
    history.current.redo=[];history.current.expected=after;
    current.onChange(next);refresh(v=>v+1);return true;
  },[]);
  const navigate=useCallback((direction:"undo"|"redo")=>{
    const current=latest.current;
    if(!mounted.current||current.readOnly||history.current.expected!==current.signature)return;
    const next=history.current[direction].pop();if(!next)return;
    history.current[direction==="undo"?"redo":"undo"].push(current.scene);
    history.current.expected=JSON.stringify(next);current.onChange(next);refresh(v=>v+1);
  },[]);
  const isCurrent=useCallback((expected:string)=>mounted.current&&!latest.current.readOnly&&latest.current.signature===expected,[]);
  return {commit,undo:()=>navigate("undo"),redo:()=>navigate("redo"),canUndo:history.current.undo.length>0,canRedo:history.current.redo.length>0,signature,isCurrent};
}
