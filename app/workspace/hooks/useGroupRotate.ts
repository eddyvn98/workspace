"use client";

import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import type { BlockId, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { anchorRegistry } from "../connectors/anchorRegistry";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

interface CapturedBlock {
  id: BlockId;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export function useGroupRotate() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const startGroupRotate = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const state = useWorkspaceStore.getState();
    const selectedBlockIds = state.selectedBlockIds;
    if (selectedBlockIds.length < 2) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of selectedBlockIds) {
      const rect = anchorRegistry.getBlockRect(id);
      if (!rect) return;
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    }

    if (minX === Infinity || maxX <= minX || maxY <= minY) return;

    const screenPivot = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    const capturedBlocks: CapturedBlock[] = selectedBlockIds
      .map((id) => {
        const block = state.blocks[id];
        if (!block) return null;
        const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        return {
          id,
          x: transform.x,
          y: transform.y,
          w: transform.w,
          h: transform.h,
          rotation: transform.rotation,
        };
      })
      .filter((b): b is CapturedBlock => b !== null);

    if (capturedBlocks.length < 2) return;

    const groupMinCanvasX = Math.min(...capturedBlocks.map((b) => b.x));
    const groupMinCanvasY = Math.min(...capturedBlocks.map((b) => b.y));
    const groupMaxCanvasX = Math.max(...capturedBlocks.map((b) => b.x + b.w));
    const groupMaxCanvasY = Math.max(...capturedBlocks.map((b) => b.y + b.h));

    const pivotX = (groupMinCanvasX + groupMaxCanvasX) / 2;
    const pivotY = (groupMinCanvasY + groupMaxCanvasY) / 2;

    const startAngleDeg =
      (Math.atan2(e.clientY - screenPivot.y, e.clientX - screenPivot.x) * 180) / Math.PI;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentAngleDeg =
        (Math.atan2(moveEvent.clientY - screenPivot.y, moveEvent.clientX - screenPivot.x) * 180) /
        Math.PI;
      const deltaDeg = currentAngleDeg - startAngleDeg;
      const deltaRad = (deltaDeg * Math.PI) / 180;
      const cos = Math.cos(deltaRad);
      const sin = Math.sin(deltaRad);

      const updateTransform = useWorkspaceStore.getState().updateBlockTransform;

      for (const blk of capturedBlocks) {
        const bcx = blk.x + blk.w / 2;
        const bcy = blk.y + blk.h / 2;
        const dx = bcx - pivotX;
        const dy = bcy - pivotY;

        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;

        const newCenterX = pivotX + rotatedX;
        const newCenterY = pivotY + rotatedY;

        const newX = newCenterX - blk.w / 2;
        const newY = newCenterY - blk.h / 2;
        const newRotation = blk.rotation + deltaDeg;

        updateTransform(blk.id, { x: newX, y: newY, rotation: newRotation }, "override");
      }
    };

    const onPointerUp = () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    if (cleanupRef.current) {
      cleanupRef.current();
    }
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return {
    startGroupRotate,
  };
}
