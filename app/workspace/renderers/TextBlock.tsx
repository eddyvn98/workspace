"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { renderMarkdownPreview } from "../utils/markdownPreview";
import { applyBackgroundOpacity } from "../utils/colorOpacity";
import { generateCloudRectPath } from "../layout/cloudPath";
import { continueMarkdownList, deleteEmptyMarkdownNumberedLine, indentMarkdownSelection, toggleInlineMarkdown, type InlineShortcut } from "../utils/inlineMarkdownEditing";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { POLYGON_POINTS } from "./ShapeBlock";

const LIST_LINE_PATTERN = /^(?:\s*(?:•|[-*+]|\d+[.)]|>)\s+)/;

export const TextBlock: React.FC<BlockRendererProps<"text">> = ({
  block,
  isSelected,
  onChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRestoreGenerationRef = useRef(0);
  const [isEditing, setIsEditing] = useState(false);

  const markdown = block.data?.markdown ?? "";
  const align = block.data?.align ?? "center";
  const padding = block.data?.padding ?? 8;
  const fontSize = block.data?.fontSize ?? 11;
  const fontWeight = block.data?.fontWeight ?? (block.parentId ? 600 : "bold");
  const fontStyle = block.data?.fontStyle ?? "normal";
  const textDecoration = [block.data?.fontUnderline ? "underline" : "", block.data?.fontStrikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none";
  const verticalAlign = block.data?.verticalAlign ?? "middle";
  const textColor = block.style?.textColor ?? "#1e293b";
  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#ffffff",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor =
    block.style?.borderColor ?? (isSelected ? "#2563eb" : "#cbd5e1");
  const shapeKind = block.style?.shapeKind;
  const borderWidthPx = block.style?.borderWidth ?? (isSelected ? 2 : 1);
  const borderWidth = `${borderWidthPx}px`;
  const borderStyle = block.style?.borderDash === "dashed" ? "dashed" : block.style?.borderDash === "dotted" ? "dotted" : "solid";
  // A CSS `border` only paints where a polygon clip-path touches the box's
  // own rectangular edge — a single point for a diamond, none at all for a
  // parallelogram — so it renders as no visible border at all (see the same
  // note in ShapeBlock.tsx). Draw an SVG stroke along the actual polygon
  // outline instead for any shape that has one.
  const polygonPoints = shapeKind ? POLYGON_POINTS[shapeKind] : undefined;
  const polygonDasharray = block.style?.borderDash === "dashed" ? "8 5" : block.style?.borderDash === "dotted" ? "2 4" : undefined;
  const shapeRadius = shapeKind === "pill" ? "9999px" : shapeKind === "circle" || shapeKind === "oval" ? "50%" : shapeKind === "rounded_rect" ? "2px" : shapeKind === "cloud_rect" || shapeKind === "cloud" ? "26%" : "6px";
  const shapeClipPath = shapeKind === "diamond" ? "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"
    : shapeKind === "triangle" ? "polygon(50% 0, 0 100%, 100% 100%)"
    : shapeKind === "hexagon" ? "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)"
    : shapeKind === "star" ? "polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
    : shapeKind === "parallelogram" || shapeKind === "slant" ? "polygon(20% 0, 100% 0, 80% 100%, 0 100%)"
    : undefined;
  const hasCustomSvgShape = shapeKind === "speech_bubble" || shapeKind === "callout" || shapeKind === "cylinder" || shapeKind === "cloud" || shapeKind === "cloud_rect";
  const isTextOnly = shapeKind === "plain_text";
  const isUnderline = shapeKind === "underline";
  // clip-path clips the OUTER box by its own geometry regardless of padding -
  // padding only narrows where the text sits, it can't move where the taper
  // cuts. A diamond reaches full width only exactly at its vertical center,
  // so as soon as a label wraps to more than one line, whichever lines land
  // off-center get clipped mid-word (readable as the label missing letters).
  // The one inset that's actually safe at every line position is the largest
  // axis-aligned rectangle that fits inside the shape: for a rhombus that's
  // exactly the center half of both width and height, by construction - no
  // wrap outcome can push a line outside a diamond's own left/right edge from
  // inside that box. Hexagon/parallelogram taper far less (flat top/bottom,
  // or only one pair of slanted sides), so a smaller width-only inset already
  // keeps them safe without shrinking their usable text area unnecessarily.
  const isDiamond = shapeKind === "diamond";
  const shapeSafeInsetX = shapeKind === "hexagon" ? "14%" : shapeKind === "parallelogram" ? "12%" : undefined;
  const divBorderWidth = isUnderline ? "0px" : isTextOnly || polygonPoints || hasCustomSvgShape ? "0px" : borderWidth;
  const divBorderColor = isUnderline || isTextOnly || polygonPoints || hasCustomSvgShape ? "transparent" : borderColor === "none" ? "transparent" : borderColor;
  const divBorderStyle = isUnderline || isTextOnly || polygonPoints || hasCustomSvgShape ? "none" : borderStyle;

  // A block can only be edited while selected — deselecting elsewhere on the
  // canvas must fall back to the formatted read-only preview.
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);
  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditingBlockId(block.id);
  }, [block.id, setEditingBlockId]);
  const stopEditing = useCallback(() => {
    setIsEditing(false);
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);
  useEffect(() => {
    if (!isSelected && isEditing) {
      stopEditing();
    }
  }, [isSelected, isEditing, stopEditing]);

  // A freshly created block auto-enters edit mode once, mirroring the old
  // app's startEditing(newId) after every node-creation action — otherwise
  // a block placed via the toolbar or Tab/Enter quick-add sits selected but
  // not typeable until the user double-clicks it themselves.
  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  useEffect(() => {
    if (pendingEditBlockId === block.id) {
      startEditing();
      setPendingEditBlockId(null);
    }
  }, [pendingEditBlockId, block.id, setPendingEditBlockId, startEditing]);

  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const selectionGeneration = ++selectionRestoreGenerationRef.current;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const shortcut = ({ b: "bold", i: "italic", u: "underline", s: "strikethrough" } as Record<string, InlineShortcut>)[e.key.toLowerCase()];
      const result = shortcut ? toggleInlineMarkdown(markdown, shortcut, e.currentTarget.selectionStart, e.currentTarget.selectionEnd) : null;
      if (result) {
        e.preventDefault();
        onChange({ markdown: result.value });
        requestAnimationFrame(() => {
          if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(result.start, result.end);
        });
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const lineEndIndex = markdown.indexOf("\n", end);
      const lineEnd = lineEndIndex === -1 ? markdown.length : lineEndIndex;
      const selectedLines = markdown.slice(start, end).includes("\n");
      const shouldIndentLine = selectedLines || LIST_LINE_PATTERN.test(markdown.slice(lineStart, lineEnd));
      if (shouldIndentLine) {
        const result = indentMarkdownSelection(markdown, start, end, e.shiftKey);
        onChange({ markdown: result.value });
        requestAnimationFrame(() => {
          if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(result.start, result.end);
        });
      } else if (!e.shiftKey) {
        const nextValue = `${markdown.slice(0, start)}\t${markdown.slice(end)}`;
        onChange({ markdown: nextValue });
        requestAnimationFrame(() => {
          if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(start + 1, start + 1);
        });
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const input = e.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const next = continueMarkdownList(markdown, start, end);
      onChange({ markdown: next.value });
      requestAnimationFrame(() => {
        if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(next.start, next.end);
      });
    } else if (e.key === "Backspace") {
      const input = e.currentTarget;
      const result = deleteEmptyMarkdownNumberedLine(markdown, input.selectionStart, input.selectionEnd);
      if (!result) return;
      e.preventDefault();
      onChange({ markdown: result.value });
      requestAnimationFrame(() => {
        if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.start, result.end);
      });
    } else if (e.key === "Escape") {
      e.preventDefault();
      stopEditing();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart, selectionEnd } = e.currentTarget;
    const restoreGeneration = ++selectionRestoreGenerationRef.current;
    onChange({ markdown: value });
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (selectionRestoreGenerationRef.current !== restoreGeneration) return;
      if (!textarea || document.activeElement !== textarea) return;
      // A user selection made after the input event must win over this stale
      // caret restore; otherwise Ctrl/Cmd+B can lose the selected range.
      if (textarea.selectionStart !== selectionStart || textarea.selectionEnd !== selectionEnd) return;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  return (
    <>
      {polygonPoints && (
        <svg
          // Keep the full stroke visible when a polygon touches y=0/y=100.
          viewBox="-1 -1 102 102"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <polygon
            points={polygonPoints}
            fill="none"
            stroke={borderColor === "none" ? "transparent" : borderColor}
            strokeWidth={borderWidthPx}
            strokeDasharray={polygonDasharray}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {hasCustomSvgShape && (
        <svg
          // These outlines touch the block bounds. Expand the viewport so a
          // centered stroke is not clipped at the top, bottom, or corners.
          viewBox="-1 -1 102 102"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
        >
          {(shapeKind === "speech_bubble" || shapeKind === "callout") && (
            <path d="M10 0H90Q100 0 100 10V70Q100 80 90 80H35L15 100V80H10Q0 80 0 70V10Q0 0 10 0Z" fill={backgroundColor} stroke={borderColor === "none" ? "transparent" : borderColor} strokeWidth={borderWidthPx} strokeDasharray={polygonDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          {shapeKind === "cylinder" && (
            <>
              <path d="M 0,15 L 0,85 A 50,15 0 0 0 100,85 L 100,15" fill={backgroundColor} stroke={borderColor === "none" ? "transparent" : borderColor} strokeWidth={borderWidthPx} strokeDasharray={polygonDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <ellipse cx={50} cy={15} rx={50} ry={15} fill={backgroundColor} stroke={borderColor === "none" ? "transparent" : borderColor} strokeWidth={borderWidthPx} strokeDasharray={polygonDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
          {(shapeKind === "cloud" || shapeKind === "cloud_rect") && (
            <path d={generateCloudRectPath(100, 100, 2)} fill={backgroundColor} stroke={borderColor === "none" ? "transparent" : borderColor} strokeWidth={borderWidthPx} strokeDasharray={polygonDasharray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          ...(shapeSafeInsetX
            ? {
                paddingTop: `${padding}px`,
                paddingRight: `calc(${padding}px + ${shapeSafeInsetX})`,
                paddingBottom: `${padding}px`,
                paddingLeft: `calc(${padding}px + ${shapeSafeInsetX})`,
              }
            : {
                paddingTop: `${padding}px`,
                paddingRight: `${padding}px`,
                paddingBottom: `${padding}px`,
                paddingLeft: `${padding}px`,
              }),
          backgroundColor: isTextOnly || isUnderline || polygonPoints || hasCustomSvgShape ? "transparent" : backgroundColor,
          borderRadius: shapeRadius,
          borderTopWidth: divBorderWidth,
          borderRightWidth: divBorderWidth,
          borderBottomWidth: isUnderline ? borderWidth : divBorderWidth,
          borderLeftWidth: divBorderWidth,
          borderTopStyle: divBorderStyle,
          borderRightStyle: divBorderStyle,
          borderBottomStyle: isUnderline ? borderStyle : divBorderStyle,
          borderLeftStyle: divBorderStyle,
          borderTopColor: divBorderColor,
          borderRightColor: divBorderColor,
          borderBottomColor: isUnderline ? divBorderColor : divBorderColor,
          borderLeftColor: divBorderColor,
          clipPath: shapeClipPath,
          boxShadow: isSelected
            ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
            : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          justifyContent: verticalAlign === "top" ? "flex-start" : verticalAlign === "bottom" ? "flex-end" : "center",
          overflow: "hidden",
          textAlign: align,
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={markdown}
            placeholder="Type text here..."
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onBlur={stopEditing}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: isDiamond ? "50%" : "100%",
              // Grow with the text so editing keeps the same centred position
              // as the preview; browsers without field-sizing fall back to a
              // short fixed-height box.
              height: "auto",
              maxHeight: "100%",
              position: "relative",
              zIndex: 1,
              ...({ fieldSizing: "content" } as React.CSSProperties),
              ...(isDiamond ? { alignSelf: "center" } : {}),
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: `${fontSize}px`,
              fontWeight,
              fontStyle,
              textDecoration,
              lineHeight: "1.5",
              color: textColor,
              boxSizing: "border-box",
              padding: 0,
              textAlign: align,
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            // A block's outer frame calls setPointerCapture on every
            // pointerdown for drag-tracking (useBlockDrag.ts); once the
            // pointer is captured there, the browser's native `dblclick`
            // synthesis for the second click doesn't reliably reach this
            // nested handler. `click`'s `detail` count (native double-click
            // tracking independent of capture) is the reliable signal.
            onClick={(e) => {
              if (e.detail < 2) return;
              e.stopPropagation();
              startEditing();
            }}
            style={{
              width: isDiamond ? "50%" : "100%",
              // A diamond's clip-path only clears its full width exactly at
              // the block's vertical center. height:"100%" here fills the
              // whole padded box top-to-bottom, leaving the parent's
              // justifyContent:center nothing shorter to center - this div's
              // own (top-starting) text then sits in the heavily tapered
              // band near the point, clipped even at 50% width. Auto height
              // keeps this box exactly as tall as its text, so the parent
              // centers it into the one place a diamond stays wide enough at
              // any width fraction: dead center.
              // Auto height (capped at the box) lets the parent's
              // justifyContent apply for every shape, so text is centred
              // (or top/bottom aligned) instead of always hugging the top.
              height: "auto",
              maxHeight: "100%",
              // Positioned so the text paints above the absolutely positioned
              // SVG outline of cloud, speech bubble and cylinder shapes.
              position: "relative",
              zIndex: 1,
              ...(isDiamond ? { alignSelf: "center" } : {}),
              overflow: "hidden",
              fontFamily: "inherit",
              fontSize: `${fontSize}px`,
              fontWeight,
              fontStyle,
              textDecoration,
              lineHeight: "1.5",
              color: markdown ? textColor : "#94a3b8",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              cursor: isSelected ? "text" : "inherit",
              textAlign: align,
            }}
          >
            {markdown ? renderMarkdownPreview(markdown) : "Type text here..."}
          </div>
        )}
      </div>
    </>
  );
};

registerBlockRenderer("text", TextBlock);
