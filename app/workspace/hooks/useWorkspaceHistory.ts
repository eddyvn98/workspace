"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraFrame } from "../types/camera";
import type { BlockId, CanvasBlock } from "../types/block";
import type { CanvasConnector, ConnectorId } from "../types/connector";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { sameWorkspaceHistoryContent, workspaceHistoryChangedFields } from "../utils/workspaceHistoryContent";
import {
  normalizeTreeLayoutFields,
  type NormalizedTreeLayoutFields,
} from "../utils/normalizeTreeLayoutFields";
import {
  consumeSkippedWorkspaceHistorySnapshot,
  registerWorkspaceHistoryHandlers,
} from "../utils/workspaceHistoryBridge";

/** Mirrors legacy's MindmapHistoryEntry (app/mindmap/hooks/useMindmapSession.ts)
 *  — every undo step also carries the layout settings active when it was
 *  recorded, so scrubbing back through tree edits restores the layout family/
 *  direction/growth-mode/timeline style that was active at that point, not
 *  just the block/connector shape. */
export interface WorkspaceSnapshot extends NormalizedTreeLayoutFields {
  title: string;
  blocks: Record<BlockId, CanvasBlock>;
  blockOrder: BlockId[];
  connectors: Record<ConnectorId, CanvasConnector>;
  frames: CameraFrame[];
}

export interface WorkspaceHistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function cloneSnapshot<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback if structuredClone fails on edge cases
    }
  }
  return JSON.parse(JSON.stringify(data));
}

/**
 * Hook to track workspace canvas history for undo/redo.
 *
 * Subscribes to changes in blocks, blockOrder, and connectors from outside
 * useWorkspaceStore, debouncing rapid mutations (300ms) into discrete undo steps.
 */
export function useWorkspaceHistory(): WorkspaceHistoryApi {
  const historyRef = useRef<WorkspaceSnapshot[]>([]);
  const cursorRef = useRef<number>(-1);
  const isRestoringRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializedRef = useRef<boolean>(false);

  const lastStateRef = useRef<WorkspaceSnapshot | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Seed initial snapshot on initial mount
  if (!isInitializedRef.current) {
    const initialState = useWorkspaceStore.getState();
    const initialSnapshot: WorkspaceSnapshot = cloneSnapshot({
      title: initialState.title,
      blocks: initialState.blocks,
      blockOrder: initialState.blockOrder,
      connectors: initialState.connectors,
      frames: initialState.frames,
      ...normalizeTreeLayoutFields(initialState),
    });
    historyRef.current = [initialSnapshot];
    cursorRef.current = 0;
    lastStateRef.current = { title: initialState.title, blocks: initialState.blocks, blockOrder: initialState.blockOrder, connectors: initialState.connectors, frames: initialState.frames, ...normalizeTreeLayoutFields(initialState) };
    isInitializedRef.current = true;
  }

  const commitCurrentState = useCallback(() => {
    const state = useWorkspaceStore.getState();
    const nextSnapshot: WorkspaceSnapshot = cloneSnapshot({
      title: state.title,
      blocks: state.blocks,
      blockOrder: state.blockOrder,
      connectors: state.connectors,
      frames: state.frames,
      ...normalizeTreeLayoutFields(state),
    });

    // Discard any "future" (redo) entries ahead of the cursor
    const newHistory = historyRef.current.slice(0, cursorRef.current + 1);
    newHistory.push(nextSnapshot);
    if (newHistory.length > 80) newHistory.shift();
    historyRef.current = newHistory;
    cursorRef.current = newHistory.length - 1;

    setCanUndo(cursorRef.current > 0);
    setCanRedo(false);
  }, []);

  const restore = useCallback((cursor: number) => {
    const target = historyRef.current[cursor];
    if (!target) return;
    cursorRef.current = cursor;
    isRestoringRef.current = true;
    try {
      const restored = cloneSnapshot(target);
      useWorkspaceStore.setState(restored);
      lastStateRef.current = restored;
    } finally {
      isRestoringRef.current = false;
    }
    setCanUndo(cursor > 0);
    setCanRedo(cursor < historyRef.current.length - 1);
  }, []);

  const flushPending = useCallback(() => {
    if (debounceTimerRef.current === null) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    commitCurrentState();
  }, [commitCurrentState]);

  const undo = useCallback(() => {
    if (useWorkspaceStore.getState().isReadOnly) return;
    flushPending();
    if (cursorRef.current > 0) restore(cursorRef.current - 1);
  }, [flushPending, restore]);

  const redo = useCallback(() => {
    if (useWorkspaceStore.getState().isReadOnly) return;
    // A new edit must invalidate the old redo branch even within the debounce window.
    flushPending();
    if (cursorRef.current < historyRef.current.length - 1) restore(cursorRef.current + 1);
  }, [flushPending, restore]);

  useEffect(() => {
    let boardId = useWorkspaceStore.getState().boardId;
    const resetHistory = () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      historyRef.current = [cloneSnapshot(lastStateRef.current!)];
      cursorRef.current = 0;
      setCanUndo(false); setCanRedo(false);
    };
    if (consumeSkippedWorkspaceHistorySnapshot()) {
      const state = useWorkspaceStore.getState();
      lastStateRef.current = {
        title: state.title,
      blocks: state.blocks,
        blockOrder: state.blockOrder,
        connectors: state.connectors,
        frames: state.frames,
        ...normalizeTreeLayoutFields(state),
      };
      resetHistory();
    }
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      const skipped = consumeSkippedWorkspaceHistorySnapshot();
      if (isRestoringRef.current) return;
      const boardChanged = state.boardId !== boardId;
      boardId = state.boardId;

      // Only schedule snapshot if blocks, blockOrder, or connectors reference changed
      if (!boardChanged &&
        state.title === lastStateRef.current?.title &&
        state.blocks === lastStateRef.current?.blocks &&
        state.blockOrder === lastStateRef.current?.blockOrder &&
        state.connectors === lastStateRef.current?.connectors &&
        state.frames === lastStateRef.current?.frames &&
        Object.entries(normalizeTreeLayoutFields(state)).every(([key, value]) => lastStateRef.current?.[key as keyof WorkspaceSnapshot] === value)
      ) {
        return;
      }

      const previous = lastStateRef.current;
      lastStateRef.current = {
        title: state.title,
      blocks: state.blocks,
        blockOrder: state.blockOrder,
        connectors: state.connectors,
        frames: state.frames,
        ...normalizeTreeLayoutFields(state),
      };

      if (boardChanged) { resetHistory(); return; }
      if (skipped && !sameWorkspaceHistoryContent(previous, lastStateRef.current)) {
        console.info("[Workspace history] Incoming content reset undo:", workspaceHistoryChangedFields(previous, lastStateRef.current));
        resetHistory(); return;
      }
      if (skipped) return;

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        commitCurrentState();
      }, 300);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [commitCurrentState]);

  useEffect(() => registerWorkspaceHistoryHandlers({ undo, redo }), [redo, undo]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

export default useWorkspaceHistory;
