"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { findMapRootId } from "../layout/mapRoot";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { renderMarkdownPreview } from "../utils/markdownPreview";
import { continueMarkdownList, deleteEmptyMarkdownNumberedLine, toggleInlineMarkdown, type InlineShortcut } from "../utils/inlineMarkdownEditing";

export interface BlockDescriptionProps {
  block: CanvasBlock;
  isSelected?: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}

export const BlockDescription: React.FC<BlockDescriptionProps> = ({
  block,
  isSelected = false,
  isEditing,
  onStartEdit,
  onStopEdit,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRestoreGenerationRef = useRef(0);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const [draft, setDraft] = useState(block.description ?? "");
  const draftRef = useRef(block.description ?? "");

  const reflowDescriptionLayout = () => {
    const rootId = findMapRootId(useWorkspaceStore.getState().blocks, block.id);
    if (rootId) reflowWorkspaceTree(rootId);
  };

  useEffect(() => {
    if (isEditing) {
      const nextDraft = block.description ?? "";
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  // Do not depend on block.description here: local typing updates the store on
  // every keystroke, and resetting the caret then destroys an active selection
  // before shortcuts such as Ctrl+B can wrap it.
  // Keep the initial edit draft stable while typing; depending on description
  // resets selection and moves the caret after each store update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, block.id]);

  useEffect(() => {
    if (!isSelected && isEditing) {
      onStopEdit();
    }
  }, [isSelected, isEditing, onStopEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    draftRef.current = value;
    setDraft(value);
    updateBlock(block.id, { description: value });
    reflowDescriptionLayout();
  };

  const applyDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value);
    updateBlock(block.id, { description: value });
    // The description is painted below the block frame, so its occupied
    // layout footprint is larger than the block's transform. Reflow right
    // after the first content update; otherwise a newly-added description
    // stays on top of the next sibling until some unrelated tree operation
    // happens to arrange the map.
    reflowDescriptionLayout();
  };

  const handleBlur = () => {
    if (!draftRef.current.trim()) {
      updateBlock(block.id, { description: undefined });
      reflowDescriptionLayout();
    }
    onStopEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const selectionGeneration = ++selectionRestoreGenerationRef.current;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const shortcut = ({ b: "bold", i: "italic", u: "underline", s: "strikethrough" } as Record<string, InlineShortcut>)[e.key.toLowerCase()];
      const result = shortcut ? toggleInlineMarkdown(draftRef.current, shortcut, e.currentTarget.selectionStart, e.currentTarget.selectionEnd) : null;
      if (result) {
        e.preventDefault();
        applyDraft(result.value);
        requestAnimationFrame(() => {
          if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(result.start, result.end);
        });
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const result = continueMarkdownList(draftRef.current, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
      applyDraft(result.value);
      requestAnimationFrame(() => {
        if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.start, result.end);
      });
      return;
    }
    if (e.key === "Backspace") {
      const result = deleteEmptyMarkdownNumberedLine(draftRef.current, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
      if (!result) return;
      e.preventDefault();
      applyDraft(result.value);
      requestAnimationFrame(() => {
        if (selectionRestoreGenerationRef.current !== selectionGeneration) return;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(result.start, result.end);
      });
      return;
    }
    if (e.key === "Escape") {
      onStopEdit();
    }
  };

  const descriptionText = block.description ?? "";

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          placeholder="Add description..."
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            minHeight: "42px",
            maxHeight: "120px",
            resize: "vertical",
            boxSizing: "border-box",
            padding: "4px 6px",
            fontSize: "11px",
            lineHeight: "1.4",
            fontFamily: "inherit",
            borderRadius: "4px",
            border: "1px solid #93c5fd",
            borderLeft: "3px solid #2563eb",
            backgroundColor: "#ffffff",
            color: "#334155",
            outline: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Double-click to edit description"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "3px 6px",
            fontSize: "11px",
            lineHeight: "1.4",
            fontFamily: "inherit",
            borderRadius: "4px",
            borderLeft: "2px solid #94a3b8",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(4px)",
            color: "#64748b",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: isSelected ? "text" : "inherit",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          {descriptionText ? (
            renderMarkdownPreview(descriptionText)
          ) : (
            <span style={{ opacity: 0.6 }}>Add description...</span>
          )}
        </div>
      )}
    </div>
  );
};

export default BlockDescription;
