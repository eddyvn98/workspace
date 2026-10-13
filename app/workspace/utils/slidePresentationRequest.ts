"use client";
import { useEffect, useSyncExternalStore } from "react";
let pending: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function requestSlidePresentation(blockId: string): void { pending = blockId; emit(); }
export function useSlidePresentationRequest(blockId: string, start: () => void): void {
  const target = useSyncExternalStore(subscribe, () => pending, () => null);
  useEffect(() => {
    if (target !== blockId || pending !== blockId) return;
    pending = null; start(); emit();
  }, [target, blockId, start]);
}
