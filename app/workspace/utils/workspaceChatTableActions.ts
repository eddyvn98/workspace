import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import {
  deleteTableCol,
  deleteTableRow,
  insertTableCol,
  insertTableRow,
  type TableBlockData,
  normalizeTableData,
} from "./tableCellOps";
import { asNumber, asRecord, firstString, resolveWorkspaceTargetIds } from "./workspaceChatResolver";
import { normalizeFormulaGrid } from "./tableFormula";

type TableAction = "update_table_cell" | "update_table_cells" | "insert_table_row" | "insert_table_column" | "delete_table_row" | "delete_table_column";

function param(raw: Record<string, unknown>, key: string): unknown {
  return raw[key] ?? asRecord(raw.params)[key];
}

function tableTarget(raw: Record<string, unknown>): CanvasBlock<"table"> | undefined {
  const state = useWorkspaceStore.getState();
  const explicitId = firstString(param(raw, "tableId"), param(raw, "table_id"));
  const ids = explicitId ? [explicitId] : resolveWorkspaceTargetIds(raw);
  const block = ids.length === 1 ? state.blocks[ids[0]] : undefined;
  return block?.type === "table" ? block as CanvasBlock<"table"> : undefined;
}

function integerParam(raw: Record<string, unknown>, key: string): number | undefined {
  const value = asNumber(param(raw, key));
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

function cellPosition(raw: Record<string, unknown>, table: TableBlockData): { row: number; column: number } | undefined {
  const cellId = firstString(param(raw, "cellId"), param(raw, "tableCellId"));
  let row = integerParam(raw, "row");
  let column = integerParam(raw, "column");

  if (cellId) {
    const match = cellId.match(/(?:^|[-:])(\d+)[,:-](\d+)$/);
    if (match) {
      row ??= Number(match[1]);
      column ??= Number(match[2]);
    }
  }

  if (row === undefined || column === undefined || row < 0 || column < 0 || row >= table.rows || column >= table.cols) {
    return undefined;
  }
  return { row, column };
}

function cellText(raw: Record<string, unknown>, row: number, column: number): string | undefined {
  const direct = [raw.value, raw.content, param(raw, "value"), param(raw, "content")];
  for (const value of direct) if (typeof value === "string") return value;

  const params = asRecord(raw.params);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  const firstNode = asRecord(nodes[0]);
  const nodeTable = asRecord(firstNode.table);
  const tableCells = nodeTable.cells;
  if (Array.isArray(tableCells) && typeof tableCells[row]?.[column] === "string") return tableCells[row][column] as string;
  for (const value of [firstNode.topic, firstNode.text, firstNode.label, raw.topic, raw.text]) {
    if (typeof value === "string") return value;
  }
  return firstString(firstNode.topic, firstNode.text, firstNode.label, raw.topic, raw.text);
}

export function applyWorkspaceTableAction(raw: Record<string, unknown>): string[] {
  const type = String(raw.type ?? "").toLowerCase() as TableAction;
  const block = tableTarget(raw);
  if (!block) return [];

  const data = normalizeTableData(block.data);
  let next: TableBlockData | undefined;
  if (type === "update_table_cells") {
    const updates = param(raw, "cells");
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 400) return [];
    const parsed = updates.map((item) => {
      const update = asRecord(item);
      const row = asNumber(update.row);
      const column = asNumber(update.column);
      const value = typeof update.value === "string" ? update.value : update.text;
      return row !== undefined && Number.isInteger(row) && column !== undefined && Number.isInteger(column)
        && row >= 0 && row < data.rows && column >= 0 && column < data.cols && typeof value === "string"
        ? { row, column, value }
        : undefined;
    });
    if (parsed.some((item) => !item)) return [];
    const coordinates = parsed.map((item) => `${item!.row}:${item!.column}`);
    if (new Set(coordinates).size !== coordinates.length) return [];
    const cells = data.cells.map((currentRow) => [...currentRow]);
    for (const update of parsed) cells[update!.row][update!.column] = update!.value;
    next = { ...data, cells };
    if (data.formulas) {
      const formulas = normalizeFormulaGrid(data.formulas, data.rows, data.cols);
      for (const update of parsed) formulas[update!.row][update!.column] = undefined;
      next.formulas = formulas.some((row) => row.some(Boolean)) ? formulas : undefined;
    }
    if (data.cellContents) {
      next.cellContents = data.cellContents.map((currentRow, row) => currentRow.map((value, column) => {
        const update = parsed.find((item) => item!.row === row && item!.column === column);
        return update ? { version: 1, blocks: [{ type: "paragraph", runs: [{ text: update.value }] }] } : value;
      }));
    }
  } else if (type === "update_table_cell") {
    const position = cellPosition(raw, data);
    const text = position ? cellText(raw, position.row, position.column) : undefined;
    if (!position || text === undefined) return [];
    const cells = data.cells.map((currentRow, row) => currentRow.map((value, column) =>
      row === position.row && column === position.column ? text : value,
    ));
    next = { ...data, cells };
    if (data.formulas) {
      const formulas = normalizeFormulaGrid(data.formulas, data.rows, data.cols);
      formulas[position.row][position.column] = undefined;
      next.formulas = formulas.some((row) => row.some(Boolean)) ? formulas : undefined;
    }
    if (data.cellContents) {
      next.cellContents = data.cellContents.map((currentRow, row) => currentRow.map((value, column) =>
        row === position.row && column === position.column
          ? { version: 1, blocks: [{ type: "paragraph", runs: [{ text }] }] }
          : value,
      ));
    }
  } else if (type === "insert_table_row") {
    next = insertTableRow(data, integerParam(raw, "row") ?? data.rows);
  } else if (type === "insert_table_column") {
    next = insertTableCol(data, integerParam(raw, "column") ?? data.cols);
  } else if (type === "delete_table_row") {
    next = deleteTableRow(data, integerParam(raw, "row") ?? data.rows - 1);
  } else if (type === "delete_table_column") {
    next = deleteTableCol(data, integerParam(raw, "column") ?? data.cols - 1);
  }

  if (!next) return [];
  useWorkspaceStore.getState().updateBlock(block.id, { data: next });
  useWorkspaceStore.getState().setSelection([block.id]);
  return [block.id];
}
