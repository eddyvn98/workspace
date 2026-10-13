import type { BlockId, Transform } from "../types/block";

export const DEFAULT_RESIZE_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

export type ResizeCorner = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface ResizeState {
  isResizing: boolean;
  corner: ResizeCorner;
  startX: number;
  startY: number;
  initialRotation: number;
  initialX: number;
  initialY: number;
  initialW: number;
  initialH: number;
  initialZIndex: number;
  preserveAspect: boolean;
  aspectRatio: number;
  zoomAtStart: number;
  anchoredBlocks: Array<{ id: BlockId; initialX: number; initialY: number; initialW: number; initialH: number }>;
}

export function applyAnchoredResize(
  anchoredBlocks: ResizeState["anchoredBlocks"],
  initialTable: { x: number; y: number; w: number; h: number },
  nextTable: { x: number; y: number; w: number; h: number },
  updateBlockTransform: (id: BlockId, patch: Partial<Transform>, kind: "override" | "computed") => void,
) {
  if (anchoredBlocks.length === 0) return;
  const scaleX = initialTable.w === 0 ? 1 : nextTable.w / initialTable.w;
  const scaleY = initialTable.h === 0 ? 1 : nextTable.h / initialTable.h;
  for (const anchored of anchoredBlocks) {
    updateBlockTransform(
      anchored.id,
      {
        x: nextTable.x + (anchored.initialX - initialTable.x) * scaleX,
        y: nextTable.y + (anchored.initialY - initialTable.y) * scaleY,
        w: anchored.initialW * scaleX,
        h: anchored.initialH * scaleY,
      },
      "override",
    );
  }
}

export function projectDeltaToBlockSpace(deltaX: number, deltaY: number, rotation: number) {
  if (!rotation) return { deltaX, deltaY };
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    deltaX: deltaX * cos + deltaY * sin,
    deltaY: -deltaX * sin + deltaY * cos,
  };
}
