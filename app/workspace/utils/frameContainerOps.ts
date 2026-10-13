import type { CanvasBlock } from "../types/block";
import { createBlockId, createDualTransform, resolveTransform } from "../types/block";
import { blockWorldAabb } from "./blockRects";

export function buildFrameContainer(blocks: Record<string, CanvasBlock>, blockIds: string[], name: string): CanvasBlock | undefined {
  const members = blockIds.filter((id) => !!blocks[id]);
  const rects = members.map((id) => blockWorldAabb(blocks, id)).filter((rect) => rect !== null);
  if (!rects.length) return;
  const left = Math.min(...rects.map((rect) => rect.x)) - 40;
  const top = Math.min(...rects.map((rect) => rect.y)) - 40;
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + 40;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + 40;
  const lowest = Math.min(0, ...Object.values(blocks).map((block) => resolveTransform(block.transform, { x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0 }).zIndex));
  const now = Date.now();
  return {
    id: createBlockId(), type: "shape", createdAt: now, updatedAt: now,
    data: { shapeKind: "rectangle", label: name, frameBlockIds: members },
    transform: createDualTransform({ x: left, y: top, w: right - left, h: bottom - top, rotation: 0, zIndex: lowest - 1 }),
    style: { backgroundColor: "transparent", borderColor: "#64748b", borderWidth: 2, borderDash: "dashed" },
  } as CanvasBlock;
}
