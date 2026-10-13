"use client";

import React from "react";
import { PaintBucket, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/** Legacy parity: the old app shows a pulsing "Đang Quét..." indicator with a
 *  cancel affordance while a format-painter copy is in progress, so a user
 *  isn't left guessing why their cursor/clicks behave differently. This is
 *  the workspace engine's equivalent, driven by the shared
 *  `formatPainterStyle` store field (see useFormatPainter.ts). */
export function WorkspaceFormatPainterBanner() {
  const isActive = useWorkspaceStore((state) => state.formatPainterStyle !== null);
  const setFormatPainterStyle = useWorkspaceStore((state) => state.setFormatPainterStyle);

  if (!isActive) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-orange-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-orange-700 shadow-lg backdrop-blur dark:border-orange-800 dark:bg-slate-900/95 dark:text-orange-300">
        <PaintBucket className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
        <span>Painting style — click a block to apply</span>
        <button
          type="button"
          title="Cancel (Esc)"
          aria-label="Cancel format painter"
          onClick={() => setFormatPainterStyle(null)}
          className="rounded-full p-0.5 text-orange-500 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-950/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default WorkspaceFormatPainterBanner;
