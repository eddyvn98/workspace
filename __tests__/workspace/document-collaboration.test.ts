import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import { createDocumentRoom, rebaseDocumentRoom, serverDocumentCodec, snapshotDocumentRoom, type StoredDocumentBoard } from "@/lib/workspace/document-room";
import { documentFragments } from "@/lib/workspace/ydoc-documents";
import { applyBoardDiffToDoc, deriveBoardFromDoc, workspaceDocMaps, type PlainBoard } from "@/lib/workspace/ydoc-shapes";

const docs: Y.Doc[] = [];
afterEach(() => { docs.forEach((doc) => doc.destroy()); docs.length = 0; });
function board(html: string, revision = 1): PlainBoard {
  return { title: "Document", revision, blockOrder: ["doc"], connectors: {},
    blocks: { doc: { id: "doc", type: "doc", data: { html } } } };
}
function room(value: StoredDocumentBoard): Y.Doc {
  const doc = createDocumentRoom(value); docs.push(doc); return doc;
}
function clone(source: Y.Doc): Y.Doc {
  const doc = new Y.Doc(); docs.push(doc); documentFragments(doc);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(source)); return doc;
}
function html(doc: Y.Doc): string {
  return (deriveBoardFromDoc(doc, serverDocumentCodec).blocks.doc as { data: { html: string } }).data.html;
}
function firstText(doc: Y.Doc): Y.XmlText {
  return (documentFragments(doc).get("doc")!.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}
function editHtml(doc: Y.Doc, nextHtml: string): void {
  const before = deriveBoardFromDoc(doc, serverDocumentCodec);
  applyBoardDiffToDoc(doc, before, { ...before, blocks: board(nextHtml).blocks }, "editor", serverDocumentCodec);
}
function sync(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left), rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, "remote"); Y.applyUpdate(right, leftUpdate, "remote");
}
function findNode(root: JSONContent, type: string): JSONContent | undefined {
  if (root.type === type) return root;
  for (const child of root.content ?? []) { const found = findNode(child, type); if (found) return found; }
  return undefined;
}

