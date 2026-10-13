"use client";

import React, { useEffect, useRef } from "react";

export interface TableResizeHandlesProps {
  rowWeights: number[];
  colWeights: number[];
  rows: number;
  cols: number;
  onResize: (rowWeights: number[], colWeights: number[]) => void;
}

export const TableResizeHandles: React.FC<TableResizeHandlesProps> = ({
  rowWeights,
  colWeights,
  rows,
  cols,
  onResize,
}) => {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const totalRowWeight = rowWeights.reduce((s, w) => s + w, 0) || 1;
  const totalColWeight = colWeights.reduce((s, w) => s + w, 0) || 1;

  const handleRowPointerDown =
    (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      const startClientY = e.clientY;
      const initialRowWeights = [...rowWeights];
      const initialColWeights = [...colWeights];
      const startWeightI = initialRowWeights[i] ?? 1;
      const startWeightIPlus1 = initialRowWeights[i + 1] ?? 1;

      const container = (e.currentTarget as HTMLElement).parentElement?.parentElement;
      const tableEl = container?.querySelector("table");
      const totalHeightPx =
        tableEl?.getBoundingClientRect().height ||
        container?.getBoundingClientRect().height ||
        200;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startClientY;
        const weightDelta = (deltaY / totalHeightPx) * totalRowWeight;
        const pairSum = startWeightI + startWeightIPlus1;
        const minWeight = 0.2;
        const maxWeight = Math.max(minWeight, pairSum - minWeight);
        const newWeightI = Math.min(
          Math.max(minWeight, startWeightI + weightDelta),
          maxWeight
        );
        const newWeightIPlus1 = Math.max(minWeight, pairSum - newWeightI);

        const newWeights = [...initialRowWeights];
        newWeights[i] = newWeightI;
        newWeights[i + 1] = newWeightIPlus1;
        onResize(newWeights, initialColWeights);
      };

      const onPointerUp = () => {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      if (cleanupRef.current) {
        cleanupRef.current();
      }
      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

  const handleColPointerDown =
    (j: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();

      const startClientX = e.clientX;
      const initialRowWeights = [...rowWeights];
      const initialColWeights = [...colWeights];
      const startWeightJ = initialColWeights[j] ?? 1;
      const startWeightJPlus1 = initialColWeights[j + 1] ?? 1;

      const container = (e.currentTarget as HTMLElement).parentElement?.parentElement;
      const tableEl = container?.querySelector("table");
      const totalWidthPx =
        tableEl?.getBoundingClientRect().width ||
        container?.getBoundingClientRect().width ||
        200;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startClientX;
        const weightDelta = (deltaX / totalWidthPx) * totalColWeight;
        const pairSum = startWeightJ + startWeightJPlus1;
        const minWeight = 0.2;
        const maxWeight = Math.max(minWeight, pairSum - minWeight);
        const newWeightJ = Math.min(
          Math.max(minWeight, startWeightJ + weightDelta),
          maxWeight
        );
        const newWeightJPlus1 = Math.max(minWeight, pairSum - newWeightJ);

        const newWeights = [...initialColWeights];
        newWeights[j] = newWeightJ;
        newWeights[j + 1] = newWeightJPlus1;
        onResize(initialRowWeights, newWeights);
      };

      const onPointerUp = () => {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      if (cleanupRef.current) {
        cleanupRef.current();
      }
      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };

  const rowHandles: { index: number; cumulativePercent: number }[] = [];
  let cumRowSum = 0;
  for (let i = 0; i < rows - 1; i++) {
    cumRowSum += rowWeights[i] ?? 1;
    rowHandles.push({
      index: i,
      cumulativePercent: (cumRowSum / totalRowWeight) * 100,
    });
  }

  const colHandles: { index: number; cumulativePercent: number }[] = [];
  let cumColSum = 0;
  for (let j = 0; j < cols - 1; j++) {
    cumColSum += colWeights[j] ?? 1;
    colHandles.push({
      index: j,
      cumulativePercent: (cumColSum / totalColWeight) * 100,
    });
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {rowHandles.map(({ index, cumulativePercent }) => (
        <div
          key={`row-handle-${index}`}
          onPointerDown={handleRowPointerDown(index)}
          style={{
            position: "absolute",
            top: `calc(${cumulativePercent}% - 3px)`,
            left: 0,
            right: 0,
            height: "6px",
            cursor: "row-resize",
            pointerEvents: "auto",
            backgroundColor: "transparent",
          }}
        />
      ))}
      {colHandles.map(({ index, cumulativePercent }) => (
        <div
          key={`col-handle-${index}`}
          onPointerDown={handleColPointerDown(index)}
          style={{
            position: "absolute",
            left: `calc(${cumulativePercent}% - 3px)`,
            top: 0,
            bottom: 0,
            width: "6px",
            cursor: "col-resize",
            pointerEvents: "auto",
            backgroundColor: "transparent",
          }}
        />
      ))}
    </div>
  );
};

export default TableResizeHandles;
