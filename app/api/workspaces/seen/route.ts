/**
 * app/api/workspaces/seen/route.ts
 *
 * GET  — { lastSeen: { [boardId]: ISO date }, callerEmail } for the caller,
 *        so the board menu can mark boards that changed since they last
 *        looked. callerEmail comes back from here rather than a separate
 *        identity endpoint so it follows the same resolution as every other
 *        workspace route, dev-only mock-email override included.
 * POST — { boardId } marks a board seen now; called while it is open.
 *
 * Distinct from WorkspacePresence.lastSeenAt, which is a short-lived
 * "who is here right now" heartbeat. This is a durable per-viewer
 * watermark. Legacy counterpart: app/api/mindmaps/seen/route.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../_auth";
import { resolveAccessRole } from "../_access";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.workspaceBoardView.findMany({
    where: { userEmail: { equals: email, mode: "insensitive" } },
    select: { boardId: true, lastSeenAt: true },
  });
  const lastSeen: Record<string, string> = {};
  for (const row of rows) lastSeen[row.boardId] = row.lastSeenAt.toISOString();
  return NextResponse.json({ lastSeen, callerEmail: email.toLowerCase() });
}

export async function POST(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { boardId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const boardId = typeof body.boardId === "string" ? body.boardId : "";
  if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

  // Same read check as every other board endpoint — a caller cannot record a
  // view against a board they cannot see.
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId } });
  if (!board || !(await resolveAccessRole(board, email))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lastSeenAt = new Date();
  const existing = (await prisma.workspaceBoardView.findMany({ where: { boardId } }))
    .find((row) => sameWorkspaceIdentity(row.userEmail, email));
  if (existing) {
    await prisma.workspaceBoardView.update({ where: { id: existing.id }, data: { lastSeenAt } });
  } else {
    await prisma.workspaceBoardView.upsert({
      where: { boardId_userEmail: { boardId, userEmail: email } },
      create: { boardId, userEmail: email, lastSeenAt },
      update: { lastSeenAt },
    });
  }
  return NextResponse.json({ lastSeenAt: lastSeenAt.toISOString() });
}
