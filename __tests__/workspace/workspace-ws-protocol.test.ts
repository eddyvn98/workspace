import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as sync from "y-protocols/sync";
import { SignJWT } from "jose";
import { authenticatePeer, isInternalAuthorized } from "../../scripts/workspace-ws/config";
import { handlePeerMessage } from "../../scripts/workspace-ws/protocol";
import { acceptAwareness } from "../../scripts/workspace-ws/awareness";
import { WorkspaceRoom } from "../../scripts/workspace-ws/rooms";
import { awarenessPacket, clientUpdate, syncPacket, testBoard, testClient, testConfig, testPeer, testRepository } from "./workspace-ws-test-helpers";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0)) fn(); });
function fixture() {
  const room = new WorkspaceRoom("board-1", testBoard(), testConfig(), testRepository());
  const client = testClient(room); cleanup.push(() => { room.close(); client.destroy(); });
  return { room, client };
}
describe("Workspace websocket protocol", () => {
  it("serves viewer sync step 1 while ignoring both update and step 2 writes", () => {
    const { room, client } = fixture(), peer = testPeer(room, "VIEWER");
    const update = clientUpdate(client, () => client.getMap("meta").set("title", "forbidden"));
    handlePeerMessage(room, peer, syncPacket(sync.messageYjsSyncStep2, update));
    handlePeerMessage(room, peer, syncPacket(sync.messageYjsUpdate, update));
    expect(room.doc.getMap("meta").get("title")).toBe("Board"); expect(room.dirty).toBe(false);
    const receiver = new Y.Doc(); cleanup.push(() => receiver.destroy());
    handlePeerMessage(room, peer, syncPacket(sync.messageYjsSyncStep1, Y.encodeStateVector(receiver)));
    const sent = (peer.socket.send as ReturnType<typeof import("vitest").vi.fn>).mock.calls[0][0] as Uint8Array;
    const decoder = decoding.createDecoder(sent); expect(decoding.readVarUint(decoder)).toBe(0);
    expect(sync.readSyncMessage(decoder, encoding.createEncoder(), receiver, "server")).toBe(sync.messageYjsSyncStep2);
    expect(receiver.getMap("meta").get("title")).toBe("Board");
  });
  it("merges valid edits atomically while keeping server receipts authoritative", () => {
    const { room, client } = fixture(), peer = testPeer(room);
    room.acceptUpdate(peer, clientUpdate(client, () => {
      client.getMap("meta").set("title", "Edited");
      client.getMap("meta").set("boardRevision", 999);
      client.getMap("meta").set("docProtocolVersion", 999);
      client.getMap("meta").set("docPersistedVector", "forged");
    }));
    expect(room.doc.getMap("meta").get("title")).toBe("Edited");
    expect(room.doc.getMap("meta").get("boardRevision")).toBe(7);
    expect(room.doc.getMap("meta").get("docProtocolVersion")).toBe(1);
    expect(room.doc.getMap("meta").has("docPersistedVector")).toBe(false);
    expect(client.getMap("meta").get("boardRevision")).toBe(7);
    const before = Y.encodeStateAsUpdate(room.doc);
    expect(() => room.acceptUpdate(peer, new Uint8Array([255]))).toThrow();
    expect(Y.encodeStateAsUpdate(room.doc)).toEqual(before);
  });
  it("refuses an invalid root without partially applying otherwise valid edits", () => {
    const { room, client } = fixture(), peer = testPeer(room);
    const update = clientUpdate(client, () => { client.getMap("other").set("x", 1); client.getMap("meta").set("title", "bad batch"); });
    expect(() => room.acceptUpdate(peer, update)).toThrow("Invalid shared document type");
    expect(room.doc.getMap("meta").get("title")).toBe("Board"); expect(room.dirty).toBe(false);
  });
  it("requires missing update dependencies to arrive together in a reconnect sync", () => {
    const { room, client } = fixture(), peer = testPeer(room);
    clientUpdate(client, () => client.getMap("meta").set("title", "first"));
    const incomplete = clientUpdate(client, () => client.getMap("meta").set("title", "second"));
    expect(() => room.acceptUpdate(peer, incomplete)).toThrow("Incomplete update");
    expect(room.doc.getMap("meta").get("title")).toBe("Board");
    room.acceptUpdate(peer, Y.encodeStateAsUpdate(client));
    expect(room.doc.getMap("meta").get("title")).toBe("second");
  });
  it("uses authenticated awareness identities and prevents another peer taking a client id", () => {
    const { room } = fixture(), editor = testPeer(room), other = testPeer(room, "EDITOR", "other@example.com");
    acceptAwareness(room, editor, awarenessPacket(12, 1, { email: "victim@example.com" }));
    expect(room.awareness.getStates().has(12)).toBe(false);
    acceptAwareness(room, editor, awarenessPacket(12, 2, { email: editor.identity.userEmail, user: { name: "Victim", email: "victim@example.com" }, cursor: { anchor: 3 } }));
    expect(room.awareness.getStates().get(12)).toMatchObject({ email: editor.identity.userEmail, clientId: 12,
      user: { name: editor.identity.userEmail, email: editor.identity.userEmail }, cursor: { anchor: 3 } });
    acceptAwareness(room, other, awarenessPacket(12, 999, { email: other.identity.userEmail }));
    expect(room.awareness.getStates().get(12)?.email).toBe(editor.identity.userEmail);
    room.evict(editor.identity.userEmail);
    acceptAwareness(room, editor, awarenessPacket(12, 1000, { email: editor.identity.userEmail, selectedBlockId: "changed" }));
    expect(room.awareness.getStates().get(12)?.selectedBlockId).toBeUndefined();
  });
  it("requires a current HS256 token for the exact board and a known role", async () => {
    const secret = testConfig().secret, key = new TextEncoder().encode(secret);
    const sign = (claims: Record<string, unknown>, expiration = "60s") => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiration).sign(key);
    const claims = { boardId: "board-1", userEmail: "EDITOR@EXAMPLE.COM", role: "EDITOR" };
    expect(await authenticatePeer(await sign(claims), "board-1", secret)).toMatchObject({ userEmail: "editor@example.com", role: "EDITOR" });
    await expect(authenticatePeer(await sign(claims), "board-2", secret)).rejects.toThrow();
    await expect(authenticatePeer(await sign({ ...claims, role: "ADMIN" }), "board-1", secret)).rejects.toThrow();
    await expect(authenticatePeer(await sign(claims, "-10s"), "board-1", secret)).rejects.toThrow();
    expect(isInternalAuthorized("Bearer undefined", "")).toBe(false);
    expect(isInternalAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });
});
