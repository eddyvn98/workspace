import { prisma } from "@/lib/prisma";
import type { WorkspaceBoard } from "@prisma/client";
import { notifyUser } from "@/app/api/workspaces/_notify";
import { isKnownWorkspaceUserEmail, normalizeWorkspaceEmail, sameWorkspaceIdentity } from "./identity";
import { notifyWorkspaceAccessChanged } from "./ws-access-notify";
import { mintPublicShareToken, parsePublicLinkExpiration, publicLinkExpiresAt } from "./public-link";
import type { BoardAccessRole, BoardFailure } from "./board-commit-notify";

const OWNER_ONLY: BoardFailure = { ok: false, status: 403, error: "Only the board owner can manage sharing", reason: "owner_only" };
const NEEDS_CONFIRM: BoardFailure = { ok: false, status: 400, error: "This changes who can access the board; ask the user to confirm, then pass confirm true", reason: "confirmation_required" };

export async function listBoardShares(boardId: string, role: BoardAccessRole) {
  if (role !== "OWNER") return OWNER_ONLY;
  const rows = await prisma.workspaceBoardShare.findMany({ where: { boardId }, orderBy: { createdAt: "asc" } });
  return { ok: true as const, shares: rows.map((row) => ({ email: row.invitedEmail, role: row.role })) };
}

export async function shareBoardWith(
  board: WorkspaceBoard, email: string, role: BoardAccessRole,
  input: { email: unknown; role: unknown; confirm: unknown },
) {
  if (role !== "OWNER") return OWNER_ONLY;
  if (input.confirm !== true) return NEEDS_CONFIRM;
  const invitedEmail = normalizeWorkspaceEmail(typeof input.email === "string" ? input.email : null);
  if (!invitedEmail || (input.role !== "VIEWER" && input.role !== "EDITOR")) {
    return { ok: false as const, status: 400, error: "A valid email and role (VIEWER|EDITOR) are required", reason: "invalid_share" };
  }
  const shareRole = input.role;
  if (sameWorkspaceIdentity(invitedEmail, email) || sameWorkspaceIdentity(invitedEmail, board.ownerEmail)) {
    return { ok: false as const, status: 400, error: "Cannot share with yourself", reason: "self_share" };
  }
  if (!isKnownWorkspaceUserEmail(invitedEmail)) {
    return { ok: false as const, status: 422, error: "user_not_found: this person must sign up for an account before they can be invited", reason: "user_not_found" };
  }
  const existing = await prisma.workspaceBoardShare.findMany({ where: { boardId: board.id } });
  for (const row of existing) {
    if (row.invitedEmail !== invitedEmail && row.invitedEmail.trim().toLowerCase() === invitedEmail) {
      await prisma.workspaceBoardShare.deleteMany({ where: { boardId: board.id, invitedEmail: row.invitedEmail } });
    }
  }
  const key = { boardId_invitedEmail: { boardId: board.id, invitedEmail } };
  const prior = await prisma.workspaceBoardShare.findUnique({ where: key });
  const share = await prisma.workspaceBoardShare.upsert({
    where: key,
    create: { boardId: board.id, invitedEmail, role: shareRole, invitedBy: email },
    update: { role: shareRole },
  });
  if (prior && prior.role !== shareRole) await notifyWorkspaceAccessChanged(board.id, invitedEmail);
  void notifyUser(invitedEmail, board.id, "SHARE_INVITE", `${email} shared "${board.title}" with you (${shareRole.toLowerCase()})`);
  return { ok: true as const, share: { email: share.invitedEmail, role: share.role }, changed: !prior || prior.role !== shareRole };
}

export async function removeBoardShare(
  boardId: string, role: BoardAccessRole, input: { email: unknown; confirm: unknown },
) {
  if (role !== "OWNER") return OWNER_ONLY;
  if (input.confirm !== true) return NEEDS_CONFIRM;
  const invitedEmail = normalizeWorkspaceEmail(typeof input.email === "string" ? input.email : null);
  if (!invitedEmail) return { ok: false as const, status: 400, error: "A valid email is required", reason: "invalid_share" };
  const shares = await prisma.workspaceBoardShare.findMany({ where: { boardId } });
  const matches = shares.filter((row) => row.invitedEmail.trim().toLowerCase() === invitedEmail);
  if (matches.length === 0) return { ok: false as const, status: 404, error: "No share exists for that email; use list_shares", reason: "share_not_found" };
  for (const row of matches) {
    await prisma.workspaceBoardShare.deleteMany({ where: { boardId, invitedEmail: row.invitedEmail } });
  }
  await notifyWorkspaceAccessChanged(boardId, invitedEmail);
  return { ok: true as const, email: invitedEmail };
}

export async function setBoardPublicLink(
  board: WorkspaceBoard, role: BoardAccessRole, input: { enabled: unknown; expiration: unknown; confirm: unknown },
) {
  if (role !== "OWNER") return OWNER_ONLY;
  if (input.confirm !== true) return NEEDS_CONFIRM;
  if (typeof input.enabled !== "boolean") return { ok: false as const, status: 400, error: "enabled (boolean) required", reason: "invalid_public_link" };
  const result = (row: WorkspaceBoard) => ({
    ok: true as const,
    publicLink: { enabled: row.publicShareEnabled, url: row.publicShareToken ? `/workspace/view/${row.publicShareToken}` : null, expiresAt: row.publicShareExpiresAt?.toISOString() ?? null },
  });
  if (!input.enabled) {
    return result(await prisma.workspaceBoard.update({
      where: { id: board.id },
      data: { publicShareEnabled: false, publicShareToken: null, publicShareExpiresAt: null, legacyPublicShareEnabled: false, legacyPublicShareToken: null, legacyPublicShareExpiresAt: null },
    }));
  }
  const expiration = input.expiration === undefined || input.expiration === null ? null : parsePublicLinkExpiration(input.expiration);
  const expiresAt = expiration && expiration !== "custom" ? publicLinkExpiresAt(expiration) : null;
  const invalid = input.expiration !== undefined && input.expiration !== null
    && (!expiration || expiration === "custom" || (expiration !== "never" && (!expiresAt || expiresAt.getTime() <= Date.now())));
  if (invalid) return { ok: false as const, status: 400, error: "Invalid expiration; use 1h, 1d, 7d, 30d, never or a future date", reason: "invalid_expiration" };
  const reuse = board.publicShareEnabled && board.publicShareToken
    && !(board.publicShareExpiresAt && new Date(board.publicShareExpiresAt).getTime() <= Date.now() && !expiration);
  const data = reuse
    ? (expiration ? { publicShareExpiresAt: expiresAt } : {})
    : { publicShareEnabled: true, publicShareToken: mintPublicShareToken(), publicShareExpiresAt: expiration ? expiresAt : publicLinkExpiresAt("7d") };
  return result(Object.keys(data).length ? await prisma.workspaceBoard.update({ where: { id: board.id }, data }) : board);
}
