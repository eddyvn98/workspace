// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildWorkspaceSendPrompt } from "@/app/workspace/hooks/workspaceChatDifySend";
import { computeAssistantTurnResult } from "@/app/workspace/hooks/workspaceChatTurnResult";
import type { RemoteBoard } from "@/app/workspace/hooks/workspaceBoardApi";
import { formatSelectedBlocksContext } from "@/app/workspace/utils/workspaceChatContext";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { deriveBoardChangeFeedback, hasNewerDifyBoardRevision, hasUnpersistedMutationClaim } from "@/app/workspace/utils/workspaceDifyAgentResponse";
import {
  DEEPSEEK_FLASH_MODEL_ID,
  WORKSPACE_DIFY_COMPACT_MODEL_IDS,
  WORKSPACE_DIFY_MODEL_SELECTORS,
  WORKSPACE_DIFY_VISIBLE_MODEL_IDS,
} from "@/lib/ai-model-catalog";
import { resolveWorkspaceDifyModelSelector } from "@/app/workspace/utils/workspaceChatRequest";

function board(blockOrder: string[]): RemoteBoard {
  return {
    id: "board",
    title: "Parity test",
    updatedAt: "2026-01-01T00:00:00.000Z",
    blocks: {
      a: { id: "a", data: { markdown: "A" } },
      b: { id: "b", data: { markdown: "B" } },
    },
    blockOrder,
    connectors: {},
    camera: {},
  };
}

describe("Dify board mutation verification", () => {
  it("recognizes a block-order-only mutation as persisted", () => {
    const feedback = deriveBoardChangeFeedback(board(["a", "b"]), board(["b", "a"]));

    expect(feedback.appliedSummaries).toEqual(["Updated block order"]);
    expect(feedback.focusBlockIds).toEqual(["b", "a"]);
  });

  it("does not report an unchanged block order as a mutation", () => {
    expect(deriveBoardChangeFeedback(board(["a", "b"]), board(["a", "b"]))).toEqual({
      focusBlockIds: [],
      appliedSummaries: [],
    });
  });

  it("does not count timestamp-only block updates as persisted canvas changes", () => {
    const before = board(["a", "b"]);
    const after = board(["a", "b"]);
    after.blocks.a = { ...after.blocks.a, updatedAt: 200, lastEditedBy: "agent@example.com" };

    expect(deriveBoardChangeFeedback(before, after)).toEqual({
      focusBlockIds: [],
      appliedSummaries: [],
    });
  });

  it("does not adopt an unchanged server revision over pending local edits", () => {
    const before = { ...board(["a", "b"]), revision: 12 };
    const unchanged = { ...board(["a", "b"]), revision: 12 };
    const changed = { ...board(["a", "b"]), revision: 13 };

    expect(hasNewerDifyBoardRevision(before, unchanged)).toBe(false);
    expect(hasNewerDifyBoardRevision(before, changed)).toBe(true);
  });

  it("does not let an unchanged AI revision overwrite local table cell edits", () => {
    // Traced Workspace AI table bug: a local edit to a table cell (made while
    // the AI turn was in flight) must survive if the server board the Dify
    // turn reports back carries the same revision it started from — that
    // means the turn did not persist anything, so the local table state is
    // still the newest one and must not be clobbered.
    const before = {
      ...board(["a", "b"]),
      blocks: { table: { id: "table", type: "table", data: { rows: 2, cols: 2, cells: [["A1", "B1"], ["A2", "B2"]] } } },
      blockOrder: ["table"],
      revision: 5,
    };
    const staleAfter = { ...before, revision: 5 };

    expect(hasNewerDifyBoardRevision(before, staleAfter)).toBe(false);
  });

  it("still recognizes a persisted frame update as a real board change", () => {
    const before = { ...board(["a", "b"]), frames: [{ id: "frame", name: "Original", order: 0 }] };
    const after = { ...board(["a", "b"]), frames: [{ id: "frame", name: "Renamed", order: 0 }], revision: 2 };

    expect(deriveBoardChangeFeedback(before, after).appliedSummaries).toContain("Updated presentation frames");
  });

  it("rejects a plain success claim when only block timestamps changed", () => {
    const before = board(["a", "b"]);
    const after = board(["a", "b"]);
    after.blocks.a = { ...after.blocks.a, updatedAt: 200 };
    const feedback = deriveBoardChangeFeedback(before, after);

    expect(hasUnpersistedMutationClaim(
      { content: "Đã đổi cỡ chữ block từ 26 lên 30." },
      "Đổi cỡ chữ block lên 30.",
      feedback.appliedSummaries.length > 0,
    )).toBe(true);
  });

  it("catches verify-and-set success wording for an unchanged block", () => {
    expect(hasUnpersistedMutationClaim(
      { content: "Đã xác minh và xử lý xong block test; board lưu fontSize = 26 — thành công." },
      "Hãy xác minh và đặt fontSize của block về đúng 26.",
      false,
    )).toBe(true);
  });

  it("keeps unresolved sub-steps visible when another part of the board changed", () => {
    const before = board(["a", "b"]);
    const after = board(["a", "b"]);
    after.blocks.a = { ...after.blocks.a, data: { markdown: "Renamed" } };
    after.revision = 2;
    const result = computeAssistantTurnResult({
      boardBefore: before,
      boardAfter: after,
      localBlocksBefore: {},
      localBlocksAfter: {},
      localConnectorsBefore: {},
      localConnectorsAfter: {},
      parsedDifyAnswer: {
        content: "Đã hoàn tất mọi thay đổi.",
        appliedSummaries: ["Đổi tên node"],
        unresolvedSummaries: ["Chưa gắn nhãn Handoff cho connector."],
      },
      userRequest: "Đổi tên node và gắn nhãn Handoff cho connector.",
      actionResult: null,
      invalidActionResponse: false,
    });

    expect(result.content).toContain("Only part of the requested canvas change is confirmed");
    expect(result.content).toContain("Chưa gắn nhãn Handoff");
    expect(result.unresolvedSummaries).toEqual(["Chưa gắn nhãn Handoff cho connector."]);
  });

  it("reports a net-zero multi-step turn without claiming that nothing persisted", () => {
    const before = { ...board(["a", "b"]), revision: 61 };
    const after = { ...board(["a", "b"]), revision: 65 };
    const result = computeAssistantTurnResult({
      boardBefore: before,
      boardAfter: after,
      localBlocksBefore: {},
      localBlocksAfter: {},
      localConnectorsBefore: {},
      localConnectorsAfter: {},
      parsedDifyAnswer: {
        content: "Đã hoàn tất 3 bước: chèn hàng, điền giá trị và xóa hàng thử nghiệm.",
        appliedSummaries: ["Chèn hàng thử nghiệm", "Điền hàng thử nghiệm", "Xóa hàng thử nghiệm"],
      },
      userRequest: "Chèn hàng tạm, điền giá trị rồi xóa hàng đó.",
      actionResult: null,
      invalidActionResponse: false,
    });

    expect(result.content).toContain("Đã hoàn tất 3 bước");
    expect(result.content).toContain("revision 61 → 65");
    expect(result.content).toContain("there is no net content change");
    expect(result.content).toContain("does not confirm each individual step");
    expect(result.claimedMutationWithoutPersistence).toBe(false);
    expect(result.appliedSummaries).toEqual([]);
  });

  it("does not show a generic filtered answer as full success after a persisted change", () => {
    const before = board(["a", "b"]);
    const after = board(["a", "b"]);
    after.blocks.a = { ...after.blocks.a, data: { markdown: "Changed" } };
    const result = computeAssistantTurnResult({
      boardBefore: before,
      boardAfter: after,
      localBlocksBefore: {},
      localBlocksAfter: {},
      localConnectorsBefore: {},
      localConnectorsAfter: {},
      parsedDifyAnswer: { content: "Current canvas: - internal workspace state" },
      userRequest: "Rename the node and connect it to another node.",
      actionResult: null,
      invalidActionResponse: false,
    });

    expect(result.content).toContain("Only part of the requested canvas change is confirmed");
    expect(result.unresolvedSummaries?.[0]).toContain("could not confirm every requested change");
  });
});

