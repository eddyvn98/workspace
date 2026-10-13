import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { findMapRootId } from "../layout/mapRoot";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";

/**
 * Collapse or expand a block's child branch, then re-run the map's layout.
 *
 * The reflow is the point. Collapsing changes how much room the subtree
 * needs, so without it the siblings keep their old slots: collapsing left a
 * branch-sized hole behind and expanding never pushed anything out of the
 * way. Every other structural mutation in this engine (quick-add, sibling
 * reorder, reparent, outline drag, auto-arrange) already reflows; collapse
 * was the one that only wrote the flag. Legacy has no equivalent call site
 * because it recomputes the whole layout on every render.
 *
 * The layout calculators already skip collapsed subtrees when measuring, so
 * reflowing is all that's needed here.
 */
export function toggleBlockCollapse(blockId: string): void {
  const state = useWorkspaceStore.getState();
  const block = state.blocks[blockId];
  if (!block) return;

  state.updateBlock(blockId, { isCollapsed: !block.isCollapsed });

  const rootId = findMapRootId(useWorkspaceStore.getState().blocks, blockId);
  if (rootId) reflowWorkspaceTree(rootId);
}
