"use client";

import { useSyncExternalStore, useCallback } from "react";

/** Session-only display preference (not board data) — same external-store
 *  pattern as useShowCanvasComments.ts. Gates WorkspaceFramesPanel and
 *  CanvasBackgroundPicker, both of which have no old-app equivalent to
 *  match — defaults to HIDDEN so they don't sit permanently exposed on the
 *  canvas; a rail icon in WorkspaceFloatingToolbar opens them on demand. */
let isOpen = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return isOpen;
}

function getServerSnapshot(): boolean {
  return false;
}

export function toggleCanvasToolsPanel(): void {
  isOpen = !isOpen;
  listeners.forEach((listener) => listener());
}

export function useCanvasToolsPanelToggle() {
  const isCanvasToolsPanelOpen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    toggleCanvasToolsPanel();
  }, []);

  return {
    isCanvasToolsPanelOpen,
    toggleCanvasToolsPanel: toggle,
  };
}
