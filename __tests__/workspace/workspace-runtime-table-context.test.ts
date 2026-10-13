import { describe, expect, it } from "vitest";
import { buildModelStepQuery, WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS } from "@/lib/workspace-agent/modelStepContext";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { applyAdvancedTableAction } from "@/app/api/workspaces/[id]/agent/tableAdvancedOperations";
import { applyActionToTableSheet } from "@/app/api/workspaces/[id]/agent/tableWorkbookOperations";
import { getTableWorkbookSheets } from "@/app/workspace/utils/workspaceTableWorkbook";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { WorkspaceJson } from "@/lib/workspace-agent/contracts";

const makeBoard = (blocks: Record<string, unknown>, connectors: Record<string, unknown> = {}) => ({
  revision: 8, title: "Disposable table acceptance", blocks, blockOrder: Object.keys(blocks), connectors,
});

const makeTable = (id: string) => ({
  type: "table",
  description: "Acceptance Values",
  data: {
    rows: 8,
    cols: 8,
    cells: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "x".repeat(120))),
    activeSheetId: "sheet-replay",
    sheets: [
      { id: "sheet-original", name: "Sheet1", data: { rows: 8, cols: 8 } },
      { id: "sheet-replay", name: "Runtime staging replay", data: { rows: 8, cols: 8 } },
    ],
  },
});

describe("runtime model-step context", () => {
  it("routes resolved-comment requests through the exact comment lifecycle action", () => {
    const payload = JSON.parse(buildModelStepQuery({
      query: "Reopen the resolved comment from the review.", canMutate: true,
    }, makeBoard({}), [], []));
    const collaboration = payload.workspaceCapabilities.find((item: { category: string }) => item.category === "collaboration");

    expect(collaboration.commands).toContain("reopen_comment");
    expect(collaboration.commands).toContain("resolve_comment");
    expect(payload.instruction).toContain("use reopen_comment with the exact commentId from list_comments");
    expect(payload.instruction).toContain("resolve_comment only resolves an open comment");
  });

  it("includes exact table and workbook sheet references for named table actions", () => {
    const board = makeBoard({ "table-id": makeTable("table-id") });
    const payload = JSON.parse(buildModelStepQuery({
      query: "Merge A1:B1 in Acceptance Values on Runtime staging replay.", canMutate: true,
    }, board, [], []));

    expect(payload.board.blocks[0]).toMatchObject({
      id: "table-id",
      type: "table",
      tableName: "Acceptance Values",
      activeSheetId: "sheet-replay",
      sheetCount: 2,
      sheets: [
        { id: "sheet-original", name: "Sheet1", order: 0, rows: 8, cols: 8 },
        { id: "sheet-replay", name: "Runtime staging replay", order: 1, rows: 8, cols: 8 },
      ],
    });
  });

  it("routes worksheet and workbook wording to sheet-management actions", () => {
    const board = makeBoard({ "table-id": makeTable("table-id") });
    const payload = JSON.parse(buildModelStepQuery({
      query: 'Rename worksheet "Sheet1" to "Budget".', canMutate: true,
    }, board, [], []));

    expect(payload.workspaceCapabilities.find((item: { category: string }) => item.category === "table").commands)
      .toContain("rename_table_sheet");
    expect(payload.actionSchemas.rename_table_sheet).toBeDefined();
    expect(payload.actionSchemas.add_table_sheet).toBeDefined();
  });

  it("retains workbook sheet references when cell contents are compacted", () => {
    const blocks: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => [`table-${index}`, makeTable(`table-${index}`)]),
    );
    for (let index = 0; index < 76; index += 1) {
      blocks[`text-${index}`] = { type: "text", description: "d".repeat(180), data: { markdown: "t".repeat(180) } };
    }
    const connectors = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`connector-${index}`, {
      fromBlockId: `text-${index}`, toBlockId: `text-${index + 1}`,
    }]));
    const encoded = buildModelStepQuery({ query: "Edit a workbook sheet", canMutate: true }, makeBoard(blocks, connectors), [], []);
    const payload = JSON.parse(encoded);

    expect(encoded.length).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS);
    expect(payload.board.blocks[0]).not.toHaveProperty("cells");
    expect(payload.board.blocks[0]).toMatchObject({
      tableName: "Acceptance Values",
      activeSheetId: "sheet-replay",
      sheets: [{ id: "sheet-original", name: "Sheet1" }, { id: "sheet-replay", name: "Runtime staging replay" }],
    });
  });

  it("validates and applies A1 formatting on only the explicitly named sheet", () => {
    const blockId = "table-workbook";
    const table = {
      id: blockId,
      type: "table",
      data: {
        rows: 1,
        cols: 2,
        cells: [["original", "unchanged"]],
        activeSheetId: "sheet-original",
        sheets: [
          { id: "sheet-original", name: "Sheet1", data: { rows: 1, cols: 2, cells: [["original", "unchanged"]] } },
          { id: "sheet-replay", name: "Runtime staging replay", data: { rows: 1, cols: 2, cells: [["target", "preserved"]] } },
        ],
      },
    } as unknown as CanvasBlock<"table">;
    const action = {
      type: "update_table_cell_format",
      blockId,
      sheetName: "Runtime staging replay",
      range: "A1",
      bold: true,
      backgroundColor: "#e6f4ea",
    };
    const board: WorkspaceJson = { blocks: { [blockId]: table as unknown as WorkspaceJson } };

    expect(parseWorkspaceModelProposal(JSON.stringify({ done: true, message: "Formatted A1.", actions: [action] }), board).actions).toEqual([action]);
    expect(() => parseWorkspaceModelProposal(JSON.stringify({ done: true, message: "", actions: [{ ...action, row: 0, column: 0 }] }), board)).toThrow("contains unsupported fields");
    expect(applyActionToTableSheet(action, table as unknown as WorkspaceJson, (raw, target) => applyAdvancedTableAction(raw, target, action.type))).toBe(true);

    const sheets = getTableWorkbookSheets(table);
    expect(sheets[0].data.cells).toEqual([["original", "unchanged"]]);
    expect(sheets[1].data.cells).toEqual([["target", "preserved"]]);
    expect(sheets[1].data.cellContents?.[0]?.[0]).toMatchObject({ blocks: [{ runs: [{ text: "target", marks: { bold: true } }] }] });
    expect(sheets[1].data.cellBgColor).toEqual([["#e6f4ea", null]]);
    expect(sheets[0].data.cellContents).toBeUndefined();
  });
});
