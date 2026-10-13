"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { FloatingToolbarPlacement } from "./useFloatingToolbarPosition";

const GAP = 12;
const MARGIN = 8;
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 48;

interface AnchoredPanelOptions {
  getAvoidRects?: () => DOMRect[];
  onDragStart?: () => void;
  resetKey?: string | number | null;
}

export interface AnchoredPanelPositionResult {
  toolbarRef: RefObject<HTMLDivElement>;
  style: { left: number; top: number } | null;
  placement: FloatingToolbarPlacement;
  handleToolbarDragStart: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}

function overlapArea(a: { left: number; top: number; right: number; bottom: number }, b: DOMRect) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

/**
 * Generic sibling of useFloatingToolbarPosition.ts (kept separate rather than
 * generalizing that hook's signature, to avoid touching a working/relied-on
 * file) — same above/below-placement + viewport-clamp math, but anchored to
 * any live rect a caller resolves each frame, not just a single block's.
 * Used by ConnectorStylePanel (anchored to the connector's midpoint) and
 * GroupStylePanel (anchored to the selection's bounding box) so all three
 * sibling style panels track their subject instead of sitting fixed-corner.
 */
export function useAnchoredPanelPosition(
  isActive: boolean,
  getRect: () => DOMRect | null,
  options: AnchoredPanelOptions = {},
): AnchoredPanelPositionResult {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [userOffset, setUserOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ clientX: number; clientY: number; left: number; top: number } | null>(null);
  const liveOffsetRef = useRef(userOffset);
  const positionRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const { getAvoidRects, onDragStart, resetKey } = options;
  const [, setTick] = useState(0);
  // The 100ms poll below is a coarse safety net; on its own it let the panel
  // lag its subject by up to a tenth of a second during a wheel zoom.
  // Subscribing to the camera re-runs getRect on every camera commit instead,
  // so the panel tracks the zoom frame for frame.
  useWorkspaceStore((state) => state.camera);

  useEffect(() => {
    setUserOffset({ x: 0, y: 0 });
    liveOffsetRef.current = { x: 0, y: 0 };
  }, [isActive, resetKey]);

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => {
      setTick((t) => (t + 1) % 1_000_000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isActive]);

  if (!isActive) {
    return { toolbarRef, style: null, placement: "above", handleToolbarDragStart: () => undefined };
  }

  const rect = getRect();
  if (!rect) {
    return { toolbarRef, style: null, placement: "above", handleToolbarDragStart: () => undefined };
  }

  const el = toolbarRef.current;
  const width = el?.offsetWidth || DEFAULT_WIDTH;
  const height = el?.offsetHeight || DEFAULT_HEIGHT;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  const centerX = rect.left + rect.width / 2;
  const fitsAbove = rect.top - GAP - height >= MARGIN;
  let placement: FloatingToolbarPlacement = fitsAbove ? "above" : "below";
  let left = Math.min(viewportWidth - MARGIN - width, Math.max(MARGIN, centerX - width / 2));
  let top = fitsAbove
    ? Math.max(MARGIN, rect.top - GAP - height)
    : Math.min(viewportHeight - MARGIN - height, rect.bottom + GAP);

  const avoidRects = getAvoidRects?.() ?? [];
  if (avoidRects.length > 0) {
    const centerY = rect.top + rect.height / 2;
    const candidates: Array<{
      placement: FloatingToolbarPlacement;
      left: number;
      top: number;
      priority: number;
    }> = [
      { placement: "above" as FloatingToolbarPlacement, left: centerX - width / 2, top: rect.top - GAP - height, priority: 0 },
      { placement: "below" as FloatingToolbarPlacement, left: centerX - width / 2, top: rect.bottom + GAP, priority: 1 },
      { placement: "left" as FloatingToolbarPlacement, left: rect.left - GAP - width, top: centerY - height / 2, priority: 2 },
      { placement: "right" as FloatingToolbarPlacement, left: rect.right + GAP, top: centerY - height / 2, priority: 3 },
    ].map((candidate) => ({
      ...candidate,
      left: Math.round(candidate.left),
      top: Math.round(candidate.top),
    }));
    const visible = candidates.filter((candidate) => (
      candidate.left >= MARGIN && candidate.top >= MARGIN
      && candidate.left + width <= viewportWidth - MARGIN
      && candidate.top + height <= viewportHeight - MARGIN
    ));
    const score = (candidate: typeof candidates[number]) => {
      const bounds = {
        left: candidate.left,
        top: candidate.top,
        right: candidate.left + width,
        bottom: candidate.top + height,
      };
      return avoidRects.reduce((total, avoid) => total + overlapArea(bounds, avoid), 0);
    };
    const best = (visible.length > 0 ? visible : candidates).reduce((current, candidate) => {
      const candidateScore = score(candidate);
      const currentScore = score(current);
      return candidateScore < currentScore
        || (candidateScore === currentScore && candidate.priority < current.priority)
        ? candidate
        : current;
    });
    placement = best.placement;
    left = Math.min(viewportWidth - MARGIN - width, Math.max(MARGIN, best.left));
    top = Math.min(viewportHeight - MARGIN - height, Math.max(MARGIN, best.top));
  }

  const autoPosition = { left, top, width, height };
  positionRef.current = autoPosition;
  const handleToolbarDragStart = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!isActive || !positionRef.current) return;
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
    onDragStart?.();
    const current = positionRef.current;
    const base = {
      left: current.left + liveOffsetRef.current.x,
      top: current.top + liveOffsetRef.current.y,
    };
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, ...base };
    if (toolbarRef.current) toolbarRef.current.style.transition = "none";

    const move = (clientX: number, clientY: number) => {
      const dragStart = dragRef.current;
      const currentPosition = positionRef.current;
      if (!dragStart || !currentPosition) return;
      const next = {
        left: Math.min(viewportWidth - MARGIN - currentPosition.width, Math.max(MARGIN, dragStart.left + clientX - dragStart.clientX)),
        top: Math.min(viewportHeight - MARGIN - currentPosition.height, Math.max(MARGIN, dragStart.top + clientY - dragStart.clientY)),
      };
      liveOffsetRef.current = {
        x: next.left - currentPosition.left,
        y: next.top - currentPosition.top,
      };
      if (toolbarRef.current) {
        toolbarRef.current.style.left = `${next.left}px`;
        toolbarRef.current.style.top = `${next.top}px`;
      }
    };
    const onMove = (moveEvent: PointerEvent) => move(moveEvent.clientX, moveEvent.clientY);
    const onUp = () => {
      setUserOffset(liveOffsetRef.current);
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return {
    toolbarRef,
    style: {
      left: autoPosition.left + userOffset.x,
      top: autoPosition.top + userOffset.y,
    },
    placement,
    handleToolbarDragStart,
  };
}

export default useAnchoredPanelPosition;
