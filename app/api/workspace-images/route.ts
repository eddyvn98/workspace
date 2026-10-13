import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "@/app/api/workspaces/_auth";
import { saveKnowledgeImage } from "@/lib/project-knowledge-storage";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are supported" }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  const fileId = `ws_${randomUUID().replace(/-/g, "")}`;
  const imageUrl = `/api/workspace-images/${fileId}`;

  try {
    await saveKnowledgeImage(fileId, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ id: fileId, url: imageUrl, source_url: imageUrl });
  } catch (error) {
    console.error("Workspace image storage error:", error);
    return NextResponse.json({ error: "Image storage failed" }, { status: 500 });
  }
}
