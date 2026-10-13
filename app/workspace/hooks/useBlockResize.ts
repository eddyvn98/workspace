"use client";

import { useCallback, useRef, useState } from "react";
import type React from "react";
import type { BlockId, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { findSwimlaneAnchoredBlockIds, isSwimlaneAnchorTable } from "../utils/swimlaneTableAnchors";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { applyAnchoredResize, DEFAULT_RESIZE_TRANSFORM, projectDeltaToBlockSpace, type ResizeState, type ResizeCorner } from "./blockResizeMath";

export type { ResizeCorner } from "./blockResizeMath";

/** Legacy parity: commit no more often than every 80ms while dragging a handle. */
const COMMIT_INTERVAL_MS = 80;
const MIN_WIDTH = 40;
const MIN_HEIGHT = 28;
const SHAPE_RESIZE_SNAP = 4;
export interface ResizeGuide {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function useBlockResize(blockId: BlockId) {
  const block = useWorkspaceStore((state) => state.blocks[blockId]);
  const cameraZoom = useWorkspaceStore((state) => state.camera.zoom);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const imageNaturalAspect = useWorkspaceStore((state) => state.imageNaturalAspect[blockId]);

  const resizeStateRef = useRef<ResizeState | null>(null);
  const pendingTransformRef = useRef<Transform | null>(null);
  const didResizeRef = useRef(false);
  const lastCommitAtRef = useRef(0);
  const [resizeGuide, setResizeGuide] = useState<ResizeGuide | null>(null);
  const [resizePreview, setResizePreview] = useState<Transform | null>(null);
  const startResize = useCallback(
    (corner: ResizeCorner) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (block?.style?.isLocked) return;
      setResizeGuide(null);

      const transform = block
        ? resolveTransform(block.transform, DEFAULT_RESIZE_TRANSFORM)
        : DEFAULT_RESIZE_TRANSFORM;
      const shapeKind = block?.style?.shapeKind ?? (block?.type === "shape"
        ? (block.data as { shapeKind?: string }).shapeKind
        : undefined);
      // `image` blocks always preserve their own aspect ratio on resize (no
      // Ctrl needed) so the photo never distorts — same always-locked
      // treatment as circle/oval/pill shapes below.
      const preserveAspect = shapeKind === "circle" || shapeKind === "oval" || shapeKind === "pill" || block?.type === "image";
      // Uses the image's real pixel ratio (from ImageBlock.tsx's onLoad),
      // not the frame's current w/h — those can differ if the frame was
      // ever off-ratio (e.g. right after a fresh drop, before load fires).
      const lockAspectRatio = block?.type === "image" && imageNaturalAspect
        ? imageNaturalAspect
        : transform.w / Math.max(1, transform.h);

      // Resizing a swimlane's lane-grid table scales its freeform step
      // shapes along with it, matching Lark - see swimlaneTableAnchors.ts.
      const anchoredBlocks = isSwimlaneAnchorTable(block)
        ? findSwimlaneAnchoredBlockIds(useWorkspaceStore.getState().blocks, block).map((id) => {
            const anchoredTransform = resolveTransform(useWorkspaceStore.getState().blocks[id]?.transform, DEFAULT_RESIZE_TRANSFORM);
            return { id, initialX: anchoredTransform.x, initialY: anchoredTransform.y, initialW: anchoredTransform.w, initialH: anchoredTransform.h };
          })
        : [];

      resizeStateRef.current = {
        isResizing: true,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        initialRotation: transform.rotation,
        initialX: transform.x,
        initialY: transform.y,
        initialW: transform.w,
        initialH: transform.h,
        initialZIndex: transform.zIndex,
        preserveAspect,
        aspectRatio: shapeKind === "circle" ? 1 : lockAspectRatio,
        zoomAtStart: Math.max(0.01, cameraZoom),
        anchoredBlocks,
      };
      pendingTransformRef.current = null;
      didResizeRef.current = false;
      lastCommitAtRef.current = 0;
      setResizePreview(transform);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail if pointer is inactive
      }

      e.stopPropagation();
    },
    [block, cameraZoom, imageNaturalAspect]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!resizeStateRef.current || !resizeStateRef.current.isResizing) return;
      if (useWorkspaceStore.getState().blocks[blockId]?.style?.isLocked) return;

      const { corner, startX, startY, initialRotation, initialX, initialY, initialW, initialH, initialZIndex, preserveAspect, aspectRatio, zoomAtStart, anchoredBlocks } =
        resizeStateRef.current;
      // Ctrl (or Cmd on Mac) is a temporary aspect-lock modifier on top of any
      // shape that always preserves aspect (circle/oval/pill) - held while
      // dragging any corner handle, released to go back to free resize.
      const lockAspect = preserveAspect || e.ctrlKey || e.metaKey;

      const { deltaX, deltaY } = projectDeltaToBlockSpace(
        (e.clientX - startX) / zoomAtStart,
        (e.clientY - startY) / zoomAtStart,
        initialRotation
      );

      let newX = initialX;
      let newY = initialY;
      let newW = initialW;
      let newH = initialH;

      switch (corner) {
        case "nw": {
          newW = Math.max(MIN_WIDTH, initialW - deltaX);
          newH = Math.max(MIN_HEIGHT, initialH - deltaY);
          newX = initialX + (initialW - newW);
          newY = initialY + (initialH - newH);
          break;
        }
        case "n": {
          newH = Math.max(MIN_HEIGHT, initialH - deltaY);
          newY = initialY + (initialH - newH);
          break;
        }
        case "ne": {
          newW = Math.max(MIN_WIDTH, initialW + deltaX);
          newH = Math.max(MIN_HEIGHT, initialH - deltaY);
          newX = initialX;
          newY = initialY + (initialH - newH);
          break;
        }
        case "e": {
          newW = Math.max(MIN_WIDTH, initialW + deltaX);
          break;
        }
        case "sw": {
          newW = Math.max(MIN_WIDTH, initialW - deltaX);
          newH = Math.max(MIN_HEIGHT, initialH + deltaY);
          newX = initialX + (initialW - newW);
          newY = initialY;
          break;
        }
        case "s": {
          newH = Math.max(MIN_HEIGHT, initialH + deltaY);
          break;
        }
        case "se": {
          newW = Math.max(MIN_WIDTH, initialW + deltaX);
          newH = Math.max(MIN_HEIGHT, initialH + deltaY);
          newX = initialX;
          newY = initialY;
          break;
        }
        case "w": {
          newW = Math.max(MIN_WIDTH, initialW - deltaX);
          newX = initialX + (initialW - newW);
          break;
        }
      }

      if (lockAspect) {
        if (Math.abs(newW - initialW) >= Math.abs(newH - initialH)) {
          newW = Math.max(MIN_WIDTH, newW);
          newH = Math.max(MIN_HEIGHT, newW / aspectRatio);
        } else {
          newH = Math.max(MIN_HEIGHT, newH);
          newW = Math.max(MIN_WIDTH, newH * aspectRatio);
        }

        const hasWest = corner.includes("w");
        const hasNorth = corner.includes("n");
        if (hasWest) newX = initialX + initialW - newW;
        if (hasNorth) newY = initialY + initialH - newH;
      }

      let matchedSibling: Transform | null = null;
      if (!lockAspect) {
        const siblings = Object.values(useWorkspaceStore.getState().blocks)
          .filter((candidate) => candidate.id !== blockId && candidate.type !== "path")
          .map((candidate) => resolveTransform(candidate.transform, DEFAULT_RESIZE_TRANSFORM));
        const tolerance = 6 / zoomAtStart;
        const widthMatch = siblings.find((candidate) => Math.abs(newW - candidate.w) <= tolerance);
        const heightMatch = siblings.find((candidate) => Math.abs(newH - candidate.h) <= tolerance);
        if (widthMatch) {
          newW = widthMatch.w;
          matchedSibling = widthMatch;
        }
        if (heightMatch) {
          newH = heightMatch.h;
          matchedSibling = matchedSibling ?? heightMatch;
        }
        if (corner.includes("w")) newX = initialX + initialW - newW;
        if (corner.includes("n")) newY = initialY + initialH - newH;
      }

      if (matchedSibling) {
        setResizeGuide({ x: matchedSibling.x - newX, y: matchedSibling.y - newY, w: matchedSibling.w, h: matchedSibling.h });
      } else {
        setResizeGuide(null);
      }

      // Legacy free-form shapes snap their outer geometry to a 4px grid while
      // text nodes retain continuous resize coordinates.
      if (block?.type === "shape") {
        newX = Math.round(newX / SHAPE_RESIZE_SNAP) * SHAPE_RESIZE_SNAP;
        newY = Math.round(newY / SHAPE_RESIZE_SNAP) * SHAPE_RESIZE_SNAP;
        newW = Math.max(MIN_WIDTH, Math.round(newW / SHAPE_RESIZE_SNAP) * SHAPE_RESIZE_SNAP);
        newH = Math.max(MIN_HEIGHT, Math.round(newH / SHAPE_RESIZE_SNAP) * SHAPE_RESIZE_SNAP);
      }

      const nextTransform = { x: newX, y: newY, w: newW, h: newH, rotation: initialRotation, zIndex: initialZIndex };
      didResizeRef.current = true;
      setResizePreview(nextTransform);
      pendingTransformRef.current = nextTransform;
      const now = Date.now();
      if (now - lastCommitAtRef.current >= COMMIT_INTERVAL_MS) {
        lastCommitAtRef.current = now;
        updateBlockTransform(blockId, { x: newX, y: newY, w: newW, h: newH }, "override");
        applyAnchoredResize(
          anchoredBlocks,
          { x: initialX, y: initialY, w: initialW, h: initialH },
          { x: newX, y: newY, w: newW, h: newH },
          updateBlockTransform,
        );
        reflowWorkspaceTree(blockId, undefined, { preserveBlockPosition: blockId });
        pendingTransformRef.current = null;
      }
    },
    [block?.type, blockId, updateBlockTransform]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (resizeStateRef.current?.isResizing) {
      const pendingTransform = pendingTransformRef.current;
      if (pendingTransform) {
        updateBlockTransform(blockId, { x: pendingTransform.x, y: pendingTransform.y, w: pendingTransform.w, h: pendingTransform.h }, "override");
        const { initialX, initialY, initialW, initialH, anchoredBlocks } = resizeStateRef.current;
        applyAnchoredResize(
          anchoredBlocks,
          { x: initialX, y: initialY, w: initialW, h: initialH },
          pendingTransform,
          updateBlockTransform,
        );
        reflowWorkspaceTree(blockId, undefined, { preserveBlockPosition: blockId });
      } else {
        reflowWorkspaceTree(blockId, undefined, { preserveBlockPosition: blockId });
      }
      if (didResizeRef.current && block?.type === "table") updateBlock(blockId, { data: { ...block.data, autoFitContent: false } });
      resizeStateRef.current = null;
      pendingTransformRef.current = null;
      didResizeRef.current = false;
      setResizePreview(null);
      setResizeGuide(null);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore errors releasing capture
      }
    }
  }, [block, blockId, updateBlock, updateBlockTransform]);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    resizeStateRef.current = null;
    pendingTransformRef.current = null;
    didResizeRef.current = false;
    setResizePreview(null);
    setResizeGuide(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore errors releasing capture after cancellation
    }
  }, []);

  return {
    startResize,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    resizeGuide,
    resizePreview,
  };
}
