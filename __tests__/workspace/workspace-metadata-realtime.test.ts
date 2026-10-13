// @vitest-environment node
import { createRequire } from "node:module";
import * as Y from "yjs";
import { expect, it } from "vitest";
import { applyBoardDiffToDoc, deriveBoardFromDoc, seedDocFromBoard, type PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { BOARD_METADATA_KEYS } from "@/lib/workspace/boardMetadata";
const require = createRequire(import.meta.url);
const server = require("../../docker/mindmap-ws/src/workspace-doc.js");
const { applyWorkspaceAgentPatch } = require("../../docker/mindmap-ws/src/workspace-room-refresh.js");
const serverKeys = require("../../docker/mindmap-ws/src/workspace-metadata.js").BOARD_METADATA_KEYS;
const frame = { id: "f", name: "Overview", camera: { x: 0, y: 0, zoom: 1 }, order: 0 };
const board = (): PlainBoard => ({ title: "Board", blocks: { a: { id: "a" }, b: { id: "b" } }, blockOrder: ["a", "b"], connectors: {}, frames: [], treeLayoutFamily: "hierarchy" });
it("browser and realtime server agree on shared metadata and round-trip frames", () => {
  expect(serverKeys).toEqual([...BOARD_METADATA_KEYS]);
  const doc = new Y.Doc(), initial = board();
  seedDocFromBoard(doc, initial);
  const next = { ...initial, frames: [frame], treeLayoutFamily: "timeline" };
  expect(applyBoardDiffToDoc(doc, initial, next)).toBe(true);
  expect(deriveBoardFromDoc(doc)).toMatchObject({ frames: [frame], treeLayoutFamily: "timeline" });
  expect(server.deriveBoardFromDoc(doc)).toMatchObject({ frames: [frame], treeLayoutFamily: "timeline" });
  expect(applyBoardDiffToDoc(doc, next, next)).toBe(false);
});
it("an AI metadata and reorder patch reaches a live room, without overwriting newer room decisions", () => {
  const doc = new Y.Doc(), initial = board(); server.seedDocFromBoard(doc, { ...initial, revision: 1 });
  const docs = new Map([["workspace/test", doc]]);
  const patch = { upsertBlocks: {}, removeBlockIds: [], upsertConnectors: {}, removeConnectorIds: [], blockOrder: ["b", "a"], previousBlockOrder: initial.blockOrder, metadata: { frames: [frame] }, previousMetadata: { frames: [] } };
  expect(applyWorkspaceAgentPatch(docs, "test", patch, 2).applied).toBe(true);
  expect(deriveBoardFromDoc(doc)).toMatchObject({ blockOrder: ["b", "a"], frames: [frame], revision: 2 });
  doc.getMap("meta").set("frames", [{ ...frame, name: "Newer manual edit" }]);
  applyWorkspaceAgentPatch(docs, "test", { ...patch, metadata: { frames: [] }, previousMetadata: { frames: [frame] } }, 3);
  expect(deriveBoardFromDoc(doc).frames).toEqual([{ ...frame, name: "Newer manual edit" }]);
});
it("a stale flush recovery preserves metadata edited after the failed write", () => {
  const doc = new Y.Doc(), attempted = { ...board(), frames: [frame] }; server.seedDocFromBoard(doc, attempted);
  doc.getMap("meta").set("frames", [{ ...frame, name: "Newer decision" }]);
  server.mergeBoardIntoDoc(doc, { ...attempted, frames: [] }, attempted);
  expect(server.deriveBoardFromDoc(doc).frames).toEqual([{ ...frame, name: "Newer decision" }]);
});
