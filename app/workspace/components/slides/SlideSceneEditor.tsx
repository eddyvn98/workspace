"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SlideScene } from "../../types/slideScene";
import { applySceneGroupEdit, sceneChildGroups, sceneInGroup } from "../../utils/slideSceneGroupScope";
import { SlideSceneEditor as EditorCore } from "./SlideSceneEditorCore";
type Props={scene:SlideScene;onChange:(scene:SlideScene)=>void;readOnly?:boolean;backgroundColor?:string};
/** Group isolation is view state only; host data stays one complete scene and one save contract. */
export function SlideSceneEditor({scene,onChange,readOnly=false,backgroundColor="#FFFFFF"}:Props){
  const [scope,setScope]=useState<string[]>([]),[message,setMessage]=useState("");
  const signature=JSON.stringify(scene),latest=useRef(signature);latest.current=signature;
  const scoped=useMemo(()=>{try{return sceneInGroup(scene,scope);}catch{return null;}},[scene,scope]);
  useEffect(()=>{if(!scoped&&scope.length){setScope(path=>path.slice(0,-1));setMessage("The group changed or was removed; returned to its parent.");}},[scoped,scope]);
  const groups=sceneChildGroups(scene,scope),view=scoped??scene;
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-slate-50 px-2 py-1 text-xs text-slate-800" aria-label="Group navigation">
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={!scope.length} onClick={()=>{setScope([]);setMessage("");}}>Whole slide</button>
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={!scope.length} onClick={()=>{setScope(path=>path.slice(0,-1));setMessage("");}}>Parent group</button>
      <span>{scope.length?`Editing group level ${scope.length}; outside objects are hidden, not deleted.`:"Editing entire slide"}</span>
      <select aria-label="Enter nested group" value="" disabled={!groups.length} className="max-w-64 rounded border bg-white px-1 py-1" onChange={e=>{if(e.target.value){setScope(path=>[...path,e.target.value]);setMessage("");}}}>
        <option value="">Edit group contents...</option>{groups.map(group=><option key={group.id} value={group.id}>{group.label} ({group.count} objects)</option>)}
      </select>
    </div>
    {message&&<p role="status" className="px-2 py-1 text-xs text-amber-800">{message}</p>}
    <div className="min-h-0 flex-1"><EditorCore key={scope.join("/")} scene={view} readOnly={readOnly} backgroundColor={backgroundColor} onChange={next=>{
      if(readOnly)return;
      if(latest.current!==signature){setMessage("The slide changed during this edit. Reopen the current group before applying.");return;}
      try{onChange(scope.length?applySceneGroupEdit(scene,next,scope):next);setMessage("");}catch(e){setMessage(e instanceof Error?e.message:"The group edit could not be applied.");}
    }}/></div>
  </div>;
}
