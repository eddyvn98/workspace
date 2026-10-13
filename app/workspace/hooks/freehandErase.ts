import type { CanvasBlock, Position } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { screenToCanvas } from "../utils/geometry";
import { pathIntersectsPoint } from "../utils/freehandShapePoints";
import { resolveTransform } from "../types/block";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 0, h: 0, rotation: 0, zIndex: 0 };

export function eraseAtPoint(screenPt: Position, canvasOrigin: Position): void {
  const { camera, blocks, removeBlock } = useWorkspaceStore.getState();
  const worldPt = screenToCanvas({ x: screenPt.x - canvasOrigin.x, y: screenPt.y - canvasOrigin.y }, camera);
  const eraserRadius = 24 / camera.zoom;

  for (const block of Object.values(blocks)) {
    if (block.type !== "path") continue;
    const pathBlock = block as CanvasBlock<"path">;
    const transform = resolveTransform(pathBlock.transform, DEFAULT_TRANSFORM);
    const minX = transform.x - eraserRadius;
    const maxX = transform.x + transform.w + eraserRadius;
    const minY = transform.y - eraserRadius;
    const maxY = transform.y + transform.h + eraserRadius;
    if (worldPt.x < minX || worldPt.x > maxX || worldPt.y < minY || worldPt.y > maxY) continue;

    const localPt: Position = { x: worldPt.x - transform.x, y: worldPt.y - transform.y };
    const strokeWidth = pathBlock.data?.strokeWidth ?? 2;
    if (pathIntersectsPoint(pathBlock.data?.points ?? [], localPt, eraserRadius + strokeWidth / 2)) {
      removeBlock(pathBlock.id);
    }
  }
}
