"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type CanvasBlock,
  type Position,
  createBlockId,
  createDualTransform,
} from "../types/block";
import { clientToCanvasScreen, screenToCanvas } from "../utils/geometry";

export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function useShapeDrawToSize() {
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const setArmedShapeKind = useWorkspaceStore((state) => state.setArmedShapeKind);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);

  const [previewRect, setPreviewRect] = useState<PreviewRect | null>(null);

  const isDrawingRef = useRef(false);
  const startPointerRef = useRef<Position>({ x: 0, y: 0 });
  const currentPointerRef = useRef<Position>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const currentArmed = useWorkspaceStore.getState().armedShapeKind;
      if (!currentArmed || e.button !== 0 || e.defaultPrevented) return;

      const isBackground =
        e.target === e.currentTarget ||
        e.target === (e.currentTarget as HTMLElement).firstElementChild;

      if (!isBackground) return;

      isDrawingRef.current = true;
      e.preventDefault();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }

      startPointerRef.current = { x: e.clientX, y: e.clientY };
      currentPointerRef.current = { x: e.clientX, y: e.clientY };
      setPreviewRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingRef.current) return;

    currentPointerRef.current = { x: e.clientX, y: e.clientY };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isDrawingRef.current) return;

        const start = startPointerRef.current;
        const current = currentPointerRef.current;
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const w = Math.abs(current.x - start.x);
        const h = Math.abs(current.y - start.y);

        setPreviewRect({ x, y, w, h });
      });
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawingRef.current) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      isDrawingRef.current = false;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }

      const { armedShapeKind: targetArmedKind, camera, blocks } =
        useWorkspaceStore.getState();

      if (!targetArmedKind) {
        setPreviewRect(null);
        return;
      }

      const startScreen = startPointerRef.current;
      const endScreen = { x: e.clientX, y: e.clientY };
      const canvasRect = typeof e.currentTarget.getBoundingClientRect === "function"
        ? e.currentTarget.getBoundingClientRect()
        : { left: 0, top: 0 };

      const startCanvas = screenToCanvas(clientToCanvasScreen(startScreen, canvasRect), camera);
      const endCanvas = screenToCanvas(clientToCanvasScreen(endScreen, canvasRect), camera);

      const minX = Math.min(startCanvas.x, endCanvas.x);
      const minY = Math.min(startCanvas.y, endCanvas.y);
      const rawW = Math.abs(endCanvas.x - startCanvas.x);
      const rawH = Math.abs(endCanvas.y - startCanvas.y);

      const screenW = Math.abs(endScreen.x - startScreen.x);
      const screenH = Math.abs(endScreen.y - startScreen.y);

      // If drag is tiny (< 4px in screen space), treat as a click and place default 140x140 shape
      const isTiny = screenW < 4 && screenH < 4;
      const x = isTiny ? startCanvas.x : minX;
      const y = isTiny ? startCanvas.y : minY;
      const w = isTiny ? 140 : Math.max(rawW, 10);
      const h = isTiny ? 140 : Math.max(rawH, 10);

      const now = Date.now();
      const blockCount = Object.keys(blocks).length;
      const block: CanvasBlock<"shape"> = {
        id: createBlockId(),
        type: "shape",
        transform: createDualTransform({
          x,
          y,
          w,
          h,
          rotation: 0,
          zIndex: blockCount,
        }),
        data: { shapeKind: targetArmedKind },
        createdAt: now,
        updatedAt: now,
      };

      addBlock(block);
      setSelection([block.id]);
      // Matches quick-add's own new-node UX: a shape fresh off the drawing
      // gesture isn't yet a settled click target for the double-click that
      // enters text edit, so an immediate double-click there types nothing.
      // Arming edit mode here skips needing that throwaway first click.
      setPendingEditBlockId(block.id);
      setPreviewRect(null);
      setArmedShapeKind(null);
    },
    [addBlock, setSelection, setArmedShapeKind, setPendingEditBlockId]
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    previewRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
