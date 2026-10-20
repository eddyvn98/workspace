/** Insets are fractions of the original source/destination frame, not CSS or raw XML. */
export type SceneImageInsets = { left: number; top: number; right: number; bottom: number };
export type SceneImageRect = { x: number; y: number; w: number; h: number };
export const EMPTY_IMAGE_INSETS: Readonly<SceneImageInsets> = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });
const keys = ["left", "top", "right", "bottom"] as const;
export function normalizeSceneImageInsets(input: unknown): SceneImageInsets | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const raw = input as Record<string, unknown>;
  if (keys.some(key => typeof raw[key] !== "number" || !Number.isFinite(raw[key]) || (raw[key] as number) < 0 || (raw[key] as number) >= 1)) return;
  const result = Object.fromEntries(keys.map(key => [key, raw[key]])) as SceneImageInsets;
  // Bound magnification and avoid rounding a zero-sized crop into DrawingML.
  if (result.left + result.right > 0.9999 || result.top + result.bottom > 0.9999) return;
  return result;
}
export function imageInsetsRect(frame: SceneImageRect, value: SceneImageInsets = EMPTY_IMAGE_INSETS): SceneImageRect {
  return { x: frame.x + frame.w * value.left, y: frame.y + frame.h * value.top,
    w: frame.w * (1 - value.left - value.right), h: frame.h * (1 - value.top - value.bottom) };
}
/** Draw the uncropped image, then clip to destination. This exactly represents a:srcRect/a:fillRect. */
export function exactSceneImagePlacement(frame: SceneImageRect, source: SceneImageInsets = EMPTY_IMAGE_INSETS, destination: SceneImageInsets = EMPTY_IMAGE_INSETS): { image: SceneImageRect; clip: SceneImageRect } {
  const crop = normalizeSceneImageInsets(source), viewport = normalizeSceneImageInsets(destination);
  if (!crop || !viewport || Object.values(frame).some(v => !Number.isFinite(v)) || frame.w <= 0 || frame.h <= 0) throw new Error("Invalid exact image placement.");
  const clip = imageInsetsRect(frame, viewport), w = clip.w / (1 - crop.left - crop.right), h = clip.h / (1 - crop.top - crop.bottom);
  return { image: { x: clip.x - w * crop.left, y: clip.y - h * crop.top, w, h }, clip };
}
export function imageInsetsXmlValues(value: SceneImageInsets): { l: number; t: number; r: number; b: number } {
  const normalized = normalizeSceneImageInsets(value);
  if (!normalized) throw new Error("Invalid image insets for export.");
  return { l: Math.round(normalized.left * 100000), t: Math.round(normalized.top * 100000), r: Math.round(normalized.right * 100000), b: Math.round(normalized.bottom * 100000) };
}
