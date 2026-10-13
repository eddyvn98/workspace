"use client";

import React from "react";
import { Hand, LocateFixed, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { useWorkspaceViewportControls } from "../hooks/useWorkspaceViewportControls";

interface WorkspaceViewportBarProps {
  showModeToggle?: boolean;
}

export function WorkspaceViewportBar({ showModeToggle = true }: WorkspaceViewportBarProps) {
  const {
    zoom,
    dragMode,
    toggleDragMode,
    zoomAtCenter,
    handleFitView,
  } = useWorkspaceViewportControls();

  return (
    <div
      data-workspace-viewport-bar="true"
      className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] left-1/2 lg:left-[calc((100%_-_var(--workspace-chat-width,0px))_/_2)] -translate-x-1/2 w-max max-w-[95vw] lg:max-w-[calc(100%_-_var(--workspace-chat-width,0px)_-_1.5rem)] bg-white/90 dark:bg-[#0f1117]/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-2 rounded-2xl flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 sm:gap-x-3 shadow-xl z-40 overflow-visible"
      onPointerDown={(event) => event.stopPropagation()}
      aria-label="Workspace viewport controls"
    >
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-table-editor-viewport-control="true"
          onClick={() => zoomAtCenter(1 / 1.2)}
          className="h-8 w-8 sm:h-7 sm:w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 w-12 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          data-table-editor-viewport-control="true"
          onClick={() => zoomAtCenter(1.2)}
          className="h-8 w-8 sm:h-7 sm:w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
        <button
          type="button"
          data-table-editor-viewport-control="true"
          onClick={handleFitView}
          className="h-8 px-2.5 sm:h-7 sm:px-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
          title="Zoom all"
          aria-label="Zoom all"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          <span className="hidden min-[380px]:inline text-xs font-semibold">Zoom all</span>
        </button>
        {showModeToggle && (
          <button
            type="button"
            onClick={toggleDragMode}
            className={`h-8 px-2.5 sm:h-7 sm:px-2 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
              dragMode === "select"
                ? "bg-orange-500 text-white"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title={`${dragMode === "pan" ? "Pan" : "Select"} mode — hold Ctrl/Cmd and drag to select without switching; click to switch mode.`}
            aria-label={`${dragMode === "pan" ? "Pan" : "Select"} mode — hold Ctrl/Cmd and drag to select without switching; click to switch mode.`}
            aria-pressed={dragMode === "select"}
          >
            {dragMode === "pan" ? <Hand className="w-3.5 h-3.5" /> : <MousePointer2 className="w-3.5 h-3.5" />}
            <span className="hidden min-[380px]:inline text-xs font-semibold">
              {dragMode === "pan" ? "Pan" : "Select"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export default WorkspaceViewportBar;
