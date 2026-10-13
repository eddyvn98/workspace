"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { TableCell } from "./TableCell";
import { TableResizeHandles } from "./TableResizeHandles";
import { TableInsertHandles } from "./TableInsertHandles";
import { TableCellContextMenu } from "./TableCellContextMenu";
import { getCellFontSize, getCellAlign, getCellBgColor, getCellTextColor, insertTableRow, insertTableCol, findMergeAt } from "../utils/tableCellOps";
import { getColumnType, getColumnOptions } from "../utils/tableColumnTypes";
import { applyBackgroundOpacity } from "../utils/colorOpacity";
import { useTableBlockActions } from "../hooks/useTableBlockActions";
import { isCellInRange } from "../utils/tableKeyboard";
import { useTableColumnActions } from "../hooks/useTableColumnActions";
import { TableColumnHeaderControls } from "./TableColumnHeaderControls";
import { buildTableRenderData } from "../utils/tableRenderData";
import { fitTableContent } from "../utils/tableAutoFit";

export const TableBlock: React.FC<BlockRendererProps<"table"> & { isEmbedded?: boolean; onSelectEmbedded?: () => void }> = ({
  block,
  isSelected,
  onChange,
  isEmbedded = false,
  onSelectEmbedded,
}) => {
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const cellFontSizes = block.data?.cellFontSizes;
  const cellAlign = block.data?.cellAlign;
  const cellBgColor = block.data?.cellBgColor;
  const cellTextColor = block.data?.cellTextColor;
  const merges = block.data?.merges ?? [];
  const columnTypes = block.data?.columnTypes;
  const columnSelectOptions = block.data?.columnSelectOptions;
  const headerRow = Boolean(block.data?.headerRow);
  const headerCol = Boolean(block.data?.headerCol);
  const passThroughEmptyCellClicks = Boolean(block.data?.passThroughEmptyCellClicks);
  const handleTableChange = React.useCallback((patch: Parameters<typeof onChange>[0]) => {
    const needsFit = block.data?.autoFitContent !== false
      && !block.data?.merges?.length
      && ["cells", "rows", "cols", "formulas"].some((key) => key in patch);
    if (!needsFit) {
      onChange(patch);
      return;
    }
    const fit = fitTableContent((patch as { cells?: unknown }).cells ?? block.data.cells);
    onChange({ ...patch, autoFitContent: true, rowWeights: fit.rowWeights, colWeights: fit.colWeights });
    updateBlockTransform(block.id, { w: fit.width, h: fit.height }, "override");
  }, [block.data, block.id, onChange, updateBlockTransform]);
  const {
    mode, rows, cols, rowWeights, colWeights, rowSum, colSum, grid, displayGrid,
    contentGrid, formulaGrid, formulaErrors, rowOrder, sortCol, filterCol,
  } = buildTableRenderData(block);

  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#ffffff",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor = block.style?.borderColor ?? (isSelected ? "#2563eb" : "#cbd5e1");
  const borderWidth = isSelected ? "2px" : "1px";

  const {
    editingCell, selectedCell, selectedRange, contextMenu, selectCell, setEditingCell, setContextMenu,
    handleCellKeyDown, handleCellChange, handleCellCancel, handleCellNavigate,
    handleInsertRowAbove, handleInsertRowBelow, handleInsertColLeft, handleInsertColRight,
    handleDeleteRow, handleDeleteCol, handleDuplicateRow, handleDuplicateCol,
    handleMoveRowUp, handleMoveRowDown, handleMoveColLeft, handleMoveColRight,
    handleMergeRight, handleMergeDown, handleUnmerge, setCellColor, handlePasteRange, handleResize,
  } = useTableBlockActions(block, handleTableChange, grid, contentGrid, rows, cols, rowWeights, colWeights, cellBgColor, cellTextColor);

  const { handleSetColumnType, handleAddOption, handleRemoveOption, handleSortColumn, handleFilterColumn } =
    useTableColumnActions(block, handleTableChange, cols);

  return (
    <div data-workspace-table-mode={mode} style={{ width: "100%", height: "100%", position: "relative" }}>

      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          backgroundColor,
          borderRadius: mode === "spreadsheet" ? "3px" : "6px",
          border: `${borderWidth} solid ${borderColor}`,
          boxShadow: isSelected
            ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
            : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          // A child <td>'s own pointerEvents:"none" only skips THAT cell -
          // hit-testing then falls to whatever paints next, which is this
          // wrapper div itself (still solid) rather than a connector drawn
          // further behind. Turning this wrapper off too, then explicitly
          // re-enabling it per cell below, is what actually lets a click
          // reach through an empty cell.
          pointerEvents: passThroughEmptyCellClicks ? "none" : undefined,
        }}
      >
        <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            {rowOrder.map((rowIdx) => {
              const rowArr = grid[rowIdx];
              return (
              <tr key={rowIdx} style={{ height: `${(rowWeights[rowIdx] / rowSum) * 100}%`, ...(headerRow && rowIdx === 0 ? { backgroundColor: "#f8fafc", fontWeight: 600 } : {}) }}>
                {rowArr.map((cellVal, colIdx) => {
                  const merge = findMergeAt(merges, rowIdx, colIdx);
                  // A cell covered by another cell's merge span renders nothing -
                  // the anchor cell (merge.row/merge.col) carries the rowSpan/colSpan.
                  if (merge && (merge.row !== rowIdx || merge.col !== colIdx)) return null;
                  const rowSpan = merge?.rowSpan ?? 1;
                  const colSpan = merge?.colSpan ?? 1;
                  const bg = getCellBgColor(cellBgColor, rowIdx, colIdx);
                  const textColor = getCellTextColor(cellTextColor, rowIdx, colIdx);
                  return (
                  <td
                    key={colIdx}
                    rowSpan={rowSpan}
                    colSpan={colSpan}
                    data-workspace-table-cell="true"
                    data-workspace-table-id={block.id}
                    data-workspace-table-row={rowIdx}
                    data-workspace-table-col={colIdx}
                    style={{
                      border: "1px solid #cbd5e1", padding: 0, margin: 0, boxSizing: "border-box",
                      ...(colSpan === 1 ? { width: `${(colWeights[colIdx] / colSum) * 100}%` } : {}),
                      ...(bg ? { backgroundColor: bg } : headerCol && colIdx === 0 ? { backgroundColor: "#f8fafc", fontWeight: 600 } : {}),
                      // A cell's own background is always a fixed light color
                      // (white, or #f8fafc for a header), never the app theme
                      // — so its text can't inherit the ambient dark-mode
                      // foreground color the way an untouched <td> otherwise
                      // would (near-white text on a white cell, invisible).
                      color: textColor ?? "#1e293b",
                      // A cell mid-edit must stay clickable (cursor placement,
                      // the mini formatting toolbar) even with no text yet -
                      // only the at-rest empty state passes clicks through.
                      ...(passThroughEmptyCellClicks
                        ? { pointerEvents: cellVal || displayGrid[rowIdx][colIdx] || formulaGrid[rowIdx][colIdx] || (editingCell?.row === rowIdx && editingCell?.col === colIdx) ? "auto" : "none" }
                        : {}),
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectEmbedded?.();
                      if (!isEmbedded) setSelection([block.id]);
                      selectCell({ row: rowIdx, col: colIdx });
                      setContextMenu({ position: { x: e.clientX, y: e.clientY }, row: rowIdx, col: colIdx });
                    }}
                  >
                    <TableCell
                      cellId={`${block.id}-${rowIdx}-${colIdx}`}
                      content={contentGrid[rowIdx][colIdx]}
                      editContent={formulaGrid[rowIdx][colIdx] ? { version: 1, blocks: [{ type: "paragraph", runs: [{ text: formulaGrid[rowIdx][colIdx]! }] }] } : undefined}
                      fontSize={getCellFontSize(cellFontSizes, rowIdx, colIdx)}
                      align={getCellAlign(cellAlign, rowIdx, colIdx)}
                      formula={formulaGrid[rowIdx][colIdx]}
                      formulaError={formulaErrors[rowIdx][colIdx]}
                      allowFormula={mode === "spreadsheet"}
                      columnType={headerRow && rowIdx === 0 ? "text" : getColumnType(columnTypes, colIdx)}
                      columnOptions={getColumnOptions(columnSelectOptions, colIdx)}
                      onPointerDown={onSelectEmbedded}
                      showEditorToolbar={false}
                      isSelected={selectedCell?.row === rowIdx && selectedCell?.col === colIdx}
                      isRangeSelected={isCellInRange(selectedRange, { row: rowIdx, col: colIdx })}
                      isEditing={editingCell?.row === rowIdx && editingCell?.col === colIdx}
                      onSelect={() => {
                        // TableCell stops pointerdown/click propagation so drag/pan
                        // handlers don't fire while editing text — but that also
                        // means BlockFrame's own selection logic never runs, so
                        // clicking a cell must select the table block itself here
                        // or the resize handles (gated on isSelected) never return
                        // after the user clicks away once.
                        onSelectEmbedded?.();
                        if (!isEmbedded) setSelection([block.id]);
                        selectCell({ row: rowIdx, col: colIdx });
                      }}
                      onEnterEdit={() => {
                        onSelectEmbedded?.();
                        if (!isEmbedded) setSelection([block.id]);
                        selectCell({ row: rowIdx, col: colIdx });
                        setEditingCell({ row: rowIdx, col: colIdx });
                      }}
                      onChange={(content) => handleCellChange(rowIdx, colIdx, content)}
                      onBlur={() => setEditingCell(null)}
                      onCancel={(content) => handleCellCancel(rowIdx, colIdx, content)}
                      onNavigate={(direction, content) => handleCellNavigate(rowIdx, colIdx, direction, content)}
                      onKeyDown={(event) => handleCellKeyDown(event, rowIdx, colIdx)}
                      onPasteRange={(grid) => handlePasteRange(rowIdx, colIdx, grid)}
                    />
                  </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row divider/insert positions assume physical row order, which a
          sort or filter view no longer matches visually - hidden together
          rather than left silently misaligned. */}
      {isSelected && !sortCol && !filterCol && (
        <TableResizeHandles
          rowWeights={rowWeights}
          colWeights={colWeights}
          rows={rows}
          cols={cols}
          onResize={handleResize}
        />
      )}

      {isSelected && !sortCol && !filterCol && (
        <TableInsertHandles
          rowWeights={rowWeights}
          colWeights={colWeights}
          rows={rows}
          cols={cols}
          onInsertRow={(rowIndex) => handleTableChange(insertTableRow(block.data, rowIndex))}
          onInsertCol={(colIndex) => handleTableChange(insertTableCol(block.data, colIndex))}
        />
      )}

      {/* A swimlane's grid also sets headerRow (see workspaceSwimlaneTemplate.ts)
          for its lane-label row/column - that's a background layout, not a
          data table, so column type/sort/filter make no sense there.
          disableCellAttachment is the same flag the swimlane already uses to
          mark "structural grid, not a content table" (see BlockDataMap.table
          in types/table.ts), reused here for the identical reason. */}
      {isSelected && headerRow && !block.data?.disableCellAttachment && (
        <TableColumnHeaderControls
          colWeights={colWeights}
          cols={cols}
          columnTypes={columnTypes}
          columnSelectOptions={columnSelectOptions}
          sortCol={sortCol}
          filterCol={filterCol}
          onSetType={handleSetColumnType}
          onAddOption={handleAddOption}
          onRemoveOption={handleRemoveOption}
          onSort={handleSortColumn}
          onFilter={handleFilterColumn}
        />
      )}

      {contextMenu && (
        <TableCellContextMenu
          position={contextMenu.position}
          rowIndex={contextMenu.row}
          colIndex={contextMenu.col}
          rows={rows}
          cols={cols}
          onInsertRowAbove={handleInsertRowAbove}
          onInsertRowBelow={handleInsertRowBelow}
          onInsertColLeft={handleInsertColLeft}
          onInsertColRight={handleInsertColRight}
          onDeleteRow={handleDeleteRow}
          onDeleteCol={handleDeleteCol}
          onDuplicateRow={handleDuplicateRow}
          onDuplicateCol={handleDuplicateCol}
          onMoveRowUp={handleMoveRowUp}
          onMoveRowDown={handleMoveRowDown}
          onMoveColLeft={handleMoveColLeft}
          onMoveColRight={handleMoveColRight}
          onMergeRight={handleMergeRight}
          onMergeDown={handleMergeDown}
          onUnmerge={handleUnmerge}
          isMerged={Boolean(findMergeAt(merges, contextMenu.row, contextMenu.col))}
          bgColor={getCellBgColor(cellBgColor, contextMenu.row, contextMenu.col)}
          textColor={getCellTextColor(cellTextColor, contextMenu.row, contextMenu.col)}
          onSetBgColor={(color) => setCellColor("cellBgColor", contextMenu.row, contextMenu.col, color)}
          onSetTextColor={(color) => setCellColor("cellTextColor", contextMenu.row, contextMenu.col, color)}
          onClose={() => setContextMenu(null)}
        />
      )}

    </div>
  );
};

registerBlockRenderer("table", TableBlock);
