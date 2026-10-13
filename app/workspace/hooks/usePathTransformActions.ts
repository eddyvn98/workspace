"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type BlockId,
  type CanvasBlock,
  type Position,
  type Transform,
  createBlockId,
  createDualTransform,
  resolveTransform,
} from "../types/block";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const OFFSET_DISTANCE = 24;

function cloneValue<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(data));
}

export interface UsePathTransformActionsResult {
  flipPath: (blockId: BlockId, axis: "horizontal" | "vertical") => void;
  offsetPath: (blockId: BlockId) => void;
}

/** Path-specific CAD transform actions — split out of
 *  useBlockContextMenuActions.ts (which was at the 300-line cap) since path
 *  blocks are the only type these apply to. See CONTRACTS.md §60/§61. */
export function usePathTransformActions(): UsePathTransformActionsResult {
  const flipPath = useCallback((blockId: BlockId, axis: "horizontal" | "vertical") => {
    const { blocks, updateBlock } = useWorkspaceStore.getState();
    const block = blocks[blockId];
    if (!block || block.type !== "path") return;
    const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    const data = block.data as { points: Position[] };
    const flipped = data.points.map((p) =>
      axis === "horizontal" ? { x: resolved.w - p.x, y: p.y } : { x: p.x, y: resolved.h - p.y }
    );
    updateBlock(blockId, { data: { ...block.data, points: flipped } as CanvasBlock["data"] });
  }, []);

  /** Duplicates a path block, translated perpendicular to its own dominant
   *  direction (first point → last point) by a fixed distance — a parallel
   *  copy, same as a CAD "offset" for a roughly-straight stroke. Not a true
   *  polygon-offset algorithm (out of scope, disclosed in CONTRACTS.md) —
   *  every point shifts by the same perpendicular vector, which is exact
   *  for straight lines and a reasonable approximation for gently-curved
   *  freehand strokes. */
  const offsetPath = useCallback((blockId: BlockId) => {
    const { blocks, addBlock, setSelection } = useWorkspaceStore.getState();
    const block = blocks[blockId];
    if (!block || block.type !== "path") return;
    const data = block.data as { points: Position[] };
    if (data.points.length < 2) return;

    const first = data.points[0];
    const last = data.points[data.points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector (rotate direction 90°).
    const offsetX = (-dy / length) * OFFSET_DISTANCE;
    const offsetY = (dx / length) * OFFSET_DISTANCE;

    const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    const newId = createBlockId();
    const now = Date.now();
    const newBlock: CanvasBlock = {
      id: newId,
      type: "path",
      transform: createDualTransform({ ...resolved, x: resolved.x + offsetX, y: resolved.y + offsetY }),
      data: cloneValue(block.data),
      ...(block.style ? { style: cloneValue(block.style) } : {}),
      createdAt: now,
      updatedAt: now,
    };

    addBlock(newBlock);
    setSelection([newId]);
  }, []);

  return { flipPath, offsetPath };
}

export default usePathTransformActions;
