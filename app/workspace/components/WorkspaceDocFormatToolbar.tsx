"use client";

import React, { useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Quote,
  Strikethrough,
  Underline,
  Undo2,
  Redo2,
  Eraser,
  Code2,
  Minus,
  FileDown,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceSmartPopover } from "../utils/WorkspaceSmartPopover";
import type { WorkspaceInlineRichEditorActiveMarks, WorkspaceInlineRichEditorCommands } from "../store/useWorkspaceStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { workspaceDocEditorUrl } from "../utils/workspaceDocEditorEvents";
import type { BlockId } from "../types/block";
import { WorkspaceDocTypographyControls } from "./WorkspaceDocTypographyControls";
import { downloadWorkspaceDocHtml, printWorkspaceDoc } from "../utils/workspaceDocExportClient";

const buttonClass = "flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;

type DocPopoverKey = "heading" | "style" | "align" | "list" | "link" | null;

/** Formatting controls for the `doc`/`slideDeck` rich-text editor, grouped
 *  into icon+chevron popovers to match the rest of WorkspaceSelectionToolbar
 *  (WorkspaceToolbarTextStylePopover, the font-size/text-color popovers)
 *  instead of the flat button row WorkspaceDocRichEditor.tsx used to render
 *  inline inside the block. Keeps its own open/close state rather than
 *  sharing the parent bar's `active` key — every popover here already
 *  self-closes on outside click via WorkspaceSmartPopover, and doc-only
 *  popovers never coexist with the parent's shape/text/size popovers (those
 *  are hidden for a media block) so nothing needs to be mutually exclusive
 *  across the two. */
