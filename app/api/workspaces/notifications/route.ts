import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../_auth";

/** GET /api/workspaces/notifications — the caller's 50 most recent
 *  notifications across every board (own or shared), newest first. Same
 *  20s-poll consumption pattern as the mindmap app's bell (inventory §10). */
export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await prisma.workspaceNotification.findMany({
    // A plain `=`, not mode:"insensitive". Stored recipients are lower-cased
    // and CHECK-constrained (migration 20260904100000) and the caller is
    // canonicalised in _auth.ts, so the two sides cannot disagree on case —
    // and an insensitive compare would defeat the b-tree this query needs.
    where: { recipientEmail: email },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}
