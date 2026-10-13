import { applyTableAction, normalizeTable, type JsonMap } from "./operationsTables";
import { applyAdvancedTableAction } from "./tableAdvancedOperations";
import { applyTableAutoFit } from "./tableAutoFitOperations";
import { duplicateTableAxis, moveTableAxis } from "./tableAxisOps";
import { importGrid, importIntoTable, pasteTableRange } from "./tableImportOps";
import { applyTableOptions } from "./tableOptionsOps";
import { sortTableRange } from "./tableSortOps";
import { applyActionToTableSheet } from "./tableWorkbookOperations";
import { applyWorkspaceParityAgentAction } from "./parityOperations";
import { resolveId, type AgentBoardState } from "./operationsCore";
import { field } from "./tableOpsShared";

export const TABLE_SURFACE_COMMANDS = [
  "update_table_options", "move_table_row", "move_table_column", "duplicate_table_row", "duplicate_table_column",
  "paste_table_range", "import_table", "sort_table_range",
];
const ADVANCED = ["update_table_cell_format", "update_table_column", "update_table_formula"];

export function isTableDataCommand(type: string): boolean {
  return type.startsWith("insert_table_") || type.startsWith("delete_table_") || type === "update_table_cell"
    || type === "update_table_cells" || ADVANCED.includes(type) || TABLE_SURFACE_COMMANDS.includes(type);
}

function applySurface(raw: JsonMap, block: JsonMap, type: string): boolean {
  const data = normalizeTable(block.data && typeof block.data === "object" ? block.data as JsonMap : {});
  const ok = type === "update_table_options" ? applyTableOptions(raw, data)
    : type === "move_table_row" ? moveTableAxis(raw, data, "row")
    : type === "move_table_column" ? moveTableAxis(raw, data, "col")
    : type === "duplicate_table_row" ? duplicateTableAxis(raw, data, "row")
    : type === "duplicate_table_column" ? duplicateTableAxis(raw, data, "col")
    : type === "paste_table_range" ? pasteTableRange(raw, data)
    : type === "import_table" ? importIntoTable(raw, data)
    : type === "sort_table_range" ? sortTableRange(raw, data) : false;
  if (!ok) return false;
  block.data = applyTableAutoFit(block, data);
  block.updatedAt = Date.now();
  return true;
}

export type TableDispatchResult = { ids: string[]; operation: string; notes?: string[] };

/** Routes every table data command; collects receipt notes the model should see. */
export function dispatchTableCommand(state: AgentBoardState, raw: JsonMap, type: string): TableDispatchResult {
  const notes: string[] = [];
  const tagged: JsonMap = { ...raw, __notes: notes };
  const resolved = resolveId(raw, state);
  const tableIds = Object.values(state.blocks).filter((block) => block.type === "table").map((block) => String(block.id));
  const targetId = resolved ?? (tableIds.length === 1 && !(type === "import_table" && field(raw, "create") === true) ? tableIds[0] : undefined);
  const block = targetId ? state.blocks[targetId] : undefined;
  const result = (ids: string[]): TableDispatchResult => ({ ids, operation: type, ...(notes.length ? { notes } : {}) });
  if (type === "import_table" && !block && importGrid(raw)) {
    const created = applyWorkspaceParityAgentAction(state, { ...raw, type: "create_block", blockType: "table", data: { rows: 1, cols: 1, cells: [[""]], headerRow: field(raw, "headerRow") !== false } });
    const id = created?.ids[0];
    if (!id || !Object.hasOwn(state.blocks, id)) return result([]);
    const ok = applyActionToTableSheet(tagged, state.blocks[id], (action, target) => applySurface(action, target, type));
    if (!ok) { delete state.blocks[id]; state.blockOrder = state.blockOrder.filter((item) => item !== id); return result([]); }
    notes.push(`Created a new table block ${id} from the imported ${String(field(raw, "format") ?? "csv")} text.`);
    return result([id]);
  }
  if (block?.type !== "table") return result([]);
  const run = (action: JsonMap, target: JsonMap) => (TABLE_SURFACE_COMMANDS.includes(type) ? applySurface(action, target, type)
    : ADVANCED.includes(type) ? applyAdvancedTableAction(action, target, type) : applyTableAction(action, target, type));
  return applyActionToTableSheet(tagged, block, run) ? result([targetId!]) : result([]);
}
