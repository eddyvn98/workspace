"use client";

/**
 * One row of the owner's own boards in WorkspaceBoardMenu.
 *
 * Split out of WorkspaceBoardMenu.tsx (which was at the project's 300-line
 * cap) along the same seam legacy already uses: components/child-components/
 * MindmapListRow.tsx is that engine's equivalent, and the share icon this row
 * renders is ported from it.
 */
import React from "react";
import { ArrowRight, Check, Loader2, MoreVertical, Pencil, Share2, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BoardIndexEntry } from "../hooks/useWorkspacePersistence";

function formatUpdatedAt(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(ts);
}

interface Props {
  board: BoardIndexEntry;
  isActive: boolean;
  isEditing: boolean;
  isPendingDelete: boolean;
  isDeleting: boolean;
  editingTitle: string;
  showOutlineButton: boolean;
  onOpen: (id: string) => void;
  onOpenOutline: (id: string) => void;
  onEditingTitleChange: (value: string) => void;
  onSaveRename: (id: string) => void;
  onCancelRename: () => void;
  onStartRename: (event: React.MouseEvent, board: BoardIndexEntry) => void;
  onDeleteRequest: (event: React.MouseEvent, id: string) => void;
  onDeleteConfirm: (event: React.MouseEvent, id: string) => void;
  onDeleteCancel: (event: React.MouseEvent) => void;
}

export function WorkspaceBoardMenuRow({
  board,
  isActive,
  isEditing,
  isPendingDelete,
  isDeleting,
  editingTitle,
  showOutlineButton,
  onOpen,
  onOpenOutline,
  onEditingTitleChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: Props) {
  // Either kind of exposure earns the same icon: what the owner needs from a
  // list is "someone other than me can reach this board", not which of the
  // two routes they came in by. Legacy's MindmapListRow makes the same call.
  const isShared = board.hasCollaborators === true || board.hasPublicShareLink === true;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "page" : undefined}
      onClick={() => !isEditing && onOpen(board.id)}
      onKeyDown={(event) => {
        if (!isEditing && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(board.id);
        }
      }}
      className={`group relative flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-300 ${
        isEditing ? "cursor-default" : "cursor-pointer"
      } ${
        isActive
          ? "border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300"
          : "text-slate-700 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
      }`}
    >
      {isEditing ? (
        <div
          className="flex flex-1 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            autoFocus
            value={editingTitle}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onSaveRename(board.id);
              if (e.key === "Escape") onCancelRename();
            }}
            onBlur={() => onSaveRename(board.id)}
            className="w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none dark:border-blue-500 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      ) : (
        <>
          {/* group-hover:pr-* reserves room for the absolutely positioned
              menu trigger only while it's actually visible — otherwise a
              long title truncates against the row's full width and the
              trigger lands directly on top of (rather than after) the last
              visible characters. */}
          <div className="flex min-w-0 flex-1 flex-col leading-5 transition-[padding] group-hover:pr-[26px]">
            <span className="flex items-center gap-1.5 truncate text-[11.5px] font-medium">
              {isShared && (
                <span
                  className="flex-shrink-0 text-orange-500"
                  title="This board is shared"
                  aria-label="This board is shared"
                  data-workspace-shared-icon={board.id}
                >
                  <Share2 className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
              <span className="truncate">{board.title}</span>
            </span>
            <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
              {formatUpdatedAt(board.updatedAt)}
            </span>
          </div>
          {isPendingDelete ? (
            <div className="ml-1.5 flex shrink-0 items-center gap-1 rounded-lg bg-white/80 px-0.5 dark:bg-slate-900/80" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                title="Confirm delete"
                aria-label={`Confirm delete ${board.title}`}
                disabled={isDeleting}
                onClick={(e) => onDeleteConfirm(e, board.id)}
                className="rounded bg-rose-600 p-1 text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
              >
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                type="button"
                title="Cancel delete"
                aria-label="Cancel delete"
                disabled={isDeleting}
                onClick={onDeleteCancel}
                className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[inherit]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="More options"
                  aria-label="More options"
                  className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-slate-200 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200 dark:data-[state=open]:bg-slate-700"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 p-1 rounded-xl">
                {showOutlineButton && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenOutline(board.id);
                    }}
                    className="gap-2 rounded-lg text-xs"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Open outline</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => onStartRename(e, board)}
                  className="gap-2 rounded-lg text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => onDeleteRequest(e, board.id)}
                  className="gap-2 rounded-lg text-xs text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          )}
        </>
      )}
    </div>
  );
}

export default WorkspaceBoardMenuRow;
