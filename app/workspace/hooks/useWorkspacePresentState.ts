"use client";

import { useSyncExternalStore, useCallback } from "react";

/** Session-only "Presentation mode is active" flag plus current step index —
 *  not board data, so it lives in its own external store the same way
 *  useCanvasToolsPanelToggle.ts does, rather than in useWorkspaceStore. */
interface PresentState {
  isPresenting: boolean;
  index: number;
}

let state: PresentState = { isPresenting: false, index: 0 };
const listeners = new Set<() => void>();
// Stable reference required by useSyncExternalStore — a fresh object literal
// on every call (even with equal fields) would fail its identity check and
// re-render (or during SSR hydration, loop) forever.
const SERVER_SNAPSHOT: PresentState = { isPresenting: false, index: 0 };

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PresentState {
  return state;
}

function getServerSnapshot(): PresentState {
  return SERVER_SNAPSHOT;
}

export function startWorkspacePresenting(): void {
  state = { isPresenting: true, index: 0 };
  emit();
}

export function stopWorkspacePresenting(): void {
  state = { isPresenting: false, index: 0 };
  emit();
}

export function setWorkspacePresentIndex(index: number): void {
  if (!state.isPresenting) return;
  state = { ...state, index };
  emit();
}

export function useWorkspacePresentState() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback(() => startWorkspacePresenting(), []);
  const stop = useCallback(() => stopWorkspacePresenting(), []);
  const goTo = useCallback((index: number) => setWorkspacePresentIndex(index), []);

  return {
    isPresenting: snapshot.isPresenting,
    presentIndex: snapshot.index,
    startPresenting: start,
    stopPresenting: stop,
    goToPresentIndex: goTo,
  };
}
