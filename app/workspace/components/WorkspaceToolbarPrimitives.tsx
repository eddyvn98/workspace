"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, GitBranchPlus, Italic, List, ListOrdered, Plus, Quote, Strikethrough, Type, Underline } from "lucide-react";
import { WorkspaceSmartPopover } from "../utils/WorkspaceSmartPopover";
import { renderShapeIcon as renderLegacyShapeIcon } from "../../mindmap/components/toolbar/renderShapeIcon";
import { WorkspaceMapLayoutDirectionThumbnail, WorkspaceMapLayoutStructureIcon } from "./layout/WorkspaceMapLayoutOptionIcons";
import { getMapLineStyleIcon } from "./WorkspaceConnectorIcons";
import type { WorkspaceMapLayoutDirection, WorkspaceMapLayoutFamily } from "../utils/layout";

export type WorkspaceTextStylePatch = {
  fontSize?: number;
  textColor?: string;
  bgColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  fontUnderline?: boolean;
  fontStrikethrough?: boolean;
  fontAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  textStyle?: "plain" | "bullet" | "numbered" | "quote";
  textPadding?: number;
};

export function renderShapeIcon(shapeValue: string) {
  return renderLegacyShapeIcon(shapeValue);
}

export const STRUCTURES = [
  { id: "logical-right", family: "hierarchy", label: "Hierarchy" },
  { id: "catalog", family: "catalog", label: "Treeview" },
  { id: "timeline", family: "timeline", label: "Timeline" },
  { id: "fishbone", family: "fishbone", label: "Fishbone" },
  { id: "flowchart", family: "flowchart", label: "Flowchart" },
  { id: "swimlane", family: "swimlane", label: "Swimlane" },
] as const;
export const DIRECTIONS: readonly { id: WorkspaceMapLayoutDirection; angle: number; label: string }[] = [
  { id: "right", angle: 0, label: "Right" }, { id: "left", angle: 180, label: "Left" },
  { id: "down", angle: 90, label: "Down" }, { id: "up", angle: -90, label: "Up" },
];
export const LINE_STYLES = [
  { id: "curved", label: "Curved" }, { id: "orthogonal", label: "Elbow" }, { id: "straight", label: "Straight" },
] as const;
export const LAYOUT_ICONS: Record<string, React.ReactNode> = {
  "logical-right": <WorkspaceMapLayoutStructureIcon family="hierarchy" />,
  catalog: <WorkspaceMapLayoutStructureIcon family="treeview" />,
  timeline: <WorkspaceMapLayoutStructureIcon family="timeline" />,
  fishbone: <WorkspaceMapLayoutStructureIcon family="fishbone" />,
  flowchart: <WorkspaceMapLayoutStructureIcon family="flowchart" />,
  swimlane: <WorkspaceMapLayoutStructureIcon family="swimlane" />,
};

export function DirectionThumbnail({ family, direction, growthMode }: { family: "catalog" | "hierarchy" | "timeline" | "fishbone"; direction: WorkspaceMapLayoutDirection; growthMode?: "one-side" | "both-side" }) {
  const mapped = family === "catalog" ? "treeview" : family;
  return <WorkspaceMapLayoutDirectionThumbnail family={mapped as WorkspaceMapLayoutFamily} direction={direction} growthMode={growthMode} />;
}

export function MapLayoutColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="h-fit w-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</div>{children}</section>;
}

export function PaletteOption({ name, colors, selected, onClick }: { name: string; colors: string[]; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selected ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}><span className="flex gap-0.5">{colors.slice(0, 5).map((color, index) => <i key={index} className="h-3 w-3 rounded-full" style={{ background: color }} />)}</span><span className="min-w-0 flex-1 truncate">{name}</span>{selected && <Check className="h-3 w-3 shrink-0 text-orange-500" />}</button>;
}

