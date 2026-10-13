"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { blockScreenRect, workspaceCanvasOrigin } from "../utils/blockRects";
import type { BlockId } from "../types/block";
import { useFloatingToolbarDrag } from "./useFloatingToolbarDrag";

const MARGIN = 8;
const TOP_BAR_CLEARANCE = 72;
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 200;

/** The legacy toolbar scales both its collision gap and visual clearance with canvas zoom. */
export function getLegacyToolbarGap(zoom: number): number {
  return Math.max(20, 40 * zoom) + Math.max(16, 12 * zoom);
}

export type FloatingToolbarPlacement = "above" | "below";

export interface FloatingToolbarPositionResult {
  toolbarRef: RefObject<HTMLDivElement>;
  /** null while the anchored block has no live DOM rect yet (first paint). */
  style: { left: number; top: number } | null;
  placement: FloatingToolbarPlacement;
  userOffset: { x: number; y: number };
  handleToolbarDragStart: (event: React.MouseEvent | React.TouchEvent | React.PointerEvent) => void;
}

export interface FloatingToolbarRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FloatingToolbarGeometryInput {
  selectedRect: FloatingToolbarRectLike;
  otherRects: FloatingToolbarRectLike[];
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  toolbarWidth: number;
  toolbarHeight: number;
  userOffset?: { x: number; y: number };
}

export interface FloatingToolbarGeometryResult {
  left: number;
  top: number;
  placement: FloatingToolbarPlacement;
}

