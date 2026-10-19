import * as Y from "yjs";
import { snapshotDocumentRoom, serverDocumentCodec } from "../../lib/workspace/document-room";
import { documentFragmentHtml, documentFragments } from "../../lib/workspace/ydoc-documents";
import type { WorkspaceWsConfig } from "./config";

/** Validate on a mirror: invalid updates must never reach the live document or its subscribers. */
export class DocumentUpdateGuard {
  private mirror: Y.Doc;
  private upperBound: number;
  private touched = new Set<Y.AbstractType<unknown>>();
  constructor(private doc: Y.Doc, private config: WorkspaceWsConfig) {
    this.mirror = this.copy(); this.upperBound = Y.encodeStateAsUpdate(doc).byteLength;
    doc.on("update", this.reflect);
  }
  private copy(): Y.Doc {
    const mirror = new Y.Doc();
    documentFragments(mirror); mirror.getMap("meta"); mirror.getMap("blocks"); mirror.getMap("connectors"); mirror.getMap("documentEdits");
    Y.applyUpdate(mirror, Y.encodeStateAsUpdate(this.doc));
    mirror.on("afterTransaction", (transaction: Y.Transaction) => {
      for (const type of transaction.changedParentTypes.keys()) this.touched.add(type as Y.AbstractType<unknown>);
    });
    return mirror;
  }
  private reflect = (update: Uint8Array) => { Y.applyUpdate(this.mirror, update); this.upperBound += update.byteLength; };
  check(update: Uint8Array): Uint8Array {
    this.touched.clear();
    try {
      const meta = this.mirror.getMap("meta"), original = this.doc.getMap("meta");
      let normalized = false, accepted = update;
      const capture = (value: Uint8Array) => { accepted = value; };
      this.mirror.on("update", capture);
      try {
        this.mirror.transact(() => {
          Y.applyUpdate(this.mirror, update);
          for (const key of ["boardRevision", "docProtocolVersion", "docPersistedVector"]) {
            if (meta.get(key) === original.get(key) && meta.has(key) === original.has(key)) continue;
            normalized = true;
            if (original.has(key)) meta.set(key, original.get(key)); else meta.delete(key);
          }
        }, "validation");
      } finally { this.mirror.off("update", capture); }
      // A resync carries missing dependencies together. Do not retain opaque
      // pending structs that could change protected metadata in a later server transaction.
      if (this.mirror.store.pendingStructs || this.mirror.store.pendingDs) throw new Error("Incomplete update; reconnect to sync");
      for (const [name, type] of this.mirror.share) {
        if (!["blocks", "connectors", "meta", "documents", "documentEdits"].includes(name) || !(type instanceof Y.Map)) throw new Error("Invalid shared document type");
      }
      const edits = this.mirror.getMap("documentEdits");
      if (this.touched.has(edits as Y.AbstractType<unknown>)) for (const [id, value] of edits) {
        if (!/^\d{1,10}$/.test(id) || !Number.isSafeInteger(value) || Number(value) < 1) throw new Error("Invalid persistence marker");
      }
      const fragments = documentFragments(this.mirror);
      if (this.touched.has(fragments as Y.AbstractType<unknown>)) {
        for (const fragment of fragments.values()) {
          if (!(fragment instanceof Y.XmlFragment)) throw new Error("Invalid document fragment");
          if (this.touched.has(fragment as Y.AbstractType<unknown>)) documentFragmentHtml(fragment, serverDocumentCodec);
        }
      }
      // Small documents avoid serializing a whole checkpoint for each keystroke.
      // The conservative byte budget includes repeated/tombstoned structs.
      if (this.upperBound + update.byteLength > this.config.maxHttpBytes / 4) {
        const snapshot = snapshotDocumentRoom(this.mirror);
        const bytes = Buffer.byteLength(snapshot.documentState, "base64");
        if (bytes > this.config.maxCheckpointBytes || Buffer.byteLength(JSON.stringify(snapshot)) > this.config.maxHttpBytes - 4096) {
          throw new Error("This document has reached the collaboration size limit");
        }
        this.upperBound = bytes;
      }
      return normalized ? accepted : update;
    } catch (error) {
      this.mirror.destroy(); this.mirror = this.copy();
      this.upperBound = Y.encodeStateAsUpdate(this.doc).byteLength;
      throw error;
    }
  }
  destroy(): void { this.doc.off("update", this.reflect); this.mirror.destroy(); }
}
