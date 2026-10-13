import type { BlockId } from "../types/block";

/** Opens a doc block's full-screen standalone editor in a new tab — same
 *  "open in new tab" pattern as table/workspaceTableEvents.ts's
 *  requestSpreadsheetEditor, for deep editing without the canvas chrome
 *  around it. */
export function requestDocEditor(docId: BlockId, boardId: string): void {
  const params = new URLSearchParams({ docId });
  if (boardId) params.set("boardId", boardId);
  const editorUrl = `/workspace/doc-editor?${params.toString()}`;
  const editorWindow = window.open(editorUrl, "_blank", "noopener,noreferrer");
  if (!editorWindow) window.location.assign(editorUrl);
}
