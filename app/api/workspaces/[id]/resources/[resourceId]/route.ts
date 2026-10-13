/**
 * GET/DELETE /api/workspaces/[id]/resources/[resourceId] — one uploaded
 * file's original bytes (Checkpoint 6/7 of workspace-resource-roadmap.md).
 * The canvas's `file` block (renderers/FileBlock.tsx) both downloads and
 * previews through this same GET.
 *
 * Reading needs read access, deleting needs write access — same bar as
 * app/api/workspaces/[id]/documents/route.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "../../../_auth";
import {
  getResourceArtifactContent,
  getResourceContent,
  WorkspaceAccessError,
} from "@/lib/workspace/resource-repository";
import { deleteResource, WorkspaceResourceInUseError } from "@/lib/workspace/resource-delete";

type RouteParams = { params: { id: string; resourceId: string } };

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
  if (err instanceof WorkspaceResourceInUseError) {
    return NextResponse.json({ error: err.message, code: "RESOURCE_IN_USE" }, { status: 409 });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variant = req.nextUrl.searchParams.get("variant");

  try {
    // ?variant=preview asks for the converted-Office-document PDF stand-in
    // (see resource-artifact-repository.ts) instead of the original bytes —
    // used by FileBlock.tsx when the original itself isn't inline-renderable.
    if (variant === "preview") {
      const artifact = await getResourceArtifactContent(params.id, email, params.resourceId);
      if (!artifact) return NextResponse.json({ error: "Preview not available" }, { status: 404 });
      return new NextResponse(new Uint8Array(artifact.buffer), {
        status: 200,
        headers: {
          "Content-Type": artifact.mimeType,
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const content = await getResourceContent(params.id, email, params.resourceId);
    if (!content) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

    // PDF, image and plain text render natively in a browser tab or an
    // iframe with no code of ours involved — inline lets renderers/
    // FileBlock.tsx embed a preview. text/plain is safe to inline (unlike
    // text/html or image/svg+xml) because a browser never executes it as
    // markup — X-Content-Type-Options: nosniff below stops it from being
    // sniffed into something that would. Every other type stays a forced
    // download: the browser has no safe built-in renderer for e.g. .docx.
    // image/svg+xml is excluded from the "image/" case for the same reason
    // text/html is excluded above — an inline SVG can carry <script>/event-
    // handler JS that a browser executes when opened directly, and nosniff
    // does nothing to stop that (it only stops content-type sniffing).
    const canRenderInline =
      content.mimeType === "application/pdf" ||
      content.mimeType === "text/plain" ||
      (content.mimeType.startsWith("image/") && content.mimeType !== "image/svg+xml");
    const disposition = canRenderInline ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(content.buffer), {
      status: 200,
      headers: {
        "Content-Type": content.mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(content.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return accessErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteResource(params.id, email, params.resourceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
}
