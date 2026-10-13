// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveWorkspaceAgentEndpoint } from "@/lib/dify/workspace-agent-endpoint";
import { applyTableAction } from "@/app/api/workspaces/[id]/agent/operationsTables";
import { normalizeAgentActionBatch } from "@/app/api/workspaces/[id]/agent/routeHelpers";

const tableBlock = () => ({
  data: {
    rows: 2,
    cols: 2,
    cells: [["=1+1", "Owner"], ["Task", "Open"]],
    formulas: [["=1+1", undefined], [undefined, undefined]],
    cellContents: [
      [{ version: 1, blocks: [{ type: "paragraph", runs: [{ text: "2" }] }] }, null],
      [null, null],
    ],
  },
});

describe("Workspace Agent Dify endpoint", () => {
  it("requires an explicit local endpoint during development", () => {
    expect(resolveWorkspaceAgentEndpoint({
      productionFallbackUrl: "https://staging.example.test/v1/chat-messages",
      isProduction: false,
    })).toBeNull();
  });

  it("rejects a remote endpoint during development", () => {
    expect(resolveWorkspaceAgentEndpoint({
      configuredUrl: "https://staging.example.test/v1/chat-messages",
      productionFallbackUrl: "https://staging.example.test/v1/chat-messages",
      isProduction: false,
    })).toBeNull();
  });

  it("allows the local Dify host during development", () => {
    expect(resolveWorkspaceAgentEndpoint({
      configuredUrl: "http://localhost:8080/v1/chat-messages",
      productionFallbackUrl: "https://staging.example.test/v1/chat-messages",
      isProduction: false,
    })).toBe("http://localhost:8080/v1/chat-messages");
  });

  it("uses the configured or fallback endpoint in production", () => {
    expect(resolveWorkspaceAgentEndpoint({
      productionFallbackUrl: "https://staging.example.test/v1/chat-messages",
      isProduction: true,
    })).toBe("https://staging.example.test/v1/chat-messages");
  });

  it("copies flat selection parameters into a single batched arrange action", () => {
    expect(normalizeAgentActionBatch({
      actions: [{ type: "arrange_selection", mode: "catalog" }],
      blockIds: ["source", "destination"],
      columns: 1,
      gap: 80,
    })).toEqual([{
      type: "arrange_selection",
      blockIds: ["source", "destination"],
      mode: "catalog",
      columns: 1,
      gap: 80,
    }]);
  });

  it("preserves action-specific selection parameters over flat envelope values", () => {
    expect(normalizeAgentActionBatch({
      actions: [{ type: "arrange_selection", params: { columns: 2 } }],
      columns: 1,
    })).toEqual([{ type: "arrange_selection", params: { columns: 2 } }]);
  });

  it("fills null selection placeholders and leaves multi-action batches untouched", () => {
    expect(normalizeAgentActionBatch({
      actions: [{ action: "arrange_selection", columns: null }],
      columns: 1,
      blockIds: [],
    })).toEqual([{ type: "arrange_selection", columns: 1, blockIds: [] }]);
    expect(normalizeAgentActionBatch({
      actions: [{ type: "arrange_selection" }, { type: "update_node" }],
      columns: 1,
    })).toEqual([{ type: "arrange_selection" }, { type: "update_node" }]);
  });

  it("writes multiple table cells atomically and refreshes derived cell data", () => {
    const block = tableBlock();

    expect(applyTableAction({ cells: [
      { row: 0, column: 0, value: "Task" },
      { row: 0, column: 1, value: "Owner" },
      { row: 1, column: 0, value: "Prepare menu" },
      { row: 1, column: 1, value: "In progress" },
    ] }, block, "update_table_cells")).toBe(true);
    expect(block.data.cells).toEqual([["Task", "Owner"], ["Prepare menu", "In progress"]]);
    expect(block.data.formulas).toBeUndefined();
    expect(block.data.cellContents[0][0]).toEqual({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "Task" }] }],
    });
  });

  it("rejects an invalid or duplicate cell coordinate without partial writes", () => {
    const block = tableBlock();
    const original = structuredClone(block.data);

    expect(applyTableAction({ cells: [
      { row: 0, column: 1, value: "Changed" },
      { row: 2, column: 0, value: "Out of bounds" },
    ] }, block, "update_table_cells")).toBe(false);
    expect(block.data).toEqual(original);
    expect(applyTableAction({ cells: [
      { row: 0, column: 1, value: "First" },
      { row: 0, column: 1, value: "Duplicate" },
    ] }, block, "update_table_cells")).toBe(false);
    expect(block.data).toEqual(original);
  });

  it("stores select labels as option IDs and expands tables when content grows", () => {
    const block = {
      ...tableBlock(),
      data: {
        ...tableBlock().data,
        rows: 1,
        cols: 1,
        cells: [["Open"]],
        columnTypes: ["select"],
        columnSelectOptions: { 0: [{ id: "in-progress", label: "In progress", color: "#22aa66" }] },
      },
      transform: { computed: null, override: { x: 0, y: 0, w: 120, h: 40 } },
    };

    expect(applyTableAction({ row: 0, column: 0, value: "In progress" }, block, "update_table_cell")).toBe(true);
    expect(block.data.cells).toEqual([["in-progress"]]);
    expect(block.transform.override.w).toBeGreaterThan(120);
  });
});