export function WorkspaceDocFormatToolbar({
  commands,
  marks,
  blockId,
  boardId,
  hideExpand,
}: {
  commands: WorkspaceInlineRichEditorCommands;
  marks: WorkspaceInlineRichEditorActiveMarks;
  /** Needed for "Open in new tab" — omit only where the
   *  page IS already that standalone editor (hideExpand below). */
  blockId?: BlockId;
  boardId?: string;
  /** Hides the "Open in new tab" button — set on the standalone doc-editor
   *  page itself (app/workspace/doc-editor/page.tsx), which has nowhere
   *  further to expand to. */
  hideExpand?: boolean;
}) {
  const [open, setOpen] = useState<DocPopoverKey>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isDocument = useWorkspaceStore(state => Boolean(blockId && state.blocks[blockId]?.type === "doc"));
  const toggle = (key: Exclude<DocPopoverKey, null>) => setOpen((current) => {
    if (current !== "link" && key === "link") setLinkDraft(marks.linkHref ?? "");
    return current === key ? null : key;
  });

  const handleInsertImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    void commands.uploadImage?.(file);
  };

  const headingLabel = marks.heading1 ? "H1" : marks.heading2 ? "H2" : marks.heading3 ? "H3" : "¶";
  const AlignIcon = marks.align === "center" ? AlignCenter : marks.align === "right" ? AlignRight : marks.align === "justify" ? AlignJustify : AlignLeft;
  const ListIcon = marks.taskList ? ListChecks : marks.orderedList ? ListOrdered : List;

  const headingOptions: Array<[label: string, active: boolean, run: () => void]> = [
    ["¶ Normal", !marks.heading1 && !marks.heading2 && !marks.heading3, () => { if (marks.heading1) commands.toggleHeading1?.(); else if (marks.heading2) commands.toggleHeading2?.(); else if (marks.heading3) commands.toggleHeading3?.(); }],
    ["Heading 1", Boolean(marks.heading1), () => commands.toggleHeading1?.()],
    ["Heading 2", Boolean(marks.heading2), () => commands.toggleHeading2?.()],
    ["Heading 3", Boolean(marks.heading3), () => commands.toggleHeading3?.()],
  ];
  const styleActions: Array<[label: string, Icon: typeof Bold, active: boolean, run: () => void]> = [
    ["Bold", Bold, marks.bold, commands.toggleBold],
    ["Italic", Italic, marks.italic, commands.toggleItalic],
    ["Underline", Underline, marks.underline, commands.toggleUnderline],
    ["Strikethrough", Strikethrough, marks.strike, commands.toggleStrike],
    ["Code", Code, Boolean(marks.code), () => commands.toggleCode?.()],
    ["Code block", Code2, Boolean(marks.codeBlock), () => commands.toggleCodeBlock?.()],
  ];
  const alignActions: Array<[label: string, Icon: typeof AlignLeft, active: boolean, run: () => void]> = [
    ["Align left", AlignLeft, marks.align === "left", () => commands.setTextAlign("left")],
    ["Align center", AlignCenter, marks.align === "center", () => commands.setTextAlign("center")],
    ["Align right", AlignRight, marks.align === "right", () => commands.setTextAlign("right")],
    ["Justify", AlignJustify, marks.align === "justify", () => commands.setTextAlign("justify")],
  ];
  const listActions: Array<[label: string, Icon: typeof List, active: boolean, run: () => void]> = [
    ["Bullet list", List, marks.bulletList, commands.toggleBulletList],
    ["Numbered list", ListOrdered, marks.orderedList, commands.toggleOrderedList],
    ["Checklist", ListChecks, Boolean(marks.taskList), () => commands.toggleTaskList?.()],
  ];

  return (
    <div role="toolbar" aria-label="Document formatting" className="flex min-w-0 flex-wrap items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
      {commands.undo && <button type="button" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" disabled={!marks.canUndo} className={`${buttonClass} disabled:opacity-35`} onClick={commands.undo}><Undo2 className="h-3.5 w-3.5" /></button>}
      {commands.redo && <button type="button" title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo" disabled={!marks.canRedo} className={`${buttonClass} disabled:opacity-35`} onClick={commands.redo}><Redo2 className="h-3.5 w-3.5" /></button>}
      <div className="relative">
        <button type="button" title="Heading" aria-label="Heading" aria-expanded={open === "heading"} aria-haspopup="dialog" className={open === "heading" ? activeButtonClass : buttonClass} onClick={() => toggle("heading")}>
          <span className="w-5 text-center font-bold">{headingLabel}</span><ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {open === "heading" && <WorkspaceSmartPopover defaultH="left" onClose={() => setOpen(null)}>
          <div className="flex min-w-[140px] flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
            {headingOptions.map(([label, active, run]) => (
              <button key={label} type="button" className={`rounded px-2 py-1.5 text-left text-xs ${active ? "bg-blue-100 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => { run(); setOpen(null); }}>{label}</button>
            ))}
          </div>
        </WorkspaceSmartPopover>}
      </div>

      <WorkspaceDocTypographyControls commands={commands} marks={marks} />

      <div className="relative">
        <button type="button" title="Text style" aria-label="Text style" aria-expanded={open === "style"} aria-haspopup="dialog" className={open === "style" ? activeButtonClass : buttonClass} onClick={() => toggle("style")}>
          <span className="font-bold">Aa</span><ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {open === "style" && <WorkspaceSmartPopover defaultH="left" onClose={() => setOpen(null)}>
          <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
            {styleActions.map(([label, Icon, active, run]) => (
              <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} className={`rounded p-1.5 ${active ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`} onClick={run}><Icon className="h-3.5 w-3.5" /></button>
            ))}
          </div>
        </WorkspaceSmartPopover>}
      </div>

      <div className="relative">
        <button type="button" title="Alignment" aria-label="Alignment" aria-expanded={open === "align"} aria-haspopup="dialog" className={open === "align" ? activeButtonClass : buttonClass} onClick={() => toggle("align")}>
          <AlignIcon className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {open === "align" && <WorkspaceSmartPopover defaultH="left" onClose={() => setOpen(null)}>
          <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
            {alignActions.map(([label, Icon, active, run]) => (
              <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} className={`rounded p-1.5 ${active ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`} onClick={() => { run(); setOpen(null); }}><Icon className="h-3.5 w-3.5" /></button>
            ))}
          </div>
        </WorkspaceSmartPopover>}
      </div>

      <div className="relative">
        <button type="button" title="List" aria-label="List" aria-expanded={open === "list"} aria-haspopup="dialog" className={open === "list" ? activeButtonClass : buttonClass} onClick={() => toggle("list")}>
          <ListIcon className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
        {open === "list" && <WorkspaceSmartPopover defaultH="left" onClose={() => setOpen(null)}>
          <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
            {listActions.map(([label, Icon, active, run]) => (
              <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} className={`rounded p-1.5 ${active ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"}`} onClick={() => { run(); setOpen(null); }}><Icon className="h-3.5 w-3.5" /></button>
            ))}
          </div>
        </WorkspaceSmartPopover>}
      </div>

      <button type="button" title="Quote" aria-label="Quote" aria-pressed={marks.blockquote} className={marks.blockquote ? activeButtonClass : buttonClass} onClick={commands.toggleBlockquote}><Quote className="h-3.5 w-3.5" /></button>
      {commands.insertHorizontalRule && <button type="button" title="Insert divider" aria-label="Insert divider" className={buttonClass} onClick={commands.insertHorizontalRule}><Minus className="h-3.5 w-3.5" /></button>}
      {commands.clearFormatting && <button type="button" title="Clear formatting" aria-label="Clear formatting" className={buttonClass} onClick={commands.clearFormatting}><Eraser className="h-3.5 w-3.5" /></button>}

      <div className="relative">
        <button type="button" title="Link" aria-label="Link" aria-expanded={open === "link"} aria-haspopup="dialog" aria-pressed={Boolean(marks.link)} className={open === "link" || marks.link ? activeButtonClass : buttonClass} onClick={() => toggle("link")}><LinkIcon className="h-3.5 w-3.5" /></button>
        {open === "link" && <WorkspaceSmartPopover defaultH="left" onClose={() => setOpen(null)}>
          <form
            className="flex w-[220px] gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-950"
            onSubmit={(event) => { event.preventDefault(); commands.setLink?.(linkDraft.trim()); setOpen(null); }}
          >
            <input
              type="url"
              autoFocus
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900"
            />
            {marks.link && <button type="button" title="Remove link" aria-label="Remove link" className="rounded px-1.5 text-xs text-red-500 hover:bg-red-50" onClick={() => { commands.unsetLink?.(); setOpen(null); }}>✕</button>}
            <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">Apply</button>
          </form>
        </WorkspaceSmartPopover>}
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleInsertImage} style={{ display: "none" }} />
      {commands.uploadImage && <button type="button" title="Insert image" aria-label="Insert image" className={buttonClass} onClick={() => imageInputRef.current?.click()}>
        <ImagePlus className="h-3.5 w-3.5" />
      </button>}

      {blockId && isDocument && <>
        <button type="button" title="Download HTML" aria-label="Download document as HTML" className={buttonClass} onClick={() => { void downloadWorkspaceDocHtml(blockId).catch(error => toast.error(error instanceof Error ? error.message : "Could not export this document.")); }}><FileDown className="h-3.5 w-3.5" /></button>
        <button type="button" title="Print / Save PDF" aria-label="Print document or save as PDF" className={buttonClass} onClick={() => { void printWorkspaceDoc(blockId).catch(error => toast.error(error instanceof Error ? error.message : "Could not open document printing.")); }}><Printer className="h-3.5 w-3.5" /></button>
      </>}

      {!hideExpand && blockId && isDocument && (
        <a
          href={workspaceDocEditorUrl(blockId, boardId ?? "")}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          aria-label="Open in new tab"
          className={buttonClass}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
      )}

      <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-200" aria-hidden="true" />
    </div>
  );
}

export default WorkspaceDocFormatToolbar;
