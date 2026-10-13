/**
 * GET/POST /api/workspaces/[id]/resources — a board's resources (Checkpoint
 * 5-7 of workspace-resource-roadmap.md), independent of the knowledge-base
 * `/documents` route: this one does no text extraction or captioning, it
 * only stores original bytes. It exists so the canvas's `file` block
 * (renderers/FileBlock.tsx, created via useFileDropFromOS.ts) has something
 * to POST to that isn't the AI-knowledge-indexing path in
 * app/api/workspaces/[id]/documents/route.ts.
 *
 * Reading needs read access, adding needs write access — same bar as every
 * other board-content route in this family.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { createResource, listResources, WorkspaceAccessError } from "@/lib/workspace/resource-repository";

type RouteParams = { params: { id: string } };

// No cap here meant an arbitrary multipart upload was buffered whole into
// memory (Buffer.from(await file.arrayBuffer())) before any validation ran —
// unlike app/api/workspace-images/route.ts's 15MB image cap. 50MB is
// generous for a board attachment while bounding per-request memory/disk use.
const MAX_RESOURCE_BYTES = 50 * 1024 * 1024;

/** NOT_FOUND is 404 rather than 403 even for "no access at all", so this
 *  route cannot be used to ask whether a board id is real — the same
 *  anti-enumeration rule as every other route in this family. */
function accessErrorResponse(err: unknown) {
  if (err instanceof WorkspaceAccessError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.code === "FORBIDDEN" ? 403 : 404 },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ resources: await listResources(params.id, email) });
  } catch (err) {
    return accessErrorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    file = (await req.formData()).get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_RESOURCE_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "IMAGE" : "DOCUMENT";

  try {
    const resource = await createResource(params.id, email, { kind, filename: file.name, mimeType, buffer });
    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    return accessErrorResponse(err);
  }
}
