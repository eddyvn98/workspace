"use client";
import React, { useEffect, useState } from "react";
import type { SceneMotionPoint } from "../../types/slideSceneMotion";
const field="rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
export function EffectNumber({label,value,min,max,onChange,disabled=false}:{label:string;value:number;min:number;max:number;onChange:(v:number)=>void;disabled?:boolean}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n)){onChange(Math.round(Math.max(min,Math.min(max,n))));}else setDraft(String(value));};
  return <label className="flex items-center gap-1"><span>{label}</span><input type="number" aria-label={label} className={field+" w-20"} min={min} max={max} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape")setDraft(String(value));}}/></label>;
}
export function EffectPath({points,onChange,disabled=false}:{points:SceneMotionPoint[];onChange:(p:SceneMotionPoint[])=>void;disabled?:boolean}) {
  const serialized=points.map(p=>`${p.x}, ${p.y}`).join("\n");
  const [draft,setDraft]=useState(serialized),[error,setError]=useState("");
  useEffect(()=>{setDraft(serialized);setError("");},[serialized]);
  const save=()=>{
    const rows=draft.trim().split(/\r?\n/);
    if(rows.length<2||rows.length>24){setError("Use 2-24 points, starting at 0, 0.");return;}
    const next:SceneMotionPoint[]=[];
    for(const row of rows){const parts=row.split(",").map(v=>v.trim());const x=Number(parts[0]),y=Number(parts[1]);
      if(parts.length!==2||parts.some(v=>!v)||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1280||Math.abs(y)>960){setError("Each line needs x, y within +/-1280 and +/-960 scene pixels.");return;}
      next.push({x,y});
    }
    if(next[0].x!==0||next[0].y!==0){setError("The first point must be 0, 0.");return;}
    setError("");onChange(next);
  };
  return <details className="rounded border p-2"><summary className="cursor-pointer">Motion path points</summary>
    <p className="my-1 text-slate-500">Relative scene pixels. Each line is x, y; the final point is retained after playback.</p>
    <textarea aria-label="Motion path points" rows={4} className={field+" w-full font-mono"} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.stopPropagation()}/>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <button type="button" disabled={disabled} className={field+" mt-1"} onClick={save}>Apply path</button>
  </details>;
}
