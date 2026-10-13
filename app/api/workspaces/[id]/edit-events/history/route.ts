import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../../_auth";
import { resolveAccessRole } from "../../../_access";
import { boardHistoryVisibleFrom } from "../../../_history";

type RouteParams = { params: { id: string } };

/** GET /api/workspaces/[boardId]/edit-events/history?blockId=... */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board || !(await resolveAccessRole(board, email))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blockId = req.nextUrl.searchParams.get("blockId")?.trim();
  if (!blockId) return NextResponse.json({ error: "blockId required" }, { status: 400 });
  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : null;
  if (before && Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: "Invalid before cursor" }, { status: 400 });
  }
  // A collaborator sees only what happened after they were invited, unless
  // the owner shared the full history — see boardHistoryVisibleFrom.
  const visibleFrom = await boardHistoryVisibleFrom(params.id, email);
  const events = await prisma.workspaceBoardEditEvent.findMany({
    where: {
      boardId: params.id,
      blockId,
      ...(before || visibleFrom
        ? {
            createdAt: {
              ...(before ? { lt: before } : {}),
              ...(visibleFrom ? { gte: visibleFrom } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 51,
  });
  const hasMore = events.length > 50;
  const page = hasMore ? events.slice(0, 50) : events;
  return NextResponse.json({
    events: page.map((event) => ({
      id: event.id,
      actorEmail: event.actorEmail,
      opType: event.opType,
      latestAt: event.createdAt.toISOString(),
      nodeVersion: event.blockVersion,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.createdAt.toISOString() ?? null : null,
  });
}
