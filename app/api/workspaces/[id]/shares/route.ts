import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { requireOwnedBoard } from "../../_access";
import { notifyUser } from "../../_notify";
import { isKnownWorkspaceUserEmail, normalizeWorkspaceEmail } from "@/lib/workspace/identity";
import { notifyWorkspaceAccessChanged } from "@/lib/workspace/ws-access-notify";

/** GET /api/workspaces/[id]/shares — list collaborators (owner-only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shares = await prisma.workspaceBoardShare.findMany({
    where: { boardId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(shares);
}

/** POST /api/workspaces/[id]/shares — invite a collaborator (owner-only). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { invitedEmail?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invitedEmail: rawEmail, role } = body ?? {};
  const invitedEmail = normalizeWorkspaceEmail(typeof rawEmail === "string" ? rawEmail : null);
  if (!invitedEmail || (role !== "VIEWER" && role !== "EDITOR")) {
    return NextResponse.json({ error: "invitedEmail and role (VIEWER|EDITOR) required" }, { status: 400 });
  }
  if (invitedEmail === email) {
    return NextResponse.json({ error: "Cannot share with yourself" }, { status: 400 });
  }
  // No pending-invite flow exists: an address that cannot sign in would become
  // a share row nobody can ever use, and would silently grant access the day
  // somebody registers it. Legacy answers 422 here and so do we.
  if (!isKnownWorkspaceUserEmail(invitedEmail)) {
    return NextResponse.json(
      {
        error: "user_not_found",
        message: "This person must sign up for an account before they can be invited.",
      },
      { status: 422 },
    );
  }

  // Re-point any row stored under a different capitalization at the canonical
  // address, so this person can never hold two share rows on one board.
  const existing = await prisma.workspaceBoardShare.findMany({ where: { boardId: params.id } });
  for (const row of existing) {
    if (row.invitedEmail !== invitedEmail && row.invitedEmail.trim().toLowerCase() === invitedEmail) {
      await prisma.workspaceBoardShare.deleteMany({
        where: { boardId: params.id, invitedEmail: row.invitedEmail },
      });
    }
  }

  // Read before the upsert so we know whether this call is a fresh invite
  // (nothing to evict — the person has no socket on a board they couldn't
  // open yet) or a role change on a share that already existed (their open
  // socket still carries the old role and must be closed for the new one to
  // take effect, same reasoning as the DELETE handler below).
  const priorShare = await prisma.workspaceBoardShare.findUnique({
    where: { boardId_invitedEmail: { boardId: params.id, invitedEmail } },
  });

  const share = await prisma.workspaceBoardShare.upsert({
    where: { boardId_invitedEmail: { boardId: params.id, invitedEmail } },
    create: { boardId: params.id, invitedEmail, role, invitedBy: email },
    update: { role },
  });

  if (priorShare && priorShare.role !== role) {
    await notifyWorkspaceAccessChanged(params.id, invitedEmail);
  }

  void notifyUser(
    invitedEmail,
    params.id,
    "SHARE_INVITE",
    `${email} shared "${board.title}" with you (${role.toLowerCase()})`,
  );

  return NextResponse.json(share, { status: 201 });
}

/** DELETE /api/workspaces/[id]/shares?email=... — revoke a collaborator
 *  (owner-only). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invitedEmail = normalizeWorkspaceEmail(req.nextUrl.searchParams.get("email"));
  if (!invitedEmail) return NextResponse.json({ error: "email query param required" }, { status: 400 });

  // Match case-insensitively, then delete by the exact stored value. A plain
  // `where: { invitedEmail }` deletes nothing when the row was stored with
  // different capitalization, and this route would still answer ok — the
  // owner sees the collaborator removed while their access survives.
  const shares = await prisma.workspaceBoardShare.findMany({ where: { boardId: params.id } });
  let revoked = false;
  for (const row of shares) {
    if (row.invitedEmail.trim().toLowerCase() !== invitedEmail) continue;
    await prisma.workspaceBoardShare.deleteMany({
      where: { boardId: params.id, invitedEmail: row.invitedEmail },
    });
    revoked = true;
  }
  // Their open socket still carries the role from before the revoke — close
  // it so losing access takes effect immediately instead of waiting for them
  // to close the tab.
  if (revoked) await notifyWorkspaceAccessChanged(params.id, invitedEmail);
  return NextResponse.json({ ok: true });
}
