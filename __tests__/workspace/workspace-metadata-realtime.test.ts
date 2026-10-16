// @vitest-environment node
import * as Y from "yjs";
import { expect, it } from "vitest";
import { applyBoardDiffToDoc, deriveBoardFromDoc, seedDocFromBoard, type PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { BOARD_METADATA_KEYS } from "@/lib/workspace/boardMetadata";

const frame = { id: "f", name: "Overview", camera: { x: 0, y: 0, zoom: 1 }, order: 0 };
const board = (): PlainBoard => ({
  title: "Board",
  blocks: { a: { id: "a" }, b: { id: "b" } },
  blockOrder: ["a", "b"], connectors: {}, frames: [], treeLayoutFamily: "hierarchy",
});

it("Yjs metadata contract includes frames and keeps a consistent round-trip", () => {
  expect(BOARD_METADATA_KEYS).toContain("frames");
  expect(BOARD_METADATA_KEYS).toContain("treeLayoutFamily");
  const doc = new Y.Doc();
  const initial = board();
  seedDocFromBoard(doc, initial);
  const next = { ...initial, frames: [frame], treeLayoutFamily: "timeline" };
  expect(applyBoardDiffToDoc(doc, initial, next)).toBe(true);
  expect(deriveBoardFromDoc(doc)).toMatchObject({ frames: [frame], treeLayoutFamily: "timeline" });
  expect(applyBoardDiffToDoc(doc, next, next)).toBe(false);
  doc.destroy();
});

it("preserves a newer remote metadata decision when a local edit touches only blocks", () => {
  const doc = new Y.Doc();
  const initial = { ...board(), frames: [frame] };
  seedDocFromBoard(doc, initial);
  doc.getMap("meta").set("frames", [{ ...frame, name: "Remote decision" }]);
  const local = { ...initial, blocks: { ...initial.blocks, c: { id: "c" } }, blockOrder: [...initial.blockOrder, "c"] };
  expect(applyBoardDiffToDoc(doc, initial, local)).toBe(true);
  expect(deriveBoardFromDoc(doc)).toMatchObject({
    frames: [{ ...frame, name: "Remote decision" }],
    blockOrder: ["a", "b", "c"],
  });
  doc.destroy();
});

it("does not drop a valid block when concurrent ordering metadata omits its ID", () => {
  const doc = new Y.Doc();
  seedDocFromBoard(doc, board());
  doc.getMap("blocks").set("c", { id: "c" });
  expect(deriveBoardFromDoc(doc).blockOrder).toEqual(["a", "b", "c"]);
  doc.destroy();
});
