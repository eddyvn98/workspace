"use client";

import React, { useState } from "react";
import { GripVertical, Play, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CameraFrame } from "../types/camera";
import { createFrameForBlocks, duplicateCameraFrame, resolveCameraFrame, reorderFrames, sortedFrames } from "../utils/cameraFrameOps";
import { buildFrameContainer } from "../utils/frameContainerOps";
import { WorkspaceFrameActions } from "./WorkspaceFrameActions";
import { useWorkspacePresentState } from "../hooks/useWorkspacePresentState";

/** Right-hand "Presentation" panel — any block (or selection of blocks,
 *  regardless of type) can be saved as a numbered camera bookmark here, then
 *  reordered by drag, then played back in Present mode. Mirrors Miro's Frames
 *  panel: a frame is just a saved camera position, so it works for literally
 *  any board content instead of needing a dedicated slide/frame primitive. */
export function WorkspaceFramesPanel() {
  const readOnly = useWorkspaceStore((state) => state.isReadOnly);
  const frames = useWorkspaceStore((state) => state.frames);
  const setFrames = useWorkspaceStore((state) => state.setFrames);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const { startPresenting } = useWorkspacePresentState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const ordered = sortedFrames(frames);

  const handleSaveFrame = () => {
    if (readOnly) return;
    const newFrame = createFrameForBlocks(
      blocks,
      selectedBlockIds,
      { x: camera.x, y: camera.y, zoom: camera.zoom },
      ordered.length,
      `Frame ${ordered.length + 1}`,
    );
    setFrames([...frames, newFrame]);
  };

  const handleCreateContainer = () => {
    if (readOnly) return;
    const store = useWorkspaceStore.getState();
    const container = buildFrameContainer(store.blocks, store.selectedBlockIds, `Frame ${ordered.length + 1}`);
    if (!container) return;
    store.addBlock(container);
    const state = useWorkspaceStore.getState();
    state.setBlockOrder([container.id, ...state.blockOrder.filter((id) => id !== container.id)]);
    const frame = createFrameForBlocks(state.blocks, [container.id, ...store.selectedBlockIds], camera, ordered.length, `Frame ${ordered.length + 1}`);
    state.setFrames([...state.frames, frame]);
    state.setSelection([container.id]);
  };

  const handleDeleteFrame = (id: string) => {
    if (readOnly) return;
    setFrames(sortedFrames(frames.filter((f) => f.id !== id)).map((f, index) => ({ ...f, order: index })));
  };

  const handleStartRename = (frame: CameraFrame) => {
    setEditingId(frame.id);
    setEditingName(frame.name);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed && !readOnly) {
      setFrames(frames.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    }
    setEditingId(null);
  };

  const handleDrop = (targetIndex: number) => {
    if (!readOnly && dragIndex !== null && dragIndex !== targetIndex) {
      setFrames(reorderFrames(frames, dragIndex, targetIndex));
    }
    setDragIndex(null);
  };

  return (
    <div
      className="fixed bottom-20 left-4 z-40 flex w-56 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur max-sm:bottom-24 max-sm:left-2 dark:border-slate-800 dark:bg-slate-900/95"
      onPointerDown={(e) => e.stopPropagation()}
      role="region"
      aria-label="Presentation frames"
    >
      <div className="flex items-center justify-between gap-1 border-b border-slate-200 pb-1.5 dark:border-slate-800">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
          Frames
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => startPresenting()}
            disabled={!ordered.some((frame) => !frame.hiddenInPresentation)}
            title="Present (cycles through every frame)"
            aria-label="Start presenting"
            className="flex h-6 w-6 items-center justify-center rounded-lg text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-400 dark:hover:bg-orange-950/50 dark:disabled:text-slate-700 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={handleSaveFrame}
            title={selectedBlockIds.length > 0 ? "Add selected block(s) as a frame" : "Add current view as a frame"}
            className="rounded-lg px-2 py-0.5 text-xs font-bold text-orange-600 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:text-orange-400 dark:hover:bg-orange-950/50 cursor-pointer"
          >
            + Add
          </button>
        </div>
      </div>

      <button type="button" disabled={readOnly || !selectedBlockIds.length} onClick={handleCreateContainer} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Create container from selection</button>
      <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto pr-0.5">
        {ordered.length === 0 ? (
          <span className="py-2 text-center text-xs text-slate-400 select-none dark:text-slate-500">
            No frames yet — select any block(s) and click + Add
          </span>
        ) : (
          ordered.map((frame, index) => (
            <div
              key={frame.id}
              draggable={!readOnly}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(index);
              }}
              className="group flex flex-wrap items-center justify-between gap-1 rounded-lg px-1 py-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-300 dark:text-slate-600" />
              <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">{index + 1}</span>
              {editingId === frame.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveRename(frame.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(frame.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 rounded border border-orange-400 bg-white px-1.5 py-0.5 text-xs text-slate-800 outline-none dark:bg-slate-900 dark:text-slate-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCamera({ ...resolveCameraFrame(frame, blocks), activeFrameId: frame.id })}
                  onDoubleClick={() => !readOnly && handleStartRename(frame)}
                  className="flex-1 truncate px-1 py-1 text-left text-xs font-medium text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 dark:text-slate-200 cursor-pointer"
                  title={`Jump to ${frame.name} (double-click to rename)`}
                >
                  {frame.name}
                </button>
              )}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => handleDeleteFrame(frame.id)}
                title="Delete frame"
                aria-label={`Delete ${frame.name}`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="w-full pl-5">
                <WorkspaceFrameActions frame={frame} index={index} total={ordered.length} readOnly={readOnly}
                  update={(patch) => !readOnly && setFrames(frames.map((item) => item.id === frame.id ? { ...item, ...patch } : item))}
                  duplicate={() => !readOnly && setFrames(duplicateCameraFrame(frames, frame.id))}
                  move={(to) => !readOnly && setFrames(reorderFrames(frames, index, to))}
                  recapture={() => {
                    if (readOnly) return;
                    const captured = createFrameForBlocks(blocks, selectedBlockIds, camera, index, frame.name);
                    setFrames(frames.map((item) => item.id === frame.id ? { ...item, camera: captured.camera, blockIds: captured.blockIds } : item));
                  }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default WorkspaceFramesPanel;
