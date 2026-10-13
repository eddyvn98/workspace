"use client";

import React from "react";
import { Plus } from "lucide-react";

export interface TableInsertHandlesProps {
  rowWeights: number[];
  colWeights: number[];
  rows: number;
  cols: number;
  onInsertRow: (rowIndex: number) => void;
  onInsertCol: (colIndex: number) => void;
}

/** Hover-to-insert affordance for tables, mirroring Lark's board table: a
 *  small dot sits on every row/column boundary at all times, and swells into
 *  a filled "+" button on hover — so inserting a row/column is a single
 *  discoverable click instead of the old right-click-then-read-a-menu flow.
 *
 *  The hoverable hit target (`.table-insert-handle`) is a fixed 20x20 box —
 *  only the decorative inner dot grows via a `:hover` CSS rule. Growing the
 *  hit target itself (previously done with React hover state) made its own
 *  bounding box move under the cursor mid-hover, so the pointer flickered
 *  in/out every frame near the boundary instead of settling. */
export const TableInsertHandles: React.FC<TableInsertHandlesProps> = ({
  rowWeights,
  colWeights,
  rows,
  cols,
  onInsertRow,
  onInsertCol,
}) => {
  const totalRowWeight = rowWeights.reduce((s, w) => s + w, 0) || 1;
  const totalColWeight = colWeights.reduce((s, w) => s + w, 0) || 1;

  const rowBoundaries: number[] = [0];
  let cumRow = 0;
  for (let i = 0; i < rows; i++) {
    cumRow += rowWeights[i] ?? 1;
    rowBoundaries.push((cumRow / totalRowWeight) * 100);
  }

  const colBoundaries: number[] = [0];
  let cumCol = 0;
  for (let j = 0; j < cols; j++) {
    cumCol += colWeights[j] ?? 1;
    colBoundaries.push((cumCol / totalColWeight) * 100);
  }

  return (
    <>
      <style>{`
        .table-insert-handle { position: absolute; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; padding: 0; cursor: pointer; pointer-events: auto; }
        .table-insert-dot { width: 6px; height: 6px; border-radius: 9999px; background: #cbd5e1; color: transparent; display: flex; align-items: center; justify-content: center; transition: width 120ms ease, height 120ms ease, background 120ms ease, color 120ms ease; }
        .table-insert-handle:hover .table-insert-dot { width: 18px; height: 18px; background: #3b82f6; color: #fff; }
      `}</style>

      <div style={{ position: "absolute", left: -20, top: 0, bottom: 0, width: 20, pointerEvents: "none", zIndex: 11 }}>
        {rowBoundaries.map((percent, index) => (
          <button
            key={`row-insert-${index}`}
            type="button"
            className="table-insert-handle"
            title="Insert row"
            aria-label="Insert row"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onInsertRow(index);
            }}
            style={{ top: `calc(${percent}% - 10px)`, left: 0 }}
          >
            <span className="table-insert-dot">
              <Plus size={12} strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>

      <div style={{ position: "absolute", top: -20, left: 0, right: 0, height: 20, pointerEvents: "none", zIndex: 11 }}>
        {colBoundaries.map((percent, index) => (
          <button
            key={`col-insert-${index}`}
            type="button"
            className="table-insert-handle"
            title="Insert column"
            aria-label="Insert column"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onInsertCol(index);
            }}
            style={{ left: `calc(${percent}% - 10px)`, top: 0 }}
          >
            <span className="table-insert-dot">
              <Plus size={12} strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
};

export default TableInsertHandles;
