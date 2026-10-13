import type { BlockId } from "../../types/block";

export function buildSpreadsheetEditorUrl(tableId: BlockId, boardId: string, search: string): string {
  const params = new URLSearchParams({ tableId });
  if (boardId) params.set("boardId", boardId);
  const runtimeOverride = new URLSearchParams(search).get("agentRuntime");
  if (runtimeOverride === "1" || runtimeOverride === "0") params.set("agentRuntime", runtimeOverride);
  return `/workspace/table-editor?${params.toString()}`;
}

export function requestSpreadsheetEditor(tableId: BlockId, boardId: string): void {
  const editorUrl = buildSpreadsheetEditorUrl(tableId, boardId, window.location.search);
  const editorWindow = window.open(editorUrl, "_blank", "noopener,noreferrer");
  if (!editorWindow) window.location.assign(editorUrl);
}
