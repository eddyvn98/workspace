"use client";

import { useSyncExternalStore, useCallback } from "react";

let gridSnapEnabled = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return gridSnapEnabled;
}

function getServerSnapshot(): boolean {
  return false;
}

export function toggleGridSnap(): void {
  gridSnapEnabled = !gridSnapEnabled;
  listeners.forEach((listener) => listener());
}

export function getGridSnapEnabled(): boolean {
  return gridSnapEnabled;
}

export function useGridSnapToggle() {
  const isGridSnapEnabled = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const handleToggle = useCallback(() => {
    toggleGridSnap();
  }, []);

  return {
    isGridSnapEnabled,
    toggleGridSnap: handleToggle,
  };
}
