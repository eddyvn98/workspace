import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { notifyUser } from "../../_notify";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

/** DELETE /api/workspaces/[id]/access — leave a board shared with the caller. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({
    where: { id: params.id },
    select: { ownerEmail: true, title: true },
  });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sameWorkspaceIdentity(board.ownerEmail, email)) {
    return NextResponse.json({ error: "Owners cannot leave their own board" }, { status: 400 });
  }

  const shares = await prisma.workspaceBoardShare.findMany({ where: { boardId: params.id } });
  const matchingShareIds = shares
    .filter((share) => sameWorkspaceIdentity(share.invitedEmail, email))
    .map((share) => share.id);
  const removed = matchingShareIds.length > 0
    ? await prisma.workspaceBoardShare.deleteMany({ where: { id: { in: matchingShareIds } } })
    : { count: 0 };
  // Tell the owner their collaborator is gone — otherwise the person simply
  // vanishes from the roster with no trace (legacy raises the same
  // SHARE_LEFT notification, see app/api/mindmaps/[mindmapId]/leave/route.ts).
  if (removed.count > 0) {
    await notifyUser(
      board.ownerEmail,
      params.id,
      "SHARE_LEFT",
      `${email} left "${board.title}"`,
      { actorEmail: email },
    );
  }
  return NextResponse.json({ ok: true });
}
