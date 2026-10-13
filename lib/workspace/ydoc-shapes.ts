/**
 * The shared data model a live board uses, and the translation between it and
 * the plain board the rest of the app already works with.
 *
 *   doc.getMap('blocks')      blockId     -> block object
 *   doc.getMap('connectors')  connectorId -> connector object
 *   doc.getMap('meta')        { title, blockOrder }
 *
 * Three flat maps keyed by id, not a nested structure — the same decision
 * legacy locked in for mindmaps, and for the same reason: a CRDT has no clean
 * semantics for moving a subtree under concurrent edits. v2 gets this almost
 * for free, because its blocks and connectors are ALREADY flat records keyed
 * by id. Nothing has to be flattened on the way in or rebuilt on the way out,
 * which is the one place the mindmap port had to be careful.
 *
 * A whole block is one map value rather than a nested Y.Map of its fields.
 * That is a deliberate trade and worth naming: two people dragging the SAME
 * block at the same moment resolve last-writer-wins on the whole block
 * instead of merging field by field. Field-level merging would let one
 * person's move and another's recolour combine — but it would also let them
 * combine into a block neither of them meant, and it costs a CRDT object per
 * field on every block. Per-block granularity is what legacy chose too.
 */

import * as Y from "yjs";
import { BOARD_METADATA_KEYS, boardMetadata, type BoardMetadata } from "./boardMetadata";

export interface PlainBoard extends BoardMetadata {
  revision?: number;
  title: string;
  blocks: Record<string, unknown>;
  blockOrder: string[];
  connectors: Record<string, unknown>;
}

const BLOCKS = "blocks";
const CONNECTORS = "connectors";
const META = "meta";

/** Types the maps before anything observes them. An untyped shared type is a
 *  different instance from the typed one, so a listener registered against
 *  the wrong one silently never fires. */
export function workspaceDocMaps(doc: Y.Doc) {
  return {
    blocks: doc.getMap<unknown>(BLOCKS),
    connectors: doc.getMap<unknown>(CONNECTORS),
    meta: doc.getMap<unknown>(META),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The board as the rest of the app expects it. Read-only projection: the doc
 *  is the source of truth while a session is live. */
export function deriveBoardFromDoc(doc: Y.Doc): PlainBoard {
  const { blocks, connectors, meta } = workspaceDocMaps(doc);
  const storedOrder = meta.get("blockOrder");
  const order = Array.isArray(storedOrder) ? storedOrder.filter((id): id is string => typeof id === "string") : [];
  const present = new Set(blocks.keys());
  // Order is a plain array in `meta`, so it can disagree with the blocks map
  // after a concurrent add-and-reorder. Reconciled on read rather than
  // trusted: an id in the order with no block would render nothing, and a
  // block missing from the order would be invisible in the outline.
  const ordered = order.filter((id) => present.has(id));
  const missing = [...present].filter((id) => !ordered.includes(id));

  return {
    ...boardMetadata(Object.fromEntries(BOARD_METADATA_KEYS.map((key) => [key, meta.get(key)]))),
    ...(Number.isInteger(meta.get("boardRevision")) ? { revision: Number(meta.get("boardRevision")) } : {}),
    title: typeof meta.get("title") === "string" ? (meta.get("title") as string) : "",
    blocks: Object.fromEntries([...blocks.entries()]),
    blockOrder: [...ordered, ...missing],
    connectors: Object.fromEntries([...connectors.entries()]),
  };
}

/** Fills an empty doc from a stored board. Only ever called for a doc nothing
 *  has written yet — seeding a doc that already has content would replay a
 *  stale version over live edits. */
export function seedDocFromBoard(doc: Y.Doc, board: PlainBoard): void {
  const { blocks, connectors, meta } = workspaceDocMaps(doc);
  doc.transact(() => {
    for (const [id, block] of Object.entries(asRecord(board.blocks))) blocks.set(id, block);
    for (const [id, connector] of Object.entries(asRecord(board.connectors))) connectors.set(id, connector);
    for (const [key, value] of Object.entries(boardMetadata(board))) meta.set(key, value);
    meta.set("title", board.title ?? "");
    meta.set("blockOrder", Array.isArray(board.blockOrder) ? [...board.blockOrder] : []);
  }, "seed");
}

/**
 * Applies the difference between two plain boards to the doc.
 *
 * This is the seam that made the port tractable, borrowed from legacy's
 * applyTreeDiffToYDoc. v2's editor funnels every one of its edits through one
 * whole-board update, and rewriting those call sites to speak CRDT
 * individually would be a sprawling rewrite of the editor for no behavioural
 * gain. Diffing at the seam keeps local edits flowing through the doc while
 * leaving the editor untouched.
 *
 * Only what changed is written. Setting every block on every edit would
 * produce an update the size of the board for a one-character rename, and
 * every other participant would pay for it.
 *
 * Returns whether it actually mutated the doc. A caller that wants to know
 * "was there a real edit here" (e.g. to arm a wait for the server's
 * persistence ack) must use this return value rather than its own diff of
 * `previous`/`next` — a whole-board JSON/reference comparison can disagree
 * with this function's own per-key `sameValue` checks (object key order,
 * or a field reprocessed into an equal-but-not-identical value upstream),
 * which would arm a wait for an ack a no-op write never produces.
 */
export function applyBoardDiffToDoc(doc: Y.Doc, previous: PlainBoard, next: PlainBoard, origin?: unknown): boolean {
  const { blocks, connectors, meta } = workspaceDocMaps(doc);
  let mutated = false;
  doc.transact(() => {
    if (syncMap(blocks, asRecord(previous.blocks), asRecord(next.blocks))) mutated = true;
    if (syncMap(connectors, asRecord(previous.connectors), asRecord(next.connectors))) mutated = true;
    if (previous.title !== next.title) {
      meta.set("title", next.title);
      mutated = true;
    }
    for (const key of BOARD_METADATA_KEYS) {
      if (next[key] !== undefined && !sameValue(previous[key], next[key])) { meta.set(key, next[key]); mutated = true; }
    }
    if (!sameOrder(previous.blockOrder, next.blockOrder)) {
      meta.set("blockOrder", [...next.blockOrder]);
      mutated = true;
    }
  }, origin ?? "local");
  return mutated;
}

function syncMap(
  target: Y.Map<unknown>,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  let mutated = false;
  for (const id of Object.keys(previous)) {
    if (!(id in next)) {
      target.delete(id);
      mutated = true;
    }
  }
  for (const [id, value] of Object.entries(next)) {
    // Compared by value, not by identity: the editor rebuilds objects on
    // every render, so an identity check would rewrite the whole board on
    // every keystroke.
    // Most editor updates preserve every untouched block's object identity
    // (notably during drag). Avoid serializing those large records on every
    // pointer frame; retain the value comparison for callers that rebuild a
    // board from plain JSON.
    if (id in previous && previous[id] === value) continue;
    if (!(id in previous) || !sameValue(previous[id], value)) {
      target.set(id, value);
      mutated = true;
    }
  }
  return mutated;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
