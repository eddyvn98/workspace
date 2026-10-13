import { describe, expect, it } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { applyCollectionAction } from "@/app/api/workspaces/[id]/agent/collectionOperations";
import { validateCollectionAction, validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
import { WORKSPACE_RUNTIME_ACTION_SCHEMAS, validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";
import { selectWorkspaceCapabilities } from "@/lib/workspace-agent/capabilitySelection";
import { buildModelStepQuery } from "@/lib/workspace-agent/modelStepContext";

function setup() {
  const data = createCollection();
  const state = { blocks: { c1: { id: "c1", type: "collection", data } }, blockOrder: ["c1"], connectors: {}, title: "Board" };
  return { data, state };
}
describe("Collection AI command contracts", () => {
  it("registers closed schemas and a dedicated capability", () => {
    const commands = selectWorkspaceCapabilities("Change collection Kanban record status")
      .find((item) => item.category === "collection")?.commands ?? [];
    expect(commands).toContain("update_collection_record");
    expect(commands).toContain("read_collection");
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.update_collection_record.additionalProperties).toBe(false);
  });
  it("includes stable IDs and real, bounded values in Dify model-step context", () => {
    const { data, state } = setup();
    data.records.push({ id: "r1", values: { [data.fields[0].id]: "Roadmap" } });
    const payload = JSON.parse(buildModelStepQuery(
      { query: "Update collection record status", canMutate: true } as never,
      { revision: 1, title: "Board", ...state } as never, [], []));
    const collection = payload.board.blocks.find((b: { id: string }) => b.id === "c1").collection;
    expect(collection.fields[0].id).toBe(data.fields[0].id);
    expect(collection.records).toContainEqual(expect.objectContaining({ id: "r1" }));
    expect(collection.records[0].values[data.fields[0].id]).toBe("Roadmap");
  });
  it("updates exact cells and rejects unknown field IDs without mutation", () => {
    const { data, state } = setup();
    data.records.push({ id: "r1", values: {} });
    const update = { type: "update_collection_record", blockId: "c1", recordId: "r1", values: { [data.fields[1].id]: "Done" } };
    expect(validateWorkspaceRuntimeAction(update)).toBeNull();
    expect(validateCollectionTarget(update, state as never)).toBeNull();
    expect(applyCollectionAction(state as never, update)?.ids).toEqual(["c1"]);
    expect(data.records[0].values[data.fields[1].id]).toBeUndefined();
    expect(state.blocks.c1.data.records[0].values[data.fields[1].id]).toBe("Done");
    const bad = { ...update, values: { fake: "Done" } };
    expect(validateCollectionTarget(bad, state as never)).toMatch(/fieldId/);
    expect(applyCollectionAction(state as never, bad)?.ids).toEqual([]);
  });
  it("uses supplied creation IDs, protects against retry duplicates and invalid field types", () => {
    const { data, state } = setup();
    const action = { type: "create_collection_record", blockId: "c1", recordId: "stable-r1", values: { [data.fields[0].id]: "Item" } };
    expect(applyCollectionAction(state as never, action)?.ids).toEqual(["c1"]);
    expect(applyCollectionAction(state as never, action)?.ids).toEqual([]);
    expect(state.blocks.c1.data.records).toHaveLength(1);
    expect(validateCollectionAction({ ...action, values: { [data.fields[0].id]: 5 } })).toBeNull();
  });
  it("normalizes JSON numbers and booleans before saving, rejecting non-scalar inputs", () => {
    const { data, state } = setup();
    const price = data.fields[0].id;
    const enabled = data.fields.find((field) => field.type === "checkbox")?.id ?? "checked";
    if (!data.fields.some((field) => field.id === enabled)) data.fields.push({ id: enabled, name: "Checked", type: "checkbox" });
    const command = { type: "create_collection_record", blockId: "c1", recordId: "row-numbers", values: { [price]: 10, [enabled]: true } };
    expect(validateWorkspaceRuntimeAction(command)).toBeNull();
    expect(applyCollectionAction(state as never, command)?.ids).toEqual(["c1"]);
    expect(state.blocks.c1.data.records[0].values).toEqual({ [price]: "10", [enabled]: "true" });
    expect(validateCollectionAction({ ...command, values: { [price]: null } })).toMatch(/values/);
    expect(validateCollectionAction({ ...command, values: { [price]: [10] } })).toMatch(/values/);
  });
  it("refuses ambiguous/unknown IDs and retains view identity", () => {
    const { data, state } = setup();
    const rename = { type: "update_collection_field", blockId: "c1", fieldId: data.fields[1].id, name: data.fields[0].name };
    expect(validateCollectionTarget(rename, state as never)).toMatch(/Ambiguous/);
    const config = { type: "configure_collection_view", blockId: "c1", viewId: data.views[0].id, sort: { fieldId: data.fields[0].id, direction: "asc" } };
    expect(applyCollectionAction(state as never, config)?.ids).toEqual(["c1"]);
    expect(state.blocks.c1.data.views[0].id).toBe(data.views[0].id);
  });
});
