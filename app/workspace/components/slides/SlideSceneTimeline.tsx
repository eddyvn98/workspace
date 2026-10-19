"use client";
import React, { useMemo, useState } from "react";
import type { SlideScene, SceneMotion, SceneMotionTrigger } from "../../types/slideScene";
import { SCENE_EFFECTS, MAX_OBJECT_EFFECTS, MAX_SCENE_EFFECTS, motionPhase, objectMotions, type SceneMotionPhase, type SceneMotionEasing } from "../../types/slideSceneMotion";
import { addSceneEffect, editSceneEffect, listSceneEffects } from "../../utils/slideSceneEffects";
import { compileSceneTimeline, sceneBuildDuration } from "../../utils/slideScenePlayback";
import { SlideSceneAnimationPreview } from "./SlideSceneAnimationPreview";
import { EffectNumber, EffectPath } from "./SlideSceneEffectFields";
type Props = {scene:SlideScene;selected:string|null;onSelect:(id:string)=>void;onChange:(scene:SlideScene)=>void;readOnly:boolean;backgroundColor?:string};
const style="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40";
const phases:SceneMotionPhase[]=["entrance","emphasis","exit","motion"];
const triggers:SceneMotionTrigger[]=["on-click","with-previous","after-previous"];
const easings:SceneMotionEasing[]=["linear","ease-in","ease-out","ease-in-out"];
const defaultKind=(phase:SceneMotionPhase):SceneMotion["kind"]=>phase==="emphasis"?"pulse":phase==="motion"?"move":"fade";
export function SlideSceneTimeline({scene,selected,onSelect,onChange,readOnly,backgroundColor}:Props) {
  const [addPhase,setAddPhase]=useState<SceneMotionPhase>("entrance"),[preview,setPreview]=useState(false);
  const entries=useMemo(()=>listSceneEffects(scene.objects),[scene.objects]);
  const timeline=useMemo(()=>compileSceneTimeline(scene.objects),[scene.objects]);
  const cues=new Map(timeline.cues.map(cue=>[cue.key,cue]));
  const selectedObject=scene.objects.find(o=>o.id===selected);
  const add=()=>{
    if(readOnly||!selectedObject)return;
    onChange(addSceneEffect(scene,selectedObject.id,{phase:addPhase,kind:defaultKind(addPhase),trigger:"on-click",durationMs:600,delayMs:0,easing:addPhase==="motion"?"linear":"ease-out"}));
  };
  return <section aria-label="Slide object timeline" className="shrink-0 border-t bg-white p-2 text-xs text-slate-900" onPointerDown={e=>e.stopPropagation()}>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <strong>Animation timeline</strong>
      <span className="text-slate-500">{entries.length} effects / {timeline.clickCount} clicks</span>
      <select className={style} aria-label="New effect category" value={addPhase} disabled={readOnly} onChange={e=>setAddPhase(e.target.value as SceneMotionPhase)}>{phases.map(phase=><option key={phase}>{phase}</option>)}</select>
      <button type="button" className={style} onClick={add} disabled={readOnly||!selectedObject||selectedObject.locked||objectMotions(selectedObject).length>=MAX_OBJECT_EFFECTS||entries.length>=MAX_SCENE_EFFECTS}>Add effect to selection</button>
      <button type="button" className={style+" ml-auto"} disabled={!scene.objects.length} onClick={()=>setPreview(true)}>Preview / scrub</button>
    </div>
    {timeline.warnings.length>0&&<p role="status" className="mb-2 text-amber-800">Overlapping effects on the same object are played sequentially to keep playback deterministic.</p>}
    <div className="max-h-60 space-y-2 overflow-auto">
      {entries.map((entry,position)=>{
        const object=scene.objects.find(o=>o.id===entry.objectId)!;
        const motion=entry.motion,phase=motionPhase(motion),cue=cues.get(`${entry.objectId}:${entry.index}`);
        const disabled=readOnly||!!object.locked;
        const patch=(change:Partial<SceneMotion>|"delete"|"up"|"down")=>{if(!disabled)onChange(editSceneEffect(scene,position,change));};
        const duration=cue?Math.max(1,sceneBuildDuration(timeline,cue.step)):1;
        return <div key={`${entry.objectId}:${entry.index}`} data-scene-effect={`${entry.objectId}:${entry.index}`} className={`rounded border p-2 ${selected===entry.objectId?"border-indigo-300 bg-indigo-50/40":"border-slate-200"}`}>
          <div className="flex min-w-[45rem] items-center gap-2">
            <button type="button" className="w-28 shrink-0 truncate text-left font-medium" title={object.text||object.kind} onClick={()=>onSelect(object.id)}>{position+1}. {object.text?.slice(0,18)||object.kind}</button>
            <select aria-label={`Category for effect ${position+1}`} className={style} value={phase} disabled={disabled} onChange={e=>{const next=e.target.value as SceneMotionPhase;patch({phase:next,kind:defaultKind(next)});}}>{phases.map(p=><option key={p}>{p}</option>)}</select>
            <select aria-label={`Effect ${position+1}`} className={style} value={motion.kind} disabled={disabled} onChange={e=>patch({kind:e.target.value as SceneMotion["kind"]})}>{SCENE_EFFECTS[phase].map(kind=><option key={kind}>{kind}</option>)}</select>
            <select aria-label={`Trigger for effect ${position+1}`} className={style} value={motion.trigger} disabled={disabled} onChange={e=>patch({trigger:e.target.value as SceneMotionTrigger})}>{triggers.map(trigger=><option key={trigger}>{trigger}</option>)}</select>
            <span className="w-14 shrink-0 text-slate-500">{cue?cue.step?`Click ${cue.step}`:"Auto":"None"}</span>
            <div className="relative h-4 min-w-20 flex-1 overflow-hidden rounded bg-slate-200" title={cue?`Start ${cue.startMs} ms in build ${cue.step}`:"No effect"}>{cue&&<div className="absolute h-full rounded bg-indigo-500" style={{left:`${cue.startMs/duration*100}%`,width:`${cue.durationMs/duration*100}%`}}/>}</div>
            <button type="button" className={style} aria-label={`Move effect ${position+1} earlier`} disabled={disabled||position===0} onClick={()=>patch("up")}>Up</button>
            <button type="button" className={style} aria-label={`Move effect ${position+1} later`} disabled={disabled||position===entries.length-1} onClick={()=>patch("down")}>Down</button>
            <button type="button" className={style} aria-label={`Delete effect ${position+1}`} disabled={disabled} onClick={()=>patch("delete")}>Remove</button>
          </div>
          <details className="mt-1"><summary className="cursor-pointer text-slate-600">Timing and path</summary>
            <div className="my-2 flex flex-wrap gap-3">
              <EffectNumber label="Duration ms" value={motion.durationMs} min={100} max={5000} disabled={disabled} onChange={durationMs=>patch({durationMs})}/>
              <EffectNumber label="Delay ms" value={motion.delayMs} min={0} max={10000} disabled={disabled} onChange={delayMs=>patch({delayMs})}/>
              <label className="flex items-center gap-1">Easing<select aria-label={`Easing for effect ${position+1}`} className={style} value={motion.easing??"ease-out"} disabled={disabled} onChange={e=>patch({easing:e.target.value as SceneMotionEasing})}>{easings.map(e=><option key={e}>{e}</option>)}</select></label>
            </div>
            {phase==="motion"&&<EffectPath points={motion.path??[{x:0,y:0},{x:160,y:0}]} disabled={disabled} onChange={path=>patch({path})}/>}
          </details>
        </div>;
      })}
      {!entries.length&&<p className="p-3 text-center text-slate-500">Select an object, then add an entrance, emphasis, exit or motion effect.</p>}
    </div>
    {preview&&<SlideSceneAnimationPreview scene={scene} backgroundColor={backgroundColor} onClose={()=>setPreview(false)}/>}
  </section>;
}
