import { describe, expect, it } from "vitest";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { WORKSPACE_RUNTIME_ACTION_SCHEMAS, WORKSPACE_RUNTIME_ALLOWED_ACTIONS } from "@/lib/workspace-agent/actionSchema";
import { normalizeAgentMapLayoutAction } from "@/app/api/workspaces/[id]/agent/mapStyleParity";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { selectWorkspaceCapabilities } from "@/lib/workspace-agent/capabilitySelection";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";
import { buildModelStepQuery, WORKSPACE_RUNTIME_MODEL_QUERY_MAX_BYTES, WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS } from "@/lib/workspace-agent/modelStepContext";
import { workspaceActionNeedsConfirmation } from "@/lib/workspace-agent/runtimeSafety";

const proposal = (action: Record<string, unknown>) => JSON.stringify({ done: false, message: "Applying the requested Workspace change.", actions: [action] });

describe("Workspace runtime map and diagram schemas", () => {
  it("exposes strict schemas for root maps and semantic diagrams", () => {
    expect(Object.keys(WORKSPACE_RUNTIME_ACTION_SCHEMAS)).toHaveLength(108);
    expect(WORKSPACE_RUNTIME_ALLOWED_ACTIONS).toHaveLength(108);
    for (const name of WORKSPACE_RUNTIME_ALLOWED_ACTIONS) {
      expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS[name]).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: expect.arrayContaining(["type"]),
        properties: { type: { type: "string", const: name } },
      });
    }
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.create_map.properties.nodes).toMatchObject({ type: "array", minItems: 1 });
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.connect_nodes.required).toEqual(["type", "from", "to"]);
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.create_flowchart.required).toEqual(["type", "nodes", "edges"]);
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.create_swimlane.required).toEqual(["type", "nodes", "edges", "lanes"]);
  });

  it("provides registered actions with relevant capability guidance", () => {
    const capabilities = selectWorkspaceCapabilities("Tạo sơ đồ tư duy, thêm nhánh và kết nối hai nút.");
    const names = capabilities.flatMap((item) => item.commands);
    expect(names).toContain("create_map");
    expect(names).toContain("connect_nodes");
    expect(parseWorkspaceModelProposal(proposal({ type: "create_block", blockType: "doc", data: { markdown: "# Notes" } })).actions).toHaveLength(1);
    expect(() => parseWorkspaceModelProposal(proposal({ type: "invent_command" }))).toThrow(/command registry/);
  });

  it("accepts a nested tree draft, explicit connector and connected flowchart", () => {
    const mapAction = {
      type: "create_map",
      nodes: [{ topic: "Migration acceptance", children: [{ topic: "Content" }, { topic: "Diagram" }] }],
      layoutType: "hierarchy",
    };
    expect(parseWorkspaceModelProposal(proposal(mapAction)).actions).toHaveLength(1);
    expect(parseWorkspaceModelProposal(proposal({ type: "connect_nodes", from: "block-a", to: "block-b", label: "covers" })).actions).toHaveLength(1);
    expect(parseWorkspaceModelProposal(proposal({
      type: "create_flowchart",
      nodes: [{ id: "start", label: "Start", role: "terminator" }, { id: "finish", label: "Finish", role: "terminator" }],
      edges: [{ from: "start", to: "finish", label: "done" }],
    })).actions).toHaveLength(1);
    expect(normalizeAgentMapLayoutAction({ type: "create_map", nodes: [{ topic: "Root" }] }).layoutType).toBe("hierarchy");

    const state = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const created = applyAgentAction(state, mapAction);
    expect(created.ids).toHaveLength(3);
    const connected = applyAgentAction(state, { type: "connect_nodes", from: created.ids[1], to: created.ids[2], label: "covers" });
    expect(connected.ids).toHaveLength(1);
    expect(state.connectors[connected.ids[0]]).toMatchObject({ fromBlockId: created.ids[1], toBlockId: created.ids[2], label: "covers" });
  });

  it("rejects missing graph edges, invalid nested labels and unrelated fields", () => {
    expect(() => parseWorkspaceModelProposal(proposal({ type: "create_flowchart", nodes: [{ id: "a", label: "A" }] }))).toThrow(/requires edges/);
    expect(() => parseWorkspaceModelProposal(proposal({ type: "create_map", nodes: [{ topic: "Root", children: [{ label: "Bad child" }] }] }))).toThrow(/create_map.nodes/);
    expect(() => parseWorkspaceModelProposal(proposal({ type: "connect_nodes", from: "a", to: "b", arbitrary: true }))).toThrow(/unsupported fields/);
    expect(() => parseWorkspaceModelProposal(proposal({ type: "create_flowchart", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "missing" }] }))).toThrow(/declared nodes/);
  });
});

