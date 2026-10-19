import * as Y from "yjs";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { documentSchemaExtensions } from "./document-schema";
import { DOCUMENT_PROTOCOL_VERSION, documentFragments, type DocumentCodec } from "./ydoc-documents";
import { applyBoardDiffToDoc, deriveBoardFromDoc, seedDocFromBoard, workspaceDocMaps, type PlainBoard } from "./ydoc-shapes";

export const serverDocumentCodec: DocumentCodec = {
  parse: (html) => generateJSON(html, documentSchemaExtensions),
  render: (json) => generateHTML(json, documentSchemaExtensions),
};
export type StoredDocumentBoard = PlainBoard & { documentState?: string | null; camera?: unknown };
const emptyBoard: PlainBoard = { title: "", blocks: {}, connectors: {}, blockOrder: [] };

/** CRDT checkpoints preserve operation IDs; public GET responses expose the HTML projection. */
export function createDocumentRoom(board: StoredDocumentBoard): Y.Doc {
  const doc = new Y.Doc();
  documentFragments(doc);
  if (board.documentState) {
    Y.applyUpdate(doc, Buffer.from(board.documentState, "base64"), "restore");
    // A REST/AI/version write can be newer than the last CRDT checkpoint.
    applyBoardDiffToDoc(doc, deriveBoardFromDoc(doc, serverDocumentCodec), board, "repository", serverDocumentCodec);
  } else {
    seedDocFromBoard(doc, emptyBoard);
    applyBoardDiffToDoc(doc, emptyBoard, board, "seed", serverDocumentCodec);
  }
  const { meta } = workspaceDocMaps(doc);
  doc.transact(() => {
    meta.set("docProtocolVersion", DOCUMENT_PROTOCOL_VERSION);
    meta.set("boardRevision", board.revision ?? 0);
    meta.set("camera", board.camera ?? {});
  }, "seed");
  return doc;
}

export function snapshotDocumentRoom(doc: Y.Doc): StoredDocumentBoard & { documentState: string } {
  return { ...deriveBoardFromDoc(doc, serverDocumentCodec), camera: workspaceDocMaps(doc).meta.get("camera") ?? {},
    documentState: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64") };
}

/** Apply repository changes against their common CRDT ancestor before merging into live edits. */
export function rebaseDocumentRoom(doc: Y.Doc, persistedState: Uint8Array, base: PlainBoard, latest: StoredDocumentBoard): Uint8Array {
  const fork = new Y.Doc();
  try {
    Y.applyUpdate(fork, persistedState, "restore");
    const vector = Y.encodeStateVector(fork);
    let previous = base;
    if (latest.documentState) {
      // REST can checkpoint offline Yjs edits before that same client reconnects.
      // Merge their original struct IDs first; replaying HTML as fresh inserts
      // would otherwise duplicate the edit when the client sends its update.
      Y.applyUpdate(fork, Buffer.from(latest.documentState, "base64"), "restore");
      previous = deriveBoardFromDoc(fork, serverDocumentCodec);
    }
    applyBoardDiffToDoc(fork, previous, latest, "repository", serverDocumentCodec);
    const state = Y.encodeStateAsUpdate(fork);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(fork, vector), "repository");
    doc.transact(() => {
      workspaceDocMaps(doc).meta.set("boardRevision", latest.revision ?? 0);
      if (latest.camera !== undefined) workspaceDocMaps(doc).meta.set("camera", latest.camera);
    }, "repository");
    return state;
  } finally { fork.destroy(); }
}
