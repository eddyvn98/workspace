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
import { generateShapePoints, isShapeTool } from "../utils/freehandShapePoints";
import { findSnapPoint, snapAngle } from "../utils/freehandSnap";
import { createPathBlockFromScreenPoints } from "../utils/createPathBlock";
import { eraseAtPoint } from "./freehandErase";
import { useWorkspaceDragAutoPan } from "./useWorkspaceDragAutoPan";

export function useFreehandDraw() {
  const isDrawMode = useWorkspaceStore((state) => state.isDrawMode);
  const setIsDrawMode = useWorkspaceStore((state) => state.setIsDrawMode);

  const [drawPoints, setDrawPoints] = useState<Position[] | null>(null);
  const [snapPoint, setSnapPoint] = useState<Position | null>(null);

  const isDrawingRef = useRef(false);
  const pointsRef = useRef<Position[]>([]);
  const rafIdRef = useRef<number | null>(null);
  /** Committed points for polyline's click-to-chain mode — null
   *  when not chaining. See CONTRACTS.md §62 (polyline chaining). */
  const chainPointsRef = useRef<Position[] | null>(null);
  const canvasOriginRef = useRef<Position>({ x: 0, y: 0 });
  const autoPan = useWorkspaceDragAutoPan((dx, dy) => {
    const shift = (point: Position): Position => ({ x: point.x + dx, y: point.y + dy });
    pointsRef.current = pointsRef.current.map(shift);
    if (chainPointsRef.current) chainPointsRef.current = chainPointsRef.current.map(shift);
  });

  const finalizeChain = useCallback(() => {
    const points = chainPointsRef.current;
    chainPointsRef.current = null;
    setDrawPoints(null);
    setSnapPoint(null);
    autoPan.stop();
    if (points && points.length >= 2) {
      const tool = useWorkspaceStore.getState().activeFreehandTool;
      createPathBlockFromScreenPoints(points, tool === "polyline" ? "polyline" : "cad_line", canvasOriginRef.current);
    }
  }, [autoPan]);

  const cancelChain = useCallback(() => {
    chainPointsRef.current = null;
    setDrawPoints(null);
    setSnapPoint(null);
    autoPan.stop();
  }, [autoPan]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawMode || e.button !== 0) return;

      const { activeFreehandTool } = useWorkspaceStore.getState();
      const rawInitialPoint: Position = { x: e.clientX, y: e.clientY };
      const canvasRect = typeof e.currentTarget.getBoundingClientRect === "function"
        ? e.currentTarget.getBoundingClientRect()
        : { left: 0, top: 0 };
      canvasOriginRef.current = { x: canvasRect.left, y: canvasRect.top };

      if (activeFreehandTool === "eraser") {
        e.preventDefault();
        isDrawingRef.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture may fail in certain environments (e.g. tests)
        }
        eraseAtPoint(rawInitialPoint, canvasOriginRef.current);
        autoPan.reportPointer(e.clientX, e.clientY);
        setDrawPoints(null);
        pointsRef.current = [];
        return;
      }

      if (e.defaultPrevented) return;

      const isBackground =
        e.target === e.currentTarget ||
        e.target === (e.currentTarget as HTMLElement).firstElementChild;

      if (!isBackground) return;

      const { blockOrder } = useWorkspaceStore.getState();

      if (activeFreehandTool === "text") {
        e.preventDefault();
        const { camera, blocks, addBlock: addTextBlock, setSelection, setPendingEditBlockId } =
          useWorkspaceStore.getState();
        const canvasPt = screenToCanvas(clientToCanvasScreen(rawInitialPoint, canvasRect), camera);
        const blockCount = Object.keys(blocks).length;
        const now = Date.now();
        const textBlock: CanvasBlock<"text"> = {
          id: createBlockId(),
          type: "text",
          transform: createDualTransform({
            x: Math.round(canvasPt.x),
            y: Math.round(canvasPt.y),
            w: 180,
            h: 90,
            rotation: 0,
            zIndex: blockCount,
          }),
          data: { markdown: "" },
          createdAt: now,
          updatedAt: now,
        };
        addTextBlock(textBlock);
        setSelection([textBlock.id]);
        setPendingEditBlockId(textBlock.id);
        setIsDrawMode(false);
        return;
      }

      // polyline: click-to-chain polyline, not a drag gesture — each click
      // commits a point; double-click or Escape finalizes (see onDoubleClick
      // below / the Escape listener). No pointer capture, since the pointer
      // is released between clicks.
      if (activeFreehandTool === "polyline") {
        e.preventDefault();
        autoPan.reportPointer(e.clientX, e.clientY);
        const point = findSnapPoint(rawInitialPoint, blockOrder) ?? rawInitialPoint;
        if (chainPointsRef.current === null) {
          chainPointsRef.current = [point];
        } else {
          chainPointsRef.current = [...chainPointsRef.current, point];
        }
        setDrawPoints([...chainPointsRef.current]);
        return;
      }

      isDrawingRef.current = true;
      e.preventDefault();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }

      const initialPoint = isShapeTool(activeFreehandTool)
        ? findSnapPoint(rawInitialPoint, blockOrder) ?? rawInitialPoint
        : rawInitialPoint;

      pointsRef.current = [initialPoint];
      setDrawPoints([initialPoint]);
      autoPan.reportPointer(e.clientX, e.clientY);
    },
    [autoPan, isDrawMode, setIsDrawMode]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const { activeFreehandTool } = useWorkspaceStore.getState();
    const currentPoint: Position = { x: e.clientX, y: e.clientY };

    // Live rubber-band from the last committed chain point to the cursor —
    // fires on every hover, not just while a button is held.
    if (chainPointsRef.current !== null && !isDrawingRef.current) {
      autoPan.reportPointer(e.clientX, e.clientY);
      const { blockOrder } = useWorkspaceStore.getState();
      const snapped = findSnapPoint(currentPoint, blockOrder);
      setSnapPoint(snapped);
      setDrawPoints([...chainPointsRef.current, snapped ?? currentPoint]);
      return;
    }

    if (!isDrawingRef.current) return;
    autoPan.reportPointer(e.clientX, e.clientY);

    if (activeFreehandTool === "eraser") {
      eraseAtPoint(currentPoint, canvasOriginRef.current);
      return;
    }

    if (isShapeTool(activeFreehandTool)) {
      const startPoint = pointsRef.current[0] ?? currentPoint;
      const { blockOrder } = useWorkspaceStore.getState();
      const snapped = findSnapPoint(currentPoint, blockOrder);
      const isAngleSnappable =
        activeFreehandTool === "line" ||
        activeFreehandTool === "cad_line" ||
        activeFreehandTool === "arrow_line";
      const endPoint =
        snapped ?? (e.shiftKey && isAngleSnappable ? snapAngle(startPoint, currentPoint) : currentPoint);
      pointsRef.current = [startPoint, endPoint];

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (!isDrawingRef.current) return;
          const preview = generateShapePoints(activeFreehandTool, startPoint, endPoint);
          setDrawPoints(preview);
          setSnapPoint(snapped);
        });
      }
      return;
    }
    setSnapPoint(null);

    pointsRef.current.push(currentPoint);

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (!isDrawingRef.current) return;
        setDrawPoints([...pointsRef.current]);
      });
    }
  }, [autoPan]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      autoPan.stop();
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

      const { activeFreehandTool } = useWorkspaceStore.getState();
      const screenPoints = pointsRef.current;

      if (activeFreehandTool === "eraser") {
        setDrawPoints(null);
        pointsRef.current = [];
        return;
      }

      createPathBlockFromScreenPoints(screenPoints, activeFreehandTool, canvasOriginRef.current);

      setDrawPoints(null);
      setSnapPoint(null);
      pointsRef.current = [];
    },
    [autoPan]
  );

  /** Double-click finalizes an in-progress polyline chain. */
  const onDoubleClick = useCallback(() => {
    if (chainPointsRef.current !== null) finalizeChain();
  }, [finalizeChain]);

  useEffect(() => {
    if (chainPointsRef.current === null) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancelChain();
      } else if (e.key === "Enter") {
        finalizeChain();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawPoints, cancelChain, finalizeChain]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      autoPan.stop();
    };
  }, [autoPan]);

  return {
    drawPoints,
    snapPoint,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
  };
}
