import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "./_auth";

/** GET /api/workspaces — index of the caller's own boards (id/title/stamps
 *  plus the two "is this exposed" flags, no blocks/connectors payload —
 *  matches the board-list menu's needs, not the full board fetched by
 *  GET /api/workspaces/[id]).
 *  GET /api/workspaces?scope=shared — boards someone else shared with the
 *  caller instead, same shape plus the caller's role on each. */
export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (req.nextUrl.searchParams.get("scope") === "shared") {
    const shares = await prisma.workspaceBoardShare.findMany({
      where: { invitedEmail: { equals: email, mode: "insensitive" } },
      include: { board: { select: { id: true, title: true, updatedAt: true, createdAt: true, ownerEmail: true } } },
      orderBy: { createdAt: "desc" },
    });
    const boards = shares
      .filter((share) => share.board)
      .map((share) => ({ ...share.board, role: share.role }));
    return NextResponse.json(boards);
  }

  const boards = await prisma.workspaceBoard.findMany({
    where: { ownerEmail: { equals: email, mode: "insensitive" } },
    // createdAt is what the board menu orders by — a board must never move
    // in the list just because it was edited or merely opened (see
    // sortWorkspaceBoardsByCreation).
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdAt: true,
      publicShareEnabled: true,
      publicShareToken: true,
      publicShareExpiresAt: true,
      _count: { select: { shares: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return NextResponse.json(
    boards.map(({ _count, publicShareEnabled, publicShareToken, publicShareExpiresAt, ...board }) => ({
      ...board,
      hasCollaborators: _count.shares > 0,
      // Same three-part liveness test the public token route itself applies
      // (app/api/workspaces/public/[token]/route.ts): a row can hold a stale
      // token while the link is off or past its deadline, and such a board is
      // NOT exposed — flagging it would tell the owner to go revoke a link
      // that already serves nothing. Mirrors legacy's hasPublicViewLink in
      // lib/mindmap/repository.ts.
      hasPublicShareLink: Boolean(
        publicShareEnabled && publicShareToken && (!publicShareExpiresAt || publicShareExpiresAt > now),
      ),
      // The raw token is deliberately not returned: this list is about
      // "is it exposed", and a list response is the wrong place to hand out
      // the credential itself.
    })),
  );
}
