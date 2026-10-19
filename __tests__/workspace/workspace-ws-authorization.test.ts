import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRoom } from "../../scripts/workspace-ws/rooms";
import { RepositoryError } from "../../scripts/workspace-ws/repository";
import { clientUpdate, testBoard, testClient, testConfig, testPeer, testRepository, textOf } from "./workspace-ws-test-helpers";

const cleanup: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const fn of cleanup.splice(0)) fn(); vi.useRealTimers(); });
function fixture() {
  const repository = testRepository(), room = new WorkspaceRoom("board-1", testBoard(), testConfig(), repository, () => {}, () => {});
  const editor = testPeer(room), client = testClient(room);
  cleanup.push(() => { room.close(); client.destroy(); });
  return { room, editor, client, repository };
}
function pendingAuthors(room: WorkspaceRoom, editor: ReturnType<typeof testPeer>, client: ReturnType<typeof testClient>) {
  const owner = testPeer(room, "owner", "owner@example.com"), ownerClient = testClient(room);
  cleanup.push(() => ownerClient.destroy());
  room.acceptUpdate(owner, clientUpdate(ownerClient, () => textOf(ownerClient).insert(0, "Owner ")));
  room.acceptUpdate(editor, clientUpdate(client, () => textOf(client).insert(0, "Editor ")));
  return owner;
}

describe("Workspace room writer changes", () => {
  it("persists both accepted authors after the last writer is explicitly evicted", async () => {
    const { room, editor, client, repository } = fixture(), owner = pendingAuthors(room, editor, client);
    expect(room.evict(editor.identity.userEmail)).toBe(1);
    await room.flush();
    expect(repository.save).toHaveBeenCalledOnce();
    const saved = vi.mocked(repository.save).mock.calls[0];
    expect(saved[3]).toBe(owner.identity.userEmail);
    expect(JSON.stringify(saved[1].blocks)).toContain("Editor Owner Seed");
    expect(editor.revoked).toBe(true); expect(owner.revoked).toBe(false);
    expect(owner.socket.close).not.toHaveBeenCalled();
    expect(room.closed).toBe(false); expect(room.dirty).toBe(false); expect(room.revision).toBe(8);
    expect(room.doc.getMap("meta").has("docPersistedVector")).toBe(true);
  });

  it.each([[403, "read_only"], [404, "request_failed"]] as const)(
    "retries a %s authorization response using a remaining writer", async (status, reason) => {
      const { room, editor, client, repository } = fixture(), owner = pendingAuthors(room, editor, client);
      vi.mocked(repository.save).mockRejectedValueOnce(new RepositoryError(status, reason));
      await room.flush();
      expect(repository.save).toHaveBeenCalledTimes(2);
      const [first, second] = vi.mocked(repository.save).mock.calls;
      expect(first[3]).toBe(editor.identity.userEmail); expect(second[3]).toBe(owner.identity.userEmail);
      expect(second[1]).toBe(first[1]); expect(JSON.stringify(second[1].blocks)).toContain("Editor Owner Seed");
      expect(editor.socket.close).toHaveBeenCalledWith(4403, reason); expect(owner.socket.close).not.toHaveBeenCalled();
      expect(room.closed).toBe(false); expect(room.dirty).toBe(false); expect(room.revision).toBe(8);
    },
  );

  it.each([false, true])("retains edits without an unauthorized save or receipt when viewers remain: %s", async (viewerRemains) => {
    const { room, editor, client, repository } = fixture();
    if (viewerRemains) testPeer(room, "VIEWER", "viewer@example.com");
    room.acceptUpdate(editor, clientUpdate(client, () => textOf(client).insert(0, "Pending ")));
    room.evict(editor.identity.userEmail); room.peers.delete(editor);
    await expect(room.flush()).rejects.toThrow("no_authorized_writer");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.save).not.toHaveBeenCalled();
    expect(room.closed).toBe(false); expect(room.dirty).toBe(true); expect(room.revision).toBe(7);
    expect(room.doc.getMap("meta").has("docPersistedVector")).toBe(false);
    const restored = testPeer(room, "EDITOR", editor.identity.userEmail);
    await room.flush();
    expect(repository.save).toHaveBeenCalledOnce(); expect(restored.revoked).toBe(false);
    expect(JSON.stringify(vi.mocked(repository.save).mock.calls[0][1].blocks)).toContain("Pending Seed");
    expect(room.dirty).toBe(false); expect(room.revision).toBe(8);
  });

  it("does not mistake a deleted board for an actor authorization failure", async () => {
    const { room, editor, client, repository } = fixture();
    pendingAuthors(room, editor, client);
    vi.mocked(repository.save).mockRejectedValueOnce(new RepositoryError(404, "gone"));
    await expect(room.flush()).rejects.toThrow("gone");
    expect(repository.save).toHaveBeenCalledOnce(); expect(room.closed).toBe(true);
    expect(room.doc.getMap("meta").has("docPersistedVector")).toBe(false);
  });
});
