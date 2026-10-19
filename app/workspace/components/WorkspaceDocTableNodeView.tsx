"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import type { TableBlockPayload } from "../types/table";
import { TableBlock } from "../renderers/TableBlock";
import { WorkspaceTableSelectionToolbar } from "./WorkspaceTableSelectionToolbar";
import { WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, type TableCellEditorCommand } from "./table/TableCellEditorToolbar";

export function WorkspaceDocTableNodeView({ node, deleteNode, extension }: NodeViewProps) {
  const tableId = String(node.attrs.tableId ?? "");
  const table = useWorkspaceStore((state) => {
    const block = state.blocks[tableId];
    return block?.type === "table" ? block as CanvasBlock<"table"> : null;
  });
  const storeReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const isReadOnly = storeReadOnly || extension.options.readOnly === true;
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tableHostRef = useRef<HTMLDivElement>(null);
  const [toolbarPosition, setToolbarPosition] = useState({ left: 16, top: 80 });
  const tableSelected = selectedBlockIds.includes(tableId);

  const handleChange = useCallback((patch: Partial<TableBlockPayload>) => {
    if (!table || isReadOnly) return;
    updateBlock(tableId, { data: { ...table.data, ...patch } });
  }, [isReadOnly, table, tableId, updateBlock]);

  const moveToCanvas = useCallback(() => {
    if (!table || isReadOnly) return;
    deleteNode();
    updateBlock(tableId, { embeddedInDocId: undefined });
  }, [deleteNode, isReadOnly, table, tableId, updateBlock]);

  const selectEmbeddedTable = useCallback(() => {
    setSelection([tableId]);
  }, [setSelection, tableId]);

  const stopAndSelectEmbeddedTable = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    selectEmbeddedTable();
  }, [selectEmbeddedTable]);

  const onCellCommand = useCallback((command: TableCellEditorCommand) => {
    if (isReadOnly) return;
    window.dispatchEvent(new CustomEvent(WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, { detail: command }));
  }, [isReadOnly]);

  useEffect(() => {
    if (!tableSelected) return;
    const updateToolbarPosition = () => {
      const rect = tableHostRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPosition({ left: Math.max(8, rect.left), top: Math.max(76, rect.top - 52) });
    };
    updateToolbarPosition();
    window.addEventListener("resize", updateToolbarPosition);
    document.addEventListener("scroll", updateToolbarPosition, true);
    return () => {
      window.removeEventListener("resize", updateToolbarPosition);
      document.removeEventListener("scroll", updateToolbarPosition, true);
    };
  }, [tableSelected]);

  if (!table) {
    return <NodeViewWrapper className="workspace-doc-table-embed workspace-doc-table-missing" contentEditable={false}>Table unavailable</NodeViewWrapper>;
  }

  return (
    <NodeViewWrapper className="workspace-doc-table-embed" contentEditable={false} data-workspace-doc-table-id={tableId}>
      {tableSelected && !isReadOnly && typeof document !== "undefined" && createPortal(
        <WorkspaceTableSelectionToolbar
          block={table}
          toolbarRef={toolbarRef}
          style={toolbarPosition}
          position="fixed"
          onCellCommand={onCellCommand}
          onMoveToCanvas={moveToCanvas}
        />, document.body,
      )}
      <div ref={tableHostRef} className="workspace-doc-table-shell" onPointerDown={stopAndSelectEmbeddedTable}>
        <div className="workspace-doc-table-scroll">
          <TableBlock block={table} isSelected={tableSelected} readOnly={isReadOnly} isEmbedded onSelectEmbedded={selectEmbeddedTable} onChange={handleChange} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
