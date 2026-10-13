import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

const request: WorkspaceRuntimeRequest = {
  boardId: "board-1",
  turnId: "turn-1",
  query: "Đổi D7 rồi ghi vào sheet không tồn tại; báo rõ kết quả từng thao tác.",
  modelSelector: "openai/gpt-5.6-luna",
  authorization: "Bearer service-key",
  workspaceUserToken: "signed-token",
  canMutate: true,
  signal: new AbortController().signal,
};

describe("Workspace runtime batch failures", () => {
  it("reports that an invalid atomic batch saved nothing and names the rejected actions", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          done: false,
          message: "Try both operations in order.",
          actions: [
            { type: "update_table_cell", blockId: "table-1", sheetName: "Sheet1", row: 6, column: 3, text: "probe" },
            { type: "paste_table_range", blockId: "table-1", sheetName: "Missing", row: 0, column: 0, values: [["probe"]] },
          ],
        }),
        conversationId: "dify-conversation",
      }),
    };
    const readSnapshot = vi.fn(async () => ({
      revision: 1,
      title: "Board",
      blocks: { "table-1": { id: "table-1", type: "table", data: { rows: 7, cols: 4, mode: "spreadsheet", sheets: [{ id: "sheet-1", name: "Sheet1", data: [["A"]] }] } } },
      blockOrder: ["table-1"],
      connectors: {},
    }));
    const execute = vi.fn(async () => ({
      httpStatus: 422,
      body: {
        success: false,
        revision: 1,
        error: "Workspace action(s) could not be applied: paste_table_range. No target matched or a parameter was missing.",
        actions: [
          { type: "update_table_cell", ids: [], changed: false },
          { type: "paste_table_range", ids: [], changed: false },
        ],
      },
    }));

    const result = await runWorkspaceAgentTurn(request, { modelProvider, readSnapshot, execute });

    expect(result.status).toBe("partial");
    expect(result.receipts.map((receipt) => receipt.persisted)).toEqual([false, false]);
    expect(result.answer).toContain("Không có thao tác nào được lưu");
    expect(result.answer).toContain("dán vùng dữ liệu thất bại");
    expect(result.answer).toContain("sửa ô");
    expect(result.answer).not.toContain("đã được lưu");
  });

  it("returns promptly when cancellation arrives during a pending read-only snapshot", async () => {
    const controller = new AbortController();
    let markSnapshotReadStarted: () => void = () => undefined;
    const snapshotReadStarted = new Promise<void>((resolve) => { markSnapshotReadStarted = resolve; });
    const readSnapshot = vi.fn(() => {
      markSnapshotReadStarted();
      return new Promise<never>(() => undefined);
    });
    const modelProvider = { propose: vi.fn() };
    const turn = runWorkspaceAgentTurn({ ...request, signal: controller.signal }, { readSnapshot, modelProvider });

    await snapshotReadStarted;
    controller.abort(new Error("cancelled by test"));
    const result = await turn;

    expect(result.status).toBe("partial");
    expect(result.receipts).toEqual([]);
    expect(result.unresolvedSummaries).toContain("The turn was cancelled; no further actions were run. Check confirmed receipts before retrying.");
    expect(modelProvider.propose).not.toHaveBeenCalled();
  });
});
