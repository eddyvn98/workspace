import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../workspaces/_auth";
import { listCollectionApps } from "@/app/workspace/collections/collectionAppListing";

/** Accessible Collections in owned or explicitly shared boards. No data is cloned. */
export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const boards = await prisma.workspaceBoard.findMany({
    where: {
      OR: [
        { ownerEmail: { equals: email, mode: "insensitive" } },
        { shares: { some: { invitedEmail: { equals: email, mode: "insensitive" } } } },
      ],
    },
    select: { id: true, title: true, updatedAt: true, blocks: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(listCollectionApps(boards), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
