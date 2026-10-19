// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectWorkspaceOptions } from "@/lib/workspace/ydoc";
import { useWorkspaceRealtime } from "@/app/workspace/hooks/useWorkspaceRealtime";
import { consumeSkippedWorkspacePersistenceSnapshot, consumeSkippedWorkspaceRealtimePublish, isWorkspaceRealtimeLive, setWorkspaceRealtimeLive } from "@/app/workspace/utils/workspaceRealtimeProjection";

const fixture = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  listeners: new Set<(state: Record<string, unknown>, previous: Record<string, unknown>) => void>(),
  connections: [] as ConnectWorkspaceOptions[],
  destroyed: vi.fn(), flush: vi.fn(), revision: vi.fn(), remembered: vi.fn(), publishFlush: vi.fn(),
  pending: vi.fn(), saveCurrent: vi.fn(), disconnected: vi.fn(),
}));
vi.mock("@/app/workspace/store/useWorkspaceStore", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: (state: Record<string, unknown>, previous: Record<string, unknown>) => void) => {
    fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener); };
  };
  const useStore = (selector: (state: Record<string, unknown>) => unknown) => useSyncExternalStore(subscribe,
    () => selector(fixture.state), () => selector(fixture.state));
  return { useWorkspaceStore: Object.assign(useStore, {
    getState: () => fixture.state, subscribe,
    setState: (patch: Record<string, unknown>) => {
      const previous = fixture.state; fixture.state = { ...previous, ...patch };
      fixture.listeners.forEach(listener => listener(fixture.state, previous));
    },
  }) };
});
vi.mock("@/lib/workspace/ydoc", () => ({ connectWorkspaceBoard: (options: ConnectWorkspaceOptions) => {
  fixture.connections.push(options);
  return { publish: vi.fn(), awaitPersisted: fixture.publishFlush, destroy: fixture.destroyed, setFocus: vi.fn(), connected: () => false,
    hasPendingChanges: fixture.pending, disconnect: fixture.disconnected };
} }));
vi.mock("@/app/workspace/hooks/workspaceBoardApi", () => ({ getKnownRevision: () => 99, rememberRealtimeRevision: fixture.revision, rememberRevision: fixture.remembered }));
vi.mock("@/app/workspace/hooks/useWorkspaceRemoteBoardId", () => ({ useWorkspaceRemoteBoardId: (id: string) => id }));
vi.mock("@/app/workspace/hooks/useCollectionRevisionWatch", () => ({ useCollectionRevisionWatch: vi.fn() }));
vi.mock("@/app/workspace/hooks/useWorkspaceRealtimePublisher", () => ({ useWorkspaceRealtimePublisher: () => fixture.publishFlush }));
vi.mock("@/app/workspace/utils/workspacePersistenceFlush", () => ({ flushWorkspacePendingSave: fixture.flush, saveCurrentWorkspaceDraft: fixture.saveCurrent }));
vi.mock("@/app/workspace/utils/workspaceRealtimeFlush", () => ({ registerWorkspaceRealtimeFlush: () => vi.fn() }));
vi.mock("@/app/workspace/utils/workspaceHistoryBridge", () => ({ skipNextWorkspaceHistorySnapshot: vi.fn() }));
vi.mock("@/app/workspace/utils/selfCreatedBoards", () => ({ wasBoardSelfCreated: () => false }));
vi.mock("@/app/workspace/utils/workspaceDocReferences", () => ({ reconcileWorkspaceDocTables: (blocks: unknown) => blocks }));

