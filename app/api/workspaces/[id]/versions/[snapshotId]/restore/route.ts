import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { diffRecordMap } from "@/lib/workspace/ws-repository-notify";
import { drainWorkspaceRealtimeOutbox, enqueueWorkspaceRealtimePatch } from "@/lib/workspace/realtimeOutbox";
import { resolveWorkspaceCallerEmail } from "../../../../_auth";
import { resolveAccessRole } from "../../../../_access";
import { asBlockRecord } from "../../../../_edit-events";

type RouteParams = { params: { id: string; snapshotId: string } };

/**
 * POST /api/workspaces/[boardId]/versions/[snapshotId]/restore — copies a snapshot's
 * blocks/blockOrder/connectors back onto the live WorkspaceBoard row (bump revision)
 * and returns the restored content — write-access-gated.
 * Does not delete the snapshot or any newer ones (restoring isn't destructive to history).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "VIEWER") {
    return NextResponse.json({ error: "Viewer role cannot restore a version" }, { status: 403 });
  }

  const snapshot = await prisma.workspaceBoardSnapshot.findUnique({
    where: { id: params.snapshotId },
  });
  if (!snapshot || snapshot.boardId !== params.id) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const blockDiff = diffRecordMap(asBlockRecord(board.blocks), asBlockRecord(snapshot.blocks));
  const connectorDiff = diffRecordMap(asBlockRecord(board.connectors), asBlockRecord(snapshot.connectors));
  const outcome = await commitBoardContent({
    boardId: params.id,
    actorEmail: email,
    content: {
      title: board.title,
      blocks: snapshot.blocks as Prisma.InputJsonValue,
      blockOrder: snapshot.blockOrder as Prisma.InputJsonValue,
      connectors: snapshot.connectors as Prisma.InputJsonValue,
      camera: board.camera as Prisma.InputJsonValue,
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
    skipAutoCheckpoint: true,
    writeRealtimeOutbox: (tx, committed) => enqueueWorkspaceRealtimePatch(tx, {
      boardId: params.id,
      revision: committed.revision,
      patch: {
        upsertBlocks: blockDiff.upsert,
        removeBlockIds: blockDiff.removeIds,
        upsertConnectors: connectorDiff.upsert,
        removeConnectorIds: connectorDiff.removeIds,
        blockOrder: Array.isArray(snapshot.blockOrder) ? snapshot.blockOrder.map((value) => String(value)) : [],
      },
    }),
  });

  if ("gone" in outcome) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ("stale" in outcome) {
    return NextResponse.json(
      { error: "Board changed while restoring the version", reason: "stale", revision: outcome.revision },
      { status: 409 },
    );
  }

  // A restore only touches Postgres — an already-open live room (y-websocket)
  // keeps serving its in-memory Y.Doc regardless, so without this a restore
  // is invisible to anyone currently viewing the board, and can even be
  // silently undone the next time that room's idle/deadline flush notices
  // the "stale" write and merges the room's (pre-restore) content back on
  // top of it. Same bridge the agent write path documents in
  // ws-repository-notify.ts, just not yet wired up there either.
  await drainWorkspaceRealtimeOutbox(20, params.id);

  return NextResponse.json({
    blocks: outcome.board.blocks,
    blockOrder: outcome.board.blockOrder,
    connectors: outcome.board.connectors,
    revision: outcome.board.revision,
  });
}
