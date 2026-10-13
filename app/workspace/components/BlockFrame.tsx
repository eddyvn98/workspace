"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { resolveTransform, type CanvasBlock, type Transform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { blockRendererRegistry } from "../renderers/registry";
import { FallbackBlock } from "../renderers/FallbackBlock";
import { anchorRegistry } from "../connectors/anchorRegistry";
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
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
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

  // Connectors anchor to canvas coordinates, so the registry needs the live
  // transform (including the resize/drag previews that never reach the store)
  // without re-registering on every pointer move — a ref read lazily inside
  // getWorldRect stays current while the registration itself stays stable.
  const worldRectRef = useRef(transform);
  worldRectRef.current = transform;

  useEffect(() => {
    const unregister = anchorRegistry.register(block.id, {
      getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
      getWorldRect: () => {
        const current = worldRectRef.current;
        return new DOMRect(current.x, current.y, current.w, current.h);
      },
    });

    const element = rootRef.current;
    let observer: ResizeObserver | null = null;

    if (element && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        anchorRegistry.refresh(block.id);
      });
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      if (typeof unregister === "function") {
        unregister();
      }
    };
  }, [block.id]);

  // A preview transform lives in local state, so nothing in the store tells
  // the connector layer to redraw — notify the registry ourselves.
  useEffect(() => {
    anchorRegistry.refresh(block.id);
  }, [block.id, transform.x, transform.y, transform.w, transform.h]);

  const Renderer = blockRendererRegistry[block.type] ?? FallbackBlock;
  const isPathBlock = block.type === "path";
  const isShapeBlock = block.type === "shape";
  const isTableBlock = block.type === "table";
  const isDocBlock = block.type === "doc";
  const isSlideDeckBlock = block.type === "slideDeck";
  const isImageFlowNode = block.type === "imageFlow";
  const canRotate = isShapeBlock || isPathBlock || Boolean(block.isFloating);

  // Double-click-to-fit: se grows the frame's height to match its content's
  // natural (unclipped) height at the current width, ne grows width to match
  // content that overflows horizontally (e.g. a wide embedded table) at the
  // current height. Only wired for doc blocks - see BlockFrameOverlays'
  // per-corner onDoubleClick. `.workspace-doc-rich-editor` is the
  // overflow:auto content wrapper inside WorkspaceDocRichEditor, so its
  // scrollHeight/scrollWidth reflect the full content size even while
  // visually clipped by the frame's current dimensions.
  const handleAutoFitHeight = useCallback(() => {
    if (isLocked || effectiveReadOnly) return;
    const content = rootRef.current?.querySelector(".workspace-doc-rich-editor");
    if (!content) return;
    updateBlockTransform(block.id, { h: Math.max(60, content.scrollHeight) }, "override");
  }, [block.id, effectiveReadOnly, isLocked, updateBlockTransform]);

  const handleAutoFitWidth = useCallback(() => {
    if (isLocked || effectiveReadOnly) return;
    const content = rootRef.current?.querySelector(".workspace-doc-rich-editor");
    if (!content) return;
    updateBlockTransform(block.id, { w: Math.max(120, content.scrollWidth) }, "override");
  }, [block.id, effectiveReadOnly, isLocked, updateBlockTransform]);

  useEffect(() => {
    if (!isSlideDeckBlock || isLocked || effectiveReadOnly) return;
    const editor = rootRef.current?.querySelector<HTMLElement>(".workspace-doc-rich-editor .ProseMirror");
    if (!editor) return;
    let frame = 0;
    const fitHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const contentHeight = editor.scrollHeight + 120;
        const height = Math.max(360, Math.min(1600, contentHeight));
        const wrapper = rootRef.current?.querySelector<HTMLElement>(".workspace-doc-rich-editor");
        const horizontalOverflow = Math.max(0, editor.scrollWidth - editor.clientWidth, (wrapper?.scrollWidth ?? 0) - (wrapper?.clientWidth ?? 0));
        const width = Math.max(480, Math.min(1600, transform.w + horizontalOverflow));
        const patch = {
          ...(Math.abs(transform.h - height) > 2 ? { h: height } : {}),
          ...(Math.abs(transform.w - width) > 2 ? { w: width } : {}),
        };
        if (Object.keys(patch).length) updateBlockTransform(block.id, patch, "override");
      });
    };
    const observer = new MutationObserver(fitHeight);
    observer.observe(editor, { childList: true, characterData: true, subtree: true, attributes: true });
    fitHeight();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [block.id, effectiveReadOnly, isLocked, isSlideDeckBlock, transform.h, transform.w, updateBlockTransform]);

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
        style={{
          position: "absolute",
          // A table's own passThroughEmptyCellClicks (a swimlane's lane
          // grid) means a click on one of its empty cells must reach the
          // connector layer drawn behind it, not this wrapper - which
          // otherwise catches every pointer event in the block's box
          // regardless of what TableBlock does internally, since it sits
          // outside (and thus behind, in paint order) everything TableBlock
          // renders. Real interactive parts (header cells, populated cells,
          // resize/insert handles) explicitly re-enable pointerEvents:"auto"
          // themselves, which still overrides this per normal CSS
          // inheritance.
          pointerEvents: block.type === "table" && (block as CanvasBlock<"table">).data?.passThroughEmptyCellClicks ? "none" : "auto",
          left: `${transform.x}px`,
          top: `${transform.y}px`,
          width: `${transform.w}px`,
          height: `${transform.h}px`,
          // A selected/hovered block's quick-add "+" buttons and anchor dots
          // sit just outside its own box (BlockQuickAddButtons, ANCHOR_POINTS)
          // — z-index only wins against a lower sibling within the SAME
          // stacking context, so without this a "+" between two blocks can
          // render underneath whichever neighbor happens to have a higher
          // transform.zIndex from creation order. Bringing the active block
          // to the front fixes that for its own overlay children too.
          // A `table` is excluded: it can be used as a decorative grid drawn
          // BEHIND other freeform blocks (a swimlane's lane grid), and its
          // own resize/insert-row/insert-col handles already render at fixed,
          // very high z-indexes (TableResizeHandles/TableInsertHandles)
          // regardless of this wrapper's z-index - so hovering or selecting
          // the table has no need to jump it above content deliberately
          // placed on top of it, which is exactly what elevating it to 1000
          // was doing.
      // The source handle must stay above the newly-selected block while the
      // pointer is handed off after a flowchart quick-add. Their opposite
      // handles can occupy the same screen point; letting the new block win
      // hit testing would silently re-parent the next click.
          zIndex: isHistoryOpen ? 2000 : isQuickAddHandoff ? 1100 : isConnectorEndpoint ? 1200 : (isSelected || isHovered) && block.type !== "table" ? 1000 : transform.zIndex,
          transform: visualTransform,
          touchAction: "none",
          userSelect: "none",
          cursor: isLocked ? "default" : isCommentMode ? "pointer" : activeConnectorTool ? "crosshair" : undefined,
          opacity: connectorFocusActive && !isConnectorEndpoint ? 0.42 : 1,
          boxShadow: isConnectorEndpoint
            ? "0 0 0 3px rgba(37, 99, 235, 0.46), 0 8px 20px rgba(37, 99, 235, 0.18)"
            : isPulsing ? "0 0 0 3px rgba(37, 99, 235, 0.35)" : undefined,
          transition: "opacity 160ms ease, box-shadow 180ms ease-out",
        }}
      >
        <Renderer
          block={block as never}
          isSelected={isSelected}
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
