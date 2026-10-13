// @vitest-environment jsdom
import React, { act } from "react";
import * as Y from "yjs";
import { createWorkspaceBoardProjection } from "@/lib/workspace/ydoc-projection";
import { seedDocFromBoard, workspaceDocMaps } from "@/lib/workspace/ydoc-shapes";
import { skipNextWorkspaceHistorySnapshot } from "@/app/workspace/utils/workspaceHistoryBridge";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceHistory, type WorkspaceHistoryApi } from "@/app/workspace/hooks/useWorkspaceHistory";
import { useClipboard, type UseClipboardResult } from "@/app/workspace/hooks/useClipboard";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { applyInverse } from "@/app/api/workspaces/[id]/agent/history";
import { duplicateSubtree, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operationsCore";
import { createDualTransform, type CanvasBlock } from "@/app/workspace/types/block";

const frame = { id: "frame", name: "Overview", order: 0, camera: { x: 0, y: 0, zoom: 1 } };
function block(id: string, members?: string[]): CanvasBlock {
  return { id, type: "shape", data: { shape: "rectangle", label: id, ...(members ? { frameBlockIds: members } : {}) }, transform: createDualTransform({ x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0 }), createdAt: 1, updatedAt: 1 } as CanvasBlock;
}
const board = (): AgentBoardState => ({ title: "Board", blocks: { a: block("a") as unknown as Record<string, unknown>, b: block("b") as unknown as Record<string, unknown> }, blockOrder: ["a", "b"], connectors: {}, frames: [] });
afterEach(() => vi.useRealTimers());

it("AI undo includes frames and ordering while preserving later collaborator edits", () => {
  const before = board();
  const after = structuredClone(before); after.frames = [frame]; after.blockOrder = ["b", "a"];
  expect(applyInverse(after, after, before)).toMatchObject({ frames: [], blockOrder: ["a", "b"] });
  const current = structuredClone(after); current.blocks.a.data = { label: "Collaborator" };
  const inverse = applyInverse(current, after, before);
  expect(inverse.blocks).toMatchObject({ a: { data: { label: "Collaborator" } } });
  expect(inverse.frames).toEqual([]);
});
it("AI duplication follows frame members, remaps references and offsets connector routing", () => {
  const state = board(); state.blocks.container = block("container", ["a", "b"]) as unknown as Record<string, unknown>;
  state.blockOrder.push("container"); state.connectors.edge = { id: "edge", fromBlockId: "a", toBlockId: "b", waypoints: [{ x: 10, y: 20 }] };
  const ids = duplicateSubtree(state, "container", 24, 24);
  expect(ids).toHaveLength(3);
  const copied = state.blocks[ids[0]];
  expect(copied.data).toMatchObject({ frameBlockIds: ids.slice(1) });
  expect(Object.values(state.connectors).find((c) => c.id !== "edge")?.waypoints).toEqual([{ x: 34, y: 44 }]);
});

function mount() {
  let history!: WorkspaceHistoryApi, clipboard!: UseClipboardResult;
  function Host() { history = useWorkspaceHistory(); clipboard = useClipboard(); return null; }
  const div = document.createElement("div"); document.body.append(div); const root = createRoot(div);
  act(() => root.render(<Host />));
  return { history: () => history, clipboard: () => clipboard, close: () => { act(() => root.unmount()); div.remove(); } };
}
function reset() {
  useWorkspaceStore.setState({ blocks: {}, blockOrder: [], connectors: {}, frames: [], selectedBlockIds: [], isReadOnly: false, treeLayoutDirection: "right" });
}
it("server save receipts preserve pending undo and redo while real remote edits reset history", () => {
  vi.useFakeTimers(); reset(); const host = mount(); const doc = new Y.Doc();
  seedDocFromBoard(doc, { title: "Board", blocks: {}, blockOrder: [], connectors: {}, frames: [] });
  const onRevision = vi.fn();
  const project = createWorkspaceBoardProjection(doc, (next) => {
    skipNextWorkspaceHistorySnapshot();
    useWorkspaceStore.setState({ blocks: next.blocks as never, blockOrder: next.blockOrder, connectors: next.connectors as never, frames: next.frames as never });
  }, onRevision);
  const { meta } = workspaceDocMaps(doc); meta.observeDeep(project);
  try {
    act(() => useWorkspaceStore.setState({ frames: [frame] }));
    act(() => meta.set("boardRevision", 2));
    expect(onRevision).toHaveBeenCalledWith(2);
    act(() => host.history().undo()); expect(useWorkspaceStore.getState().frames).toEqual([]);
    act(() => meta.set("boardRevision", 3));
    act(() => host.history().redo()); expect(useWorkspaceStore.getState().frames).toEqual([frame]);
    act(() => meta.set("frames", [{ ...frame, name: "Remote change" }]));
    expect(host.history().canUndo).toBe(false);
    expect(useWorkspaceStore.getState().frames[0].name).toBe("Remote change");
  } finally { meta.unobserveDeep(project); doc.destroy(); host.close(); }
});
it("equivalent server echoes and skipped no-op projections never consume a person's undo step", () => {
  vi.useFakeTimers(); reset(); const host = mount();
  try {
    act(() => {
      skipNextWorkspaceHistorySnapshot();
      useWorkspaceStore.setState({ camera: { x: 5, y: 0, zoom: 1, activeFrameId: null } });
    });
    act(() => useWorkspaceStore.setState({ blocks: { a: block("a") }, blockOrder: ["a"] }));
    act(() => {
      skipNextWorkspaceHistorySnapshot();
      useWorkspaceStore.setState({ blocks: { a: { ...block("a"), updatedAt: 20, lastEditedBy: "Server" } }, blockOrder: ["a"] });
    });
    act(() => host.history().undo()); expect(useWorkspaceStore.getState().blocks).toEqual({});
    act(() => host.history().redo()); expect(useWorkspaceStore.getState().blocks.a).toBeDefined();
  } finally { host.close(); }
});
it("manual undo restores frames and layout; redo never overwrites a fresh pending edit", () => {
  vi.useFakeTimers(); reset(); const host = mount();
  try {
    act(() => useWorkspaceStore.setState({ frames: [frame], treeLayoutDirection: "left" }));
    act(() => host.history().undo());
    expect(useWorkspaceStore.getState().frames).toEqual([]); expect(useWorkspaceStore.getState().treeLayoutDirection).toBe("right");
    act(() => host.history().redo()); expect(useWorkspaceStore.getState().frames).toEqual([frame]);
    act(() => host.history().undo());
    act(() => useWorkspaceStore.setState({ frames: [{ ...frame, name: "New decision" }] }));
    act(() => host.history().redo());
    expect(useWorkspaceStore.getState().frames[0].name).toBe("New decision");
    expect(host.history().canRedo).toBe(false);
    act(() => useWorkspaceStore.setState({ isReadOnly: true }));
    act(() => host.history().undo()); expect(useWorkspaceStore.getState().frames).toHaveLength(1);
  } finally { host.close(); }
});
it("copy/paste a container copies its content without linking the new frame to originals", () => {
  reset(); useWorkspaceStore.setState({ blocks: { container: block("container", ["a", "b"]), a: block("a"), b: block("b") }, blockOrder: ["container", "a", "b"], selectedBlockIds: ["container"] });
  const host = mount();
  try {
    act(() => host.clipboard().copy()); act(() => host.clipboard().paste());
    const state = useWorkspaceStore.getState(); expect(Object.keys(state.blocks)).toHaveLength(6);
    const copied = Object.values(state.blocks).find((b) => b.id !== "container" && "frameBlockIds" in b.data)!;
    const refs = (copied.data as { frameBlockIds: string[] }).frameBlockIds;
    expect(refs).toHaveLength(2); expect(refs).not.toContain("a"); expect(refs).not.toContain("b");
    refs.forEach((id) => expect(state.blocks[id].parentId).toBeUndefined());
  } finally { host.close(); }
});

it("switching boards or loading an authoritative snapshot cannot undo into another board", () => {
  reset(); const host = mount();
  try {
    act(() => useWorkspaceStore.setState({ frames: [frame] })); act(() => host.history().undo()); act(() => host.history().redo());
    act(() => useWorkspaceStore.setState({ boardId: "another-board", frames: [], blocks: {}, blockOrder: [] }));
    act(() => host.history().undo()); expect(useWorkspaceStore.getState().frames).toEqual([]);
    expect(host.history().canUndo).toBe(false);
  } finally { host.close(); }
});
