"use client";
import React, { useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { EMPTY_IMAGE_INSETS, normalizeSceneImageInsets, type SceneImageInsets } from "../../types/slideSceneImageCrop";
const keys=["left","top","right","bottom"] as const;
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
const signature=(o:SlideSceneObject)=>JSON.stringify({id:o.id,src:o.src,crop:o.imageCrop,viewport:o.imageViewport,fit:o.imageFit,x:o.imageFocusX,y:o.imageFocusY});
const draftInsets=(value:SceneImageInsets|undefined)=>Object.fromEntries(keys.map(k=>[k,String(Number(((value??EMPTY_IMAGE_INSETS)[k]*100).toFixed(5)))])) as Record<typeof keys[number],string>;
type Draft={base:string;crop:ReturnType<typeof draftInsets>;viewport:ReturnType<typeof draftInsets>};
export function SlideSceneCropControls({object,disabled,onPatch}:{object:SlideSceneObject;disabled:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void}){
  const [draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState("");
  const exact=object.imageCrop!==undefined||object.imageViewport!==undefined;
  const open=()=>{setError("");setDraft({base:signature(object),crop:draftInsets(object.imageCrop),viewport:draftInsets(object.imageViewport)});};
  const apply=()=>{
    if(!draft||disabled)return;
    if(signature(object)!==draft.base){setError("The image crop changed elsewhere. Cancel and reopen this draft.");return;}
    const parse=(raw:ReturnType<typeof draftInsets>)=>keys.some(k=>!raw[k].trim())?undefined:normalizeSceneImageInsets(Object.fromEntries(keys.map(k=>[k,Number(raw[k])/100])));
    const crop=parse(draft.crop),viewport=parse(draft.viewport);
    if(!crop||!viewport){setError("Each edge must be 0-99.99%. Opposite edges must leave a visible area.");return;}
    onPatch({imageCrop:crop,imageViewport:viewport});setDraft(null);setError("");
  };
  return <section aria-label="Exact image crop" className="space-y-2 rounded border border-slate-200 p-2">
    <p>{exact?"Exact imported/manual crop is active.":"Automatic fit and focal point are active."}</p>
    {!draft?<button type="button" className={field} disabled={disabled} onClick={open}>Edit exact crop</button>:<>
      {(["crop","viewport"] as const).map(kind=><fieldset key={kind} disabled={disabled} className="space-y-1">
        <legend>{kind==="crop"?"Source crop (%)":"Destination padding (%)"}</legend>
        {keys.map(key=><label key={key} className="flex items-center justify-between capitalize">{key}<input className={field+" w-20"} type="number" step="0.1" min={0} max={99.99} aria-label={`${kind} ${key}`} value={draft[kind][key]} onChange={e=>setDraft({...draft,[kind]:{...draft[kind],[key]:e.target.value}})} onKeyDown={e=>e.stopPropagation()}/></label>)}
      </fieldset>)}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-1"><button type="button" className={field} disabled={disabled} onClick={apply}>Apply crop</button><button type="button" className={field} onClick={()=>{setDraft(null);setError("");}}>Cancel crop</button></div>
    </>}
    {exact&&<button type="button" className={field} disabled={disabled} onClick={()=>{onPatch({imageCrop:undefined,imageViewport:undefined});setDraft(null);setError("");}}>Return to automatic fit</button>}
  </section>;
}
