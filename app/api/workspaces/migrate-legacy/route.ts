import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "../_auth";
import { migrateAccessibleMindmapsToWorkspace } from "@/lib/migrations/mindmap-to-workspace-batch";

/** One-time/idempotent cutover for all legacy maps visible to the caller. */
export async function POST(req: NextRequest) {
  const callerEmail = await resolveWorkspaceCallerEmail(req);
  if (!callerEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await migrateAccessibleMindmapsToWorkspace(callerEmail));
  } catch (error) {
    console.error("[mindmap->workspace] batch migration failed", error);
    return NextResponse.json({ error: "Unable to migrate legacy mindmaps" }, { status: 500 });
  }
}
