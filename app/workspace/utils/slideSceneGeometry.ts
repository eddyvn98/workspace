import type { SlideScene, SlideSceneObject } from "../types/slideScene";
import { normalizeSlideScene, scenePatchObject } from "../types/slideScene";

export type SceneAlign = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type SceneResizeHandle = "nw" | "ne" | "sw" | "se";
type Rect = Pick<SlideSceneObject, "x" | "y" | "w" | "h">;

const round = (n: number) => Math.round(n);
const snap = (n: number, grid: number) => Math.round(n / grid) * grid;

/** Snap to a consistent slide grid, keeping the scene's geometry data in pixels. */
export function snapSceneRect(rect: Rect, enabled = true, grid = 8): Rect {
  if (!enabled) return rect;
  return { x: snap(rect.x, grid), y: snap(rect.y, grid), w: Math.max(8, snap(rect.w, grid)), h: Math.max(8, snap(rect.h, grid)) };
}

export function resizeSceneRect(start: Rect, handle: SceneResizeHandle, dx: number, dy: number, preserveRatio = false): Rect {
  const east = handle.includes("e"), south = handle.includes("s");
  const minSize = 16;
  let w = Math.max(minSize, start.w + dx * (east ? 1 : -1));
  let h = Math.max(minSize, start.h + dy * (south ? 1 : -1));
  if (preserveRatio) {
    const ratio = start.w / Math.max(1, start.h);
    if (Math.abs(dx / start.w) >= Math.abs(dy / start.h)) h = Math.max(minSize, w / ratio);
    else w = Math.max(minSize, h * ratio);
  }
  return {
    x: round(east ? start.x : start.x + start.w - w),
    y: round(south ? start.y : start.y + start.h - h),
    w: round(w), h: round(h),
  };
}

export function duplicateSceneObjects(scene: SlideScene, ids: string[], idFactory: () => string): SlideScene {
  const selected = new Set(ids);
  const copies = scene.objects.filter(o => selected.has(o.id)).map(o => ({
    ...o, id: idFactory(), x: o.x + 24, y: o.y + 24,
    ...(o.motion ? { motion: { ...o.motion } } : {}),
  }));
  if (scene.objects.length + copies.length > 120) return scene;
  return { ...scene, objects: [...scene.objects, ...copies] };
}

export function alignSceneObjects(scene: SlideScene, ids: string[], direction: SceneAlign): SlideScene {
  if (scene.objects.some(o=>ids.includes(o.id)&&o.locked)) return scene;
  const selected = scene.objects.filter(o => ids.includes(o.id));
  if (!selected.length) return scene;
  const minX = Math.min(...selected.map(o => o.x));
  const minY = Math.min(...selected.map(o => o.y));
  const maxX = Math.max(...selected.map(o => o.x + o.w));
  const maxY = Math.max(...selected.map(o => o.y + o.h));
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const targets = new Map(selected.map(o => [o.id, direction === "left" ? { x: minX } :
    direction === "right" ? { x: maxX - o.w } :
    direction === "center" ? { x: centerX - o.w / 2 } :
    direction === "top" ? { y: minY } :
    direction === "bottom" ? { y: maxY - o.h } : { y: centerY - o.h / 2 }]));
  const objects = scene.objects.map(o => targets.has(o.id) ? { ...o, ...targets.get(o.id) } : o);
  return normalizeSlideScene({ ...scene, objects }, scene.height === 960 ? "4:3" : "16:9") ?? scene;
}

export function distributeSceneObjects(scene: SlideScene, ids: string[], axis: "x" | "y"): SlideScene {
  if (scene.objects.some(o=>ids.includes(o.id)&&o.locked)) return scene;
  const selected = scene.objects.filter(o => ids.includes(o.id))
    .sort((a, b) => a[axis] - b[axis]);
  if (selected.length < 3) return scene;
  const size = axis === "x" ? "w" : "h";
  const start = selected[0][axis], end = selected[selected.length - 1][axis] + selected[selected.length - 1][size];
  const used = selected.reduce((sum, o) => sum + o[size], 0);
  const gap = (end - start - used) / (selected.length - 1);
  const positions = new Map<string, number>();
  let cursor = start;
  for (const o of selected) { positions.set(o.id, round(cursor)); cursor += o[size] + gap; }
  return { ...scene, objects: scene.objects.map(o => positions.has(o.id) ? { ...o, [axis]: positions.get(o.id)! } : o) };
}

export function nudgeSceneObjects(scene: SlideScene, ids: string[], dx: number, dy: number): SlideScene {
  const selected = new Set(ids);
  const objects = scene.objects.map(o => selected.has(o.id) && !o.locked
    ? { ...o, x: o.x + dx, y: o.y + dy } : o);
  return normalizeSlideScene({ ...scene, objects }, scene.height === 960 ? "4:3" : "16:9") ?? scene;
}

export function setSceneObjectGeometry(scene: SlideScene, id: string, rect: Partial<Rect>): SlideScene {
  return scenePatchObject(scene, id, rect);
}
