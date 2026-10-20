export const SCENE_EFFECTS = {
  entrance: ["none", "fade", "rise", "slide", "zoom", "wipe"],
  emphasis: ["pulse", "spin"],
  exit: ["fade", "rise", "slide", "zoom", "wipe"],
  motion: ["move"],
} as const;
export type SceneMotionPhase = keyof typeof SCENE_EFFECTS;
export type SceneMotionKind = typeof SCENE_EFFECTS[SceneMotionPhase][number];
export type SceneMotionTrigger = "with-previous" | "after-previous" | "on-click";
export type SceneMotionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type SceneMotionPoint = { x: number; y: number };
export interface SceneMotion {
  kind: SceneMotionKind;
  trigger: SceneMotionTrigger;
  durationMs: number;
  delayMs: number;
  phase?: SceneMotionPhase;
  easing?: SceneMotionEasing;
  /** Stable ordering across all objects, independent of paint/layer order. */
  order?: number;
  /** Relative scene-pixel waypoints; first point is always the local origin. */
  path?: SceneMotionPoint[];
}
export const MAX_OBJECT_EFFECTS = 12;
export const MAX_SCENE_EFFECTS = 240;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const bounded = (v: unknown, fallback: number, low: number, high: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;
export function motionPhase(motion: Pick<SceneMotion, "kind" | "phase">): SceneMotionPhase {
  if (motion.kind === "pulse" || motion.kind === "spin") return "emphasis";
  if (motion.kind === "move") return "motion";
  return motion.phase === "exit" ? "exit" : "entrance";
}
export function normalizeSceneMotion(input: unknown): SceneMotion | undefined {
  if (input == null) return undefined;
  const r = record(input);
  const kinds: readonly string[] = Object.values(SCENE_EFFECTS).flat();
  const kind = kinds.includes(String(r.kind)) ? r.kind as SceneMotionKind : "none";
  const triggers = ["with-previous", "after-previous", "on-click"];
  const easing = ["linear", "ease-in", "ease-out", "ease-in-out"];
  const result: SceneMotion = {
    kind,
    trigger: triggers.includes(String(r.trigger)) ? r.trigger as SceneMotionTrigger : "with-previous",
    durationMs: Math.round(bounded(r.durationMs, 450, 100, 5000)),
    delayMs: Math.round(bounded(r.delayMs, 0, 0, 10000)),
  };
  if (r.phase !== undefined || ["pulse", "spin", "move"].includes(kind)) result.phase = motionPhase({kind, phase:r.phase as SceneMotionPhase});
  if (easing.includes(String(r.easing))) result.easing = r.easing as SceneMotionEasing;
  if (typeof r.order === "number" && Number.isFinite(r.order)) result.order = bounded(r.order, 0, 0, 1_000_000);
  if (kind === "move") {
    const points = Array.isArray(r.path) && r.path.length >= 2 && r.path.length <= 24 ? r.path : [{x:0,y:0},{x:160,y:0}];
    result.path = points.map((p, index) => {
      const point = record(p);
      return index === 0 ? {x:0,y:0} : {x:bounded(point.x,0,-1280,1280),y:bounded(point.y,0,-960,960)};
    });
  }
  return result;
}
/** Arrays are authoritative, including an empty array. Legacy motion remains readable. */
export function objectMotions(object: { motion?: SceneMotion; animations?: SceneMotion[] }): SceneMotion[] {
  return object.animations !== undefined ? object.animations : object.motion ? [object.motion] : [];
}
