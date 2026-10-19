import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { duplicateWorkspaceSubtree } from './workspaceDuplicateSubtree';

/** Uses the workspace duplication path and carries separately-owned cell attachments with the table. */
export function cloneWorkspaceTableForDocument(tableId: string, docId: string): { tableId: string; createdIds: string[] } | null {
  const state = useWorkspaceStore.getState();
  const source = state.blocks[tableId];
  if (state.isReadOnly || source?.type !== 'table' || state.blocks[docId]?.type !== 'doc') return null;
  const createdIds = duplicateWorkspaceSubtree(tableId, { select: false, asNewMap: true, offsetX: 0, offsetY: 0 });
  const newId = createdIds[0];
  if (!newId) return null;
  useWorkspaceStore.getState().updateBlock(newId, { embeddedInDocId: docId });
  return { tableId: newId, createdIds };
}
