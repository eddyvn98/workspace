"use client";

import React, { useCallback, useState } from "react";
import { ChevronDown, FileText, GripVertical, MessageSquare, MoreHorizontal, Proportions, Sparkles } from "lucide-react";
import { applyDocAspectRatio } from "../utils/applyDocAspectRatio";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useFloatingToolbarPosition } from "../hooks/useFloatingToolbarPosition";
import { useTreeAutoArrange } from "../hooks/useTreeAutoArrange";
import { useBlockContextMenuActions } from "../hooks/useBlockContextMenuActions";
import { useWorkspacePathCad } from "../hooks/useWorkspacePathCad";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";
import { WorkspacePathSelectionToolbar } from "./WorkspacePathSelectionToolbar";
import { WorkspaceTableSelectionToolbar } from "./WorkspaceTableSelectionToolbar";
import { WorkspaceFileSelectionToolbar } from "./WorkspaceFileSelectionToolbar";
import { WorkspaceImageSelectionToolbar } from "./WorkspaceImageSelectionToolbar";
import { WorkspaceDocFormatToolbar } from "./WorkspaceDocFormatToolbar";
import { isPdfPreviewable } from "../utils/fileBlockPreview";
import { WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, type TableCellEditorCommand } from "./table/TableCellEditorToolbar";
import { isStandaloneContentBlockType, type CanvasBlock, type MapLayoutSettings, type ShapeKind } from "../types/block";
import { LAYOUT_ICONS, LineContentPanel, LINE_STYLES, MapLayoutColumn, PaletteOption, renderShapeIcon, ToolbarQuickAdd, WorkspaceToolbarTextStylePopover as ToolbarTextStylePopover, WorkspaceTextStylePatch } from "./WorkspaceToolbarPrimitives";
import { WorkspaceSmartPopover as SmartPopover } from "../utils/WorkspaceSmartPopover";
import { WorkspaceMapLayoutPicker } from "./layout";
import { WorkspaceAiNodePrompt } from "./WorkspaceAiNodePrompt";
import { useWorkspaceAiNodeEdit } from "../hooks/useWorkspaceAiNodeEdit";
import { WorkspaceNodeStylePopover } from "./WorkspaceNodeStylePopover";
import { WorkspaceFontSizePopover, WorkspaceTextColorPopover } from "./WorkspaceTextControlsPopovers";
import { WorkspaceNodeContentPopover } from "./WorkspaceNodeContentPopover";
import { applyWorkspaceMapLayoutPatch } from "../layout/applyMapLayoutPatch";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { STRUCTURES as MAP_LAYOUT_STRUCTURES } from "../utils/layout/mapLayoutConfig";
import { applyWorkspaceStylePreset } from "../utils/layout/workspaceStylePreset";
import { isImageFlowBlock } from "../types/imageFlow";

// This inline "convert this map's structure" picker only offers the mind-map
// families: Flowchart/Swimlane use decision branches and merges that a
// mind-map structure can't represent, so they aren't valid in-place convert
// targets here (matches ToolbarRootMapButtons in the mindmap app). Creating a
// brand-new Flowchart/Swimlane map still goes through the "Insert" dock.
const MAP_STRUCTURE_CONVERT_OPTIONS = MAP_LAYOUT_STRUCTURES.filter((option) => option.family === "hierarchy" || option.family === "treeview" || option.family === "timeline" || option.family === "fishbone");
import {
  getWorkspaceConnectorPalette,
  WORKSPACE_CONNECTOR_PALETTES,
  type WorkspaceConnectorLineType,
  type WorkspaceConnectorPaletteId,
} from "../connectors/connectorStyle";

type PopoverKey = "shape" | "layout" | "mapStyle" | "text" | "size" | "align" | "content" | "ratio" | "ai" | "more" | null;

/** Presets for the doc block's "fit-to-ratio" toolbar button — see
 *  applyDocAspectRatio.ts for how a pick avoids clipping the doc's content
 *  or leaving a tall blank box under it. Free-form drag resizing (the
 *  block's own corner handles) stays the default; this is just a shortcut. */
const DOC_ASPECT_PRESETS: Array<{ label: string; ratio: number }> = [
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
];
type TextAlign = "left" | "center" | "right";
type VerticalAlign = "top" | "middle" | "bottom";
const LEGACY_LAYOUT_KEY: Record<string, string> = { hierarchy: "logical-right", treeview: "catalog", timeline: "timeline", fishbone: "fishbone" };
export const buttonClass = "flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
export const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;