function unique(values: number[]) {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function intersects(a: { left: number; top: number; right: number; bottom: number }, b: FloatingToolbarRectLike) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function scoreAgainstOtherRects(bounds: { left: number; top: number; right: number; bottom: number }, otherRects: FloatingToolbarRectLike[]) {
  return otherRects.filter((rect) => intersects(bounds, rect)).length;
}

export function computeFloatingToolbarPosition({
  selectedRect,
  otherRects,
  zoom,
  viewportWidth,
  viewportHeight,
  toolbarWidth,
  toolbarHeight,
  userOffset,
}: FloatingToolbarGeometryInput): FloatingToolbarGeometryResult {
  const gap = getLegacyToolbarGap(zoom);
  const centerX = selectedRect.left + selectedRect.width / 2;
  const centerY = selectedRect.top + selectedRect.height / 2;
  const clampLeft = (left: number) => Math.min(viewportWidth - MARGIN - toolbarWidth, Math.max(MARGIN, left));
  const clampTop = (top: number) => Math.min(viewportHeight - MARGIN - toolbarHeight, Math.max(TOP_BAR_CLEARANCE, top));

  const preferred = {
    above: { left: centerX - toolbarWidth / 2, top: selectedRect.top - gap - toolbarHeight },
    below: { left: centerX - toolbarWidth / 2, top: selectedRect.bottom + gap },
    left: { left: selectedRect.left - gap - toolbarWidth, top: centerY - toolbarHeight / 2 },
    right: { left: selectedRect.right + gap, top: centerY - toolbarHeight / 2 },
  } as const;

  const candidates = [
    { placement: "above" as const, left: clampLeft(preferred.above.left), top: preferred.above.top, priority: 0 },
    { placement: "below" as const, left: clampLeft(preferred.below.left), top: preferred.below.top, priority: 1 },
    // Clamp horizontal candidates too. A wide wrapped toolbar can otherwise
    // make both side positions fail the viewport check before collision
    // scoring, forcing the toolbar directly over the next branch/node.
    { placement: "above" as const, left: clampLeft(preferred.left.left), top: clampTop(preferred.left.top), priority: 2 },
    { placement: "above" as const, left: clampLeft(preferred.right.left), top: clampTop(preferred.right.top), priority: 3 },
  ].map((candidate) => ({
    ...candidate,
    bounds: {
      left: candidate.left,
      top: candidate.top,
      right: candidate.left + toolbarWidth,
      bottom: candidate.top + toolbarHeight,
    },
  }));

  const visible = candidates.filter(({ bounds }) =>
    bounds.left >= MARGIN
    && bounds.top >= TOP_BAR_CLEARANCE
    && bounds.right <= viewportWidth - MARGIN
    && bounds.bottom <= viewportHeight - MARGIN
  );

  // The above/below candidates never overlap selectedRect by construction
  // (they sit `gap` past its top/bottom edge), but left/right only offset
  // horizontally -- when the toolbar is wider than the room available beside
  // a small block, clampLeft pulls the candidate's bounds back toward the
  // viewport margin, which can land it right back on top of the very block
  // it was meant to avoid. Collision scoring only ever checked otherRects, so
  // that clamped-over candidate looked perfectly clear (0 collisions) and
  // won outright. Folding selectedRect into the same rects list makes
  // covering the selected block itself score as a collision too.
  const rectsToAvoid = [...otherRects, selectedRect];

  let basePos: FloatingToolbarGeometryResult;

  if (visible.length) {
    const next = visible.reduce((best, candidate) => {
      const bestScore = scoreAgainstOtherRects(best.bounds, rectsToAvoid) * 100000 + best.priority;
      const nextScore = scoreAgainstOtherRects(candidate.bounds, rectsToAvoid) * 100000 + candidate.priority;
      return nextScore < bestScore ? candidate : best;
    });
    basePos = { left: next.left, top: next.top, placement: next.placement };
  } else {
    const fitAbove = preferred.above.top >= TOP_BAR_CLEARANCE;
    const fitBelow = preferred.below.top + toolbarHeight <= viewportHeight - MARGIN;
    const horizontal = unique([preferred.above.left, preferred.left.left, preferred.right.left].map(clampLeft));
    const choices = horizontal.flatMap((left) => [
      ...(fitAbove ? [{ left, top: clampTop(preferred.above.top), below: false }] : []),
      ...(fitBelow ? [{ left, top: clampTop(preferred.below.top), below: true }] : []),
    ]);
    const fallbackBelow = !fitAbove && fitBelow;
    const fallback = {
      left: clampLeft(preferred.above.left),
      top: fallbackBelow ? clampTop(preferred.below.top) : clampTop(preferred.above.top),
      below: fallbackBelow,
    };
    const score = (candidate: typeof fallback) => {
      const bounds = {
        left: candidate.left,
        top: candidate.top,
        right: candidate.left + toolbarWidth,
        bottom: candidate.top + toolbarHeight,
      };
      return scoreAgainstOtherRects(bounds, rectsToAvoid) * 100000
        + Math.abs(candidate.left - (centerX - toolbarWidth / 2))
        + (candidate.below ? 1 : 0);
    };
    const next = (choices.length ? choices : [fallback]).reduce((best, candidate) => (
      score(candidate) < score(best) ? candidate : best
    ));
    basePos = { left: next.left, top: next.top, placement: next.below ? "below" : "above" };
  }

  if (!userOffset || (userOffset.x === 0 && userOffset.y === 0)) {
    return basePos;
  }

  const left = clampLeft(basePos.left + userOffset.x);
  const top = clampTop(basePos.top + userOffset.y);
  return { left, top, placement: basePos.placement };
}

/**
 * Anchors the Workspace selection toolbar to the live screen rect of a single
 * selected block, using the same candidate scoring and viewport clamping rules
 * as the legacy Mindmap toolbar for the same selected-node geometry.
 *
 * The toolbar re-reads the anchor registry on every animation frame while the
 * selection is active, which keeps it synchronized with pan/zoom and live
 * layout movement without pushing those details into the caller.
 */
export function useFloatingToolbarPosition(blockId: BlockId | null): FloatingToolbarPositionResult {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const camera = useWorkspaceStore((state) => state.camera);
  const zoom = camera.zoom;
  const [, setResizeVersion] = useState(0);

  const { userOffset, liveDragOffsetRef, isDraggingRef, handleToolbarDragStart } = useFloatingToolbarDrag({
    blockId,
    toolbarRef,
    blocks,
    zoom,
    computePosition: computeFloatingToolbarPosition,
  });

  useEffect(() => {
    const onResize = () => setResizeVersion((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!blockId) {
    return { toolbarRef, style: null, placement: "above", userOffset, handleToolbarDragStart };
  }

  // Anchor rects are projected from the block transforms through the live
  // camera instead of measured: getBoundingClientRect() answers from the last
  // committed frame, so the toolbar used to trail the block it is pinned to
  // for the whole duration of a wheel zoom. It also removes one layout read
  // per block per frame from this hook's rAF loop.
  const origin = workspaceCanvasOrigin();
  const selectedRect = blockScreenRect(blocks, blockId, camera, origin);
  if (!selectedRect) {
    return { toolbarRef, style: null, placement: "above", userOffset, handleToolbarDragStart };
  }

  const el = toolbarRef.current;
  const width = el?.offsetWidth || DEFAULT_WIDTH;
  const height = el?.offsetHeight || DEFAULT_HEIGHT;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const otherRects = Object.keys(blocks)
    .filter((id) => id !== blockId)
    .map((id) => blockScreenRect(blocks, id, camera, origin))
    .filter((rect): rect is DOMRect => !!rect);
  const next = computeFloatingToolbarPosition({
    selectedRect,
    otherRects,
    zoom,
    viewportWidth,
    viewportHeight,
    toolbarWidth: width,
    toolbarHeight: height,
    userOffset: isDraggingRef.current ? liveDragOffsetRef.current : userOffset,
  });

  return {
    toolbarRef,
    style: { left: next.left, top: next.top },
    placement: next.placement,
    userOffset,
    handleToolbarDragStart,
  };
}

export default useFloatingToolbarPosition;
