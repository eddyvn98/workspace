/**
 * lib/mindmap/repository.ts
 *
 * Single, unified Prisma-backed repository for the mindmap capability.
 *
 * This replaces TWO previously-separate, divergent file-based implementations
 * that both read/wrote the same data/mindmaps.json file with incompatible
 * shapes:
 *   - lib/capabilities/mindmap.ts     (bare array, owner_id/created_at)
 *   - lib/mcp/tools/mindmap-tools.ts  ({ mindmaps: [...] }, userId/createdAt)
 *
 * Both modules now delegate storage to this repository (see their updated
 * source) so neither the REST route (app/api/mindmaps/route.ts) nor the MCP
 * tool handlers/bridge need to change their external request/response shape.
 *
 * Storage model: Postgres via Prisma. The node tree is stored FLAT — one row
 * per node keyed by id, with parentId + order describing tree shape (see
 * prisma/schema.prisma MindmapNode) — and reassembled into the nested
 * MindmapNode tree shape the rest of the app expects on read.
 *
 * Access control: every read/write is owner-or-collaborator aware. The
 * caller is identified by NextAuth email (see resolveOwner() in
 * app/api/mcp/route.ts and getToken() in app/api/mindmaps/route.ts) — there
 * is no separate users table, identity is the email string itself.
 *   - Owner (Mindmap.ownerEmail === callerEmail) => implicit EDITOR, reported
 *     as role "owner".
 *   - Collaborator => role comes from a MindmapShare row for that email
 *     ("VIEWER" | "EDITOR").
 *   - Anyone else => no access (role null).
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/mindmap/known-users";
import { applyTreeDiff } from "@/lib/mindmap/tree-write";
import { publicLinkExpiresAt, type PublicLinkExpiration } from "@/lib/mindmap/public-link";
import { decodePersistedTable, encodePersistedTable } from "@/lib/mindmap/table-persistence";
import { Prisma } from "@prisma/client";
import type {
  Mindmap as PrismaMindmap,
  MindmapNode as PrismaMindmapNode,
  MindmapRelationship as PrismaMindmapRelationship,
  MindmapShareRole,
} from "@prisma/client";

/** Prisma's generated Json input types (InputJsonValue) reject a bare `null`
 *  (you must pass Prisma.JsonNull / DbNull instead), and reject
 *  `Record<string, unknown>` directly without an intermediate cast because
 *  the generated type is a closed recursive union. This helper centralizes
 *  that conversion for the handful of nullable-JSON columns in this schema
 *  (MindmapNode.style, MindmapRelationship.data). */
function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

/** Same conversion as toJsonInput, for the opaque-array-shaped Json? columns
 *  (canvasShapes, freehandStrokes) — arrays aren't assignable to
 *  Record<string, unknown> so they need their own overload. */
function toJsonArrayInput(
  value: unknown[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

// ─── Public types ───────────────────────────────────────────────────────────

/** Nested node tree shape — matches components/features/chat/mindmap/mindmap-types.ts MindmapNode
 *  closely enough for both legacy call sites (which only rely on a subset of
 *  fields: id, topic, children, description, icon, expanded, style, x, y,
 *  relationships). Kept structurally loose here to avoid a hard dependency
 *  from lib/ -> components/. */
export interface MindmapNodeLike {
  id: string;
  topic: string;
  children: MindmapNodeLike[];
  expanded?: boolean;
  description?: string;
  icon?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  floating?: boolean;
  floatingMapRoot?: boolean;
  image?: string;
  /** Mirrors MindmapNode["images"] (mindmap-types.ts) structurally — a plain
   *  string is a URL at its default filmstrip slot, the object form carries
   *  an optional x/y nudge offset. Inlined rather than imported to keep this
   *  interface's lib/ -> components/ independence (see comment above). */
  images?: (string | { url: string; x?: number; y?: number; width?: number; height?: number })[];
  link?: string;
  table?: Record<string, unknown>;
  tableV2?: Record<string, unknown>;
  tableId?: string;
  tableCellId?: string;
  style?: Record<string, unknown>;
  descriptionStyle?: Record<string, unknown>;
  relationships?: MindmapRelationshipLike[];
  [key: string]: unknown;
}

/** Map-level display settings, saved alongside (not folded into) the node
 *  tree — see prisma/schema.prisma Mindmap model. */
export interface MindmapDisplaySettings {
  layoutType?: string;
  connectionStyle?: string;
  nodeShape?: string;
  freeLayout?: boolean;
  stylePreset?: Record<string, unknown> | null;
  /** Canvas-level shapes and pen-tool strokes — neither lives on the node
   *  tree, so both are opaque arrays as far as this repository is concerned. */
  canvasShapes?: unknown[] | null;
  freehandStrokes?: unknown[] | null;
}

export interface MindmapRelationshipLike {
  id: string;
  from: string;
  to: string;
  type: "straight" | "orthogonal" | "curved" | "straight_arrow";
  lineLabel?: string;
  [key: string]: unknown;
}

export type MindmapRole = "owner" | MindmapShareRole;

export interface MindmapAccess {
  role: MindmapRole | null;
  isOwner: boolean;
  canWrite: boolean;
}

/** Denormalized mindmap record: metadata + reconstructed nested tree. This is
 *  the shape both legacy adapters project into their own external formats. */
export interface MindmapRecord extends MindmapDisplaySettings {
  id: string;
  ownerEmail: string;
  title: string;
  tree: MindmapNodeLike;
  createdAt: Date;
  updatedAt: Date;
  /** Monotonic version of this record — see Mindmap.revision in
   *  prisma/schema.prisma. Every writer that could be racing another one
   *  (the realtime snapshot worker, a client replaying a queued edit) sends
   *  back the revision its content was derived from, and is refused if the
   *  stored revision has moved on. */
  revision: number;
  /** Whether anyone besides the owner has been invited to this map. Drives
   *  the sidebar's "unseen update" dot, which only makes sense for maps with
   *  actual collaborators — see MindmapListPanel.tsx hasUnseenUpdates(). */
  hasCollaborators: boolean;
  /** Whether an active, non-expired anonymous public link exists. */
  hasPublicViewLink: boolean;
}

export interface MindmapListRecord extends MindmapRecord {
  accessRole: MindmapRole;
}

export interface MindmapSidebarHideView {
  id: string;
  mindmapId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  hiddenAt: Date;
  isOwner: boolean;
  accessRole: MindmapRole;
}

export class MindmapAccessError extends Error {
  code: "NOT_FOUND" | "FORBIDDEN";
  constructor(code: "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.code = code;
    this.name = "MindmapAccessError";
  }
}

function canonicalEmail(email: string | null | undefined): string {
  return normalizeEmail(email) ?? email?.trim() ?? "";
}

// ─── Access control ─────────────────────────────────────────────────────────

/** Resolve the caller's access level for a mindmap. Returns role=null (no
 *  access) if the mindmap doesn't exist OR the caller is neither owner nor
 *  an invited collaborator — callers should treat "not found" and "no
 *  access" the same way (404) to avoid leaking existence of private maps. */
export async function getAccess(mindmapId: string, callerEmail: string): Promise<MindmapAccess> {
  const caller = canonicalEmail(callerEmail);
  const mindmap = await prisma.mindmap.findUnique({
    where: { id: mindmapId },
    select: { ownerEmail: true },
  });
  if (!mindmap) return { role: null, isOwner: false, canWrite: false };

  if (canonicalEmail(mindmap.ownerEmail) === caller) {
    return { role: "owner", isOwner: true, canWrite: true };
  }

  const share = await prisma.mindmapShare.findFirst({
    where: { mindmapId, invitedEmail: { equals: caller, mode: "insensitive" } },
    select: { role: true },
  });
  if (!share) return { role: null, isOwner: false, canWrite: false };

  return { role: share.role, isOwner: false, canWrite: share.role === "EDITOR" };
}

async function requireAccess(
  mindmapId: string,
  callerEmail: string,
  need: "read" | "write",
): Promise<MindmapAccess> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }
  if (need === "write" && !access.canWrite) {
    throw new MindmapAccessError("FORBIDDEN", "Viewer role cannot write to this mindmap");
  }
  return access;
}

