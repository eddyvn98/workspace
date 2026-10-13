import { useSyncExternalStore } from "react";
import type { BlockId } from "../types/block";
import type { AnchorSide } from "../types/connector";

export interface AnchorEntry {
  /** The block's box in viewport/screen pixels — what screen-space overlays
   *  (selection boundary, floating toolbar, rubber-band select) need. */
  getRect: () => DOMRect | null;
  /** The same box in canvas/world units, i.e. the block's own transform
   *  before the camera pan/zoom is applied. Connectors render inside the
   *  camera-transformed container, so they must anchor to this instead of a
   *  screen rect: a screen rect read during React's render phase is always
   *  one commit behind the transform the browser is about to paint, which is
   *  what made connectors lag a frame behind their nodes while zooming. */
  getWorldRect?: () => DOMRect | null;
}

export class AnchorRegistry {
  private entries = new Map<BlockId, AnchorEntry>();
  private listeners = new Set<() => void>();
  private version = 0;

  private notify(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion(): number {
    return this.version;
  }

  register(blockId: BlockId, entry: AnchorEntry): () => void {
    this.entries.set(blockId, entry);
    this.notify();
    return () => {
      if (this.entries.get(blockId) === entry) {
        this.entries.delete(blockId);
        this.notify();
      }
    };
  }

  refresh(blockId: BlockId): void {
    if (this.entries.has(blockId)) this.notify();
  }

  getBlockRect(blockId: BlockId): DOMRect | null {
    const entry = this.entries.get(blockId);
    if (!entry) return null;
    return entry.getRect();
  }

  /** Canvas-space counterpart of getBlockRect. Returns null when the entry
   *  predates world-rect registration (e.g. a test harness stub), letting the
   *  caller fall back to the block's stored transform. */
  getBlockWorldRect(blockId: BlockId): DOMRect | null {
    const entry = this.entries.get(blockId);
    if (!entry?.getWorldRect) return null;
    return entry.getWorldRect();
  }

  getAnchorPoint(blockId: BlockId, side: AnchorSide): { x: number; y: number } | null {
    const rect = this.getBlockRect(blockId);
    if (!rect) return null;
    return pointOnRectSide(rect, side);
  }
}

export const anchorRegistry = new AnchorRegistry();

export function useAnchorRegistryVersion(): number {
  return useSyncExternalStore(
    (listener) => anchorRegistry.subscribe(listener),
    () => anchorRegistry.getVersion(),
    () => 0,
  );
}

export function pointOnRectSide(rect: DOMRect, side: AnchorSide): { x: number; y: number } {
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;

  switch (side) {
    case "top":
      return { x: midX, y: rect.top };
    case "right":
      return { x: rect.right, y: midY };
    case "bottom":
      return { x: midX, y: rect.bottom };
    case "left":
      return { x: rect.left, y: midY };
    case "center":
    default:
      return { x: midX, y: midY };
  }
}

/**
 * Which side of `fromRect` should a connector leave from to reach `toRect`
 * by the shortest, least-overlapping path — compares how far apart the two
 * rects are horizontally vs. vertically and picks the facing side on the
 * dominant axis, so a connector attaches at an edge instead of cutting
 * through the block body (which is what always using "center" does).
 */
export function pickFacingSide(fromRect: DOMRect, toRect: DOMRect): AnchorSide {
  const fromMidX = fromRect.left + fromRect.width / 2;
  const fromMidY = fromRect.top + fromRect.height / 2;
  const toMidX = toRect.left + toRect.width / 2;
  const toMidY = toRect.top + toRect.height / 2;

  const dx = toMidX - fromMidX;
  const dy = toMidY - fromMidY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}
