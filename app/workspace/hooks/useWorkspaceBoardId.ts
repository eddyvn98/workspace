"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markBoardSelfCreated } from "../utils/selfCreatedBoards";
import { createWorkspaceId } from "../utils/workspaceId";
import { fetchHiddenWorkspaceBoardIds } from "../utils/hiddenWorkspaceBoards";
import { pickSharedBoardToOpen } from "../utils/pickSharedBoardToOpen";
import { fetchSharedBoardList } from "./workspaceShareApi";
import { migrateLegacyMindmapsToWorkspace } from "./workspaceBoardApi";
import {
  listWorkspaceBoards,
  migrateLegacyDraft,
  readLastOpenedWorkspaceBoard,
  rememberLastOpenedWorkspaceBoard,
} from "./workspaceBoardIndex";

/**
 * Resolves which board `/workspace` should open. A bare `/workspace` visit
 * (no `?id=` or explicit `?empty=1`) reopens the last known board, else the
 * newest board shared with the account. A fresh id is created only when the
 * account genuinely has no boards, shared or owned, preserving the
 * distinction between "open Workspace" and the explicit "+ New Board" action.
 * The explicit empty state is used after deleting the last board, so that
 * deletion does not immediately create its replacement.
 */
export function useWorkspaceBoardId(): string | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const isExplicitlyEmpty = searchParams.get("empty") === "1";
  const bareRouteResolutionRef = useRef<Promise<void> | null>(null);
  const navigateResolvedBoard = (board: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("empty");
    url.searchParams.set("id", board);
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (id || isExplicitlyEmpty) {
      bareRouteResolutionRef.current = null;
      if (id) rememberLastOpenedWorkspaceBoard(id);
      return;
    }
    // React Strict Mode runs mount effects twice. Keep one shared resolution
    // promise so the second pass neither mints a second board nor cancels the
    // first pass before its remote list request completes.
    if (bareRouteResolutionRef.current) return;

    const isStillBareWorkspaceRoute = () => {
      if (typeof window === "undefined" || window.location.pathname !== "/workspace") return false;
      const currentParams = new URLSearchParams(window.location.search);
      return !currentParams.get("id") && currentParams.get("empty") !== "1";
    };
    const resolution = (async () => {
      migrateLegacyDraft();
      // The cutover must happen before selecting from localStorage: an old
      // browser can know a local board while the account still has legacy
      // maps that are not yet represented in Workspace.
      let migrationFailed = false;
      try {
        await migrateLegacyMindmapsToWorkspace();
      } catch {
        // A transient migration/database failure must not hide a board that
        // this browser can already open safely. If there is no local fallback,
        // the outer catch below keeps the route explicitly empty.
        migrationFailed = true;
      }
      if (!isStillBareWorkspaceRoute()) return;

      const knownBoards = listWorkspaceBoards();
      const lastOpenedId = readLastOpenedWorkspaceBoard();
      const existingBoard = knownBoards.find((board) => board.id === lastOpenedId) ?? knownBoards[0];
      if (existingBoard) {
        navigateResolvedBoard(existingBoard.id);
        return;
      }
      if (migrationFailed) throw new Error("Legacy mindmap migration unavailable");

      // The local index can be empty on a new browser even when the account has
      // server boards. Resolve that case before deciding whether a new board is
      // needed; a failed list request leaves Workspace explicitly empty instead
      // of silently creating a board that looks like user data.
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      if (!response.ok) throw new Error(`Workspace list failed (${response.status})`);
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) throw new Error("Workspace list was malformed");
      if (!isStillBareWorkspaceRoute()) return;
      const remoteBoards = payload.filter(
        (board): board is { id: string } =>
          Boolean(board && typeof board === "object" && typeof (board as { id?: unknown }).id === "string"),
      );
      const remoteBoard = remoteBoards.find((board) => board.id === lastOpenedId) ?? remoteBoards[0];
      if (remoteBoard) {
        navigateResolvedBoard(remoteBoard.id);
        return;
      }

      // No board of its own, but boards shared with the account count as
      // something to open: land on the newest visible one rather than
      // minting an empty board nobody asked for.
      const [sharedBoards, hiddenIds] = await Promise.all([
        fetchSharedBoardList(),
        fetchHiddenWorkspaceBoardIds(),
      ]);
      if (!isStillBareWorkspaceRoute()) return;
      const sharedBoard = pickSharedBoardToOpen(sharedBoards, hiddenIds);
      if (sharedBoard) {
        navigateResolvedBoard(sharedBoard.id);
        return;
      }

      const newId = createWorkspaceId();
      markBoardSelfCreated(newId);
      navigateResolvedBoard(newId);
    })().catch(() => {
        if (isStillBareWorkspaceRoute()) router.replace("/workspace?empty=1");
    });
    bareRouteResolutionRef.current = resolution;
  }, [id, isExplicitlyEmpty, router]);

  return id;
}

export default useWorkspaceBoardId;
