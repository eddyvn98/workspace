"use client";

import React, { useState } from "react";
import {
  ArrowUpDown,
  Download,
  FileImage,
  FileJson,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceImportExport } from "../hooks/useWorkspaceImportExport";

const actionClassName =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer";

export function WorkspaceImportExportMenu({
  compact = false,
  onImportMarkdownWithAI,
}: {
  compact?: boolean;
  onImportMarkdownWithAI?: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const actions = useWorkspaceImportExport(() => setOpen(false), onImportMarkdownWithAI);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={
              compact
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer data-[state=open]:bg-slate-100 data-[state=open]:text-slate-900 dark:data-[state=open]:bg-slate-800 dark:data-[state=open]:text-slate-100 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            }
            title="Import / Export mindmap"
            aria-label="Import and Export"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={compact ? "right" : "bottom"}
          align={compact ? "start" : "end"}
          sideOffset={8}
          className="w-56 p-1.5 rounded-xl z-50"
        >
          {!actions.isReadOnly && (
            <>
              <button
                type="button"
                onClick={actions.handleImportMarkdownClick}
                className={actionClassName}
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Import Markdown</span>
              </button>
              <button
                type="button"
                onClick={actions.handleImportJsonClick}
                className={actionClassName}
              >
                <FileJson className="h-3.5 w-3.5 text-slate-500" />
                <span>Import JSON</span>
              </button>
              {onImportMarkdownWithAI && (
                <button
                  type="button"
                  onClick={actions.handleImportMarkdownWithAIClick}
                  className={actionClassName}
                >
                  <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                  <span>Import &amp; organize with AI</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={actions.handleExportMarkdown}
            className={actionClassName}
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export Markdown</span>
          </button>
          <button
            type="button"
            onClick={actions.handleExportJson}
            className={actionClassName}
          >
            <FileJson className="h-3.5 w-3.5 text-slate-500" />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            onClick={actions.handleExportPng}
            className={actionClassName}
          >
            <FileImage className="h-3.5 w-3.5 text-slate-500" />
            <span>Export PNG</span>
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          {actions.hasSelection ? (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                Selection only
              </div>
              <button
                type="button"
                onClick={actions.handleExportSelectionMarkdown}
                className={actionClassName}
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export selection Markdown</span>
              </button>
              <button
                type="button"
                onClick={actions.handleExportSelectionJson}
                className={actionClassName}
              >
                <FileJson className="h-3.5 w-3.5 text-slate-500" />
                <span>Export selection JSON</span>
              </button>
              <button
                type="button"
                onClick={actions.handleExportSelectionPng}
                className={actionClassName}
              >
                <FileImage className="h-3.5 w-3.5 text-slate-500" />
                <span>Export selection PNG</span>
              </button>
            </>
          ) : (
            <div className="px-2.5 py-1.5">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                Tip: Drag-select nodes on the canvas to export only your selection.
              </p>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={actions.fileInputRef}
        id="workspace-json-import"
        name="workspace-json-import"
        type="file"
        accept="application/json"
        onChange={actions.handleJsonFileSelected}
        style={{ display: "none" }}
      />
      <input
        ref={actions.opmlFileInputRef}
        id="workspace-opml-import"
        name="workspace-opml-import"
        type="file"
        accept=".opml,text/xml"
        onChange={actions.handleOpmlFileSelected}
        style={{ display: "none" }}
      />
      <input
        ref={actions.markdownFileInputRef}
        id="workspace-markdown-import"
        name="workspace-markdown-import"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={actions.handleMarkdownFileSelected}
        style={{ display: "none" }}
      />
      <input
        ref={actions.aiMarkdownFileInputRef}
        id="workspace-ai-markdown-import"
        name="workspace-ai-markdown-import"
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={actions.handleMarkdownWithAIFileSelected}
        style={{ display: "none" }}
      />
    </>
  );
}

export default WorkspaceImportExportMenu;
