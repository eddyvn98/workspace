import { blockWorldRect } from "../connectors/blockWorldRect";
import { resolveTransform, type CanvasBlock } from "../types/block";
import { canvasToScreen } from "./geometry";
import type { CameraState } from "../types/camera";

const FALLBACK_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export interface CanvasOrigin {
  left: number;
  top: number;
}

/**
 * Viewport offset of the canvas container. The container itself is never
 * camera-transformed — only its children are — so this stays exact during a
 * pan or zoom and only has to be re-read when the surrounding layout changes
 * (sidebar toggle, window resize).
 */
export function workspaceCanvasOrigin(): CanvasOrigin {
  const element = typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>('[data-workspace-canvas="true"]');
  if (!element) return { left: 0, top: 0 };
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

/** Axis-aligned box of a rotated rect — what getBoundingClientRect() reports
 *  for a rotated element, reproduced from the transform instead of measured. */
function rotatedAabb(rect: DOMRect, rotation: number): DOMRect {
  if (!rotation) return rect;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = rect.width * cos + rect.height * sin;
  const height = rect.width * sin + rect.height * cos;
  return new DOMRect(
    rect.x + (rect.width - width) / 2,
    rect.y + (rect.height - height) / 2,
    width,
    height,
  );
}

/** A block's canvas-space box including any rotation it renders with. */
export function blockWorldAabb(
  blocks: Record<string, CanvasBlock>,
  blockId: string,
): DOMRect | null {
  const rect = blockWorldRect(blocks, blockId);
  if (!rect) return null;
  const block = blocks[blockId];
  const rotation = block ? resolveTransform(block.transform, FALLBACK_TRANSFORM).rotation ?? 0 : 0;
  return rotatedAabb(rect, rotation);
}

/**
 * A block's box in viewport pixels, projected from its canvas transform
 * rather than measured off the DOM.
 *
 * getBoundingClientRect() answers from the last committed frame, so an
 * overlay that positions itself from it trails the camera by one frame for
 * the whole duration of a wheel zoom — the same defect that used to make
 * connectors lag their nodes. Block frames are sized in explicit pixels from
 * their transform, so projecting through the current camera reproduces the
 * measured rect exactly, one frame earlier, and without a layout read per
 * block.
 */
export function blockScreenRect(
  blocks: Record<string, CanvasBlock>,
  blockId: string,
  camera: Pick<CameraState, "x" | "y" | "zoom">,
  origin: CanvasOrigin,
): DOMRect | null {
  const world = blockWorldAabb(blocks, blockId);
  if (!world) return null;
  const topLeft = canvasToScreen({ x: world.x, y: world.y }, camera);
  return new DOMRect(
    origin.left + topLeft.x,
    origin.top + topLeft.y,
    world.width * camera.zoom,
    world.height * camera.zoom,
  );
}

/** Bounding box of a multi-block selection in viewport pixels. Returns null
 *  when any member is unresolvable, matching the all-or-nothing behaviour the
 *  selection overlays already had. */
export function selectionScreenBounds(
  blocks: Record<string, CanvasBlock>,
  blockIds: string[],
  camera: Pick<CameraState, "x" | "y" | "zoom">,
  origin: CanvasOrigin,
): DOMRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of blockIds) {
    const rect = blockScreenRect(blocks, id, camera, origin);
    if (!rect) return null;
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }

  if (minX === Infinity) return null;
  return new DOMRect(minX, minY, maxX - minX, maxY - minY);
}
