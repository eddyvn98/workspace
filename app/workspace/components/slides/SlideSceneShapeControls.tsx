"use client";
import React, { useEffect, useRef, useState } from "react";
import type { SlideSceneObject } from "../../types/slideScene";
import { SCENE_SHAPES, defaultSceneVectorPath, normalizeSceneVectorPath, type SceneShapeKind } from "../../types/slideSceneShape";
const field = "rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 disabled:opacity-40";
export function SlideSceneShapeControls({ object, disabled, onPatch }: { object: SlideSceneObject; disabled: boolean; onPatch(patch: Partial<SlideSceneObject>): void }) {
  const source = JSON.stringify(object.shapePath ?? defaultSceneVectorPath(), null, 2), previous = useRef(source);
  const [draft, setDraft] = useState(source), [error, setError] = useState("");
  useEffect(() => {
    if (source !== previous.current) {
      if (draft === previous.current) setDraft(source);
      else setError("The vector path changed elsewhere. Reset the draft before applying another change.");
      previous.current = source;
    }
  }, [source, draft]);
  const apply = () => {
    if (disabled || error.startsWith("The vector path changed")) return;
    try {
      const path = normalizeSceneVectorPath(JSON.parse(draft));
      if (!path) throw new Error("Use a width/height and 2-256 M, L, C, Q or Z path commands with finite coordinates.");
      setError(""); onPatch({ shapeKind: "custom", shapePath: path });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid vector path."); }
  };
  return <div className="space-y-2" aria-label="Shape geometry">
    <label className="flex items-center justify-between gap-2">Shape<select aria-label="Shape type" className={field} value={object.shapeKind ?? (object.radius ? "roundRect" : "rect")} disabled={disabled} onChange={e => {
      const shapeKind = e.target.value as SceneShapeKind;
      onPatch({ shapeKind, ...(shapeKind === "roundRect" && !object.radius ? {radius:Math.min(200,Math.min(object.w,object.h)/6)} : {}), ...(shapeKind === "custom" ? { shapePath: object.shapePath ?? defaultSceneVectorPath() } : {}),
        ...(shapeKind === "line" && (!object.stroke || object.stroke === "transparent") ? { stroke: object.fill === "transparent" ? "#4f46e5" : object.fill ?? "#4f46e5" } : {}) });
    }}>{SCENE_SHAPES.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label className="flex items-center justify-between gap-2">Stroke width<input aria-label="Shape stroke width" className={field + " w-20"} type="number" min={0} max={40} step={0.5} disabled={disabled} value={object.strokeWidth ?? 2} onChange={e => { const value = Number(e.target.value); if (e.target.value !== "" && value >= 0 && value <= 40) onPatch({ strokeWidth: value }); }}/></label>
    <label className="flex items-center justify-between gap-2">Stroke style<select aria-label="Shape stroke style" className={field} value={object.strokeDash ?? "solid"} disabled={disabled} onChange={e => onPatch({ strokeDash: e.target.value as "solid" | "dash" | "dot" })}>{["solid", "dash", "dot"].map(dash => <option key={dash}>{dash}</option>)}</select></label>
    {object.shapeKind === "custom" && <details><summary className="cursor-pointer">Edit vector path</summary><p className="my-1 text-slate-500">M: move, L: line, C: cubic curve, Q: quadratic curve, Z: close. Coordinates use the path viewBox, not slide positions.</p>
      <textarea aria-label="Custom vector path" className={field + " w-full font-mono"} rows={10} maxLength={48000} disabled={disabled} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.stopPropagation()}/>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-1"><button type="button" className={field} disabled={disabled} onClick={apply}>Apply path</button><button type="button" className={field} onClick={() => { setDraft(source); setError(""); }}>Reset draft</button></div>
    </details>}
  </div>;
}
