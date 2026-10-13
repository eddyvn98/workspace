import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "@/app/api/workspaces/_auth";
import { readKnowledgeImage } from "@/lib/project-knowledge-storage";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email || !/^ws_[a-f0-9]+$/.test(params.fileId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const image = await readKnowledgeImage(params.fileId);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
