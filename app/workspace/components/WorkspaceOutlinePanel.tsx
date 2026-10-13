"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useTreeAutoArrange } from "../hooks/useTreeAutoArrange";
import { buildTreeHierarchy, deleteSubtree } from "../utils/treeSubtree";
import { resolveTransform, type Transform } from "../types/block";
import { WorkspaceOutlineRow } from "./WorkspaceOutlineRow";
import type { BlockId } from "../types/block";
import { getWorkspaceViewportSize } from "../hooks/useWorkspaceViewportControls";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";

export interface WorkspaceOutlinePanelProps {
  onClose: () => void;
}

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export function WorkspaceOutlinePanel({ onClose }: WorkspaceOutlinePanelProps) {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const { addChildBlock } = useTreeAutoArrange();

  const [collapsedIds, setCollapsedIds] = useState<Set<BlockId>>(() => new Set());

  const { roots: treeRoots, childrenByParent, totalTreeNodesCount } = buildTreeHierarchy(blocks, blockOrder);

  // If no tree branches exist yet, show all top-level canvas blocks so user can build from them
  const roots = useMemo(() => {
    if (treeRoots.length > 0) return treeRoots;
    return blockOrder.filter((id) => blocks[id] && (!blocks[id].parentId || !blocks[blocks[id].parentId]));
  }, [treeRoots, blockOrder, blocks]);

  const totalCount = treeRoots.length > 0 ? totalTreeNodesCount : Object.keys(blocks).length;

  const handleToggleCollapse = useCallback((blockId: BlockId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const handleAddChild = useCallback(
    (blockId: BlockId) => {
      addChildBlock(blockId);
      setCollapsedIds((prev) => {
        if (!prev.has(blockId)) return prev;
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    },
    [addChildBlock]
  );

  const handleDeleteSubtree = useCallback((blockId: BlockId) => {
    deleteSubtree(blockId);
  }, []);

  const handleRenameText = useCallback(
    (blockId: BlockId, text: string) => {
      const existing = blocks[blockId];
      if (!existing) return;
      if (existing.type === "text") {
        updateBlock(blockId, {
          data: { ...(existing.data as { markdown: string }), markdown: text },
        });
      } else if (existing.type === "link") {
        updateBlock(blockId, {
          data: { ...(existing.data as { url: string; title?: string }), title: text },
        });
      }
    },
    [blocks, updateBlock]
  );

  const handleSelect = useCallback(
    (blockId: BlockId) => {
      setSelection([blockId]);
      const target = useWorkspaceStore.getState().blocks[blockId];
      if (target && typeof window !== "undefined") {
        const tf = resolveTransform(target.transform, DEFAULT_TRANSFORM);
        const { camera } = useWorkspaceStore.getState();
        const { width: vw, height: vh } = getWorkspaceViewportSize();
        const targetScreenX = vw / 2;
        const targetScreenY = vh / 2;
        const blockCenterX = tf.x + tf.w / 2;
        const blockCenterY = tf.y + tf.h / 2;
        const newCamX = targetScreenX - blockCenterX * camera.zoom;
        const newCamY = targetScreenY - blockCenterY * camera.zoom;
        setCamera({ x: newCamX, y: newCamY });
      }
    },
    [setSelection, setCamera]
  );

  // Global Escape key listener to close outline panel
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      {...workspaceKeyboardScope("outline")}
      className="flex h-full min-h-0 min-w-0 flex-col px-2 pt-1 pb-2 pr-3"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClose}
        className="mb-3 flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium leading-5 text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to list</span>
      </button>
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-slate-100 px-2 pb-2 dark:border-slate-800">
        <span className="text-[11px] font-semibold leading-5 uppercase tracking-wide text-slate-400 dark:text-slate-500">Outline</span>
        <span className="text-[10px] leading-5 text-slate-400 dark:text-slate-500">{totalCount} items</span>
      </div>
      {/* flex-1 + min-h-0 pins this region's own scrollbars (including the
          horizontal one) to the bottom of the panel — i.e. the bottom of the
          screen — instead of trailing right after the last row when the tree
          is short. */}
      <div aria-label="Mindmap outline tree" className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="w-max min-w-full pr-2">
          {roots.map((rootId, index) => (
            <div key={rootId} className={index > 0 ? "pt-1.5 border-t border-slate-100 dark:border-slate-800" : ""}>
              <WorkspaceOutlineRow
                blockId={rootId}
                depth={0}
                blocks={blocks}
                childrenByParent={childrenByParent}
                collapsedIds={collapsedIds}
                selectedBlockIds={selectedBlockIds}
                searchQuery=""
                onToggleCollapse={handleToggleCollapse}
                onSelect={handleSelect}
                onAddChild={handleAddChild}
                onDeleteSubtree={handleDeleteSubtree}
                onRenameText={handleRenameText}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WorkspaceOutlinePanel;
