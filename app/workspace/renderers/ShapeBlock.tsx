"use client";

import React, { useCallback, useEffect, useState } from "react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { resolveTransform, type Transform } from "../types/block";
import { applyBackgroundOpacity } from "../utils/colorOpacity";
import { generateCloudRectPath } from "../layout/cloudPath";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { WorkspaceShapeRichEditor } from "./WorkspaceShapeRichEditor";
import { getWorkspaceShapeTextBox } from "./shapeTextInset";
import { FrameContainerToolbar } from "../components/FrameContainerToolbar";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

// Point sets for polygon-based shapes, in a 0-100 coordinate space. Exported
// for WorkspaceShapePreviewIcon.tsx so the shape picker's mini previews use
// the exact same outlines as the real rendered block.
export const POLYGON_POINTS: Record<string, string> = {
  diamond: "50,0 100,50 50,100 0,50",
  triangle: "50,0 0,100 100,100",
  hexagon: "25,0 75,0 100,50 75,100 25,100 0,50",
  star: "50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35",
  parallelogram: "20,0 100,0 80,100 0,100",
  slant: "20,0 100,0 80,100 0,100",
  // Standard flowchart "manual operation": narrower at the bottom.
  trapezoid: "20,0 80,0 100,100 0,100",
};

export const ShapeBlock: React.FC<BlockRendererProps<"shape">> = ({
  block,
  isSelected,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);
  const shapeKind = block.data?.shapeKind ?? "rectangle";
  const label = block.data?.label ?? "";
  const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditingBlockId(block.id);
  }, [block.id, setEditingBlockId]);
  const stopEditing = useCallback(() => {
    setIsEditing(false);
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);
  useEffect(() => {
    if (pendingEditBlockId === block.id) {
      startEditing();
      setPendingEditBlockId(null);
    }
  }, [pendingEditBlockId, block.id, setPendingEditBlockId, startEditing, setEditingBlockId]);
  useEffect(() => {
    if (!isSelected && isEditing) stopEditing();
  }, [isSelected, isEditing, stopEditing]);
  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);
  const textBox = getWorkspaceShapeTextBox(shapeKind, transform.w, transform.h);
  // Mirrors legacy's live auto-grow-while-typing effect (CanvasShapeElement.tsx):
  // grow the shape to fit its content, never shrink it back down. Grows from
  // the rich editor's own REAL measured content height (reported via
  // ResizeObserver — see WorkspaceShapeRichEditor.tsx's onMeasuredHeight doc
  // comment) rather than a char-count/line-wrap estimate, which found live to
  // under-shoot for some pasted content (bold/inline-code render at a
  // different width per character than the estimate assumed).
  const handleMeasuredHeight = useCallback((measuredContentHeight: number) => {
    if (block.data.frameBlockIds) return;
    const chrome = Math.max(0, transform.h - textBox.height);
    const requiredHeight = Math.ceil(measuredContentHeight + chrome);
    if (requiredHeight > transform.h) {
      useWorkspaceStore.getState().updateBlockTransform(block.id, { h: requiredHeight }, "override");
    }
  }, [transform.h, textBox.height, block.id, block.data.frameBlockIds]);
  const labelEditor = (!isEditing && !label) ? null : (
    <div style={{ position: "absolute", left: block.data.frameBlockIds ? 8 : textBox.x, top: block.data.frameBlockIds ? -28 : textBox.y, width: block.data.frameBlockIds ? transform.w : textBox.width, height: block.data.frameBlockIds ? 24 : textBox.height, zIndex: 3, pointerEvents: isEditing ? "auto" : "none" }}>
      <WorkspaceShapeRichEditor blockId={block.id} value={label} isEditing={isEditing} color={block.style?.textColor} onChange={(html) => onChange({ label: html })} onStopEditing={stopEditing} onMeasuredHeight={handleMeasuredHeight} />
    </div>
  );
  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#e2e8f0",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor =
    block.style?.borderColor ?? (isSelected ? "#2563eb" : "#94a3b8");
  const borderWidth = block.style?.borderWidth ?? 1.5;
  const borderDash = block.style?.borderDash ?? "solid";
  const borderDasharray = borderDash === "dashed" ? "8 5" : borderDash === "dotted" ? "2 4" : undefined;
  const borderStyle = borderDash === "dashed" ? "dashed" : borderDash === "dotted" ? "dotted" : "solid";
  const boxShadow = isSelected
    ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
    : "0 1px 3px 0 rgba(0, 0, 0, 0.1)";

  const points = POLYGON_POINTS[shapeKind];
  if (shapeKind === "plain_text") {
    return (
      <>
      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          backgroundColor: block.style?.backgroundColor ?? "transparent",
          boxShadow: isSelected ? boxShadow : undefined,
          overflow: "hidden",
        }}
      />
      {labelEditor}
      </>
    );
  }

  if (shapeKind === "underline") {
    return (
      <>
      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          borderBottom: `${borderWidth}px ${borderStyle} ${borderColor === "none" ? "transparent" : borderColor}`,
          backgroundColor: block.style?.backgroundColor ?? "transparent",
          boxShadow: isSelected ? boxShadow : undefined,
          overflow: "hidden",
        }}
      />
      {labelEditor}
      </>
    );
  }

  if (points) {
    // clip-path + border only renders the border where the polygon touches
    // the element's rectangular box edge (e.g. hexagon's top/bottom), so
    // diagonal/pointed edges are drawn with an SVG stroke instead, which
    // follows the actual outline.
    return (
      <>
      {/* Expand the viewport by the stroke radius: polygon points at y=0 and
          y=100 otherwise lose the outer half of the top/bottom border. */}
      <svg viewBox="-1 -1 102 102" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <polygon points={points} fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labelEditor}
      </>
    );
  }

  if (shapeKind === "speech_bubble" || shapeKind === "callout") {
    return (
      <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <path d="M10 0H90Q100 0 100 10V70Q100 80 90 80H35L15 100V80H10Q0 80 0 70V10Q0 0 10 0Z" fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labelEditor}
      </>
    );
  }

  if (shapeKind === "cylinder") {
    return (
      <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <path d="M 0,15 L 0,85 A 50,15 0 0 0 100,85 L 100,15" fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <ellipse cx={50} cy={15} rx={50} ry={15} fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labelEditor}
      </>
    );
  }

  if (shapeKind === "cloud" || shapeKind === "cloud_rect") {
    return (
      <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <path d={generateCloudRectPath(100, 100, 2)} fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labelEditor}
      </>
    );
  }

  if (shapeKind === "sticky" || shapeKind === "sticky_note") {
    return (
      <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
        <path d="M 0,0 L 80,0 L 100,20 L 100,100 L 0,100 Z" fill={backgroundColor} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M 80,0 L 80,20 L 100,20 Z" fill={borderColor} fillOpacity={0.25} stroke={borderColor} strokeWidth={borderWidth} strokeDasharray={borderDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labelEditor}
      </>
    );
  }

  const borderRadius =
    shapeKind === "ellipse" || shapeKind === "oval" || shapeKind === "circle"
      ? "50%"
      : shapeKind === "pill"
      ? "9999px"
      : shapeKind === "box" || shapeKind === "rounded_rect"
      ? "2px"
      : "6px";

  return (
    <>
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor,
        borderRadius,
        border: `${borderWidth}px ${borderStyle} ${borderColor === "none" ? "transparent" : borderColor}`,
        boxShadow,
        overflow: "hidden",
      }}
    />
    {labelEditor}
    {isSelected && block.data.frameBlockIds && <FrameContainerToolbar frameId={block.id} />}
    </>
  );
};

registerBlockRenderer("shape", ShapeBlock);
