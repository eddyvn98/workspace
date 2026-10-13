/**
 * GET/POST/DELETE /api/workspaces/[id]/documents — a board's knowledge-base
 * source documents. Workspace counterpart of
 * app/api/mindmaps/[mindmapId]/documents/route.ts.
 *
 * The extraction is lib/extract-knowledge.ts and the image captioning is
 * lib/dify-caption.ts, both shared verbatim with the mindmap and project
 * routes — neither is mindmap-specific, so neither is reimplemented here.
 * This route is only the access rules and the HTTP shape.
 *
 * Reading needs read access, adding and removing need write access: a VIEWER
 * invited to review has to be able to see what the board's answers are drawn
 * from, which is the same bar reading comments sits at, while changing what
 * the board knows is an edit.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { extractTextFromBuffer } from "@/lib/extract-knowledge";
import { captionImageViaDify } from "@/lib/dify-caption";
import {
  addSourceDocument,
  deleteSourceDocument,
  listSourceDocuments,
  requireBoardWrite,
  WorkspaceAccessError,
} from "@/lib/workspace/knowledge-repository";
import { createResource } from "@/lib/workspace/resource-repository";

/** Original bytes are kept best-effort, alongside the extracted-text row
 *  that already exists for a successful upload — a failure here must not
 *  turn a working upload into an error, same trade already made for image
 *  captioning below. Checkpoint 6/7 of workspace-resource-roadmap.md: the
 *  resource this creates has no reader yet (no file-reference block exists),
 *  so this is purely "don't lose the original" for now. */
async function persistOriginalBytes(
  boardId: string,
  email: string,
  kind: "DOCUMENT" | "IMAGE",
  file: File,
  mimeType: string,
  buffer: Buffer,
  sourceDocumentId?: string,
): Promise<Awaited<ReturnType<typeof createResource>> | null> {
  try {
    return await createResource(boardId, email, { kind, filename: file.name, mimeType, buffer, sourceDocumentId });
  } catch (err) {
    console.warn("[workspace resource upload] failed to persist original bytes:", err);
    return null;
  }
}

type RouteParams = { params: { id: string } };

// See app/api/workspaces/[id]/resources/route.ts — same missing-cap issue,
// same fix: bound the buffered upload before extraction/captioning runs.
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

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
    return NextResponse.json({ documents: await listSourceDocuments(params.id, email) });
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
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  try {
    await requireBoardWrite(params.id, email);
  } catch (err) {
    return accessErrorResponse(err);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  try {
    if (mimeType.startsWith("image/")) {
      // An image has no text of its own, so Dify describes it and the
      // description is what gets indexed. Best-effort: a captioning failure
      // must not turn an otherwise successful upload into an error, so the
      // answer is 200 with skipped:true rather than a 5xx.
      try {
        const caption = await captionImageViaDify(buffer, mimeType, file.name, email);
        const document = await addSourceDocument(params.id, email, {
          filename: file.name,
          mimeType,
          extractedText: caption,
        });
        const resource = await persistOriginalBytes(params.id, email, "IMAGE", file, mimeType, buffer, document.id);
        return NextResponse.json({ document, resource }, { status: 201 });
      } catch (captionErr) {
        if (captionErr instanceof WorkspaceAccessError) return accessErrorResponse(captionErr);
        console.warn("[workspace knowledge upload] captioning failed, not indexed:", captionErr);
        // A short reason (no secrets: Dify error bodies are already capped) so a
        // misconfigured captioning backend is visible instead of silent.
        const reason = captionErr instanceof Error ? captionErr.message.slice(0, 200) : "unknown";
        const resource = await persistOriginalBytes(params.id, email, "IMAGE", file, mimeType, buffer);
        return NextResponse.json({ document: null, resource, skipped: true, reason }, { status: 200 });
      }
    }

    const { text } = await extractTextFromBuffer(buffer, mimeType, file.name);
    const document = await addSourceDocument(params.id, email, {
      filename: file.name,
      mimeType,
      extractedText: text,
    });
    const resource = await persistOriginalBytes(params.id, email, "DOCUMENT", file, mimeType, buffer, document.id);
    return NextResponse.json({ document, resource }, { status: 201 });
  } catch (err: unknown) {
    // 415, not 400: the request was well-formed, the format is the problem.
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "UNSUPPORTED_TYPE") {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    if (err instanceof WorkspaceAccessError) return accessErrorResponse(err);
    console.error("[workspace knowledge upload] error:", err);
    const code = err && typeof err === "object" && "code" in err
      && typeof err.code === "string"
      ? err.code
      : undefined;
    return NextResponse.json(
      { error: "Extraction failed", ...(code ? { code } : {}) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documentId = new URL(req.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Missing documentId" }, { status: 400 });

  try {
    await deleteSourceDocument(params.id, email, documentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return accessErrorResponse(err);
  }
}
