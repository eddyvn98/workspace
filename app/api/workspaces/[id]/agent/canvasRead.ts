import { NextResponse } from "next/server";
import type { WorkspaceBoard } from "@prisma/client";
import { agentMutationReceipt, list, textOf, type JsonMap } from "./routeHelpers";

export function handleCanvasRead(action: string | undefined, body: JsonMap, board: WorkspaceBoard, blocks: JsonMap[]) {
  const connectors = list(board.connectors);
  if (action === "read" || action === "verify") {
    return NextResponse.json({ success: true, ok: true, action, revision: board.revision, title: board.title, blockCount: blocks.length, connectorCount: connectors.length, board });
  }
  if (action === "find") {
    const query = String(body?.query ?? "").trim().toLowerCase();
    const matchedBlocks = query ? blocks.filter((block) => textOf(block).toLowerCase().includes(query)) : [];
    const matches = agentMutationReceipt(
      board,
      matchedBlocks.map((block) => ({ type: "find", ids: [String(block.id)], changed: false })),
      board.frames,
    ).changedBlocks as unknown[];
    return NextResponse.json({ success: true, ok: true, action, query, matches, count: matches.length, revision: board.revision });
  }
  return null;
}