// ─── Tree (de)serialization: flat Prisma rows <-> nested MindmapNodeLike ────

function buildTree(
  nodes: PrismaMindmapNode[],
  relationships: PrismaMindmapRelationship[],
): MindmapNodeLike {
  const byId = new Map<string, MindmapNodeLike>();
  const relsByFrom = new Map<string, MindmapRelationshipLike[]>();

  for (const rel of relationships) {
    const list = relsByFrom.get(rel.fromNodeId) ?? [];
    list.push({
      id: rel.id,
      from: rel.fromNodeId,
      to: rel.toNodeId,
      type: (rel.data as Record<string, unknown> | null)?.type as MindmapRelationshipLike["type"] ?? "straight_arrow",
      ...(rel.data as Record<string, unknown> | null),
    });
    relsByFrom.set(rel.fromNodeId, list);
  }

  for (const n of nodes) {
    const persistedTable = decodePersistedTable(n.table);
    byId.set(n.id, {
      id: n.id,
      topic: n.topic,
      children: [],
      expanded: n.expanded,
      description: n.description ?? undefined,
      icon: n.icon ?? undefined,
      x: n.x ?? undefined,
      y: n.y ?? undefined,
      width: n.width ?? undefined,
      height: n.height ?? undefined,
      floating: n.floating ?? undefined,
      floatingMapRoot: n.floatingMapRoot ?? undefined,
      image: n.image ?? undefined,
      images: (n.images as MindmapNodeLike["images"] | null) ?? undefined,
      link: n.link ?? undefined,
      table: persistedTable.table,
      tableV2: persistedTable.tableV2,
      tableId: n.tableId ?? undefined,
      tableCellId: n.tableCellId ?? undefined,
      style: (n.style as Record<string, unknown> | null) ?? undefined,
      descriptionStyle: (n.descriptionStyle as Record<string, unknown> | null) ?? undefined,
      relationships: relsByFrom.get(n.id),
    });
  }

  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  let root: MindmapNodeLike | undefined;
  for (const n of sorted) {
    const wrapped = byId.get(n.id)!;
    if (n.parentId === null) {
      root = wrapped;
      continue;
    }
    const parent = byId.get(n.parentId);
    if (parent) parent.children.push(wrapped);
  }

  const restoredRoot = root ?? {
    id: randomUUID(),
    topic: "Untitled",
    children: [],
    expanded: true,
  };

  // `virtual-root` is a client-only multi-map sentinel. It cannot be stored
  // as-is because node IDs are global across all mindmaps. The persisted
  // wrapper is identified by its topic and converted back to the sentinel so
  // the editor keeps its multi-map behavior after reload.
  // Match on the topic alone: a canvas legitimately holds zero maps (brand-new,
  // still waiting for a Map Layout pick) or exactly one, and unwrapping those
  // would surface the container itself as a drawable node.
  // "New Mindmap" is also accepted here because older saves could persist the
  // container under that stale default topic instead of renaming it to
  // "Virtual Root" (see appendStandaloneMap / appendImportedMindmaps) — treat
  // it as the same sentinel so those pre-existing maps unwrap correctly too.
  if (restoredRoot.topic === "Virtual Root" || restoredRoot.topic === "New Mindmap") {
    return { ...restoredRoot, id: "virtual-root", topic: "Virtual Root" };
  }
  return restoredRoot;
}

/** Flatten a nested MindmapNodeLike tree into rows ready for a bulk insert,
 *  preserving order and parent linkage. Existing node ids are kept; nodes
 *  missing an id (freshly authored client-side) get one minted. */
