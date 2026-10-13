import { describe, expect, it } from "vitest";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { WORKSPACE_RUNTIME_ACTION_SCHEMAS } from "@/lib/workspace-agent/actionSchema";
import { buildModelStepQuery } from "@/lib/workspace-agent/modelStepContext";
import { summarizeRuntimeDoc } from "@/lib/workspace-agent/boardRichContentSummary";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";

const OUTLINE_ID = "7c044b6f-5365-4360-8817-84455f354317";
const DOC_ID = "7c07cd2f-fe4e-4858-9647-f59b7082ddd1";
const TOKEN = "AI_HISTORY_REDO_STAGING_20261006_B";
const proposed = (action: Record<string, unknown>) => JSON.stringify({ done: true, message: "Proposed edit.", actions: [action] });
function snapshot() {
  return {
    revision: 1, title: "Board", blockOrder: [OUTLINE_ID, DOC_ID], connectors: {},
    blocks: {
      [OUTLINE_ID]: { id: OUTLINE_ID, type: "text", data: { markdown: "Content" } },
      [DOC_ID]: { id: DOC_ID, type: "doc", data: { html: '<h1 data-line-id="heading">Staging acceptance</h1><p data-line-id="body">Map batch passed.</p>' } },
    },
  };
}

describe("runtime rich-content command contract", () => {
  it("requires an exact target and meaningful content before dispatch", () => {
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.update_rich_text.required).toEqual(["type", "blockId"]);
    expect(WORKSPACE_RUNTIME_ACTION_SCHEMAS.update_rich_text.anyOf).toContainEqual({ required: ["markdown"] });
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", markdown: TOKEN }))).toThrow(/requires blockId/);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID }))).toThrow(/requires html\/markdown\/content/);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, richText: {} }))).toThrow(/requires html\/markdown\/content/);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, query: "Content", marks: { bold: false } }))).toThrow(/requires html\/markdown\/content/);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, markdown: { text: TOKEN } }))).toThrow(/markdown.*schema/);
  });

  it("rejects the exact wrong-type staging proposal without touching the outline", () => {
    const board = snapshot();
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: OUTLINE_ID, markdown: TOKEN }), board)).toThrow(/doc or shape blockId/);
    expect(board.blocks[OUTLINE_ID].data.markdown).toBe("Content");
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: "missing", markdown: TOKEN }), board)).toThrow(/existing block/);
  });

  it("writes the corrected doc proposal through the shared executor and survives JSON reload", () => {
    const board = snapshot();
    const { actions } = parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, markdown: TOKEN }), board);
    expect(applyAgentAction(board, actions[0]).ids).toEqual([DOC_ID]);
    const reloaded = JSON.parse(JSON.stringify(board));
    expect(reloaded.blocks[DOC_ID].data.html).toBe(`<p>${TOKEN}</p>`);
    expect(reloaded.blocks[OUTLINE_ID].data.markdown).toBe("Content");
  });

  it("aligns update_node with the existing doc executor and retains ordinary node titles", () => {
    for (const field of ["markdown", "html", "text"]) {
      const board = snapshot();
      const { actions } = parseWorkspaceModelProposal(proposed({ type: "update_node", blockId: DOC_ID, [field]: "Updated document" }), board);
      expect(applyAgentAction(board, actions[0]).ids).toEqual([DOC_ID]);
      expect(board.blocks[DOC_ID].data.html).toBe("<p>Updated document</p>");
    }
    const board = snapshot();
    const { actions } = parseWorkspaceModelProposal(proposed({ type: "update_node", blockId: OUTLINE_ID, title: "Outline title" }), board);
    expect(applyAgentAction(board, actions[0]).ids).toEqual([OUTLINE_ID]);
    expect(board.blocks[OUTLINE_ID].data.markdown).toBe("Outline title");
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_node", blockId: OUTLINE_ID, markdown: TOKEN }), board)).toThrow(/doc blockId/);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_node", blockId: DOC_ID }))).toThrow(/requires a title/);
  });

  it("retains structured edits, replacement deletion, marks, and intentional document clearing", () => {
    const board = snapshot();
    for (const payload of [
      { richText: { markdown: "# Added", mode: "append" } },
      { query: "Map", replacement: "" },
      { query: "Map", marks: { bold: true } },
      { query: "Map", marks: { link: "mailto:a@example.com" } },
      { markdown: "" },
    ]) expect(parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, ...payload }), board).actions).toHaveLength(1);
    expect(() => parseWorkspaceModelProposal(proposed({ type: "update_rich_text", blockId: DOC_ID, query: "Map", marks: { link: "javascript:alert(1)" } }), board)).toThrow(/marks.*schema/);
  });

  it("gives the Dify planner typed doc text and line IDs alongside the similarly named outline", () => {
    const payload = JSON.parse(buildModelStepQuery({ query: "Edit the Content document", context: "Content text node", canMutate: true }, snapshot(), [], []));
    const outline = payload.board.blocks.find((block: { id: string }) => block.id === OUTLINE_ID);
    const doc = payload.board.blocks.find((block: { id: string }) => block.id === DOC_ID);
    expect(outline).toMatchObject({ type: "text", title: "Content" });
    expect(doc).toMatchObject({ type: "doc", docText: "Staging acceptance\nMap batch passed.", docTextTruncated: false });
    expect(doc.docLines).toEqual([{ lineId: "heading", text: "Staging acceptance" }, { lineId: "body", text: "Map batch passed." }]);
    expect(payload.instruction).toContain("a text outline node named Content is not a document");
    expect(payload.actionSchemas.update_rich_text.required).toContain("blockId");
  });

  it("bounds document reads and marks incomplete content as truncated", () => {
    const summary = summarizeRuntimeDoc({ html: `<p>${"x".repeat(22000)}</p>` });
    expect(String(summary.docText).length).toBeLessThanOrEqual(1200);
    expect(summary.docTextTruncated).toBe(true);
  });

  it("blocks a wrong-type model proposal before making any executor call", async () => {
    let called = false;
    const result = await runWorkspaceAgentTurn({
      boardId: "board", turnId: "turn", query: "Edit the document", modelSelector: "model",
      authorization: "Bearer token", workspaceUserToken: "user", canMutate: true, signal: new AbortController().signal,
    }, {
      readSnapshot: async () => snapshot(),
      modelProvider: { propose: async () => ({ answer: proposed({ type: "update_rich_text", blockId: OUTLINE_ID, markdown: TOKEN }), conversationId: "dify" }) },
      execute: async () => { called = true; throw new Error("Unexpected executor call"); },
    });
    expect(called).toBe(false);
    expect(result.receipts).toEqual([]);
    expect(result.status).toBe("failed");
  });
});
