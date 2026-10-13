"use client";

import React from "react";
import { ChevronDown, GripVertical, MoreHorizontal } from "lucide-react";
import type { BlockStyle, CanvasBlock, ShapeKind } from "../types/block";
import { renderShapeIcon, WorkspaceToolbarTextStylePopover as ToolbarTextStylePopover, type WorkspaceTextStylePatch } from "./WorkspaceToolbarPrimitives";
import { WorkspaceNodeStylePopover } from "./WorkspaceNodeStylePopover";
import { WorkspaceFontSizePopover, WorkspaceTextColorPopover } from "./WorkspaceTextControlsPopovers";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";
import { activeButtonClass, buttonClass, toLegacyShapeValue } from "./WorkspaceSelectionToolbar";

export type GroupStylePopoverKey = "shape" | "text" | "size" | "align" | "more" | null;
export type GroupTextData = {
  fontSize?: number;
  align?: "left" | "center" | "right";
  padding?: number;
  fontWeight?: "normal" | "bold" | number;
  fontStyle?: "normal" | "italic";
  fontUnderline?: boolean;
  fontStrikethrough?: boolean;
  textStyle?: NonNullable<WorkspaceTextStylePatch["textStyle"]>;
  verticalAlign?: "top" | "middle" | "bottom";
};

interface GroupStylePanelControlsProps {
  selectedBlockIds: string[];
  primaryBlock: CanvasBlock;
  primaryShapeKind?: ShapeKind;
  primaryTextData: GroupTextData | null;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  below: boolean;
  mixedFontWeight: boolean;
  mixedFontStyle: boolean;
  mixedUnderline: boolean;
  mixedStrikethrough: boolean;
  active: GroupStylePopoverKey;
  toggle: (key: Exclude<GroupStylePopoverKey, null>) => void;
  onStyle: (patch: Partial<BlockStyle>) => void;
  onShape: (kind: ShapeKind) => void;
  onFontSize: (size: number) => void;
  onTextStyle: (patch: Partial<WorkspaceTextStylePatch>) => void;
  onCopy: () => void;
  onPasteStyle: () => void;
  canPasteStyle: boolean;
  onDelete: () => void;
  toolbarRef: React.RefObject<HTMLDivElement>;
  anchoredStyle: { left: number; top: number } | null;
}

function ToolbarPopover({ active, name, title, onToggle, children }: {
  active: GroupStylePopoverKey;
  name: Exclude<GroupStylePopoverKey, null>;
  title: string;
  onToggle: (key: Exclude<GroupStylePopoverKey, null>) => void;
  children: React.ReactNode;
}) {
  return <div className="relative"><button type="button" title={title} aria-label={title} aria-expanded={active === name} aria-haspopup="dialog" className={active === name ? activeButtonClass : buttonClass} onClick={() => onToggle(name)}>{children}</button></div>;
}

export function GroupStylePanelControls({
  selectedBlockIds, primaryBlock, primaryShapeKind, primaryTextData, backgroundColor,
  textColor, fontSize, below, mixedFontWeight, mixedFontStyle, mixedUnderline,
  mixedStrikethrough, active, toggle, onStyle, onShape, onFontSize, onTextStyle,
  onCopy, onPasteStyle, canPasteStyle, onDelete, toolbarRef, anchoredStyle,
}: GroupStylePanelControlsProps) {
  return (
    <div ref={toolbarRef} role="toolbar" aria-label="Selection toolbar" onPointerDown={(event) => event.stopPropagation()} style={anchoredStyle ?? { top: 80, left: 16 }} className="fixed z-50 flex w-max max-w-[calc(100vw-16px)] flex-wrap items-center gap-1.5 overflow-visible rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <GripVertical className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400 select-none">{selectedBlockIds.length} selected</span>
        <ToolbarPopover active={active} name="shape" title="Style & Shape Node" onToggle={toggle}>
          <span className="flex h-4 w-5 items-center justify-center">{renderShapeIcon(toLegacyShapeValue(primaryShapeKind))}</span>
          <span className="h-3.5 w-3.5 rounded border border-black/15" style={{ backgroundColor }} />
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </ToolbarPopover>
        <ToolbarPopover active={active} name="text" title="Text Color" onToggle={toggle}>
          <span className="border-b-2 px-0.5 text-sm font-bold" style={{ color: textColor, borderColor: textColor }}>A</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </ToolbarPopover>
        <ToolbarPopover active={active} name="size" title="Font Size" onToggle={toggle}>
          <span className="tabular-nums">{fontSize}px</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </ToolbarPopover>
        <ToolbarTextStylePopover
          open={active === "align"}
          togglePopover={() => toggle("align")}
          updateNodeStyle={onTextStyle}
          currentTextStyle={primaryTextData?.textStyle ?? "plain"}
          currentFontWeight={typeof primaryTextData?.fontWeight === "number" ? (primaryTextData.fontWeight >= 600 ? "bold" : "normal") : primaryTextData?.fontWeight ?? "normal"}
          currentFontStyle={primaryTextData?.fontStyle ?? "normal"}
          currentUnderline={primaryTextData?.fontUnderline ?? false}
          currentStrikethrough={primaryTextData?.fontStrikethrough ?? false}
          currentAlign={primaryTextData?.align ?? "left"}
          currentVerticalAlign={primaryTextData?.verticalAlign ?? "middle"}
          currentTextPadding={primaryTextData?.padding ?? 8}
          mixedFontWeight={mixedFontWeight}
          mixedFontStyle={mixedFontStyle}
          mixedUnderline={mixedUnderline}
          mixedStrikethrough={mixedStrikethrough}
        />
        <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <ToolbarPopover active={active} name="more" title="More actions" onToggle={toggle}><MoreHorizontal className="h-4 w-4" /></ToolbarPopover>
      </div>
      {active === "shape" && <WorkspaceNodeStylePopover kind={primaryShapeKind} style={primaryBlock.style} onClose={() => toggle("shape")} onShape={onShape} updateStyle={onStyle} />}
      {active === "text" && <WorkspaceTextColorPopover textColor={primaryBlock.style?.textColor} onPick={onStyle} onClose={() => toggle("text")} />}
      {active === "size" && <WorkspaceFontSizePopover currentSize={fontSize} onPick={onFontSize} onClose={() => toggle("size")} />}
      {active === "more" && <SwatchPopover isOpen onClose={() => toggle("more")} title="More Actions" placeBelow={below}><div className="flex min-w-[150px] flex-col gap-0.5"><button type="button" className="rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onCopy}>Copy</button><button type="button" disabled={!canPasteStyle} className="rounded px-2 py-1 text-left text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800" onClick={onPasteStyle}>Paste Style</button><button type="button" className="rounded px-2 py-1 text-left text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={onDelete}>Delete</button></div></SwatchPopover>}
    </div>
  );
}