interface FlatNodeRow {
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
  images: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  link: string | null;
  table: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  tableId: string | null;
  tableCellId: string | null;
  style: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  descriptionStyle: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

interface FlatRelRow {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  data: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}

function remapTreeIdsForCreate(tree: MindmapNodeLike): MindmapNodeLike {
  const nodeIdMap = new Map<string, string>();

  function cloneNode(node: MindmapNodeLike): MindmapNodeLike {
    const nextId = randomUUID();
    if (node.id) {
      nodeIdMap.set(node.id, nextId);
    }

    return {
      ...node,
      id: nextId,
      children: (node.children ?? []).map(cloneNode),
    };
  }

  function rewriteRelationships(node: MindmapNodeLike): MindmapNodeLike {
    return {
      ...node,
      relationships: (node.relationships ?? []).map((rel) => ({
        ...rel,
        id: randomUUID(),
        from: node.id,
        to: nodeIdMap.get(rel.to) ?? rel.to,
      })),
      children: (node.children ?? []).map(rewriteRelationships),
    };
  }

  return rewriteRelationships(cloneNode(tree));
}

/** Does this tree hold a node with `id` anywhere below its root? */
function treeContainsId(tree: MindmapNodeLike, id: string): boolean {
  return (tree.children ?? []).some((child) => child.id === id || treeContainsId(child, id));
}

function flattenTree(
  mindmapId: string,
  tree: MindmapNodeLike,
  existingVirtualRootId?: string | null,
): { nodeRows: FlatNodeRow[]; relRows: FlatRelRow[] } {
  const nodeRows: FlatNodeRow[] = [];
  const relRows: FlatRelRow[] = [];
  // Every save re-derives this from the client's "virtual-root" sentinel (see
  // buildTree above), so without reusing the already-persisted id, each save
  // minted a brand new random one — deleting and recreating the container row
  // on every single write instead of just updating it.
  const persistedVirtualRootId = tree.id === "virtual-root" ? (existingVirtualRootId || randomUUID()) : null;
  const remapId = (id: string | undefined, fallback: string) =>
    id === "virtual-root" && persistedVirtualRootId ? persistedVirtualRootId : (id || fallback);

  function visit(node: MindmapNodeLike, parentId: string | null, order: number, forcedId?: string) {
    const id = forcedId || node.id || randomUUID();
    nodeRows.push({
      id,
      mindmapId,
      parentId,
      order,
      topic: node.topic ?? "Untitled",
      description: node.description ?? null,
      icon: node.icon ?? null,
      expanded: node.expanded ?? true,
      x: typeof node.x === "number" ? node.x : null,
      y: typeof node.y === "number" ? node.y : null,
      width: typeof node.width === "number" ? node.width : null,
      height: typeof node.height === "number" ? node.height : null,
      floating: typeof node.floating === "boolean" ? node.floating : null,
      floatingMapRoot: typeof node.floatingMapRoot === "boolean" ? node.floatingMapRoot : null,
      image: node.image ?? null,
      images: node.images?.length
        ? (node.images as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      link: node.link ?? null,
      table: toJsonInput(encodePersistedTable(node.table, node.tableV2)) ?? Prisma.JsonNull,
      tableId: node.tableId ?? null,
      tableCellId: node.tableCellId ?? null,
      style: toJsonInput((node.style as Record<string, unknown> | undefined) ?? null) ?? Prisma.JsonNull,
      descriptionStyle: toJsonInput((node.descriptionStyle as Record<string, unknown> | undefined) ?? null) ?? Prisma.JsonNull,
    });

    for (const rel of node.relationships ?? []) {
      relRows.push({
        id: rel.id || randomUUID(),
        // Relationships live on the root-level tree object after AI actions
        // are applied. Preserve the explicit endpoint instead of using the
        // node currently being visited (which made every connector originate
        // from the root when the tree was persisted).
        fromNodeId: remapId(rel.from, id),
        toNodeId: remapId(rel.to, rel.to || id),
        data: toJsonInput({ ...rel, id: undefined, from: undefined, to: undefined } as Record<string, unknown>) ?? Prisma.JsonNull,
      });
    }

    (node.children ?? []).forEach((child, idx) => visit(child, id, idx));
  }

  visit(tree, null, 0, persistedVirtualRootId || undefined);
  return { nodeRows, relRows };
}

/** Write a mindmap's node+relationship set inside a transaction, issuing only
 *  the rows that actually changed — see lib/mindmap/tree-write.ts. Used by
 *  updateMindmap (tree replace) and the migration script; the name is kept
 *  because callers still hand over a whole tree, matching the legacy
 *  semantics of update_mindmap — this is not used for the fine-grained
 *  addNode/deleteNode paths below, which mutate in place. */
// A big map's diff writes row-by-row for the changed nodes, which can exceed
// Prisma's default 5s interactive-transaction budget on a first save that
// touches everything. Only the first save of a large map is ever this heavy;
// steady-state edits finish in a handful of statements.
const TREE_WRITE_TIMEOUT_MS = 30_000;

/** Outcome of a tree write. `stale` means the caller passed an
 *  `expectedRevision` that no longer matches what is stored — someone else
 *  wrote first, and this content was derived from the older state, so it must
 *  not be applied. The caller refetches and retries from the new revision. */
export type TreeWriteResult =
  | { ok: true; revision: number; updatedAt: Date }
  | { ok: false; reason: "gone"; revision: null }
  | { ok: false; reason: "stale"; revision: number };

interface ReplaceTreeOptions {
  /** Extra columns to write in the SAME transaction as the tree, so a reader
   *  can never observe the new title/settings without the new tree. */
  metadata?: Prisma.MindmapUpdateInput;
  /** Apply only if the stored revision still equals this. Omit for writes
   *  that are unconditionally authoritative (create, an explicit user save). */
  expectedRevision?: number;
}

async function replaceTree(
  mindmapId: string,
  tree: MindmapNodeLike,
  options: ReplaceTreeOptions = {},
): Promise<TreeWriteResult> {
  const result = await prisma.$transaction(async (tx): Promise<TreeWriteResult> => {
    // REST autosave and the realtime snapshot worker can write the same map at
    // the same time. Serialize those writes on the parent row so one
    // transaction cannot delete rows while another inserts them.
    const locked = await tx.$queryRaw<{ id: string; revision: number }[]>`
      SELECT "id", "revision" FROM "mindmaps" WHERE "id" = ${mindmapId} FOR UPDATE`;
    const current = locked[0];
    if (!current) return { ok: false, reason: "gone", revision: null };
    // Compare-and-set INSIDE the lock. Checking before opening the transaction
    // would let two writers that both read the same revision both pass.
    if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) {
      return { ok: false, reason: "stale", revision: current.revision };
    }
    // Looked up under the same lock so a concurrent writer's freshly-persisted
    // root id is always the one reused here, never a stale pre-lock read.
    const existingRootId = tree.id === "virtual-root"
      ? (await tx.mindmapNode.findFirst({ where: { mindmapId, parentId: null }, select: { id: true } }))?.id ?? null
      : null;
    // Reuse that row's id for the container ONLY if it really is the container.
    // Drawing a shape (or adding a second map) puts a brand-new container above
    // what used to be the root, so the row found above is now one of its
    // CHILDREN — and handing its id to the container made a node its own parent.
    // The container overwrote the old root's row, the map collapsed to a single
    // "Virtual Root" node, and every later save wrote that same empty map back.
    const existingVirtualRootId =
      existingRootId && treeContainsId(tree, existingRootId) ? null : existingRootId;
    const { nodeRows, relRows } = flattenTree(mindmapId, tree, existingVirtualRootId);
    await applyTreeDiff(tx as unknown as Parameters<typeof applyTreeDiff>[0], mindmapId, nodeRows, relRows);
    // Bumped here rather than by a separate statement afterwards: the revision
    // and `updatedAt` must become visible together with the rows they describe,
    // or a reader (or the ws snapshot worker) can see a version number that
    // does not yet correspond to any stored tree.
    const bumped = await tx.mindmap.update({
      where: { id: mindmapId },
      data: { ...(options.metadata ?? {}), revision: { increment: 1 } },
      select: { revision: true, updatedAt: true },
    });
    return { ok: true, revision: bumped.revision, updatedAt: bumped.updatedAt };
  }, { timeout: TREE_WRITE_TIMEOUT_MS });

  if (!result.ok) return result;

  // Keep the knowledge base's NODE-sourced chunks current on every tree
  // save (create/update/realtime-sync/snapshot-restore all funnel through
  // here) — see lib/mindmap/knowledge-repository.ts.
  const { syncNodeChunksFromTree } = await import("@/lib/mindmap/knowledge-repository");
  await syncNodeChunksFromTree(mindmapId, tree);
  return result;
}

/** replaceTree for the callers whose write is unconditional — anything other
 *  than "gone" (the map was deleted mid-write) is a real failure there. */
async function replaceTreeOrThrow(
  mindmapId: string,
  tree: MindmapNodeLike,
  metadata?: Prisma.MindmapUpdateInput,
): Promise<void> {
  const result = await replaceTree(mindmapId, tree, { metadata });
  if (!result.ok && result.reason !== "gone") {
    throw new Error(`Tree write for ${mindmapId} was refused: ${result.reason}`);
  }
}

async function loadRecord(mindmap: PrismaMindmap): Promise<MindmapRecord> {
  const [nodes, relationships, shareCount] = await Promise.all([
    prisma.mindmapNode.findMany({ where: { mindmapId: mindmap.id } }),
    prisma.mindmapRelationship.findMany({ where: { mindmapId: mindmap.id } }),
    prisma.mindmapShare.count({ where: { mindmapId: mindmap.id } }),
  ]);
  return {
    id: mindmap.id,
    ownerEmail: mindmap.ownerEmail,
    title: mindmap.title,
    tree: buildTree(nodes, relationships),
    createdAt: mindmap.createdAt,
    updatedAt: mindmap.updatedAt,
    revision: mindmap.revision,
    hasCollaborators: shareCount > 0,
    hasPublicViewLink: Boolean(
      mindmap.publicViewEnabled &&
      mindmap.publicViewToken &&
      (!mindmap.publicViewExpiresAt || mindmap.publicViewExpiresAt > new Date()),
    ),
    layoutType: mindmap.layoutType ?? undefined,
    connectionStyle: mindmap.connectionStyle ?? undefined,
    nodeShape: mindmap.nodeShape ?? undefined,
    freeLayout: mindmap.freeLayout ?? undefined,
    stylePreset: (mindmap.stylePreset as Record<string, unknown> | null) ?? undefined,
    canvasShapes: (mindmap.canvasShapes as unknown[] | null) ?? undefined,
    freehandStrokes: (mindmap.freehandStrokes as unknown[] | null) ?? undefined,
  };
}

// ─── CRUD API ────────────────────────────────────────────────────────────────

/** List mindmaps the caller owns OR has been shared with (any role). */
export async function listMindmaps(callerEmail: string): Promise<MindmapListRecord[]> {
  const caller = canonicalEmail(callerEmail);
  const [owned, shared, callerShares] = await Promise.all([
    prisma.mindmap.findMany({
      where: { ownerEmail: { equals: caller, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mindmap.findMany({
      where: { shares: { some: { invitedEmail: { equals: caller, mode: "insensitive" } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mindmapShare.findMany({
      where: { invitedEmail: { equals: caller, mode: "insensitive" } },
      select: { mindmapId: true, role: true },
    }),
  ]);

  const byId = new Map<string, PrismaMindmap>();
  for (const m of [...owned, ...shared]) byId.set(m.id, m);

  // Newest-created first, and it stays there: the sidebar is a place people
  // learn by position, and ordering by last edit moved a map every time it was
  // touched — you came back to a list rearranged under you. Creation order is
  // the one thing about a map that never changes.
  const sorted = [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const accessById = new Map(callerShares.map((share) => [share.mindmapId, share.role as MindmapRole]));
  return Promise.all(sorted.map(async (mindmap) => {
    const record = await loadRecord(mindmap);
    return { ...record, accessRole: accessById.get(mindmap.id) ?? "owner" };
  }));
}

export async function listHiddenMindmaps(callerEmail: string): Promise<MindmapSidebarHideView[]> {
  const caller = canonicalEmail(callerEmail);
  const hidden = await prisma.mindmapSidebarHide.findMany({
    where: {
      userEmail: caller,
      mindmap: {
        OR: [
          { ownerEmail: { equals: caller, mode: "insensitive" } },
          { shares: { some: { invitedEmail: { equals: caller, mode: "insensitive" } } } },
        ],
      },
    },
    include: {
      mindmap: {
        select: {
          id: true,
          title: true,
          ownerEmail: true,
          createdAt: true,
          updatedAt: true,
          shares: { where: { invitedEmail: { equals: caller, mode: "insensitive" } }, select: { role: true }, take: 1 },
        },
      },
    },
    orderBy: { hiddenAt: "desc" },
  });
  return hidden.map((entry) => {
    const isOwner = canonicalEmail(entry.mindmap.ownerEmail) === caller;
    return {
      id: entry.id,
      mindmapId: entry.mindmap.id,
      title: entry.mindmap.title,
      createdAt: entry.mindmap.createdAt,
      updatedAt: entry.mindmap.updatedAt,
      hiddenAt: entry.hiddenAt,
      isOwner,
      accessRole: isOwner ? "owner" : entry.mindmap.shares[0]?.role ?? "VIEWER",
    };
  });
}

export async function hideMindmapFromSidebar(mindmapId: string, callerEmail: string): Promise<void> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  const userEmail = canonicalEmail(callerEmail);
  await prisma.mindmapSidebarHide.upsert({
    where: { mindmapId_userEmail: { mindmapId, userEmail } },
    update: { hiddenAt: new Date() },
    create: { mindmapId, userEmail },
  });
}

export async function restoreMindmapToSidebar(mindmapId: string, callerEmail: string): Promise<void> {
  await prisma.mindmapSidebarHide.deleteMany({
    where: { mindmapId, userEmail: canonicalEmail(callerEmail) },
  });
}

/** Fetch one mindmap. Throws MindmapAccessError("NOT_FOUND") if the caller
 *  has no access (owner or share) or the mindmap doesn't exist. */
export async function getMindmap(mindmapId: string, callerEmail: string): Promise<MindmapRecord> {
  await requireAccess(mindmapId, callerEmail, "read");
  const mindmap = await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } });
  return loadRecord(mindmap);
}

export async function createMindmap(
  ownerEmail: string,
  title: string,
  tree: MindmapNodeLike,
  settings?: MindmapDisplaySettings,
): Promise<MindmapRecord> {
  const owner = canonicalEmail(ownerEmail);
  const normalizedTree = remapTreeIdsForCreate(tree);
  const mindmap = await prisma.mindmap.create({
    data: {
      ownerEmail: owner,
      title,
      layoutType: settings?.layoutType,
      connectionStyle: settings?.connectionStyle,
      nodeShape: settings?.nodeShape,
      freeLayout: settings?.freeLayout,
      stylePreset: toJsonInput(settings?.stylePreset),
      canvasShapes: toJsonArrayInput(settings?.canvasShapes),
      freehandStrokes: toJsonArrayInput(settings?.freehandStrokes),
    },
  });
  await replaceTreeOrThrow(mindmap.id, normalizedTree);
  // Re-read: replaceTree bumped `revision` and `updatedAt`, so the row from
  // create() above is already one version behind what is stored.
  const record = await loadRecord(
    await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmap.id } }),
  );

  // Seed an initial MindmapSnapshot so the FIRST realtime session (see
  // docker/mindmap-ws/src/persistence.js's bindState) has real content to
  // load from. Without this, a brand-new mindmap has MindmapNode rows but no
  // MindmapSnapshot yet, so bindState finds nothing and seeds an empty
  // placeholder doc — silently discarding whatever was created here until
  // someone re-adds it during a live session.
  await prisma.mindmapSnapshot.create({
    data: {
      mindmapId: mindmap.id,
      treeJson: record.tree as unknown as Prisma.InputJsonValue,
      createdBy: owner,
      label: "Initial",
      // Deliberately null: `baseRevision` marks a snapshot captured FROM a
      // realtime room, and is how repository-seed.js recognises one whose sync
      // never landed. This snapshot is a copy of the repository itself, so it
      // must never be mistaken for such an orphan.
      baseRevision: null,
    },
  });

  return record;
}

/** The display columns of a Prisma update, from whichever writer supplied them.
 *  Only keys that are actually present are emitted: `undefined` means "this
 *  writer is not saying anything about that setting", which is not the same as
 *  clearing it, and both the REST save and a realtime snapshot rely on the
 *  difference. */
function displayMetadata(settings: MindmapDisplaySettings): Prisma.MindmapUpdateInput {
  return {
    ...(settings.layoutType !== undefined ? { layoutType: settings.layoutType } : {}),
    ...(settings.connectionStyle !== undefined ? { connectionStyle: settings.connectionStyle } : {}),
    ...(settings.nodeShape !== undefined ? { nodeShape: settings.nodeShape } : {}),
    ...(settings.freeLayout !== undefined ? { freeLayout: settings.freeLayout } : {}),
    ...(settings.stylePreset !== undefined ? { stylePreset: toJsonInput(settings.stylePreset) } : {}),
    ...(settings.canvasShapes !== undefined ? { canvasShapes: toJsonArrayInput(settings.canvasShapes) } : {}),
    ...(settings.freehandStrokes !== undefined ? { freehandStrokes: toJsonArrayInput(settings.freehandStrokes) } : {}),
  };
}

/**
 * Overwrite a mindmap's current MindmapNode/MindmapRelationship rows from a
 * realtime-derived tree. Called (server-to-server, shared-secret authed) by
 * docker/mindmap-ws whenever it persists a snapshot, so that the REST-facing
 * repository state doesn't drift stale behind edits made through the live
 * Y.Doc — see app/api/mindmaps/[mindmapId]/sync-tree/route.ts. No caller
 * email / access check here: authentication happens at the route layer
 * (internal shared-secret bearer, mirroring docker/mindmap-ws's own
 * internal-auth.js pattern for the reverse direction), and this call is
 * inherently privileged (mindmap-ws only pushes state it itself computed
 * from an already-write-authorized realtime session).
 *
 * `baseRevision` is the Mindmap.revision the Y.Doc `tree` was derived from —
 * NOT a timestamp. A client's own REST PUT (app/api/mindmaps PUT ->
 * updateMindmap) and this server-to-server sync race each other, most visibly
 * right at page refresh/tab close: closing the tab both flushes the client's
 * pending save AND closes its websocket, which makes mindmap-ws treat it as
 * "last viewer left the room" and snapshot-sync too.
 *
 * This used to be decided by comparing the ws container's capture time against
 * the app's `updatedAt`. Those are two different processes' wall clocks, so the
 * comparison could not tell "my content is newer" from "my clock is ahead": a
 * ws clock running behind silently discarded genuinely newer realtime edits,
 * one running ahead let stale snapshots overwrite fresh saves, and neither
 * case could detect a snapshot derived from content that simply predated the
 * REST write. A revision answers the actual question — "was this content
 * derived from what is stored right now?" — and is checked under the same row
 * lock as the write, so two concurrent syncs cannot both pass.
 *
 * Returns the write result: `ok` with the new revision, or `stale` with the
 * revision that is actually stored, so the caller can reseed from it.
 */
export async function syncTreeFromRealtime(
  mindmapId: string,
  tree: MindmapNodeLike,
  baseRevision: number,
  display?: MindmapDisplaySettings,
): Promise<TreeWriteResult> {
  // Since Phase 4 the realtime document carries the map-level settings as well
  // as the tree, so a snapshot writes both — in the same transaction and under
  // the same revision check. Writing only the tree would let the room's own
  // snapshot silently revert a preset or a drawn shape a collaborator changed
  // during the session, since the room is where that change lived.
  const metadata: Prisma.MindmapUpdateInput = display ? displayMetadata(display) : {};
  return replaceTree(mindmapId, tree, { expectedRevision: baseRevision, metadata });
}

export async function updateMindmap(
  mindmapId: string,
  callerEmail: string,
  updates: { title?: string; tree?: MindmapNodeLike } & MindmapDisplaySettings,
): Promise<MindmapRecord> {
  await requireAccess(mindmapId, callerEmail, "write");

  const metadata: Prisma.MindmapUpdateInput = {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...displayMetadata(updates),
  };

  if (updates.tree !== undefined) {
    // Metadata rides along inside the tree write's transaction. Writing it
    // first in its own statement bumped `updatedAt` BEFORE the tree landed,
    // which left a window where the realtime snapshot worker saw a version
    // stamp older than its own capture and overwrote a save still in flight —
    // and made the `updated_at` returned below describe a moment before the
    // tree it is handed back with.
    await replaceTreeOrThrow(mindmapId, updates.tree, metadata);
  } else if (Object.keys(metadata).length > 0) {
    // Title/settings-only save (a rename). Still a new revision: an open
    // realtime room holding the previous one must know it is behind.
    await prisma.mindmap.update({
      where: { id: mindmapId },
      data: { ...metadata, revision: { increment: 1 } },
    });
  }
  // Otherwise the request carried nothing, and a write with no content is not
  // a write: it must not bump `revision` or restamp `updatedAt`. This is the
  // ORDINARY case during a collaborative session, not a malformed request —
  // the realtime document owns the tree (Phase 2) and the save carries only
  // what this tab changed (Phase 3), so a body with no fields at all is what
  // an autosave produces while someone types. Treating each one as a write
  // moved the map's version number underneath the open room and reordered
  // everyone's recent-maps list for a change nobody made. `requireAccess`
  // above still runs, so an unauthorized caller is still refused.

  // Read back AFTER every write, so `updatedAt` and `revision` describe the
  // state that is actually stored rather than an intermediate one.
  return loadRecord(await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } }));
}

export async function deleteMindmap(mindmapId: string, callerEmail: string): Promise<void> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  if (!access.isOwner) throw new MindmapAccessError("FORBIDDEN", "Only the owner can delete a mindmap");
  await prisma.mindmap.delete({ where: { id: mindmapId } });
}

