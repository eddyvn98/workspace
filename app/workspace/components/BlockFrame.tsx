"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { resolveTransform, type CanvasBlock, type Transform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { blockRendererRegistry } from "../renderers/registry";
import { FallbackBlock } from "../renderers/FallbackBlock";
import { useBlockFrameGeometry, useBlockFrameAnchors } from "../hooks/useBlockFrameGeometry";
import { getBlockFrameStyle } from "../utils/blockFrameStyle";
import { useBlockDrag } from "../hooks/useBlockDrag";
import { useBlockResize } from "../hooks/useBlockResize";
import { useConnectorDrag } from "../hooks/useConnectorDrag";
import { useBlockRotate } from "../hooks/useBlockRotate";
import { useTableAttachmentDrag } from "../hooks/useTableAttachmentDrag";
import { setWorkspaceBlockDragging } from "../hooks/useWorkspaceDragStatus";
import { BlockFrameOverlays } from "./BlockFrameOverlays";
import { BlockContextMenu } from "./BlockContextMenu";
import { useShowCanvasComments } from "../hooks/useShowCanvasComments";
import "../renderers";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export interface BlockFrameProps {
  block: CanvasBlock;
  boardId?: string | null;
  isVersionPreview?: boolean;
  onPreviewVersion?: (version: CanvasBlock) => void;
  transformOverride?: Transform;
  isTableAttachment?: boolean;
  /**
   * Whether any other block has this block as its parent. Passed down from
   * WorkspacePage (computed once per blocks change) instead of each
   * BlockFrame scanning the entire blocks record itself, which was O(N) per
   * instance (O(N^2) for the whole canvas) on every store update.
   */
  hasChildren?: boolean;
}

