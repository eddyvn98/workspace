"use client";
import { WorkspaceSpatialControls } from "./WorkspaceSpatialControls";

import React, { useEffect, useRef, useState } from "react";
import { Hand, LayoutTemplate, MonitorPlay, MousePointer2, Pencil } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { selectedMapRootId } from "../layout/mapRoot";
import { useCanvasToolsPanelToggle } from "../hooks/useCanvasToolsPanelToggle";
import { WorkspaceAddShapeButtons } from "./WorkspaceAddShapeButtons";
import { FreehandToolPicker } from "./FreehandToolPicker";
import { WorkspaceConnectorToolPicker } from "./WorkspaceConnectorToolPicker";
import { WorkspaceInsertPanel } from "./WorkspaceInsertPanel";
import { WorkspaceMapLayoutAdapter } from "./WorkspaceMapLayoutAdapter";
import { WorkspaceArrangeMenu } from "./WorkspaceArrangeMenu";

export interface WorkspaceFloatingToolbarProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WorkspaceFloatingToolbar() {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const dragMode = useWorkspaceStore((state) => state.dragMode);
  const setDragMode = useWorkspaceStore((state) => state.setDragMode);
  const isDrawMode = useWorkspaceStore((state) => state.isDrawMode);
  const setIsDrawMode = useWorkspaceStore((state) => state.setIsDrawMode);
  const activeFreehandTool = useWorkspaceStore((state) => state.activeFreehandTool);
  const setActiveFreehandTool = useWorkspaceStore((state) => state.setActiveFreehandTool);
  const activeConnectorTool = useWorkspaceStore((state) => state.activeConnectorTool);
  const setActiveConnectorTool = useWorkspaceStore((state) => state.setActiveConnectorTool);
  const armedShapeKind = useWorkspaceStore((state) => state.armedShapeKind);
  const setArmedShapeKind = useWorkspaceStore((state) => state.setArmedShapeKind);

  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const structurePanelRef = useRef<HTMLDivElement>(null);
  const { isCanvasToolsPanelOpen, toggleCanvasToolsPanel } = useCanvasToolsPanelToggle();

  const isAnyToolActive =
    isDrawMode ||
    activeConnectorTool !== null ||
    armedShapeKind !== null;
  const isEditingMap = Boolean(selectedMapRootId({ blocks, selectedBlockIds }));
  const mapLayoutTitle = isEditingMap
    ? "Map Layout (Editing active map)"
    : "Map Layout (Create new map)";

  // Escape key to cancel active tools or close menus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isStructureOpen) {
          setIsStructureOpen(false);
        } else if (isDrawMode) {
          setIsDrawMode(false);
        } else if (activeConnectorTool !== null) {
          setActiveConnectorTool(null);
        } else if (armedShapeKind !== null) {
          setArmedShapeKind(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isStructureOpen,
    isDrawMode,
    activeConnectorTool,
    armedShapeKind,
    setIsDrawMode,
    setActiveConnectorTool,
    setArmedShapeKind,
  ]);

  // Click outside to close structure menu
  useEffect(() => {
    if (!isStructureOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!structurePanelRef.current?.contains(e.target as Node)) {
        setIsStructureOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isStructureOpen]);

  const handlePanSelectClick = () => {
    if (isAnyToolActive) {
      setDragMode("pan");
      setIsDrawMode(false);
      setActiveConnectorTool(null);
      setArmedShapeKind(null);
      return;
    }
    setDragMode(dragMode === "pan" ? "select" : "pan");
  };

  const handleDrawToggle = () => {
    const next = !isDrawMode;
    setIsDrawMode(next);
    if (next) {
      setActiveConnectorTool(null);
      setArmedShapeKind(null);
      if (!activeFreehandTool) {
        setActiveFreehandTool("pen");
      }
    }
  };

  return (
    <>
      <div
        className="absolute left-2 top-20 sm:left-4 sm:top-24 z-[60] bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-1 sm:p-1.5 flex flex-col gap-1 sm:gap-1.5 shadow-xl transition-all"
        onPointerDown={(event) => event.stopPropagation()}
        role="toolbar"
        aria-label="Workspace tool rail"
      >
        {/* 1. Map Layout / Structure button */}
        <div className="relative" ref={structurePanelRef}>
          <button
            type="button"
            onClick={() => setIsStructureOpen((prev) => !prev)}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isStructureOpen
                ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 ring-2 ring-orange-400/30"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
            title={mapLayoutTitle}
            aria-label="Map Layout"
            aria-expanded={isStructureOpen}
            aria-haspopup="dialog"
            data-workspace-map-layout-trigger="true"
          >
            <LayoutTemplate className="w-4 h-4" />
          </button>
          {isStructureOpen && (
            <div className="absolute left-full top-0 pl-2 z-50">
              <WorkspaceMapLayoutAdapter onMapCreated={() => setIsStructureOpen(false)} />
            </div>
          )}
        </div>

        {/* 2. Insert panel — Doc / Table / Slides */}
        <WorkspaceInsertPanel />
        <WorkspaceSpatialControls />
        <WorkspaceArrangeMenu compact />

        {/* 2c. Presentation frames panel toggle — any block, any type, can be
         *  saved as a numbered camera bookmark and played back in Present
         *  mode (see WorkspaceFramesPanel.tsx / WorkspacePresentOverlay.tsx). */}
        <button
          type="button"
          onClick={toggleCanvasToolsPanel}
          className={`flex h-8 w-8 items-center justify-center rounded-xl p-2 transition-all cursor-pointer ${
            isCanvasToolsPanelOpen
              ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
          title="Presentation frames (present any block)"
          aria-label="Toggle presentation frames panel"
          aria-pressed={isCanvasToolsPanelOpen}
        >
          <MonitorPlay className="w-4 h-4" />
        </button>

        {/* 3. Pan / Select mode toggle */}
        <button
          type="button"
          onClick={handlePanSelectClick}
          className={`flex h-8 w-8 items-center justify-center rounded-xl p-2 transition-all cursor-pointer ${
            dragMode === "select" && !isAnyToolActive
              ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
              : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
          title={
            isAnyToolActive
              ? "Exit current tool and switch to Pan mode"
              : `${dragMode === "pan" ? "Pan" : "Select"} mode — hold Ctrl/Cmd and drag to select without switching; click to switch mode.`
          }
          aria-label={
            isAnyToolActive
              ? "Exit current tool and switch to Pan mode"
              : `${dragMode === "pan" ? "Pan" : "Select"} mode — hold Ctrl/Cmd and drag to select without switching; click to switch mode.`
          }
          aria-pressed={dragMode === "select"}
        >
          {dragMode === "pan" ? (
            <Hand className="w-4 h-4" />
          ) : (
            <MousePointer2 className="w-4 h-4" />
          )}
        </button>

        {/* 4. Freehand drawing mode */}
        <div className="relative">
          <button
            type="button"
            onClick={handleDrawToggle}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isDrawMode
                ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
            title="Freehand Drawing Tool (Pen)"
            aria-label="Freehand drawing tool"
            aria-pressed={isDrawMode}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        <WorkspaceConnectorToolPicker compact />

        <WorkspaceAddShapeButtons compact />
      </div>

      {isDrawMode && (
        <div className="absolute left-1/2 top-[136px] z-40 max-w-[95vw] -translate-x-1/2">
          <div
            className="flex items-center gap-2 overflow-x-auto rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md whitespace-nowrap dark:border-slate-800 dark:bg-slate-900/95 scrollbar-none"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <FreehandToolPicker />
          </div>
        </div>
      )}

    </>
  );
}
export default WorkspaceFloatingToolbar;
