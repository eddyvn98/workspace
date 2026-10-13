import { beforeEach, describe, expect, it, vi } from "vitest";

const listResources = vi.fn();
const getResourceContent = vi.fn();
const getResourceArtifactContent = vi.fn();
const getPdfPageCount = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/workspace/resource-repository", () => ({
  listResources: (...a: unknown[]) => listResources(...a),
  getResourceContent: (...a: unknown[]) => getResourceContent(...a),
  getResourceArtifactContent: (...a: unknown[]) => getResourceArtifactContent(...a),
}));
vi.mock("@/app/api/workspaces/[id]/agent/pdfPageCount", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), getPdfPageCount: (...a: unknown[]) => getPdfPageCount(...a) }));

import { enrichFileActions, handleFileReadActions } from "@/app/api/workspaces/[id]/agent/fileAction";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import type { AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

const pdfBlock = { id: "f1", type: "file", data: { resourceId: "r1", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: "10", range: { page: 2 } } };
const docxBlock = { id: "f2", type: "file", data: { resourceId: "r2", filename: "a.docx", mimeType: "application/vnd.x", sizeBytes: "5" } };
const board = { id: "b1", revision: 4, blocks: [pdfBlock, docxBlock, { id: "t1", type: "text", data: { markdown: "x" } }] };
const resource = (id: string, mimeType: string) => ({
  id, kind: "DOCUMENT", filename: `${id}.f`, mimeType,
  latestVersion: { id: `v-${id}`, sizeBytes: "99", previewArtifact: null },
});

function state(): AgentBoardState {
  return { blocks: { f1: structuredClone(pdfBlock), f2: structuredClone(docxBlock) }, blockOrder: ["f1", "f2"], connectors: {}, title: "t" } as unknown as AgentBoardState;
}

describe("agent file commands", () => {
  beforeEach(() => {
    listResources.mockReset().mockResolvedValue([resource("r1", "application/pdf"), resource("r2", "text/plain")]);
    getResourceContent.mockReset().mockResolvedValue({ buffer: Buffer.from("x"), mimeType: "application/pdf", filename: "a.pdf" });
    getResourceArtifactContent.mockReset().mockResolvedValue(null);
    getPdfPageCount.mockReset().mockResolvedValue(5);
  });

  it("list_files returns file blocks and resources without a revision change", async () => {
    expect(await handleFileReadActions(board, "u@x.com", [{ type: "update_style" }])).toBeNull();
    const res = await handleFileReadActions(board, "u@x.com", [{ type: "list_files" }]);
    const json = await res!.json();
    expect(json.revision).toBe(4);
    expect(json.result.files).toEqual([
      { blockId: "f1", resourceId: "r1", filename: "a.pdf", mimeType: "application/pdf", pageCount: 5, pinnedPage: 2 },
      { blockId: "f2", resourceId: "r2", filename: "a.docx", mimeType: "application/vnd.x", pageCount: null, pinnedPage: 1 },
    ]);
    expect(json.result.resources).toHaveLength(2);
  });

  it("refuses list_files mixed with board edits", async () => {
    const res = await handleFileReadActions(board, "u@x.com", [{ type: "list_files" }, { type: "update_style" }]);
    expect(res!.status).toBe(400);
    expect((await res!.json()).reason).toBe("mixed_batch");
  });

  it("add_file_block creates a file block from an owned resource", async () => {
    const enriched = await enrichFileActions(board, "u@x.com", [{ type: "add_file_block", resourceId: "r1", x: 500, y: 40, page: 3 }]);
    expect(Array.isArray(enriched)).toBe(true);
    const st = state();
    const result = applyAgentAction(st, (enriched as Record<string, unknown>[])[0]);
    expect(result.ids).toHaveLength(1);
    const block = st.blocks[result.ids[0]] as Record<string, any>;
    expect(block.type).toBe("file");
    expect(block.data).toMatchObject({ resourceId: "r1", mimeType: "application/pdf", sizeBytes: "99", versionId: "v-r1", range: { page: 3 } });
    expect(block.transform.override).toMatchObject({ w: 320, h: 400 });
    expect(st.blockOrder).toContain(result.ids[0]);
  });

  it("refuses a specific page for add_file_block when the page count cannot be read", async () => {
    getPdfPageCount.mockResolvedValue(null);
    const res = await enrichFileActions(board, "u@x.com", [{ type: "add_file_block", resourceId: "r1", page: 2 }]) as Response;
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toBe("page_count_unavailable");
  });

  it("rejects a foreign resourceId and an unenriched add", async () => {
    const res = await enrichFileActions(board, "u@x.com", [{ type: "add_file_block", resourceId: "other" }]);
    expect((res as Response).status).toBe(422);
    expect((await (res as Response).json()).reason).toBe("resource_not_found");
    expect(applyAgentAction(state(), { type: "add_file_block", resourceId: "r1" }).ids).toEqual([]);
  });

  it("pin_pdf_page sets range.page within bounds", async () => {
    const enriched = await enrichFileActions(board, "u@x.com", [{ type: "pin_pdf_page", blockId: "f1", page: 4 }]) as Record<string, unknown>[];
    const st = state();
    expect(applyAgentAction(st, enriched[0]).ids).toEqual(["f1"]);
    expect((st.blocks.f1.data as Record<string, unknown>).range).toEqual({ page: 4 });
  });

  it.each([[0], [6], [1.5]])("rejects page %s", async (page) => {
    const res = await enrichFileActions(board, "u@x.com", [{ type: "pin_pdf_page", blockId: "f1", page }]) as Response;
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toBe("page_out_of_range");
  });

  it("rejects non-PDF files and non-file blocks", async () => {
    const nonPdf = await enrichFileActions(board, "u@x.com", [{ type: "pin_pdf_page", blockId: "f2", page: 1 }]) as Response;
    expect((await nonPdf.json()).reason).toBe("not_pdf");
    const text = await enrichFileActions(board, "u@x.com", [{ type: "pin_pdf_page", blockId: "t1", page: 1 }]) as Response;
    expect((await text.json()).reason).toBe("not_file_block");
    const missing = await enrichFileActions(board, "u@x.com", [{ type: "pin_pdf_page", blockId: "zz", page: 1 }]) as Response;
    expect((await missing.json()).reason).toBe("block_not_found");
  });

  it("apply refuses a forged pin without verified page count", () => {
    expect(applyAgentAction(state(), { type: "pin_pdf_page", blockId: "f1", page: 2 }).ids).toEqual([]);
    expect(applyAgentAction(state(), { type: "pin_pdf_page", blockId: "f2", page: 1, verifiedPageCount: 3 }).ids).toEqual([]);
  });
});

describe("file action proposal schemas", () => {
  const proposal = (action: Record<string, unknown>) => JSON.stringify({
    done: false, message: "Applying the requested change.", actions: [action],
  });

  it.each([
    { type: "list_files" },
    { type: "add_file_block", resourceId: "resource-1", x: 20, y: 40, page: 2 },
    { type: "pin_pdf_page", blockId: "file-1", page: 2 },
  ])("accepts valid $type proposal", (action) => {
    expect(parseWorkspaceModelProposal(proposal(action)).actions).toEqual([action]);
  });

  it.each([
    [{ type: "add_file_block", x: 20 }, /resourceId/],
    [{ type: "pin_pdf_page", blockId: "file-1", page: 1.5 }, /page/],
    [{ type: "list_files", resourceId: "unexpected" }, /unsupported fields/],
  ])("rejects invalid file action proposal", (action, issue) => {
    expect(() => parseWorkspaceModelProposal(proposal(action))).toThrow(issue);
  });
});
