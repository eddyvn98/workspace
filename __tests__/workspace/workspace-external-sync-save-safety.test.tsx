// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), revision: vi.fn(), remember: vi.fn(), getState: vi.fn(), setState: vi.fn() }));
vi.mock("@/app/workspace/hooks/workspaceBoardApi", () => ({ checkBoardAccess: mocks.access, getKnownRevision: mocks.revision, rememberRevision: mocks.remember }));
vi.mock("@/app/workspace/hooks/useWorkspaceRemoteBoardId", () => ({ useWorkspaceRemoteBoardId: (id: string) => id }));
vi.mock("@/app/workspace/store/useWorkspaceStore", () => ({ useWorkspaceStore: { getState: mocks.getState, setState: mocks.setState } }));
vi.mock("@/app/workspace/utils/workspaceHistoryBridge", () => ({ skipNextWorkspaceHistorySnapshot: vi.fn() }));
vi.mock("@/app/workspace/utils/workspaceRealtimeProjection", () => ({ skipNextWorkspacePersistenceSnapshot: vi.fn(), skipNextWorkspaceRealtimePublish: vi.fn() }));
import { useWorkspaceExternalSync } from "@/app/workspace/hooks/useWorkspaceExternalSync";
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.revision.mockReturnValue(1); });
it("does not advance the CAS base or overwrite an edit made during a slow poll", async () => {
  let resolve!: (value: unknown) => void;
  mocks.access.mockReturnValue(new Promise((done) => { resolve = done; }));
  const before = { boardId: "b", blocks: {}, blockOrder: [], connectors: {} };
  mocks.getState.mockReturnValue(before);
  renderHook(() => useWorkspaceExternalSync("b", { live: false, hasUnsavedLocalChanges: false }));
  mocks.getState.mockReturnValue({ ...before, blocks: { new: {} } });
  resolve({ status: "ok", board: { id: "b", revision: 2, blocks: {}, blockOrder: [], connectors: {} } });
  await new Promise((done) => setTimeout(done, 0));
  expect(mocks.access).toHaveBeenCalledWith("b", { remember: false });
  expect(mocks.remember).not.toHaveBeenCalled(); expect(mocks.setState).not.toHaveBeenCalled();
});
it("does not pull over a known unsaved or failed-save draft", () => {
  renderHook(() => useWorkspaceExternalSync("b", { live: false, hasUnsavedLocalChanges: true }));
  expect(mocks.access).not.toHaveBeenCalled();
});
