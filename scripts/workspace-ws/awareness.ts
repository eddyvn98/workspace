import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { applyAwarenessUpdate } from "y-protocols/awareness";
import type { RoomPeer, WorkspaceRoom } from "./rooms";

/** Peers may forward awareness received from others; only their own identities are accepted. */
export function acceptAwareness(room: WorkspaceRoom, peer: RoomPeer, update: Uint8Array): void {
  if (peer.revoked || room.closed) return;
  if (update.byteLength > 512 * 1024) throw new Error("Awareness update exceeds the size limit");
  const decoder = decoding.createDecoder(update), count = decoding.readVarUint(decoder);
  if (count > room.config.maxClientsPerRoom * 4) throw new Error("Too many awareness states");
  const accepted: { id: number; clock: number; state: Record<string, unknown> | null }[] = [];
  const newIds = new Set<number>();
  for (let index = 0; index < count; index++) {
    const id = decoding.readVarUint(decoder), clock = decoding.readVarUint(decoder), text = decoding.readVarString(decoder);
    if (!Number.isSafeInteger(id) || id < 0 || id > 0xffffffff || !Number.isSafeInteger(clock) || clock < 0 || clock > 0xffffffff
      || text.length > 16 * 1024) throw new Error("Invalid awareness state");
    const state: unknown = JSON.parse(text);
    const owner = room.awarenessOwners.get(id);
    if (owner && owner !== peer) continue;
    if (state === null) { if (owner === peer) accepted.push({ id, clock, state: null }); continue; }
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid awareness state");
    const value = state as Record<string, unknown>;
    if (typeof value.email === "string" && value.email.trim().toLowerCase() !== peer.identity.userEmail) continue;
    if (!owner) newIds.add(id);
    if (peer.awarenessIds.size + newIds.size > 4) throw new Error("Too many client identities");
    const user = value.user && typeof value.user === "object" && !Array.isArray(value.user) ? value.user as Record<string, unknown> : {};
    accepted.push({ id, clock, state: { ...value, email: peer.identity.userEmail, clientId: id,
      user: { ...user, name: peer.identity.userEmail, email: peer.identity.userEmail } } });
  }
  if (decoder.pos !== decoder.arr.length) throw new Error("Invalid awareness message");
  const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, accepted.length);
  for (const { id, clock, state } of accepted) {
    room.awarenessOwners.set(id, peer); peer.awarenessIds.add(id);
    encoding.writeVarUint(encoder, id); encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, JSON.stringify(state));
  }
  applyAwarenessUpdate(room.awareness, encoding.toUint8Array(encoder), peer);
}
