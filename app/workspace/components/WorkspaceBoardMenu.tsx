"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createWorkspaceBoardEntry, deleteWorkspaceBoard, listWorkspaceBoards, renameWorkspaceBoard, type BoardIndexEntry } from "../hooks/useWorkspacePersistence";
import { fetchRemoteBoardList } from "../hooks/workspaceBoardApi";
import { fetchSharedBoardList, leaveSharedBoard, type SharedBoardSummary } from "../hooks/workspaceShareApi";
import { markBoardSelfCreated } from "../utils/selfCreatedBoards";
import { createWorkspaceId } from "../utils/workspaceId";
import { fetchHiddenWorkspaceBoardIds, hideWorkspaceBoard, listHiddenWorkspaceBoardIds, restoreWorkspaceBoard } from "../utils/hiddenWorkspaceBoards";
import { fetchWorkspaceLastSeen } from "../hooks/useWorkspaceSeenMarker";
import { hasUnseenBoardUpdates, mergeWorkspaceBoards, sortWorkspaceBoardsByCreation } from "../utils/workspaceBoardListOrder";
import { WorkspaceSharedBoardSections } from "./WorkspaceSharedBoardSections";
import { WorkspaceBoardMenuRow } from "./WorkspaceBoardMenuRow";

export function WorkspaceBoardMenu({ embedded = false, onOpenOutline }: { embedded?: boolean; onOpenOutline?: (id: string) => void }) {
  const router = useRouter();
  // Read straight from the URL rather than the store's boardId: that field
  // only updates once useWorkspacePersistence finishes adopting the new
  // board's content (after a local-cache read and, later, a network
  // round trip), so the active highlight lagged behind the click by a beat
  // and visibly landed on the wrong row before settling. The URL param
  // changes in the same tick as router.push, so the highlight now moves
  // exactly when the click does.
  const currentBoardId = useSearchParams().get("id");
  const [boards, setBoards] = useState<BoardIndexEntry[]>([]);
  const [sharedBoards, setSharedBoards] = useState<SharedBoardSummary[]>([]);
  const [hiddenBoardIds, setHiddenBoardIds] = useState<string[]>([]);
  // { [boardId]: ISO date } of the last time this account had each board
  // open (app/api/workspaces/seen). A shared board whose updatedAt is newer
  // than that stamp gets the unseen dot — see hasUnseenUpdates.
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    // listWorkspaceBoards() returns the raw localStorage index, which
    // upsertIndexEntry keeps in most-recently-touched-first order (it
    // prepends on every save). The remote merge below always resorts by
    // creation date, so rendering this raw order first — even for a
    // heartbeat — visibly bounced the active row to wherever it last got
    // touched before dropping back to its stable, creation-order position.
    setBoards(sortWorkspaceBoardsByCreation(listWorkspaceBoards()));
    void fetchRemoteBoardList().then((remote) => {
      if (remote.length === 0) return;
      const normalized = remote.map((r) => ({
        ...r,
        updatedAt: new Date(r.updatedAt).getTime(),
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : undefined,
      }));
      setBoards((current) => mergeWorkspaceBoards(current, normalized));
    });
    void fetchSharedBoardList().then(setSharedBoards);
  };
  useEffect(() => {
    setHiddenBoardIds(listHiddenWorkspaceBoardIds());
    void fetchHiddenWorkspaceBoardIds().then(setHiddenBoardIds);
    void fetchWorkspaceLastSeen().then((result) => setLastSeen(result.lastSeen));
    refresh();
  }, [currentBoardId]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  // Board content is entirely client-hydrated. Using router.push here makes
  // Next wait for an RSC navigation for the same client page, even though the
  // board can already be adopted from localStorage immediately. The native
  // History API is integrated with the App Router in Next 14.2: it updates
  // useSearchParams/useWorkspaceBoardId and preserves back/forward history
  // without holding the click behind an unnecessary RSC transition.
  const navigateToBoard = (id: string) => {
    const href = `/workspace?id=${encodeURIComponent(id)}`;
    if (typeof window === "undefined") {
      router.push(href);
      return;
    }
    window.history.pushState({}, "", href);
  };

  const handleNewBoard = () => {
    const newId = createWorkspaceId();
    markBoardSelfCreated(newId);
    createWorkspaceBoardEntry(newId);
    navigateToBoard(newId);
  };

  // Clicking a row switches the canvas to that board and nothing else — it
  // used to jump into the outline when the row was already the open board,
  // which meant the click target's behavior depended on which board you
  // happened to be on. Entering the outline is now only reachable through
  // the outline button itself (handleOpenOutline).
  const handleOpen = (id: string) => {
    if (id === currentBoardId) return;
    navigateToBoard(id);
  };

  const handleOpenOutline = (id: string) => {
    if (id !== currentBoardId) handleOpen(id);
    onOpenOutline?.(id);
  };

  const handleDeleteRequest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId) return;
    setEditingId(null);
    setPendingDeleteId(id);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId) return;
    const orderBeforeDelete = sortWorkspaceBoardsByCreation([
      ...boards,
      ...listWorkspaceBoards().filter((entry) => !boards.some((board) => board.id === entry.id)),
    ]);
    const deletedIndex = orderBeforeDelete.findIndex((entry) => entry.id === id);
    setDeletingId(id);
    const result = await deleteWorkspaceBoard(id);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to delete workspace");
      setDeletingId(null);
      setPendingDeleteId(null);
      refresh();
      return;
    }

    if (id === currentBoardId) {
      const remaining = orderBeforeDelete.filter((entry) => entry.id !== id);
      // Keep the list's current order: the row that followed the deleted one
      // becomes active; if it was the last row, fall back to the previous one.
      const nextBoard = remaining[deletedIndex] ?? remaining[deletedIndex - 1] ?? remaining[0];
      if (nextBoard) {
        router.push(`/workspace?id=${nextBoard.id}`);
      } else {
        // `/workspace` normally mints an id for a fresh visit. Keep an
        // explicit empty marker so this deletion does not get replaced by a
        // new board, including after a reload.
        router.replace("/workspace?empty=1");
      }
      setDeletingId(null);
      setPendingDeleteId(null);
      return;
    }

    setDeletingId(null);
    setPendingDeleteId(null);
    refresh();
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!deletingId) setPendingDeleteId(null);
  };

  const handleStartRename = (e: React.MouseEvent, board: BoardIndexEntry) => {
    e.stopPropagation();
    setEditingId(board.id);
    setEditingTitle(board.title);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = editingTitle.trim();
    const current = boards.find((b) => b.id === id);
    if (trimmed && trimmed !== current?.title) {
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title: trimmed } : b)));
      void renameWorkspaceBoard(id, trimmed).then((result) => {
        if (result.ok) return;
        toast.error(result.error ?? "Failed to rename workspace");
        refresh();
      });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleHideSharedBoard = (id: string) => {
    hideWorkspaceBoard(id);
    setHiddenBoardIds((current) => [...new Set([...current, id])]);
    toast.success("Shared board hidden");
  };

  const handleRestoreSharedBoard = (id: string) => {
    restoreWorkspaceBoard(id);
    setHiddenBoardIds((current) => current.filter((hiddenId) => hiddenId !== id));
    toast.success("Shared board restored");
  };

  const handleLeaveSharedBoard = async (board: SharedBoardSummary) => {
    if (!window.confirm(`Leave shared board \"${board.title}\"?`)) return;
    const result = await leaveSharedBoard(board.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSharedBoards((current) => current.filter((entry) => entry.id !== board.id));
    toast.success("You left the shared board");
    if (board.id === currentBoardId) handleNewBoard();
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredBoards = query
    ? boards.filter((b) => b.title.toLowerCase().includes(query))
    : boards;
  const filteredSharedBoards = query
    ? sharedBoards.filter((b) => b.title.toLowerCase().includes(query))
    : sharedBoards;
  const visibleSharedBoards = filteredSharedBoards.filter((board) => !hiddenBoardIds.includes(board.id));
  const hiddenSharedBoards = filteredSharedBoards.filter((board) => hiddenBoardIds.includes(board.id));
  const toggleMenu = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) refresh();
    else {
      setSearchQuery("");
      setEditingId(null);
    }
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
        {!embedded && <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleMenu();
            }
          }}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 max-sm:gap-0 max-sm:px-2"
          title="My Boards"
          aria-label="My Boards"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Boards</span>
        </button>}

      {(embedded || isOpen) && <div className={embedded ? "w-full px-2 pb-2 pt-1" : "absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"}>
        <div className="mb-2 flex gap-1.5">
          <div className="relative flex-1">
          <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search mindmaps..."
            className="w-full rounded-lg border-0 bg-slate-50 py-1.5 pl-6 pr-2 text-[16px] leading-5 text-slate-700 outline-none focus:outline-none focus:ring-0 dark:bg-slate-800 dark:text-slate-300 sm:text-[11px]"
          />
          </div>
          <button type="button" aria-label="Create new mindmap" title="Create new mindmap" onClick={() => { setIsOpen(false); handleNewBoard(); }} className="shrink-0 rounded-lg bg-orange-500 p-1.5 text-white transition-colors hover:bg-orange-600">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {filteredBoards.length > 0 && (
          <div className="space-y-0.5">
            {filteredBoards.map((board) => (
              <WorkspaceBoardMenuRow
                key={board.id}
                board={board}
                isActive={board.id === currentBoardId}
                isEditing={editingId === board.id}
                isPendingDelete={pendingDeleteId === board.id}
                isDeleting={deletingId === board.id}
                editingTitle={editingTitle}
                showOutlineButton={Boolean(onOpenOutline)}
                onOpen={handleOpen}
                onOpenOutline={handleOpenOutline}
                onEditingTitleChange={setEditingTitle}
                onSaveRename={handleSaveRename}
                onCancelRename={handleCancelRename}
                onStartRename={handleStartRename}
                onDeleteRequest={handleDeleteRequest}
                onDeleteConfirm={handleDeleteConfirm}
                onDeleteCancel={handleDeleteCancel}
              />
            ))}
          </div>
        )}

        <WorkspaceSharedBoardSections boards={visibleSharedBoards} hiddenBoards={hiddenSharedBoards} currentBoardId={currentBoardId} isUnseen={(board) => hasUnseenBoardUpdates(board, lastSeen, currentBoardId)} onOpen={handleOpen} onHide={handleHideSharedBoard} onRestore={handleRestoreSharedBoard} onLeave={handleLeaveSharedBoard} />

        {query && filteredBoards.length === 0 && visibleSharedBoards.length === 0 && hiddenSharedBoards.length === 0 && (
          <div className="px-2.5 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            No mindmaps found
          </div>
        )}
      </div>}
    </div>
  );
}

export default WorkspaceBoardMenu;
