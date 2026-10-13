"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { anchorRegistry } from "../connectors/anchorRegistry";
import { resolveTransform, type BlockDataMap, type BlockId, type CanvasBlock } from "../types/block";

export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function pointInRect(x: number, y: number, rect: SelectionRect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function selectWorkspaceBlockIds(
  blocks: Record<BlockId, CanvasBlock>,
  blockOrder: BlockId[],
  selection: SelectionRect,
  getRect: (blockId: BlockId) => DOMRect | null,
) {
  const selected: BlockId[] = [];
  const right = selection.x + selection.w;
  const bottom = selection.y + selection.h;

  for (const blockId of blockOrder) {
    const block = blocks[blockId];
    const rect = getRect(blockId);
    if (!block || !rect) continue;

    if (block.type === "path") {
      const transform = resolveTransform(block.transform, { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 });
      const points = (block.data as BlockDataMap["path"]).points;
      const allPointsInBox = points.length > 0 && points.every((point) =>
        pointInRect(
          rect.left + (point.x / Math.max(1, transform.w)) * rect.width,
          rect.top + (point.y / Math.max(1, transform.h)) * rect.height,
          selection,
        )
      );
      if (allPointsInBox) selected.push(blockId);
      continue;
    }

    // Match legacy strict overlap: touching an edge is not a hit.
    if (selection.x < rect.right && right > rect.left && selection.y < rect.bottom && bottom > rect.top) {
      selected.push(blockId);
    }
  }

  return selected;
}

export function useRubberBandSelect() {
  const setSelection = useWorkspaceStore((state) => state.setSelection);

  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  const isDraggingRef = useRef(false);
  const startPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const { dragMode } = useWorkspaceStore.getState();
    if (dragMode === "pan" && !e.ctrlKey && !e.metaKey) return;

    // Only primary (left) mouse button initiates rubber-band selection
    if (e.button !== 0 || e.defaultPrevented) return;

    // We identify background clicks via target checking (e.target === e.currentTarget
    // or the direct pan/zoom transform wrapper) rather than an enabled prop,
    // because BlockFrame components call e.stopPropagation() on pointer-down to prevent
    // bubbling, and checking the container hierarchy guarantees we only drag on open canvas.
    const isBackground =
      e.target === e.currentTarget ||
      e.target === (e.currentTarget as HTMLElement).firstElementChild;

    if (!isBackground) return;

    isDraggingRef.current = true;
    startPointerRef.current = { x: e.clientX, y: e.clientY };
    currentPointerRef.current = { x: e.clientX, y: e.clientY };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture may fail in certain environments (e.g. tests)
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    currentPointerRef.current = { x: e.clientX, y: e.clientY };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isDraggingRef.current) return;

        const start = startPointerRef.current;
        const current = currentPointerRef.current;
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const w = Math.abs(current.x - start.x);
        const h = Math.abs(current.y - start.y);

        setSelectionRect({ x, y, w, h });
      });
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      isDraggingRef.current = false;

      const start = startPointerRef.current;
      const endX = e.clientX;
      const endY = e.clientY;

      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);

      // If rectangle does not exceed 8px in either dimension, treat it as a click
      // rather than a drag — WorkspaceCanvas's onBackgroundPointerDown handles click-to-clear.
      const isDrag = w > 8 || h > 8;

      if (isDrag) {
        const { blocks: currentBlocks, blockOrder: currentBlockOrder } = useWorkspaceStore.getState();
        setSelection(selectWorkspaceBlockIds(currentBlocks, currentBlockOrder, { x, y, w, h }, (blockId) => anchorRegistry.getBlockRect(blockId)));
      }

      setSelectionRect(null);

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }
    },
    [setSelection]
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    selectionRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
