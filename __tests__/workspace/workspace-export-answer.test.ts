import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWorkspaceExportAnswer } from "@/app/workspace/utils/workspaceExportAnswer";
import { hasUnpersistedMutationClaim, parseDifyAgentAnswer } from "@/app/workspace/utils/workspaceDifyAgentResponse";
import { computeAssistantTurnResult } from "@/app/workspace/hooks/workspaceChatTurnResult";
import { safeWorkspaceAssistantContent } from "@/app/workspace/utils/workspaceChatVisibleContent";

const answer = { content: "Đã tạo file", appliedSummaries: ["Exported board"] };
const request = "Xuất workspace hiện tại thành JSON có cả các frame và ghi chú trình chiếu. Hãy tạo đường dẫn tải file thật.";
afterEach(() => vi.unstubAllGlobals());

describe("verified workspace export responses", () => {
  it("verifies a named deck export without converting it to a whole-board export", async () => {
    const url = '/api/workspaces/my-board/export?format=pptx&blockIds=%5B%22deck%22%5D';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { headers: { "content-disposition": "attachment; filename=workspace.pptx" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await verifyWorkspaceExportAnswer({ ...answer, content: `[Download PowerPoint](${url})` }, 'Xuất riêng bộ slide thành PowerPoint, chỉ bộ slide này. Không chỉnh sửa nội dung.', "my-board");
    expect(result.verifiedReadOnlyResult).toBe(true); expect(result.content).toContain(url);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD" }));
  });
  it.each([
    '/api/workspaces/other-board/export?format=pptx&blockIds=%5B%22deck%22%5D',
    'https://external.test/api/workspaces/my-board/export?format=pptx&blockIds=%5B%22deck%22%5D',
    '/api/workspaces/my-board/export?format=pptx',
    '/api/workspaces/my-board/export?format=pptx&blockIds=invalid',
  ])("does not verify an unsafe or unscoped selection link: %s", async (url) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const parsed = { ...answer, content: `[Download](${url})` };
    expect(await verifyWorkspaceExportAnswer(parsed, 'Xuất riêng bộ slide trong workspace thành pptx', "my-board")).toBe(parsed);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["PDF", "PowerPoint"])('verifies a whole-board %s download', async (format) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { headers: { "content-disposition": "attachment; filename=workspace.pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await verifyWorkspaceExportAnswer(answer, `Export board to ${format}`, "my-board");
    expect(result.verifiedReadOnlyResult).toBe(true);
    expect(result.content).toContain(`format=${format === "PDF" ? "pdf" : "pptx"}`);
  });
  it("verifies an editable PowerPoint request without mistaking file editability for a board edit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { headers: { "content-disposition": "attachment; filename=workspace.pptx" } }));
    vi.stubGlobal("fetch", fetchMock);
    const prompt = "Xuất board này thành file PowerPoint có thể chỉnh sửa và đưa cho tôi liên kết tải trực tiếp.";
    const result = await verifyWorkspaceExportAnswer(answer, prompt, "my-board");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/my-board/export?format=pptx", expect.objectContaining({ method: "HEAD" }));
    expect(result.content).toContain("[Tải PowerPoint](/api/workspaces/my-board/export?format=pptx)");
    expect(result.verifiedReadOnlyResult).toBe(true);
  });
  it("still preserves verification safeguards for a real edit requested alongside export", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const prompt = "Xuất board này thành file PowerPoint có thể chỉnh sửa, sau đó đổi tên board.";
    expect(await verifyWorkspaceExportAnswer(answer, prompt, "my-board")).toBe(answer);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps UUIDs inside download targets while hiding internal IDs in prose", () => {
    const id = "4128cabc-7a25-4e45-bec4-6395c60df68f";
    const link = `[Download JSON](/api/workspaces/${id}/export?format=json)`;
    const external = `[Open board](https://example.com/workspace?id=${id})`;
    expect(safeWorkspaceAssistantContent(`Internal ${id}. ${link} ${external}`)).toBe(`Internal . ${link} ${external}`);
  });
  it("hides internal file IDs without leaving empty metadata labels", () => {
    const answer = 'PDF: blockId: 89c1b88b-dbb1-4aed-a449-c042c9416bdf, resourceId: 91c765c1-db6f-4a69-ad53-9361d9749831, filename: acceptance.pdf, pageCount: 2, pinnedPage: 2.';
    const visible = safeWorkspaceAssistantContent(answer);
    expect(visible).toContain("filename: acceptance.pdf");
    expect(visible).toContain("pageCount: 2");
    expect(visible).toContain("pinnedPage: 2");
    expect(visible).not.toMatch(/(?:blockId|resourceId)\s*:/i);
    expect(visible).not.toContain("89c1b88b-dbb1-4aed-a449-c042c9416bdf");
  });
  it("preserves file-list JSON while hiding its internal UUID fields", () => {
    const answer = '[{"blockId":"89c1b88b-dbb1-4aed-a449-c042c9416bdf","resourceId":"91c765c1-db6f-4a69-ad53-9361d9749831","filename":"TEST - Workspace full migration acceptance 2026-10-05.pdf","pageCount":2,"pinnedPage":2}]';
    const visible = safeWorkspaceAssistantContent(answer);
    expect(visible).not.toBe("I couldn't produce a safe response. Please try again.");
    expect(visible).toContain("TEST - Workspace full migration acceptance 2026-10-05.pdf");
    expect(visible).toContain('"pageCount":2');
    expect(visible).toContain('"pinnedPage":2');
    expect(visible).not.toContain("89c1b88b-dbb1-4aed-a449-c042c9416bdf");
    expect(visible).not.toContain("91c765c1-db6f-4a69-ad53-9361d9749831");
  });
  it("verifies an authenticated attachment without requiring a board mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { headers: { "content-disposition": "attachment; filename=workspace.json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await verifyWorkspaceExportAnswer(answer, request, "my-board");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/my-board/export?format=json", expect.objectContaining({ method: "HEAD", credentials: "same-origin" }));
    expect(result.content).toContain("[Tải JSON](/api/workspaces/my-board/export?format=json)");
    expect(hasUnpersistedMutationClaim(result, request, false)).toBe(false);
    const turn = computeAssistantTurnResult({
      boardBefore: null, boardAfter: null, localBlocksBefore: {}, localBlocksAfter: {}, localConnectorsBefore: {}, localConnectorsAfter: {},
      parsedDifyAnswer: result, userRequest: request, invalidActionResponse: true,
      actionResult: { displayContent: "Provider claim", appliedBlockIds: [], appliedActionCount: 1 },
    });
    expect(turn.content).toBe(result.content);
    expect(turn.claimedMutationWithoutPersistence).toBe(false);
    expect(turn.appliedSummaries).toEqual([]);
  });

  it.each([403, 404, 500])("keeps mutation checks when the export endpoint returns %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await verifyWorkspaceExportAnswer(answer, request, "my-board")).toBe(answer);
    expect(hasUnpersistedMutationClaim(answer, request, false)).toBe(true);
  });

  it("rejects an ordinary JSON response and transport failures as artifact proof", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyWorkspaceExportAnswer(answer, request, "my-board")).toBe(answer);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await verifyWorkspaceExportAnswer(answer, request, "my-board")).toBe(answer);
  });

  it.each([
    "Xuất workspace JSON rồi xóa bảng dữ liệu",
    "Export board to JSON and create a table",
    "Xuất các khối đã chọn trong workspace thành JSON",
    "Xuất riêng bộ slide trong workspace thành PPTX",
    "Xuất workspace thành JSON và Markdown",
  ])("does not treat mixed or partial requests as a whole-board download: %s", async (query) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await verifyWorkspaceExportAnswer(answer, query, "my-board")).toBe(answer);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not trust a verification flag supplied by the model", () => {
    const parsed = parseDifyAgentAnswer(JSON.stringify({ answer: "Created a table", verifiedReadOnlyResult: true, appliedSummaries: ["Created table"] }));
    expect(parsed.verifiedReadOnlyResult).toBeUndefined();
    expect(hasUnpersistedMutationClaim(parsed, "Create a table", false)).toBe(true);
  });
});
