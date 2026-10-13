"use client";

import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import { Lock, PanelLeftClose, PanelLeftOpen, Pencil, Redo2, Search, Undo2 } from "lucide-react";
import { useToolLayoutStore } from "@/stores/useToolLayoutStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceManualSave } from "../hooks/useWorkspaceManualSave";
import { WorkspaceVersionHistoryPanel } from "./WorkspaceVersionHistoryPanel";
import { WorkspaceTopBarChatPanel } from "./WorkspaceTopBarChatPanel";
import { WorkspaceTopBarActions } from "./WorkspaceTopBarActions";

export interface WorkspaceTopBarProps {
  boardId: string | null;
  onHelpClick: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  isSavePending: boolean;
  saveError: string | null;
  onSave?: () => void;
  isReadOnly?: boolean;
  openChatRequest?: number;
  isBoardLoading?: boolean;
}

export const WorkspaceTopBar = memo(function WorkspaceTopBar({
  boardId,
  onHelpClick,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isSearchOpen,
  onToggleSearch,
  isSavePending,
  saveError,
  onSave,
  isReadOnly: propIsReadOnly,
  openChatRequest = 0,
  isBoardLoading = false,
}: WorkspaceTopBarProps) {
  const {
    mindmapAsideCollapsed: asideCollapsed,
    setMindmapAsideCollapsed: setAsideCollapsed,
  } = useToolLayoutStore();

  const title = useWorkspaceStore((state) => state.title);
  const hasMap = useWorkspaceStore((state) => state.blockOrder.length > 0);
  const setTitle = useWorkspaceStore((state) => state.setTitle);
  const storeIsReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const isCommentMode = useWorkspaceStore((state) => state.isCommentMode);
  const setIsCommentMode = useWorkspaceStore((state) => state.setIsCommentMode);
  const manualSave = useWorkspaceManualSave(boardId);

  const isReadOnly = propIsReadOnly ?? storeIsReadOnly;
  const handleSave = onSave ?? manualSave;
  const [draftTitle, setDraftTitle] = useState(title);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  useEffect(() => { if (isChatOpen) setHasOpenedChat(true); }, [isChatOpen]);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    if (openChatRequest > 0) setIsChatOpen(true);
  }, [openChatRequest]);

  // Automation handle (see useWorkspaceAgentDriver): the chat has to be
  // mounted for window.__wsAgent to exist, so open it without a click.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("agentDriver") === "1") setIsChatOpen(true);
  }, []);

  const handleBlur = () => {
    if (isReadOnly) return;
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== title) {
      setTitle(trimmed);
    } else {
      setDraftTitle(title);
    }
  };

  const handleImportMarkdownWithAI = useCallback((prompt: string) => {
    setPendingChatPrompt(prompt);
    setIsChatOpen(true);
  }, []);

  return (
    <>
      <div
        className={`h-12 sm:h-14 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between bg-white/90 dark:bg-[#0f1117]/90 backdrop-blur-md absolute top-0 left-0 right-0 ${isHistoryOpen ? "z-[60]" : "z-50"} gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}
      >
        {/* Left Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-[80px] flex-1">
          <button
            type="button"
            onClick={() => setAsideCollapsed(!asideCollapsed)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
              !asideCollapsed
                ? "bg-orange-500/10 text-orange-600 hover:bg-orange-500/15 hover:text-orange-700"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title={asideCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={asideCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={!asideCollapsed}
          >
            {asideCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div className="relative flex items-center min-w-[80px] w-full max-w-[120px] sm:max-w-xs group">
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  setDraftTitle(title);
                  e.currentTarget.blur();
                }
              }}
              disabled={isReadOnly}
              className="bg-transparent border-0 outline-none text-sm font-bold text-slate-900 dark:text-slate-100 min-w-[80px] w-full pr-4 disabled:opacity-80 truncate"
              placeholder="Mindmap Name"
            />
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  titleInputRef.current?.focus();
                  titleInputRef.current?.select();
                }}
                className="absolute right-0 p-0.5 rounded text-slate-400 opacity-60 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-orange-500 transition-opacity cursor-pointer"
                title="Rename mindmap"
                aria-label="Rename mindmap"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {isReadOnly && (
            <span
              className="hidden h-4 w-4 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 select-none flex-shrink-0 sm:flex"
              title="Read only"
              aria-label="Read only"
            >
              <Lock className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        {/* Mobile Undo/Redo */}
        <div className="flex sm:hidden items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={isReadOnly || !canUndo}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={isReadOnly || !canRedo}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Center Actions (Desktop only) */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onUndo}
            disabled={isReadOnly || !canUndo}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Undo (Ctrl / ⌘ + Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={isReadOnly || !canRedo}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Redo (Ctrl + Y / ⌘ + Shift + Z)"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1.5" />
          <button
            type="button"
            onClick={onToggleSearch}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors cursor-pointer ${
              isSearchOpen
                ? "bg-orange-500/20 text-orange-600"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title="Find & Replace (Ctrl / ⌘ + F)"
            aria-label="Find and replace"
            aria-expanded={isSearchOpen}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        <WorkspaceTopBarActions
          boardId={boardId}
          hasMap={hasMap}
          isReadOnly={isReadOnly}
          isSavePending={isSavePending}
          saveError={saveError}
          onSave={handleSave}
          onHelpClick={onHelpClick}
          onToggleSearch={onToggleSearch}
          onOpenHistory={() => setIsHistoryOpen(true)}
          isCommentMode={isCommentMode}
          onToggleComments={() => setIsCommentMode(!isCommentMode)}
          isChatOpen={isChatOpen}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          onImportMarkdownWithAI={handleImportMarkdownWithAI}
        />
      </div>

      {isHistoryOpen && boardId && (
        <WorkspaceVersionHistoryPanel
          boardId={boardId}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {(isChatOpen || hasOpenedChat) && (
        <WorkspaceTopBarChatPanel
          key={boardId}
          visible={isChatOpen}
          initialPrompt={pendingChatPrompt ?? undefined}
          onClose={() => {
            setIsChatOpen(false);
            setPendingChatPrompt(null);
          }}
          isBoardLoading={isBoardLoading}
        />
      )}
    </>
  );
});

export default WorkspaceTopBar;
