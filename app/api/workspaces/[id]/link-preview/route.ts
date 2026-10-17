/**
 * GET /api/workspaces/[id]/link-preview?url=... — Open Graph metadata for a
 * `link` block's preview image (Checkpoint 14 of
 * workspace-resource-roadmap.md). See lib/workspace/link-preview.ts for the
 * SSRF-safe fetch itself; this route only adds board-read gating, same bar
 * as downloading a resource.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { requireBoardRead, WorkspaceAccessError } from "@/lib/workspace/knowledge-repository";
import { fetchLinkPreview } from "@/lib/workspace/link-preview";

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    await requireBoardRead(params.id, email);
  } catch (err) {
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 404 });
    }
    return NextResponse.json({ error: "Workspace access verification unavailable" }, { status: 500 });
  }

  const preview = await fetchLinkPreview(url);
  return NextResponse.json({ preview });
}
