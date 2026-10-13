// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), save: vi.fn(), registered: vi.fn(), flush: vi.fn(), index: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/app/workspace/hooks/workspaceBoardApi", () => ({ saveRemoteBoard: mocks.save }));
vi.mock("@/app/workspace/hooks/workspaceBoardIndex", () => ({ boardKey: (id: string) => `board:${id}`, upsertIndexEntry: mocks.index }));
vi.mock("@/app/workspace/utils/workspacePersistenceFlush", () => ({ hasWorkspacePersistenceFlush: mocks.registered, flushWorkspacePendingSave: mocks.flush }));
import { useWorkspaceManualSave } from "@/app/workspace/hooks/useWorkspaceManualSave";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

async function run() {
  let save!: () => Promise<boolean>;
  function Host() { save = useWorkspaceManualSave("board"); return null; }
  const element = document.createElement("div"), root = createRoot(element);
  act(() => root.render(<Host />));
  try { return await save(); } finally { act(() => root.unmount()); }
}
beforeEach(() => {
  vi.clearAllMocks();
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    setItem: (key: string, value: string) => data.set(key, value), getItem: (key: string) => data.get(key) ?? null,
  } });
  mocks.registered.mockReturnValue(true); mocks.flush.mockResolvedValue(true); mocks.save.mockResolvedValue({ ok: true });
  useWorkspaceStore.setState({ boardId: "board", title: "Report", isReadOnly: false, blocks: {}, blockOrder: [], connectors: {}, frames: [{ id: "f", name: "Work", order: 0, camera: { x: 0, y: 0, zoom: 1 }, presenterNotes: "Keep these notes" }] });
});
describe("Manual workspace save", () => {
  it("waits for the existing writer's acknowledgment without a competing REST save", async () => {
    let resolve!: (value: boolean) => void;
    mocks.flush.mockReturnValue(new Promise((done) => { resolve = done; }));
    const promise = run();
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    resolve(true); expect(await promise).toBe(true); expect(mocks.success).toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("board:board")!).frames[0].presenterNotes).toBe("Keep these notes");
  });
  it("does not claim server success when the acknowledgment fails", async () => {
    mocks.flush.mockResolvedValue(false);
    expect(await run()).toBe(false); expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("server has not confirmed"));
  });
  it("includes frames and notes in the fallback REST save", async () => {
    mocks.registered.mockReturnValue(false);
    expect(await run()).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith("board", expect.objectContaining({ frames: expect.arrayContaining([expect.objectContaining({ presenterNotes: "Keep these notes" })]) }));
  });
  it("continues saving to the server when device cache is full", async () => {
    const cache = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    try { expect(await run()).toBe(true); expect(mocks.flush).toHaveBeenCalled(); } finally { cache.mockRestore(); }
  });
  it("blocks read-only saves", async () => {
    useWorkspaceStore.setState({ isReadOnly: true });
    expect(await run()).toBe(false); expect(mocks.flush).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
