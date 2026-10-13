"use client";

import { useSyncExternalStore } from "react";
import type { BlockId } from "../types/block";

/** Live feedback for a drag that's past the detach buffer: legacy fades the
 *  structural wire to a dragged node's old parent the moment the drag would
 *  detach it on release, instead of only showing the change after drop.
 *  Mirrors useSnapGuides.ts's external-store pattern (module-level state +
 *  useSyncExternalStore) so any number of ConnectorLayer instances can read
 *  it without plumbing props through the drag hook. */
let detachingRootIds: ReadonlySet<BlockId> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlySet<BlockId> {
  return detachingRootIds;
}

const SERVER_SNAPSHOT: ReadonlySet<BlockId> = new Set();

function getServerSnapshot(): ReadonlySet<BlockId> {
  return SERVER_SNAPSHOT;
}

export function setDetachingRootIds(ids: ReadonlySet<BlockId>): void {
  if (ids.size === 0 && detachingRootIds.size === 0) return;
  detachingRootIds = ids;
  listeners.forEach((listener) => listener());
}

export function useDetachingRootIds(): ReadonlySet<BlockId> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
