"use client";

import { useSyncExternalStore } from "react";
import type { BlockId } from "../types/block";

/** Live "would-be landing spot" ghost for a single-block drag hovering a
 *  valid merge target — legacy's NodeDragDropPreviewLayer shows the node's
 *  post-drop position while still dragging instead of only snapping it
 *  there after release. Mirrors useSnapGuides.ts's external-store pattern. */
export interface DragMergePreview {
  blockId: BlockId;
  x: number;
  y: number;
  w: number;
  h: number;
}

let activePreview: DragMergePreview | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DragMergePreview | null {
  return activePreview;
}

function getServerSnapshot(): DragMergePreview | null {
  return null;
}

export function setDragMergePreview(preview: DragMergePreview | null): void {
  if (preview === activePreview) return;
  if (
    preview && activePreview &&
    preview.blockId === activePreview.blockId &&
    preview.x === activePreview.x && preview.y === activePreview.y &&
    preview.w === activePreview.w && preview.h === activePreview.h
  ) {
    return;
  }
  activePreview = preview;
  listeners.forEach((listener) => listener());
}

export function useDragMergePreview(): DragMergePreview | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
