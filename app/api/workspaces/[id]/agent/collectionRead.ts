import { NextResponse } from "next/server";
import { summarizeCollection } from "@/lib/workspace-agent/collectionContext";
import { validateCollectionAction, validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
import { COLLECTION_READ_COMMANDS } from "@/lib/workspace-agent/collectionActionSchema";
import type { CollectionBlockPayload } from "@/app/workspace/collections/model";
import { list, type JsonMap } from "./routeHelpers";

type Board = { blocks: unknown; revision: number };
export function handleCollectionRead(board: Board, actions: JsonMap[]): NextResponse | null {
  const reads = actions.filter((item) => COLLECTION_READ_COMMANDS.has(String(item.type)));
  if (!reads.length) return null;
  if (reads.length !== actions.length) return NextResponse.json({ error: "Collection reads cannot be mixed with edits", reason: "mixed_batch" }, { status: 400 });
  const blocks = Object.fromEntries(list(board.blocks).map((block) => [String(block.id), block]));
  const results: JsonMap[] = [];
  for (const action of reads) {
    const issue = validateCollectionAction(action) ?? validateCollectionTarget(action, { blocks });
    if (issue) return NextResponse.json({ error: issue, reason: "invalid_collection_read", revision: board.revision }, { status: 422 });
    const block = blocks[String(action.blockId)];
    const data = block.data as CollectionBlockPayload;
    const sources = Object.fromEntries(Object.entries(blocks).filter(([, item]) => item.type === "collection")
      .map(([id, item]) => [id, item.data as CollectionBlockPayload]));
    const selected = summarizeCollection(data, typeof action.limit === "number" ? action.limit : 16,
      action.type === "search_collection_records" ? String(action.query) : "", typeof action.viewId === "string" ? action.viewId : undefined, sources);
    results.push({ blockId: action.blockId, ...selected });
  }
  return NextResponse.json({ success: true, ok: true, action: "read_collection",
    actions: reads.map((item) => ({ type: item.type, ids: [item.blockId], changed: false })),
    result: results.length === 1 ? results[0] : { collections: results },
    revision: board.revision });
}
