"use client";

import React, { useCallback, useState } from "react";
import { Clock, Columns3, GitBranch, LayoutGrid, Workflow } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { type ArrangeColorPreset } from "../layout/arrangeColorPresets";
import { useArrangeSelectionActions } from "../hooks/useArrangeSelectionActions";
import { ArrangeColorPresetRow } from "./ArrangeColorPresetRow";

export function WorkspaceArrangeMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ArrangeColorPreset | null>(null);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const hasLockedSelection = selectedBlockIds.some((id) => blocks[id]?.style?.isLocked);
  const canArrange = selectedBlockIds.length >= 2;

  const onDone = useCallback(() => setOpen(false), []);
  const {
    handleArrangeFishbone,
    handleArrangeTimeline,
    handleArrangeCatalog,
    handleArrangeFlowchart,
  } = useArrangeSelectionActions(selectedPreset, onDone);

  if (!canArrange || isReadOnly) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? "flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
              : "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 data-[state=open]:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
          }
          title={hasLockedSelection ? "Unlock selected blocks to arrange" : "Arrange selection (Fishbone, Timeline, Grid, Flowchart)"}
          aria-label="Arrange selection"
          aria-expanded={open}
        >
          <LayoutGrid className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />
          {!compact && <span>Arrange</span>}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={compact ? "right" : "bottom"}
        align="start"
        sideOffset={8}
        className="w-56 p-2 rounded-xl z-50 shadow-xl border border-slate-200 dark:border-slate-800"
      >
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
          Arrange Selection
        </div>

        <div className="mt-1 space-y-1">
          <button
            type="button"
            onClick={handleArrangeFishbone}
            disabled={!canArrange || hasLockedSelection}
            title={hasLockedSelection ? "Unlock selected blocks to arrange" : "Central spine with alternating ribs"}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <GitBranch className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Fishbone
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Central spine with alternating ribs
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleArrangeTimeline}
            disabled={!canArrange || hasLockedSelection}
            title={hasLockedSelection ? "Unlock selected blocks to arrange" : "Sequential points along a timeline"}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Clock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Timeline
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Sequential points along a timeline
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleArrangeCatalog}
            disabled={!canArrange || hasLockedSelection}
            title={hasLockedSelection ? "Unlock selected blocks to arrange" : "Multi-column vertical grid"}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Columns3 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Grid
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Multi-column vertical grid
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleArrangeFlowchart}
            disabled={!canArrange || hasLockedSelection}
            title={hasLockedSelection ? "Unlock selected blocks to arrange" : "Vertical flow with orthogonal connectors"}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Workflow className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Flowchart
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Vertical flow with orthogonal connectors
              </span>
            </div>
          </button>
        </div>

        {hasLockedSelection && <p role="status" className="mt-2 px-2 text-[10px] text-amber-700 dark:text-amber-300">Unlock selected positions first.</p>}

        <ArrangeColorPresetRow
          selectedPresetId={selectedPreset?.id ?? null}
          onSelect={setSelectedPreset}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceArrangeMenu;
