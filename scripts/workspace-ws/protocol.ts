import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as sync from "y-protocols/sync";
import { encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import WebSocket, { type RawData } from "ws";
import type { PeerIdentity } from "./config";
import { acceptAwareness } from "./awareness";
import type { RoomPeer, WorkspaceRoom } from "./rooms";

const SYNC = 0, AWARENESS = 1, QUERY_AWARENESS = 3;
function packet(type: number, write: (encoder: encoding.Encoder) => void): Uint8Array {
  const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, type); write(encoder);
  return encoding.toUint8Array(encoder);
}
export function sendPeer(room: WorkspaceRoom, peer: RoomPeer, data: Uint8Array): void {
  if (peer.revoked || peer.socket.readyState !== WebSocket.OPEN) return;
  if (peer.socket.bufferedAmount + data.byteLength > room.config.maxHttpBytes * 2) {
    peer.socket.close(1013, "Slow connection; reconnect to sync"); return;
  }
  peer.socket.send(data, (error) => { if (error) peer.socket.terminate(); });
}
export function handlePeerMessage(room: WorkspaceRoom, peer: RoomPeer, data: Uint8Array): void {
  if (peer.revoked || room.closed) return;
  if (data.byteLength > room.config.maxMessageBytes) throw new Error("Message exceeds the size limit");
  const decoder = decoding.createDecoder(data), type = decoding.readVarUint(decoder);
  if (type === SYNC) {
    const step = decoding.readVarUint(decoder);
    if (step === sync.messageYjsSyncStep1) {
      const vector = decoding.readVarUint8Array(decoder);
      if (decoder.pos !== decoder.arr.length) throw new Error("Invalid sync message");
      sendPeer(room, peer, packet(SYNC, (encoder) => sync.writeSyncStep2(encoder, room.doc, vector)));
    } else if (step === sync.messageYjsSyncStep2 || step === sync.messageYjsUpdate) {
      const update = decoding.readVarUint8Array(decoder);
      if (decoder.pos !== decoder.arr.length) throw new Error("Invalid sync message");
      // A VIEWER can legitimately reply to a peer's sync request. It never becomes a write.
      if (peer.identity.role !== "VIEWER") room.acceptUpdate(peer, update);
    } else throw new Error("Unknown sync message");
  } else if (type === AWARENESS) {
    const update = decoding.readVarUint8Array(decoder);
    if (decoder.pos !== decoder.arr.length) throw new Error("Invalid awareness message");
    acceptAwareness(room, peer, update);
  } else if (type === QUERY_AWARENESS) {
    if (decoder.pos !== decoder.arr.length) throw new Error("Invalid awareness query");
    sendPeer(room, peer, packet(AWARENESS, (encoder) => encoding.writeVarUint8Array(encoder,
      encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()]))));
  } else throw new Error("Unknown message");
}
const bytes = (data: RawData): Uint8Array => Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
export function attachPeer(room: WorkspaceRoom, socket: WebSocket, identity: PeerIdentity, changed: () => void): RoomPeer {
  const peer: RoomPeer = { socket, identity, awarenessIds: new Set(), alive: true, revoked: false };
  room.peers.add(peer); changed();
  const onUpdate = (update: Uint8Array) => sendPeer(room, peer, packet(SYNC, (encoder) => sync.writeUpdate(encoder, update)));
  const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    sendPeer(room, peer, packet(AWARENESS, (encoder) => encoding.writeVarUint8Array(encoder,
      encodeAwarenessUpdate(room.awareness, [...added, ...updated, ...removed]))));
  };
  room.doc.on("update", onUpdate); room.awareness.on("update", onAwareness);
  let allowance = room.config.maxMessageBytes * 2, allowanceAt = Date.now();
  socket.on("message", (data, binary) => {
    if (!binary) { socket.close(1003, "Binary messages required"); return; }
    const now = Date.now(); allowance = Math.min(room.config.maxMessageBytes * 2, allowance + (now - allowanceAt) * 4096); allowanceAt = now;
    const message = bytes(data); allowance -= message.byteLength;
    if (allowance < 0) { socket.close(1013, "Message rate exceeded"); return; }
    try { handlePeerMessage(room, peer, message); }
    catch (error) { peer.revoked = true; socket.close(1008, error instanceof Error ? error.message.slice(0, 100) : "Invalid message"); }
  });
  socket.on("pong", () => { peer.alive = true; });
  socket.on("error", () => socket.terminate());
  socket.once("close", () => {
    peer.revoked = true;
    room.doc.off("update", onUpdate); room.awareness.off("update", onAwareness);
    room.peers.delete(peer);
    for (const id of peer.awarenessIds) if (room.awarenessOwners.get(id) === peer) room.awarenessOwners.delete(id);
    if (!room.closed) removeAwarenessStates(room.awareness, [...peer.awarenessIds], peer);
    changed();
  });
  if (identity.role !== "VIEWER") sendPeer(room, peer, packet(SYNC, (encoder) => sync.writeSyncStep1(encoder, room.doc)));
  if (room.awareness.getStates().size) onAwareness({ added: [...room.awareness.getStates().keys()], updated: [], removed: [] });
  return peer;
}
