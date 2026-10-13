"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { blockScreenRect, workspaceCanvasOrigin } from "../utils/blockRects";
import type { BlockId, CanvasBlock } from "../types/block";

const MARGIN = 8;
const TOP_BAR_CLEARANCE = 72;
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 200;

interface ToolbarRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface PositionInput {
  selectedRect: ToolbarRect;
  otherRects: ToolbarRect[];
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  toolbarWidth: number;
  toolbarHeight: number;
  userOffset: { x: number; y: number };
}

interface PositionResult {
  left: number;
  top: number;
}

interface Options {
  blockId: BlockId | null;
  toolbarRef: RefObject<HTMLDivElement>;
  blocks: Record<string, CanvasBlock>;
  zoom: number;
  computePosition: (input: PositionInput) => PositionResult;
}

export type ToolbarDragStart = (
  event: ReactMouseEvent | ReactTouchEvent | ReactPointerEvent,
) => void;

export function useFloatingToolbarDrag({
  blockId,
  toolbarRef,
  blocks,
  zoom,
  computePosition,
}: Options) {
  const [userOffset, setUserOffset] = useState({ x: 0, y: 0 });
  const liveDragOffsetRef = useRef(userOffset);
  const isDraggingRef = useRef(false);
  const dragSnapRef = useRef<{ mouseX: number; mouseY: number; baseX: number; baseY: number; baseAnchorX: number; baseAnchorY: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const prevBlockIdRef = useRef<BlockId | null>(null);

  useEffect(() => {
    if (prevBlockIdRef.current === blockId) return;
    prevBlockIdRef.current = blockId;
    setUserOffset({ x: 0, y: 0 });
    liveDragOffsetRef.current = { x: 0, y: 0 };
  }, [blockId]);

  useEffect(() => {
    liveDragOffsetRef.current = userOffset;
  }, [userOffset]);

  const handleToolbarDragStart = useCallback<ToolbarDragStart>((event) => {
    if (!blockId) return;
    // Must resolve anchor rects exactly the way useFloatingToolbarPosition
    // does, or the toolbar jumps the moment a drag starts.
    const camera = useWorkspaceStore.getState().camera;
    const origin = workspaceCanvasOrigin();
    const selectedRect = blockScreenRect(blocks, blockId, camera, origin);
    if (!selectedRect) return;

    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    const clientX = "touches" in event ? event.touches[0]?.clientX : event.clientX;
    const clientY = "touches" in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX === undefined || clientY === undefined) return;

    const width = toolbarRef.current?.offsetWidth || DEFAULT_WIDTH;
    const height = toolbarRef.current?.offsetHeight || DEFAULT_HEIGHT;
    const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    const clampLeft = (left: number) => Math.min(viewportWidth - MARGIN - width, Math.max(MARGIN, left));
    const clampTop = (top: number) => Math.min(viewportHeight - MARGIN - height, Math.max(TOP_BAR_CLEARANCE, top));
    const otherRects = Object.keys(blocks)
      .filter((id) => id !== blockId)
      .map((id) => blockScreenRect(blocks, id, camera, origin))
      .filter((rect): rect is DOMRect => Boolean(rect));
    const base = computePosition({
      selectedRect,
      otherRects,
      zoom,
      viewportWidth,
      viewportHeight,
      toolbarWidth: width,
      toolbarHeight: height,
      userOffset: { x: 0, y: 0 },
    });
    const baseLeft = clampLeft(base.left + userOffset.x);
    const baseTop = clampTop(base.top + userOffset.y);
    dragSnapRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      baseX: baseLeft,
      baseY: baseTop,
      baseAnchorX: base.left,
      baseAnchorY: base.top,
    };
    isDraggingRef.current = true;
    if (toolbarRef.current) toolbarRef.current.style.transition = "none";

    const onMove = (nextX: number, nextY: number) => {
      const snap = dragSnapRef.current;
      if (!snap) return;
      const left = clampLeft(snap.baseX + nextX - snap.mouseX);
      const top = clampTop(snap.baseY + nextY - snap.mouseY);
      liveDragOffsetRef.current = { x: left - snap.baseAnchorX, y: top - snap.baseAnchorY };
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = requestAnimationFrame(() => {
        if (!toolbarRef.current) return;
        toolbarRef.current.style.left = `${left}px`;
        toolbarRef.current.style.top = `${top}px`;
      });
    };
    const onMouseMove = (move: MouseEvent) => onMove(move.clientX, move.clientY);
    const onTouchMove = (move: TouchEvent) => {
      const touch = move.touches[0];
      if (touch) onMove(touch.clientX, touch.clientY);
    };
    const onPointerMove = (move: PointerEvent) => onMove(move.clientX, move.clientY);
    const onUp = () => {
      dragSnapRef.current = null;
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      isDraggingRef.current = false;
      if (toolbarRef.current) toolbarRef.current.style.transition = "";
      setUserOffset(liveDragOffsetRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [blockId, blocks, computePosition, toolbarRef, userOffset.x, userOffset.y, zoom]);

  return { userOffset, liveDragOffsetRef, isDraggingRef, handleToolbarDragStart };
}
