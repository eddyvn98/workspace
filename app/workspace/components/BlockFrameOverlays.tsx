"use client";

import React, { useEffect, useRef, useState } from "react";
import { Move, RotateCw } from "lucide-react";
import type { CanvasBlock } from "../types/block";
import { CommentBadge } from "./CommentBadge";
import { BlockDescription } from "./BlockDescription";
import { BlockLinkBadge } from "./BlockLinkBadge";
import { BlockLinkEditor } from "./BlockLinkEditor";
import { BlockQuickAddButtons } from "./BlockQuickAddButtons";
import { ShapeQuickAddButtons } from "./ShapeQuickAddButtons";
import { BlockPresenceRing } from "./BlockPresenceRing";
import { BlockAttributionDot } from "./BlockAttributionDot";
import { BlockAttachedImages } from "./BlockAttachedImages";
import { CollapseGlyph } from "./CollapseGlyph";
import { useShowAttribution } from "../hooks/useShowAttribution";
import { toggleBlockCollapse } from "../utils/toggleBlockCollapse";
import { currentMapLayout } from "../layout/mapRoot";
import { resolveWorkspaceCollapseDirection } from "../layout/collapseDirection";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { ResizeGuide } from "../hooks/useBlockResize";

export type ResizeCorner = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const RESIZE_HANDLES: Array<{ corner: ResizeCorner; cursor: string; style: React.CSSProperties }> = [
  { corner: "nw", cursor: "nwse-resize", style: { top: -4, left: -4 } },
  { corner: "n", cursor: "ns-resize", style: { top: -4, left: "50%", transform: "translate(-50%, -50%)" } },
  { corner: "ne", cursor: "nesw-resize", style: { top: -4, right: -4 } },
  { corner: "e", cursor: "ew-resize", style: { top: "50%", right: -4, transform: "translate(50%, -50%)" } },
  { corner: "se", cursor: "nwse-resize", style: { bottom: -4, right: -4 } },
  { corner: "s", cursor: "ns-resize", style: { bottom: -4, left: "50%", transform: "translate(-50%, 50%)" } },
  { corner: "sw", cursor: "nesw-resize", style: { bottom: -4, left: -4 } },
  { corner: "w", cursor: "ew-resize", style: { top: "50%", left: -4, transform: "translate(-50%, -50%)" } },
];
const CORNER_HANDLES = RESIZE_HANDLES.filter((entry) => entry.corner.length === 2);
const COLLAPSE_BUTTON_OFFSET = -30;
const resizeHitStyle = (corner: ResizeCorner): React.CSSProperties => {
  if (corner === "nw") return { top: -14, left: -14 };
  if (corner === "n") return { top: -14, left: "50%", transform: "translateX(-50%)" };
  if (corner === "ne") return { top: -14, right: -14 };
  if (corner === "e") return { top: "50%", right: -14, transform: "translateY(-50%)" };
  if (corner === "se") return { bottom: -14, right: -14 };
  if (corner === "s") return { bottom: -14, left: "50%", transform: "translateX(-50%)" };
  if (corner === "sw") return { bottom: -14, left: -14 };
  return { top: "50%", left: -14, transform: "translateY(-50%)" };
};
const ANCHOR_POINTS: Array<{ side: "left" | "right" | "top" | "bottom"; style: React.CSSProperties }> = [
  { side: "left", style: { left: -5, top: "50%", transform: "translateY(-50%)" } },
  { side: "right", style: { right: -5, top: "50%", transform: "translateY(-50%)" } },
  { side: "top", style: { top: -5, left: "50%", transform: "translateX(-50%)" } },
  { side: "bottom", style: { bottom: -5, left: "50%", transform: "translateX(-50%)" } },
];

type BooleanSetter = React.Dispatch<React.SetStateAction<boolean>>;

