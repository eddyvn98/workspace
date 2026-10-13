"use client";

import { useEffect } from "react";

/**
 * Records "this person has now looked at this board" while it is open, which
 * is what clears the unseen-updates dot in the board menu.
 *
 * Marks once on open and again whenever the tab is brought back to the
 * foreground, so leaving a board open in a background tab does not keep
 * claiming it was seen. Fail-soft: a logged-out or offline visit simply does
 * not record a view.
 */
export function useWorkspaceSeenMarker(boardId: string | null): void {
  useEffect(() => {
    if (!boardId) return;

    const mark = () => {
      void fetch("/api/workspaces/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId }),
      }).catch(() => {
        // Best-effort — never surface this to the user.
      });
    };

    mark();
    const onVisibility = () => {
      if (document.visibilityState === "visible") mark();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [boardId]);
}

export interface WorkspaceLastSeenMap {
  lastSeen: Record<string, string>;
  callerEmail: string;
}

/** Per-board watermarks for the board menu's unseen dot. */
export async function fetchWorkspaceLastSeen(): Promise<WorkspaceLastSeenMap> {
  try {
    const res = await fetch("/api/workspaces/seen");
    if (!res.ok) return { lastSeen: {}, callerEmail: "" };
    const data = (await res.json()) as Partial<WorkspaceLastSeenMap>;
    return {
      lastSeen: data.lastSeen && typeof data.lastSeen === "object" ? data.lastSeen : {},
      callerEmail: typeof data.callerEmail === "string" ? data.callerEmail : "",
    };
  } catch {
    return { lastSeen: {}, callerEmail: "" };
  }
}
