// @vitest-environment node
import { describe, expect, it } from "vitest";
import { receiptNotes } from "@/app/api/workspaces/[id]/agent/receiptNotes";
import { board, render, run, tbl } from "./agent-table-surface-fixture";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

const sheet = () => board({
  mode: "spreadsheet", rows: 3, cols: 2, autoFitContent: false,
  cells: [["Item", "Qty"], ["A", "2"], ["B", ""]],
  formulas: [[null, null], [null, null], [null, "=B2*10"]],
  cellContents: [[{ version: 1, blocks: [{ type: "paragraph", runs: [{ text: "Item" }] }] }, null], [null, null], [null, null]],
});

describe("update_table_options", () => {
  it("toggles header row/column and persists them", () => {
    const { result, state } = run(board({ rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]] }), { type: "update_table_options", headerRow: true, headerCol: true });
    expect(result.ids).toEqual(["tbl"]);
    expect(tbl(state).headerRow).toBe(true);
    expect(tbl(state).headerCol).toBe(true);
    expect(render(state).rowOrder).toEqual([0, 1]);
    const off = run(state, { type: "update_table_options", headerRow: false });
    expect(tbl(off.state).headerRow).toBe(false);
  });

  it("rejects an invalid mode or an empty request", () => {
    expect(run(sheet(), { type: "update_table_options", mode: "grid" }).result.ids).toEqual([]);
    expect(run(sheet(), { type: "update_table_options" }).result.ids).toEqual([]);
  });

  it("switching to document keeps formulas, shows stored values, and switching back recalculates", () => {
    const state = sheet();
    expect(render(state).displayGrid[2][1]).toBe("20");
    const doc = run(state, { type: "update_table_options", mode: "document" });
    expect(doc.result.notes?.join(" ")).toMatch(/document mode/);
    expect(tbl(doc.state).mode).toBe("document");
    expect(tbl(doc.state).formulas[2][1]).toBe("=B2*10");
    expect(render(doc.state).displayGrid[2][1]).toBe("20");
    expect(render(doc.state).mode).toBe("document");
    const back = run(doc.state, { type: "update_table_options", mode: "spreadsheet" });
    expect(render(back.state).displayGrid[2][1]).toBe("20");
    const edited = run(back.state, { type: "update_table_cell", row: 1, column: 1, value: "5" });
    expect(render(edited.state).displayGrid[2][1]).toBe("50");
  });

  it("update_table_formula still switches to spreadsheet but reports it", () => {
    const state = board({ rows: 2, cols: 2, cells: [["1", "2"], ["", ""]] });
    const { result, state: saved } = run(state, { type: "update_table_formula", row: 1, column: 0, formula: "=A1+B1" });
    expect(tbl(saved).mode).toBe("spreadsheet");
    expect(result.notes?.join(" ")).toMatch(/switched to spreadsheet mode/);
    expect(receiptNotes([{ type: "update_table_formula", ids: ["tbl"], notes: result.notes }]).join(" ")).toMatch(/update_table_options/);
    expect(render(saved).displayGrid[1][0]).toBe("3");
  });
});

describe("table structure proposal schemas", () => {
  it.each([
    { type: "freeze_table_panes", blockId: "tbl", rows: 1, columns: 1 },
    { type: "hide_table_rows", blockId: "tbl", indices: [0, 1], hidden: true },
    { type: "hide_table_columns", blockId: "tbl", range: "A:C", hidden: false },
    { type: "set_table_validation", blockId: "tbl", range: "A1:A5", values: ["Open", "Closed"] },
    { type: "add_table_conditional_format", blockId: "tbl", range: "B2:B8", rule: "gt", value1: "10" },
    { type: "set_table_link", blockId: "tbl", row: 0, column: 1, url: "https://example.com" },
    { type: "set_table_note", blockId: "tbl", row: 0, column: 1, clear: true },
    { type: "set_table_sheet_options", blockId: "tbl", color: "#36c", hidden: false },
  ])("accepts bounded $type proposal", (action) => {
    const proposal = JSON.stringify({ done: false, message: "Updated the sheet.", actions: [action] });
    expect(parseWorkspaceModelProposal(proposal).actions).toEqual([action]);
  });

  it("rejects unsupported properties and malformed range values", () => {
    const extra = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "set_table_note", blockId: "tbl", row: 0, column: 1, text: "Note", extra: true }] });
    expect(() => parseWorkspaceModelProposal(extra)).toThrow(/unsupported fields/);
    const range = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "freeze_table_panes", blockId: "tbl", rows: 1.5 }] });
    expect(() => parseWorkspaceModelProposal(range)).toThrow(/rows/);
    const link = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "set_table_link", blockId: "tbl", row: 0, column: 0 }] });
    expect(() => parseWorkspaceModelProposal(link)).toThrow(/URL/);
    const hidden = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "hide_table_rows", blockId: "tbl" }] });
    expect(() => parseWorkspaceModelProposal(hidden)).toThrow(/range or indices/);
  });
});
