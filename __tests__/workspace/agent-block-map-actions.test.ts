import { describe, expect, it } from "vitest";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

describe("Workspace block, map and document-table contracts", () => {
  it("requires a supported block type and keeps known block inputs bounded", () => {
    expect(validateWorkspaceRuntimeAction({ type: "create_block" })).toContain("requires blockType");
    expect(validateWorkspaceRuntimeAction({ type: "create_block", blockType: "text", text: "Hello", x: 0, y: 0 })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_block", blockType: "unknown" })).not.toBeNull();
  });

  it("requires a source block for map and branch copies", () => {
    expect(validateWorkspaceRuntimeAction({ type: "duplicate_map" })).toContain("requires a blockId");
    expect(validateWorkspaceRuntimeAction({ type: "duplicate_map", blockId: "root" })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "copy_branch_to_map", target: "branch" })).toBeNull();
  });

  it("requires both resource IDs for embedding and a bounded filter range", () => {
    expect(validateWorkspaceRuntimeAction({ type: "embed_table_in_doc", docId: "doc" })).not.toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "embed_table_in_doc", docId: "doc", tableId: "table" })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "set_table_filter", blockId: "table" })).toContain("requires an A1 range");
    expect(validateWorkspaceRuntimeAction({ type: "set_table_filter", blockId: "table", range: "A1:D20", criteria: { values: ["A"] } })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "set_table_filter", blockId: "table", clear: true })).toBeNull();
  });
});
