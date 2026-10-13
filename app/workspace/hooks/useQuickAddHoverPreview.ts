"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId } from "../types/block";
import { computeQuickAddGhostLayout, type QuickAddGhostMode } from "../layout/quickAddGhostLayout";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import type { QuickAddDirection } from "./useBlockQuickAdd";


export interface QuickAddGhostBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Mirrors legacy's quickAddPreviewStore HOVER_COMMIT_DELAY_MS — a brief
// incidental pass over the "+" zone (e.g. the pointer sweeping past on its
// way elsewhere) shouldn't flash the preview and shove siblings around.
const HOVER_COMMIT_DELAY_MS = 180;

/** Live quick-add hover preview: while the pointer sits on a "+" button,
 *  run the real tree layout with one extra ghost child inserted so existing
 *  siblings visibly make room (legacy's "__quick_add_preview__" sentinel
 *  flowing through the actual layout algorithm), instead of drawing a
 *  fixed-offset ghost box that doesn't reflect where things will actually
 *  land. Ending the hover replays a real (ghost-free) reflow to restore
 *  the map exactly as it was. */
export function useQuickAddHoverPreview() {
  const [ghost, setGhost] = useState<QuickAddGhostBox | null>(null);
  const activeRootRef = useRef<BlockId | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const restoreRealLayout = useCallback(() => {
    const rootId = activeRootRef.current;
    activeRootRef.current = null;
    setGhost(null);
    if (rootId) reflowWorkspaceTree(rootId);
  }, []);

  const startPreview = useCallback((anchorId: BlockId, mode: QuickAddGhostMode, direction?: QuickAddDirection) => {
    clearPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const result = computeQuickAddGhostLayout(anchorId, mode, direction);
      if (!result) return;
      // Free-form layouts (notably Flowchart) return a ghost position but no
      // real-block positions. They must never be sent through the tree
      // reflow on mouseleave: merely hovering a quick-add handle would then
      // rewrite their hand-authored connector anchors/routes.
      activeRootRef.current = result.positions.size > 0 ? result.rootId : null;
      result.positions.forEach((point, id) => {
        useWorkspaceStore.getState().updateBlockTransform(id, point, "computed");
      });
      setGhost(result.ghost);
    }, HOVER_COMMIT_DELAY_MS);
  }, []);

  const endPreview = useCallback(() => {
    clearPending();
    if (activeRootRef.current) restoreRealLayout();
  }, [restoreRealLayout]);

  // The button's own click handler creates the real node and reflows the
  // map itself right after — clear the local preview state without an
  // extra restore-reflow so that isn't wastefully undone a moment later.
  const cancelPreview = useCallback(() => {
    clearPending();
    activeRootRef.current = null;
    setGhost(null);
  }, []);

  // The overlay that owns this hook unmounts as soon as the block is no
  // longer hovered/selected (BlockQuickAddButtons' `isVisible` gate) — that
  // never fires the buttons' own onMouseLeave, so a committed preview would
  // otherwise leave the map's real siblings stuck at their shifted spots.
  useEffect(() => () => {
    if (activeRootRef.current) reflowWorkspaceTree(activeRootRef.current);
    clearPending();
  }, []);

  return { ghost, startPreview, endPreview, cancelPreview };
}
