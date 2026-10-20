"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SlideSceneObject } from "../../types/slideScene";
import { normalizeSceneChart, sceneChartFromObject, SCENE_CHART_TYPES, SCENE_CHART_LIMITS, SCENE_CHART_PALETTE, type SceneChartData } from "../../types/slideSceneChart";
import { SlideSceneChartView } from "./SlideSceneChartView";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
const signature=(object:SlideSceneObject)=>JSON.stringify({chart:object.chart,series:object.series,fill:object.fill});
type DraftSeries={name:string;color:string;values:string[];xValues:string[]};
type Draft=Omit<SceneChartData,"series">&{series:DraftSeries[]};
const draftOf=(data:SceneChartData):Draft=>({...data,categories:[...data.categories],series:data.series.map(s=>({...s,values:s.values.map(v=>v===null?"":String(v)),xValues:(s.xValues??data.categories.map((_,i)=>i+1)).map(v=>v===null?"":String(v))}))});
const numeric=(values:string[])=>values.map(v=>v.trim()===""?null:Number(v));
function parsed(draft:Draft):SceneChartData|undefined{
  return normalizeSceneChart({...draft,series:draft.series.map(s=>({...s,values:numeric(s.values),xValues:numeric(s.xValues)}))});
}
function ChartDialog({object,readOnly,onApply,onClose}:{object:SlideSceneObject;readOnly:boolean;onApply:(data:SceneChartData)=>void;onClose:()=>void}){
  const original=useRef(signature(object)),dialog=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
  const [draft,setDraft]=useState<Draft>(()=>draftOf(sceneChartFromObject(object))),[error,setError]=useState("");
  const stale=signature(object)!==original.current,disabled=readOnly||!!object.locked||stale;
  const data=useMemo(()=>parsed(draft),[draft]);
  useEffect(()=>{const prev=document.activeElement as HTMLElement|null;close.current?.focus();return()=>prev?.focus?.();},[]);
  const change=(next:Draft)=>{if(!disabled){setDraft(next);setError("");}};
  const series=(index:number,patch:Partial<DraftSeries>)=>change({...draft,series:draft.series.map((s,i)=>i===index?{...s,...patch}:s)});
  const value=(s:number,index:number,v:string,x=false)=>{
    const key=x?"xValues":"values";series(s,{[key]:draft.series[s][key].map((old,i)=>i===index?v:old)});
  };
  const addRow=()=>change({...draft,categories:[...draft.categories,`Category ${draft.categories.length+1}`],series:draft.series.map(s=>({...s,values:[...s.values,""],xValues:[...s.xValues,String(draft.categories.length+1)]}))});
  const removeRow=(index:number)=>change({...draft,categories:draft.categories.filter((_,i)=>i!==index),series:draft.series.map(s=>({...s,values:s.values.filter((_,i)=>i!==index),xValues:s.xValues.filter((_,i)=>i!==index)}))});
  const apply=()=>{
    if(disabled)return;
    if(!data){setError("Use finite numbers or blank gaps. Pie/doughnut require one nonnegative series; percent stacks require nonnegative values; stacking is supported for bars/columns only.");return;}
    onApply(data);onClose();
  };
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Edit slide chart" className="fixed inset-0 z-[1100] flex flex-col bg-slate-100 p-4 text-slate-900" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
    e.stopPropagation();if(e.nativeEvent.isComposing)return;
    if(e.key==="Escape"){e.preventDefault();onClose();}if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();apply();}
    if(e.key==="Tab"){const targets=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')??[])],first=targets[0],last=targets[targets.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><h2 className="font-semibold">Edit chart</h2><p className="text-xs text-slate-500">Apply keeps the chart editable and saves one scene change.</p></div><div className="flex gap-2"><button ref={close} type="button" className={field} onClick={onClose}>Cancel</button><button type="button" className={field+" border-indigo-500"} disabled={disabled} onClick={apply}>Apply chart</button></div></header>
    {stale&&<p role="alert" className="py-2 text-red-700">Chart data changed elsewhere. Cancel and reopen; this draft cannot overwrite it.</p>}
    {error&&<p role="alert" className="py-2 text-red-700">{error}</p>}
    <div className="my-3 flex flex-wrap gap-3 text-xs">
      <label>Type <select className={field} aria-label="Chart type" disabled={disabled} value={draft.type} onChange={e=>change({...draft,type:e.target.value as SceneChartData["type"]})}>{SCENE_CHART_TYPES.map(type=><option key={type}>{type}</option>)}</select></label>
      <label>Title <input aria-label="Chart title" className={field} maxLength={240} disabled={disabled} value={draft.title} onChange={e=>change({...draft,title:e.target.value})}/></label>
      <label>Grouping <select aria-label="Chart grouping" className={field} disabled={disabled} value={draft.grouping} onChange={e=>change({...draft,grouping:e.target.value as SceneChartData["grouping"]})}>{["none","stacked","percent"].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Numbers <select aria-label="Chart number format" className={field} disabled={disabled} value={draft.numberFormat} onChange={e=>change({...draft,numberFormat:e.target.value as SceneChartData["numberFormat"]})}>{["general","decimal","percent"].map(v=><option key={v}>{v}</option>)}</select></label>
      {(["legend","showValues","includeZero"] as const).map(key=><label key={key} className="flex items-center gap-1"><input aria-label={`Chart ${key}`} type="checkbox" disabled={disabled} checked={draft[key]} onChange={e=>change({...draft,[key]:e.target.checked})}/>{key}</label>)}
      <label className="flex items-center gap-1">Background<input aria-label="Chart background" type="color" disabled={disabled||draft.background==="transparent"} value={draft.background==="transparent"?"#ffffff":draft.background} onChange={e=>change({...draft,background:e.target.value})}/></label>
      <label><input aria-label="Transparent chart background" type="checkbox" disabled={disabled} checked={draft.background==="transparent"} onChange={e=>change({...draft,background:e.target.checked?"transparent":"#FFFFFF"})}/> Transparent</label>
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2 text-xs"><button type="button" className={field} disabled={disabled||draft.categories.length>=SCENE_CHART_LIMITS.categories} onClick={addRow}>Add category</button><button type="button" className={field} disabled={disabled||draft.series.length>=SCENE_CHART_LIMITS.series} onClick={()=>change({...draft,series:[...draft.series,{name:`Series ${draft.series.length+1}`,color:SCENE_CHART_PALETTE[draft.series.length%SCENE_CHART_PALETTE.length],values:draft.categories.map(()=>""),xValues:draft.categories.map((_,i)=>String(i+1))}]})}>Add series</button><span>Blank values are gaps, not zero. Scatter uses independent X/Y columns.</span></div>
        <div className="min-h-0 flex-1 overflow-auto rounded border bg-white"><table className="border-collapse text-xs" aria-label="Chart data grid"><thead><tr><th className="border p-2">Category</th>{draft.series.map((s,i)=><th key={i} colSpan={draft.type==="scatter"?2:1} className="border p-2"><div className="flex gap-1"><input aria-label={`Series ${i+1} name`} className={field+" w-32"} maxLength={120} disabled={disabled} value={s.name} onChange={e=>series(i,{name:e.target.value})}/><input aria-label={`Series ${i+1} color`} type="color" disabled={disabled} value={s.color} onChange={e=>series(i,{color:e.target.value})}/><button aria-label={`Remove series ${i+1}`} type="button" className={field} disabled={disabled||draft.series.length<=1} onClick={()=>change({...draft,series:draft.series.filter((_,n)=>n!==i)})}>Remove</button></div></th>)}<th/></tr></thead>
          <tbody>{draft.categories.map((name,r)=><tr key={r}><td className="border p-1"><input aria-label={`Category ${r+1}`} className={field+" w-40"} maxLength={120} value={name} disabled={disabled} onChange={e=>change({...draft,categories:draft.categories.map((v,i)=>i===r?e.target.value:v)})}/></td>{draft.series.map((s,i)=><React.Fragment key={i}>{draft.type==="scatter"&&<td className="border p-1"><input aria-label={`X series ${i+1} row ${r+1}`} className={field+" w-24"} inputMode="decimal" disabled={disabled} value={s.xValues[r]} onChange={e=>value(i,r,e.target.value,true)}/></td>}<td className="border p-1"><input aria-label={`Value series ${i+1} row ${r+1}`} className={field+" w-24"} inputMode="decimal" disabled={disabled} value={s.values[r]} onChange={e=>value(i,r,e.target.value)}/></td></React.Fragment>)}<td><button aria-label={`Remove category ${r+1}`} type="button" className={field} disabled={disabled||draft.categories.length<=1} onClick={()=>removeRow(r)}>Remove</button></td></tr>)}</tbody>
        </table></div>
      </div>
      <aside className="flex min-h-48 w-full items-center justify-center rounded border bg-white p-3 lg:w-2/5"><div style={{width:"100%",aspectRatio:`${object.w}/${object.h}`}}>{data?<SlideSceneChartView object={{...object,chart:data}}/>:<p className="text-sm text-amber-800">Complete valid data/options to preview. Type changes never silently remove extra series.</p>}</div></aside>
    </div>
  </div>,document.body);
}
export function SlideSceneChartControls({object,readOnly,onPatch}:{object:SlideSceneObject;readOnly:boolean;onPatch:(patch:Partial<SlideSceneObject>)=>void}){
  const [open,setOpen]=useState(false),chart=sceneChartFromObject(object);
  return <section className="rounded border p-2"><strong>{chart.type}: {chart.series.length} series / {chart.categories.length} categories</strong><button type="button" className={field+" mt-2 w-full"} disabled={readOnly||object.locked} onClick={()=>setOpen(true)}>Edit chart data and style</button>{open&&<ChartDialog object={object} readOnly={readOnly} onClose={()=>setOpen(false)} onApply={chart=>onPatch({chart})}/>}</section>;
}
