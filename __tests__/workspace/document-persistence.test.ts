// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { validateDocumentCheckpoint } from "@/lib/workspace/document-checkpoint";
import { createDocumentRoom, serverDocumentCodec, snapshotDocumentRoom } from "@/lib/workspace/document-room";
import { setDocumentSession } from "@/lib/workspace/document-session";
import { documentFragments } from "@/lib/workspace/ydoc-documents";
import { deriveBoardFromDoc, workspaceDocMaps, type PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { createPersistenceAwaiter } from "@/lib/workspace/ydoc-persistence";
import { workspaceDocumentCheckpoint } from "@/app/workspace/utils/workspaceDocumentCheckpoint";

const docs: Y.Doc[] = [], awaiters: ReturnType<typeof createPersistenceAwaiter>[] = [];
afterEach(() => {
  setDocumentSession("board", null);
  awaiters.splice(0).forEach((awaiter) => awaiter.destroy());
  docs.splice(0).forEach((doc) => doc.destroy()); vi.useRealTimers();
});
function board(html = '<p data-line-id="line">Original text</p>'): PlainBoard {
  return { title: "Document", revision: 1, blockOrder: ["doc"], connectors: {},
    blocks: { doc: { id: "doc", type: "doc", data: { html } } } };
}
function room(value = board()): Y.Doc { const doc = createDocumentRoom(value); docs.push(doc); return doc; }
function text(doc: Y.Doc): Y.XmlText {
  return (documentFragments(doc).get("doc")!.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}
function encodedVector(doc: Y.Doc) { return Buffer.from(Y.encodeStateVector(doc)).toString("base64"); }
function acknowledge(doc: Y.Doc, vector: string, revision = 2) {
  const { meta } = workspaceDocMaps(doc);
  doc.transact(() => { meta.set("boardRevision", revision); meta.set("docPersistedVector", vector); }, "server");
}
function awaiterFor(doc: Y.Doc) {
  const awaiter = createPersistenceAwaiter(workspaceDocMaps(doc).meta, doc); awaiters.push(awaiter); return awaiter;
}

describe("document checkpoints", () => {
  it("accepts the matching HTML projection, including browser-produced image and table attributes", () => {
    const value = board('<h2 data-line-id="h" style="text-align:center">Heading</h2><p><span style="color:#112233;font-size:24px">Styled</span></p>'
      + '<img src="/preview.webp" data-download-url="/original.png" data-caption="Caption" alt="Diagram" data-width="55%" data-align="right">'
      + '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>');
    const doc = room(value); setDocumentSession("board", doc);
    const checkpoint = workspaceDocumentCheckpoint("board", value);
    expect(checkpoint).toBeTypeOf("string");
    expect(validateDocumentCheckpoint(checkpoint, value.blocks)).toBe(true);
  });

  it("rejects mismatched text, missing document fragments and incompatible protocol", () => {
    const doc = room(), checkpoint = snapshotDocumentRoom(doc).documentState;
    expect(validateDocumentCheckpoint(checkpoint, board("<p>Different</p>").blocks)).toBe(false);
    const absent = { ...board().blocks, missing: { type: "doc", data: { html: "<p>Missing</p>" } } };
    expect(validateDocumentCheckpoint(checkpoint, absent)).toBe(false);
    workspaceDocMaps(doc).meta.set("docProtocolVersion", 999);
    expect(validateDocumentCheckpoint(snapshotDocumentRoom(doc).documentState, board().blocks)).toBe(false);
  });

  it("rejects malformed checkpoints and invalid block containers without throwing", () => {
    for (const checkpoint of [undefined, null, 5, "", "%%%", "AA==", "eA==", "A".repeat(32 * 1024 * 1024 + 1)]) {
      expect(validateDocumentCheckpoint(checkpoint, board().blocks)).toBe(false);
    }
    const checkpoint = snapshotDocumentRoom(room()).documentState;
    for (const blocks of [null, [], "blocks", 4]) expect(validateDocumentCheckpoint(checkpoint, blocks)).toBe(false);
  });

  it("does not checkpoint an unrelated board or a tab with no active session", () => {
    expect(workspaceDocumentCheckpoint("board", board())).toBeUndefined();
    const doc = room(); setDocumentSession("board", doc);
    const before = Y.encodeStateAsUpdate(doc);
    expect(workspaceDocumentCheckpoint("another-board", board("<p>Unrelated</p>"))).toBeUndefined();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it("preserves offline client IDs across REST save, room reopen and replay of the same update", () => {
    const initial = room(), offline = new Y.Doc(); docs.push(offline);
    documentFragments(offline); Y.applyUpdate(offline, Y.encodeStateAsUpdate(initial));
    setDocumentSession("board", offline);
    text(offline).insert(0, "Offline ");
    const value = deriveBoardFromDoc(offline, serverDocumentCodec);
    const checkpoint = workspaceDocumentCheckpoint("board", value)!;
    expect(validateDocumentCheckpoint(checkpoint, value.blocks)).toBe(true);
    const reopened = createDocumentRoom({ ...value, revision: 2, documentState: checkpoint }); docs.push(reopened);
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(offline), "reconnect");
    const actual = deriveBoardFromDoc(reopened, serverDocumentCodec).blocks.doc as { data: { html: string } };
    expect(actual.data.html).toBe('<p data-line-id="line">Offline Original text</p>');
    expect((Y.decodeStateVector(Y.encodeStateVector(reopened)).get(offline.clientID) ?? 0))
      .toBeGreaterThanOrEqual(Y.decodeStateVector(Y.encodeStateVector(offline)).get(offline.clientID)!);
  });

  it("brings pending ordinary document changes into the checkpoint before encoding", () => {
    const doc = room(); setDocumentSession("board", doc);
    const next = board('<p data-line-id="line">Pending paste</p>');
    const checkpoint = workspaceDocumentCheckpoint("board", next)!;
    expect(validateDocumentCheckpoint(checkpoint, next.blocks)).toBe(true);
    expect(text(doc).toString()).toBe("Pending paste");
  });
});

describe("protocol-v1 persistence acknowledgments", () => {
  it("accepts an exact captured vector immediately, even before the legacy two-second delay", async () => {
    vi.useFakeTimers();
    const doc = room(), awaiter = awaiterFor(doc);
    text(doc).insert(0, "Saved "); awaiter.markPending();
    const captured = encodedVector(doc), pending = awaiter.awaitPersisted(100);
    await vi.advanceTimersByTimeAsync(1);
    acknowledge(doc, captured);
    await expect(pending).resolves.toBe(true);
    await expect(awaiter.awaitPersisted()).resolves.toBe(true);
  });

  it("does not let a stale vector or a newer revision acknowledge a later insertion", async () => {
    vi.useFakeTimers();
    const doc = room(), awaiter = awaiterFor(doc);
    text(doc).insert(0, "First "); awaiter.markPending(); const oldVector = encodedVector(doc);
    text(doc).insert(0, "Second "); awaiter.markPending();
    await vi.advanceTimersByTimeAsync(2100);
    acknowledge(doc, oldVector, 100);
    const pending = awaiter.awaitPersisted(10); await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe(false);
    acknowledge(doc, encodedVector(doc), 101);
    await expect(awaiter.awaitPersisted()).resolves.toBe(true);
  });

  it("advances a client marker for a pure deletion so the pre-deletion vector cannot acknowledge it", async () => {
    vi.useFakeTimers();
    const doc = room(), awaiter = awaiterFor(doc);
    const beforeDelete = encodedVector(doc);
    text(doc).delete(0, 9);
    // Deletions alone do not advance a Yjs state vector. markPending must
    // add a durable per-client marker before remembering the required vector.
    expect(encodedVector(doc)).toBe(beforeDelete);
    awaiter.markPending();
    const afterDelete = encodedVector(doc);
    expect(afterDelete).not.toBe(beforeDelete);
    expect(doc.getMap("documentEdits").size).toBeGreaterThan(0);
    acknowledge(doc, beforeDelete, 200);
    const pending = awaiter.awaitPersisted(10); await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe(false);
    acknowledge(doc, afterDelete, 201);
    await expect(awaiter.awaitPersisted()).resolves.toBe(true);
  });

  it("does not acknowledge malformed vectors or boardRevision-only receipts", async () => {
    vi.useFakeTimers();
    const doc = room(), awaiter = awaiterFor(doc), { meta } = workspaceDocMaps(doc);
    text(doc).insert(0, "Pending "); awaiter.markPending();
    await vi.advanceTimersByTimeAsync(2100);
    meta.set("boardRevision", 500);
    for (const value of ["broken base64!", "AA==", 7]) meta.set("docPersistedVector", value);
    const pending = awaiter.awaitPersisted(10); await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe(false);
  });

  it("resets an earlier confirmation when another edit or deletion follows it", async () => {
    vi.useFakeTimers();
    const doc = room(), awaiter = awaiterFor(doc);
    text(doc).insert(0, "One "); awaiter.markPending(); const firstSaved = encodedVector(doc);
    acknowledge(doc, firstSaved);
    await expect(awaiter.awaitPersisted()).resolves.toBe(true);
    text(doc).delete(0, 4); awaiter.markPending();
    acknowledge(doc, firstSaved, 3);
    const pending = awaiter.awaitPersisted(10); await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe(false);
  });
});
