import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type Transform, type BlockId } from "../types/block";

const ZERO_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** Writes every computed position in one store update instead of one
 *  updateBlockTransform() call per node. A layout switch or a multi-node
 *  AI-generation reflow can touch every node in a tree in a single pass;
 *  calling the store's own per-node action that many times in a row was
 *  measured to block the main thread for ~1-2s on a few-hundred-node board
 *  (each call spreads the entire `blocks` record and synchronously notifies
 *  every subscriber). The values written are identical either way — only
 *  how many store updates it takes to write them changes. */
export function applyComputedLayoutPositions(
  rootId: BlockId,
  positions: Map<BlockId, { x: number; y: number }>,
  laneCells: Map<BlockId, { w: number; h: number }>,
): void {
  useWorkspaceStore.setState((state) => {
    if (state.isReadOnly) return state;
    let changed = false;
    const nextBlocks = { ...state.blocks };
    positions.forEach((point, id) => {
      if (id === rootId) return;
      const existing = state.blocks[id];
      if (!existing) return;
      const cell = laneCells.get(id);
      const patch: Partial<Transform> = {
        x: point.x,
        y: point.y,
        ...(cell ? { w: cell.w, h: cell.h } : {}),
      };
      // Mirrors updateBlockTransform's own base-transform resolution (see its
      // comment in useWorkspaceStore.ts): a block positioned only by
      // `computed` so far must inherit its real w/h/zIndex, not reset to a
      // hardcoded box.
      const base = existing.transform.computed ?? resolveTransform(existing.transform, ZERO_TRANSFORM);
      nextBlocks[id] = {
        ...existing,
        transform: { ...existing.transform, computed: { ...base, ...patch } },
        updatedAt: Date.now(),
        lastEditedBy: state.currentUserEmail ?? existing.lastEditedBy,
      };
      changed = true;
    });
    return changed ? { blocks: nextBlocks } : state;
  });
}
