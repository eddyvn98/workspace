import { prisma } from "@/lib/prisma";
import type { WorkspaceBoard } from "@prisma/client";
import { commitContentAndNotify, type BoardAccessRole, type BoardFailure } from "./board-commit-notify";

const MIN_MANUAL_SNAPSHOT_INTERVAL_MS = 3_000;
const MAX_LABEL_LENGTH = 120;
const SNAPSHOT_SELECT = { id: true, boardId: true, label: true, createdBy: true, createdAt: true } as const;

export function listBoardVersions(boardId: string) {
  return prisma.workspaceBoardSnapshot.findMany({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    select: SNAPSHOT_SELECT,
  });
}

export async function createBoardVersion(
  board: WorkspaceBoard, email: string, role: BoardAccessRole, rawLabel: unknown,
): Promise<{ ok: true; snapshot: { id: string; label: string | null } } | BoardFailure> {
  if (role === "VIEWER") return { ok: false, status: 403, error: "Viewer role cannot save a version", reason: "forbidden" };
  if (rawLabel !== undefined && rawLabel !== null && typeof rawLabel !== "string") {
    return { ok: false, status: 400, error: "label must be a string", reason: "invalid_label" };
  }
  const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : null;
  if (label && label.length > MAX_LABEL_LENGTH) {
    return { ok: false, status: 400, error: `label must be at most ${MAX_LABEL_LENGTH} characters`, reason: "invalid_label" };
  }
  const lastManual = await prisma.workspaceBoardSnapshot.findFirst({
    where: { boardId: board.id, label: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastManual && Date.now() - lastManual.createdAt.getTime() < MIN_MANUAL_SNAPSHOT_INTERVAL_MS) {
    return { ok: false, status: 429, error: "Please wait a moment before saving another version", reason: "rate_limited" };
  }
  const snapshot = await prisma.workspaceBoardSnapshot.create({
    data: {
      boardId: board.id,
      blocks: board.blocks as never,
      blockOrder: board.blockOrder as never,
      connectors: board.connectors as never,
      label,
      createdBy: email,
    },
    select: SNAPSHOT_SELECT,
  });
  return { ok: true, snapshot };
}

export async function restoreBoardVersion(
  board: WorkspaceBoard, email: string, role: BoardAccessRole,
  input: { snapshotId: unknown; baseRevision: unknown; confirm: unknown },
): Promise<{ ok: true; board: WorkspaceBoard; snapshotId: string } | BoardFailure> {
  if (role === "VIEWER") return { ok: false, status: 403, error: "Viewer role cannot restore a version", reason: "forbidden" };
  if (input.confirm !== true) {
    return { ok: false, status: 400, error: "Restoring overwrites current content; ask the user, then pass confirm true", reason: "confirmation_required" };
  }
  if (typeof input.snapshotId !== "string" || !input.snapshotId.trim()) {
    return { ok: false, status: 400, error: "Exact snapshotId required; use list_versions first", reason: "snapshot_required" };
  }
  if (typeof input.baseRevision !== "number" || !Number.isInteger(input.baseRevision)) {
    return { ok: false, status: 400, error: "baseRevision (integer) required", reason: "base_revision_required" };
  }
  if (input.baseRevision !== board.revision) {
    return { ok: false, status: 409, error: "Board changed since baseRevision; re-read the board", reason: "stale", revision: board.revision };
  }
  const snapshot = await prisma.workspaceBoardSnapshot.findUnique({ where: { id: input.snapshotId.trim() } });
  if (!snapshot || snapshot.boardId !== board.id) {
    return { ok: false, status: 404, error: "Snapshot not found", reason: "snapshot_not_found" };
  }
  const result = await commitContentAndNotify(board, email, snapshot, { skipAutoCheckpoint: true });
  return result.ok ? { ok: true, board: result.board, snapshotId: snapshot.id } : result;
}