let root: Root | null = null, host: HTMLDivElement | null = null;
function board(html: string) {
  return { revision: 1, title: "Board", blocks: { doc: { id: "doc", type: "doc", data: { html } } }, blockOrder: ["doc"], connectors: {} };
}
function Harness() { useWorkspaceRealtime("board", true); return null; }
async function mount() {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<Harness />); });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); fixture.connections.length = 0;
  fixture.state = { ...board("<p>Original</p>"), boardId: "board", isReadOnly: false, selectedBlockIds: [], editingBlockId: null, setRemoteViewers: vi.fn() };
  fixture.state.setIsReadOnly = (isReadOnly: boolean) => {
    const previous = fixture.state; fixture.state = { ...previous, isReadOnly };
    fixture.listeners.forEach(listener => listener(fixture.state, previous));
  };
  fixture.flush.mockResolvedValue(true); fixture.publishFlush.mockResolvedValue(true);
  fixture.pending.mockReturnValue(false); fixture.saveCurrent.mockReturnValue(true);
  fixture.disconnected.mockImplementation(() => fixture.connections.at(-1)?.onSyncStateChange?.(false));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "token", wsUrl: "ws://example.test", role: "EDITOR", canWrite: true }) }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = null; host?.remove(); host = null;
  fixture.listeners.clear(); setWorkspaceRealtimeLive(null);
  consumeSkippedWorkspacePersistenceSnapshot(); consumeSkippedWorkspaceRealtimePublish();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("document realtime persistence wiring", () => {
  it("queues offline local projections for REST while suppressing online and remote replay saves", async () => {
    await mount(); expect(fixture.connections).toHaveLength(1);
    const connection = fixture.connections[0], autosave: string[] = [];
    const listener = (state: Record<string, unknown>, previous: Record<string, unknown>) => {
      const skip = consumeSkippedWorkspacePersistenceSnapshot();
      if (!skip && !isWorkspaceRealtimeLive("board") && state.blocks !== previous.blocks) autosave.push(JSON.stringify(state.blocks));
    };
    fixture.listeners.add(listener);
    await act(async () => connection.onBoard(board("<p>Offline typing</p>"), { local: true, crdt: true }));
    expect(autosave).toHaveLength(1); expect(autosave[0]).toContain("Offline typing");
    expect(fixture.revision).not.toHaveBeenCalled(); expect(fixture.remembered).not.toHaveBeenCalled();
    await act(async () => connection.onSyncStateChange?.(true));
    await act(async () => connection.onBoard(board("<p>Online typing</p>"), { local: true, crdt: true }));
    await act(async () => connection.onSyncStateChange?.(false));
    await act(async () => connection.onBoard(board("<p>Remote content</p>"), { local: false, crdt: true }));
    expect(autosave).toHaveLength(1);
    expect(fixture.revision).toHaveBeenCalledWith("board", 1);
    expect(fixture.remembered).not.toHaveBeenCalled();
    // An old database revision cannot discard a causally merged CRDT projection.
    expect(JSON.stringify(fixture.state.blocks)).toContain("Remote content");
    await act(async () => connection.onBoard(board("<p>Stale legacy content</p>"), { local: false, crdt: false }));
    expect(JSON.stringify(fixture.state.blocks)).toContain("Remote content");
  });

  it("flushes before connecting and starts a fresh connection after a dirty first handshake", async () => {
    await mount(); expect(fixture.flush).toHaveBeenCalledTimes(1);
    const old = fixture.connections[0];
    await act(async () => { old.onPreSyncChanges?.(); });
    expect(fixture.destroyed).toHaveBeenCalledTimes(1);
    expect(fixture.flush).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fixture.connections).toHaveLength(2);
    expect(fixture.flush).toHaveBeenCalledTimes(3);
    const before = fixture.state.blocks;
    await act(async () => old.onBoard(board("<p>Late obsolete callback</p>"), { local: false, crdt: true }));
    expect(fixture.state.blocks).toBe(before);
  });

  it("bounds retries when REST cannot confirm the draft and leaves realtime ownership disabled", async () => {
    fixture.flush.mockResolvedValue(false);
    await mount();
    for (let attempt = 0; attempt < 5; attempt++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fixture.flush).toHaveBeenCalledTimes(4);
    expect(fixture.connections).toHaveLength(0);
    expect(isWorkspaceRealtimeLive("board")).toBe(false);
  });

  it("starts the pending offline draft save before an immediate Save/Back can report success", async () => {
    const persistence = await vi.importActual<typeof import("@/app/workspace/utils/workspacePersistenceFlush")>("@/app/workspace/utils/workspacePersistenceFlush");
    let saving: Promise<boolean> | null = null, complete!: (ok: boolean) => void, captured = "";
    const unregister = persistence.registerWorkspacePersistenceFlush("board", () => saving ?? Promise.resolve(true), () => {
      captured = JSON.stringify(fixture.state.blocks);
      saving = new Promise(resolve => { complete = resolve; });
    });
    fixture.flush.mockImplementation(persistence.flushWorkspacePendingSave);
    fixture.saveCurrent.mockImplementation(persistence.saveCurrentWorkspaceDraft);
    try {
      await mount(); const connection = fixture.connections[0];
      await act(async () => connection.onSyncStateChange?.(true));
      await act(async () => connection.onBoard(board("<p>Unacknowledged draft</p>"), { local: true, crdt: true }));
      fixture.pending.mockReturnValue(true);
      await act(async () => connection.onSyncStateChange?.(false));
      expect(captured).toContain("Unacknowledged draft"); expect(fixture.publishFlush).toHaveBeenCalledWith(0);
      let navigated = false;
      const back = persistence.flushWorkspacePendingSave("board").then(ok => { navigated = ok; return ok; });
      await Promise.resolve(); expect(navigated).toBe(false);
      complete(true); await expect(back).resolves.toBe(true);
    } finally { unregister(); }
  });

  it.each([{ pending: false, readOnly: false }, { pending: true, readOnly: true }])("does not start an offline save for $pending pending / $readOnly readonly", async ({ pending, readOnly }) => {
    await mount(); const connection = fixture.connections[0];
    await act(async () => connection.onSyncStateChange?.(true));
    fixture.pending.mockReturnValue(pending); fixture.state.isReadOnly = readOnly;
    await act(async () => connection.onSyncStateChange?.(false));
    expect(fixture.saveCurrent).not.toHaveBeenCalled();
  });

  it("locks the editor on a viewer token refresh and preserves its pending draft", async () => {
    await mount(); const connection = fixture.connections[0];
    await act(async () => connection.onBoard(board("<p>Keep this draft</p>"), { local: true, crdt: true }));
    const before = fixture.state.blocks;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ token: "viewer-token", wsUrl: "ws://example.test", role: "VIEWER", canWrite: false }) } as Response);
    let result: { token: string } | null | undefined;
    await act(async () => { result = await connection.refreshToken?.(); });
    expect(result).toMatchObject({ token: "viewer-token" }); expect(fixture.state.isReadOnly).toBe(true);
    expect(fixture.state.blocks).toBe(before);
  });

  it.each([401, 403, 404])("locks and disconnects denied access (%s) without discarding the draft", async status => {
    await mount(); const connection = fixture.connections[0];
    await act(async () => connection.onSyncStateChange?.(true)); fixture.pending.mockReturnValue(true);
    const before = fixture.state.blocks;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status } as Response);
    await act(async () => { expect(await connection.refreshToken?.()).toBeNull(); });
    expect(fixture.state.isReadOnly).toBe(true); expect(fixture.state.blocks).toBe(before);
    expect(fixture.disconnected).toHaveBeenCalledOnce(); expect(isWorkspaceRealtimeLive("board")).toBe(false);
    expect(fixture.saveCurrent).not.toHaveBeenCalled();
  });

  it.each(["network", "503"])("keeps existing edit permissions on a transient %s token failure", async failure => {
    await mount(); const connection = fixture.connections[0];
    if (failure === "network") vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    else vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await act(async () => { expect(await connection.refreshToken?.()).toBeNull(); });
    expect(fixture.state.isReadOnly).toBe(false); expect(fixture.disconnected).not.toHaveBeenCalled();
  });

  it("does not apply a stale role response to a different board", async () => {
    await mount(); const connection = fixture.connections[0];
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(complete => { resolve = complete; }));
    const refresh = connection.refreshToken?.();
    fixture.state = { ...fixture.state, boardId: "other-board" };
    resolve({ ok: false, status: 404 } as Response);
    await act(async () => { await refresh; });
    expect(fixture.state.isReadOnly).toBe(false); expect(fixture.disconnected).not.toHaveBeenCalled();
  });
});
