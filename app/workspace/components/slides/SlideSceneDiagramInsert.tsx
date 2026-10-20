"use client";
import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeSlideScene, type SlideScene } from "../../types/slideScene";
import { createSceneDiagram, type SceneDiagram } from "../../utils/slideSceneDiagram";
import { SlideSceneSurface } from "./SlideSceneSurface";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
function Dialog({scene,readOnly,onInsert,onClose}:{scene:SlideScene;readOnly:boolean;onInsert:(scene:SlideScene)=>void;onClose:()=>void}){
  const original=useRef(JSON.stringify(scene)),[labels,setLabels]=useState("Plan\nBuild\nReview\nPublish"),[links,setLinks]=useState("1 -> 2\n2 -> 3\n3 -> 4");
  const [layout,setLayout]=useState<SceneDiagram["layout"]>("process"),[color,setColor]=useState("#2563EB"),[error,setError]=useState("");
  const stale=JSON.stringify(scene)!==original.current;
  const preview=useMemo(()=>{
    try{
      const nodes=labels.split(/\r?\n/).map((label,i)=>({id:`n${i+1}`,label})).filter(n=>n.label.trim());
      const edges=links.trim()?links.trim().split(/\r?\n/).map(line=>{const match=/^\s*(\d+)\s*->\s*(\d+)\s*$/.exec(line);if(!match)throw new Error("Use 1 -> 2 per connection line.");return {from:`n${Number(match[1])}`,to:`n${Number(match[2])}`};}):[];
      const objects=createSceneDiagram({version:1,layout,nodes,edges,color},{x:60,y:60,w:scene.width-120,h:scene.height-120},()=>crypto.randomUUID());
      return {objects,message:""};
    }catch(e){return {objects:[],message:e instanceof Error?e.message:"Invalid diagram"};}
  },[labels,links,layout,color,scene.width,scene.height]);
  const apply=()=>{
    if(readOnly||stale||preview.message)return;
    const next=normalizeSlideScene({...scene,objects:[...scene.objects,...preview.objects]},scene.height===960?"4:3":"16:9");
    if(!next){setError("The diagram would exceed the full slide's 120-object limit.");return;}
    onInsert(next);onClose();
  };
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Insert editable diagram" className="fixed inset-0 z-[1100] flex flex-col gap-3 bg-slate-100 p-4 text-slate-900" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape")onClose();if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();apply();}}}>
    <header className="flex items-center justify-between"><h2 className="font-semibold">Insert editable diagram</h2><div className="flex gap-2"><button autoFocus type="button" className={field} onClick={onClose}>Cancel</button><button type="button" className={field} disabled={readOnly||stale||!!preview.message} onClick={apply}>Insert diagram</button></div></header>
    {(stale||preview.message||error)&&<p role="alert" className="text-red-700">{stale?"The slide changed. Cancel and reopen this draft.":preview.message||error}</p>}
    <p className="text-sm text-slate-600">Nodes, labels and connections become ordinary nested objects. You can move, restyle or ungroup them afterwards.</p>
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row"><aside className="space-y-3 overflow-auto md:w-80">
      <label className="block">Layout<select aria-label="Diagram layout" className={field+" w-full"} value={layout} onChange={e=>setLayout(e.target.value as SceneDiagram["layout"])}>{["process","hierarchy","cycle"].map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="block">Node labels (one per line)<textarea aria-label="Diagram nodes" rows={8} maxLength={24000} className={field+" w-full"} value={labels} onChange={e=>setLabels(e.target.value)}/></label>
      <label className="block">Connections (node numbers)<textarea aria-label="Diagram connections" rows={6} maxLength={4000} className={field+" w-full"} value={links} onChange={e=>setLinks(e.target.value)}/></label>
      <label className="flex justify-between">Node color<input aria-label="Diagram color" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
    </aside><div className="flex min-w-0 flex-1 items-center"><div className="relative w-full overflow-hidden border bg-white" style={{aspectRatio:`${scene.width}/${scene.height}`}}><SlideSceneSurface scene={{...scene,objects:preview.objects}}/></div></div></div>
  </div>,document.body);
}
export function SlideSceneDiagramInsert({scene,readOnly,onInsert}:{scene:SlideScene;readOnly:boolean;onInsert:(scene:SlideScene)=>void}){
  const [open,setOpen]=useState(false);
  return <><button type="button" className={field} disabled={readOnly} onClick={()=>setOpen(true)}>+ Diagram</button>{open&&<Dialog scene={scene} readOnly={readOnly} onInsert={onInsert} onClose={()=>setOpen(false)}/>}</>;
}
