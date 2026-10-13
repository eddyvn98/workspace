import type { Prisma, WorkspaceBoard } from "@prisma/client";
import { asBlockRecord } from "@/app/api/workspaces/_edit-events";
import { commitBoardContent } from "./boardCommit";
import { diffRecordMap } from "./ws-repository-notify";
import { drainWorkspaceRealtimeOutbox, enqueueWorkspaceRealtimePatch } from "./realtimeOutbox";

export type BoardAccessRole = "OWNER" | "EDITOR" | "VIEWER";

export type BoardFailure = { ok: false; status: number; error: string; reason?: string; revision?: number };

type Json = Prisma.InputJsonValue;

/**
 * Commits new blocks/order/connectors on top of `board` (optimistic revision check)
 * and pushes the diff to any open live room, exactly like the version-restore route.
 */
export async function commitContentAndNotify(
  board: WorkspaceBoard,
  email: string,
  content: { blocks: unknown; blockOrder: unknown; connectors: unknown },
  options: { skipAutoCheckpoint?: boolean } = {},
): Promise<{ ok: true; board: WorkspaceBoard } | BoardFailure> {
  const blockDiff = diffRecordMap(asBlockRecord(board.blocks), asBlockRecord(content.blocks));
  const connectorDiff = diffRecordMap(asBlockRecord(board.connectors), asBlockRecord(content.connectors));
  const outcome = await commitBoardContent({
    boardId: board.id,
    actorEmail: email,
    content: {
      title: board.title,
      blocks: content.blocks as Json,
      blockOrder: content.blockOrder as Json,
      connectors: content.connectors as Json,
      camera: board.camera as Json,
      treeLayoutDirection: board.treeLayoutDirection ?? undefined,
      treeGrowthMode: board.treeGrowthMode ?? undefined,
      treeLayoutFamily: board.treeLayoutFamily ?? undefined,
      treeTimelineBranchMode: board.treeTimelineBranchMode ?? undefined,
      treeTimelineDescendantStyle: board.treeTimelineDescendantStyle ?? undefined,
      treeCatalogDescendantStyle: board.treeCatalogDescendantStyle ?? undefined,
    },
    editEvents: [],
    baseRevision: board.revision,
    existing: board,
    skipAutoCheckpoint: options.skipAutoCheckpoint,
    writeRealtimeOutbox: (tx, committed) => enqueueWorkspaceRealtimePatch(tx, {
      boardId: board.id,
      revision: committed.revision,
      patch: {
        upsertBlocks: blockDiff.upsert,
        removeBlockIds: blockDiff.removeIds,
        upsertConnectors: connectorDiff.upsert,
        removeConnectorIds: connectorDiff.removeIds,
        blockOrder: Array.isArray(content.blockOrder) ? content.blockOrder.map((value) => String(value)) : [],
      },
    }),
  });
  if ("gone" in outcome) return { ok: false, status: 404, error: "Not found" };
  if ("stale" in outcome) {
    return { ok: false, status: 409, error: "Board changed while applying the command", reason: "stale", revision: outcome.revision };
  }
  await drainWorkspaceRealtimeOutbox(20, board.id);
  return { ok: true, board: outcome.board };
}
