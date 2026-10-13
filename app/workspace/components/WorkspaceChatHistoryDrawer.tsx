"use client";

import React from "react";
import { History, Loader2, SquarePen, X } from "lucide-react";
import type { WorkspaceChatSessionSummary } from "../types/chat";

interface WorkspaceChatHistoryDrawerProps {
  sessions: WorkspaceChatSessionSummary[];
  activeSessionId?: string | null;
  isLoading?: boolean;
  onSelectSession: (sessionId: string) => void;
  onNewConversation?: () => void;
  onClose: () => void;
}

function formatSessionDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function WorkspaceChatHistoryDrawer({
  sessions,
  activeSessionId,
  isLoading = false,
  onSelectSession,
  onNewConversation,
  onClose,
}: WorkspaceChatHistoryDrawerProps) {
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-[#151821]"
      aria-label="Chat history"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <History className="h-4 w-4 text-orange-500" />
          <span>Chat history</span>
        </div>
        <div className="flex items-center gap-1">
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            >
              <SquarePen className="h-3.5 w-3.5" />
              <span>New conversation</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close chat history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-slate-400 dark:text-slate-500">
            <History className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p>No saved conversations yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => {
              const isSelected = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="truncate text-sm font-medium">
                    {session.title || "New conversation"}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {formatSessionDate(session.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceChatHistoryDrawer;
