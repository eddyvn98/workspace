"use client";

import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { usePresentationKeys } from "../hooks/usePresentationKeys";
import { resolveCameraFrame, sortedFrames } from "../utils/cameraFrameOps";
import { useWorkspacePresentState } from "../hooks/useWorkspacePresentState";

/** Presentation playback chrome. Present mode never extracts content into a
 *  separate slide — it just pans/zooms the real canvas camera to each saved
 *  frame in turn, so any block (or mix of block types) already on the board
 *  can be "presented" exactly where it lives, matching how Miro's own
 *  frame-based Present works. */
export function WorkspacePresentOverlay() {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const frames = useWorkspaceStore((state) => state.frames);
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const { isPresenting, presentIndex, stopPresenting, goToPresentIndex } = useWorkspacePresentState();
  const ordered = React.useMemo(() => sortedFrames(frames).filter((frame) => !frame.hiddenInPresentation), [frames]);
  const total = ordered.length;
  const restoreCameraRef = useRef(camera);

  useEffect(() => {
    if (!isPresenting) return;
    // Snapshot the camera each time a presentation STARTS (not on every
    // mount — this component stays mounted, just rendering null, between
    // sessions), so Exit restores where the presenter actually was instead
    // of wherever the last session's last frame left off.
    restoreCameraRef.current = camera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresenting]);


  const handleExit = React.useCallback(() => {
    setCamera(restoreCameraRef.current);
    stopPresenting();
  }, [setCamera, stopPresenting]);

  const goNext = React.useCallback(() => {
    if (presentIndex < total - 1) goToPresentIndex(presentIndex + 1);
  }, [presentIndex, total, goToPresentIndex]);

  const goPrev = React.useCallback(() => {
    if (presentIndex > 0) goToPresentIndex(presentIndex - 1);
  }, [presentIndex, goToPresentIndex]);

  usePresentationKeys(isPresenting, goNext, goPrev, handleExit, goToPresentIndex, total);
  useEffect(() => {
    if (!isPresenting) return;
    if (!total) { handleExit(); return; }
    const index = Math.min(presentIndex, total - 1);
    if (index !== presentIndex) goToPresentIndex(index);
    const frame = ordered[index];
    setCamera({ ...resolveCameraFrame(frame, blocks), activeFrameId: frame.id });
  }, [isPresenting, presentIndex, ordered, blocks, setCamera, handleExit, goToPresentIndex, total]);

  if (!isPresenting || total === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[900]">
      <div className="pointer-events-none absolute inset-0 ring-8 ring-black/85" />
      <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
        <span>Presenting — {ordered[presentIndex]?.name ?? ""}</span>
      </div>
      {ordered[presentIndex]?.presenterNotes && <aside className="pointer-events-auto absolute right-4 top-16 max-h-64 w-64 overflow-auto rounded bg-black/85 p-3 text-sm text-white whitespace-pre-wrap">{ordered[presentIndex].presenterNotes}</aside>}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/85 px-4 py-2 text-white shadow-xl backdrop-blur">
        <button type="button" onClick={goPrev} disabled={presentIndex === 0} aria-label="Previous frame" className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-30 cursor-pointer">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-semibold tabular-nums">{presentIndex + 1} / {total}</span>
        <button type="button" onClick={goNext} disabled={presentIndex === total - 1} aria-label="Next frame" className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-30 cursor-pointer">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-white/20" />
        <button type="button" onClick={handleExit} aria-label="Exit presentation" title="Exit presentation (Esc)" className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/15 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default WorkspacePresentOverlay;
