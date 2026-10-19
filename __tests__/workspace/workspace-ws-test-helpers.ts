import { vi } from "vitest";
import * as Y from "yjs";
import WebSocket from "ws";
import * as encoding from "lib0/encoding";
import { readConfig, type PeerIdentity } from "../../scripts/workspace-ws/config";
import { WorkspaceRoom, type RoomPeer } from "../../scripts/workspace-ws/rooms";
import type { WorkspaceRepository } from "../../scripts/workspace-ws/repository";
import type { StoredDocumentBoard } from "../../lib/workspace/document-room";
import { documentFragments } from "../../lib/workspace/ydoc-documents";

export const testConfig = () => ({ ...readConfig({ WORKSPACE_WS_TOKEN_SECRET: "test-only-workspace-secret-not-for-production" }), idleRoomMs: 30_000 });
export const testBoard = (): StoredDocumentBoard => ({
  title: "Board", revision: 7, camera: {}, connectors: {}, blockOrder: ["doc"],
  blocks: { doc: { id: "doc", type: "doc", x: 0, y: 0, w: 600, h: 400, data: { html: "<p>Seed</p>" } } },
});
export const testRepository = (board = testBoard()): WorkspaceRepository => ({
  load: vi.fn(async () => board), save: vi.fn(async (_id, _board, revision) => revision + 1),
});
export function testPeer(room: WorkspaceRoom, role: PeerIdentity["role"] = "EDITOR", email = "editor@example.com"): RoomPeer {
  const socket = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn((_data, callback) => callback?.()),
    close: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
  const peer: RoomPeer = { socket, identity: { boardId: room.boardId, userEmail: email, role }, awarenessIds: new Set(), alive: true, revoked: false };
  room.peers.add(peer); return peer;
}
export function testClient(room: WorkspaceRoom): Y.Doc {
  const client = new Y.Doc(); Y.applyUpdate(client, Y.encodeStateAsUpdate(room.doc));
  room.doc.on("update", (update: Uint8Array) => { if (!client.isDestroyed) Y.applyUpdate(client, update); });
  return client;
}
export function textOf(doc: Y.Doc): Y.XmlText {
  return (documentFragments(doc).get("doc")!.get(0) as Y.XmlElement).get(0) as Y.XmlText;
}
export function clientUpdate(client: Y.Doc, mutate: () => void): Uint8Array {
  const before = Y.encodeStateVector(client); client.transact(mutate);
  return Y.encodeStateAsUpdate(client, before);
}
export function syncPacket(step: number, value: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0); encoding.writeVarUint(encoder, step);
  encoding.writeVarUint8Array(encoder, value); return encoding.toUint8Array(encoder);
}
export function awarenessPacket(id: number, clock: number, state: unknown): Uint8Array {
  const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 1); encoding.writeVarUint(encoder, id);
  encoding.writeVarUint(encoder, clock); encoding.writeVarString(encoder, JSON.stringify(state));
  return encoding.toUint8Array(encoder);
}
