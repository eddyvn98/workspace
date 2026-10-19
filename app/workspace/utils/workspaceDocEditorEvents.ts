import type { BlockId } from "../types/block";

/** Canonical Office URL, shared by native links to the full document editor. */
export function workspaceDocEditorUrl(docId: BlockId, boardId: string): string {
  const params = new URLSearchParams({ blockId: docId });
  if (boardId) params.set("boardId", boardId);
  return `/office/document?${params.toString()}`;
}
