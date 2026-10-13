/**
 * app/api/workspaces/hidden/route.ts
 *
 * Per-user hidden-board preferences. Hiding a board never touches its access
 * grant — it only removes the row from this user's own board menu, and it is
 * always reversible.
 *
 * Previously this lived in localStorage (utils/hiddenWorkspaceBoards.ts), so
 * hiding a shared board on one machine left it visible everywhere else and
 * un-hiding was impossible from another browser. Legacy keeps the same
 * preference server-side (MindmapSidebarHide + /api/mindmaps/hidden).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../_auth";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

/** GET /api/workspaces/hidden — board ids this user has hidden. */
export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.workspaceBoardHide.findMany({
    where: { userEmail: { equals: email, mode: "insensitive" } },
    select: { boardId: true },
    orderBy: { hiddenAt: "desc" },
  });
  return NextResponse.json(rows.map((row) => row.boardId));
}

/** POST /api/workspaces/hidden { boardId } — hide a board for this user. */
export async function POST(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { boardId } = (await req.json().catch(() => ({}))) as { boardId?: unknown };
  if (typeof boardId !== "string" || !boardId) {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }
  // Only a board the caller can actually see may be hidden — otherwise this
  // route would confirm the existence of arbitrary board ids.
  const board = await prisma.workspaceBoard.findUnique({
    where: { id: boardId },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = (await prisma.workspaceBoardHide.findMany({ where: { boardId } }))
    .find((row) => sameWorkspaceIdentity(row.userEmail, email));
  if (existing) {
    await prisma.workspaceBoardHide.update({ where: { id: existing.id }, data: { hiddenAt: new Date() } });
  } else {
    await prisma.workspaceBoardHide.upsert({
      where: { boardId_userEmail: { boardId, userEmail: email } },
      create: { boardId, userEmail: email },
      update: { hiddenAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/workspaces/hidden?boardId=… — un-hide a board. */
export async function DELETE(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boardId = req.nextUrl.searchParams.get("boardId");
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const rows = await prisma.workspaceBoardHide.findMany({ where: { boardId } });
  const ids = rows.filter((row) => sameWorkspaceIdentity(row.userEmail, email)).map((row) => row.id);
  if (ids.length > 0) await prisma.workspaceBoardHide.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true });
}
