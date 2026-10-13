import { prisma } from "@/lib/prisma";

/**
 * Lower bound on the edit history a caller may see, or null when there is
 * none (the owner, or a board whose owner opted into sharing full history).
 *
 * By default a collaborator only sees what happened from the moment they
 * were invited: work the owner did before that stays private. Without this
 * bound every collaborator — VIEWER included — could read the board's entire
 * edit log back to its creation. Ported from legacy's historyVisibleFrom in
 * lib/mindmap/repository.ts.
 */
export async function boardHistoryVisibleFrom(
  boardId: string,
  callerEmail: string,
): Promise<Date | null> {
  const caller = callerEmail.trim().toLowerCase();
  const board = await prisma.workspaceBoard.findUnique({
    where: { id: boardId },
    select: { ownerEmail: true, shareFullHistory: true },
  });
  if (!board) return null;
  if (board.ownerEmail.trim().toLowerCase() === caller || board.shareFullHistory) return null;

  const share = await prisma.workspaceBoardShare.findFirst({
    where: { boardId, invitedEmail: { equals: caller, mode: "insensitive" } },
    select: { createdAt: true },
  });
  return share?.createdAt ?? null;
}
