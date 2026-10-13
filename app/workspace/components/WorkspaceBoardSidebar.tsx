"use client";

import { useState } from "react";
import { WorkspaceBoardMenu } from "./WorkspaceBoardMenu";
import { WorkspaceOutlinePanel } from "./WorkspaceOutlinePanel";

// showOutline is only ever flipped by the user — the outline button or
// "Back to list" — never by boardId changing on its own. Clicking a board in
// the list switches the canvas but leaves the sidebar exactly where it was;
// only the explicit outline action jumps into the outline.
export function WorkspaceBoardSidebar() {
  const [showOutline, setShowOutline] = useState(true);

  // h-full (not min-h-full) so WorkspaceOutlinePanel's own flex-1 scroll
  // region can size against this box's real height instead of just its
  // content — see that component for why.
  return <div className="flex h-full min-h-full flex-col bg-white dark:bg-slate-900/95">{showOutline ? <WorkspaceOutlinePanel onClose={() => setShowOutline(false)} /> : <div className="p-2"><WorkspaceBoardMenu embedded onOpenOutline={() => setShowOutline(true)} /></div>}</div>;
}
