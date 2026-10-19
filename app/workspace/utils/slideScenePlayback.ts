import type { SlideSceneObject, SceneMotionKind } from "../types/slideScene";

export type SceneCue = { id: string; kind: SceneMotionKind; step: number; startMs: number; durationMs: number; endMs: number };
export type SceneTimeline = { cues: SceneCue[]; clickCount: number };
const bounded = (n: number | undefined, fallback: number, low: number, high: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;

/** One schedule is shared by the presenter and inspector; 'none' never consumes a click. */
export function compileSceneTimeline(objects: Pick<SlideSceneObject, "id" | "motion">[]): SceneTimeline {
  const cues: SceneCue[] = [];
  let step = 0, previous: SceneCue | undefined;
  for (const object of objects) {
    const motion = object.motion;
    if (!motion || motion.kind === "none") continue;
    const delay = bounded(motion.delayMs, 0, 0, 10000);
    const durationMs = bounded(motion.durationMs, 450, 100, 5000);
    let startMs = delay;
    if (motion.trigger === "on-click") step += 1;
    else if (previous) startMs += motion.trigger === "after-previous" ? previous.endMs : previous.startMs;
    const cue: SceneCue = { id: object.id, kind: motion.kind, step, startMs, durationMs, endMs: startMs + durationMs };
    cues.push(cue); previous = cue;
  }
  return { cues, clickCount: step };
}

function entranceFrames(kind: SceneMotionKind): Keyframe[] {
  const from = kind === "rise" ? "translateY(24px)" : kind === "slide" ? "translateX(50px)" : kind === "zoom" ? "scale(.8)" : "none";
  return [
    { opacity: 0, transform: from, clipPath: kind === "wipe" ? "inset(0 100% 0 0)" : "inset(0)" },
    { opacity: 1, transform: "none", clipPath: "inset(0)" },
  ];
}

/** Animate the INNER content only. Outer geometry, rotation and authored opacity are untouched. */
export function playSceneBuild(surface: HTMLElement, timeline: SceneTimeline, step: number, reducedMotion = false): () => void {
  const cues = new Map(timeline.cues.map(cue => [cue.id, cue]));
  const animations: Animation[] = [], targets = Array.from(surface.querySelectorAll<HTMLElement>("[data-scene-motion]"));
  for (const element of targets) {
    const cue = cues.get(element.dataset.sceneMotion || "");
    element.style.opacity = cue && cue.step > step ? "0" : "1";
    if (!cue || cue.step !== step || reducedMotion || typeof element.animate !== "function") continue;
    animations.push(element.animate(entranceFrames(cue.kind), {
      duration: cue.durationMs, delay: cue.startMs, fill: "both", easing: "ease-out",
    }));
  }
  return () => {
    for (const animation of animations) animation.cancel();
    for (const element of targets) element.style.removeProperty("opacity");
  };
}
