"use client";

import React from "react";
import { HelpCircle, History, MoreHorizontal, Search, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface WorkspaceMobileMoreMenuProps {
  boardId: string | null;
  onHelpClick: () => void;
  onToggleSearch: () => void;
  onOpenHistory: () => void;
  onShare?: () => void;
  isReadOnly?: boolean;
}

export function WorkspaceMobileMoreMenu({
  boardId,
  onHelpClick,
  onToggleSearch,
  onOpenHistory,
  onShare,
  isReadOnly = false,
}: WorkspaceMobileMoreMenuProps) {
  const [open, setOpen] = React.useState(false);

  const closeAfter = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors cursor-pointer data-[state=open]:bg-orange-500/10 data-[state=open]:text-orange-600 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="More options"
          aria-label="More options"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl z-50">
        <button
          type="button"
          onClick={() => closeAfter(onToggleSearch)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>Search &amp; Replace</span>
        </button>
        {boardId && (
          <button
            type="button"
            onClick={() => closeAfter(onOpenHistory)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <History className="w-4 h-4" />
            <span>Version History</span>
          </button>
        )}
        {boardId && onShare && !isReadOnly && (
          <button
            type="button"
            onClick={() => closeAfter(onShare)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Users className="w-4 h-4" />
          <span>Share Mindmap</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => closeAfter(onHelpClick)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
          <span>Help &amp; Shortcuts</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default WorkspaceMobileMoreMenu;
