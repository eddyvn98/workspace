"use client";
import React from "react";
import type { SlideScene, SlideSceneObject, SceneMotionTrigger } from "../../types/slideScene";
import { scenePatchObject } from "../../types/slideScene";

type Props = { scene: SlideScene; selected: string|null; onSelect:(id:string)=>void; onChange:(scene:SlideScene)=>void; readOnly:boolean };
const triggers:SceneMotionTrigger[]=["with-previous","after-previous","on-click"];
const effects = ["none","fade","rise","slide","zoom","wipe"] as const;
const style = "rounded border border-slate-300 bg-white px-1 py-0.5";
export function SlideSceneTimeline({scene,selected,onSelect,onChange,readOnly}:Props){
  let previousEnd=0;
  const rows=scene.objects.map((o,index)=>{
    const motion=o.motion || {kind:"none" as const,trigger:"with-previous" as const,durationMs:450,delayMs:0};
    const start=motion.trigger==="after-previous"?previousEnd+motion.delayMs:motion.delayMs;
    if(motion.kind!=="none"&&motion.trigger!=="on-click")previousEnd=Math.max(previousEnd,start+motion.durationMs);
    return {o,motion,start,index};
  });
  const duration=Math.max(2000,...rows.map(r=>r.start+r.motion.durationMs));
  const update=(o:SlideSceneObject,patch:Partial<NonNullable<SlideSceneObject["motion"]>>) => {
    if(readOnly||o.locked)return;
    onChange(scenePatchObject(scene,o.id,{motion:{kind:o.motion?.kind||"fade",trigger:o.motion?.trigger||"with-previous",durationMs:o.motion?.durationMs||450,delayMs:o.motion?.delayMs||0,...patch}}));
  };
  return <section aria-label="Slide object timeline" className="shrink-0 border-t bg-white p-2 text-xs text-slate-900">
    <div className="mb-2 flex items-center justify-between"><strong>Object timeline</strong><span className="text-slate-500">Click tracks to edit · {Math.round(duration/100)/10}s</span></div>
    <div className="max-h-36 space-y-1 overflow-y-auto">
      {rows.map(({o,motion,start,index})=><div key={o.id} className="flex items-center gap-2">
        <button type="button" onClick={()=>onSelect(o.id)} className={`w-24 shrink-0 truncate rounded px-1 py-1 text-left ${selected===o.id?"bg-indigo-100":"bg-slate-100"}`}>{index+1}. {o.text?.slice(0,12)||o.kind}</button>
        <select aria-label={`Effect for ${o.id}`} className={style} value={motion.kind} disabled={readOnly||o.locked} onChange={e=>update(o,{kind:e.target.value as typeof effects[number]})}>{effects.map(v=><option key={v}>{v}</option>)}</select>
        <select aria-label={`Trigger for ${o.id}`} className={style} value={motion.trigger} disabled={readOnly||o.locked} onChange={e=>update(o,{trigger:e.target.value as SceneMotionTrigger})}>{triggers.map(v=><option key={v}>{v}</option>)}</select>
        <div className="relative h-5 min-w-20 flex-1 rounded bg-slate-100" title={`Start ${start} ms · duration ${motion.durationMs} ms`}>
          <div className="absolute top-0 h-full min-w-1 rounded bg-indigo-400" style={{left:`${Math.min(100,start/duration*100)}%`,width:`${Math.min(100,motion.durationMs/duration*100)}%`}}/>
        </div>
        <label className="flex items-center gap-1">ms<input aria-label={`Duration for ${o.id}`} type="number" min={100} max={5000} step={50} disabled={readOnly||o.locked} value={motion.durationMs} onChange={e=>update(o,{durationMs:Number(e.target.value)})} className={style+" w-16"}/></label>
        <label className="flex items-center gap-1">Delay<input aria-label={`Delay for ${o.id}`} type="number" min={0} max={10000} step={50} disabled={readOnly||o.locked} value={motion.delayMs} onChange={e=>update(o,{delayMs:Number(e.target.value)})} className={style+" w-16"}/></label>
      </div>)}
      {!rows.length&&<p className="py-3 text-center text-slate-500">Add an object to create an animation track.</p>}
    </div>
  </section>;
}
