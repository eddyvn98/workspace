import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { snapshotDocumentRoom } from "../../lib/workspace/document-room";
import { WorkspaceRoom } from "../../scripts/workspace-ws/rooms";
import { WorkspaceRooms } from "../../scripts/workspace-ws/registry";
import { RepositoryError } from "../../scripts/workspace-ws/repository";
import { clientUpdate, testBoard, testClient, testConfig, testPeer, testRepository, textOf } from "./workspace-ws-test-helpers";

const cleanup: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const fn of cleanup.splice(0)) fn(); vi.useRealTimers(); });
function fixture() {
  const repository = testRepository(), room = new WorkspaceRoom("board-1", testBoard(), testConfig(), repository, () => {}, () => {});
  const peer = testPeer(room), client = testClient(room);
  cleanup.push(() => { room.close(); client.destroy(); }); return { room, peer, client, repository };
}
describe("Workspace room persistence", () => {
  it("flushes after idle and publishes the exact captured state vector", async () => {
    const { room, peer, client, repository } = fixture();
    room.acceptUpdate(peer, clientUpdate(client, () => { textOf(client).insert(0, "Local "); client.getMap("documentEdits").set(String(client.clientID), 1); }));
    await vi.advanceTimersByTimeAsync(1999); expect(repository.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(repository.save).toHaveBeenCalledOnce();
    expect(room.dirty).toBe(false); expect(room.doc.getMap("meta").get("boardRevision")).toBe(8);
    const vector = Y.decodeStateVector(Buffer.from(room.doc.getMap("meta").get("docPersistedVector") as string, "base64"));
    expect(vector.get(client.clientID)).toBe(Y.decodeStateVector(Y.encodeStateVector(client)).get(client.clientID));
    expect(JSON.stringify(vi.mocked(repository.save).mock.calls[0][1].blocks)).toContain("Local Seed");
  });
  it("does not include later edits in an in-flight snapshot receipt", async () => {
    const { room, peer, client, repository } = fixture();
    let finish!: (revision: number) => void;
    vi.mocked(repository.save).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "First ")));
    const firstClock = Y.decodeStateVector(Y.encodeStateVector(client)).get(client.clientID)!;
    const saving = room.flush(); await Promise.resolve();
    room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "Later ")));
    finish(8); await saving;
    const vector = Y.decodeStateVector(Buffer.from(room.doc.getMap("meta").get("docPersistedVector") as string, "base64"));
    expect(vector.get(client.clientID)).toBe(firstClock); expect(room.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(2000); expect(repository.save).toHaveBeenCalledTimes(2); expect(room.dirty).toBe(false);
    expect(JSON.stringify(vi.mocked(repository.save).mock.calls[1][1].blocks)).toContain("Later First Seed");
  });
  it("uses the deadline during continuous edits without waiting for an idle window", async () => {
    const { room, peer, client, repository } = fixture();
    for (let i = 0; i < 10; i++) {
      room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "x")));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(repository.save).toHaveBeenCalledOnce(); expect(room.dirty).toBe(false);
  });
  it("rebases a stale CAS against the common ancestor and keeps both document edits", async () => {
    const { room, peer, client, repository } = fixture();
    const latest = testBoard(); latest.title = "Repository title"; latest.revision = 8;
    latest.blocks = { ...latest.blocks, doc: { ...(latest.blocks.doc as object), data: { html: "<p>Seed REST</p>" } } };
    vi.mocked(repository.load).mockResolvedValue(latest);
    vi.mocked(repository.save).mockRejectedValueOnce(new RepositoryError(409, "stale"));
    room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "LOCAL ")));
    await room.flush();
    expect(repository.save).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(repository.save).mock.calls[1];
    expect(saved[2]).toBe(8); expect(saved[1].title).toBe("Repository title");
    expect(JSON.stringify(saved[1].blocks)).toContain("LOCAL Seed REST"); expect(room.revision).toBe(9);
  });
  it("retains a dirty disconnected room across a transient save failure", async () => {
    const config = testConfig(), repository = testRepository(), registry = new WorkspaceRooms(config, repository, () => {});
    const room = await registry.get("board-1"), peer = testPeer(room), client = testClient(room);
    cleanup.push(() => { room.close(); client.destroy(); });
    vi.mocked(repository.save).mockRejectedValueOnce(new RepositoryError(503, "unavailable"));
    room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "Pending ")));
    room.peers.delete(peer); registry.changed(room.boardId);
    await expect(room.flush()).rejects.toThrow(); expect(registry.rooms.get(room.boardId)).toBe(room);
    await vi.advanceTimersByTimeAsync(2000); expect(room.dirty).toBe(false);
    await vi.advanceTimersByTimeAsync(config.idleRoomMs); expect(registry.rooms.has(room.boardId)).toBe(false);
  });
  it("refreshes an existing room on join and ignores delayed invalidations", async () => {
    const repository = testRepository(), registry = new WorkspaceRooms(testConfig(), repository, () => {});
    const room = await registry.get("board-1"); cleanup.push(() => room.close());
    vi.mocked(repository.load).mockResolvedValue({ ...testBoard(), title: "Fresh REST", revision: 8 });
    expect(await registry.get("board-1")).toBe(room); expect(snapshotDocumentRoom(room.doc).title).toBe("Fresh REST");
    await registry.refresh("board-1", 7); expect(repository.load).toHaveBeenCalledTimes(2);
    registry.evict("board-1", "editor@example.com");
    expect(registry.canJoin({ boardId: "board-1", userEmail: "editor@example.com", role: "EDITOR", issuedAt: Math.floor(Date.now() / 1000) - 1 })).toBe(false);
  });
  it("retains pending edits without a receipt after the only writer loses authorization", async () => {
    const { room, peer, client, repository } = fixture();
    vi.mocked(repository.save).mockRejectedValueOnce(new RepositoryError(403, "read_only"));
    room.acceptUpdate(peer, clientUpdate(client, () => textOf(client).insert(0, "Denied ")));
    await expect(room.flush()).rejects.toThrow("no_authorized_writer");
    expect(room.closed).toBe(false); expect(room.dirty).toBe(true); expect(room.revision).toBe(7);
    expect(room.doc.getMap("meta").has("docPersistedVector")).toBe(false);
    expect(peer.socket.close).toHaveBeenCalledWith(4403, "read_only");
    await vi.advanceTimersByTimeAsync(60_000); expect(repository.save).toHaveBeenCalledOnce();
  });
});
