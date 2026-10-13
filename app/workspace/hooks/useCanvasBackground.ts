"use client";

import { useSyncExternalStore } from "react";

let canvasBackgroundColor: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return canvasBackgroundColor;
}

function getServerSnapshot(): string | null {
  return null;
}

export function setCanvasBackgroundColor(color: string | null): void {
  canvasBackgroundColor = color;
  listeners.forEach((listener) => listener());
}

export function getCanvasBackgroundColor(): string | null {
  return canvasBackgroundColor;
}

export function useCanvasBackground(): string | null {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
}