const BlockFrameComponent: React.FC<BlockFrameProps> = ({ block, boardId, isVersionPreview = false, onPreviewVersion, transformOverride, isTableAttachment = false, hasChildren = false }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const effectiveReadOnly = isReadOnly || isVersionPreview;
  const isCommentMode = useWorkspaceStore((state) => state.isCommentMode);
  const { showCanvasComments } = useShowCanvasComments();
  const setActiveCommentBlockId = useWorkspaceStore((state) => state.setActiveCommentBlockId);
  const activeConnectorTool = useWorkspaceStore((state) => state.activeConnectorTool);
  const isConnectorEndpoint = useWorkspaceStore((state) => {
    const connector = state.selectedConnectorId ? state.connectors[state.selectedConnectorId] : null;
    return Boolean(connector && (connector.fromBlockId === block.id || connector.toBlockId === block.id));
  });
  const connectorFocusActive = useWorkspaceStore((state) => Boolean(state.selectedConnectorId && state.connectors[state.selectedConnectorId]));
  const isQuickAddHandoff = useWorkspaceStore((state) => state.quickAddHandoff?.blockId === block.id);
  const pendingDescriptionBlockId = useWorkspaceStore((state) => state.pendingDescriptionBlockId);
  const setPendingDescriptionBlockId = useWorkspaceStore((state) => state.setPendingDescriptionBlockId);
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const editingBlockId = useWorkspaceStore((state) => state.editingBlockId);

  const isSelected = selectedBlockIds.includes(block.id);
  const isEditingContent = editingBlockId === block.id;
  const { startResize, onPointerMove: onResizeMove, onPointerUp: onResizeUp, onPointerCancel: onResizeCancel, resizeGuide, resizePreview } = useBlockResize(block.id);
  const transform = resizePreview ?? transformOverride ?? resolveTransform(block.transform, DEFAULT_TRANSFORM);
  const isLocked = Boolean(block.style?.isLocked);
  const visualTransform = [
    transform.rotation ? `rotate(${transform.rotation}deg)` : "",
    block.style?.flipH ? "scaleX(-1)" : "",
    block.style?.flipV ? "scaleY(-1)" : "",
  ].filter(Boolean).join(" ") || undefined;

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [isPulsing, setIsPulsing] = useState(() => {
    return typeof block.createdAt === "number" && Date.now() - block.createdAt < 2000;
  });

  useEffect(() => {
    if (pendingDescriptionBlockId !== block.id) return;
    setIsEditingDescription(true);
    setPendingDescriptionBlockId(null);
  }, [block.id, pendingDescriptionBlockId, setPendingDescriptionBlockId]);

  useEffect(() => {
    if (!isPulsing) return;
    const timer = setTimeout(() => {
      setIsPulsing(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [isPulsing]);

  const { onPointerDown, onPointerMove, onPointerUp } = useBlockDrag(block.id, transform);
  const tableAttachmentDrag = useTableAttachmentDrag(block.id);
  const { startConnectorDrag } = useConnectorDrag(block.id);
  const { onRotateHandlePointerDown } = useBlockRotate(block.id);

  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (effectiveReadOnly || isLocked) return;
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, [effectiveReadOnly, isLocked]);

  const handleRootPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isVersionPreview) {
        e.stopPropagation();
        return;
      }
      if (isLocked) {
        e.stopPropagation();
        return;
      }
      if (isCommentMode) {
        e.stopPropagation();
        setActiveCommentBlockId(block.id);
        return;
      }
      if (activeConnectorTool !== null) {
        startConnectorDrag(e);
        return;
      }
      setWorkspaceBlockDragging(true);
      tableAttachmentDrag.onPointerDown(e);
      onPointerDown(e);
    },
    [activeConnectorTool, block.id, isCommentMode, isLocked, isVersionPreview, onPointerDown, setActiveCommentBlockId, startConnectorDrag, tableAttachmentDrag]
  );

  const handleChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (effectiveReadOnly || isLocked) return;
      updateBlock(block.id, { data: { ...block.data, ...patch } });
    },
    [block.data, block.id, effectiveReadOnly, isLocked, updateBlock]
  );

  useBlockFrameAnchors(block.id, rootRef, transform);

  const Renderer = blockRendererRegistry[block.type] ?? FallbackBlock;
  const isPathBlock = block.type === "path";
  const isShapeBlock = block.type === "shape";
  const isTableBlock = block.type === "table";
  const isDocBlock = block.type === "doc";
  const isSlideDeckBlock = block.type === "slideDeck";
  const isImageFlowNode = block.type === "imageFlow";
  const canRotate = isShapeBlock || isPathBlock || Boolean(block.isFloating);

  const { handleAutoFitHeight, handleAutoFitWidth } = useBlockFrameGeometry(
    block.id, rootRef, transform, isSlideDeckBlock, isLocked, effectiveReadOnly,
  );

  return (
    <>
      <div
        ref={rootRef}
        data-block-id={block.id}
        data-workspace-parent-id={block.parentId ?? undefined}
        data-workspace-selected={isSelected ? "true" : undefined}
        data-workspace-connector-endpoint={isConnectorEndpoint ? "true" : undefined}
        data-workspace-table-attached={isTableAttachment ? "true" : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onPointerDown={handleRootPointerDown}
        onPointerMove={(event) => {
          onPointerMove(event);
          tableAttachmentDrag.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          onPointerUp(event);
          tableAttachmentDrag.onPointerUp(event);
          setWorkspaceBlockDragging(false);
        }}
        onPointerCancel={() => setWorkspaceBlockDragging(false)}
        onLostPointerCapture={() => setWorkspaceBlockDragging(false)}
        onContextMenu={handleContextMenu}
        onDoubleClickCapture={(e) => {
          if (isLocked) {
            e.stopPropagation();
            return;
          }
          if (e.shiftKey && !effectiveReadOnly) {
            e.stopPropagation();
            setIsEditingDescription(true);
          }
        }}
        onClick={(e) => {
          // The renderer's own onDoubleClick (e.g. TextBlock's edit toggle)
          // can miss real double-clicks: useBlockDrag's onPointerDown calls
          // setPointerCapture on THIS outer div on every pointerdown, and
          // while captured, the browser targets the resulting `click` (and
          // `dblclick`) events at the capturing element instead of whatever
          // nested element is under the cursor — so a handler on a
          // descendant never sees it. `click`'s native `detail` count (2 for
          // a double-click) isn't affected by capture, so drive edit-entry
          // from here instead.
          if (e.detail < 2 || effectiveReadOnly || isLocked || isCommentMode || activeConnectorTool !== null) return;
          const isArrowLine = block.type === "path" && (block as CanvasBlock<"path">).data.tool === "arrow_line";
          if (block.type === "text" || block.type === "shape" || block.type === "doc" || block.type === "slideDeck" || isArrowLine) {
            setPendingEditBlockId(block.id);
          }
        }}
        style={getBlockFrameStyle({
          block, transform, visualTransform, isHistoryOpen, isQuickAddHandoff,
          isConnectorEndpoint, isSelected, isHovered, isLocked, isCommentMode,
          activeConnectorTool, connectorFocusActive, isPulsing,
        })}
      >
        <Renderer
          block={block as never}
          isSelected={isSelected}
          readOnly={effectiveReadOnly}
          onChange={handleChange}
        />

        <BlockFrameOverlays
          block={block}
          boardId={boardId}
          isSelected={isSelected}
          isHovered={isHovered}
          isReadOnly={effectiveReadOnly}
          isLocked={isLocked}
          isCommentMode={isCommentMode}
          activeConnectorTool={activeConnectorTool}
          showCanvasComments={showCanvasComments}
          hasChildren={hasChildren}
          isPathBlock={isPathBlock}
          isShapeBlock={isShapeBlock}
          isTableBlock={isTableBlock}
          isDocBlock={isDocBlock}
          isImageFlowNode={isImageFlowNode}
          onAutoFitHeight={handleAutoFitHeight}
          onAutoFitWidth={handleAutoFitWidth}
          canRotate={canRotate}
          isEditingDescription={isEditingDescription}
          isEditingContent={isEditingContent}
          isEditingLink={isEditingLink}
          setIsEditingDescription={setIsEditingDescription}
          setIsEditingLink={setIsEditingLink}
          onRotateHandlePointerDown={onRotateHandlePointerDown}
          onMoveHandlePointerDown={handleRootPointerDown}
          startResize={startResize}
          onResizeMove={onResizeMove}
          onResizeUp={onResizeUp}
          onResizeCancel={onResizeCancel}
          resizeGuide={resizeGuide}
          startConnectorDrag={startConnectorDrag}
          onPreviewVersion={onPreviewVersion}
          isHistoryOpen={isHistoryOpen}
          onHistoryOpenChange={setIsHistoryOpen}
        />
      </div>

      {contextMenuPosition && (
        <BlockContextMenu
          blockId={block.id}
          position={contextMenuPosition}
          onClose={() => setContextMenuPosition(null)}
          onEditDescription={() => setIsEditingDescription(true)}
          onEditLink={() => setIsEditingLink(true)}
        />
      )}
    </>
  );
};

// `onPreviewVersion` is a fresh closure per render from its callers (created
// inline in a .map()), so it's excluded here: its identity changing carries
// no behavioral difference for a given block, and comparing it would defeat
// memoization for every block whenever any block's list re-renders.
function areBlockFramePropsEqual(prev: BlockFrameProps, next: BlockFrameProps): boolean {
  return (
    prev.block === next.block &&
    prev.boardId === next.boardId &&
    prev.isVersionPreview === next.isVersionPreview &&
    prev.transformOverride === next.transformOverride &&
    prev.isTableAttachment === next.isTableAttachment &&
    prev.hasChildren === next.hasChildren
  );
}

export const BlockFrame = React.memo(BlockFrameComponent, areBlockFramePropsEqual);
