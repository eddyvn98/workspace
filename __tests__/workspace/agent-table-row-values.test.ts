// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

function board(): AgentBoardState {
  return {
    title: "t",
    blockOrder: ["tbl"],
    blocks: {
      tbl: {
        id: "tbl",
        type: "table",
        transform: { computed: null, override: { x: 0, y: 0, w: 300, h: 120, zIndex: 1 } },
        data: { rows: 2, cols: 3, cells: [["Name", "Role", "Status"], ["Ann", "Dev", "Active"]], headerRow: true },
      },
    },
    connectors: {},
  };
}

const data = (state: AgentBoardState) => state.blocks.tbl.data as Record<string, unknown>;

describe("table row and header edits", () => {
  it("fills a new row with the supplied values", () => {
    const state = board();
    applyAgentAction(state, { type: "insert_table_row", target: "tbl", row: 1, values: ["Zed", "Intern", "Pending"] });
    expect((data(state).cells as string[][])[1]).toEqual(["Zed", "Intern", "Pending"]);
    expect((data(state).cells as string[][])[2]).toEqual(["Ann", "Dev", "Active"]);
  });

  it("fills a new column from a values list", () => {
    const state = board();
    applyAgentAction(state, { type: "insert_table_column", target: "tbl", values: ["Email", "a@x.io"] });
    expect((data(state).cells as string[][]).map((row) => row[3])).toEqual(["Email", "a@x.io"]);
  });

  it("formats the whole header row when no column is given", () => {
    const state = board();
    applyAgentAction(state, { type: "update_table_cell_format", target: "tbl", scope: "header", backgroundColor: "#2563eb", textColor: "#ffffff", bold: true });
    const bg = data(state).cellBgColor as string[][];
    expect(bg[0]).toEqual(["#2563eb", "#2563eb", "#2563eb"]);
    expect(bg[1]).toEqual([null, null, null]);
    const contents = data(state).cellContents as Array<Array<{ blocks: Array<{ runs: Array<{ marks?: { bold?: boolean } }> }> } | null>>;
    expect(contents[0].every((cell) => cell?.blocks.every((block) => block.runs.every((run) => run.marks?.bold === true)))).toBe(true);
    expect(contents[1].every((cell) => !cell)).toBe(true);
  });

  it("formats a whole column when only a column is given", () => {
    const state = board();
    applyAgentAction(state, { type: "update_table_cell_format", target: "tbl", column: 1, align: "center" });
    const align = data(state).cellAlign as string[][];
    expect(align.map((row) => row[1])).toEqual(["center", "center"]);
    expect(align.map((row) => row[0])).toEqual([null, null]);
  });
});

describe("search_replace coverage", () => {
  it("replaces text inside shape labels and table cells", () => {
    const state = board();
    state.blocks.note = { id: "note", type: "shape", data: { label: "Alpha plan", shapeKind: "sticky_note" } };
    state.blockOrder.push("note");
    (state.blocks.tbl.data as Record<string, unknown>).cells = [["Alpha", "Role", "Status"], ["Ann", "Dev", "Active"]];
    const { ids } = applyAgentAction(state, { type: "search_replace", query: "Alpha", replacement: "Gamma" });
    expect(ids.sort()).toEqual(["note", "tbl"]);
    expect((state.blocks.note.data as Record<string, unknown>).label).toBe("Gamma plan");
    expect(((state.blocks.tbl.data as Record<string, unknown>).cells as string[][])[0][0]).toBe("Gamma");
  });
});

describe("receipt notes", () => {
  it("warns that the locked flag protects nothing", async () => {
    const { receiptNotes } = await import("@/app/api/workspaces/[id]/agent/receiptNotes");
    const notes = receiptNotes([{ type: "update_block_style", ids: ["a"] }], { a: { style: { locked: true } } });
    expect(notes.join(" ")).toMatch(/no block-lock feature/);
    expect(receiptNotes([{ type: "update_block_style", ids: ["a"] }], { a: { style: {} } })).toEqual([]);
  });
});

describe("duplicate_shape count", () => {
  it("makes several copies lined up in a row", () => {
    const state = board();
    state.blocks.s = { id: "s", type: "shape", transform: { computed: null, override: { x: 0, y: 0, w: 100, h: 50, zIndex: 1 } }, data: { label: "A", shapeKind: "sticky_note" } };
    state.blockOrder.push("s");
    const { ids } = applyAgentAction(state, { type: "duplicate_shape", target: "s", count: 3 });
    expect(ids).toHaveLength(3);
    const xs = ids.map((copy) => (state.blocks[copy].transform as { override: { x: number; y: number } }).override);
    expect(xs.map((p) => p.x)).toEqual([124, 248, 372]);
    expect(new Set(xs.map((p) => p.y))).toEqual(new Set([0]));
  });
});

describe("bulk delete guard", () => {
  it("blocks wiping most of the board unless confirmed", async () => {
    const { bulkDeleteGuard } = await import("@/app/api/workspaces/[id]/agent/bulkDeleteGuard");
    const before = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`b${i}`, {}]));
    const kept = { b0: {}, b1: {} };
    const blocked = bulkDeleteGuard([{ type: "delete_node" }], before, kept, 3);
    expect(blocked?.status).toBe(409);
    expect(bulkDeleteGuard([{ type: "delete_node", confirmBulkDelete: true }], before, kept, 3)).toBeNull();
    expect(bulkDeleteGuard([{ type: "delete_node" }], before, { ...kept, b2: {}, b3: {}, b4: {}, b5: {}, b6: {} }, 3)).toBeNull();
    expect(bulkDeleteGuard([{ type: "delete_node" }], { a: {}, b: {} }, {}, 3)).toBeNull();
  });
});
