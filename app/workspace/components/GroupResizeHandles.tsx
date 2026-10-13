"use client";

import React, { useEffect, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { selectionScreenBounds, workspaceCanvasOrigin } from "../utils/blockRects";
import { useGroupResize, type ResizeCorner } from "../hooks/useGroupResize";
import { useGroupRotate } from "../hooks/useGroupRotate";

export function GroupResizeHandles() {
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const camera = useWorkspaceStore((state) => state.camera);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const { startGroupResize } = useGroupResize();
  const { startGroupRotate } = useGroupRotate();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (selectedBlockIds.length < 2) return undefined;

    let animId: number;
    const loop = () => {
      setTick((t) => (t + 1) % 1_000_000);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [selectedBlockIds.length]);

  if (selectedBlockIds.length < 2) {
    return null;
  }

  // Projected from the block transforms through the live camera rather than
  // measured — see SelectionBoundary: a measured rect lags the camera by one
  // frame, so these handles used to drift off the selection while zooming.
  const bounds = selectionScreenBounds(blocks, selectedBlockIds, camera, workspaceCanvasOrigin());
  if (!bounds) {
    return null;
  }

  const minX = bounds.left;
  const minY = bounds.top;
  const maxX = bounds.right;
  const maxY = bounds.bottom;

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  const handles: Array<{
    corner: ResizeCorner;
    cursor: string;
    left: number;
    top: number;
  }> = [
    { corner: "nw", cursor: "nwse-resize", left: minX - 4, top: minY - 4 },
    { corner: "ne", cursor: "nesw-resize", left: maxX - 4, top: minY - 4 },
    { corner: "sw", cursor: "nesw-resize", left: minX - 4, top: maxY - 4 },
    { corner: "se", cursor: "nwse-resize", left: maxX - 4, top: maxY - 4 },
  ];

  const canRotateGroup = selectedBlockIds.every((id) => {
    const b = blocks[id];
    return b && (b.type === "shape" || b.type === "path" || Boolean(b.isFloating));
  });
  const canTransformGroup = !isReadOnly && canRotateGroup;

  const centerX = (minX + maxX) / 2;

  return (
    <>
      {/* Group rotate handle stem & handle only when all selected blocks are floating/freehand */}
      {canTransformGroup && (
        <>
          <div
            style={{
              position: "fixed",
              left: `${centerX}px`,
              top: `${minY - 14}px`,
              width: 1,
              height: 14,
              backgroundColor: "#f59e0b",
              transform: "translateX(-50%)",
              pointerEvents: "none",
              zIndex: 36,
            }}
          />

          <div
            onPointerDown={startGroupRotate}
            data-group-rotate-handle="true"
            style={{
              position: "fixed",
              left: `${centerX}px`,
              top: `${minY - 24}px`,
              transform: "translateX(-50%)",
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#f59e0b",
              cursor: "grab",
              zIndex: 36,
              touchAction: "none",
              boxShadow: "0 0 0 1px #ffffff",
            }}
          />
        </>
      )}

      {canTransformGroup && handles.map(({ corner, cursor, left, top }) => (
        <div
          key={corner}
          onPointerDown={startGroupResize(corner)}
          style={{
            position: "fixed",
            left: `${left}px`,
            top: `${top}px`,
            width: 8,
            height: 8,
            backgroundColor: "#2563eb",
            cursor,
            zIndex: 35,
            touchAction: "none",
          }}
        />
      ))}
    </>
  );
}

export default GroupResizeHandles;
