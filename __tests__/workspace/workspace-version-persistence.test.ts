import { describe, expect, it } from "vitest";
import {
  findPersistedVersionSnapshot,
  isVersionSnapshotRequest,
  versionSnapshotAppliedSummary,
} from "@/app/workspace/hooks/workspaceVersionPersistence";
import type { WorkspaceSnapshotSummary } from "@/app/workspace/hooks/workspaceVersionApi";
import { computeAssistantTurnResult } from "@/app/workspace/hooks/workspaceChatTurnResult";

const existing: WorkspaceSnapshotSummary = {
  id: "old", boardId: "board", label: null, createdBy: "user@example.com", createdAt: "2026-10-07T00:00:00Z",
};
const created: WorkspaceSnapshotSummary = {
  id: "new", boardId: "board", label: "Review checkpoint", createdBy: "user@example.com", createdAt: "2026-10-07T00:01:00Z",
};

describe("workspace version persistence verification", () => {
  it("detects explicit version creation requests in English and Vietnamese", () => {
    expect(isVersionSnapshotRequest('Create exactly one version labeled "Review checkpoint"')).toBe(true);
    expect(isVersionSnapshotRequest('Tạo một phiên bản có nhãn "Review checkpoint"')).toBe(true);
    expect(isVersionSnapshotRequest("Explain how version history works without changing anything")).toBe(false);
    expect(isVersionSnapshotRequest("Do not create a version")).toBe(false);
  });

  it("accepts only a newly persisted snapshot owned by the current user and matching an explicit label", () => {
    expect(findPersistedVersionSnapshot([existing], [existing, created], "USER@example.com", 'Save a version labeled "Review checkpoint"')).toEqual(created);
    expect(findPersistedVersionSnapshot([existing], [existing, created], "other@example.com", "Save a version")).toBeNull();
    expect(findPersistedVersionSnapshot([existing], [existing, created], "user@example.com", 'Save a version labeled "Other"')).toBeNull();
    expect(findPersistedVersionSnapshot([existing], [existing], "user@example.com", "Save a version")).toBeNull();
    expect(findPersistedVersionSnapshot(null, [created], "user@example.com", "Save a version")).toBeNull();
    expect(findPersistedVersionSnapshot([existing], [existing, created], null, "Save a version")).toBeNull();
    expect(findPersistedVersionSnapshot([existing], [existing, created], null, 'Save a version labeled "Review checkpoint"')).toEqual(created);
  });

  it("returns a receipt grounded in the persisted snapshot", () => {
    expect(versionSnapshotAppliedSummary(created, "Save a version")).toBe("Saved a new version “Review checkpoint”.");
    expect(versionSnapshotAppliedSummary(created, "Tạo một phiên bản mới")).toBe("Đã lưu phiên bản “Review checkpoint”.");
  });

  it("counts a persisted version as a successful non-canvas mutation", () => {
    const result = computeAssistantTurnResult({
      boardBefore: null,
      boardAfter: null,
      localBlocksBefore: {},
      localBlocksAfter: {},
      localConnectorsBefore: {},
      localConnectorsAfter: {},
      parsedDifyAnswer: { content: "Created version Review checkpoint" },
      userRequest: 'Create a version labeled "Review checkpoint"',
      actionResult: null,
      invalidActionResponse: false,
      persistedSideEffect: true,
      sideEffectAppliedSummaries: ["Saved a new version “Review checkpoint”."],
    });
    expect(result.claimedMutationWithoutPersistence).toBe(false);
    expect(result.appliedSummaries).toEqual(["Saved a new version “Review checkpoint”."]);
    expect(result.content).toContain("Saved a new version “Review checkpoint”.");
    expect(result.focusBlockIds).toEqual([]);
  });
});
