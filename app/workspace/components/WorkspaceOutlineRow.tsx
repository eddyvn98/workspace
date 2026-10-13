"use client";

import React from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { BlockId, CanvasBlock } from "../types/block";
import { moveWorkspaceOutlineBlock, type OutlineDropPosition } from "../utils/workspaceOutlineDrag";
import { formatOutlineText } from "../utils/workspaceOutlineText";

let draggedOutlineBlockId: BlockId | null = null;

export interface WorkspaceOutlineRowProps {
  blockId: BlockId;
  depth: number;
  blocks: Record<BlockId, CanvasBlock>;
  childrenByParent: Map<BlockId, BlockId[]>;
  collapsedIds: Set<BlockId>;
  selectedBlockIds: BlockId[];
  searchQuery?: string;
  onToggleCollapse: (blockId: BlockId) => void;
  onSelect: (blockId: BlockId) => void;
  onAddChild: (blockId: BlockId) => void;
  onDeleteSubtree: (blockId: BlockId) => void;
  onRenameText: (blockId: BlockId, text: string) => void;
}

export function WorkspaceOutlineRow({
  blockId,
  depth,
  blocks,
  childrenByParent,
  collapsedIds,
  selectedBlockIds,
  searchQuery = "",
  onToggleCollapse,
  onSelect,
  onAddChild,
  onDeleteSubtree,
  onRenameText,
}: WorkspaceOutlineRowProps) {
  const block = blocks[blockId];
  const [dropPosition, setDropPosition] = useState<OutlineDropPosition | null>(null);
  if (!block) return null;

  const rawChildren = childrenByParent.get(blockId) ?? [];
  const children = rawChildren.filter((id) => Boolean(blocks[id]));
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(blockId);
  const isSelected = selectedBlockIds.includes(blockId);

  const blockData = block.data as { markdown?: string; label?: string; title?: string } | undefined;
  const textValue =
    block.type === "text"
      ? formatOutlineText(typeof blockData?.markdown === "string" ? blockData.markdown : "")
      : block.type === "shape"
      ? formatOutlineText(typeof blockData?.label === "string" ? blockData.label : "")
      : formatOutlineText(typeof blockData?.title === "string" ? blockData.title : "");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Tab") {
      e.preventDefault();
      onAddChild(blockId);
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  const isMatchedBySearch =
    searchQuery.trim().length > 0 && textValue.toLowerCase().includes(searchQuery.toLowerCase().trim());

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (!block.parentId) return;
    draggedOutlineBlockId = blockId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", blockId);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedOutlineBlockId || draggedOutlineBlockId === blockId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
    setDropPosition(ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside");
  };

  const clearDragState = () => {
    if (draggedOutlineBlockId === blockId) draggedOutlineBlockId = null;
    setDropPosition(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedId = draggedOutlineBlockId;
    const position = dropPosition;
    draggedOutlineBlockId = null;
    setDropPosition(null);
    if (draggedId && position) moveWorkspaceOutlineBlock(draggedId, blockId, position);
  };

  return (
    <div className="flex flex-col select-none">
      <div
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        draggable={Boolean(block.parentId)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropPosition(null)}
        onDragEnd={clearDragState}
        onDrop={handleDrop}
        onClick={() => onSelect(blockId)}
        onPointerDown={(e) => e.stopPropagation()}
        className={`group flex items-center gap-1 rounded-md border-t-2 border-b-2 border-transparent py-0.5 pr-1 transition-colors cursor-pointer ${
          dropPosition === "inside"
            ? "bg-orange-100 dark:bg-orange-950/40"
            : isSelected
            ? "bg-orange-100/90 text-orange-950 font-medium dark:bg-orange-950/50 dark:text-orange-200"
            : isMatchedBySearch
            ? "bg-amber-50 text-slate-900 dark:bg-amber-950/40 dark:text-slate-100"
            : "hover:bg-slate-100/80 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300"
        } ${dropPosition === "before" ? "border-t-2 border-orange-400" : ""} ${dropPosition === "after" ? "border-b-2 border-orange-400" : ""}`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(blockId);
            }}
            title={isCollapsed ? "Expand branch" : "Collapse branch"}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0 flex items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </span>
        )}

        <input
          type="text"
          value={textValue}
          onChange={(e) => onRenameText(blockId, e.target.value)}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(blockId);
          }}
          onFocus={() => onSelect(blockId)}
          onKeyDown={handleKeyDown}
          placeholder={block.type === "text" ? "Empty topic" : `(${block.type})`}
          className="min-w-0 flex-1 rounded bg-transparent px-0.5 py-0.5 text-[11.5px] leading-snug text-slate-600 outline-none transition focus:bg-slate-200/80 focus:text-slate-950 dark:text-slate-300 dark:focus:bg-slate-700/80 dark:focus:text-white"
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(blockId);
          }}
          title="Add child branch"
          className="shrink-0 rounded p-0.5 text-slate-400 opacity-100 transition-all hover:bg-transparent hover:text-orange-500 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSubtree(blockId);
          }}
          title="Delete branch"
          className="shrink-0 rounded p-0.5 text-slate-400 opacity-100 transition-all hover:bg-transparent hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {!isCollapsed && hasChildren && (
        <div className="flex flex-col">
          {children.map((childId) => (
            <WorkspaceOutlineRow
              key={childId}
              blockId={childId}
              depth={depth + 1}
              blocks={blocks}
              childrenByParent={childrenByParent}
              collapsedIds={collapsedIds}
              selectedBlockIds={selectedBlockIds}
              searchQuery={searchQuery}
              onToggleCollapse={onToggleCollapse}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onDeleteSubtree={onDeleteSubtree}
              onRenameText={onRenameText}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkspaceOutlineRow;
