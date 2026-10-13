import { useEffect, useMemo, useState } from "react";
import { workspacePerfLog } from "../utils/workspacePerfDebug";

// Four BlockFrames is small enough to yield a paint even on a board whose
// frames contain tables, rich text, or attachment controls. The following
// batches continue one frame at a time, so the total board still appears
// quickly without one long mount blocking Chrome's main thread.
const DEFAULT_BATCH_SIZE = 4;

/**
 * Reveals a board's already-hydrated block order in small visual batches.
 * The store still owns the complete snapshot, so autosave and realtime never
 * see a partial board just because the canvas is still painting it.
 */
export function useProgressiveBlockOrder(
  blockOrder: string[],
  boardId: string | null,
  contentBoardId: string,
  batchSize = DEFAULT_BATCH_SIZE,
) {
  const targetBoardId = boardId ?? "";
  const [renderState, setRenderState] = useState({ boardId: "", count: 0 });
  const hasTargetContent = contentBoardId === targetBoardId;

  // Hide the previous board on the first render after a switch. The effect
  // starts painting the new board on the next animation frame.
  const visibleCount = hasTargetContent && renderState.boardId === targetBoardId
    ? Math.min(renderState.count, blockOrder.length)
    : 0;
  const visibleBlockOrder = useMemo(
    () => blockOrder.slice(0, visibleCount),
    [blockOrder, visibleCount],
  );
  const visibleBlockIds = useMemo(() => new Set(visibleBlockOrder), [visibleBlockOrder]);

  useEffect(() => {
    let cancelled = false;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let count = 0;
    const safeBatchSize = Math.max(1, Math.floor(batchSize));

    setRenderState({ boardId: targetBoardId, count: 0 });
    if (!hasTargetContent) return () => undefined;

    const schedule = (callback: () => void) => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        frame = window.requestAnimationFrame(callback);
      } else {
        timer = setTimeout(callback, 16);
      }
    };

    const revealNextBatch = () => {
      if (cancelled) return;
      count = Math.min(count + safeBatchSize, blockOrder.length);
      workspacePerfLog("progressive-batch", {
        boardId: targetBoardId,
        visibleCount: count,
        totalCount: blockOrder.length,
        batchSize: safeBatchSize,
      });
      setRenderState({ boardId: targetBoardId, count });
      if (count < blockOrder.length) schedule(revealNextBatch);
    };

    schedule(revealNextBatch);
    return () => {
      cancelled = true;
      if (frame !== null && typeof window !== "undefined") window.cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [batchSize, blockOrder.length, contentBoardId, hasTargetContent, targetBoardId]);

  return {
    visibleBlockOrder,
    visibleBlockIds,
    isComplete: visibleCount >= blockOrder.length,
  };
}