describe("selected block spatial context", () => {
  it("sends coordinates for duplicate labels and says position outranks selection", () => {
    const duplicate = (id: string, y: number) => ({
      id,
      type: "shape",
      transform: { computed: null, override: { x: 80, y, w: 160, h: 80, rotation: 0, zIndex: 0 } },
      data: { shapeKind: "rectangle", label: "Kiểm thử" },
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as CanvasBlock;
    const upper = duplicate("upper-id", 20);
    const lower = duplicate("lower-id", 140);
    const context = formatSelectedBlocksContext(["lower-id"], {
      "upper-id": upper,
      "lower-id": lower,
    }).contextPrompt;

    expect(context).toContain("upper-id at x=80, y=20");
    expect(context).toContain("lower-id at x=80, y=140");
    expect(context).toContain("smaller y is higher");
    expect(context).toContain("selection alone must not override a conflicting spatial constraint");
  });
});

describe("Dify Workspace tool prompt", () => {
  it("keeps personal DeepSeek local and out of the server model choices", () => {
    expect(WORKSPACE_DIFY_COMPACT_MODEL_IDS).not.toContain(DEEPSEEK_FLASH_MODEL_ID);
    expect(WORKSPACE_DIFY_MODEL_SELECTORS).not.toContain("deepseek-v4-flash");
    expect(WORKSPACE_DIFY_MODEL_SELECTORS).toHaveLength(10);
    expect(WORKSPACE_DIFY_MODEL_SELECTORS).toContain("qwen/qwen3.6-flash");
    expect(WORKSPACE_DIFY_MODEL_SELECTORS).toContain("qwen/qwen3.6-plus");
    expect(WORKSPACE_DIFY_COMPACT_MODEL_IDS).not.toContain("glm-5.2");
    expect(WORKSPACE_DIFY_MODEL_SELECTORS).toContain("openai/gpt-5.6-luna");
    expect(WORKSPACE_DIFY_VISIBLE_MODEL_IDS).toContain(DEEPSEEK_FLASH_MODEL_ID);
    expect(resolveWorkspaceDifyModelSelector(DEEPSEEK_FLASH_MODEL_ID)).toBe("deepseek-v4-flash");
    expect(resolveWorkspaceDifyModelSelector("qwen-flash")).toBe("qwen/qwen3.6-flash");
    expect(resolveWorkspaceDifyModelSelector("qwen-plus")).toBe("qwen/qwen3.6-plus");
  });

  it("routes canvas edits through Dify tools instead of the legacy action envelope", () => {
    const prompt = buildWorkspaceSendPrompt({
      userDisplayContent: "Đổi tên slide thứ hai trong bộ slide X.",
      selectionPrompt: "",
    });

    expect(prompt).toContain("use the available Workspace action tools");
    expect(prompt).not.toContain("ACTION shapes:");
    expect(prompt).not.toContain("rename_topic");
  });

  it("does not add mutation-tool instructions to read-only questions", () => {
    const prompt = buildWorkspaceSendPrompt({
      userDisplayContent: "Đọc giúp nội dung của slide thứ hai.",
      selectionPrompt: "",
    });

    expect(prompt).not.toContain("For canvas changes, use the available Workspace action tools");
  });
});
