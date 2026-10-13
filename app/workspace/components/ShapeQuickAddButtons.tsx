"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { BlockId } from "../types/block";
import { resolveTransform, type Transform } from "../types/block";
import { useShapeQuickAdd, previewShapeQuickAdd, type ShapeQuickAddPreview } from "../hooks/useShapeQuickAdd";
import type { QuickAddDirection } from "../hooks/useBlockQuickAdd";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { quickAddExtents, quickAddHandleOffset } from "./quickAddHandleGeometry";
import { findOpenPositionInDirection } from "../layout/shapeAdjacency";
import { currentMapLayout } from "../layout/mapRoot";
import { resolveShapeConnectorLineType } from "../connectors/connectorStyle";
import { buildConnectorPathParity } from "../connectors/connectorPathParity";
import type { CanvasBlock } from "../types/block";

interface ShapeQuickAddButtonsProps {
  blockId: BlockId;
  isVisible: boolean;
  /** Keeps the source handle authoritative while the pointer is resting on
   * it after a flowchart quick-add selected the newly-created shape. */
  handoffDirection?: QuickAddDirection;
}

interface DirectionButtonConfig {
  direction: QuickAddDirection;
  label: string;
  style: React.CSSProperties;
}

const BUTTON_CONFIGS: DirectionButtonConfig[] = [
  { direction: "top", label: "Add shape above", style: { top: -28, left: "50%", transform: "translate(-50%, -50%)" } },
  { direction: "right", label: "Add shape right", style: { top: "50%", right: -35, transform: "translate(50%, -50%)" } },
  { direction: "bottom", label: "Add shape below", style: { bottom: -28, left: "50%", transform: "translate(-50%, 50%)" } },
  { direction: "left", label: "Add shape left", style: { top: "50%", left: -35, transform: "translate(-50%, -50%)" } },
];

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function ShapeQuickAddGhostPreview({
  blockId,
  blocks,
  transform,
  direction,
  preview,
  targetTransform,
  lineType,
}: {
  blockId: BlockId;
  blocks: Record<BlockId, CanvasBlock>;
  transform: Transform;
  direction: QuickAddDirection;
  preview: ShapeQuickAddPreview;
  targetTransform: Transform | null;
  lineType: "straight" | "curved" | "orthogonal";
}) {
  // "connect" points at whatever already occupies that side; the real
  // connector (once created) gets the full obstacle-aware routing when
  // lineType resolves to "orthogonal" - this preview draws the same line
  // style (straight/curved/orthogonal) as a plain 2-point path so it reads as
  // an honest preview of that style, without redoing obstacle avoidance.
  if (preview.kind === "connect" && targetTransform) {
    const left = targetTransform.x - transform.x;
    const top = targetTransform.y - transform.y;
    const line = direction === "right"
      ? { x1: transform.w, y1: transform.h / 2, x2: left, y2: top + targetTransform.h / 2 }
      : direction === "left"
        ? { x1: 0, y1: transform.h / 2, x2: left + targetTransform.w, y2: top + targetTransform.h / 2 }
        : direction === "bottom"
          ? { x1: transform.w / 2, y1: transform.h, x2: left + targetTransform.w / 2, y2: top }
          : { x1: transform.w / 2, y1: 0, x2: left + targetTransform.w / 2, y2: top + targetTransform.h };
    const d = buildConnectorPathParity({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }, lineType);
    return (
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 5 }}>
        <path d={d} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="5 4" markerEnd="url(#shapeQuickAddArrow)" />
        <defs>
          <marker id="shapeQuickAddArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#60a5fa" />
          </marker>
        </defs>
      </svg>
    );
  }

  // Same obstacle-avoiding search the actual quick-add commit uses (see
  // useShapeQuickAdd.ts) - world coordinates, converted to this preview's
  // block-relative frame so it lines up with the ghost/line math below.
  const absolutePos = findOpenPositionInDirection(blockId, direction, blocks, { w: transform.w, h: transform.h });
  const targetPos = { x: absolutePos.x - transform.x, y: absolutePos.y - transform.y };
  const line = direction === "right"
    ? { x1: transform.w, y1: transform.h / 2, x2: targetPos.x, y2: targetPos.y + transform.h / 2 }
    : direction === "left"
      ? { x1: 0, y1: transform.h / 2, x2: targetPos.x + transform.w, y2: targetPos.y + transform.h / 2 }
      : direction === "bottom"
        ? { x1: transform.w / 2, y1: transform.h, x2: targetPos.x + transform.w / 2, y2: targetPos.y }
        : { x1: transform.w / 2, y1: 0, x2: targetPos.x + transform.w / 2, y2: targetPos.y + transform.h };
  // When findOpenPositionInDirection had to offset the new shape off the
  // straight axis (an existing sibling was in the way), it hands back a
  // trunkAxis - the shared rail every sibling off this same source/direction
  // already bends through (see the doc comment on that field). The real
  // connector (computeConnectorGeometry's trunkAxis branch, which wins
  // regardless of lineType) draws through that exact rail; drawing this
  // preview from raw start/end instead bends wherever the target happens to
  // sit, which can cut straight through the sibling shape it was supposed to
  // route around instead of matching the shared rail.
  const horizontalDirection = direction === "left" || direction === "right";
  const trunkAxisLocal = absolutePos.trunkAxis === undefined
    ? undefined
    : horizontalDirection
      ? absolutePos.trunkAxis - transform.x
      : absolutePos.trunkAxis - transform.y;
  const trunkWaypoints = trunkAxisLocal === undefined
    ? []
    : horizontalDirection
      ? [{ x: trunkAxisLocal, y: line.y1 }, { x: trunkAxisLocal, y: line.y2 }]
      : [{ x: line.x1, y: trunkAxisLocal }, { x: line.x2, y: trunkAxisLocal }];
  const d = buildConnectorPathParity(
    { x: line.x1, y: line.y1 },
    { x: line.x2, y: line.y2 },
    trunkAxisLocal === undefined ? lineType : "orthogonal",
    trunkWaypoints,
  );

  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 5 }}>
        <path d={d} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="5 4" />
        <rect x={targetPos.x} y={targetPos.y} width={Math.max(1, transform.w)} height={Math.max(1, transform.h)} rx="8" fill="rgba(96, 165, 250, 0.10)" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="6 4" />
      </svg>
      <div
        className="pointer-events-none absolute flex items-center justify-center rounded-lg border border-dashed border-blue-400/70 bg-blue-50/50 text-[10px] font-medium text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
        style={{ left: targetPos.x, top: targetPos.y, width: transform.w, height: transform.h, zIndex: 6 }}
      >
        New shape
      </div>
    </>
  );
}

