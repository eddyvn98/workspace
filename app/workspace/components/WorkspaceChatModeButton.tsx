"use client";

import { Bot } from "lucide-react";

export function WorkspaceChatModeButton() {

  return (
    <div
      role="status"
      className="flex max-w-[150px] items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-300"
      title="Workspace Dify workflow with custom tools"
      aria-label="Current AI source: Dify"
    >
      <Bot className="h-4 w-4 shrink-0" />
      <span className="truncate">Dify</span>
    </div>
  );
}
