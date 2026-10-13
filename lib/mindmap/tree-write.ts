/**
 * lib/mindmap/tree-write.ts
 *
 * Incremental writer for a mindmap's node + relationship rows.
 *
 * The previous strategy was "delete every row for this mindmap, then bulk
 * re-insert the whole tree". It is simple, but every save — including editing
 * one word in one node — rewrote the entire map, so save cost grew with map
 * size instead of with edit size, and each save churned rows that never
 * changed (invalidating their createdAt/updatedAt too).
 *
 * This module instead compares the incoming flat rows against what is already
 * stored and issues only the differences: insert new ids, update the rows whose
 * content actually changed, delete the ids that disappeared. A save that
 * changes nothing issues no writes at all.
 *
 * Safe to reorder freely: `parentId`, `fromNodeId` and `toNodeId` are plain
 * columns (indexed, no foreign key — see prisma/schema.prisma), so no
 * parent-before-child insert ordering is required.
 */

import { Prisma } from "@prisma/client";

type JsonColumn = Prisma.InputJsonValue | typeof Prisma.JsonNull;

export interface TreeNodeRow {
  id: string;
  mindmapId: string;
  parentId: string | null;
  order: number;
  topic: string;
  description: string | null;
  icon: string | null;
  expanded: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  floating: boolean | null;
  floatingMapRoot: boolean | null;
  image: string | null;
  images: JsonColumn;
  link: string | null;
  table: JsonColumn;
  tableId: string | null;
  tableCellId: string | null;
  style: JsonColumn;
  descriptionStyle: JsonColumn;
}

export interface TreeRelRow {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  data: JsonColumn;
}

/** Columns compared to decide whether a stored node row needs an UPDATE.
 *  `mindmapId` is excluded (it is the query key) along with the timestamps,
 *  which the database owns. */
const NODE_FIELDS = [
  "parentId", "order", "topic", "description", "icon", "expanded",
  "x", "y", "width", "height", "floating", "floatingMapRoot", "image", "images", "link",
  "table", "tableId", "tableCellId", "style", "descriptionStyle",
] as const;

const REL_FIELDS = ["fromNodeId", "toNodeId", "data"] as const;

/** Key-order-independent comparison: a JSON column read back from Postgres
 *  can carry its keys in a different order than the object we are about to
 *  write, and treating that as a change would update every node on every
 *  save — exactly the churn this module exists to remove. `undefined` and
 *  Prisma's JsonNull sentinel both mean "no value" here, so both normalize
 *  to null. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return "null";
  // Prisma's null sentinels are opaque empty objects that serialize as "{}",
  // which would otherwise read as "an empty JSON object" and differ from the
  // null the database gives back — making every such row update forever.
  if (value === Prisma.JsonNull || value === Prisma.DbNull) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function differs(
  next: Record<string, unknown>,
  stored: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.some((field) => canonical(next[field]) !== canonical(stored[field]));
}

export interface TreeWriteStats {
  nodesCreated: number;
  nodesUpdated: number;
  nodesDeleted: number;
  relsCreated: number;
  relsUpdated: number;
  relsDeleted: number;
}

/** Minimal surface this writer needs from a Prisma client or transaction. */
type TreeWriteClient = {
  mindmapNode: {
    findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    createMany: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  mindmapRelationship: {
    findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    createMany: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

export async function applyTreeDiff(
  tx: TreeWriteClient,
  mindmapId: string,
  nodeRows: TreeNodeRow[],
  relRows: TreeRelRow[],
): Promise<TreeWriteStats> {
  const [storedNodes, storedRels] = await Promise.all([
    tx.mindmapNode.findMany({ where: { mindmapId } }),
    tx.mindmapRelationship.findMany({ where: { mindmapId } }),
  ]);

  const storedNodeById = new Map(storedNodes.map((row) => [String(row.id), row]));
  const storedRelById = new Map(storedRels.map((row) => [String(row.id), row]));
  // A retry or a merged Y.Doc can contain the same logical row more than
  // once. Keep the last value for each id before classifying the diff.
  const uniqueNodeRows = [...new Map(nodeRows.map((row) => [row.id, row])).values()];
  const uniqueRelRows = [...new Map(relRows.map((row) => [row.id, row])).values()];

  const nodesToCreate: TreeNodeRow[] = [];
  const nodesToUpdate: TreeNodeRow[] = [];
  for (const row of uniqueNodeRows) {
    const stored = storedNodeById.get(row.id);
    if (!stored) nodesToCreate.push(row);
    else if (differs(row as unknown as Record<string, unknown>, stored, NODE_FIELDS)) nodesToUpdate.push(row);
  }

  const relsToCreate: TreeRelRow[] = [];
  const relsToUpdate: TreeRelRow[] = [];
  for (const row of uniqueRelRows) {
    const stored = storedRelById.get(row.id);
    if (!stored) relsToCreate.push(row);
    else if (differs(row as unknown as Record<string, unknown>, stored, REL_FIELDS)) relsToUpdate.push(row);
  }

  const nextNodeIds = new Set(uniqueNodeRows.map((row) => row.id));
  const nextRelIds = new Set(uniqueRelRows.map((row) => row.id));
  const nodeIdsToDelete = [...storedNodeById.keys()].filter((id) => !nextNodeIds.has(id));
  const relIdsToDelete = [...storedRelById.keys()].filter((id) => !nextRelIds.has(id));

  if (relIdsToDelete.length) {
    await tx.mindmapRelationship.deleteMany({ where: { mindmapId, id: { in: relIdsToDelete } } });
  }
  if (nodeIdsToDelete.length) {
    await tx.mindmapNode.deleteMany({ where: { mindmapId, id: { in: nodeIdsToDelete } } });
  }
  if (nodesToCreate.length) {
    await tx.mindmapNode.createMany({ data: nodesToCreate, skipDuplicates: true });
  }
  for (const row of nodesToUpdate) {
    const { id, mindmapId: _omit, ...data } = row;
    await tx.mindmapNode.update({ where: { id }, data });
  }
  if (relsToCreate.length) {
    await tx.mindmapRelationship.createMany({
      data: relsToCreate.map((r) => ({ id: r.id, mindmapId, fromNodeId: r.fromNodeId, toNodeId: r.toNodeId, data: r.data })),
      skipDuplicates: true,
    });
  }
  for (const row of relsToUpdate) {
    await tx.mindmapRelationship.update({
      where: { id: row.id },
      data: { fromNodeId: row.fromNodeId, toNodeId: row.toNodeId, data: row.data },
    });
  }

  return {
    nodesCreated: nodesToCreate.length,
    nodesUpdated: nodesToUpdate.length,
    nodesDeleted: nodeIdsToDelete.length,
    relsCreated: relsToCreate.length,
    relsUpdated: relsToUpdate.length,
    relsDeleted: relIdsToDelete.length,
  };
}
