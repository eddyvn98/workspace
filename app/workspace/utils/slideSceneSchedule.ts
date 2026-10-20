import type { SlideSceneObject } from "../types/slideScene";
import { motionPhase, normalizeSceneMotion, type SceneMotion, type SceneMotionPhase } from "../types/slideSceneMotion";
import { listSceneEffects } from "./slideSceneEffects";
export type SceneCue = SceneMotion & {
  id: string; key: string; index: number; phase: SceneMotionPhase;
  step: number; startMs: number; endMs: number;
};
export type SceneTimeline = { cues: SceneCue[]; clickCount: number; warnings: string[] };
export type SceneBuildState = { visible: boolean; x: number; y: number };
/** The same compiled times drive the editor, browser player and PresentationML exporter. */
export function compileSceneTimeline(objects: Pick<SlideSceneObject,"id"|"motion"|"animations">[]): SceneTimeline {
  const cues: SceneCue[] = [], warnings: string[] = [];
  const lastByObject = new Map<string, SceneCue>();
  let step = 0, previous: SceneCue | undefined;
  for (const entry of listSceneEffects(objects)) {
    const motion = normalizeSceneMotion(entry.motion);
    if (!motion || motion.kind === "none") continue;
    let startMs = motion.delayMs;
    if (motion.trigger === "on-click") step += 1;
    else if (previous) startMs += motion.trigger === "after-previous" ? previous.endMs : previous.startMs;
    // Competing transforms on one object cannot be rendered deterministically across players.
    const last = lastByObject.get(entry.objectId);
    if (last?.step === step && startMs < last.endMs) {
      startMs = last.endMs;
      warnings.push(`${entry.objectId}: overlapping effects on the same object were sequenced.`);
    }
    const cue: SceneCue = {...motion,id:entry.objectId,key:`${entry.objectId}:${entry.index}`,index:entry.index,
      phase:motionPhase(motion),step,startMs,endMs:startMs+motion.durationMs};
    cues.push(cue); previous = cue; lastByObject.set(cue.id,cue);
  }
  return {cues,clickCount:step,warnings};
}
export function completedCueState(state: SceneBuildState, cue: SceneCue): SceneBuildState {
  if (cue.phase === "entrance") return {...state,visible:true};
  if (cue.phase === "exit") return {...state,visible:false};
  if (cue.phase === "motion") {
    const point = cue.path?.[cue.path.length-1] ?? {x:0,y:0};
    return {...state,x:state.x+point.x,y:state.y+point.y};
  }
  return state;
}
/** Recomputed from immutable scene data so backward navigation never relies on past DOM state. */
export function sceneBuildState(timeline: SceneTimeline, id: string, step: number, includeCurrent = false): SceneBuildState {
  const cues = timeline.cues.filter(cue=>cue.id===id);
  let state: SceneBuildState = {visible:cues[0]?.phase !== "entrance",x:0,y:0};
  for (const cue of cues) if (cue.step < step || includeCurrent && cue.step === step) state = completedCueState(state,cue);
  return state;
}
export function sceneBuildDuration(timeline: SceneTimeline, step: number): number {
  return Math.max(0,...timeline.cues.filter(cue=>cue.step===step).map(cue=>cue.endMs));
}
