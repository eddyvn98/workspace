import { completedCueState, type SceneBuildState, type SceneCue } from "./slideSceneSchedule";
export type SceneFrameTrack = { frames: Keyframe[]; delay: number; duration: number };
const baseFrame = (state: SceneBuildState): Keyframe => ({opacity:state.visible?1:0,transform:"none",clipPath:"inset(0)"});
function effectFrames(cue: SceneCue, state: SceneBuildState, scale: number): Keyframe[] {
  const base = baseFrame(state);
  if (cue.phase === "motion") return [base,base];
  if (cue.kind === "pulse") return [base,{...base,transform:"scale(1.12)"},base];
  if (cue.kind === "spin") return [base,{...base,transform:"rotate(360deg)"}];
  const entering = cue.phase === "entrance";
  const from = cue.kind === "rise" ? `translateY(${24*scale}px)` : cue.kind === "slide" ? `translateX(${50*scale}px)` : cue.kind === "zoom" ? "scale(.8)" : "none";
  const hidden: Keyframe = {opacity:0,transform:from,clipPath:cue.kind === "wipe"?"inset(0 100% 0 0)":"inset(0)"};
  const shown: Keyframe = {opacity:entering?1:(state.visible?1:0),transform:"none",clipPath:"inset(0)"};
  return entering ? [hidden,shown] : [shown,hidden];
}
/** A single keyframe track per object avoids multiple fill=both effects overriding each other. */
export function sceneInnerTrack(cues: SceneCue[], initial: SceneBuildState, scale = 1): SceneFrameTrack {
  const delay = cues[0]?.startMs ?? 0;
  const duration = Math.max(1,(cues[cues.length-1]?.endMs ?? delay+1)-delay);
  const frames: Keyframe[] = [];
  let state = initial;
  const add = (time:number,frame:Keyframe,easing="linear") => frames.push({...frame,offset:Math.max(0,Math.min(1,(time-delay)/duration)),easing});
  for (const cue of cues) {
    add(cue.startMs,baseFrame(state));
    const parts = effectFrames(cue,state,scale);
    parts.forEach((part,index)=>add(cue.startMs+cue.durationMs*index/(parts.length-1),part,cue.easing ?? "ease-out"));
    state = completedCueState(state,cue);
    // End transient rotation/scale before a subsequent effect; visibility remains committed.
    add(cue.endMs,baseFrame(state));
  }
  if (!frames.length) frames.push({...baseFrame(initial),offset:0},{...baseFrame(initial),offset:1});
  return {frames,delay,duration};
}
export function sceneTravelTrack(cues: SceneCue[], initial: SceneBuildState, scale = 1): SceneFrameTrack | undefined {
  const moving = cues.filter(cue=>cue.phase === "motion");
  if (!moving.length) return;
  const delay = moving[0].startMs, duration = Math.max(1,moving[moving.length-1].endMs-delay);
  const frames: Keyframe[] = [];
  let state = initial;
  const add = (time:number,x:number,y:number,easing="linear") => frames.push({translate:`${x*scale}px ${y*scale}px`,offset:(time-delay)/duration,easing});
  for (const cue of moving) {
    add(cue.startMs,state.x,state.y);
    const points = cue.path ?? [{x:0,y:0},{x:0,y:0}];
    // Distances give constant speed along polyline segments, not equal time per arbitrary vertex.
    const lengths = points.map((p,i)=>i?Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0);
    const total = lengths.reduce((a,b)=>a+b,0);
    let distance = 0;
    points.forEach((p,i)=>{distance+=lengths[i];add(cue.startMs+cue.durationMs*(total?distance/total:i/(points.length-1)),state.x+p.x,state.y+p.y,cue.easing ?? "linear");});
    state = completedCueState(state,cue);
  }
  return {frames,delay,duration};
}
