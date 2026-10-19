/**
 * Slide Scene V2: editor-neutral, normalized coordinates (1280px wide).
 * Stored beside legacy html so old decks keep rendering without migration loss.
 */
export type SceneObjectKind = "text" | "shape" | "image" | "chart";
export type SceneMotionKind = "none" | "fade" | "rise" | "slide" | "zoom" | "wipe";
export type SceneMotionTrigger = "with-previous" | "after-previous" | "on-click";
export interface SceneMotion {
  kind: SceneMotionKind;
  trigger: SceneMotionTrigger;
  durationMs: number;
  delayMs: number;
}
export interface SlideSceneObject {
  id: string;
  kind: SceneObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text?: string;
  src?: string;
  /** Editable numeric series rendered as a chart in web and exported as a native PPTX chart. */
  series?: Array<{ label: string; value: number }>;
  fill?: string;
  stroke?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  radius?: number;
  opacity?: number;
  locked?: boolean;
  /** Logical editor group; grouped objects remain independent PPTX shapes. */
  groupId?: string;
  motion?: SceneMotion;
}
export interface SlideScene {
  version: 2;
  width: number;
  height: number;
  objects: SlideSceneObject[];
}
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const color = (v: unknown, fallback: string) => typeof v === "string" && (/^#[0-9a-f]{3,8}$/i.test(v) || /^(?:rgb|rgba|hsl|hsla)\([\d\s,%.+-]+\)$/i.test(v) || /^[a-z]{2,20}$/i.test(v)) ? v : fallback;
const motionKinds: SceneMotionKind[] = ["none", "fade", "rise", "slide", "zoom", "wipe"];
const triggers: SceneMotionTrigger[] = ["with-previous", "after-previous", "on-click"];
export const slideSceneRatio = (ratio: "16:9" | "4:3" = "16:9") => ({ width: 1280, height: ratio === "4:3" ? 960 : 720 });
export function emptySlideScene(ratio: "16:9" | "4:3" = "16:9"): SlideScene {
  return { version: 2, ...slideSceneRatio(ratio), objects: [] };
}
export function normalizeSceneMotion(input: unknown): SceneMotion | undefined {
  if (input == null) return undefined;
  const r = record(input);
  return {
    kind: motionKinds.includes(r.kind as SceneMotionKind) ? r.kind as SceneMotionKind : "none",
    trigger: triggers.includes(r.trigger as SceneMotionTrigger) ? r.trigger as SceneMotionTrigger : "with-previous",
    durationMs: num(r.durationMs, 450, 100, 5000),
    delayMs: num(r.delayMs, 0, 0, 10000),
  };
}
export function normalizeSlideScene(input: unknown, ratio: "16:9" | "4:3" = "16:9"): SlideScene | undefined {
  if (input === undefined || input === null) return undefined;
  const r = record(input);
  const size = slideSceneRatio(ratio);
  if (r.version !== 2 || !Array.isArray(r.objects) || r.objects.length > 120) return undefined;
  const seen = new Set<string>();
  const objects: SlideSceneObject[] = [];
  for (const [index, value] of r.objects.entries()) {
    const obj = record(value);
    if (!["text", "shape", "image", "chart"].includes(String(obj.kind))) return undefined;
    const id = typeof obj.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(obj.id) ? obj.id : `object-${index}`;
    if (seen.has(id)) return undefined;
    seen.add(id);
    const kind = obj.kind as SceneObjectKind;
    const src = typeof obj.src === "string" && obj.src.length < 2048 &&
      /^(https?:\/\/|\/(?!\/))/i.test(obj.src) && !/[\\\u0000-\u001f]/.test(obj.src) ? obj.src : undefined;
    if (kind === "image" && !src) return undefined;
    const rawSeries = obj.series;
    const series = kind === "chart" && Array.isArray(rawSeries) && rawSeries.length >= 1 && rawSeries.length <= 24
      ? rawSeries.map(value => { const entry = record(value); return {label: String(entry.label ?? "").slice(0,80), value: entry.value}; }) : undefined;
    if (kind === "chart" && (!series || series.some(entry => !entry.label || typeof entry.value !== "number" || !Number.isFinite(entry.value) || entry.value < 0 || entry.value > 1e9))) return undefined;
    objects.push({
      id, kind,
      x: num(obj.x, 100, -1280, 2560), y: num(obj.y, 100, -960, 1920),
      w: num(obj.w, 420, 8, 2560), h: num(obj.h, 130, 8, 1920),
      rotation: num(obj.rotation, 0, -360, 360),
      ...(kind === "text" ? { text: String(obj.text ?? "").slice(0, 10000) } : {}),
      ...(src && kind === "image" ? { src } : {}),
      ...(series && kind === "chart" ? { series: series as Array<{label:string;value:number}> } : {}),
      fill: color(obj.fill, kind === "shape" ? "#4f46e5" : "transparent"),
      stroke: color(obj.stroke, "transparent"),
      color: color(obj.color, "#0f172a"),
      fontSize: num(obj.fontSize, 44, 8, 180),
      fontFamily: typeof obj.fontFamily === "string" && /^[\w\s,'"-]{1,100}$/.test(obj.fontFamily) ? obj.fontFamily : "Arial",
      fontWeight: obj.fontWeight === "bold" ? "bold" : "normal",
      align: ["left","center","right"].includes(String(obj.align)) ? obj.align as SlideSceneObject["align"] : "left",
      radius: num(obj.radius, 0, 0, 200),
      opacity: num(obj.opacity, 1, 0, 1),
      locked: obj.locked === true,
      ...(typeof obj.groupId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(obj.groupId) ? {groupId:obj.groupId} : {}),
      ...(obj.motion != null ? { motion: normalizeSceneMotion(obj.motion) } : {}),
    });
  }
  return { version: 2, ...size, objects };
}
export function sceneObject(kind: SceneObjectKind, x = 100, y = 100): SlideSceneObject {
  const common = { id: crypto.randomUUID(), kind, x, y, w: 480, h: 140, rotation: 0, opacity: 1 };
  if (kind === "text") return { ...common, text: "Edit this text", fontSize: 48, fontWeight: "bold", color: "#0f172a", fontFamily: "Arial" };
  if (kind === "shape") return { ...common, w: 340, h: 220, fill: "#4f46e5", radius: 24 };
  if (kind === "chart") return { ...common, w: 680, h: 400, fill: "#4f46e5", color: "#0f172a", series: [{label:"Q1",value:24},{label:"Q2",value:38},{label:"Q3",value:31}] };
  return { ...common, src: "", w: 460, h: 280 };
}
export function scenePatchObject(scene: SlideScene, id: string, patch: Partial<SlideSceneObject>): SlideScene {
  const objects = scene.objects.map(o => o.id === id ? { ...o, ...patch, id: o.id, kind: o.kind } : o);
  return normalizeSlideScene({ ...scene, objects }, scene.height === 960 ? "4:3" : "16:9") ?? scene;
}
export function sceneDeleteObject(scene: SlideScene, id: string): SlideScene {
  return { ...scene, objects: scene.objects.filter(o => o.id !== id) };
}
export function sceneMoveObject(scene: SlideScene, id: string, direction: -1 | 1): SlideScene {
  const objects = [...scene.objects], index = objects.findIndex(o => o.id === id), next = index + direction;
  if (index < 0 || next < 0 || next >= objects.length) return scene;
  [objects[index], objects[next]] = [objects[next], objects[index]];
  return { ...scene, objects };
}
