import { describe, expect, it } from "vitest";
import { validateWorkspaceRuntimeAction, validateWorkspaceRuntimeTableTarget } from "@/lib/workspace-agent/actionSchema";

describe("expanded Workspace runtime actions", () => {
  it.each([
    { type: "update_node", blockId: "node-1", title: "Updated" },
    { type: "rename_board", title: "Quarterly plan" },
    { type: "update_table_cell", blockId: "table-1", row: 0, column: 2, text: "42" },
    { type: "update_table_formula", blockId: "table-1", row: 1, column: 2, formula: "=A1+B1" },
    { type: "insert_table_row", blockId: "table-1", row: 2, values: ["West", "12"] },
    { type: "insert_table_column", blockId: "table-1", column: 2, values: ["Status", "Open"] },
    { type: "delete_table_row", blockId: "table-1", row: 2 },
    { type: "delete_table_column", blockId: "table-1", column: 2 },
    { type: "update_table_column", blockId: "table-1", column: 1, columnType: "number", sortDirection: "desc" },
    { type: "update_table_cell_format", blockId: "table-1", range: "B2:C3", bold: true, fontSize: 14 },
    { type: "add_child", blockId: "node-1", text: "A child" },
    { type: "add_sibling", blockId: "node-1", text: "A sibling" },
    { type: "delete_node", blockId: "node-1" },
    { type: "duplicate_node", blockId: "node-1", offsetX: 48, offsetY: 24 },
    { type: "move_node", blockId: "node-1" },
    { type: "attach_to_parent", blockId: "node-1", newParent: "node-2" },
  ])("accepts a valid $type proposal", (action) => {
    expect(validateWorkspaceRuntimeAction(action)).toBeNull();
  });

  it.each([
    { type: "rename_board", title: "  " },
    { type: "update_table_cell", blockId: "table-1", row: -1, column: 0, text: "x" },
    { type: "update_table_formula", blockId: "table-1", row: 0, column: 0, formula: "A1+B1" },
    { type: "update_node", blockId: "node-1", title: "Updated", extra: true },
    { type: "insert_table_row", blockId: "table-1", row: 1, values: ["ok", 12] },
    { type: "update_table_column", blockId: "table-1", column: 0, columnType: "currency" },
    { type: "update_table_cell_format", blockId: "table-1", range: "B2", bold: "yes" },
    { type: "add_child", blockId: "node-1", text: "  " },
    { type: "duplicate_node", blockId: "node-1", offsetX: 900 },
    { type: "move_node", blockId: "node-1", title: "unexpected" },
  ])("rejects an invalid $type proposal", (action) => {
    expect(validateWorkspaceRuntimeAction(action)).toEqual(expect.any(String));
  });
});

describe("table action bounds against the live board snapshot", () => {
  const board = { blocks: { "table-1": { type: "table", data: { rows: 2, cols: 2 } } } };

  it("allows insertion at the end of the current table", () => {
    expect(validateWorkspaceRuntimeTableTarget({ type: "insert_table_row", blockId: "table-1", row: 2 }, board)).toBeNull();
  });

  it.each([
    { type: "delete_table_row", blockId: "table-1", row: 2 },
    { type: "delete_table_column", blockId: "table-1", column: 3 },
    { type: "update_table_cell", blockId: "table-1", row: 1, column: 2, text: "x" },
  ])("rejects coordinates the executor would otherwise clamp or ignore: $type", (action) => {
    expect(validateWorkspaceRuntimeTableTarget(action, board)).toEqual(expect.any(String));
  });

  it("rejects a table command aimed at a non-table block", () => {
    expect(validateWorkspaceRuntimeTableTarget({ type: "delete_table_row", blockId: "missing", row: 0 }, board)).toEqual(expect.any(String));
  });

  it("rejects unknown tree targets and parent cycles", () => {
    const tree = { blocks: {
      root: { parentId: undefined },
      child: { parentId: "root" },
      leaf: { parentId: "child" },
    } };
    expect(validateWorkspaceRuntimeTableTarget({ type: "add_child", blockId: "missing", text: "x" }, tree)).toEqual(expect.any(String));
    expect(validateWorkspaceRuntimeTableTarget({ type: "attach_to_parent", blockId: "root", newParent: "leaf" }, tree)).toContain("cycle");
    expect(validateWorkspaceRuntimeTableTarget({ type: "delete_node", blockId: "root" }, tree)).toContain("map root");
    expect(validateWorkspaceRuntimeTableTarget({ type: "move_node", blockId: "root" }, tree)).toContain("currently has a parent");
  });
});
