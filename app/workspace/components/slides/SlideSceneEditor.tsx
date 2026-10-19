"use client";
import React, { useMemo, useState } from "react";
import type { SlideScene, SlideSceneObject } from "../../types/slideScene";
import { normalizeSlideScene, sceneDeleteObject, sceneMoveObject, sceneObject, scenePatchObject } from "../../types/slideScene";
import { SlideSceneSurface } from "./SlideSceneSurface";

type Props = { scene: SlideScene; onChange: (next: SlideScene) => void; readOnly?: boolean };
const field = "rounded border border-slate-300 bg-white px-2 py-1 text-slate-900";
export function SlideSceneEditor({ scene, onChange, readOnly = false }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; left: number; top: number } | null>(null);
  const item = useMemo(() => scene.objects.find(o => o.id === selected), [scene, selected]);
  const patch = (values: Partial<SlideSceneObject>) => { if (item && !readOnly && !item.locked) onChange(scenePatchObject(scene, item.id, values)); };
  const add = (kind: "text" | "shape" | "image") => {
    if (readOnly) return;
    if (kind === "image" && !/^https?:\/\/|^\/(?!\/)/i.test(imageUrl)) return;
    if (scene.objects.length >= 120) return;
    const next = sceneObject(kind, 80 + scene.objects.length * 16, 100 + scene.objects.length * 12);
    if (kind === "image") next.src = imageUrl;
    onChange({ ...scene, objects: [...scene.objects, next] });
    setSelected(next.id);
  };
  return <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-900">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white p-2 text-xs">
      <strong>Scene editor</strong>
      <button className={field} disabled={readOnly} onClick={() => add("text")}>+ Text</button>
      <button className={field} disabled={readOnly} onClick={() => add("shape")}>+ Shape</button>
      <input className={field + " w-40"} aria-label="Image URL" value={imageUrl} placeholder="Image URL" onChange={e => setImageUrl(e.target.value)} />
      <button className={field} disabled={readOnly || !imageUrl} onClick={() => add("image")}>+ Image</button>
      <span className="ml-auto text-slate-500">{scene.objects.length} objects</span>
    </div>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-3">
        <div className="relative w-full max-w-5xl overflow-hidden border bg-white shadow" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
          onPointerDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <SlideSceneSurface scene={scene} selected={selected} editing={!readOnly} onSelect={setSelected}
            onMove={(id, x, y) => { if (!readOnly) onChange(scenePatchObject(scene, id, { x, y })); }} />
        </div>
      </div>
      <aside className="hidden w-56 shrink-0 space-y-3 overflow-auto border-l bg-white p-3 text-xs lg:block">
        <strong className="block">Layers</strong>
        {[...scene.objects].reverse().map(o => <button key={o.id} onClick={() => setSelected(o.id)}
          className={`block w-full truncate rounded px-2 py-1 text-left ${selected === o.id ? "bg-indigo-100" : "hover:bg-slate-100"}`}>{o.locked ? "🔒 " : ""}{o.kind} · {o.text?.slice(0, 18) || o.id.slice(0, 8)}</button>)}
        {item && <>
          <hr/><strong className="block">Object properties</strong>
          {item.kind === "text" && <label className="block">Text<textarea className={field + " mt-1 w-full"} rows={3} value={item.text || ""} disabled={readOnly} onChange={e => patch({ text: e.target.value })}/></label>}
          {(["x","y","w","h","rotation","opacity"] as const).map(k => <label key={k} className="flex items-center justify-between gap-2 capitalize">{k}<input className={field + " w-24"} type="number" step={k === "opacity" ? 0.1 : 1} value={item[k] ?? 0} disabled={readOnly || item.locked} onChange={e => patch({ [k]: Number(e.target.value) })}/></label>)}
          {item.kind === "text" && <label className="flex items-center justify-between">Font size<input type="number" className={field + " w-24"} value={item.fontSize || 44} disabled={readOnly} onChange={e => patch({fontSize:Number(e.target.value)})}/></label>}
          <label className="flex items-center justify-between">Color<input className={field + " w-24"} value={item.kind === "text" ? item.color || "" : item.fill || ""} disabled={readOnly} onChange={e => patch(item.kind === "text" ? { color: e.target.value } : { fill: e.target.value })}/></label>
          <label className="flex items-center justify-between">Locked<input type="checkbox" checked={!!item.locked} disabled={readOnly} onChange={e => onChange(scenePatchObject(scene,item.id,{locked:e.target.checked}))}/></label>
          <strong className="block">Animation</strong>
          <label className="block">Effect<select className={field + " w-full"} value={item.motion?.kind || "none"} disabled={readOnly} onChange={e => patch({motion:{kind:e.target.value as NonNullable<SlideSceneObject["motion"]>["kind"],trigger:item.motion?.trigger||"with-previous",durationMs:item.motion?.durationMs||450,delayMs:item.motion?.delayMs||0}})}>
            {["none","fade","rise","slide","zoom","wipe"].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label className="block">Trigger<select className={field + " w-full"} value={item.motion?.trigger || "with-previous"} disabled={readOnly} onChange={e => patch({motion:{kind:item.motion?.kind||"fade",trigger:e.target.value as NonNullable<SlideSceneObject["motion"]>["trigger"],durationMs:item.motion?.durationMs||450,delayMs:item.motion?.delayMs||0}})}>
            {["with-previous","after-previous","on-click"].map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="flex items-center justify-between">Duration ms<input className={field + " w-24"} type="number" value={item.motion?.durationMs || 450} disabled={readOnly} onChange={e => patch({motion:{kind:item.motion?.kind||"fade",trigger:item.motion?.trigger||"with-previous",durationMs:Number(e.target.value),delayMs:item.motion?.delayMs||0}})}/></label>
          <div className="flex gap-2">
            <button className={field} disabled={readOnly} onClick={() => onChange(sceneMoveObject(scene,item.id,-1))}>Back</button>
            <button className={field} disabled={readOnly} onClick={() => onChange(sceneMoveObject(scene,item.id,1))}>Front</button>
            <button className={field} disabled={readOnly} onClick={() => {onChange(sceneDeleteObject(scene,item.id));setSelected(null);}}>Delete</button>
          </div>
        </>}
      </aside>
    </div>
  </div>;
}
