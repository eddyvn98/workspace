"use client";

import { useSyncExternalStore } from "react";

let isDragging = false;
const listeners = new Set<() => void>();

export function setWorkspaceBlockDragging(value: boolean) {
  if (isDragging === value) return;
  isDragging = value;
  listeners.forEach((listener) => listener());
}

export function useWorkspaceBlockDragging() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => isDragging,
    () => false,
  );
}
