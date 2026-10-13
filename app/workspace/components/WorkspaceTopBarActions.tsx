"use client";

import React from "react";
import { AlertCircle, Check, HelpCircle, History, Loader2, MessageCircle, Save, Sparkles } from "lucide-react";
import { WorkspaceNotificationBell } from "./WorkspaceNotificationBell";
import { WorkspacePresenceCluster } from "./WorkspacePresenceCluster";
import { WorkspaceShareDialog } from "./WorkspaceShareDialog";
import { WorkspaceImportExportMenu } from "./WorkspaceImportExportMenu";
import { WorkspaceAssetLibrary } from "./WorkspaceAssetLibrary";
import { WorkspaceViewOptionsMenu } from "./WorkspaceViewOptionsMenu";
import { WorkspaceMobileMoreMenu } from "./WorkspaceMobileMoreMenu";

interface WorkspaceTopBarActionsProps {
  boardId: string | null;
  hasMap: boolean;
  isReadOnly: boolean;
  isSavePending: boolean;
  saveError: string | null;
  onSave: () => void | Promise<boolean | void>;
  onHelpClick: () => void;
  onToggleSearch: () => void;
  onOpenHistory: () => void;
  isCommentMode: boolean;
  onToggleComments: () => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onImportMarkdownWithAI: (prompt: string) => void;
}

export function WorkspaceTopBarActions({ boardId, hasMap, isReadOnly, isSavePending, saveError, onSave, onHelpClick, onToggleSearch, onOpenHistory, isCommentMode, onToggleComments, isChatOpen, onToggleChat, onImportMarkdownWithAI }: WorkspaceTopBarActionsProps) {
  const [isMobileShareOpen, setIsMobileShareOpen] = React.useState(false);
  const [isManualSavePending, setIsManualSavePending] = React.useState(false);
  const [manualSaveFailed, setManualSaveFailed] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const prevSavePending = React.useRef(isSavePending);

  React.useEffect(() => {
    const wasSavePending = prevSavePending.current;
    prevSavePending.current = isSavePending;
    if (wasSavePending && !isSavePending && !saveError) {
      setJustSaved(true);
      const timer = window.setTimeout(() => setJustSaved(false), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [isSavePending, saveError]);

  const handleSaveClick = async () => {
    if (isManualSavePending) return;
    setManualSaveFailed(false);
    setJustSaved(false);
    setIsManualSavePending(true);
    try {
      const result = await onSave();
      if (result === false) {
        setManualSaveFailed(true);
        return;
      }
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch {
      setManualSaveFailed(true);
    } finally {
      setIsManualSavePending(false);
    }
  };

  const isSaving = isSavePending || isManualSavePending;
  const hasSaveError = Boolean(saveError) || manualSaveFailed;
  const saveLabel = hasSaveError
    ? "Retry"
    : isSaving
      ? "Saving…"
      : justSaved
        ? "Saved"
        : "Save";
  const saveTitle = saveError ?? (manualSaveFailed ? "Save failed. Try again." : `${saveLabel} workspace`);

  return <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
    <WorkspaceNotificationBell />
    {boardId && <WorkspacePresenceCluster boardId={boardId} />}
    <WorkspaceViewOptionsMenu />
    <div className="hidden sm:block"><WorkspaceImportExportMenu onImportMarkdownWithAI={onImportMarkdownWithAI} /></div>
    <div className="sm:hidden"><WorkspaceImportExportMenu compact onImportMarkdownWithAI={onImportMarkdownWithAI} /></div>
    <WorkspaceAssetLibrary />
    {boardId && hasMap && <button type="button" onClick={onOpenHistory} className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center cursor-pointer rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100" title="Version history" aria-label="Version history"><History className="h-4 w-4" /></button>}
    {boardId && hasMap && !isReadOnly && <>
      <div className="hidden sm:block"><WorkspaceShareDialog boardId={boardId} /></div>
      <WorkspaceShareDialog boardId={boardId} open={isMobileShareOpen} onOpenChange={setIsMobileShareOpen} showTrigger={false} />
    </>}
    {!isReadOnly && <button type="button" onClick={handleSaveClick} disabled={isManualSavePending} className={`relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors disabled:cursor-wait disabled:opacity-80 ${hasSaveError ? "text-red-500 hover:bg-red-500/10" : justSaved && !isSaving ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400" : isSaving ? "text-orange-500 hover:bg-orange-500/10" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`} aria-busy={isSaving} data-autosave-pending={isSavePending} data-save-state={saveLabel.toLowerCase().replace("…", "")} data-save-error={saveError ?? (manualSaveFailed ? "Save failed. Try again." : undefined)} title={saveTitle} aria-label={saveLabel}>
      {hasSaveError ? <AlertCircle className="h-4 w-4 shrink-0" /> : isSaving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : justSaved ? <Check className="h-4 w-4 shrink-0" /> : <Save className="h-4 w-4 shrink-0" />}
    </button>}
    <button type="button" onClick={onHelpClick} className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:flex dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100" title="Shortcut Guides (?)" aria-label="Keyboard shortcuts guide"><HelpCircle className="h-4 w-4" /></button>
    <div className="sm:hidden"><WorkspaceMobileMoreMenu boardId={hasMap ? boardId : null} onHelpClick={onHelpClick} onToggleSearch={onToggleSearch} onOpenHistory={onOpenHistory} onShare={() => setIsMobileShareOpen(true)} isReadOnly={isReadOnly} /></div>
    <button type="button" onClick={onToggleComments} className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${isCommentMode ? "bg-orange-500/10 text-orange-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`} title={isCommentMode ? "Hide comments" : "Show comments"} aria-label={isCommentMode ? "Hide comments" : "Show comments"} aria-pressed={isCommentMode}><MessageCircle className="h-4 w-4" /></button>
    <button type="button" onClick={onToggleChat} className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors ${isChatOpen ? "bg-orange-500/10 text-orange-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`} title={isChatOpen ? "Collapse chat panel" : "Expand chat panel"} aria-label={isChatOpen ? "Collapse chat panel" : "Expand chat panel"} aria-expanded={isChatOpen}><Sparkles className="h-4 w-4" /></button>
  </div>;
}

export default WorkspaceTopBarActions;
