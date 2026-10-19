"use client";
import React, { useEffect, useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { defaultSceneGradient, defaultSceneShadow, normalizeScenePaint, SCENE_IMAGE_MASKS, type ScenePaintFields } from "../../types/slideScenePaint";
import { defaultSceneVectorPath, type SceneShapeKind } from "../../types/slideSceneShape";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
const pick=(o:SlideSceneObject):ScenePaintFields=>({gradient:o.gradient,shadow:o.shadow,imageMask:o.imageMask});
type Props={object:SlideSceneObject;disabled:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void};
/** One Apply for the whole effect draft. A remote paint edit cannot be overwritten by a stale form. */
export function SlideScenePaintControls({object,disabled,onPatch}:Props){
  const source=JSON.stringify(pick(object));
  const [baseline,setBaseline]=useState(source),[draft,setDraft]=useState<ScenePaintFields>(()=>structuredClone(pick(object)));
  const [pathText,setPathText]=useState(()=>JSON.stringify(object.imageMask?.shapePath??defaultSceneVectorPath(),null,2));
  const [error,setError]=useState("");
  const dirty=JSON.stringify(draft)!==baseline||(draft.imageMask?.shapeKind==="custom"&&pathText!==JSON.stringify(draft.imageMask.shapePath,null,2));
  const stale=source!==baseline;
  useEffect(()=>{if(!dirty){setBaseline(source);setDraft(JSON.parse(source));setPathText(JSON.stringify(object.imageMask?.shapePath??defaultSceneVectorPath(),null,2));}},[source,dirty]);
  const reset=()=>{setBaseline(source);setDraft(JSON.parse(source));setPathText(JSON.stringify(object.imageMask?.shapePath??defaultSceneVectorPath(),null,2));setError("");};
  const change=(patch:Partial<ScenePaintFields>)=>{if(!disabled)setDraft(previous=>({...previous,...patch}));};
  const save=()=>{
    if(disabled||stale)return;
    try{
      const input={...draft};
      if(input.imageMask?.shapeKind==="custom")input.imageMask={...input.imageMask,shapePath:JSON.parse(pathText)};
      const next=normalizeScenePaint(object.kind,input as Record<string,unknown>);
      if(!next)throw new Error("Use finite supported effect values: 2-12 stops; 0-64 px blur; offsets within +/-256 px; a valid mask path.");
      onPatch({gradient:next.gradient,shadow:next.shadow,imageMask:next.imageMask});
      const signature=JSON.stringify(next);setBaseline(signature);setDraft(next);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Invalid effect draft.");}
  };
  if(!["shape","text","image"].includes(object.kind))return null;
  const gradient=draft.gradient,shadow=draft.shadow,mask=draft.imageMask;
  const stop=(index:number,patch:Partial<NonNullable<ScenePaintFields["gradient"]>["stops"][number]>)=>{
    if(gradient)change({gradient:{...gradient,stops:gradient.stops.map((s,i)=>i===index?{...s,...patch}:s)}});
  };
  return <details className="space-y-2 rounded border p-2" aria-label="Visual effects">
    <summary className="cursor-pointer font-semibold">Fill, shadow and mask</summary>
    {stale&&dirty&&<p role="alert" className="text-amber-800">Paint changed elsewhere. Reset this draft before applying.</p>}
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {object.kind==="shape"&&<section className="space-y-2 border-b pb-2">
      <label className="flex justify-between">Gradient<input aria-label="Enable gradient" type="checkbox" checked={!!gradient} disabled={disabled} onChange={e=>change({gradient:e.target.checked?defaultSceneGradient():undefined})}/></label>
      {gradient&&<>
        <label className="flex justify-between">Angle<input aria-label="Gradient angle" type="number" className={field+" w-20"} min={-360} max={360} value={gradient.angle} disabled={disabled} onChange={e=>change({gradient:{...gradient,angle:Number(e.target.value)}})}/></label>
        {gradient.stops.map((s,i)=><div key={i} className="flex flex-wrap items-center gap-1">
          <input type="color" aria-label={`Gradient stop ${i+1} color`} value={s.color} disabled={disabled} onChange={e=>stop(i,{color:e.target.value})}/>
          <input type="number" aria-label={`Gradient stop ${i+1} position`} className={field+" w-16"} min={0} max={100} value={s.offset*100} disabled={disabled} onChange={e=>stop(i,{offset:Number(e.target.value)/100})}/>
          <input type="number" aria-label={`Gradient stop ${i+1} opacity`} className={field+" w-16"} min={0} max={100} value={s.opacity*100} disabled={disabled} onChange={e=>stop(i,{opacity:Number(e.target.value)/100})}/>
          <button type="button" className={field} disabled={disabled||gradient.stops.length<=2} onClick={()=>change({gradient:{...gradient,stops:gradient.stops.filter((_,n)=>n!==i)}})} aria-label={`Remove gradient stop ${i+1}`}>Remove</button>
        </div>)}
        <p className="text-slate-500">Color / position % / opacity %</p>
        <button type="button" className={field} disabled={disabled||gradient.stops.length>=12} onClick={()=>change({gradient:{...gradient,stops:[...gradient.stops,{offset:0.5,color:"#FFFFFF",opacity:1}]}})}>Add gradient stop</button>
      </>}
    </section>}
    <section className="space-y-2 border-b pb-2">
      <label className="flex justify-between">Shadow<input aria-label="Enable shadow" type="checkbox" checked={!!shadow} disabled={disabled} onChange={e=>change({shadow:e.target.checked?defaultSceneShadow():undefined})}/></label>
      {shadow&&<>
        <label className="flex justify-between">Shadow color<input aria-label="Shadow color" type="color" value={shadow.color} disabled={disabled} onChange={e=>change({shadow:{...shadow,color:e.target.value}})}/></label>
        {(["x","y","blur","opacity"] as const).map(key=><label key={key} className="flex justify-between">{key}<input aria-label={`Shadow ${key}`} className={field+" w-20"} type="number" step={key==="opacity"?0.05:1} value={shadow[key]} disabled={disabled} onChange={e=>change({shadow:{...shadow,[key]:Number(e.target.value)}})}/></label>)}
      </>}
    </section>
    {object.kind==="image"&&<section className="space-y-2">
      <label className="block">Image mask<select aria-label="Image mask" className={field+" w-full"} value={mask?.shapeKind??"rect"} disabled={disabled} onChange={e=>{
        const shapeKind=e.target.value as SceneShapeKind;
        change({imageMask:shapeKind==="rect"?undefined:{shapeKind,radius:mask?.radius??24,...(shapeKind==="custom"?{shapePath:mask?.shapePath??defaultSceneVectorPath()}:{})}});
      }}>{SCENE_IMAGE_MASKS.map(kind=><option key={kind}>{kind}</option>)}</select></label>
      {mask?.shapeKind==="roundRect"&&<label className="flex justify-between">Mask radius<input aria-label="Mask radius" type="number" min={0} max={200} className={field+" w-20"} disabled={disabled} value={mask.radius??24} onChange={e=>change({imageMask:{...mask,radius:Number(e.target.value)}})}/></label>}
      {mask?.shapeKind==="custom"&&<label className="block">Mask path JSON<textarea aria-label="Mask path JSON" rows={6} maxLength={50000} className={field+" w-full"} value={pathText} disabled={disabled} onChange={e=>setPathText(e.target.value)}/></label>}
    </section>}
    <div className="flex gap-2"><button type="button" className={field} disabled={disabled||stale} onClick={save}>Apply visual effects</button><button type="button" className={field} onClick={reset}>Reset draft</button></div>
  </details>;
}