export interface BlockFrameOverlaysProps {
  block: CanvasBlock;
  boardId?: string | null;
  onPreviewVersion?: (version: CanvasBlock) => void;
  isHistoryOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
  isSelected: boolean;
  isHovered: boolean;
  isReadOnly: boolean;
  isLocked: boolean;
  isCommentMode: boolean;
  activeConnectorTool: { lineType: "straight" | "curved" | "orthogonal"; arrowEnd: boolean } | null;
  showCanvasComments: boolean;
  hasChildren: boolean;
  isPathBlock: boolean;
  isShapeBlock: boolean;
  isTableBlock: boolean;
  isDocBlock: boolean;
  isImageFlowNode: boolean;
  onAutoFitHeight: () => void;
  onAutoFitWidth: () => void;
  canRotate: boolean;
  isEditingDescription: boolean;
  isEditingContent: boolean;
  isEditingLink: boolean;
  setIsEditingDescription: BooleanSetter;
  setIsEditingLink: BooleanSetter;
  onRotateHandlePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMoveHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  startResize: (corner: ResizeCorner) => (event: React.PointerEvent<HTMLElement>) => void;
  onResizeMove: (event: React.PointerEvent<HTMLElement>) => void;
  onResizeUp: (event: React.PointerEvent<HTMLElement>) => void;
  onResizeCancel: (event: React.PointerEvent<HTMLElement>) => void;
  resizeGuide: ResizeGuide | null;
  startConnectorDrag: (event: React.PointerEvent<HTMLElement>, side?: "left" | "right" | "top" | "bottom") => void;
}

