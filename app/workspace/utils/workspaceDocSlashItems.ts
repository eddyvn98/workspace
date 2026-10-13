import { Table2 } from "lucide-react";
import { SLASH_COMMAND_ITEMS, type SlashCommandItem } from "../extensions/docSlashCommand";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";

export function getWorkspaceDocSlashItems(docId: string): SlashCommandItem[] {
  const blocks = Object.values(useWorkspaceStore.getState().blocks);
  const existingTables = blocks
    .filter(
      (block): block is CanvasBlock<"table"> =>
        block.type === "table" && !block.embeddedInDocId,
    )
    .map((block) => {
      const mode = block.data.mode ?? "document";
      const firstCell = block.data.cells?.[0]?.[0]?.trim();
      const label = firstCell ? `Embed table: ${firstCell}` : `Embed ${mode} table`;
      return {
        label,
        description: "Use an existing Canvas table",
        icon: Table2,
        group: "Existing tables",
        tableId: block.id,
        command: () => {},
      } satisfies SlashCommandItem;
    });
  return [...SLASH_COMMAND_ITEMS, ...existingTables.filter((item) => item.tableId !== docId)];
}
