import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerAuth } from "../../../../_auth";
import { resolveAccessRole } from "../../../../_access";
import { cancelWorkspaceTurn } from "@/lib/workspace-agent/turnStore";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.turnId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(body.turnId)) {
    return NextResponse.json({ error: "A valid turnId is required" }, { status: 400 });
  }
  const auth = await resolveWorkspaceCallerAuth(req, body);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board || !await resolveAccessRole(board, auth.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const status = await cancelWorkspaceTurn({ boardId: params.id, actorEmail: auth.email, turnId: body.turnId });
  return NextResponse.json({ ok: true, turnId: body.turnId, status });
}
