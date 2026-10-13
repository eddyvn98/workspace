"use client";

import { useSyncExternalStore, useCallback } from "react";

/** Session-only display preference (not board data) — same external-store
 *  pattern as useGridSnapToggle.ts, mirroring the old app's
 *  showCanvasComments toggle in CanvasViewOptionsMenu.tsx. Defaults to
 *  visible, matching the old app's default. */
let showCanvasComments = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return showCanvasComments;
}

function getServerSnapshot(): boolean {
  return true;
}

export function toggleShowCanvasComments(): void {
  showCanvasComments = !showCanvasComments;
  listeners.forEach((listener) => listener());
}

export function getShowCanvasComments(): boolean {
  return showCanvasComments;
}

export function useShowCanvasComments() {
  const isVisible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    toggleShowCanvasComments();
  }, []);

  return {
    showCanvasComments: isVisible,
    toggleShowCanvasComments: toggle,
  };
}
