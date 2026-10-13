import type { Prisma } from "@prisma/client";

/**
 * Server-side diffing that turns one board save into per-block edit events —
 * the log behind the attribution dot and each block's history popover.
 *
 * Kept out of the route file so both the block diff and the connector diff
 * can live together, and so the route stays readable.
 */

export type BlockRecord = Record<string, Record<string, unknown>>;

export interface BoardEditEvent {
  boardId: string;
  blockId: string;
  actorEmail: string;
  opType: string;
  blockVersion: Prisma.InputJsonValue;
}

/**
 * Deep, key-order-independent stringify. `before` comes back from a Postgres
 * JSONB column, which canonicalizes key order on write, while `after` is the
 * request body's own JSON — the two can differ in key order for byte-
 * identical content, so a plain JSON.stringify comparison here would
 * misreport an unchanged block as edited on essentially every save.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function asBlockRecord(value: unknown): BlockRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] => (
      Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1])
    )),
  );
}

export function collectBlockEditEvents(
  boardId: string,
  previous: BlockRecord,
  next: BlockRecord,
  actorEmail: string,
  requestedOperation?: unknown,
): BoardEditEvent[] {
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...ids].flatMap((blockId) => {
    const before = previous[blockId];
    const after = next[blockId];
    if (stableStringify(before) === stableStringify(after)) return [];
    return [{
      boardId,
      blockId,
      actorEmail,
      opType: before && after && requestedOperation === "node.restore"
        ? "node.restore"
        : before && after ? "node.update" : after ? "node.add" : "node.delete",
      blockVersion: (after ?? before) as Prisma.InputJsonValue,
    }];
  });
}

/**
 * Connector changes, attributed to BOTH endpoint blocks.
 *
 * Wiring two blocks together is an edit to both of them as far as a reader
 * is concerned, so hovering either end shows it — legacy does exactly this
 * (docker/mindmap-ws/src/attribution.js:116). Without this, a collaborator
 * who only drew or removed connectors left no trace in any block's history.
 *
 * A connector whose endpoints changed is reported against the old and the
 * new endpoints alike, so neither end silently loses the event.
 */
export function collectConnectorEditEvents(
  boardId: string,
  previous: BlockRecord,
  next: BlockRecord,
  actorEmail: string,
): BoardEditEvent[] {
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const events: BoardEditEvent[] = [];

  for (const connectorId of ids) {
    const before = previous[connectorId];
    const after = next[connectorId];
    if (stableStringify(before) === stableStringify(after)) continue;

    const opType = before && after
      ? "relationship.update"
      : after ? "relationship.add" : "relationship.delete";
    const version = (after ?? before) as Record<string, unknown>;

    const endpoints = new Set<string>();
    for (const side of [before, after]) {
      const from = side?.fromBlockId;
      const to = side?.toBlockId;
      if (typeof from === "string" && from) endpoints.add(from);
      if (typeof to === "string" && to) endpoints.add(to);
    }

    for (const blockId of endpoints) {
      events.push({
        boardId,
        blockId,
        actorEmail,
        opType,
        blockVersion: version as Prisma.InputJsonValue,
      });
    }
  }

  return events;
}
