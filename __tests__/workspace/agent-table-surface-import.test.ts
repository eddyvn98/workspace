// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportToMarkdown } from "@/app/workspace/utils/markdownExport";
import { importFromMarkdown } from "@/app/workspace/utils/markdownImport";
import { parseDelimitedText, parseMarkdownPipeTable } from "@/app/workspace/utils/tableImportParsers";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { board, render, run, tbl } from "./agent-table-surface-fixture";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

describe("CSV and markdown parsers", () => {
  it("handles quotes, embedded commas, doubled quotes and newlines, CRLF and BOM", () => {
    const text = "﻿a,b,c\r\n\"x, y\",\"he said \"\"hi\"\"\",\"line1\nline2\"\r\n,,last";
    expect(parseDelimitedText(text, ",")).toEqual([["a", "b", "c"], ["x, y", "he said \"hi\"", "line1\nline2"], ["", "", "last"]]);
  });
  it("parses pipe tables and drops the separator row", () => {
    expect(parseMarkdownPipeTable("| a | b |\n| --- | :-: |\n| 1 \\| 2 | x<br>y |")).toEqual([["a", "b"], ["1 | 2", "x\ny"]]);
  });
});

describe("paste_table_range", () => {
  it("grows the table, keeps weights sane, formulas in spreadsheet mode, and persists", () => {
    const state = board({
      mode: "spreadsheet", headerRow: true, rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]], rowWeights: [40, 40], colWeights: [96, 96],
      cellContents: [[{ version: 1, blocks: [{ type: "paragraph", runs: [{ text: "a", marks: { bold: true } }] }] }, null], [null, null]],
    });
    const { result, state: saved } = run(state, { type: "paste_table_range", row: 1, column: 1, values: [["x", "=A1&B1"], ["y", "z"]] });
    expect(result.ids).toEqual(["tbl"]);
    expect(tbl(saved).rows).toBe(3);
    expect(tbl(saved).cols).toBe(3);
    expect(tbl(saved).headerRow).toBe(true);
    expect(tbl(saved).cells[1]).toEqual(["c", "x", ""]);
    expect(tbl(saved).formulas[1][2]).toBe("=A1&B1");
    expect(tbl(saved).rowWeights).toEqual([40, 40, 40]);
    expect(render(saved).displayGrid[1]).toEqual(["c", "x", "ab"]);
    expect(render(saved).contentGrid[0][0].blocks[0].runs[0].marks).toEqual({ bold: true });
  });

  it("keeps = as plain text in document mode and rejects bad input", () => {
    const { state } = run(board({ rows: 1, cols: 1, cells: [["a"]] }), { type: "paste_table_range", row: 0, column: 0, values: [["=1+1"]] });
    expect(tbl(state).cells[0][0]).toBe("=1+1");
    expect(applyAgentAction(board({ rows: 1, cols: 1, cells: [["a"]] }), { type: "paste_table_range", target: "tbl", values: [] }).ids).toEqual([]);
  });
});

describe("import_table", () => {
  const csv = "Name,Note\n\"Smith, J\",\"two\nlines\"\nBo,\"say \"\"x\"\"\"";
  it("replaces an existing table's content from CSV and keeps mode/header flags", () => {
    const { state } = run(board({ mode: "spreadsheet", headerRow: true, rows: 5, cols: 5, cells: Array(5).fill(Array(5).fill("old")), cellBgColor: [["#fff"]] }), { type: "import_table", format: "csv", text: csv });
    expect(tbl(state).rows).toBe(3);
    expect(tbl(state).cols).toBe(2);
    expect(tbl(state).cells).toEqual([["Name", "Note"], ["Smith, J", "two\nlines"], ["Bo", "say \"x\""]]);
    expect(tbl(state).mode).toBe("spreadsheet");
    expect(tbl(state).headerRow).toBe(true);
    expect(tbl(state).cellBgColor).toBeUndefined();
    expect(render(state).contentGrid[1][1].blocks.map((block) => block.runs[0].text)).toEqual(["two", "lines"]);
  });
  it("imports markdown and TSV, and can append", () => {
    const md = run(board({ rows: 1, cols: 1, cells: [[""]] }), { type: "import_table", format: "markdown", text: "| a | b |\n|---|---|\n| 1 | 2 |" });
    expect(tbl(md.state).cells).toEqual([["a", "b"], ["1", "2"]]);
    const appended = run(md.state, { type: "import_table", format: "tsv", text: "3\t4", append: true });
    expect(tbl(appended.state).cells).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("creates a new table block when no table exists", () => {
    const state = { title: "t", blockOrder: [], blocks: {}, connectors: {} };
    const result = applyAgentAction(state, { type: "import_table", format: "csv", text: "h1,h2\n1,2" });
    expect(result.ids).toHaveLength(1);
    const created = JSON.parse(JSON.stringify(state.blocks))[result.ids[0]];
    expect(created.type).toBe("table");
    expect(created.data.cells).toEqual([["h1", "h2"], ["1", "2"]]);
    expect(created.data.headerRow).toBe(true);
    expect(applyAgentAction(state, { type: "import_table", format: "csv", text: "" }).ids).toEqual([]);
  });
});

describe("export_board markdown pipe table", () => {
  it("exports a real pipe table and re-imports it without a data block", () => {
    const state = board({ rows: 2, cols: 2, cells: [["Name", "Qty"], ["a|b", "2"]] });
    const markdown = exportToMarkdown(state.blocks as any, state.blockOrder, "Doc");
    expect(markdown).toContain("| Name | Qty |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| a\\|b | 2 |");
    const withoutData = markdown.slice(0, markdown.indexOf("<!--WORKSPACE_DATA"));
    const imported = importFromMarkdown(withoutData);
    const tables = imported.blocks.filter((block) => block.type === "table");
    expect(tables).toHaveLength(1);
    expect((tables[0].data as any).cells).toEqual([["Name", "Qty"], ["a|b", "2"]]);
    expect(imported.blocks.some((block) => block.type !== "table" && JSON.stringify(block.data).includes("| Name"))).toBe(false);
  });
});

describe("table surface proposal schemas", () => {
  it.each([
    { type: "update_table_options", blockId: "tbl", mode: "spreadsheet" },
    { type: "move_table_row", blockId: "tbl", from: 1, to: 2 },
    { type: "move_table_column", blockId: "tbl", from: 0, to: 1 },
    { type: "duplicate_table_row", blockId: "tbl", row: 1, count: 2 },
    { type: "duplicate_table_column", blockId: "tbl", column: 1 },
    { type: "paste_table_range", blockId: "tbl", row: 1, column: 0, values: [["a", "2"]] },
    { type: "import_table", blockId: "tbl", text: "a,b\n1,2", format: "csv", append: true },
    { type: "sort_table_range", blockId: "tbl", range: "A1:B8", column: 1, direction: "desc" },
  ])("accepts bounded $type proposal", (action) => {
    const proposal = JSON.stringify({ done: false, message: "Updated the table.", actions: [action] });
    expect(parseWorkspaceModelProposal(proposal).actions).toEqual([action]);
  });

  it("rejects incomplete and unsupported table requests", () => {
    const missing = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "import_table", blockId: "tbl", format: "csv" }] });
    expect(() => parseWorkspaceModelProposal(missing)).toThrow(/requires text, content or data/);
    const extra = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "move_table_row", blockId: "tbl", from: 1, to: 2, unexpected: true }] });
    expect(() => parseWorkspaceModelProposal(extra)).toThrow(/unsupported fields/);
  });
});
