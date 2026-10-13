import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock, Transform } from "../types/block";
import type { TableCellContent } from "../types/table";
import { tableCellContentToPlainText } from "../components/table/tableCellContent";
import {
  insertTableRow,
  deleteTableRow,
  insertTableCol,
  deleteTableCol,
  duplicateTableRow,
  duplicateTableCol,
  swapTableRows,
  swapTableCols,
  mergeCellsRight,
  mergeCellsDown,
  unmergeCell,
} from "../utils/tableCellOps";
import { pasteRangeIntoTable } from "../utils/tablePasteOps";
import { applyTableWeightResizeToAnchors, findSwimlaneAnchoredBlockIds, isSwimlaneAnchorTable } from "../utils/swimlaneTableAnchors";
import { resolveTransform } from "../types/block";
import { normalizeFormulaGrid } from "../utils/tableFormula";
import { moveTableCell, type TableCellPosition, type TableCellRange, type TableNavigationDirection } from "../utils/tableKeyboard";

const DEFAULT_TABLE_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export type CellPos = TableCellPosition;
export type CellRange = TableCellRange;

export interface ContextMenuState {
  position: { x: number; y: number };
  row: number;
  col: number;
}

/** All editing/structural interaction state and handlers for TableBlock -
 *  split out purely to keep TableBlock.tsx's own render code under the
 *  project's 300-line-per-file cap; there is no reuse across renderers. */
