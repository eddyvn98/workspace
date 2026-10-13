import { resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";
import type { CameraState } from "../types/camera";
import { canvasToScreen } from "../utils/geometry";
import { getGridSnapEnabled } from "../hooks/useGridSnapToggle";
import { DEFAULT_DRAG_TRANSFORM, GRID_SIZE, SNAP_BACK_DURATION_MS, type TrackedBlock } from "../hooks/blockDragTypes";
import type { SnapGuide } from "../hooks/useSnapGuides";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

const SNAP_THRESHOLD = 6;

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function findSnapPosition(candidate: number, size: number, targets: number[]): number {
  let minDiff = 0;
  let minDistance = Infinity;
  const candidateEdges = [candidate, candidate + size / 2, candidate + size];

  for (const target of targets) {
    for (const edge of candidateEdges) {
      const diff = target - edge;
      const distance = Math.abs(diff);
      if (distance <= SNAP_THRESHOLD && distance < minDistance) {
        minDistance = distance;
        minDiff = diff;
      }
    }
  }

  return minDistance <= SNAP_THRESHOLD ? candidate + minDiff : candidate;
}

export interface SingleBlockDragResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

/** Single-dragged-block snap-to-sibling-edge + grid-snap math, extracted out
 *  of useBlockDrag.ts's onPointerMove purely to keep that file under the
 *  project's 300-line cap. */
export function computeSingleBlockSnap(
  candidateX: number,
  candidateY: number,
  currentTransform: { w: number; h: number },
  draggedId: BlockId,
  allBlocks: Record<BlockId, CanvasBlock>,
  camera: CameraState,
): SingleBlockDragResult {
  const targetXs: number[] = [];
  const targetYs: number[] = [];
  for (const otherId in allBlocks) {
    if (otherId === draggedId) continue;
    const otherBlock = allBlocks[otherId];
    if (!otherBlock) continue;
    const otherTransform = resolveTransform(otherBlock.transform, DEFAULT_DRAG_TRANSFORM);
    targetXs.push(otherTransform.x, otherTransform.x + otherTransform.w / 2, otherTransform.x + otherTransform.w);
    targetYs.push(otherTransform.y, otherTransform.y + otherTransform.h / 2, otherTransform.y + otherTransform.h);
  }

  let snappedX = findSnapPosition(candidateX, currentTransform.w, targetXs);
  let snappedY = findSnapPosition(candidateY, currentTransform.h, targetYs);

  const guides: SnapGuide[] = [];
  if (snappedX !== candidateX) {
    const matchX = targetXs.find((t) =>
      [snappedX, snappedX + currentTransform.w / 2, snappedX + currentTransform.w].some(
        (edge) => Math.abs(t - edge) < 0.001
      )
    ) ?? snappedX;
    guides.push({ type: "vertical", position: canvasToScreen({ x: matchX, y: 0 }, camera).x });
  }

  if (snappedY !== candidateY) {
    const matchY = targetYs.find((t) =>
      [snappedY, snappedY + currentTransform.h / 2, snappedY + currentTransform.h].some(
        (edge) => Math.abs(t - edge) < 0.001
      )
    ) ?? snappedY;
    guides.push({ type: "horizontal", position: canvasToScreen({ x: 0, y: matchY }, camera).y });
  }

  if (getGridSnapEnabled()) {
    snappedX = Math.round(snappedX / GRID_SIZE) * GRID_SIZE;
    snappedY = Math.round(snappedY / GRID_SIZE) * GRID_SIZE;
  }

  return { x: snappedX, y: snappedY, guides };
}

/** Eases every tracked block back to its pre-drag position — the "dropped
 *  within the detach buffer, but not over a valid reparent target" outcome.
 *  Extracted out of useBlockDrag.ts's onPointerUp purely to keep that file
 *  under the project's 300-line cap. `rafRef` is kept pointing at whichever
 *  frame is currently pending so the caller can still cancel it (e.g. a new
 *  drag starting mid-animation); it's set back to null once the animation
 *  finishes on its own. */
export function runSnapBackAnimation(
  trackedBlocks: TrackedBlock[],
  updateBlockTransform: (id: BlockId, patch: Partial<Transform>, mode: "override") => void,
  rafRef: { current: number | null },
): void {
  const start = performance.now();
  const startPositions = trackedBlocks.map((t) => {
    const b = useWorkspaceStore.getState().blocks[t.id];
    const curTransform = b ? resolveTransform(b.transform, DEFAULT_DRAG_TRANSFORM) : DEFAULT_DRAG_TRANSFORM;
    return { id: t.id, fromX: curTransform.x, fromY: curTransform.y, toX: t.initialX, toY: t.initialY };
  });

  const tick = (now: number) => {
    const elapsed = now - start;
    const t = Math.min(1, Math.max(0, elapsed / SNAP_BACK_DURATION_MS));
    const eased = easeOutBack(t);

    for (const item of startPositions) {
      updateBlockTransform(
        item.id,
        {
          x: t >= 1 ? item.toX : item.fromX + (item.toX - item.fromX) * eased,
          y: t >= 1 ? item.toY : item.fromY + (item.toY - item.fromY) * eased,
        },
        "override"
      );
    }

    rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
  };

  if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(tick);
}