export function LineContentPanel({ availableLines, connectionStyle, selectLine }: { availableLines: readonly string[]; connectionStyle: string; selectLine: (line: "curved" | "orthogonal" | "straight") => void; isCascade?: boolean; setOpenThrough?: React.Dispatch<React.SetStateAction<number>>; paletteStage?: number }) {
  return <div className="flex flex-col gap-1.5">{LINE_STYLES.filter((line) => availableLines.includes(line.id)).map((line) => <button type="button" key={line.id} onClick={() => selectLine(line.id)} aria-label={line.label} className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${connectionStyle === line.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{getMapLineStyleIcon(line.id, "h-9 w-16 shrink-0")}<span>{line.label}</span></button>)}</div>;
}

export function ToolbarQuickAdd({ activePopover, togglePopover, setActivePopover, handleAddChild, handleAddSibling, canAddSibling }: { activePopover: string | null; togglePopover: (popover: string | null) => void; setActivePopover: (popover: string | null) => void; handleAddChild: () => void; handleAddSibling: () => void; canAddSibling: boolean }) {
  const addChild = () => { handleAddChild(); setActivePopover(null); };
  return <div className="relative flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"><button type="button" onClick={addChild} className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200" title="Add child node (Tab)"><Plus className="h-3.5 w-3.5" /><span>Add</span></button><button type="button" onClick={() => togglePopover("quickAdd")} className="border-l border-slate-200 px-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700" aria-label="More add options" aria-expanded={activePopover === "quickAdd"}><ChevronDown className="h-3.5 w-3.5" /></button>{activePopover === "quickAdd" && <WorkspaceSmartPopover defaultH="right"><div className="min-w-[156px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"><button type="button" onClick={addChild} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-50"><Plus className="h-3.5 w-3.5 text-slate-400" />Add child</button>{canAddSibling && <button type="button" onClick={() => { handleAddSibling(); setActivePopover(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-50"><GitBranchPlus className="h-3.5 w-3.5 text-slate-400" />Add sibling</button>}</div></WorkspaceSmartPopover>}</div>;
}

export function WorkspaceToolbarTextStylePopover({ open, togglePopover, updateNodeStyle, currentTextStyle, currentFontWeight, currentFontStyle, currentUnderline, currentStrikethrough, currentAlign, currentVerticalAlign, currentTextPadding }: { open: boolean; togglePopover: (popover: string | null) => void; updateNodeStyle: (updates: Partial<WorkspaceTextStylePatch>) => void; currentTextStyle: NonNullable<WorkspaceTextStylePatch["textStyle"]>; currentFontWeight: "normal" | "bold"; currentFontStyle: "normal" | "italic"; currentUnderline: boolean; currentStrikethrough: boolean; currentAlign: "left" | "center" | "right"; currentVerticalAlign: "top" | "middle" | "bottom"; currentTextPadding: number; mixedFontWeight?: boolean; mixedFontStyle?: boolean; mixedUnderline?: boolean; mixedStrikethrough?: boolean }) {
  const align = currentAlign === "center" ? AlignCenter : currentAlign === "right" ? AlignRight : AlignLeft;
  const AlignIcon = align;
  const toggle = (patch: Partial<WorkspaceTextStylePatch>) => updateNodeStyle(patch);
  const format: Array<["plain" | "bullet" | "numbered" | "quote", React.ComponentType<{ className?: string }>, string]> = [["plain", Type, "Plain text"], ["bullet", List, "Bullet list"], ["numbered", ListOrdered, "Numbered list"], ["quote", Quote, "Block quote"]];
  const formatActions: Array<{ label: string; Icon: React.ComponentType<{ className?: string }>; active: boolean; patch: Partial<WorkspaceTextStylePatch> }> = [
    { label: "Bold", Icon: Bold, active: currentFontWeight === "bold", patch: { fontWeight: currentFontWeight === "bold" ? "normal" : "bold" } },
    { label: "Italic", Icon: Italic, active: currentFontStyle === "italic", patch: { fontStyle: currentFontStyle === "italic" ? "normal" : "italic" } },
    { label: "Underline", Icon: Underline, active: currentUnderline, patch: { fontUnderline: !currentUnderline } },
    { label: "Strikethrough", Icon: Strikethrough, active: currentStrikethrough, patch: { fontStrikethrough: !currentStrikethrough } },
  ];
  return <div className="relative"><button type="button" onClick={() => togglePopover("align")} className={`flex items-center gap-1 rounded-lg p-1.5 text-xs ${open ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100"}`} title="Text style & alignment"><span className="font-bold">Aa</span><AlignIcon className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3" /></button>{open && <WorkspaceSmartPopover defaultH="center"><div className="flex w-fit flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"><div className="flex gap-0.5 px-1 py-1">{format.map(([style, Icon, label]) => <button type="button" key={style} onClick={() => toggle({ textStyle: style })} className={`rounded-md p-1.5 ${currentTextStyle === style ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`} title={label} aria-label={label}><Icon className="h-3.5 w-3.5" /></button>)}</div><div className="flex gap-0.5 px-1">{formatActions.map(({ label, Icon, active, patch }) => <button type="button" key={label} aria-pressed={active} title={label} aria-label={label} onClick={() => toggle(patch)} className={`rounded p-1.5 ${active ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`}><Icon className="h-3.5 w-3.5" /></button>)}</div><WorkspaceNodeAlignmentPicker currentAlign={currentAlign} currentVerticalAlign={currentVerticalAlign} onSelect={({ fontAlign, verticalAlign }) => toggle({ fontAlign, verticalAlign })} /><label className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-slate-500" title="Padding in pixels">Padding<input type="number" min="0" max="100" value={currentTextPadding} onChange={(event) => toggle({ textPadding: Number(event.target.value) })} className="w-14 rounded border px-1" /></label></div></WorkspaceSmartPopover>}</div>;
}

function WorkspaceNodeAlignmentPicker({ currentAlign, currentVerticalAlign, onSelect }: { currentAlign: "left" | "center" | "right"; currentVerticalAlign: "top" | "middle" | "bottom"; onSelect: (alignment: { fontAlign: "left" | "center" | "right"; verticalAlign: "top" | "middle" | "bottom" }) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rows = ["top", "middle", "bottom"] as const;
  const columns = ["left", "center", "right"] as const;

  React.useEffect(() => {
    if (!expanded) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [expanded]);

  const renderCell = (vertical: (typeof rows)[number], horizontal: (typeof columns)[number], expand: boolean) => (
    <button
      type="button"
      key={`${vertical}-${horizontal}`}
      onClick={() => expand ? setExpanded(true) : (onSelect({ fontAlign: horizontal, verticalAlign: vertical }), setExpanded(false))}
      className={`flex items-center justify-center rounded p-1.5 ${!expand && currentAlign === horizontal && currentVerticalAlign === vertical ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
      title={`Align node ${vertical} ${horizontal}`}
      aria-label={`Align node ${vertical} ${horizontal}`}
    >
      <span className="relative h-3.5 w-4 rounded-[2px] border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"><span className={`absolute h-1.5 w-1.5 rounded-[0.5px] bg-slate-800 dark:bg-slate-200 ${horizontal === "left" ? "left-[1.5px]" : horizontal === "right" ? "right-[1.5px]" : "left-1/2 -translate-x-1/2"} ${vertical === "top" ? "top-[1.5px]" : vertical === "bottom" ? "bottom-[1.5px]" : "top-1/2 -translate-y-1/2"}`} /></span>
    </button>
  );

  return <div ref={containerRef} className="flex flex-col"><div className="px-2 pt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">Node alignment</div>{expanded ? <div className="inline-grid grid-cols-3 gap-0.5 mx-1 w-fit rounded-md border border-slate-200 bg-slate-50/90 p-0.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">{rows.flatMap((vertical) => columns.map((horizontal) => renderCell(vertical, horizontal, false)))}</div> : <div className="flex w-fit cursor-pointer items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50" title="Click to expand 9 alignment positions" aria-label="Click to expand 9 alignment positions">{columns.map((horizontal) => renderCell(currentVerticalAlign, horizontal, true))}</div>}</div>;
}
