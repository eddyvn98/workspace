"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WorkspaceLiveHandle } from "@/lib/workspace/ydoc";
import { BOARD_METADATA_KEYS, boardMetadata } from "@/lib/workspace/boardMetadata";
import type { PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { consumeSkippedWorkspaceRealtimePublish } from "../utils/workspaceRealtimeProjection";

const LOCAL_PUBLISH_THROTTLE_MS = 50;

export function useWorkspaceRealtimePublisher(
  boardId: string,
  remoteBoardId: string | null,
  handleRef: { current: WorkspaceLiveHandle | null },
) {
  const pendingPublishRef = useRef<{ previous: PlainBoard; next: PlainBoard } | null>(null);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingPublish = useCallback(() => {
    publishTimerRef.current = null;
    const pending = pendingPublishRef.current;
    pendingPublishRef.current = null;
    if (pending) handleRef.current?.publish(pending.previous, pending.next);
  }, [handleRef]);

  const flush = useCallback(async (timeoutMs?: number) => {
    if (publishTimerRef.current !== null) {
      clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
      flushPendingPublish();
    }
    return (await handleRef.current?.awaitPersisted(timeoutMs)) ?? true;
  }, [flushPendingPublish, handleRef]);

  useEffect(() => {
    if (!remoteBoardId) return;
    const queuePublish = (previous: PlainBoard, next: PlainBoard) => {
      if (pendingPublishRef.current) pendingPublishRef.current.next = next;
      else pendingPublishRef.current = { previous, next };
      if (publishTimerRef.current === null) {
        publishTimerRef.current = setTimeout(flushPendingPublish, LOCAL_PUBLISH_THROTTLE_MS);
      }
    };
    let burstFlushQueued = false;
    const flushBurstAsMicrotask = () => {
      burstFlushQueued = false;
      flushPendingPublish();
    };
    const queueBurstPublish = (previous: PlainBoard, next: PlainBoard) => {
      if (pendingPublishRef.current) pendingPublishRef.current.next = next;
      else pendingPublishRef.current = { previous, next };
      if (!burstFlushQueued) {
        burstFlushQueued = true;
        queueMicrotask(flushBurstAsMicrotask);
      }
    };
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      const isHydrationReplay = consumeSkippedWorkspaceRealtimePublish();
      const handle = handleRef.current;
      if (Object.values(state.blocks).some((b) => b.type === "collection")) {
        if (publishTimerRef.current !== null) clearTimeout(publishTimerRef.current);
        publishTimerRef.current = null;
        pendingPublishRef.current = null;
        return;
      }
      if (!handle || state.isReadOnly || state.boardId !== boardId || isHydrationReplay) return;
      const changed = state.blocks !== previous.blocks
        || state.connectors !== previous.connectors
        || state.blockOrder !== previous.blockOrder
        || state.title !== previous.title
        || BOARD_METADATA_KEYS.some((key) => state[key] !== previous[key]);
      const dragEnded = previous.isDraggingBlock && !state.isDraggingBlock;
      if (!changed && !dragEnded) return;
      const previousBoard = { ...boardMetadata(previous), title: previous.title, blocks: previous.blocks, blockOrder: previous.blockOrder, connectors: previous.connectors };
      const nextBoard = { ...boardMetadata(state), title: state.title, blocks: state.blocks, blockOrder: state.blockOrder, connectors: state.connectors };
      if (dragEnded) {
        if (pendingPublishRef.current) pendingPublishRef.current.next = nextBoard;
        flushPendingPublish();
      } else if (state.isDraggingBlock) queuePublish(previousBoard, nextBoard);
      else queueBurstPublish(previousBoard, nextBoard);
    });
    return () => {
      unsubscribe();
      if (publishTimerRef.current !== null) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
      pendingPublishRef.current = null;
    };
  }, [boardId, remoteBoardId, flushPendingPublish, handleRef]);

  return flush;
}
