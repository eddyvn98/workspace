"use client";

import { useSyncExternalStore } from "react";

export interface SnapGuide {
  type: "vertical" | "horizontal";
  position: number;
}

let activeGuides: SnapGuide[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SnapGuide[] {
  return activeGuides;
}

const SERVER_SNAPSHOT: SnapGuide[] = [];

function getServerSnapshot(): SnapGuide[] {
  return SERVER_SNAPSHOT;
}

export function setActiveSnapGuides(guides: SnapGuide[]): void {
  activeGuides = guides;
  listeners.forEach((listener) => listener());
}

export function useSnapGuides(): SnapGuide[] {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
}
