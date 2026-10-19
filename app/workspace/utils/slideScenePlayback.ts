import { sceneBuildState, sceneBuildDuration, type SceneTimeline } from "./slideSceneSchedule";
import { sceneInnerTrack, sceneTravelTrack } from "./slideSceneKeyframes";
export { compileSceneTimeline, sceneBuildState, sceneBuildDuration } from "./slideSceneSchedule";
export type { SceneCue, SceneTimeline } from "./slideSceneSchedule";
export type ScenePlaybackController = { cancel():void; pause():void; play():void; seek(timeMs:number):void; durationMs:number };
/** Only presentation effects are touched. Authored rotation/opacity and persistent scene data remain unchanged. */
export function createScenePlayback(surface: HTMLElement, timeline: SceneTimeline, step: number, reducedMotion = false): ScenePlaybackController {
  const animations: Animation[] = [], restore: Array<()=>void> = [];
  const targets = Array.from(surface.querySelectorAll<HTMLElement>("[data-scene-motion]"));
  const width = Number(surface.dataset.sceneWidth) || 1280;
  const measured = surface.getBoundingClientRect().width;
  const scale = measured > 0 ? measured/width : 1;
  let cancelled = false;
  for (const element of targets) {
    const id = element.dataset.sceneMotion || "";
    const cues = timeline.cues.filter(cue=>cue.id===id && cue.step===step);
    const initial = sceneBuildState(timeline,id,step), final = sceneBuildState(timeline,id,step,true);
    const outer = element.closest<HTMLElement>("[data-scene-object]") ?? element;
    const oldOpacity = element.style.opacity, oldTranslate = outer.style.translate, oldHidden = element.getAttribute("aria-hidden");
    restore.push(()=>{
      element.style.opacity = oldOpacity; outer.style.translate = oldTranslate;
      if (oldHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden",oldHidden);
    });
    element.style.opacity = final.visible ? "1" : "0";
    element.setAttribute("aria-hidden",final.visible ? "false" : "true");
    outer.style.translate = `${final.x*scale}px ${final.y*scale}px`;
    if (!cues.length || reducedMotion || typeof element.animate !== "function") continue;
    const inner = sceneInnerTrack(cues,initial,scale);
    const animation = element.animate(inner.frames,{duration:inner.duration,delay:inner.delay,fill:"both",easing:"linear"});
    animations.push(animation);
    // CSS individual translate is additive to the object's static rotate() transform.
    const travel = sceneTravelTrack(cues,initial,scale);
    if (travel && typeof outer.animate === "function") {
      animations.push(outer.animate(travel.frames,{duration:travel.duration,delay:travel.delay,fill:"both",easing:"linear"}));
    }
  }
  const durationMs = sceneBuildDuration(timeline,step);
  return {
    durationMs,
    pause() { if (!cancelled) for (const animation of animations) animation.pause(); },
    play() { if (!cancelled) for (const animation of animations) animation.play(); },
    seek(timeMs) {
      if (cancelled || !Number.isFinite(timeMs)) return;
      const time = Math.max(0,Math.min(durationMs,timeMs));
      for (const animation of animations) {animation.pause(); animation.currentTime = time;}
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const animation of animations) animation.cancel();
      for (const cleanup of restore) cleanup();
    },
  };
}
/** Compatibility entrypoint used by existing presenter tests and noninteractive previews. */
export function playSceneBuild(surface: HTMLElement, timeline: SceneTimeline, step: number, reducedMotion = false): () => void {
  const controller = createScenePlayback(surface,timeline,step,reducedMotion);
  return () => controller.cancel();
}
