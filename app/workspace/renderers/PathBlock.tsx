"use client";

import React, { useEffect, useRef, useState } from "react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { PathVertexHandles } from "../components/PathVertexHandles";
import { buildFreehandPath } from "../utils/freehandPath";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export const PathBlock: React.FC<BlockRendererProps<"path">> = ({
  block,
  isSelected,
  onChange,
}) => {
  const points = block.data?.points ?? [];
  const strokeColor = block.data?.strokeColor ?? "#1e293b";
  const strokeWidth = block.data?.strokeWidth ?? 2;
  const opacity = block.data?.opacity ?? 1;
  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const editingBlockId = useWorkspaceStore((state) => state.editingBlockId);
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);
  const isArrowLine = block.data?.tool === "arrow_line";
  const isEditingLabel = isArrowLine && (pendingEditBlockId === block.id || editingBlockId === block.id);
  const [draftLabel, setDraftLabel] = useState(block.data?.text ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingLabel) return;
    if (pendingEditBlockId === block.id) setEditingBlockId(block.id);
    setDraftLabel(block.data?.text ?? "");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [block.data?.text, isEditingLabel, pendingEditBlockId, block.id, setEditingBlockId]);

  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);

  const commitLabel = () => {
    const nextText = draftLabel.trim();
    onChange({ text: nextText || undefined });
    setPendingEditBlockId(null);
    setEditingBlockId(null);
  };

  const pathData = buildFreehandPath(points, undefined, block.data?.tool);

  // Note: Block-local space is defined to match the box's own coordinate system
  // (0..w, 0..h) at creation time. Therefore, we render the SVG without a viewBox
  // and use points directly as literal pixel coordinates within the local box.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        overflow: "visible",
      }}
    >
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
          <path
          d={pathData}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeOpacity={opacity}
          opacity={opacity}
          fill="none"
          strokeLinecap="round"
            strokeLinejoin="round"
          />
          {block.data?.tool === "arrow_line" && points.length > 1 && (block.data.text || isSelected) && (
            <text
              x={points[0].x}
              y={Math.max(14, points[0].y - 10)}
              fill={block.data.text ? strokeColor : "#94a3b8"}
              fontSize={block.data.text ? 14 : 12}
              fontWeight={block.data.text ? "bold" : "normal"}
              pointerEvents="none"
            >
              {block.data.text || "Double-click to type"}
            </text>
          )}
          {isEditingLabel && points.length > 0 && (
            <foreignObject x={Math.max(0, points[0].x - 4)} y={Math.max(0, points[0].y - 36)} width="220" height="32">
              <input
                ref={inputRef}
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitLabel();
                  if (event.key === "Escape") {
                    setPendingEditBlockId(null);
                    setEditingBlockId(null);
                  }
                  event.stopPropagation();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Arrow line label"
                placeholder="Type a label"
                style={{ width: "210px", height: "28px", padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "white", color: "#0f172a", fontSize: "13px", outline: "none" }}
              />
            </foreignObject>
          )}
          {isSelected && (
            <PathVertexHandles
              points={points}
              tool={block.data?.tool}
              onChange={(nextPoints) => onChange({ points: nextPoints })}
            />
          )}
        </svg>
    </div>
  );
};

registerBlockRenderer("path", PathBlock);
