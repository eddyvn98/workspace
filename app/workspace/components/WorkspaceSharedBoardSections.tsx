"use client";

import { EyeOff, LogOut, RotateCcw } from "lucide-react";
import type { SharedBoardSummary } from "../hooks/workspaceShareApi";

interface WorkspaceSharedBoardSectionsProps {
  boards: SharedBoardSummary[];
  hiddenBoards: SharedBoardSummary[];
  currentBoardId: string | null;
  /** True for a board whose owner or co-editors changed it since this
   *  person last had it open — see hasUnseenUpdates in WorkspaceBoardMenu. */
  isUnseen?: (board: SharedBoardSummary) => boolean;
  onOpen: (id: string) => void;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  onLeave: (board: SharedBoardSummary) => void;
}

export function WorkspaceSharedBoardSections({ boards, hiddenBoards, currentBoardId, isUnseen, onOpen, onHide, onRestore, onLeave }: WorkspaceSharedBoardSectionsProps) {
  return <>
    {boards.length > 0 && <div className="mt-1 max-h-56 space-y-0.5 overflow-y-auto border-t border-slate-100 pt-1 dark:border-slate-800">
      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Shared with me</div>
      {boards.map((board) => <div key={board.id} className={`group flex w-full items-center gap-1 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${board.id === currentBoardId ? "bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-400" : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
        <button type="button" onClick={() => onOpen(board.id)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
          <span className="flex min-w-0 flex-col"><span className="flex min-w-0 items-center gap-1.5">{isUnseen?.(board) && <span aria-label="Changed since you last looked" title="Changed since you last looked" className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}<span className="truncate font-medium">{board.title}</span></span><span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{board.ownerEmail}</span></span>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{board.role}</span>
        </button>
        <button type="button" title="Hide shared board" aria-label={`Hide ${board.title}`} onClick={() => onHide(board.id)} className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"><EyeOff className="h-3.5 w-3.5" /></button>
        <button type="button" title="Leave shared board" aria-label={`Leave ${board.title}`} onClick={() => onLeave(board)} className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/30 dark:hover:text-red-400"><LogOut className="h-3.5 w-3.5" /></button>
      </div>)}
    </div>}
    {hiddenBoards.length > 0 && <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-800">
      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Hidden shared boards</div>
      {hiddenBoards.map((board) => <button key={board.id} type="button" onClick={() => onRestore(board.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"><span className="flex min-w-0 flex-col"><span className="truncate">{board.title}</span><span className="truncate text-[10px]">{board.ownerEmail}</span></span><RotateCcw className="h-3.5 w-3.5 shrink-0" /></button>)}
    </div>}
  </>;
}
