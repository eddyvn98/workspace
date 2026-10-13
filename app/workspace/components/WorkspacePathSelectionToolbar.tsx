"use client";

import React, { useState } from "react";
import { Copy, ChevronDown, Edit3, FlipHorizontal, Layers2, Move, RotateCw, Scaling, Trash2 } from "lucide-react";
import type { BlockId, CanvasBlock } from "../types/block";
import { PathColorPopoverContent, PathWidthPopoverContent } from "./PathStylePanel";
import type { WorkspacePathCadCommand } from "../utils/pathCad";
import { WorkspaceSmartPopover } from "../utils/WorkspaceSmartPopover";

const buttonClass = "flex items-center gap-1 rounded-full p-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;

interface WorkspacePathSelectionToolbarProps {
  block: CanvasBlock<"path">;
  id: BlockId;
  toolbarRef: React.RefObject<HTMLDivElement>;
  style: { left: number; top: number } | null;
  onUpdate: (patch: { strokeColor?: string; strokeWidth?: number }) => void;
  onFlip: (axis: "horizontal" | "vertical") => void;
  onMove: () => void;
  onRotate: () => void;
  onTransform: () => void;
  onEditText: () => void;
  onOffset: () => void;
  onCopy: () => void;
  onDelete: () => void;
  cadCommand: WorkspacePathCadCommand | null;
}

export function WorkspacePathSelectionToolbar({
  block, toolbarRef, style, onUpdate, onFlip, onMove, onRotate, onTransform, onEditText, onOffset, onCopy, onDelete, cadCommand,
}: WorkspacePathSelectionToolbarProps) {
  const [active, setActive] = useState<"color" | "width" | null>(null);
  const pathData = block.data;
  const strokeColor = pathData.strokeColor ?? "#1e293b";
  const strokeWidth = pathData.strokeWidth ?? 2;
  const toggle = (key: "color" | "width") => setActive((current) => (current === key ? null : key));
  const commandClass = (command: WorkspacePathCadCommand) => cadCommand === command ? activeButtonClass : buttonClass;

  return (
    <div ref={toolbarRef} role="toolbar" aria-label="Freehand selection toolbar" onPointerDown={(event) => event.stopPropagation()} style={style ?? { top: 80, left: 16 }} className="fixed z-50 flex w-[355px] max-w-[calc(100vw-16px)] items-center gap-2 overflow-x-auto rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none scrollbar-none">
      <div className="flex min-w-max items-center gap-1">
        <div className="relative mr-1 border-r border-slate-200 pr-2 dark:border-slate-700">
          <button type="button" title="Choose color" aria-label="Choose color" aria-expanded={active === "color"} aria-haspopup="dialog" className={active === "color" ? activeButtonClass : buttonClass} onClick={() => toggle("color")}>
            <span className="h-4 w-4 rounded-full border border-slate-300 shadow-sm dark:border-slate-700" style={{ backgroundColor: strokeColor }} />
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {active === "color" && <WorkspaceSmartPopover defaultH="center" className="!z-50" onClose={() => setActive(null)}><PathColorPopoverContent currentStrokeColor={strokeColor} onSelectColor={(color) => { onUpdate({ strokeColor: color }); setActive(null); }} /></WorkspaceSmartPopover>}
        </div>
        <div className="relative -mr-0.5 border-r border-slate-200 pr-2 dark:border-slate-700">
          <button type="button" title="Choose stroke width" aria-label="Choose stroke width" aria-expanded={active === "width"} aria-haspopup="dialog" className={active === "width" ? activeButtonClass : buttonClass} onClick={() => toggle("width")}>
            <span className="flex h-4 w-4 items-center justify-center"><span className="rounded-full bg-slate-700 dark:bg-slate-200" style={{ width: Math.max(3, Math.min(10, strokeWidth * 2)), height: Math.max(3, Math.min(10, strokeWidth * 2)) }} /></span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {active === "width" && <WorkspaceSmartPopover defaultH="center" className="!z-50" onClose={() => setActive(null)}><PathWidthPopoverContent currentStrokeWidth={strokeWidth} onSelectWidth={(width) => { onUpdate({ strokeWidth: width }); setActive(null); }} /></WorkspaceSmartPopover>}
        </div>
        <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <button type="button" title="Edit Text" aria-label="Edit Text" className={buttonClass} onClick={onEditText}><Edit3 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Move" aria-label="Move" aria-pressed={cadCommand === "move"} className={commandClass("move")} onClick={onMove}><Move className="h-3.5 w-3.5" /></button>
        <button type="button" title="Copy" aria-label="Copy" aria-pressed={cadCommand === "copy"} className={commandClass("copy")} onClick={onCopy}><Copy className="h-3.5 w-3.5" /></button>
        <button type="button" title="Rotate" aria-label="Rotate" aria-pressed={cadCommand === "rotate"} className={commandClass("rotate")} onClick={onRotate}><RotateCw className="h-3.5 w-3.5" /></button>
        <button type="button" title="Transform (Size)" aria-label="Transform (Size)" aria-pressed={cadCommand === "transform"} className={commandClass("transform")} onClick={onTransform}><Scaling className="h-3.5 w-3.5" /></button>
        <button type="button" title="Mirror (Flip)" aria-label="Mirror (Flip)" aria-pressed={cadCommand === "mirror"} className={commandClass("mirror")} onClick={() => onFlip("horizontal")}><FlipHorizontal className="h-3.5 w-3.5" /></button>
        <button type="button" title="Offset" aria-label="Offset" aria-pressed={cadCommand === "offset"} className={commandClass("offset")} onClick={onOffset}><Layers2 className="h-3.5 w-3.5" /></button>
        <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <button type="button" title="Delete selected stroke" aria-label="Delete selected stroke" className="ml-3 flex items-center gap-1 rounded-full p-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/40" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default WorkspacePathSelectionToolbar;
