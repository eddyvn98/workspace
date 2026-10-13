"use client";

import React from "react";
import { useWorkspacePresence } from "../hooks/useWorkspacePresence";
import { colorForEmail, initialsForEmail } from "../utils/presenceColor";

const MAX_VISIBLE = 4;

/** Avatar cluster of other collaborators currently viewing this board — a
 *  scaled-down port of the old app's PresenceLayer (cursor positions +
 *  avatar rings): just the avatar row, no cursor tracking. See
 *  CONTRACTS.md §24's presence note. */
export function WorkspacePresenceCluster({ boardId }: { boardId: string }) {
  const viewers = useWorkspacePresence(boardId);
  if (viewers.length === 0) return null;

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - visible.length;
  const editingViewer = viewers.find((viewer) => viewer.editingBlockId);

  return (
    <div className="flex items-center -space-x-2" title={viewers.map((v) => v.email).join(", ")}>
      {editingViewer && <span className="mr-2 hidden whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-md md:inline dark:bg-slate-900/95 dark:text-slate-300" data-workspace-remote-editing={editingViewer.email}>{editingViewer.email} is editing…</span>}
      {visible.map((viewer) => (
        <div
          key={viewer.email}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm dark:border-slate-900"
          style={{ backgroundColor: colorForEmail(viewer.email) }}
          title={viewer.email}
        >
          {initialsForEmail(viewer.email)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-400 text-[10px] font-bold text-white shadow-sm dark:border-slate-900">
          +{overflow}
        </div>
      )}
    </div>
  );
}

export default WorkspacePresenceCluster;
