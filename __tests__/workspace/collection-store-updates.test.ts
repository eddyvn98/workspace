import { afterEach, describe, expect, it } from "vitest";
import { addRecord, createCollection, normalizeCollection, setRecordValue } from "../../app/workspace/collections/model";
import { createDualTransform, type CanvasBlock } from "../../app/workspace/types/block";
import { useWorkspaceStore } from "../../app/workspace/store/useWorkspaceStore";

function collectionBlock(): CanvasBlock<"collection"> {
  return {
    id: "collection-test", type: "collection",
    transform: createDualTransform({ x: 0, y: 0, w: 360, h: 220, rotation: 0, zIndex: 0 }),
    data: createCollection(), createdAt: 1, updatedAt: 1,
  };
}

afterEach(() => useWorkspaceStore.setState({ blocks: {}, isReadOnly: false, currentUserEmail: null }));

describe("Workspace Collection store updates", () => {
  it("audits valid Collection payloads through the normal block update path", () => {
    const block = collectionBlock();
    useWorkspaceStore.setState({ blocks: { [block.id]: block } });
    const next = addRecord(block.data, { [block.data.fields[0].id]: "Saved" });
    useWorkspaceStore.getState().updateBlock(block.id, { data: next });
    const saved = useWorkspaceStore.getState().blocks[block.id];
    expect(saved.type).toBe("collection");
    if (saved.type !== "collection") throw new Error("Collection block changed type");
    expect(saved.data.records).toHaveLength(1);
    expect(saved.data.auditTrail).toHaveLength(1);
  });

  it("rejects a mismatched block payload without corrupting the Collection", () => {
    const block = collectionBlock();
    useWorkspaceStore.setState({ blocks: { [block.id]: block } });
    useWorkspaceStore.getState().updateBlock(block.id, { data: { html: "wrong block type" } } as never);
    expect(useWorkspaceStore.getState().blocks[block.id]).toEqual(block);
  });
  it("persists the final value across rapid edits using current store state", () => {
    const block = collectionBlock();
    const field = block.data.fields[0].id;
    block.data = addRecord(block.data, { [field]: "Initial" });
    useWorkspaceStore.setState({ blocks: { [block.id]: block } });
    const recordId = block.data.records[0].id;
    const change = (value: string) => {
      const state = useWorkspaceStore.getState();
      const current = state.blocks[block.id];
      if (current?.type !== "collection") throw new Error("Missing collection");
      state.updateBlock(block.id, {
        data: setRecordValue(normalizeCollection(current.data), recordId, field, value),
      });
    };
    change("Done");
    change("In progress");
    const saved = useWorkspaceStore.getState().blocks[block.id];
    if (saved.type !== "collection") throw new Error("Missing collection");
    expect(saved.data.records[0].values[field]).toBe("In progress");
  });

});