/** Add a single child node under an existing parent node without touching
 *  the rest of the tree (fine-grained — used by add_mindmap_node). */
export async function addNode(
  mindmapId: string,
  callerEmail: string,
  parentId: string,
  node: { topic: string; description?: string; icon?: string },
): Promise<{ mindmap: MindmapRecord; node: MindmapNodeLike }> {
  await requireAccess(mindmapId, callerEmail, "write");

  const parent = await prisma.mindmapNode.findFirst({ where: { id: parentId, mindmapId } });
  if (!parent) throw new MindmapAccessError("NOT_FOUND", "Parent node not found");

  const siblingCount = await prisma.mindmapNode.count({ where: { mindmapId, parentId } });

  const created = await prisma.mindmapNode.create({
    data: {
      mindmapId,
      parentId,
      order: siblingCount,
      topic: node.topic,
      description: node.description ?? null,
      icon: node.icon ?? null,
      expanded: true,
    },
  });

  await prisma.mindmap.update({ where: { id: mindmapId }, data: { updatedAt: new Date() } });

  const mindmap = await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } });
  return {
    mindmap: await loadRecord(mindmap),
    node: {
      id: created.id,
      topic: created.topic,
      children: [],
      expanded: created.expanded,
      description: created.description ?? undefined,
      icon: created.icon ?? undefined,
    },
  };
}

