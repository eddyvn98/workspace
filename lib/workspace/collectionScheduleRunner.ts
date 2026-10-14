import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asBlockRecord, collectBlockEditEvents } from "@/app/api/workspaces/_edit-events";
import { applyDueCollectionSchedules } from "@/app/workspace/collections/collectionSchedules";
import type { CollectionBlockPayload } from "@/app/workspace/collections/model";
import { commitBoardContent } from "@/lib/workspace/boardCommit";

export type CollectionScheduleBatchResult = {
  scanned: number;
  boardsUpdated: number;
  conflicted: number;
  rulesExecuted: number;
  recordsChanged: number;
  nextCursor: string | null;
};

/** One bounded page per call. A caller can pass nextCursor for remaining boards.
 * Each board commits via the existing single CAS/revision/checkpoint path. */
export async function runCollectionScheduleBatch(
  now = new Date(), cursor = "", limit = 30,
): Promise<CollectionScheduleBatchResult> {
  const take = Math.max(1, Math.min(100, Math.trunc(limit)));
  const ids = await prisma.workspaceBoard.findMany({
    where: cursor ? { id: { gt: cursor } } : {},
    select: { id: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  const batch = ids.slice(0, take);
  const result: CollectionScheduleBatchResult = {
    scanned: batch.length, boardsUpdated: 0, conflicted: 0,
    rulesExecuted: 0, recordsChanged: 0,
    nextCursor: ids.length > take ? batch[batch.length - 1]?.id ?? null : null,
  };
  for (const item of batch) {
    const board = await prisma.workspaceBoard.findUnique({ where: { id: item.id } });
    if (!board) continue;
    const before = asBlockRecord(board.blocks), next = { ...before };
    let changed = false, rules = 0, records = 0;
    for (const [id, block] of Object.entries(before)) {
      if (block.type !== "collection") continue;
      const data = block.data as CollectionBlockPayload;
      if (!data || !Array.isArray(data.records) || !Array.isArray(data.fields)) continue;
      const due = applyDueCollectionSchedules(data, now);
      if (!due.rulesRun) continue;
      next[id] = { ...block, data: due.next, updatedAt: now.getTime(),
        lastEditedBy: "scheduler@workspace.internal" };
      changed = true;
      rules += due.rulesRun;
      records += due.recordsChanged;
    }
    if (!changed) continue;
    const saved = await commitBoardContent({
      boardId: board.id,
      actorEmail: "scheduler@workspace.internal",
      baseRevision: board.revision,
      existing: board,
      editEvents: collectBlockEditEvents(board.id, before, next,
        "scheduler@workspace.internal", "schedule.tick"),
      content: {
        title: board.title,
        blocks: next as unknown as Prisma.InputJsonValue,
        blockOrder: board.blockOrder as Prisma.InputJsonValue,
        connectors: board.connectors as Prisma.InputJsonValue,
        camera: board.camera as Prisma.InputJsonValue,
        ...(board.frames != null ? { frames: board.frames as Prisma.InputJsonValue } : {}),
        treeLayoutDirection: board.treeLayoutDirection ?? undefined,
        treeGrowthMode: board.treeGrowthMode ?? undefined,
        treeLayoutFamily: board.treeLayoutFamily ?? undefined,
        treeTimelineBranchMode: board.treeTimelineBranchMode ?? undefined,
        treeTimelineDescendantStyle: board.treeTimelineDescendantStyle ?? undefined,
        treeCatalogDescendantStyle: board.treeCatalogDescendantStyle ?? undefined,
      },
    });
    if ("stale" in saved) { result.conflicted++; continue; }
    if ("gone" in saved) continue;
    result.boardsUpdated++;
    result.rulesExecuted += rules;
    result.recordsChanged += records;
  }
  return result;
}
