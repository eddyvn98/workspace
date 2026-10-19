import * as Y from "yjs";
import { deriveBoardFromDoc, workspaceDocMaps, type PlainBoard } from "./ydoc-shapes";
import type { DocumentCodec } from "./ydoc-documents";

export function createWorkspaceBoardProjection(
  doc: Y.Doc, onBoard: (board: PlainBoard) => void, onRevision?: (revision: number) => void, codec?: DocumentCodec,
) {
  const { meta } = workspaceDocMaps(doc);
  return (events: unknown[] = [], transaction?: Y.Transaction) => {
    if (transaction?.origin === "local") return;
    const receiptOnly = events.length > 0 && events.every((event) =>
      event instanceof Y.YMapEvent && event.target === meta && event.keysChanged.size > 0
        && [...event.keysChanged].every(key => key === "boardRevision" || key === "docPersistedVector"),
    );
    const revision = meta.get("boardRevision");
    if (receiptOnly && onRevision && Number.isInteger(revision)) {
      onRevision(Number(revision));
      return;
    }
    onBoard(deriveBoardFromDoc(doc, codec));
  };
}