/** Delete a node and its entire subtree (cascade via recursive delete, since
 *  Postgres FK cascade is on mindmapId->Mindmap, not on parentId self-refs). */
export async function deleteNode(
  mindmapId: string,
  callerEmail: string,
  nodeId: string,
): Promise<MindmapRecord> {
  await requireAccess(mindmapId, callerEmail, "write");

  const root = await prisma.mindmapNode.findFirst({ where: { mindmapId, parentId: null } });
  if (root && root.id === nodeId) {
    throw new MindmapAccessError("FORBIDDEN", "The root node cannot be deleted. Delete the mindmap instead.");
  }

  const target = await prisma.mindmapNode.findFirst({ where: { id: nodeId, mindmapId } });
  if (!target) throw new MindmapAccessError("NOT_FOUND", "Node not found");

  const allNodes = await prisma.mindmapNode.findMany({ where: { mindmapId } });
  const childrenOf = new Map<string, string[]>();
  for (const n of allNodes) {
    if (!n.parentId) continue;
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n.id);
    childrenOf.set(n.parentId, list);
  }

  const toDelete: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    toDelete.push(cur);
    for (const child of childrenOf.get(cur) ?? []) stack.push(child);
  }

  await prisma.$transaction([
    prisma.mindmapRelationship.deleteMany({
      where: { mindmapId, OR: [{ fromNodeId: { in: toDelete } }, { toNodeId: { in: toDelete } }] },
    }),
    prisma.mindmapNode.deleteMany({ where: { mindmapId, id: { in: toDelete } } }),
    prisma.mindmap.update({ where: { id: mindmapId }, data: { updatedAt: new Date() } }),
  ]);

  const mindmap = await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } });
  return loadRecord(mindmap);
}

