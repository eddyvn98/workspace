"use client";
import React from "react";
import type { SlideScene, SlideSceneObject, SceneMotionTrigger } from "../../types/slideScene";
import { scenePatchObject } from "../../types/slideScene";
import { compileSceneTimeline } from "../../utils/slideScenePlayback";

type Props = { scene: SlideScene; selected: string | null; onSelect: (id: string) => void; onChange: (scene: SlideScene) => void; readOnly: boolean };
const triggers: SceneMotionTrigger[] = ["with-previous", "after-previous", "on-click"];
const effects = ["none", "fade", "rise", "slide", "zoom", "wipe"] as const;
const style = "rounded border border-slate-300 bg-white px-1 py-0.5";
export function SlideSceneTimeline({ scene, selected, onSelect, onChange, readOnly }: Props) {
  const timeline = compileSceneTimeline(scene.objects), cues = new Map(timeline.cues.map(c => [c.id, c]));
  const duration = Math.max(2000, ...timeline.cues.map(cue => cue.endMs));
  const update = (o: SlideSceneObject, patch: Partial<NonNullable<SlideSceneObject["motion"]>>) => {
    if (readOnly || o.locked) return;
    onChange(scenePatchObject(scene, o.id, { motion: { kind: o.motion?.kind || "fade", trigger: o.motion?.trigger || "with-previous", durationMs: o.motion?.durationMs || 450, delayMs: o.motion?.delayMs || 0, ...patch } }));
  };
  return <section aria-label="Slide object timeline" className="shrink-0 border-t bg-white p-2 text-xs text-slate-900">
    <div className="mb-2 flex items-center justify-between"><strong>Object timeline</strong><span className="text-slate-500">{timeline.clickCount} click builds; timing is relative to each build</span></div>
    <div className="max-h-36 space-y-1 overflow-auto">
      {scene.objects.map((o, index) => {
        const motion = o.motion || { kind: "none", trigger: "with-previous", durationMs: 450, delayMs: 0 }, cue = cues.get(o.id);
        return <div key={o.id} className="flex min-w-[40rem] items-center gap-2">
          <button type="button" onClick={() => onSelect(o.id)} className={`w-24 shrink-0 truncate rounded px-1 py-1 text-left ${selected === o.id ? "bg-indigo-100" : "bg-slate-100"}`}>{index + 1}. {o.text?.slice(0, 12) || o.kind}</button>
          <select aria-label={`Effect for ${o.id}`} className={style} value={motion.kind} disabled={readOnly || o.locked} onChange={e => update(o, { kind: e.target.value as typeof effects[number] })}>{effects.map(v => <option key={v}>{v}</option>)}</select>
          <select aria-label={`Trigger for ${o.id}`} className={style} value={motion.trigger} disabled={readOnly || o.locked} onChange={e => update(o, { trigger: e.target.value as SceneMotionTrigger })}>{triggers.map(v => <option key={v}>{v}</option>)}</select>
          <span className="w-12 shrink-0 text-slate-500">{cue ? cue.step ? `Click ${cue.step}` : "Auto" : "Static"}</span>
          <div className="relative h-5 min-w-20 flex-1 rounded bg-slate-100" title={cue ? `Build ${cue.step}, start ${cue.startMs} ms, duration ${cue.durationMs} ms` : "No object animation"}>
            {cue && <div className="absolute top-0 h-full min-w-1 rounded bg-indigo-400" style={{ left: `${cue.startMs / duration * 100}%`, width: `${cue.durationMs / duration * 100}%` }} />}
          </div>
          <label className="flex items-center gap-1">ms<input aria-label={`Duration for ${o.id}`} type="number" min={100} max={5000} step={50} disabled={readOnly || o.locked} value={motion.durationMs} onChange={e => update(o, { durationMs: Number(e.target.value) })} className={style + " w-16"} /></label>
          <label className="flex items-center gap-1">Delay<input aria-label={`Delay for ${o.id}`} type="number" min={0} max={10000} step={50} disabled={readOnly || o.locked} value={motion.delayMs} onChange={e => update(o, { delayMs: Number(e.target.value) })} className={style + " w-16"} /></label>
        </div>;
      })}
      {!scene.objects.length && <p className="py-3 text-center text-slate-500">Add an object to create an animation track.</p>}
    </div>
  </section>;
}
