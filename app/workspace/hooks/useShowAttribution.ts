"use client";

import { useSyncExternalStore, useCallback } from "react";

/** Session-only display preference for showing block author attribution
 *  indicators, mirroring the old app's showAttribution toggle in
 *  CanvasViewOptionsMenu.tsx. Defaults to true. */
let showAttribution = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return showAttribution;
}

function getServerSnapshot(): boolean {
  return true;
}

export function toggleShowAttribution(): void {
  showAttribution = !showAttribution;
  listeners.forEach((listener) => listener());
}

export function getShowAttribution(): boolean {
  return showAttribution;
}

export function useShowAttribution() {
  const isVisible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    toggleShowAttribution();
  }, []);

  return {
    showAttribution: isVisible,
    toggleShowAttribution: toggle,
  };
}
