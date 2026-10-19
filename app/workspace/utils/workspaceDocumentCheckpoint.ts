import * as Y from "yjs";
import { getDocumentSession } from "@/lib/workspace/document-session";
import { applyBoardDiffToDoc, deriveBoardFromDoc, type PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { browserDocumentCodec } from "@/lib/workspace/document-codec-browser";

/** REST covers a disconnected socket. Preserve Yjs IDs so reconnect cannot insert the same offline text twice. */
export function workspaceDocumentCheckpoint(boardId: string, board: PlainBoard): string | undefined {
  const session = getDocumentSession();
  if (!session || session.boardId !== boardId) return undefined;
  applyBoardDiffToDoc(session.doc, deriveBoardFromDoc(session.doc, browserDocumentCodec), board, "local", browserDocumentCodec);
  const bytes = Y.encodeStateAsUpdate(session.doc);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join(""));
}