export const BlockFrameOverlays: React.FC<BlockFrameOverlaysProps> = ({
  block, boardId, onPreviewVersion, isHistoryOpen, onHistoryOpenChange, isSelected, isHovered, isReadOnly, isLocked, isCommentMode,
  activeConnectorTool, showCanvasComments, hasChildren, isPathBlock, isShapeBlock, isTableBlock, isDocBlock, isImageFlowNode, onAutoFitHeight, onAutoFitWidth,
  canRotate, isEditingDescription, isEditingContent, isEditingLink,
  setIsEditingDescription, setIsEditingLink,
  onRotateHandlePointerDown, onMoveHandlePointerDown, startResize, onResizeMove, onResizeUp, onResizeCancel, resizeGuide, startConnectorDrag,
}) => {
  const { showAttribution } = useShowAttribution();
  const blocks = useWorkspaceStore((state) => state.blocks);
  const pendingConnectorFrom = useWorkspaceStore((state) => state.pendingConnectorFrom);
  const quickAddHandoff = useWorkspaceStore((state) => state.quickAddHandoff);
  const isQuickAddHandoff = quickAddHandoff?.blockId === block.id;
  const mapLayout = currentMapLayout(useWorkspaceStore.getState(), block.id);
  // Flowchart and swimlane blocks may retain parentId for membership and
  // connector bookkeeping, but they are not collapsible tree branches.
  const supportsTreeCollapse = mapLayout.family !== "flowchart" && mapLayout.family !== "swimlane";
  const collapseDirection = resolveWorkspaceCollapseDirection(
    block.id,
    blocks,
    mapLayout,
  );
  const buttonSide: "left" | "right" | "top" | "bottom" = collapseDirection === "left" || collapseDirection === "right" || collapseDirection === "top" || collapseDirection === "bottom"
    ? collapseDirection
    : collapseDirection === "vertical" ? "bottom" : "right";
  const collapseButtonStyle: React.CSSProperties = {
    position: "absolute",
    ...(buttonSide === "left" ? { left: COLLAPSE_BUTTON_OFFSET, top: "50%", transform: "translateY(-50%)" } :
      buttonSide === "right" ? { right: COLLAPSE_BUTTON_OFFSET, top: "50%", transform: "translateY(-50%)" } :
        buttonSide === "top" ? { top: COLLAPSE_BUTTON_OFFSET, left: "50%", transform: "translateX(-50%)" } :
          { bottom: COLLAPSE_BUTTON_OFFSET, left: "50%", transform: "translateX(-50%)" }),
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "1.5px solid #64748b",
    background: "#ffffff",
    color: "#64748b",
    cursor: "pointer",
    zIndex: 30,
    boxShadow: "0 1px 3px rgba(15,23,42,0.15)",
  };
  // The collapse button sits COLLAPSE_BUTTON_OFFSET (-30) outside the block's
  // own box, in a gap that no element covers. Moving the pointer there fires
  // mouseleave on the block (isHovered -> false) before the pointer reaches
  // the button, which unmounts it immediately (conditional render, not just
  // opacity) - so it's gone by the time the pointer arrives and never gets a
  // chance to re-fire mouseenter itself. The button IS a real DOM descendant
  // of the same hoverable block (rendered inside BlockFrame's root div,
  // BlockFrame.tsx), so once it actually reaches the button, the browser
  // fires mouseenter on the block again on its own (the previously-hit gap
  // target wasn't a descendant, this one is) - isHovered flips back to true
  // in time, as long as the button is still mounted to be hit. A prior fix
  // covered that gap with an invisible bridge element instead, but the
  // bridge sat on top of (and blocked pointer events for) the green
  // connector anchor dot at the same edge (ANCHOR_POINTS, offset -5) and the
  // quick-add hit-boxes beside it. Debouncing the hide needs no extra
  // element: just keep the button mounted for a short grace period after
  // mouseleave, long enough for the pointer to cross the gap and land back
  // on the button (which then re-arms via the isHovered effect below).
  // The same debounced flag also gates the quick-add reservedDirection below
  // (not just the collapse button), so the two stay in sync and don't
  // flicker independently during the grace period - hence the neutral name.
  const HOVER_HIDE_DELAY_MS = 220;
  const [blockHoverActive, setBlockHoverActive] = useState(false);
  const hoverHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isHovered) {
      if (hoverHideTimeoutRef.current !== null) clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
      setBlockHoverActive(true);
      return;
    }
    hoverHideTimeoutRef.current = setTimeout(() => setBlockHoverActive(false), HOVER_HIDE_DELAY_MS);
    return () => {
      if (hoverHideTimeoutRef.current !== null) clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    };
  }, [isHovered]);
  const showCollapseButton = supportsTreeCollapse && hasChildren && !isLocked && !isReadOnly && (isSelected || blockHoverActive);
  return <>
    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: "100%", zIndex: 5, display: "flex", flexDirection: "column", gap: "4px" }}>
      {(Boolean(block.description) || isEditingDescription) && <BlockDescription block={block} isSelected={isSelected} isEditing={isEditingDescription} onStartEdit={() => { if (!isLocked) setIsEditingDescription(true); }} onStopEdit={() => setIsEditingDescription(false)} />}
      <BlockAttachedImages block={block} isReadOnly={isReadOnly} />
    </div>

    {block.icon && <div style={{ position: "absolute", top: -8, left: -8, width: 20, height: 20, borderRadius: "50%", backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, lineHeight: 1, zIndex: 15, pointerEvents: "none" }}>{block.icon}</div>}
    {showCanvasComments && <CommentBadge blockId={block.id} />}
    <BlockPresenceRing blockId={block.id} />
    {showAttribution && block.lastEditedBy && (isHovered || isSelected || isHistoryOpen) && <BlockAttributionDot boardId={boardId} blockId={block.id} email={block.lastEditedBy} updatedAt={block.updatedAt} onPreviewVersion={onPreviewVersion} isHistoryOpen={isHistoryOpen} onHistoryOpenChange={onHistoryOpenChange} />}
    {block.link && <BlockLinkBadge link={block.link} />}
    {isEditingLink && <BlockLinkEditor block={block} isOpen={isEditingLink} onClose={() => setIsEditingLink(false)} />}
    {resizeGuide && <div data-resize-guide="true" aria-hidden="true" style={{ position: "absolute", left: resizeGuide.x, top: resizeGuide.y, width: resizeGuide.w, height: resizeGuide.h, border: "1.5px dashed #f97316", pointerEvents: "none", zIndex: 4 }} />}

    <BlockQuickAddButtons
      blockId={block.id}
      reservedDirection={isQuickAddHandoff ? undefined : hasChildren && !isLocked && !isReadOnly && !isCommentMode && (isSelected || blockHoverActive) ? buttonSide : undefined}
      handoffDirection={isQuickAddHandoff ? quickAddHandoff.direction : undefined}
      isVisible={!isPathBlock && !isShapeBlock && !isImageFlowNode && !isLocked && !isReadOnly && !isCommentMode && activeConnectorTool === null && (isSelected || isQuickAddHandoff)}
    />
    {isShapeBlock && <ShapeQuickAddButtons blockId={block.id} handoffDirection={isQuickAddHandoff ? quickAddHandoff.direction : undefined} isVisible={!isLocked && !isReadOnly && !isCommentMode && activeConnectorTool === null && (isSelected || isQuickAddHandoff)} />}

    {showCollapseButton && <button type="button" data-workspace-collapse-toggle="true" data-workspace-collapse-direction={collapseDirection} aria-label={block.isCollapsed ? "Expand child branch" : "Collapse child branch"} title={block.isCollapsed ? "Expand child branch" : "Collapse child branch"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleBlockCollapse(block.id); }} style={collapseButtonStyle}><CollapseGlyph direction={collapseDirection} isCollapsed={Boolean(block.isCollapsed)} /></button>}

    {/* Bottom-left corner, clear of the resize handle at the same corner
        (resizeHitStyle's "sw" hit box only reaches to -14) - not top-center,
        which used to share the exact same offset as the "top" quick-add
        button (ShapeQuickAddButtons/quickAddHandleGeometry.ts) and sat
        right on top of it. Matches the reference tool's own placement:
        a rotate affordance away from the four N/S/E/W connect points
        entirely, so the two can never collide. */}
    {isSelected && !isReadOnly && !isLocked && canRotate && (
      <div
        onPointerDown={onRotateHandlePointerDown}
        data-rotate-handle="true"
        style={{ position: "absolute", bottom: -26, left: -26, width: 18, height: 18, borderRadius: "50%", backgroundColor: "#ffffff", border: "1.5px solid #94a3b8", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", zIndex: 25, touchAction: "none", pointerEvents: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
      >
        <RotateCw size={11} strokeWidth={2} />
      </div>
    )}

    {/* A table's own body is entirely covered by <td> cells, each of which
        stops pointerdown propagation for cell selection/text editing (see
        TableBlock.tsx's onSelect comment) - so clicking anywhere on the
        table's content never reaches the root drag handler, leaving no way
        to move it. This dedicated handle lives outside that cell grid
        entirely (as an overlay sibling), so it's the only reliable way to
        drag a table block by its position. */}
    {isTableBlock && isSelected && !isReadOnly && !isLocked && (
      <div
        onPointerDown={onMoveHandlePointerDown}
        data-move-handle="true"
        title="Drag to move"
        aria-label="Drag to move"
        style={{ position: "absolute", top: -26, left: -26, width: 18, height: 18, borderRadius: "50%", backgroundColor: "#ffffff", border: "1.5px solid #94a3b8", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", zIndex: 25, touchAction: "none", pointerEvents: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
      >
        <Move size={11} strokeWidth={2} />
      </div>
    )}

    {isSelected && !isReadOnly && !isLocked && !isPathBlock && !isEditingContent && <>
      {(isShapeBlock || isTableBlock ? RESIZE_HANDLES : CORNER_HANDLES).map(({ corner, cursor }) => {
        // Doc blocks get a double-click-to-fit shortcut on two corners: se
        // (grow height to the content's natural size, keep width) and ne
        // (grow width to content that overflows sideways, keep height) - see
        // BlockFrame.tsx's onAutoFitHeight/onAutoFitWidth doc comment.
        const onDoubleClick = isDocBlock
          ? corner === "se" ? () => onAutoFitHeight() : corner === "ne" ? () => onAutoFitWidth() : undefined
          : undefined;
        return (
          <div
            key={corner}
            data-resize-handle={corner}
            onPointerDown={startResize(corner)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeCancel}
            onLostPointerCapture={onResizeCancel}
            onDoubleClick={onDoubleClick}
            title={onDoubleClick ? (corner === "se" ? "Double-click: fit height to content" : "Double-click: fit width to content") : undefined}
            style={{ position: "absolute", width: 28, height: 28, cursor, zIndex: 10, touchAction: "none", pointerEvents: "auto", ...resizeHitStyle(corner) }}
          >
            <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 8, height: 8, transform: "translate(-50%, -50%)", backgroundColor: "#2563eb", pointerEvents: "none" }} />
          </div>
        );
      })}
    </>}

    {/* Quick-add's "+" dots (BlockQuickAddButtons, and ShapeQuickAddButtons
        for shapes) now stay visible for the entire time a block is
        selected, sitting on the same four edge-center spots as these green
        connector anchors - including right when a block is first selected,
        since the pointer that clicked it is typically still hovering it
        too. So while selected, only the connector-specific triggers (an
        explicit connector tool, or an in-progress drag from another block)
        bring the anchors up; plain hover on an *unselected* block still
        shows them exactly as before, since neither quick-add overlay ever
        appears without a selection. Path blocks are the one exception -
        they never render any quick-add overlay (see BlockQuickAddButtons'
        isVisible below) - but they're already excluded from anchors
        entirely by !isPathBlock above, so there's nothing to special-case
        for them here. */}
    {!isReadOnly && !isLocked && !isPathBlock && !isCommentMode && (activeConnectorTool !== null || pendingConnectorFrom !== null || (isHovered && !isSelected)) && <>
      {ANCHOR_POINTS.map(({ side, style }) => <div key={side} className="ws-anchor-dot" data-anchor-side={side} onPointerDown={(event) => startConnectorDrag(event, side)} style={{ position: "absolute", ...style, width: 10, height: 10, borderRadius: "50%", backgroundColor: "#10b981", cursor: "crosshair", zIndex: 11, touchAction: "none", boxShadow: "0 0 0 1px #ffffff" }} />)}
    </>}

  </>;
};
