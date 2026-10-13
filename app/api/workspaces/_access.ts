import { prisma } from "@/lib/prisma";
import type { WorkspaceBoard } from "@prisma/client";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

export type WorkspaceAccessRole = "OWNER" | "EDITOR" | "VIEWER";

/** Resolves what `email` may do with `board` — owner first (no DB hit), then
 *  falls back to a share-table lookup. Returns null for no access at all,
 *  which every route treats as a 404 (never 403) to avoid leaking whether a
 *  board id exists — same anti-enumeration shape as PageShareDialog's
 *  mindmap endpoints (inventory §10).
 *
 *  Identity is compared case-insensitively, and by scanning the board's own
 *  shares rather than by a unique lookup on `boardId_invitedEmail`: Postgres
 *  compares strings byte-for-byte, so an exact-key lookup misses a row stored
 *  before normalization (or written by any other client) under a different
 *  capitalization, and silently reports "no access" to a real collaborator.
 *  A board holds a handful of shares, so the scan costs nothing. See
 *  lib/workspace/identity.ts. */
export async function resolveAccessRole(
  board: Pick<WorkspaceBoard, "id" | "ownerEmail">,
  email: string,
): Promise<WorkspaceAccessRole | null> {
  if (sameWorkspaceIdentity(board.ownerEmail, email)) return "OWNER";
  const shares = await prisma.workspaceBoardShare.findMany({ where: { boardId: board.id } });
  const share = shares.find((row) => sameWorkspaceIdentity(row.invitedEmail, email));
  return share?.role ?? null;
}

export async function requireOwnedBoard(id: string, email: string) {
  const board = await prisma.workspaceBoard.findUnique({ where: { id } });
  if (!board || !sameWorkspaceIdentity(board.ownerEmail, email)) return null;
  return board;
}