/** Add a free connection/relationship between two existing nodes. Promoted
 *  to a first-class repository operation — previously this only existed in
 *  the MCP tool path (connect_mindmap_nodes) against the JSON file, which
 *  would otherwise have regressed on migration. */
export async function addRelationship(
  mindmapId: string,
  callerEmail: string,
  fromNodeId: string,
  toNodeId: string,
  options?: { type?: MindmapRelationshipLike["type"]; lineLabel?: string },
): Promise<{ mindmap: MindmapRecord; relationship: MindmapRelationshipLike }> {
  await requireAccess(mindmapId, callerEmail, "write");

  const [fromNode, toNode] = await Promise.all([
    prisma.mindmapNode.findFirst({ where: { id: fromNodeId, mindmapId } }),
    prisma.mindmapNode.findFirst({ where: { id: toNodeId, mindmapId } }),
  ]);
  if (!fromNode) throw new MindmapAccessError("NOT_FOUND", "from_node_not_found");
  if (!toNode) throw new MindmapAccessError("NOT_FOUND", "to_node_not_found");

  const type = options?.type ?? "straight_arrow";
  const data: Record<string, unknown> = { type };
  if (options?.lineLabel !== undefined) data.lineLabel = options.lineLabel;

  const created = await prisma.mindmapRelationship.create({
    data: { mindmapId, fromNodeId, toNodeId, data: toJsonInput(data) },
  });

  await prisma.mindmap.update({ where: { id: mindmapId }, data: { updatedAt: new Date() } });

  const mindmap = await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } });
  return {
    mindmap: await loadRecord(mindmap),
    relationship: { id: created.id, from: fromNodeId, to: toNodeId, type, lineLabel: options?.lineLabel },
  };
}

export async function deleteRelationship(
  mindmapId: string,
  callerEmail: string,
  relationshipId: string,
): Promise<void> {
  await requireAccess(mindmapId, callerEmail, "write");
  const rel = await prisma.mindmapRelationship.findFirst({ where: { id: relationshipId, mindmapId } });
  if (!rel) throw new MindmapAccessError("NOT_FOUND", "Relationship not found");
  await prisma.mindmapRelationship.delete({ where: { id: relationshipId } });
  await prisma.mindmap.update({ where: { id: mindmapId }, data: { updatedAt: new Date() } });
}

// ─── Sharing (used by the step-3 share API) ─────────────────────────────────

export interface MindmapShareView {
  id: string;
  mindmapId: string;
  invitedEmail: string;
  role: MindmapShareRole;
  invitedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** List collaborators for a mindmap. Caller must be the owner (viewers and
 *  editors can see who *they* are via getAccess, but the roster itself is
 *  owner-only per the locked v1 scope: "only owner can invite/revoke/change
 *  role"). Throws MindmapAccessError NOT_FOUND for non-owners too, to avoid
 *  leaking the existence/roster of a mindmap the caller doesn't own. */
export async function listShares(mindmapId: string, callerEmail: string): Promise<MindmapShareView[]> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }
  return prisma.mindmapShare.findMany({ where: { mindmapId }, orderBy: { createdAt: "asc" } });
}

/** List every participant's email (owner + all collaborators), open to any
 *  participant — not owner-only like listShares(). Backs the comment
 *  composer's @mention autocomplete: mentioning only resolves to a
 *  notification (see notifications-store.js) for someone who actually has
 *  access to this map, never the full org roster. */
export async function listParticipantEmails(mindmapId: string, callerEmail: string): Promise<string[]> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }
  const mindmap = await prisma.mindmap.findUniqueOrThrow({
    where: { id: mindmapId },
    include: { shares: { select: { invitedEmail: true } } },
  });
  const emails = new Set([canonicalEmail(mindmap.ownerEmail)]);
  for (const share of mindmap.shares) emails.add(canonicalEmail(share.invitedEmail));
  return Array.from(emails);
}

/** Invite a collaborator by email. Owner-only. Rejects inviting the owner's
 *  own email (already implicitly has full access) with FORBIDDEN, and
 *  upserts the role if the email is already a collaborator (re-inviting an
 *  existing collaborator just changes their role rather than erroring). */
export async function inviteShare(
  mindmapId: string,
  callerEmail: string,
  invitedEmail: string,
  role: MindmapShareRole,
): Promise<MindmapShareView> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }
  if (invitedEmail === callerEmail) {
    throw new MindmapAccessError("FORBIDDEN", "Cannot share a mindmap with its own owner");
  }

  return prisma.mindmapShare.upsert({
    where: { mindmapId_invitedEmail: { mindmapId, invitedEmail } },
    update: { role },
    create: { mindmapId, invitedEmail, role, invitedBy: callerEmail },
  });
}

/** Change an existing collaborator's role. Owner-only. */
export async function updateShareRole(
  mindmapId: string,
  callerEmail: string,
  invitedEmail: string,
  role: MindmapShareRole,
): Promise<MindmapShareView> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }

  const existing = await prisma.mindmapShare.findUnique({
    where: { mindmapId_invitedEmail: { mindmapId, invitedEmail } },
  });
  if (!existing) {
    throw new MindmapAccessError("NOT_FOUND", "Collaborator not found");
  }

  return prisma.mindmapShare.update({
    where: { mindmapId_invitedEmail: { mindmapId, invitedEmail } },
    data: { role },
  });
}

