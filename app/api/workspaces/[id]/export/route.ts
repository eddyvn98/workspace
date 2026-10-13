import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exportBoardContent } from "@/lib/workspace/board-export-import";
import { createBoardSlideExport } from "@/lib/workspace/board-pptx-export";
import { resolveWorkspaceCallerAuth } from "../../_auth";
import { resolveAccessRole } from "../../_access";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await resolveWorkspaceCallerAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board || !await resolveAccessRole(board, auth.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let blockIds: unknown;
  try { const input = req.nextUrl.searchParams.get("blockIds"); if (input !== null) blockIds = JSON.parse(input); }
  catch { return NextResponse.json({ error: "blockIds must be a JSON array" }, { status: 400 }); }
  const binaryFormat = req.nextUrl.searchParams.get("format");
  if (binaryFormat === "pptx" || binaryFormat === "pdf") {
    const result = await createBoardSlideExport(board, blockIds, binaryFormat);
    if (!result.ok) return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
    const name = `${board.title.replace(/[\/:*?"<>|\r\n]/g, "-").trim().slice(0, 100) || "Workspace"}.${binaryFormat}`;
    return new NextResponse(new Uint8Array(result.buffer), { headers: {
      "content-type": result.mimeType, "content-disposition": `attachment; filename="workspace.${binaryFormat}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    } });
  }
  const result = exportBoardContent(board, req.nextUrl.searchParams.get("format") ?? "json", blockIds);
  if (!result.ok) return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  const formats: Record<string, { extension: string; type: string }> = {
    json: { extension: "json", type: "application/json" }, markdown: { extension: "md", type: "text/markdown" }, opml: { extension: "opml", type: "text/x-opml" },
  };
  const format = formats[result.export.format];
  const name = `${board.title.replace(/[\/:*?"<>|\r\n]/g, "-").trim().slice(0, 100) || "Workspace"}.${format.extension}`;
  return new NextResponse(result.export.content, { headers: {
    "content-type": `${format.type}; charset=utf-8`, "content-disposition": `attachment; filename="workspace.${format.extension}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
