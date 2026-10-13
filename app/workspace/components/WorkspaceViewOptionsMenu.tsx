"use client";

import React from "react";
import { Check, Eye, EyeOff, MessageSquare, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShowCanvasComments } from "../hooks/useShowCanvasComments";
import { useShowAttribution } from "../hooks/useShowAttribution";

export function WorkspaceViewOptionsMenu({ compact = false }: { compact?: boolean }) {
  const { showCanvasComments, toggleShowCanvasComments } = useShowCanvasComments();
  const { showAttribution, toggleShowAttribution } = useShowAttribution();

  const allHidden = !showAttribution && !showCanvasComments;
  const someHidden = !showAttribution || !showCanvasComments;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? `relative flex h-9 w-9 items-center justify-center rounded-xl transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-600 ${
                  someHidden
                    ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`
              : `relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-600 ${
                  someHidden
                    ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`
          }
          title="Canvas view options (Authors, Canvas comments)"
          aria-label="Canvas view options"
        >
          {allHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {someHidden && !allHidden && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={compact ? "right" : "bottom"}
        align={compact ? "start" : "end"}
        sideOffset={8}
        className="w-60 p-2 rounded-xl z-50 shadow-xl border border-slate-200 dark:border-slate-800"
      >
        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
          Canvas Display
        </div>

        <div className="mt-1 space-y-1">
          {/* Toggle Authors */}
          <button
            type="button"
            onClick={toggleShowAttribution}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Show authors
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  Author edit indicators
                </span>
              </div>
            </div>
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                showAttribution
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-300 bg-transparent dark:border-slate-600"
              }`}
            >
              {showAttribution && <Check className="h-3 w-3 stroke-[3]" />}
            </div>
          </button>

          {/* Toggle Canvas Comments */}
          <button
            type="button"
            onClick={toggleShowCanvasComments}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Show comments
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  Comment pins on canvas
                </span>
              </div>
            </div>
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                showCanvasComments
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-300 bg-transparent dark:border-slate-600"
              }`}
            >
              {showCanvasComments && <Check className="h-3 w-3 stroke-[3]" />}
            </div>
          </button>

        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceViewOptionsMenu;