/** Revoke a collaborator's access entirely. Owner-only. No-ops (does not
 *  throw) if the target was already not a collaborator, so double-revoke
 *  (e.g. a racing double-click) is idempotent. */
export async function revokeShare(
  mindmapId: string,
  callerEmail: string,
  invitedEmail: string,
): Promise<void> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }

  await prisma.$transaction([
    prisma.mindmapShare.deleteMany({ where: { mindmapId, invitedEmail } }),
    prisma.mindmapSidebarHide.deleteMany({ where: { mindmapId, userEmail: canonicalEmail(invitedEmail) } }),
  ]);
}

/** Leave a shared mindmap without affecting the document or other members. */
export async function leaveSharedMindmap(
  mindmapId: string,
  callerEmail: string,
): Promise<{ ownerEmail: string; title: string }> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  if (access.isOwner) throw new MindmapAccessError("FORBIDDEN", "The owner cannot leave their own mindmap");

  const userEmail = canonicalEmail(callerEmail);
  const mindmap = await prisma.mindmap.findUnique({
    where: { id: mindmapId },
    select: { ownerEmail: true, title: true },
  });
  const share = await prisma.mindmapShare.findFirst({
    where: { mindmapId, invitedEmail: { equals: userEmail, mode: "insensitive" } },
    select: { id: true },
  });
  if (!mindmap || !share) throw new MindmapAccessError("NOT_FOUND", "Mindmap share not found");

  await prisma.$transaction([
    prisma.mindmapShare.delete({ where: { id: share.id } }),
    prisma.mindmapSidebarHide.deleteMany({ where: { mindmapId, userEmail } }),
  ]);
  return { ownerEmail: canonicalEmail(mindmap.ownerEmail), title: mindmap.title };
}

// ─── Public (no-login) view link ────────────────────────────────────────────

/** Enable or disable the anonymous read-only link. Owner-only. Enabling
 *  always mints a fresh token — even if one already exists — so a
 *  previously-revoked link can never be silently reactivated. */
export async function setPublicViewLink(
  mindmapId: string,
  callerEmail: string,
  enabled: boolean,
  expiration: PublicLinkExpiration = "7d",
): Promise<{ enabled: boolean; token: string | null; expiresAt: Date | null }> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }

  const token = enabled ? randomUUID() : null;
  const expiresAt = enabled ? publicLinkExpiresAt(expiration) : null;
  await prisma.mindmap.update({
    where: { id: mindmapId },
    data: { publicViewEnabled: enabled, publicViewToken: token, publicViewExpiresAt: expiresAt },
  });
  return { enabled, token, expiresAt };
}

/** Read the current public-link state. Owner-only (same visibility rule as
 *  listShares — a non-owner gets NOT_FOUND, not the roster/link). */
export async function getPublicViewLink(
  mindmapId: string,
  callerEmail: string,
): Promise<{ enabled: boolean; token: string | null; expiresAt: Date | null }> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }
  const mindmap = await prisma.mindmap.findUniqueOrThrow({
    where: { id: mindmapId },
    select: { publicViewEnabled: true, publicViewToken: true, publicViewExpiresAt: true },
  });
  return {
    enabled: mindmap.publicViewEnabled,
    token: mindmap.publicViewToken,
    expiresAt: mindmap.publicViewExpiresAt,
  };
}

/** Change only the expiry of an existing public link. Owner-only. */
export async function updatePublicViewLinkExpiration(
  mindmapId: string,
  callerEmail: string,
  expiration: PublicLinkExpiration,
): Promise<{ enabled: boolean; token: string | null; expiresAt: Date | null }> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.isOwner) {
    throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  }

  const mindmap = await prisma.mindmap.findUniqueOrThrow({
    where: { id: mindmapId },
    select: { publicViewEnabled: true, publicViewToken: true },
  });
  const expiresAt = mindmap.publicViewEnabled ? publicLinkExpiresAt(expiration) : null;
  await prisma.mindmap.update({ where: { id: mindmapId }, data: { publicViewExpiresAt: expiresAt } });
  return { enabled: mindmap.publicViewEnabled, token: mindmap.publicViewToken, expiresAt };
}

/** Fetch a mindmap for the anonymous public viewer. No caller identity
 *  involved — the token itself IS the credential. Throws NOT_FOUND if the
 *  token is unknown or the owner has since disabled the link. */
export async function getMindmapByPublicToken(token: string): Promise<MindmapRecord> {
  const mindmap = await prisma.mindmap.findUnique({ where: { publicViewToken: token } });
  if (
    !mindmap ||
    !mindmap.publicViewEnabled ||
    (mindmap.publicViewExpiresAt !== null && mindmap.publicViewExpiresAt <= new Date())
  ) {
    throw new MindmapAccessError("NOT_FOUND", "This share link is invalid or has been disabled.");
  }
  return loadRecord(mindmap);
}

// ─── Version history + attribution (used by the step-6 versions API) ───────
//
// MindmapSnapshot/MindmapEditEvent are written by docker/mindmap-ws (see its
// src/persistence.js) whenever a realtime room is open. These repository
// functions are the READ side used by the Next.js API routes, plus a
// same-shape manual-snapshot writer for use when no realtime room is
// currently open (see app/api/mindmaps/[mindmapId]/versions/route.ts POST,
// which prefers routing a manual "save version" through the live mindmap-ws
// room over HTTP when one is open, and falls back to this function
// otherwise).

export interface MindmapSnapshotSummary {
  id: string;
  mindmapId: string;
  label: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface MindmapSnapshotDetail extends MindmapSnapshotSummary {
  treeJson: unknown;
}

/** List snapshots (newest first), read-access-gated. Summaries only — no
 *  treeJson payload, to keep the version-history list endpoint cheap even
 *  for mindmaps with many large snapshots. */
export async function listSnapshots(mindmapId: string, callerEmail: string): Promise<MindmapSnapshotSummary[]> {
  await requireAccess(mindmapId, callerEmail, "read");
  return prisma.mindmapSnapshot.findMany({
    where: { mindmapId },
    orderBy: { createdAt: "desc" },
    select: { id: true, mindmapId: true, label: true, createdBy: true, createdAt: true },
  });
}

/** Fetch one snapshot's full treeJson for read-only preview. */
export async function getSnapshot(
  mindmapId: string,
  callerEmail: string,
  snapshotId: string,
): Promise<MindmapSnapshotDetail> {
  await requireAccess(mindmapId, callerEmail, "read");
  const snapshot = await prisma.mindmapSnapshot.findFirst({ where: { id: snapshotId, mindmapId } });
  if (!snapshot) throw new MindmapAccessError("NOT_FOUND", "Snapshot not found");
  return snapshot;
}

/**
 * Manual "save version" fallback: snapshots the mindmap's CURRENT Postgres
 * tree (via the same nested-tree reconstruction used everywhere else in this
 * repository), for use when no realtime room is open in mindmap-ws to ask
 * for a live Y.Doc snapshot instead. Write-access-gated (only owner/editor
 * can create a version checkpoint, matching the write-gate on every other
 * mutating repository call).
 */
export async function createManualSnapshot(
  mindmapId: string,
  callerEmail: string,
  label?: string,
): Promise<MindmapSnapshotSummary> {
  await requireAccess(mindmapId, callerEmail, "write");
  const mindmap = await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } });
  const record = await loadRecord(mindmap);
  const snapshot = await prisma.mindmapSnapshot.create({
    data: {
      mindmapId,
      treeJson: record.tree as unknown as Prisma.InputJsonValue,
      label: label ?? undefined,
      createdBy: callerEmail,
    },
    select: { id: true, mindmapId: true, label: true, createdBy: true, createdAt: true },
  });
  return snapshot;
}

