import type { Editor, Range } from "@tiptap/react";
import type { BlockId, CanvasBlock } from "../types/block";
import type { TableMode } from "../types/table";
import { createDualTransform } from "../types/block";
import { createWorkspaceTableBlock } from "./workspaceTableFactory";

const EMBEDDED_TABLE_TRANSFORM = {
  x: 0,
  y: 0,
  w: 520,
  h: 300,
  rotation: 0,
  zIndex: 0,
};

export function createEmbeddedWorkspaceTable(docId: BlockId, mode: TableMode): CanvasBlock<"table"> {
  return {
    ...createWorkspaceTableBlock(createDualTransform(EMBEDDED_TABLE_TRANSFORM), mode),
    embeddedInDocId: docId,
  };
}

export function insertWorkspaceTableReference(editor: Editor, range: Range, tableId: BlockId): void {
  editor.chain().focus().deleteRange(range).insertContent({
    type: "workspaceTable",
    attrs: { tableId },
  }).run();
}

export function isWorkspaceTableEmbedded(block: CanvasBlock, docId: BlockId): boolean {
  return block.type === "table" && block.embeddedInDocId === docId;
}
