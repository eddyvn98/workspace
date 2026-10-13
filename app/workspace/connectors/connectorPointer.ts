import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { clientToCanvasScreen, screenToCanvas } from "../utils/geometry";
import type { Position } from "../types/block";
import type { BlockId, CanvasBlock } from "../types/block";
import type { AnchorSide } from "../types/connector";
import type { CameraState } from "../types/camera";
import { blockWorldRect } from "./blockWorldRect";
import { pointOnRectSide } from "./anchorRegistry";

/** Fed to the routing helpers so their world->screen conversions collapse to
 *  identity: the connector SVG already sits inside the camera transform. */
export const IDENTITY_CAMERA: CameraState = { x: 0, y: 0, zoom: 1, activeFrameId: null };

/**
 * Connector geometry now lives in canvas coordinates (the connector SVG is
 * mounted inside the camera-transformed container), but pointer events still
 * arrive in viewport pixels. This converts one pointer sample at a time —
 * called per event rather than per connector per frame, so reading the canvas
 * rect here does not reintroduce the per-frame layout thrashing that the
 * screen-space connector layer used to cause.
 */
export function clientToWorkspaceWorld(clientPoint: Position): Position {
  const canvas = typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>('[data-workspace-canvas="true"]');
  const canvasRect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const camera = useWorkspaceStore.getState().camera;
  return screenToCanvas(clientToCanvasScreen(clientPoint, canvasRect), camera);
}

/**
 * Screen-constant sizing for interactive bits drawn inside the scaled
 * container: a 14px hit band or a 5px handle must stay 14/5 physical pixels
 * at any zoom, so its canvas-unit size is the inverse of the scale. Clamped
 * so a far-zoomed-out canvas does not blow the hit band up to absurd widths.
 */
export function screenUnits(size: number, zoom: number): number {
  return size / Math.min(Math.max(zoom, 0.2), 4);
}

export interface ConnectorDropTarget {
  blockId: BlockId;
  side: Exclude<AnchorSide, "center">;
  point: Position;
}

const ANCHOR_SIDES = new Set<Exclude<AnchorSide, "center">>(["top", "right", "bottom", "left"]);
const ANCHOR_HIT_TOLERANCE_SCREEN_PX = 14;

/**
 * Prefer the visible anchor the pointer is actually over. The forgiving
 * world-rect resolver is still the fallback for drops on a block body, but it
 * must not override a deliberate drop on one of the four anchor dots.
 */
export function resolveExplicitConnectorDropTarget(
  blocks: Record<BlockId, CanvasBlock>,
  sourceBlockId: BlockId,
  clientPoint: Position,
): ConnectorDropTarget | null {
  if (typeof document === "undefined") return null;
  if (typeof document.elementsFromPoint === "function") {
    for (const element of document.elementsFromPoint(clientPoint.x, clientPoint.y)) {
      const anchor = element.closest<HTMLElement>("[data-anchor-side]");
      const side = anchor?.getAttribute("data-anchor-side") as Exclude<AnchorSide, "center"> | null;
      const blockElement = anchor?.closest<HTMLElement>("[data-block-id]");
      const blockId = blockElement?.getAttribute("data-block-id");
      if (!anchor || !side || !ANCHOR_SIDES.has(side) || !blockId || blockId === sourceBlockId || !blocks[blockId]) continue;
      const rect = blockWorldRect(blocks, blockId);
      if (!rect) continue;
      return { blockId, side, point: pointOnRectSide(rect, side) };
    }
  }

  // The dots are intentionally hover-only, so a pointer can be over a valid
  // anchor before React has painted that dot. Keep the same explicit-side
  // semantics by resolving a small screen-space halo around each visible
  // block's four anchor points. This is only a fallback: an actual DOM dot
  // remains authoritative when elementsFromPoint can see it.
  const pointer = clientToWorkspaceWorld(clientPoint);
  const visibleBlockIds = new Set(
    Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"))
      .map((element) => element.getAttribute("data-block-id"))
      .filter((id): id is string => Boolean(id)),
  );
  const tolerance = screenUnits(
    ANCHOR_HIT_TOLERANCE_SCREEN_PX,
    useWorkspaceStore.getState().camera.zoom,
  );
  let best: { blockId: BlockId; side: Exclude<AnchorSide, "center">; point: Position; distance: number } | null = null;
  for (const blockId of Object.keys(blocks)) {
    if (blockId === sourceBlockId || !visibleBlockIds.has(blockId)) continue;
    const rect = blockWorldRect(blocks, blockId);
    if (!rect) continue;
    for (const side of ANCHOR_SIDES) {
      const anchorPoint = pointOnRectSide(rect, side);
      const distance = Math.hypot(pointer.x - anchorPoint.x, pointer.y - anchorPoint.y);
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { blockId, side, point: anchorPoint, distance };
      }
    }
  }
  return best ? { blockId: best.blockId, side: best.side, point: best.point } : null;
}

/** Resolve the same forgiving 25px node/anchor target used while dragging and
 * on release. Keeping this in canvas coordinates prevents a zoomed board from
 * previewing one anchor and committing another. */
export function resolveConnectorDropTarget(
  blocks: Record<BlockId, CanvasBlock>,
  sourceBlockId: BlockId,
  point: Position,
): ConnectorDropTarget | null {
  let best: { blockId: BlockId; rect: DOMRect; distance: number } | null = null;
  for (const blockId of Object.keys(blocks)) {
    if (blockId === sourceBlockId) continue;
    const rect = blockWorldRect(blocks, blockId);
    if (!rect) continue;
    const within = point.x >= rect.left - 25 && point.x <= rect.right + 25
      && point.y >= rect.top - 25 && point.y <= rect.bottom + 25;
    if (!within) continue;
    const distance = Math.hypot(point.x - (rect.left + rect.width / 2), point.y - (rect.top + rect.height / 2));
    if (!best || distance < best.distance) best = { blockId, rect, distance };
  }
  if (!best) return null;

  const dx = (point.x - (best.rect.left + best.rect.width / 2)) / Math.max(1, best.rect.width / 2);
  const dy = (point.y - (best.rect.top + best.rect.height / 2)) / Math.max(1, best.rect.height / 2);
  const side: Exclude<AnchorSide, "center"> = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? "right" : "left")
    : (dy >= 0 ? "bottom" : "top");
  return { blockId: best.blockId, side, point: pointOnRectSide(best.rect, side) };
}
