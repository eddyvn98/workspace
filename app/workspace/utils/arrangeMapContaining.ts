import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { findMapRootId } from "../layout/mapRoot";
import { arrangeWorkspaceMap } from "../layout/reflowWorkspaceTree";

/**
 * "Auto arrange" — tidy the whole map this block belongs to.
 *
 * Two reasons this exists. Legacy has it as a node action (its
 * NodeContextMenu's "Auto arrange", plus the more-actions menu) and this
 * engine had no equivalent at all. And it is now the ONLY thing that
 * repositions a free-form family: a flowchart leaves the user's placement
 * alone until they ask for this (see familyAutoArranges).
 */
export function arrangeMapContaining(blockId: string): void {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return;
  const rootId = findMapRootId(state.blocks, blockId);
  if (rootId) arrangeWorkspaceMap(rootId);
}
