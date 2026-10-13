import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isTableBlock, resolveTransform, type CanvasBlock } from "../types/block";
import {
  attachmentTransform,
  findTableAttachment,
  tableCellKey,
  tableCellRect,
  TABLE_CELL_ATTACHMENT_INSET,
} from "../utils/tableAttachments";
import { DEFAULT_DRAG_TRANSFORM, DRAG_ACTIVATION_THRESHOLD } from "./blockDragTypes";

interface TableCellTarget {
  tableId: string;
  row: number;
  col: number;
  element: HTMLElement;
}

function cellTargetAt(clientX: number, clientY: number): TableCellTarget | null {
  if (typeof document === "undefined") return null;
  const element = (typeof document.elementsFromPoint === "function" ? document
    .elementsFromPoint(clientX, clientY)
    .map((candidate) => candidate.closest<HTMLElement>("[data-workspace-table-cell]"))
    .find((candidate): candidate is HTMLElement => Boolean(candidate)) : null)
    ?? Array.from(document.querySelectorAll<HTMLElement>("[data-workspace-table-cell]"))
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      });
  if (!element) return null;
  const tableId = element.dataset.workspaceTableId;
  const row = Number(element.dataset.workspaceTableRow);
  const col = Number(element.dataset.workspaceTableCol);
  if (!tableId || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  const table = useWorkspaceStore.getState().blocks[tableId] as CanvasBlock<"table"> | undefined;
  if (table?.data?.disableCellAttachment) return null;
  return { tableId, row, col, element };
}

function clearCellPreview(ref: React.MutableRefObject<HTMLElement | null>): void {
  if (!ref.current) return;
  ref.current.style.outline = "";
  ref.current.style.boxShadow = "";
  ref.current = null;
}

function setCellPreview(ref: React.MutableRefObject<HTMLElement | null>, element: HTMLElement): void {
  if (ref.current === element) return;
  clearCellPreview(ref);
  ref.current = element;
  element.style.outline = "2px dashed rgb(249 115 22)";
  element.style.boxShadow = "inset 0 0 0 2px rgb(249 115 22 / 0.18)";
}

export function useTableAttachmentDrag(blockId: string) {
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const state = useWorkspaceStore.getState();
    const attachment = findTableAttachment(state.blocks, blockId);
    if (attachment) {
      const projected = attachmentTransform(
        attachment.table,
        attachment.attachment,
        attachment.row,
        attachment.col,
      );
      if (projected) updateBlockTransform(blockId, projected, "override");
    }
    startRef.current = { x: event.clientX, y: event.clientY };
  }, [blockId, updateBlockTransform]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_ACTIVATION_THRESHOLD) return;
    const target = cellTargetAt(event.clientX, event.clientY);
    if (target?.tableId === blockId) {
      clearCellPreview(previewRef);
      return;
    }
    if (target) setCellPreview(previewRef, target.element);
    else clearCellPreview(previewRef);
  }, [blockId]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    startRef.current = null;
    clearCellPreview(previewRef);
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_ACTIVATION_THRESHOLD) return;

    const target = cellTargetAt(event.clientX, event.clientY);
    const state = useWorkspaceStore.getState();
    const dragged = state.blocks[blockId];
    if (!target || target.tableId === blockId || !dragged || state.isReadOnly) {
      if (findTableAttachment(state.blocks, blockId)) removeFromTables(blockId);
      return;
    }
    const table = state.blocks[target.tableId];
    if (!table || !isTableBlock(table)) return;
    const cell = tableCellRect(table, target.row, target.col);
    if (!cell) return;
    const transform = resolveTransform(dragged.transform, DEFAULT_DRAG_TRANSFORM);
    const width = Math.min(transform.w, Math.max(1, cell.width - TABLE_CELL_ATTACHMENT_INSET * 2));
    const height = Math.min(transform.h, Math.max(1, cell.height - TABLE_CELL_ATTACHMENT_INSET * 2));
    const attachment = {
      blockId,
      x: Math.max(TABLE_CELL_ATTACHMENT_INSET, Math.min(cell.width - width - TABLE_CELL_ATTACHMENT_INSET, transform.x - cell.x)),
      y: Math.max(TABLE_CELL_ATTACHMENT_INSET, Math.min(cell.height - height - TABLE_CELL_ATTACHMENT_INSET, transform.y - cell.y)),
      width,
      height,
    };

    useWorkspaceStore.setState((current) => {
      if (current.isReadOnly) return current;
      const blocks = { ...current.blocks };
      for (const candidate of Object.values(current.blocks)) {
        if (!isTableBlock(candidate) || !candidate.data?.cellItems) continue;
        const cellItems = Object.fromEntries(
          Object.entries(candidate.data.cellItems)
            .map(([key, items]) => [key, items.filter((item) => item.blockId !== blockId)])
            .filter(([, items]) => items.length > 0),
        );
        blocks[candidate.id] = { ...candidate, data: { ...candidate.data, cellItems } };
      }
      const owner = blocks[target.tableId];
      if (!owner || !isTableBlock(owner)) return { ...current, blocks };
      const key = tableCellKey(target.row, target.col);
      const cellItems = { ...(owner.data?.cellItems ?? {}), [key]: [attachment] };
      blocks[owner.id] = { ...owner, data: { ...owner.data, cellItems } };
      return { ...current, blocks };
    });
  }, [blockId]);

  useEffect(() => () => clearCellPreview(previewRef), []);

  return { onPointerDown, onPointerMove, onPointerUp };
}

function removeFromTables(blockId: string): void {
  useWorkspaceStore.setState((current) => {
    const blocks = { ...current.blocks };
    for (const candidate of Object.values(current.blocks)) {
      if (!isTableBlock(candidate) || !candidate.data?.cellItems) continue;
      const cellItems = Object.fromEntries(
        Object.entries(candidate.data.cellItems)
          .map(([key, items]) => [key, items.filter((item) => item.blockId !== blockId)])
          .filter(([, items]) => items.length > 0),
      );
      blocks[candidate.id] = { ...candidate, data: { ...candidate.data, cellItems } };
    }
    return { ...current, blocks };
  });
}
