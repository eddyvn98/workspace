"use client";

import React, { useCallback, useEffect, useState } from "react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { WorkspaceDocRichEditor } from "./WorkspaceDocRichEditor";
import { createEmbeddedWorkspaceTable, insertWorkspaceTableReference } from "../utils/workspaceDocTableEmbedding";
import type { WorkspaceDocTableEmbedHandler, WorkspaceDocTableInsertHandler } from "../utils/workspaceDocEditorHelpers";

/** A page-style document block — see WorkspaceDocRichEditor.tsx for why this
 *  isn't the same editor a shape's label uses. Edit lifecycle mirrors
 *  ShapeBlock.tsx/TextBlock.tsx: `pendingEditBlockId` auto-enters edit mode
 *  once right after creation, and deselecting the block exits it. */
export const DocBlock: React.FC<BlockRendererProps<"doc">> = ({ block, isSelected, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const pendingEditBlockId = useWorkspaceStore((state) => state.pendingEditBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const setEditingBlockId = useWorkspaceStore((state) => state.setEditingBlockId);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const html = block.data?.html ?? "";

  const onInsertTable = useCallback<WorkspaceDocTableInsertHandler>((mode, editor, range) => {
    if (isReadOnly) return;
    const table = createEmbeddedWorkspaceTable(block.id, mode);
    addBlock(table);
    insertWorkspaceTableReference(editor, range, table.id);
  }, [addBlock, block.id, isReadOnly]);

  const onEmbedTable = useCallback<WorkspaceDocTableEmbedHandler>((tableId, editor, range) => {
    if (isReadOnly) return;
    const candidate = useWorkspaceStore.getState().blocks[tableId];
    if (!candidate || candidate.type !== "table" || candidate.embeddedInDocId) return;
    updateBlock(tableId, { embeddedInDocId: block.id });
    insertWorkspaceTableReference(editor, range, tableId);
  }, [block.id, isReadOnly, updateBlock]);

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
  }, [pendingEditBlockId, block.id, setPendingEditBlockId, startEditing]);
  useEffect(() => {
    if (!isSelected && isEditing) stopEditing();
  }, [isSelected, isEditing, stopEditing]);
  useEffect(() => () => {
    if (useWorkspaceStore.getState().editingBlockId === block.id) setEditingBlockId(null);
  }, [block.id, setEditingBlockId]);

  return (
    <div
      onClick={(e) => {
        if (e.detail < 2 || isEditing) return;
        e.stopPropagation();
        startEditing();
      }}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
        boxShadow: isSelected
          ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
          : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        cursor: isSelected && !isEditing ? "text" : "default",
      }}
    >
      <WorkspaceDocRichEditor blockId={block.id} html={html} isEditing={isEditing} onChange={(next) => onChange({ html: next })} onStopEditing={stopEditing} onInsertTable={onInsertTable} onEmbedTable={onEmbedTable} />
    </div>
  );
};

registerBlockRenderer("doc", DocBlock);