function runtimeInput(query: string, canMutate = true): WorkspaceRuntimeRequest {
  return {
    boardId: "board-1", turnId: "turn-1", query, modelSelector: "model", authorization: "Bearer token",
    workspaceUserToken: "user-token", canMutate, signal: new AbortController().signal,
  };
}

describe("Workspace runtime read results and confirmation", () => {
  it("returns read-only results to Dify for a viewer without treating them as saved mutations", async () => {
    const queries: string[] = [];
    const result = await runWorkspaceAgentTurn(runtimeInput("List files", false), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async ({ query }) => {
        queries.push(query);
        return queries.length === 1
          ? { answer: JSON.stringify({ done: true, message: "I found files.", actions: [{ type: "list_files" }] }), conversationId: "dify-1" }
          : { answer: JSON.stringify({ done: true, message: "There is one PDF file.", actions: [] }), conversationId: "dify-1" };
      } },
      execute: async () => ({ httpStatus: 200, body: { success: true, revision: 1, actions: [{ type: "list_files", ids: ["file-1"], changed: false }], result: { files: [{ blockId: "file-1", filename: "guide.pdf" }] } } }),
    });
    expect(result.status).toBe("completed");
    expect(result.answer).toBe("There is one PDF file.");
    expect(result.receipts[0]).toMatchObject({ actionType: "list_files", persisted: false });
    expect(queries).toHaveLength(2);
    expect(JSON.parse(queries[1]).workspaceReadResults).toEqual([{ actionType: "list_files", result: { files: [{ blockId: "file-1", filename: "guide.pdf" }] } }]);
  });

  it("requires exact user confirmation before protected board access changes", async () => {
    let calls = 0;
    const result = await runWorkspaceAgentTurn(runtimeInput("Share the board with ana@example.com as EDITOR"), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async () => ({ answer: JSON.stringify({ done: true, message: "Shared.", actions: [{ type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true }] }), conversationId: null }) },
      execute: async () => { calls += 1; return { httpStatus: 200, body: { success: true, actions: [{ type: "share_board", ids: [], changed: true }] } }; },
    });
    expect(calls).toBe(0);
    expect(result.answer).toMatch(/confirm/i);
    expect(result.receipts).toHaveLength(0);
  });

  it("preserves an exact export download URL across the read-result handoff", async () => {
    let followup: Record<string, unknown> = {};
    let round = 0;
    const result = await runWorkspaceAgentTurn(runtimeInput("Export this board as a PDF", false), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async ({ query }) => {
        round += 1;
        followup = JSON.parse(query);
        return round === 1
          ? { answer: JSON.stringify({ done: true, message: "Exported.", actions: [{ type: "export_board", format: "pdf" }] }), conversationId: null }
          : { answer: JSON.stringify({ done: true, message: "[Download PDF](https://example.com/downloads/board.pdf)", actions: [] }), conversationId: null };
      } },
      execute: async () => ({ httpStatus: 200, body: { success: true, revision: 1, actions: [{ type: "export_board", ids: [], changed: false }], result: { filename: "board.pdf", downloadUrl: "https://example.com/downloads/board.pdf" } } }),
    });
    const read = followup.workspaceReadResults as Array<{ result: Record<string, unknown> }>;
    expect(read[0].result.downloadUrl).toBe("https://example.com/downloads/board.pdf");
    expect(result.answer).toContain("https://example.com/downloads/board.pdf");
  });

  it("allows confirmation only when the user repeats the exact protected target", async () => {
    let calls = 0;
    const result = await runWorkspaceAgentTurn(runtimeInput("I confirm: share the board with ana@example.com as EDITOR."), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async () => ({ answer: JSON.stringify({ done: true, message: "Shared.", actions: [{ type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true }] }), conversationId: null }) },
      execute: async () => { calls += 1; return { httpStatus: 200, body: { success: true, actions: [{ type: "share_board", ids: [], changed: true }] } }; },
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("completed");
  });

  it("does not accept confirmation for a different recipient or an unrelated bulk-delete prompt", async () => {
    expect(workspaceActionNeedsConfirmation(
      { type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true },
      "I confirm sharing with bob@example.com as EDITOR",
    )).toBe(true);
    expect(workspaceActionNeedsConfirmation(
      { type: "delete_node", blockId: "root", confirmBulkDelete: true },
      "Yes, go ahead",
    )).toBe(true);
    expect(workspaceActionNeedsConfirmation(
      { type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true },
      "Don't proceed to share with ana@example.com as EDITOR",
    )).toBe(true);
    expect(workspaceActionNeedsConfirmation(
      { type: "delete_node", blockId: "root-123", confirmBulkDelete: true },
      "Yes, delete the selected block",
      "Selected block id: root-123",
    )).toBe(false);
  });

  it("bounds the aggregate Dify model-step request while preserving the request and block IDs", () => {
    const blocks = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`block-${index}`, {
      id: `block-${index}`, type: index < 8 ? "table" : "text", parentId: null,
      description: "D".repeat(800), data: { markdown: "T".repeat(800), rows: 50, cols: 50, cells: Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => "C".repeat(120))) },
    }]));
    const query = "Cập nhật bảng đang chọn. ".repeat(300);
    const context = "Chi tiết bảng được chọn. ".repeat(300);
    const encoded = buildModelStepQuery({ query, context, canMutate: true }, {
      revision: 1, title: "Board", blocks, blockOrder: Object.keys(blocks), connectors: {},
    }, [], []);
    expect(encoded.length).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS);
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_BYTES);
    expect(encoded).toContain(query);
    expect(JSON.parse(encoded).workspaceContext).toBe(context);
    expect(encoded).toContain("block-79");
  });

  it.each(["can't", "cannot", "won't", "shouldn't", "couldn't", "wouldn’t", "mustn't", "isn't", "haven't"])(
    "rejects confirmation containing %s", (negative) => {
      expect(workspaceActionNeedsConfirmation(
        { type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true },
        `I confirm that I ${negative} share with ana@example.com as EDITOR`,
      )).toBe(true);
    },
  );

  it("matches bulk-delete IDs as whole tokens in both the query and selected context", () => {
    const action = { type: "delete_node", blockId: "block-1", confirmBulkDelete: true };
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete block-10")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete selected blocks", '{"selectedBlockIds":["block-10"]}')).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete prefix-block-1")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete block-1-suffix")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete (block-1).")).toBe(false);
    expect(workspaceActionNeedsConfirmation(action, "Yes, delete selected blocks", '{"selectedBlockIds":["block-1"]}')).toBe(false);
    expect(workspaceActionNeedsConfirmation(
      { type: "delete_blocks", ids: ["block-1", "block-2"], confirmBulkDelete: true },
      "Yes, delete block-1 and block-20",
    )).toBe(true);
  });

  it("rejects confirmation for recipient and snapshot substrings", () => {
    const share = { type: "share_board", email: "ana@example.com", role: "EDITOR", confirm: true };
    expect(workspaceActionNeedsConfirmation(share, "I confirm sharing with banana@example.com as EDITOR")).toBe(true);
    expect(workspaceActionNeedsConfirmation(share, "I confirm sharing with ana@example.com.evil as EDITOR")).toBe(true);
    expect(workspaceActionNeedsConfirmation(share, "I confirm sharing with (ana@example.com) as EDITOR.")).toBe(false);
    expect(workspaceActionNeedsConfirmation(
      { type: "restore_version", snapshotId: "version-1", confirm: true }, "I confirm restoring version-10",
    )).toBe(true);
  });

  it("requires the exact supplied public-link expiration", () => {
    const action = { type: "set_public_link", enabled: true, expiration: "30d", confirm: true };
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link for 7d")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link for 130d")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link for 30d")).toBe(false);
    expect(workspaceActionNeedsConfirmation(
      { ...action, expiration: "2026-12-31" }, "I confirm enabling the public link until 2026-12-31",
    )).toBe(false);
  });

  it("requires disclosure of the default seven-day expiry when enabling without expiration", () => {
    const action = { type: "set_public_link", enabled: true, confirm: true };
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link")).toBe(true);
    expect(workspaceActionNeedsConfirmation(action, "I confirm enabling the public link for 17d")).toBe(true);
    for (const duration of ["7d", "7-day", "7 days", "seven days", "7 ngày"]) {
      const query = `I confirm enabling the public link for ${duration}`;
      expect(workspaceActionNeedsConfirmation(action, query)).toBe(false);
      expect(workspaceActionNeedsConfirmation({ ...action, expiration: null }, query)).toBe(false);
    }
    expect(workspaceActionNeedsConfirmation({ ...action, enabled: false }, "I confirm: disable the public link")).toBe(false);
  });

  it("binds the confirmed default expiry before the public-link executor runs", async () => {
    let executed: unknown;
    await runWorkspaceAgentTurn(runtimeInput("I confirm enabling the public link for seven days"), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async () => ({ answer: JSON.stringify({ done: true, message: "Confirmed.", actions: [{ type: "set_public_link", enabled: true, expiration: null, confirm: true }] }), conversationId: null }) },
      execute: async (_input, _turn, _round, _revision, actions) => {
        executed = actions;
        return { httpStatus: 200, body: { success: true, actions: [{ type: "set_public_link", ids: [], changed: true }] } };
      },
    });
    expect(executed).toEqual([{ type: "set_public_link", enabled: true, expiration: "7d", confirm: true }]);
  });

  it("compacts byte-only overflow without changing Unicode user input or dropping block IDs", () => {
    const blocks = Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`block-${index}`, {
      id: `block-${index}`, type: "text", description: "述".repeat(180), data: { markdown: "題".repeat(180) },
    }]));
    const snapshot = { revision: 1, title: "Board", blocks, blockOrder: Object.keys(blocks), connectors: {} };
    const query = `List files ${"界".repeat(17000)}`;
    const context = "景".repeat(500);
    const initial = JSON.parse(buildModelStepQuery({ query: "List files", canMutate: false }, snapshot, [], []));
    initial.userRequest = query;
    initial.workspaceContext = context;
    expect(JSON.stringify(initial).length).toBeLessThan(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS);
    expect(new TextEncoder().encode(JSON.stringify(initial)).byteLength).toBeGreaterThan(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_BYTES);
    const encoded = buildModelStepQuery({ query, context, canMutate: false }, snapshot, [], []);
    const payload = JSON.parse(encoded);
    expect(payload.userRequest).toBe(query);
    expect(payload.workspaceContext).toBe(context);
    expect(payload.board.blocks[0].title).toHaveLength(80);
    expect(payload.board.blocks[79].id).toBe("block-79");
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_BYTES);
  });

  it("reduces results before rejecting large optional content and preserves export links", () => {
    const snapshot = { revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} };
    const result = { actionType: "export_board", result: { text: "界".repeat(50000), downloadUrl: "https://example.com/exact-export.pdf" } };
    const encoded = buildModelStepQuery({ query: "Export board", context: "Original context", canMutate: false }, snapshot, [], [result]);
    const payload = JSON.parse(encoded);
    expect(payload.userRequest).toBe("Export board");
    expect(payload.workspaceContext).toBe("Original context");
    expect(payload.workspaceReadResults[0].result.downloadUrl).toBe(result.result.downloadUrl);
    expect(encoded.length).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_CHARS);
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(WORKSPACE_RUNTIME_MODEL_QUERY_MAX_BYTES);
  });

  it("uses the minimum safe contract when capability metadata does not fit", () => {
    const snapshot = { revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} };
    const query = "Task";
    const context = "x".repeat(63600);
    const payload = JSON.parse(buildModelStepQuery({ query, context, canMutate: true }, snapshot, [], []));
    expect(payload.userRequest).toBe(query);
    expect(payload.workspaceContext).toBe(context);
    expect(payload.outputLanguage).toBe("the exact language used in the user's request");
    expect(payload.instruction).toContain('"actions":[]');
    expect(payload.instruction).toContain("untrusted");
    expect(payload.workspaceCapabilities).toBeUndefined();
  });

  it.each(["x".repeat(64000), "界".repeat(43000)])("fails closed when required inputs cannot fit", (context) => {
    expect(() => buildModelStepQuery({ query: "Task", context, canMutate: false }, {
      revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {},
    }, [], [])).toThrow(/required inputs exceed/);
  });
});
