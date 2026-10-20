"use client";
import React, { useEffect, useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { objectMotions } from "../../types/slideSceneMotion";
import { SlideSceneTableControls } from "./SlideSceneTableEditor";
import { SlideSceneShapeControls } from "./SlideSceneShapeControls";
import { SlideScenePaintControls } from "./SlideScenePaintControls";
import { SlideSceneChartControls } from "./SlideSceneChartEditor";
import { SlideSceneCropControls } from "./SlideSceneCropControls";
export const sceneField="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
function ValueField({label,value,type="text",disabled,onSave}:{label:string;value:string|number;type?:"text"|"number";disabled:boolean;onSave:(value:string)=>void}){
  const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  const save=()=>{if(type==="number"&&(!draft.trim()||!Number.isFinite(Number(draft)))){setDraft(String(value));return;}if(draft!==String(value))onSave(draft);};
  return <label className="flex items-center justify-between gap-2"><span>{label}</span><input aria-label={label} className={sceneField+" w-28"} type={type} step="any" disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={save} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape")setDraft(String(value));}}/></label>;
}
type Props={object:SlideSceneObject;readOnly:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void;onLock:(locked:boolean)=>void;onEditText:()=>void;onFormatText?:()=>void;onTimeline:()=>void};
export function SlideSceneProperties({object:o,readOnly,onPatch,onLock,onEditText,onFormatText,onTimeline}:Props){
  const disabled=readOnly||!!o.locked,exactCrop=o.imageCrop!==undefined||o.imageViewport!==undefined;
  return <div className="space-y-3" aria-label="Object properties">
    <strong className="block">Object properties</strong>
    {o.kind==="table"&&<SlideSceneTableControls object={o} readOnly={readOnly} onPatch={onPatch}/>}
    {o.kind==="shape"&&<SlideSceneShapeControls object={o} disabled={disabled} onPatch={onPatch}/>}
    {o.kind==="chart"&&<SlideSceneChartControls object={o} readOnly={readOnly} onPatch={onPatch}/>}
    {(o.kind==="text"||o.kind==="table")&&<>
      {o.kind==="text"&&<><button type="button" className={sceneField+" w-full"} disabled={disabled} onClick={onEditText}>Edit text on slide</button><button type="button" className={sceneField+" w-full"} disabled={disabled} onClick={onFormatText??onEditText}>Format selected text</button><p className="text-slate-500">The fields below format the whole box. Use Format selected text for individual words or paragraphs.</p></>}
      <ValueField label="Font size" type="number" value={o.fontSize??(o.kind==="table"?22:44)} disabled={disabled} onSave={v=>onPatch({fontSize:Number(v)})}/>
      <ValueField label="Font family" value={o.fontFamily??"Arial"} disabled={disabled} onSave={fontFamily=>onPatch({fontFamily})}/>
      <label className="flex justify-between">Bold<input aria-label="Bold text" type="checkbox" checked={o.fontWeight==="bold"} disabled={disabled} onChange={e=>onPatch({fontWeight:e.target.checked?"bold":"normal"})}/></label>
      {o.kind==="text"&&<>{(["italic","underline","strike"] as const).map(key=><label className="flex justify-between" key={key}>{key}<input aria-label={`Whole text ${key}`} type="checkbox" checked={!!o[key]} disabled={disabled} onChange={e=>onPatch({[key]:e.target.checked})}/></label>)}<label className="flex justify-between">Vertical align<select aria-label="Text vertical alignment" className={sceneField} value={o.verticalAlign??"top"} disabled={disabled} onChange={e=>onPatch({verticalAlign:e.target.value as SlideSceneObject["verticalAlign"]})}>{["top","middle","bottom"].map(value=><option key={value}>{value}</option>)}</select></label></>}
      <label className="flex justify-between">Align<select aria-label="Text alignment" className={sceneField} value={o.align??"left"} disabled={disabled} onChange={e=>onPatch({align:e.target.value as SlideSceneObject["align"]})}>{["left","center","right"].map(value=><option key={value}>{value}</option>)}</select></label>
    </>}
    {(["x","y","w","h","rotation","opacity"] as const).map(key=><ValueField key={key} label={key} type="number" value={o[key]??(key==="opacity"?1:0)} disabled={disabled} onSave={v=>onPatch({[key]:Number(v)})}/>)}
    {o.kind!=="chart"&&<ValueField label={o.kind==="table"?"Header color":"Color"} value={o.kind==="text"?o.color??"#0f172a":o.fill??"transparent"} disabled={disabled} onSave={value=>onPatch(o.kind==="text"?{color:value}:{fill:value})}/>}
    {(o.kind==="shape"||o.kind==="table")&&<ValueField label="Border color" value={o.stroke??"transparent"} disabled={disabled} onSave={stroke=>onPatch({stroke})}/>}
    {o.kind==="shape"&&(!o.shapeKind||["rect","roundRect"].includes(o.shapeKind))&&<ValueField label="Corner radius" type="number" value={o.radius??0} disabled={disabled} onSave={v=>onPatch({radius:Number(v),shapeKind:Number(v)>0?"roundRect":"rect"})}/>}
    {o.kind==="image"&&<>
      <label className="block">Image fit<select aria-label="Image fit" className={sceneField+" w-full"} value={o.imageFit??"cover"} disabled={disabled} onChange={e=>onPatch({imageFit:e.target.value as SlideSceneObject["imageFit"],imageCrop:undefined,imageViewport:undefined})}><option value="cover">Crop to fill</option><option value="contain">Fit entire image</option><option value="fill">Stretch to fill</option></select></label>
      {(["imageFocusX","imageFocusY"] as const).map(axis=><label className="block" key={axis}>{axis==="imageFocusX"?"Horizontal focus":"Vertical focus"}: {Math.round((o[axis]??0.5)*100)}%<input aria-label={axis==="imageFocusX"?"Horizontal crop focus":"Vertical crop focus"} className="w-full" type="range" min={0} max={100} value={Math.round((o[axis]??0.5)*100)} disabled={disabled||o.imageFit==="fill"||exactCrop} onChange={e=>onPatch({[axis]:Number(e.target.value)/100})}/></label>)}
      <button type="button" className={sceneField} disabled={disabled||exactCrop} onClick={()=>onPatch({imageFocusX:0.5,imageFocusY:0.5})}>Center image focus</button>
      <SlideSceneCropControls key={o.id} object={o} disabled={disabled} onPatch={onPatch}/>
    </>}
    <SlideScenePaintControls key={o.id} object={o} disabled={disabled} onPatch={onPatch}/>
    <label className="flex justify-between">Locked<input aria-label="Lock object" type="checkbox" checked={!!o.locked} disabled={readOnly} onChange={e=>onLock(e.target.checked)}/></label>
    <div className="rounded border border-indigo-200 p-2"><strong>{objectMotions(o).filter(m=>m.kind!=="none").length} animation effects</strong><p className="my-1 text-slate-500">Entrance, emphasis, exit and paths are edited in the shared timeline below.</p><button type="button" className={sceneField} onClick={onTimeline}>Open animation timeline</button></div>
  </div>;
}
