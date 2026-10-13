"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, RefreshCw, TriangleAlert } from "lucide-react";

export interface WorkspaceLoadErrorOverlayProps {
  onRetry?: () => void;
  onBackToBoards?: () => void;
}

/** Shown instead of the empty-state hint when a boardId came from outside
 *  this browser (a shared link, a bookmark, a typo) and the server fetch
 *  failed — see workspaceBoardApi.ts's checkBoardAccess and
 *  utils/selfCreatedBoards.ts for how this is told apart from a brand-new
 *  board's expected first-save 404. */
export function WorkspaceLoadErrorOverlay({
  onRetry,
  onBackToBoards,
}: WorkspaceLoadErrorOverlayProps = {}) {
  const router = useRouter();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleBackToBoards = () => {
    if (onBackToBoards) {
      onBackToBoards();
    } else {
      router.push("/workspace");
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <section className="pointer-events-auto w-full max-w-[30rem] rounded-3xl border border-slate-200 bg-white/95 p-6 text-center shadow-xl backdrop-blur max-sm:ml-12 max-sm:max-w-[20rem] max-sm:p-5 dark:border-slate-800 dark:bg-slate-900/95">
        <TriangleAlert className="mx-auto h-9 w-9 text-amber-500" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-semibold text-slate-700 dark:text-slate-100">
          This board couldn&apos;t be loaded
        </h1>
        <p className="mx-auto mt-2 max-w-[25rem] text-base leading-6 text-slate-500 dark:text-slate-400">
          It may not exist, or you may not have access to it. Double-check the
          link, or ask the board owner to share it with you again.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={handleRetry}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <button
            type="button"
            onClick={handleBackToBoards}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-transparent px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            Go to my boards
          </button>
        </div>
      </section>
    </div>
  );
}

export default WorkspaceLoadErrorOverlay;
