import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentBoardState } from "./operations";

type Snapshot = Record<string, unknown>;
type HistoryAction = "undo" | "redo";
type HistoryRow = { historyId: bigint; beforeState: Snapshot; afterState: Snapshot };

const clone = <T>(value: T): T => structuredClone(value);
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const asMap = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function mergeValue(current: unknown, from: unknown, to: unknown): unknown {
  if (same(current, from)) return clone(to);
  if (same(from, to)) return clone(current);
  if (!isRecord(current) || !isRecord(from) || !isRecord(to)) return clone(current);

  const result = clone(current);
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const hasFrom = Object.prototype.hasOwnProperty.call(from, key);
    const hasTo = Object.prototype.hasOwnProperty.call(to, key);
    if (!hasFrom) {
      if (!hasCurrent && hasTo) result[key] = clone(to[key]);
      continue;
    }
    if (!hasTo) {
      if (hasCurrent && same(current[key], from[key])) delete result[key];
      continue;
    }
    if (!hasCurrent) continue;
    result[key] = mergeValue(current[key], from[key], to[key]);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function snapshotOf(state: AgentBoardState): Snapshot {
  return clone({ title: state.title, blocks: state.blocks, blockOrder: state.blockOrder, connectors: state.connectors, frames: state.frames ?? [], ...Object.fromEntries(Object.entries(state).filter(([key]) => key.startsWith("tree"))) });
}

function mergeCollection(current: Record<string, unknown>, from: Record<string, unknown>, to: Record<string, unknown>) {
  const result = clone(current);
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const hasFrom = Object.prototype.hasOwnProperty.call(from, key);
    const hasTo = Object.prototype.hasOwnProperty.call(to, key);
    if (!hasFrom) {
      if (!hasCurrent && hasTo) result[key] = clone(to[key]);
      continue;
    }
    if (!hasTo) {
      if (hasCurrent && same(current[key], from[key])) delete result[key];
      continue;
    }
    if (!hasCurrent) continue;
    result[key] = mergeValue(current[key], from[key], to[key]);
  }
  return result;
}

function mergeOrder(current: string[], to: string[], blocks: Record<string, unknown>): string[] {
  const order = current.filter((id) => id in blocks);
  for (const id of Object.keys(blocks)) {
    if (order.includes(id)) continue;
    const at = to.indexOf(id);
    const previous = at > 0 ? order.indexOf(to[at - 1]) : -1;
    order.splice(previous >= 0 ? previous + 1 : at === 0 ? 0 : order.length, 0, id);
  }
  return order;
}

export function applyInverse(current: Snapshot, from: Snapshot, to: Snapshot): Snapshot {
  const blocks = mergeCollection(asMap(current.blocks), asMap(from.blocks), asMap(to.blocks));
  const connectors = mergeCollection(asMap(current.connectors), asMap(from.connectors), asMap(to.connectors));
  const toOrder = Array.isArray(to.blockOrder) ? to.blockOrder.map(String) : [];
  const currentOrder = Array.isArray(current.blockOrder) ? current.blockOrder.map(String) : [];
  const fromOrder = Array.isArray(from.blockOrder) ? from.blockOrder.map(String) : [];
  const framesById = (value: unknown) => Object.fromEntries((Array.isArray(value) ? value : []).map((frame) => [String(asMap(frame).id), frame]));
  const frames = mergeCollection(framesById(current.frames), framesById(from.frames), framesById(to.frames));
  const frameOrder = same(current.frames, from.frames) ? to.frames : current.frames;
  const orderedFrameIds = (Array.isArray(frameOrder) ? frameOrder : []).map((frame) => String(asMap(frame).id));
  const layout = Object.fromEntries(Object.keys(to).filter((key) => key.startsWith("tree")).map((key) => [key, same(current[key], from[key]) ? to[key] : current[key]]));
  return {
    ...current, ...layout,
    frames: mergeOrder(orderedFrameIds, Object.keys(framesById(to.frames)), frames).map((id, order) => ({ ...asMap(frames[id]), order })),
    title: current.title === from.title ? to.title : current.title,
    blocks, connectors,
    blockOrder: mergeOrder(same(currentOrder, fromOrder) ? toOrder : currentOrder, toOrder, blocks),
  };
}

export async function rememberChange(
  tx: Prisma.TransactionClient,
  boardId: string,
  before: AgentBoardState,
  after: AgentBoardState,
): Promise<void> {
  const beforeState = snapshotOf(before);
  const afterState = snapshotOf(after);
  if (same(beforeState, afterState)) return;

  await tx.$executeRaw`DELETE FROM workspace_agent_history WHERE board_id = ${boardId} AND undone = TRUE`;
  await tx.$executeRaw`
    INSERT INTO workspace_agent_history (board_id, before_state, after_state)
    VALUES (${boardId}, ${JSON.stringify(beforeState)}::jsonb, ${JSON.stringify(afterState)}::jsonb)
  `;
  await tx.$executeRaw`
    DELETE FROM workspace_agent_history
    WHERE board_id = ${boardId} AND history_id IN (
      SELECT history_id FROM workspace_agent_history
      WHERE board_id = ${boardId} ORDER BY history_id DESC OFFSET 30
    )
  `;
}

export async function prepareHistory(
  boardId: string,
  mode: HistoryAction,
  current: Snapshot,
): Promise<{ snapshot: Snapshot; complete: (tx: Prisma.TransactionClient) => Promise<void> } | null> {
  const rows = mode === "undo"
    ? await prisma.$queryRaw<HistoryRow[]>`
        SELECT history_id AS "historyId", before_state AS "beforeState", after_state AS "afterState"
        FROM workspace_agent_history WHERE board_id = ${boardId} AND undone = FALSE
        ORDER BY history_id DESC LIMIT 1
      `
    : await prisma.$queryRaw<HistoryRow[]>`
        SELECT history_id AS "historyId", before_state AS "beforeState", after_state AS "afterState"
        FROM workspace_agent_history WHERE board_id = ${boardId} AND undone = TRUE
        ORDER BY history_id ASC LIMIT 1
      `;
  const change = rows[0];
  if (!change) return null;
  const expectedUndone = mode === "redo";
  return {
    snapshot: mode === "undo"
      ? applyInverse(current, change.afterState, change.beforeState)
      : applyInverse(current, change.beforeState, change.afterState),
    complete: async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE workspace_agent_history SET undone = ${!expectedUndone}
        WHERE board_id = ${boardId} AND history_id = ${change.historyId} AND undone = ${expectedUndone}
      `;
      if (changed !== 1) throw new Error("Workspace agent history changed before the board commit.");
    },
  };
}
