"use client";
import { useEffect, useState } from "react";
import { getKnownRevision } from "./workspaceBoardApi";
import { flushWorkspacePendingSave } from "../utils/workspacePersistenceFlush";

type Listener = (stale: boolean) => void;
interface Watch { listeners: Set<Listener>; timer: ReturnType<typeof setInterval>; running: boolean; stale: boolean }
const watches = new Map<string, Watch>();

function subscribe(boardId: string, listener: Listener): () => void {
  let watch = watches.get(boardId);
  if (!watch) {
    const next: Watch = {
      listeners: new Set(), running: false, stale: false,
      timer: setInterval(() => { void poll(boardId); }, 12_000),
    };
    watch = next;
    watches.set(boardId, next);
    void poll(boardId);
  }
  watch.listeners.add(listener);
  listener(watch.stale);
  return () => {
    const current = watches.get(boardId);
    if (!current) return;
    current.listeners.delete(listener);
    if (!current.listeners.size) { clearInterval(current.timer); watches.delete(boardId); }
  };
}
async function poll(boardId: string) {
  const watch = watches.get(boardId);
  if (!watch || watch.running || document.visibilityState === "hidden") return;
  watch.running = true;
  try {
    const result = await fetch("/api/workspaces/" + encodeURIComponent(boardId) + "/revision", {
      cache: "no-store",
    });
    if (!result.ok) return;
    const body = await result.json() as { revision?: number };
    const base = getKnownRevision(boardId);
    if (!Number.isInteger(body.revision) || base === undefined) return;
    const stale = (body.revision as number) > base;
    if (stale !== watch.stale) {
      watch.stale = stale;
      for (const listener of watch.listeners) listener(stale);
    }
  } catch {
    // Offline: keep the last observed state and preserve queued local edits.
  } finally {
    watch.running = false;
  }
}
export function useCollectionRevisionNotice(boardId: string) {
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!boardId) return;
    const unsubscribe = subscribe(boardId, setStale);
    const visible = () => { if (document.visibilityState === "visible") void poll(boardId); };
    document.addEventListener("visibilitychange", visible);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, [boardId]);
  const refresh = async () => {
    if (!boardId || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      if (!await flushWorkspacePendingSave(boardId)) {
        setError("Unsaved or conflicting changes. Resolve the save error before refreshing.");
        return;
      }
      window.location.reload();
    } finally { setRefreshing(false); }
  };
  return { stale, refreshing, error, refresh };
}
