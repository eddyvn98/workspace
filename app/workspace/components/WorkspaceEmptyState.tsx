"use client";

import React, { useCallback, useState } from "react";
import { MessageSquarePlus, PlusCircle, Sparkles } from "lucide-react";

interface WorkspaceEmptyStateProps {
  onOpenChat?: () => void;
  onCreateBlankMap?: () => void;
}

export function WorkspaceEmptyState({ onOpenChat, onCreateBlankMap }: WorkspaceEmptyStateProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleCreateBlankMap = useCallback(() => {
    onCreateBlankMap?.();
    setDismissed(true);
  }, [onCreateBlankMap]);

  if (dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <section className="pointer-events-auto max-w-xs rounded-2xl border border-slate-200 bg-white/95 p-5 text-center shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-orange-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Start your first mind map
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Create a blank map, or describe your idea and let AI build it for you.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCreateBlankMap}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
          >
            <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Create new mind map
          </button>
          <button
            type="button"
            onClick={onOpenChat ?? handleCreateBlankMap}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Ask AI to build it
          </button>
        </div>
      </section>
    </div>
  );
}

export default WorkspaceEmptyState;
