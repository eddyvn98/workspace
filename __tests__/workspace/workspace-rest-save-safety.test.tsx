// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(), access: vi.fn(), getKnown: vi.fn(), announce: vi.fn(), index: vi.fn(),
  notify: vi.fn(), realtime: vi.fn(() => false), consume: vi.fn(() => null),
}));
vi.mock("@/app/workspace/hooks/workspaceBoardApi", () => ({
  saveRemoteBoard: mocks.save, checkBoardAccess: mocks.access, getKnownContent: mocks.getKnown, rememberRevision: vi.fn(),
}));
vi.mock("@/app/workspace/hooks/workspaceBoardIndex", () => ({
  boardKey: (id: string) => `board:${id}`, upsertIndexEntry: mocks.index,
}));
vi.mock("@/app/workspace/utils/restoreMergeConflicts", () => ({ notifyMergeConflicts: mocks.notify }));
vi.mock("@/app/workspace/utils/workspaceMutationIntent", () => ({ consumeWorkspaceMutation: mocks.consume }));
vi.mock("@/app/workspace/utils/workspaceRealtimeProjection", () => ({ isWorkspaceRealtimeLive: mocks.realtime }));
vi.mock("@/app/workspace/hooks/useWorkspaceRemoteBoardId", () => ({ announceWorkspaceBoardPersisted: mocks.announce }));

import { useWorkspacePersistenceSave } from "@/app/workspace/hooks/useWorkspacePersistenceSave";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.realtime.mockReturnValue(false);
  mocks.consume.mockReturnValue(null);
  mocks.access.mockResolvedValue({ status: "ok", board: { id: "board", blocks: {}, blockOrder: [], connectors: {} } });
  useWorkspaceStore.setState({ boardId: "board", isReadOnly: false, blocks: {}, blockOrder: [], connectors: {}, title: "Unsaved" });
});

function mount() {
  let api!: ReturnType<typeof useWorkspacePersistenceSave>;
  const adopted = vi.fn();
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Host />));
  function Host() {
    api = useWorkspacePersistenceSave("board", { current: true }, adopted);
    return null;
  }
  return { get api() { return api; }, adopted, unmount: () => act(() => root.unmount()) };
}

describe("Workspace REST save failure safety", () => {
  it("keeps a conflicting spreadsheet draft without adopting or automatically reporting a retry as saved", async () => {
    const block = (text: string) => ({ id: "s", type: "table", data: { mode: "spreadsheet", rows: 1, cols: 1, cells: [[text]] } });
    mocks.getKnown.mockReturnValue({ blocks: { s: block("base") }, blockOrder: ["s"], connectors: {} });
    mocks.access.mockResolvedValue({ status: "ok", board: { id: "board", blocks: { s: block("remote") }, blockOrder: ["s"], connectors: {}, revision: 2 } });
    mocks.save.mockResolvedValue({ ok: false, conflict: true });
    useWorkspaceStore.setState({ blocks: { s: block("local draft") } as never, blockOrder: ["s"] });
    const host = mount(); act(() => host.api.save());
    expect(await host.api.flushPendingSave()).toBe(false);
    expect(host.adopted).not.toHaveBeenCalled(); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().blocks.s.data).toMatchObject({ cells: [["local draft"]] });
    host.unmount();
  });
  it("keeps an unsaved draft after a transient 503 even if GET would succeed", async () => {
    mocks.save.mockResolvedValue({ ok: false, error: "Service unavailable", conflict: false });
    const host = mount();
    const before = useWorkspaceStore.getState().blocks;
    act(() => host.api.save());
    const persisted = await host.api.flushPendingSave();
    expect(persisted).toBe(false);
    expect(host.adopted).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().blocks).toBe(before);
    host.unmount();
  });

  it("explicit Save retries one completed network failure without requiring another edit", async () => {
    mocks.save.mockResolvedValueOnce({ ok: false, error: "503", conflict: false }).mockResolvedValue({ ok: true });
    const host = mount();
    act(() => host.api.save());
    expect(await host.api.flushPendingSave()).toBe(false);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(await host.api.flushPendingSave(true)).toBe(true);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    host.unmount();
  });

  it("explicit Save does not silently retry an unresolved workbook conflict", async () => {
    mocks.save.mockResolvedValue({ ok: false, conflict: true });
    mocks.getKnown.mockReturnValue(undefined);
    const host = mount(); act(() => host.api.save());
    expect(await host.api.flushPendingSave()).toBe(false);
    expect(await host.api.flushPendingSave(true)).toBe(false);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    host.unmount();
  });

  it("serializes a second edit while the first request is in flight", async () => {
    let resolveFirst!: (result: { ok: boolean }) => void;
    mocks.save.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValue({ ok: true });
    const host = mount();
    act(() => host.api.save());
    useWorkspaceStore.setState({ title: "Newer edit" });
    act(() => host.api.save());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: true });
    expect(await host.api.flushPendingSave()).toBe(true);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][1].title).toBe("Newer edit");
    host.unmount();
  });
});