export const ShapeQuickAddButtons: React.FC<ShapeQuickAddButtonsProps> = ({ blockId, isVisible, handoffDirection }) => {
  const { quickAdd } = useShapeQuickAdd(blockId);
  const block = useWorkspaceStore((state) => state.blocks[blockId]);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const clearQuickAddHandoff = useWorkspaceStore((state) => state.clearQuickAddHandoff);
  // Preview the same line style addConnector will actually apply (see
  // useShapeQuickAdd.ts / resolveShapeConnectorLineType) - whatever style
  // already touches this shape's existing connectors, instead of a
  // style-agnostic straight indicator.
  const connectorLineType = useWorkspaceStore((state) =>
    resolveShapeConnectorLineType(state.connectors, blockId, currentMapLayout(state, blockId).connectorLineType));
  const transform = block ? resolveTransform(block.transform, DEFAULT_TRANSFORM) : null;
  const extents = useMemo(() => quickAddExtents(blockId, blocks), [blockId, blocks]);
  const [hoveredDirection, setHoveredDirection] = useState<QuickAddDirection | null>(null);
  const [preview, setPreview] = useState<ShapeQuickAddPreview | null>(null);
  const isHandoff = handoffDirection !== undefined;

  useEffect(() => {
    if (!isHandoff) return;
    return () => {
      const current = useWorkspaceStore.getState().quickAddHandoff;
      if (current?.blockId === blockId) clearQuickAddHandoff();
    };
  }, [blockId, clearQuickAddHandoff, isHandoff]);

  const visibleConfigs = (isHandoff
    ? BUTTON_CONFIGS.filter(({ direction }) => direction === handoffDirection)
    : BUTTON_CONFIGS).flatMap((config) => {
    const offset = quickAddHandleOffset(config.direction, extents);
    if (offset === null) return [];
    const style = config.direction === "top"
      ? { ...config.style, top: -offset }
      : config.direction === "right"
        ? { ...config.style, right: -offset }
        : config.direction === "bottom"
          ? { ...config.style, bottom: -offset }
          : { ...config.style, left: -offset };
    return [{ ...config, style }];
  });

  if (!isVisible) return null;

  const targetTransform = preview?.kind === "connect" && blocks[preview.targetId]
    ? resolveTransform(blocks[preview.targetId].transform, DEFAULT_TRANSFORM)
    : null;

  return (
    <div
      className="transition-opacity duration-150 opacity-100 pointer-events-auto"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}
    >
      {hoveredDirection && transform && preview && (
        <ShapeQuickAddGhostPreview blockId={blockId} blocks={blocks} transform={transform} direction={hoveredDirection} preview={preview} targetTransform={targetTransform} lineType={connectorLineType} />
      )}
      {visibleConfigs.map(({ direction, label, style }) => (
        <button
          key={direction}
          type="button"
          aria-label={label}
          title={label}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            setHoveredDirection(direction);
            setPreview(previewShapeQuickAdd(blockId, direction));
          }}
          onMouseLeave={() => {
            setHoveredDirection(null);
            setPreview(null);
            if (isHandoff) clearQuickAddHandoff();
          }}
          onFocus={() => {
            setHoveredDirection(direction);
            setPreview(previewShapeQuickAdd(blockId, direction));
          }}
          onBlur={() => {
            setHoveredDirection(null);
            setPreview(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setHoveredDirection(null);
            setPreview(null);
            quickAdd(direction);
          }}
          className="absolute flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-slate-600 transition-all duration-150 dark:text-slate-300"
          style={{ ...style, pointerEvents: "auto", touchAction: "none" }}
        >
          {/* Stays visible as a plain resting dot for as long as the shape
              is selected (see the matching comment in
              BlockQuickAddButtons.tsx) and only turns into the "+" once
              `hoveredDirection` confirms the pointer is actually over it. */}
          <span className={`flex h-2.5 w-2.5 items-center justify-center rounded-full border border-slate-300 bg-white shadow-sm transition-all duration-150 opacity-100 hover:scale-110 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-400 dark:hover:bg-slate-700 dark:hover:text-blue-400 ${hoveredDirection === direction ? "scale-125 border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-slate-700 dark:text-blue-400" : ""}`}>
            {hoveredDirection === direction ? <Plus className="h-3 w-3" strokeWidth={2.5} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
};

export default ShapeQuickAddButtons;
