"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getKnownRevision } from "./workspaceBoardApi";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/**
 * REST Collection boards do not join the whole-block Yjs writer. Check the
 * authenticated, revision-only endpoint instead. NEVER apply a remote
 * snapshot from this poll; overwriting an in-progress local draft is unsafe.
 */
export function useCollectionRevisionWatch(boardId: string, enabled: boolean, savePending: boolean): void {
  const pendingRef = useRef(savePending);
  pendingRef.current = savePending;
  useEffect(() => {
    if (!enabled || !boardId) return;
    let closed = false;
    let inFlight = false;
    let lastNotified = -1;
    const check = async () => {
      if (closed || inFlight || document.visibilityState === "hidden") return;
      if (pendingRef.current || useWorkspaceStore.getState().boardId !== boardId) return;
      const base = getKnownRevision(boardId);
      if (base === undefined) return; // initial hydration has not established a safe comparison
      inFlight = true;
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/revision`, {
          cache: "no-store",
        });
        if (!response.ok || closed || pendingRef.current) return;
        const body: unknown = await response.json();
        const revision = typeof body === "object" && body !== null && "revision" in body
          ? (body as { revision: unknown }).revision : null;
        const currentBase = getKnownRevision(boardId);
        if (typeof revision !== "number" || !Number.isSafeInteger(revision) ||
            currentBase === undefined || revision <= currentBase || revision === lastNotified) return;
        lastNotified = revision;
        toast.info("This Collection was updated in another session", {
          id: `workspace-collection-revision-${boardId}`,
          description: "Your open draft has not been replaced. Reload after saving, or resolve a conflict when you next save.",
          duration: 9000,
        });
      } catch {
        // Offline is handled by REST save failures. A revision poll is advisory.
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => { void check(); }, 10000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [boardId, enabled]);
}
