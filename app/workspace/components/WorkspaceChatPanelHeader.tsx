"use client";

import { ChevronDown, History, SquarePen } from "lucide-react";
import { WorkspaceChatModeButton } from "./WorkspaceChatModeButton";

interface WorkspaceChatPanelHeaderProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  isSending: boolean;
  onClose?: () => void;
}

export function WorkspaceChatPanelHeader({
  showHistory,
  onToggleHistory,
  onNewConversation,
  isSending,
  onClose,
}: WorkspaceChatPanelHeaderProps) {
  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
      <WorkspaceChatModeButton />
      <button
        type="button"
        onClick={onToggleHistory}
        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="Chat history"
        aria-label="Chat history"
        aria-pressed={showHistory}
      >
        <History className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onNewConversation}
        disabled={isSending}
        className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        title="New conversation"
        aria-label="New conversation"
      >
        <SquarePen className="h-4 w-4" />
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:hidden dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Close chat"
          aria-label="Close chat"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