describe("document CRDT persistence and repository rebasing", () => {
  it("merges two clients' concurrent edits inside the same paragraph without losing either", () => {
    const seed = room(board('<p data-line-id="line">Original text</p>'));
    const left = clone(seed), right = clone(seed);
    firstText(left).insert(0, "Typed ");
    firstText(right).insert(firstText(right).length, " appended");
    sync(left, right);
    expect(html(left)).toBe('<p data-line-id="line">Typed Original text appended</p>');
    expect(html(right)).toBe(html(left));
    expect((html(left).match(/Original/g) ?? []).length).toBe(1);
  });

  it("merges concurrently prepended and appended paragraphs around their common ancestor", () => {
    const seed = room(board('<p data-line-id="middle">Middle</p>'));
    const left = clone(seed), right = clone(seed);
    editHtml(left, '<p data-line-id="before">Before</p><p data-line-id="middle">Middle</p>');
    editHtml(right, '<p data-line-id="middle">Middle</p><p data-line-id="after">After</p>');
    sync(left, right);
    expect(html(left)).toBe('<p data-line-id="before">Before</p><p data-line-id="middle">Middle</p><p data-line-id="after">After</p>');
    expect(html(right)).toBe(html(left));
  });

  it("reopens a persisted checkpoint and accepts an existing client's next update once", () => {
    const original = room(board('<p data-line-id="line">Original</p>'));
    const client = clone(original);
    firstText(client).insert(0, "Before ");
    Y.applyUpdate(original, Y.encodeStateAsUpdate(client));
    const checkpoint = snapshotDocumentRoom(original);
    const reopened = room({ ...checkpoint, revision: 2 });
    firstText(client).insert(firstText(client).length, " after");
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(client));
    expect(html(reopened)).toBe('<p data-line-id="line">Before Original after</p>');
    expect(workspaceDocMaps(reopened).meta.get("boardRevision")).toBe(2);
  });

  it.each([false, true])("merges an external AI revision against its persisted ancestor (checkpoint: %s)", (withCheckpoint) => {
    const base = board('<p data-line-id="line">Original text</p>');
    const live = room(base), persisted = Y.encodeStateAsUpdate(live);
    const checkpoint = snapshotDocumentRoom(live).documentState;
    firstText(live).insert(0, "Typed ");
    const latest: StoredDocumentBoard = { ...board('<p data-line-id="line">Original revised</p>', 2),
      ...(withCheckpoint ? { documentState: checkpoint } : {}), camera: { x: 12, y: 8, zoom: 1 } };
    const origins: unknown[] = [];
    live.on("update", (_update, origin) => origins.push(origin));
    const rebased = rebaseDocumentRoom(live, persisted, base, latest);
    expect(html(live)).toBe('<p data-line-id="line">Typed Original revised</p>');
    expect(workspaceDocMaps(live).meta.get("boardRevision")).toBe(2);
    expect(workspaceDocMaps(live).meta.get("camera")).toEqual(latest.camera);
    expect(origins.every((origin) => origin === "repository")).toBe(true);
    const ancestor = new Y.Doc(); docs.push(ancestor); Y.applyUpdate(ancestor, rebased);
    expect(html(ancestor)).toBe('<p data-line-id="line">Original revised</p>');
  });

  it("retains offline checkpoint struct IDs so reconnecting cannot duplicate a REST-saved edit", () => {
    const base = board('<p data-line-id="line">Original</p>');
    const live = room(base), persisted = Y.encodeStateAsUpdate(live), offline = clone(live);
    firstText(live).insert(firstText(live).length, " online");
    firstText(offline).insert(0, "Offline ");
    const restSaved = { ...snapshotDocumentRoom(offline), revision: 2 };
    rebaseDocumentRoom(live, persisted, base, restSaved);
    expect(html(live)).toBe('<p data-line-id="line">Offline Original online</p>');
    Y.applyUpdate(live, Y.encodeStateAsUpdate(offline), "reconnect");
    expect(html(live)).toBe('<p data-line-id="line">Offline Original online</p>');
    const reopened = room({ ...snapshotDocumentRoom(live), revision: 3 });
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(offline), "reconnect");
    expect(html(reopened)).toBe(html(live));
  });

  it("keeps image originals, styles, tables, tasks and custom atoms through checkpoint serialization", () => {
    const fixture = '<h2 data-line-id="heading" style="text-align:center">Title</h2>'
      + '<p data-line-id="styled"><span style="color:#123456;font-family:Georgia;font-size:24px">Color</span> <mark data-color="#ffff00" style="background-color:#ffff00">Highlight</mark></p>'
      + '<img src="https://cdn.example/preview.webp" data-download-url="https://cdn.example/original.png" data-caption="Diagram caption" alt="Diagram" title="Detail" data-width="55%" data-align="right">'
      + '<table><tbody><tr><th colspan="2" colwidth="120,160"><p data-line-id="cell">Header</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>'
      + '<ul data-type="taskList"><li data-type="taskItem" data-line-id="task" data-checked="true"><p>Done</p></li></ul>'
      + '<div data-workspace-table="true" data-table-id="linked-table"></div>'
      + '<div data-slide-chart="bar" data-series="[{&quot;label&quot;:&quot;Q1&quot;,&quot;value&quot;:42}]"></div>';
    const source = room(board(fixture)), reopened = room(snapshotDocumentRoom(source));
    const json = serverDocumentCodec.parse(html(reopened));
    expect(json).toEqual(serverDocumentCodec.parse(html(source)));
    expect(findNode(json, "heading")?.attrs).toMatchObject({ lineId: "heading", textAlign: "center", level: 2 });
    expect(findNode(json, "image")?.attrs).toMatchObject({ src: "https://cdn.example/preview.webp", downloadUrl: "https://cdn.example/original.png", caption: "Diagram caption", alt: "Diagram", title: "Detail", width: "55%", align: "right" });
    expect(findNode(json, "tableHeader")?.attrs).toMatchObject({ colspan: 2, colwidth: [120, 160] });
    expect(findNode(json, "taskItem")?.attrs).toMatchObject({ checked: true, lineId: "task" });
    expect(findNode(json, "workspaceTable")?.attrs?.tableId).toBe("linked-table");
    expect(findNode(json, "slideChart")?.attrs?.series).toEqual([{ label: "Q1", value: 42 }]);
    expect(JSON.stringify(json)).toContain('"fontFamily":"Georgia"');
    expect(JSON.stringify(json)).toContain('"fontSize":"24px"');
    expect(JSON.stringify(json)).toContain('"type":"highlight"');
    expect(JSON.stringify(json)).toMatch(/123456|18, 52, 86/);
  });

  it("removes a document fragment when its block is deleted or converted", () => {
    const base = board("<p>Content</p>"), doc = room(base);
    const changed = { ...base, blocks: { doc: { id: "doc", type: "text", data: { text: "Replacement" } } } };
    applyBoardDiffToDoc(doc, base, changed, "editor", serverDocumentCodec);
    expect(documentFragments(doc).has("doc")).toBe(false);
    expect(deriveBoardFromDoc(doc, serverDocumentCodec).blocks.doc).toEqual(changed.blocks.doc);
  });
});
