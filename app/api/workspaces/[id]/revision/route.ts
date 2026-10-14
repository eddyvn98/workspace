import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerAuth } from "../../_auth";
import { resolveAccessRole } from "../../_access";

/** Authenticated revision-only check. Unlike a full board GET it never changes
 * the browser's CAS base revision or returns sensitive board content. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await resolveWorkspaceCallerAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const board = await prisma.workspaceBoard.findUnique({
    where: { id: params.id }, select: { id: true, ownerEmail: true, revision: true },
  });
  if (!board || !await resolveAccessRole(board, auth.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ revision: board.revision }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