export function useTableBlockActions(
  block: CanvasBlock<"table">,
  onChange: (patch: Partial<CanvasBlock<"table">["data"]>) => void,
  grid: string[][],
  contentGrid: TableCellContent[][],
  rows: number,
  cols: number,
  rowWeights: number[],
  colWeights: number[],
  cellBgColor: (string | undefined)[][] | undefined,
  cellTextColor: (string | undefined)[][] | undefined
) {
  const anchorDragSnapshotRef = useRef<{
    rowWeights: number[];
    colWeights: number[];
    transforms: Record<string, Transform>;
  } | null>(null);

  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellPos | null>(null);
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const selectCell = useCallback((cell: CellPos) => {
    setSelectedCell(cell);
    setSelectedRange({ start: cell, end: cell });
  }, []);

  const pendingEditTableCell = useWorkspaceStore((state) => state.pendingEditTableCell);
  const setPendingEditTableCell = useWorkspaceStore((state) => state.setPendingEditTableCell);
  useEffect(() => {
    if (pendingEditTableCell?.tableId !== block.id) return;
    const nextCell = { row: pendingEditTableCell.row, col: pendingEditTableCell.col };
    selectCell(nextCell);
    setEditingCell(nextCell);
    setPendingEditTableCell(null);
  }, [pendingEditTableCell, block.id, selectCell, setPendingEditTableCell]);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, rowIdx: number, colIdx: number) => {
      const target = e.currentTarget as HTMLElement;
      if (target.dataset.tableCellEditor === "true") return;

      const directionByKey: Record<string, TableNavigationDirection> = {
        ArrowLeft: "previous",
        ArrowRight: "next",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const direction = directionByKey[e.key];
      if (!direction) return;
      const nextCell = moveTableCell({ row: rowIdx, col: colIdx }, direction, rows, cols);
      if (!nextCell) return;

      e.preventDefault();
      if (e.shiftKey) {
        const anchor = selectedRange?.start ?? { row: rowIdx, col: colIdx };
        setSelectedCell(nextCell);
        setSelectedRange({ start: anchor, end: nextCell });
      } else {
        selectCell(nextCell);
      }
    },
    [cols, rows, selectCell, selectedRange?.start]
  );

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, content: TableCellContent) => {
      const input = tableCellContentToPlainText(content);
      const formula = block.data?.mode === "spreadsheet" && input.trimStart().startsWith("=") ? input.trim() : undefined;
      const newCells = grid.map((rowArr, rIdx) =>
        rowArr.map((cellVal, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? (formula ? "" : input) : cellVal))
      );
      const newContents = contentGrid.map((rowArr, rIdx) =>
        rowArr.map((cellContent, cIdx) => (rIdx === rowIndex && cIdx === colIndex ? content : cellContent))
      );
      const nextFormulas = block.data?.formulas || formula
        ? normalizeFormulaGrid(block.data?.formulas, rows, cols)
        : undefined;
      if (nextFormulas) {
        nextFormulas[rowIndex][colIndex] = formula;
      }
      const hasFormula = nextFormulas?.some((row) => row.some(Boolean));
      onChange({
        cells: newCells,
        cellContents: newContents,
        ...(hasFormula ? { formulas: nextFormulas } : { formulas: undefined }),
      });
    },
    [block.data?.formulas, block.data?.mode, cols, contentGrid, grid, onChange, rows]
  );

  const handleCellCancel = useCallback(
    (rowIndex: number, colIndex: number, content: TableCellContent) => {
      handleCellChange(rowIndex, colIndex, content);
      setEditingCell(null);
    },
    [handleCellChange]
  );

  const handleCellNavigate = useCallback(
    (rowIndex: number, colIndex: number, direction: TableNavigationDirection, content: TableCellContent) => {
      handleCellChange(rowIndex, colIndex, content);
      const nextCell = moveTableCell({ row: rowIndex, col: colIndex }, direction, rows, cols);
      setEditingCell(null);
      selectCell(nextCell ?? { row: rowIndex, col: colIndex });
    },
    [cols, handleCellChange, rows, selectCell]
  );

  /* Structural handlers intentionally stay below the keyboard lifecycle. */
  const handleInsertRowAbove = useCallback(() => { if (contextMenu) onChange(insertTableRow(block.data, contextMenu.row)); }, [block.data, contextMenu, onChange]);
  const handleInsertRowBelow = useCallback(() => { if (contextMenu) onChange(insertTableRow(block.data, contextMenu.row + 1)); }, [block.data, contextMenu, onChange]);
  const handleInsertColLeft = useCallback(() => { if (contextMenu) onChange(insertTableCol(block.data, contextMenu.col)); }, [block.data, contextMenu, onChange]);
  const handleInsertColRight = useCallback(() => { if (contextMenu) onChange(insertTableCol(block.data, contextMenu.col + 1)); }, [block.data, contextMenu, onChange]);
  const handleDeleteRow = useCallback(() => { if (contextMenu) onChange(deleteTableRow(block.data, contextMenu.row)); }, [block.data, contextMenu, onChange]);
  const handleDeleteCol = useCallback(() => { if (contextMenu) onChange(deleteTableCol(block.data, contextMenu.col)); }, [block.data, contextMenu, onChange]);
  const handleDuplicateRow = useCallback(() => { if (contextMenu) onChange(duplicateTableRow(block.data, contextMenu.row)); }, [block.data, contextMenu, onChange]);
  const handleDuplicateCol = useCallback(() => { if (contextMenu) onChange(duplicateTableCol(block.data, contextMenu.col)); }, [block.data, contextMenu, onChange]);
  const handleMoveRowUp = useCallback(() => { if (contextMenu) onChange(swapTableRows(block.data, contextMenu.row, contextMenu.row - 1)); }, [block.data, contextMenu, onChange]);
  const handleMoveRowDown = useCallback(() => { if (contextMenu) onChange(swapTableRows(block.data, contextMenu.row, contextMenu.row + 1)); }, [block.data, contextMenu, onChange]);
  const handleMoveColLeft = useCallback(() => { if (contextMenu) onChange(swapTableCols(block.data, contextMenu.col, contextMenu.col - 1)); }, [block.data, contextMenu, onChange]);
  const handleMoveColRight = useCallback(() => { if (contextMenu) onChange(swapTableCols(block.data, contextMenu.col, contextMenu.col + 1)); }, [block.data, contextMenu, onChange]);
  const handleMergeRight = useCallback(() => { if (contextMenu) onChange(mergeCellsRight(block.data, contextMenu.row, contextMenu.col)); }, [block.data, contextMenu, onChange]);
  const handleMergeDown = useCallback(() => { if (contextMenu) onChange(mergeCellsDown(block.data, contextMenu.row, contextMenu.col)); }, [block.data, contextMenu, onChange]);
  const handleUnmerge = useCallback(() => { if (contextMenu) onChange(unmergeCell(block.data, contextMenu.row, contextMenu.col)); }, [block.data, contextMenu, onChange]);

  const setCellColor = useCallback(
    (field: "cellBgColor" | "cellTextColor", row: number, col: number, color: string | undefined) => {
      const source = field === "cellBgColor" ? cellBgColor : cellTextColor;
      const next: (string | undefined)[][] = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (r === row && c === col ? color : source?.[r]?.[c]))
      );
      onChange(field === "cellBgColor" ? { cellBgColor: next } : { cellTextColor: next });
    },
    [cellBgColor, cellTextColor, cols, onChange, rows]
  );

  const handlePasteRange = useCallback(
    (row: number, col: number, pasteGrid: string[][]) => onChange(pasteRangeIntoTable(block.data, row, col, pasteGrid)),
    [block.data, onChange]
  );

  const handleResize = useCallback(
    (newRowWeights: number[], newColWeights: number[]) => {
      if (isSwimlaneAnchorTable(block)) {
        const snapshot = anchorDragSnapshotRef.current;
        const isFreshGesture = !snapshot || snapshot.rowWeights !== rowWeights || snapshot.colWeights !== colWeights;
        if (isFreshGesture) {
          const blocks = useWorkspaceStore.getState().blocks;
          const transforms: Record<string, Transform> = {};
          for (const id of findSwimlaneAnchoredBlockIds(blocks, block)) {
            transforms[id] = resolveTransform(blocks[id]?.transform, DEFAULT_TABLE_TRANSFORM);
          }
          anchorDragSnapshotRef.current = { rowWeights, colWeights, transforms };
        }
        const { transforms } = anchorDragSnapshotRef.current!;
        applyTableWeightResizeToAnchors(transforms, block, rowWeights, colWeights, newRowWeights, newColWeights, useWorkspaceStore.getState().updateBlockTransform);
      }
      onChange({ rowWeights: newRowWeights, colWeights: newColWeights, autoFitContent: false });
    },
    [block, colWeights, onChange, rowWeights]
  );

  return {
    editingCell, selectedCell, selectedRange, contextMenu, selectCell, setEditingCell, setContextMenu,
    handleCellKeyDown, handleCellChange, handleCellCancel, handleCellNavigate,
    handleInsertRowAbove, handleInsertRowBelow, handleInsertColLeft, handleInsertColRight,
    handleDeleteRow, handleDeleteCol, handleDuplicateRow, handleDuplicateCol,
    handleMoveRowUp, handleMoveRowDown, handleMoveColLeft, handleMoveColRight,
    handleMergeRight, handleMergeDown, handleUnmerge, setCellColor, handlePasteRange, handleResize,
  };
}