export function toLegacyShapeValue(kind?: ShapeKind) {
  if (kind === "rectangle") return "rounded";
  if (kind === "box") return "rounded_rect";
  if (kind === "ellipse") return "circle";
  if (kind === "cloud") return "cloud_rect";
  if (kind === "sticky" || kind === "sticky_note") return "rounded_rect";
  if (kind === "plain_text") return "text";
  return kind ?? "rounded";
}

function ToolbarPopover({ active, name, title, ariaLabel, onToggle, gap = "gap-1", children }: { active: PopoverKey; name: Exclude<PopoverKey, null>; title: string; ariaLabel?: string; onToggle: (key: Exclude<PopoverKey, null>) => void; below?: boolean; gap?: "gap-0.5" | "gap-1" | "gap-1.5"; children: React.ReactNode }) {
  const classes = gap === "gap-1" ? buttonClass : buttonClass.replace("gap-1", gap);
  return <div className="relative"><button type="button" title={title} aria-label={ariaLabel ?? title} aria-expanded={active === name} aria-haspopup="dialog" className={active === name ? `${classes} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400` : classes} onClick={() => onToggle(name)}>{children}</button></div>;
}

export function WorkspaceSelectionToolbar() {
  const [active, setActive] = useState<PopoverKey>(null);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const selectedIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const setPendingDescriptionBlockId = useWorkspaceStore((state) => state.setPendingDescriptionBlockId);
  const activeCommentBlockId = useWorkspaceStore((state) => state.activeCommentBlockId);
  const setActiveCommentBlockId = useWorkspaceStore((state) => state.setActiveCommentBlockId);
  const activeRichTextEditor = useWorkspaceStore((state) => state.activeRichTextEditor);
  const boardId = useWorkspaceStore((state) => state.boardId);
  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const block = id ? blocks[id] : null;
  const isShapeRichEditorActive = block?.type === "shape" && activeRichTextEditor?.blockId === id;
  const shapeActiveMarks = isShapeRichEditorActive ? activeRichTextEditor!.activeMarks : null;
  // The doc block's own formatting toolbar (Bold/Heading/List/Checklist/
  // Quote/Link) moved out of WorkspaceDocRichEditor.tsx into this floating
  // bar — same activeRichTextEditor channel the shape label editor uses.
  const isDocRichEditorActive = (block?.type === "doc" || block?.type === "slideDeck") && activeRichTextEditor?.blockId === id;
  const docCommands = isDocRichEditorActive ? activeRichTextEditor!.commands : null;
  const docActiveMarks = isDocRichEditorActive ? activeRichTextEditor!.activeMarks : null;
  const { toolbarRef, style, placement, handleToolbarDragStart } = useFloatingToolbarPosition(id);
  const actions = useBlockContextMenuActions();
  const pathCad = useWorkspacePathCad();
  const { addChildBlock, addSiblingBlock, splitBlockToNewMap } = useTreeAutoArrange();
  const { isRunning: isAiRunning, runAiNodeEdit } = useWorkspaceAiNodeEdit();
  const toggle = useCallback((key: Exclude<PopoverKey, null>) => setActive((current) => current === key ? null : key), []);
  if (!block || !id || isReadOnly || isImageFlowBlock(block)) return null;

  const mapRootId = isStandaloneContentBlockType(block.type) ? null : findMapRootId(blocks, id);
  const isMapRootSelected = mapRootId === id;
  const mapState = useWorkspaceStore.getState();
  const mapLayout = mapRootId ? currentMapLayout(mapState, mapRootId) : null;
  const treeConnectorLineType = mapLayout?.connectorLineType ?? mapState.treeConnectorLineType;
  const treeConnectorPaletteId = mapLayout?.connectorPaletteId ?? mapState.treeConnectorPaletteId;
  const layoutFamily = mapLayout?.family ?? mapState.treeLayoutFamily;
  const updateMapLayout = (patch: Partial<MapLayoutSettings>) => {
    if (!mapRootId) return;
    applyWorkspaceMapLayoutPatch(mapRootId, patch);
  };

  if (block.type === "path") {
    const pathBlock = block as CanvasBlock<"path">;
    return <WorkspacePathSelectionToolbar
      block={pathBlock}
      id={id}
      toolbarRef={toolbarRef}
      style={style}
      onUpdate={(patch) => updateBlock(id, { data: { ...block.data, ...patch } as typeof block.data })}
      onFlip={() => pathCad.arm("mirror")}
      onMove={() => pathCad.arm("move")}
      onRotate={() => pathCad.arm("rotate")}
      onTransform={() => pathCad.arm("transform")}
      onEditText={pathBlock.data.tool === "arrow_line" ? () => setPendingEditBlockId(id) : () => undefined}
      onOffset={() => pathCad.arm("offset")}
      onCopy={() => pathCad.arm("copy")}
      cadCommand={pathCad.command}
      onDelete={() => actions.deleteBlock(id)}
    />;
  }

  if (block.type === "file" && isPdfPreviewable(block.data as CanvasBlock<"file">["data"])) {
    return <WorkspaceFileSelectionToolbar block={block as CanvasBlock<"file">} id={id} toolbarRef={toolbarRef} style={style} />;
  }

  if (block.type === "image") {
    return <WorkspaceImageSelectionToolbar block={block as CanvasBlock<"image">} id={id} toolbarRef={toolbarRef} style={style} />;
  }

  if (block.type === "table") {
    const tableData = block.data as CanvasBlock<"table">["data"];
    if (block.embeddedInDocId) return null;
    return <WorkspaceTableSelectionToolbar
      block={block as CanvasBlock<"table">}
      id={id}
      toolbarRef={toolbarRef}
      style={style}
      onToggleHeaderRow={() => updateBlock(id, { data: { ...tableData, headerRow: !tableData.headerRow } })}
      onCellCommand={(command: TableCellEditorCommand) => window.dispatchEvent(new CustomEvent(WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, { detail: command }))}
      onDragStart={(e) => {
        setActive(null);
        handleToolbarDragStart(e);
      }}
    />;
  }

  const isText = block.type === "text";
  // These have their own inline chrome; the font/fill/shape/align controls below don't apply.
  const isMediaBlock = block.type === "doc" || block.type === "file" || block.type === "link";
  const displayStyle = applyWorkspaceStylePreset(block, blocks).style;
  const shapeKind = block.type === "shape" ? (block.data as { shapeKind?: ShapeKind }).shapeKind : block.style?.shapeKind;
  const data = isText ? block.data as { fontSize?: number; align?: TextAlign } : null;
  const fontSize = data?.fontSize ?? 11;
  const below = placement === "below" || (style?.top ?? 80) < 80;
  const updateData = (patch: Record<string, unknown>) => updateBlock(id, { data: { ...(block.data as object), ...patch } as typeof block.data });
  const updateStyle = (patch: Record<string, unknown>) => {
    const colorKeys = ["backgroundColor", "backgroundOpacity", "borderColor", "textColor"] as const;
    const managedFields = { ...(block.style?.paletteManagedFields ?? {}) };
    for (const key of colorKeys) if (key in patch) managedFields[key] = false;
    updateBlock(id, { style: { ...block.style, ...patch, paletteManagedFields: managedFields } });
  };
  const textData = isText ? block.data as { fontSize?: number; align?: TextAlign; padding?: number; fontWeight?: "normal" | "bold" | number; fontStyle?: "normal" | "italic"; fontUnderline?: boolean; fontStrikethrough?: boolean; textStyle?: NonNullable<WorkspaceTextStylePatch["textStyle"]>; verticalAlign?: VerticalAlign } : null;
  const updateTextStyle = (patch: Partial<WorkspaceTextStylePatch>) => {
    // A shape's label is per-run rich text (WorkspaceShapeRichEditor.tsx,
    // TipTap) — these buttons must toggle the mark on the current text
    // SELECTION there, never a whole-block style flag (that flag doesn't
    // exist, and wouldn't mean anything per-run even if it did).
    if (block.type === "shape" && activeRichTextEditor?.blockId === id) {
      const { commands } = activeRichTextEditor;
      if (patch.fontWeight !== undefined) commands.toggleBold();
      if (patch.fontStyle !== undefined) commands.toggleItalic();
      if (patch.fontUnderline !== undefined) commands.toggleUnderline();
      if (patch.fontStrikethrough !== undefined) commands.toggleStrike();
      if (patch.textStyle === "bullet") commands.toggleBulletList();
      else if (patch.textStyle === "numbered") commands.toggleOrderedList();
      else if (patch.textStyle === "quote") commands.toggleBlockquote();
      if (patch.fontAlign !== undefined) commands.setTextAlign(patch.fontAlign);
      return;
    }
    const dataPatch: Record<string, unknown> = {};
    if (patch.fontSize !== undefined) dataPatch.fontSize = patch.fontSize;
    if (patch.fontWeight !== undefined) dataPatch.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) dataPatch.fontStyle = patch.fontStyle;
    if (patch.fontUnderline !== undefined) dataPatch.fontUnderline = patch.fontUnderline;
    if (patch.fontStrikethrough !== undefined) dataPatch.fontStrikethrough = patch.fontStrikethrough;
    if (patch.textStyle !== undefined) dataPatch.textStyle = patch.textStyle;
    if (patch.fontAlign !== undefined) dataPatch.align = patch.fontAlign;
    if (patch.verticalAlign !== undefined) dataPatch.verticalAlign = patch.verticalAlign;
    if (patch.textPadding !== undefined) dataPatch.padding = patch.textPadding;
    if (isText && Object.keys(dataPatch).length > 0) updateData(dataPatch);
  };
  const selectConnectorLine = (lineType: WorkspaceConnectorLineType) => {
    updateMapLayout({ connectorLineType: lineType });
    setActive(null);
  };
  const selectConnectorPalette = (paletteId: WorkspaceConnectorPaletteId) => {
    updateMapLayout({ connectorPaletteId: paletteId });
  };
  const connectorPalette = getWorkspaceConnectorPalette(treeConnectorPaletteId);
  const layoutIcon = LAYOUT_ICONS[LEGACY_LAYOUT_KEY[layoutFamily] ?? "logical-right"];
  const moreActions = [
    { label: "Edit", run: () => setPendingEditBlockId(id) },
    ...(!isMapRootSelected ? [{ label: "Split", run: () => splitBlockToNewMap(id) }] : []),
    { label: "Copy", run: () => actions.copyBlock(id) },
    ...(!isMapRootSelected ? [{ label: "Cut", run: () => actions.cutBlock(id) }] : []),
    ...(actions.canPaste ? [{ label: "Paste", run: () => actions.pasteBlock(id) }] : []),
    { label: "Copy Style", run: () => actions.copyStyle(id) },
    { label: "Paste Style", run: () => actions.pasteStyle(id), disabled: !actions.canPasteStyle },
    { label: "Apply to Siblings", run: () => actions.applyToSiblings(id) },
    { label: "Apply to Same Level", run: () => actions.applyToSameLevel(id) },
    ...(!isMapRootSelected ? [{ label: "Delete", run: () => actions.deleteBlock(id) }] : []),
  ];

  return <div ref={toolbarRef} role="toolbar" aria-label="Selection toolbar" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => {
      // Clicking a toolbar button must not steal DOM focus away from a
      // block's own in-place rich-text editor (WorkspaceShapeRichEditor) —
      // that focus change fires the editor's onBlur, which closes editing
      // before the button's own onClick (e.g. Bold) ever runs against the
      // now-lost selection. Buttons stay clickable; only the default
      // focus-on-mousedown behavior is suppressed.
      event.preventDefault();
    }} style={style ?? { top: 80, left: 16 }} className="fixed z-50 flex w-max max-w-[calc(100vw-16px)] flex-wrap items-center gap-1.5 overflow-visible rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none">
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div
        onMouseDown={(e) => {
          setActive(null);
          handleToolbarDragStart(e);
        }}
        onTouchStart={(e) => {
          setActive(null);
          handleToolbarDragStart(e);
        }}
        className="-ml-0.5 flex-shrink-0 cursor-grab touch-none p-0.5 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
        title="Drag to reposition toolbar"
        aria-label="Drag toolbar"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </div>
      {isDocRichEditorActive && docCommands && docActiveMarks && <WorkspaceDocFormatToolbar commands={docCommands} marks={docActiveMarks} blockId={id} boardId={boardId} />}
      {block.type === "doc" && <div className="relative">
      <ToolbarPopover active={active} name="ratio" title="Tỉ lệ khung" ariaLabel="Chọn tỉ lệ khung" onToggle={toggle} below={below} gap="gap-1"><Proportions className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3 text-slate-400" /></ToolbarPopover>
      {active === "ratio" && <SmartPopover defaultH="left" className="!z-50" onClose={() => setActive(null)}>
        <div className="flex min-w-[112px] flex-col gap-0.5 p-1">
          {DOC_ASPECT_PRESETS.map((preset) => (
            <button key={preset.label} type="button" className="rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => { applyDocAspectRatio(id, preset.ratio); setActive(null); }}>{preset.label}</button>
          ))}
        </div>
      </SmartPopover>}
      </div>}
      {!isMediaBlock && <ToolbarPopover active={active} name="shape" title="Style & Shape Node" onToggle={toggle} below={below} gap="gap-1.5"><span className="flex h-4 w-5 items-center justify-center">{renderShapeIcon(toLegacyShapeValue(shapeKind))}</span><span className="h-3.5 w-3.5 rounded border border-black/15" style={{ backgroundColor: displayStyle?.backgroundColor ?? "#fff" }} /><ChevronDown className="h-3 w-3 text-slate-400" /></ToolbarPopover>}
      {/* Map Structure / Line Style / Color Palette are map-wide settings.
          `findMapRootId` returns null for ordinary standalone blocks and uses
          explicit mapId membership for free-form diagrams, so these controls
          are available only when the actual map root is selected. */}
      {isMapRootSelected && !isMediaBlock && <>
      <div className="relative">
      <ToolbarPopover active={active} name="layout" title="Map Structure / Layout" ariaLabel="Map Structure" onToggle={toggle} below={below}><span className="flex h-4 w-5 items-center justify-center text-slate-500">{layoutIcon}</span><ChevronDown className="h-3 w-3 text-slate-400" /></ToolbarPopover>
      {active === "layout" && <SmartPopover defaultH="left" className="!z-50" onClose={() => setActive(null)}>{mapLayout && <WorkspaceMapLayoutPicker settings={mapLayout} onChange={updateMapLayout} structures={MAP_STRUCTURE_CONVERT_OPTIONS} forceCompact />}</SmartPopover>}
      </div>
      <div className="relative"><button type="button" title="Line Style and Color Palette" aria-label="Line Style and Color Palette" aria-expanded={active === "mapStyle"} aria-haspopup="dialog" className={active === "mapStyle" ? activeButtonClass : buttonClass} onClick={() => toggle("mapStyle")}><span className="flex gap-0.5">{connectorPalette.colors.slice(0, 5).map((color, index) => <span key={`${color}-${index}`} className="h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: color }} />)}</span><ChevronDown className="h-3 w-3 text-slate-400" /></button>{active === "mapStyle" && <SmartPopover defaultH="left" className="!z-50" onClose={() => setActive(null)}><div className="flex w-max gap-2">{layoutFamily === "hierarchy" && <div className="w-[176px]"><MapLayoutColumn title="Line Style"><LineContentPanel availableLines={LINE_STYLES.map((line) => line.id)} connectionStyle={treeConnectorLineType} selectLine={selectConnectorLine} isCascade={false} setOpenThrough={() => undefined} paletteStage={0} /></MapLayoutColumn></div>}<div className="w-[176px]"><MapLayoutColumn title="Color Palette"><div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto"><PaletteOption name="Default" colors={getWorkspaceConnectorPalette("default").colors as string[]} selected={treeConnectorPaletteId === "default"} onClick={() => selectConnectorPalette("default")} />{WORKSPACE_CONNECTOR_PALETTES.slice(1).map((palette) => <PaletteOption key={palette.id} name={palette.name} colors={palette.colors as string[]} selected={treeConnectorPaletteId === palette.id} onClick={() => selectConnectorPalette(palette.id)} />)}</div></MapLayoutColumn></div></div></SmartPopover>}</div>
      </>}
      {!isMediaBlock && <div className="relative">
      <ToolbarPopover active={active} name="text" title="Text Color" onToggle={toggle} below={below} gap="gap-1.5"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border-b-2 px-1 text-xs font-bold" style={{ color: displayStyle?.textColor ?? "#1e293b", borderColor: displayStyle?.textColor ?? "#1e293b" }}>A</span><ChevronDown className="h-3 w-3 text-slate-400" /></ToolbarPopover>
      {active === "text" && <WorkspaceTextColorPopover textColor={displayStyle?.textColor} onPick={updateStyle} onClose={() => setActive(null)} />}
      </div>}
      {!isMediaBlock && <div className="relative">
      <ToolbarPopover active={active} name="size" title="Font Size" onToggle={toggle} below={below}><span className="tabular-nums text-[11px] font-semibold">{fontSize}px</span><ChevronDown className="h-3 w-3" /></ToolbarPopover>
      {active === "size" && <WorkspaceFontSizePopover currentSize={fontSize} onPick={(size) => { if (isText) updateData({ fontSize: size }); }} onClose={() => setActive(null)} />}
      </div>}
      {!isMediaBlock && <ToolbarTextStylePopover open={active === "align"} togglePopover={() => toggle("align")} updateNodeStyle={updateTextStyle}
        currentTextStyle={isShapeRichEditorActive ? (shapeActiveMarks!.bulletList ? "bullet" : shapeActiveMarks!.orderedList ? "numbered" : shapeActiveMarks!.blockquote ? "quote" : "plain") : textData?.textStyle ?? "plain"}
        currentFontWeight={isShapeRichEditorActive ? (shapeActiveMarks!.bold ? "bold" : "normal") : typeof textData?.fontWeight === "number" ? (textData.fontWeight >= 600 ? "bold" : "normal") : textData?.fontWeight ?? "normal"}
        currentFontStyle={isShapeRichEditorActive ? (shapeActiveMarks!.italic ? "italic" : "normal") : textData?.fontStyle ?? "normal"}
        currentUnderline={isShapeRichEditorActive ? shapeActiveMarks!.underline : textData?.fontUnderline ?? false}
        currentStrikethrough={isShapeRichEditorActive ? shapeActiveMarks!.strike : textData?.fontStrikethrough ?? false}
        currentAlign={isShapeRichEditorActive ? (shapeActiveMarks!.align === "justify" ? "left" : shapeActiveMarks!.align) : textData?.align ?? "left"}
        currentVerticalAlign={textData?.verticalAlign ?? "middle"} currentTextPadding={textData?.padding ?? 8} />}
      {!isMediaBlock && <div className="relative border-l border-slate-200 pl-1 dark:border-slate-800">
      <ToolbarPopover active={active} name="content" title="Node content" onToggle={toggle} below={below} gap="gap-0.5"><FileText className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3" /></ToolbarPopover>
      {active === "content" && <WorkspaceNodeContentPopover block={block} placeBelow={below} onClose={() => setActive(null)} onStartDescription={() => setPendingDescriptionBlockId(id)} />}
      </div>}
      {/* Add child/sibling is a tree (mindmap node) concept - a "shape" has no
          parent/children concept at all (see the isMapRootSelected comment
          above), so offering it here just invites addChildBlock to bolt a
          parentId + tree auto-arrange reflow onto a block that was never a
          map root to begin with. */}
      {!isMediaBlock && block.type !== "shape" && layoutFamily !== "flowchart" && <ToolbarQuickAdd
        activePopover={active}
        togglePopover={(popover) => setActive(popover as PopoverKey)}
        setActivePopover={(popover) => setActive(popover as PopoverKey)}
        handleAddChild={() => addChildBlock(id)}
        handleAddSibling={() => addSiblingBlock(id)}
        canAddSibling={Boolean(block.parentId)}
      />}
      <button type="button" title="Comment selected node" aria-label="Comment selected node" aria-pressed={activeCommentBlockId === id} className={activeCommentBlockId === id ? activeButtonClass : buttonClass} onClick={() => setActiveCommentBlockId(activeCommentBlockId === id ? null : id)}><MessageSquare className="h-3.5 w-3.5" /></button>
      <button type="button" title="Edit / Expand with AI" aria-label="Edit / Expand with AI" aria-pressed={active === "ai"} className="rounded-lg bg-orange-500/10 p-1.5 text-orange-600 hover:bg-orange-500/20" onClick={() => toggle("ai")}><Sparkles className="h-3.5 w-3.5" /></button>
      <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-200" aria-hidden="true" />
      <div className="relative">
      <ToolbarPopover active={active} name="more" title="More actions" onToggle={toggle} below={below}><MoreHorizontal className="h-3.5 w-3.5" /></ToolbarPopover>
      {active === "more" && <SwatchPopover isOpen onClose={() => setActive(null)} title="More Actions" showTitle={false} placeBelow={below}><div className="flex min-w-[150px] flex-col gap-0.5">{moreActions.map((item) => <button key={item.label} type="button" disabled={item.disabled} className="rounded px-2 py-1 text-left text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { item.run(); setActive(null); }}>{item.label}</button>)}</div></SwatchPopover>}
      </div>
    </div>
    {active === "shape" && <WorkspaceNodeStylePopover kind={shapeKind} style={displayStyle} onClose={() => setActive(null)} onShape={(nextKind) => block.type === "shape" ? updateData({ shapeKind: nextKind }) : updateStyle({ shapeKind: nextKind })} updateStyle={updateStyle} />}
    {active === "ai" && <WorkspaceAiNodePrompt isRunning={isAiRunning} placeBelow={below} onSubmit={(request) => void runAiNodeEdit(id, request)} onClose={() => setActive(null)} />}
  </div>;
}

export default WorkspaceSelectionToolbar;