/**
 * Restore a snapshot's treeJson back into the CURRENT Postgres tree (whole
 * -tree replace, same semantics as updateMindmap's tree replace) — this is
 * the fallback path used when no realtime room is open to route the restore
 * through the Y.Doc instead (see versions/[snapshotId]/restore route).
 * Non-destructive to prior history: this only overwrites the *current* live
 * MindmapNode/MindmapRelationship rows, never touches MindmapSnapshot or
 * MindmapEditEvent, so every prior snapshot/edit-event row remains intact.
 * Attribution for this fallback path is the caller's job (the route records
 * its own MindmapEditEvent-equivalent via the manual snapshot label; a
 * dedicated audit row for pure-repository restores is intentionally out of
 * scope for v1, matching the "attribution flows through mindmap-ws" design —
 * see file header of docker/mindmap-ws/src/server.js).
 */
export async function restoreSnapshotToRepository(
  mindmapId: string,
  callerEmail: string,
  snapshotId: string,
): Promise<MindmapRecord> {
  await requireAccess(mindmapId, callerEmail, "write");
  const snapshot = await prisma.mindmapSnapshot.findFirst({ where: { id: snapshotId, mindmapId } });
  if (!snapshot) throw new MindmapAccessError("NOT_FOUND", "Snapshot not found");

  // An explicit user action, so unconditional — it deliberately overwrites
  // whatever is stored. replaceTree bumps the revision itself, which is what
  // tells an open realtime room to reseed from the restored content.
  await replaceTreeOrThrow(mindmapId, snapshot.treeJson as unknown as MindmapNodeLike);
  return loadRecord(await prisma.mindmap.findUniqueOrThrow({ where: { id: mindmapId } }));
}

export interface LastEditInfo {
  actorEmail: string;
  opType: string;
  createdAt: Date;
}

/**
 * Fallback "last edited by/at" lookup straight from Postgres
 * (MindmapEditEvent), used when the mindmap-ws service's in-process
 * `/internal/last-edits` endpoint (which serves the same data faster,
 * without a network hop from Next.js to Postgres to Next.js) is unreachable
 * or unconfigured. Same semantics: most recent event touching each nodeId,
 * read-access-gated.
 */
/**
 * The earliest edit timestamp `callerEmail` is allowed to see for this map.
 *
 * The owner sees everything. A collaborator sees history from the moment they
 * were invited — what the owner did before sharing stays private — unless the
 * owner has explicitly turned on shareFullHistory for the map.
 * Returns null when there is no lower bound (owner, or full history shared).
 */
export async function historyVisibleFrom(mindmapId: string, callerEmail: string): Promise<Date | null> {
  const caller = canonicalEmail(callerEmail);
  const mindmap = await prisma.mindmap.findUnique({
    where: { id: mindmapId },
    select: { ownerEmail: true, shareFullHistory: true },
  });
  if (!mindmap) return null;
  if (canonicalEmail(mindmap.ownerEmail) === caller || mindmap.shareFullHistory) return null;

  const share = await prisma.mindmapShare.findFirst({
    where: { mindmapId, invitedEmail: { equals: caller, mode: "insensitive" } },
    select: { createdAt: true },
  });
  return share?.createdAt ?? null;
}

export interface NodeEditEvent {
  id: string;
  actorEmail: string;
  opType: string;
  createdAt: Date;
  nodeVersions: unknown;
}

/**
 * Full edit history for ONE node, newest first — the data behind the
 * per-node history popover (see app/mindmap/components/NodeHistoryPopover.tsx).
 * Unlike getLastEditsForNodes (one row per node, for the hover dot) this
 * walks the whole append-only log, paged with a `before` cursor so a node
 * edited thousands of times can still be read end to end.
 */
export async function listNodeEditEvents(
  mindmapId: string,
  callerEmail: string,
  nodeId: string,
  options: { limit?: number; before?: Date } = {},
): Promise<NodeEditEvent[]> {
  await requireAccess(mindmapId, callerEmail, "read");
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 200);
  const visibleFrom = await historyVisibleFrom(mindmapId, callerEmail);

  const events = await prisma.mindmapEditEvent.findMany({
    where: {
      mindmapId,
      nodeIds: { has: nodeId },
      ...(options.before || visibleFrom
        ? { createdAt: { ...(options.before ? { lt: options.before } : {}), ...(visibleFrom ? { gte: visibleFrom } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, actorEmail: true, opType: true, createdAt: true },
    take: limit,
  });

  // Read the additive JSON column separately so a long-lived Next process
  // whose generated Prisma Client predates the migration can serve history
  // while it is waiting for a safe restart/regeneration.
  const versionRows = events.length === 0
    ? []
    : await prisma.$queryRaw<Array<{ id: string; nodeVersions: unknown | null }>>(
      Prisma.sql`SELECT "id", "nodeVersions" FROM "mindmap_edit_events" WHERE "id" IN (${Prisma.join(events.map((event) => event.id))})`,
    );
  const versionsByEventId = new Map(versionRows.map((row) => [row.id, row.nodeVersions]));
  return events.map((event) => ({ ...event, nodeVersions: versionsByEventId.get(event.id) ?? null }));
}

export async function getLastEditsForNodes(
  mindmapId: string,
  callerEmail: string,
  nodeIds: string[],
): Promise<Record<string, LastEditInfo>> {
  await requireAccess(mindmapId, callerEmail, "read");
  if (nodeIds.length === 0) return {};
  const visibleFrom = await historyVisibleFrom(mindmapId, callerEmail);

  const events = await prisma.mindmapEditEvent.findMany({
    where: { mindmapId, nodeIds: { hasSome: nodeIds }, ...(visibleFrom ? { createdAt: { gte: visibleFrom } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { actorEmail: true, opType: true, createdAt: true, nodeIds: true },
    take: 500,
  });

  const result: Record<string, LastEditInfo> = {};
  for (const event of events) {
    for (const nodeId of event.nodeIds) {
      if (result[nodeId] || !nodeIds.includes(nodeId)) continue;
      result[nodeId] = { actorEmail: event.actorEmail, opType: event.opType, createdAt: event.createdAt };
    }
  }
  return result;
}
