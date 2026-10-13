import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

/** PATCH /api/workspaces/notifications/[notificationId] — mark read/unread.
 *  Recipient-only (a notification is never visible to anyone else, so
 *  "not found" here just means "not yours"). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { notificationId: string } },
) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.workspaceNotification.findUnique({
    where: { id: params.notificationId },
  });
  if (!existing || !sameWorkspaceIdentity(existing.recipientEmail, email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: { read?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { read } = payload;
  if (typeof read !== "boolean") {
    return NextResponse.json({ error: "read (boolean) required" }, { status: 400 });
  }

  const updated = await prisma.workspaceNotification.update({
    where: { id: params.notificationId },
    data: { read },
  });
  return NextResponse.json(updated);
}
