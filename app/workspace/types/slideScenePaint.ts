/** Portable paint data; never raw CSS, SVG, filters or executable markup. */
import { normalizeSceneShape, type SceneShapeFields, type SceneShapeKind } from "./slideSceneShape";
import { normalizeSceneImageInsets, type SceneImageInsets } from "./slideSceneImageCrop";
export type SceneGradientStop = { offset: number; color: string; opacity: number };
/** Angle is clockwise from the positive X axis, in scene coordinates. */
export type SceneGradient = { kind: "linear"; angle: number; stops: SceneGradientStop[] };
export type SceneShadow = { color: string; opacity: number; blur: number; x: number; y: number };
export type SceneImageMask = SceneShapeFields & { radius?: number };
export type ScenePaintFields = {
  gradient?: SceneGradient; shadow?: SceneShadow; imageMask?: SceneImageMask;
  /** Exact source crop/destination padding override automatic imageFit/focus while present. */
  imageCrop?: SceneImageInsets; imageViewport?: SceneImageInsets;
};
export const SCENE_IMAGE_MASKS: readonly SceneShapeKind[] = ["rect", "roundRect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star5", "heart", "custom"];
const record = (v: unknown): Record<string, unknown> | undefined => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const finite = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const hex = (v: unknown): v is string => typeof v === "string" && /^#[a-f0-9]{6}$/i.test(v);
export function normalizeSceneGradient(input: unknown): SceneGradient | undefined {
  const r = record(input);
  if (!r || r.kind !== "linear" || !finite(r.angle, -360, 360) || !Array.isArray(r.stops) || r.stops.length < 2 || r.stops.length > 12) return;
  const stops: SceneGradientStop[] = [];
  for (const value of r.stops) {
    const s = record(value);
    if (!s || !finite(s.offset, 0, 1) || !hex(s.color) || s.opacity !== undefined && !finite(s.opacity, 0, 1)) return;
    stops.push({ offset: s.offset, color: s.color.toUpperCase(), opacity: s.opacity as number ?? 1 });
  }
  stops.sort((a, b) => a.offset - b.offset);
  return { kind: "linear", angle: ((r.angle % 360) + 360) % 360, stops };
}
export function normalizeSceneShadow(input: unknown): SceneShadow | undefined {
  const r = record(input);
  if (!r || !hex(r.color) || !finite(r.opacity, 0, 1) || !finite(r.blur, 0, 64) || !finite(r.x, -256, 256) || !finite(r.y, -256, 256)) return;
  return { color: r.color.toUpperCase(), opacity: r.opacity, blur: r.blur, x: r.x, y: r.y };
}
export function normalizeSceneImageMask(input: unknown): SceneImageMask | undefined {
  const r = record(input);
  if (!r || !SCENE_IMAGE_MASKS.includes(r.shapeKind as SceneShapeKind)) return;
  const shape = normalizeSceneShape({ ...r, strokeWidth: 0, strokeDash: "solid" });
  if (!shape || r.radius !== undefined && !finite(r.radius, 0, 200)) return;
  return { ...shape, radius: r.radius as number ?? (shape.shapeKind === "roundRect" ? 24 : 0) };
}
/** undefined means invalid fields; an empty object means no visual effects. */
export function normalizeScenePaint(kind: string, raw: Record<string, unknown>): ScenePaintFields | undefined {
  const result: ScenePaintFields = {};
  if (raw.gradient !== undefined) {
    if (kind !== "shape") return;
    const gradient = normalizeSceneGradient(raw.gradient); if (!gradient) return; result.gradient = gradient;
  }
  if (raw.shadow !== undefined) {
    if (!["text", "shape", "image"].includes(kind)) return;
    const shadow = normalizeSceneShadow(raw.shadow); if (!shadow) return; result.shadow = shadow;
  }
  if (raw.imageMask !== undefined) {
    if (kind !== "image") return;
    const imageMask = normalizeSceneImageMask(raw.imageMask); if (!imageMask) return; result.imageMask = imageMask;
  }
  for (const key of ["imageCrop", "imageViewport"] as const) {
    if (raw[key] === undefined) continue;
    if (kind !== "image") return;
    const value = normalizeSceneImageInsets(raw[key]); if (!value) return; result[key] = value;
  }
  return result;
}
export function defaultSceneGradient(): SceneGradient {
  return { kind: "linear", angle: 35, stops: [{ offset: 0, color: "#2563EB", opacity: 1 }, { offset: 1, color: "#9333EA", opacity: 1 }] };
}
export function defaultSceneShadow(): SceneShadow { return { color: "#000000", opacity: 0.25, blur: 12, x: 4, y: 6 }; }
/** Length covers the projection of the shape's corners, including nonsquare boxes. */
export function sceneGradientLine(width: number, height: number, angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = angle * Math.PI / 180, x = Math.cos(radians), y = Math.sin(radians);
  const length = Math.abs(width * x) + Math.abs(height * y);
  return { x1: width / 2 - x * length / 2, y1: height / 2 - y * length / 2, x2: width / 2 + x * length / 2, y2: height / 2 + y * length / 2 };
}
export function sceneShadowCss(shadow: SceneShadow | undefined, sceneWidth: number): string | undefined {
  if (!shadow) return;
  const unit = (n: number) => `${n / sceneWidth * 100}cqw`;
  const rgb = [1, 3, 5].map(i => parseInt(shadow.color.slice(i, i + 2), 16)).join(",");
  return `drop-shadow(${unit(shadow.x)} ${unit(shadow.y)} ${unit(shadow.blur / 2)} rgba(${rgb},${shadow.opacity}))`;
}
