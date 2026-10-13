import { applyWorkspaceTableAction } from "./workspaceChatTableActions";
import { applyWorkspaceOverlayAction } from "./workspaceChatOverlayActions";
import { applyWorkspaceMapStyleChatAction } from "./workspaceChatMapStyleActions";
import { applyWorkspaceReorderAction } from "./workspaceChatReorderActions";
import { applyWorkspaceHistoryAction } from "./workspaceChatHistoryActions";
import { applyWorkspaceParityChatAction } from "./workspaceChatParityActions";

const EXTENDED_ACTIONS = new Set([
  "update_table_cell", "update_table_cells", "insert_table_row", "insert_table_column", "delete_table_row", "delete_table_column",
  "create_shape", "update_shape", "delete_shape", "duplicate_shape", "create_freehand", "update_freehand", "delete_freehand", "duplicate_freehand",
  "update_map_style", "reorder_nodes", "replace_children", "undo", "redo",
  "create_block", "update_transform", "update_z_order", "disconnect_nodes",
]);

export function applyWorkspaceExtendedChatAction(raw: Record<string, unknown>): string[] | undefined {
  const type = String(raw.type ?? "").toLowerCase();
  if (!EXTENDED_ACTIONS.has(type)) return undefined;
  if (type === "create_block" || type === "update_transform" || type === "update_z_order" || type === "disconnect_nodes") {
    return applyWorkspaceParityChatAction(raw);
  }
  if (type === "update_map_style") return applyWorkspaceMapStyleChatAction(raw);
  if (type === "reorder_nodes" || type === "replace_children") return applyWorkspaceReorderAction(raw);
  if (type === "undo" || type === "redo") return applyWorkspaceHistoryAction(raw);
  if (type === "update_table_cell" || type === "update_table_cells" || type.startsWith("insert_table_") || type.startsWith("delete_table_")) return applyWorkspaceTableAction(raw);
  return applyWorkspaceOverlayAction(raw);
}
