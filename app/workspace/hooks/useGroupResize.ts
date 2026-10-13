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

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

interface CapturedBlock {
  id: BlockId;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GroupResizeState {
  corner: ResizeCorner;
  startClientX: number;
  startClientY: number;
  groupBboxScreen: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  originX: number;
  originY: number;
  blocks: CapturedBlock[];
}

export function useGroupResize() {
  const resizeStateRef = useRef<GroupResizeState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startGroupResize = useCallback(
    (corner: ResizeCorner) => (e: React.PointerEvent<HTMLElement>) => {
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
          };
        })
        .filter((b): b is CapturedBlock => b !== null);

      if (capturedBlocks.length < 2) return;

      const groupMinCanvasX = Math.min(...capturedBlocks.map((b) => b.x));
      const groupMinCanvasY = Math.min(...capturedBlocks.map((b) => b.y));
      const groupMaxCanvasX = Math.max(...capturedBlocks.map((b) => b.x + b.w));
      const groupMaxCanvasY = Math.max(...capturedBlocks.map((b) => b.y + b.h));

      let originX = groupMinCanvasX;
      let originY = groupMinCanvasY;

      switch (corner) {
        case "nw":
          originX = groupMaxCanvasX;
          originY = groupMaxCanvasY;
          break;
        case "ne":
          originX = groupMinCanvasX;
          originY = groupMaxCanvasY;
          break;
        case "sw":
          originX = groupMaxCanvasX;
          originY = groupMinCanvasY;
          break;
        case "se":
        default:
          originX = groupMinCanvasX;
          originY = groupMinCanvasY;
          break;
      }

      const originalWidth = maxX - minX;
      const originalHeight = maxY - minY;

      resizeStateRef.current = {
        corner,
        startClientX: e.clientX,
        startClientY: e.clientY,
        groupBboxScreen: {
          left: minX,
          top: minY,
          right: maxX,
          bottom: maxY,
          width: originalWidth,
          height: originalHeight,
        },
        originX,
        originY,
        blocks: capturedBlocks,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!resizeStateRef.current) return;

        const {
          corner: activeCorner,
          startClientX,
          startClientY,
          groupBboxScreen,
          originX: scaleOriginX,
          originY: scaleOriginY,
          blocks: blocksToScale,
        } = resizeStateRef.current;

        const deltaX = moveEvent.clientX - startClientX;
        const deltaY = moveEvent.clientY - startClientY;

        let newWidth = groupBboxScreen.width;
        let newHeight = groupBboxScreen.height;

        switch (activeCorner) {
          case "nw":
            newWidth = Math.max(40, groupBboxScreen.width - deltaX);
            newHeight = Math.max(30, groupBboxScreen.height - deltaY);
            break;
          case "ne":
            newWidth = Math.max(40, groupBboxScreen.width + deltaX);
            newHeight = Math.max(30, groupBboxScreen.height - deltaY);
            break;
          case "sw":
            newWidth = Math.max(40, groupBboxScreen.width - deltaX);
            newHeight = Math.max(30, groupBboxScreen.height + deltaY);
            break;
          case "se":
            newWidth = Math.max(40, groupBboxScreen.width + deltaX);
            newHeight = Math.max(30, groupBboxScreen.height + deltaY);
            break;
        }

        const scaleX = groupBboxScreen.width > 0 ? newWidth / groupBboxScreen.width : 1;
        const scaleY = groupBboxScreen.height > 0 ? newHeight / groupBboxScreen.height : 1;

        const updateTransform = useWorkspaceStore.getState().updateBlockTransform;

        for (const blk of blocksToScale) {
          const newX = scaleOriginX + (blk.x - scaleOriginX) * scaleX;
          const newY = scaleOriginY + (blk.y - scaleOriginY) * scaleY;
          const newW = Math.max(20, blk.w * scaleX);
          const newH = Math.max(20, blk.h * scaleY);

          updateTransform(
            blk.id,
            { x: newX, y: newY, w: newW, h: newH },
            "override"
          );
        }
      };

      const onPointerUp = () => {
        resizeStateRef.current = null;
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
    },
    []
  );

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      resizeStateRef.current = null;
    };
  }, []);

  return {
    startGroupResize,
  };
}
