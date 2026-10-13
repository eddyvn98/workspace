"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus } from "lucide-react";
import type { BlockId } from "../types/block";
import {
  useBlockQuickAdd,
  getQuickAddRoles,
  type QuickAddDirection,
} from "../hooks/useBlockQuickAdd";
import { useTreeAutoArrange } from "../hooks/useTreeAutoArrange";
import { useQuickAddHoverPreview, type QuickAddGhostBox } from "../hooks/useQuickAddHoverPreview";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { quickAddExtents, quickAddHandleOffset } from "./quickAddHandleGeometry";
import { resolveTransform, type Transform } from "../types/block";
import { currentMapLayout } from "../layout/mapRoot";

interface BlockQuickAddButtonsProps {
  blockId: BlockId;
  isVisible: boolean;
  reservedDirection?: QuickAddDirection;
  /** Keeps the source handle authoritative while the pointer is resting on
   * it after a flowchart quick-add selected the newly-created block. */
  handoffDirection?: QuickAddDirection;
}

interface DirectionButtonConfig {
  direction: QuickAddDirection;
  label: string;
  style: React.CSSProperties;
}

const BUTTON_CONFIGS: DirectionButtonConfig[] = [
  {
    direction: "top",
    label: "Add block above",
    style: {
      top: -28,
      left: "50%",
      transform: "translate(-50%, -50%)",
    },
  },
  {
    direction: "right",
    label: "Add block right",
    style: {
      top: "50%",
      right: -35,
      transform: "translate(50%, -50%)",
    },
  },
  {
    direction: "bottom",
    label: "Add block below",
    style: {
      bottom: -28,
      left: "50%",
      transform: "translate(-50%, 50%)",
    },
  },
  {
    direction: "left",
    label: "Add block left",
    style: {
      top: "50%",
      left: -35,
      transform: "translate(-50%, -50%)",
    },
  },
];

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

function QuickAddGhostPreview({
  transform,
  direction,
  ghostBox,
}: {
  transform: Transform;
  direction: QuickAddDirection;
  ghostBox: QuickAddGhostBox;
}) {
  // ghostBox comes out of the real tree-layout pass in canvas-absolute
  // coordinates (same space as every block's own transform); this overlay
  // renders inside the source block's own position:absolute wrapper, so it
  // needs converting to an offset relative to that block's corner. The ghost
  // is always spliced in immediately adjacent to this block on the hovered
  // side (child/parent/sibling-before/sibling-after all insert right next
  // to the anchor — see quickAddGhostLayout.ts), so the connector line can
  // anchor to that specific edge instead of a generic center-to-center line.
  const left = ghostBox.x - transform.x;
  const top = ghostBox.y - transform.y;
  const line = direction === "right"
    ? { x1: transform.w, y1: transform.h / 2, x2: left, y2: top + ghostBox.h / 2 }
    : direction === "left"
      ? { x1: 0, y1: transform.h / 2, x2: left + ghostBox.w, y2: top + ghostBox.h / 2 }
      : direction === "bottom"
        ? { x1: transform.w / 2, y1: transform.h, x2: left + ghostBox.w / 2, y2: top }
        : { x1: transform.w / 2, y1: 0, x2: left + ghostBox.w / 2, y2: top + ghostBox.h };

  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        style={{ zIndex: 5 }}
      >
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        <rect
          x={left}
          y={top}
          width={Math.max(1, ghostBox.w)}
          height={Math.max(1, ghostBox.h)}
          rx="8"
          fill="rgba(96, 165, 250, 0.10)"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
      </svg>
      <div
        className="pointer-events-none absolute flex items-center justify-center rounded-lg border border-dashed border-blue-400/70 bg-blue-50/50 text-[10px] font-medium text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
        style={{ left, top, width: ghostBox.w, height: ghostBox.h, zIndex: 6 }}
      >
        New block
      </div>
    </>
  );
}

// Legacy's getQuickAddConfig: only the button pointing in the map's growth
// direction adds a child; its opposite inserts a new parent; the two
// perpendicular buttons add a sibling before/after — four visual directions,
// but only one of them is ever "add a child positioned here".
type QuickAddRole = "child" | "parent" | "siblingBefore" | "siblingAfter";

export const BlockQuickAddButtons: React.FC<BlockQuickAddButtonsProps> = ({
  blockId,
  isVisible,
  reservedDirection,
  handoffDirection,
}) => {
  const { quickAdd } = useBlockQuickAdd(blockId);
  const { addSiblingBlock, addParentBlock } = useTreeAutoArrange();
  const block = useWorkspaceStore((state) => state.blocks[blockId]);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const clearQuickAddHandoff = useWorkspaceStore((state) => state.clearQuickAddHandoff);
  // Subscribe to the blocks object for layout-vector changes, but compute the
  // derived role map outside the selector. Returning a fresh object from a
  // Zustand selector makes React treat every snapshot as new and can recurse
  // during BlockFrame tests.
  const quickAddRoles = getQuickAddRoles(useWorkspaceStore.getState(), blockId);
  const [hoveredDirection, setHoveredDirection] = useState<QuickAddDirection | null>(null);
  const { ghost, startPreview, endPreview, cancelPreview } = useQuickAddHoverPreview();
  const transform = block ? resolveTransform(block.transform, DEFAULT_TRANSFORM) : null;
  const extents = useMemo(() => quickAddExtents(blockId, blocks), [blockId, blocks]);
  const isHandoff = handoffDirection !== undefined;
  const isFlowchart = currentMapLayout(useWorkspaceStore.getState(), blockId).family === "flowchart";

  // A handoff overlay is intentionally temporary. If the source frame is
  // hidden by a mode switch, clear the transient state even though its
  // button never receives the matching mouseleave event.
  useEffect(() => {
    if (!isHandoff) return;
    return () => {
      const current = useWorkspaceStore.getState().quickAddHandoff;
      if (current?.blockId === blockId) clearQuickAddHandoff();
    };
  }, [blockId, clearQuickAddHandoff, isHandoff]);

  const isRoot = Boolean(block && !block.parentId);
  // The semantic role is resolved from the same layout family, direction and
  // rendered parent/child vector for every button. Roots expose only the
  // direction(s) whose role is actually child, as in the legacy overlay.
  const visibleConfigs = (isHandoff
    ? BUTTON_CONFIGS.filter(({ direction }) => direction === handoffDirection)
    : isRoot
      ? BUTTON_CONFIGS.filter(({ direction }) => quickAddRoles[direction] === "child")
      : BUTTON_CONFIGS).filter(({ direction }) => direction !== reservedDirection).flatMap((config) => {
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
  const roleFor = (direction: QuickAddDirection): QuickAddRole => quickAddRoles[direction];
  const runQuickAdd = (direction: QuickAddDirection) => {
    const role = roleFor(direction);
    if (role === "parent") addParentBlock(blockId);
    else if (role === "siblingBefore" || role === "siblingAfter") {
      addSiblingBlock(blockId, role === "siblingBefore" ? "before" : "after");
    }
    else quickAdd(direction);
  };
  // QuickAddRole's four values are exactly QuickAddGhostMode's — the ghost
  // preview mirrors whichever action the hovered button will actually take.

  // Do not leave transparent interactive buttons mounted. CSS opacity alone
  // hides the affordance but the child buttons re-enable pointer events.
  if (!isVisible) return null;

  return (
    <div
      className="transition-opacity duration-150 opacity-100 pointer-events-auto"
      style={{
        position: "absolute",
        inset: 0,
        // The overlay must not swallow clicks intended for the block renderer
        // (notably table-cell context menus); only the actual plus buttons are
        // interactive.
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {hoveredDirection && transform && ghost && (() => {
        // The ghost is computed by the same virtual reflow as the eventual
        // add-parent/add-sibling commit. Never visually nudge it: a nudge
        // makes the preview look clearer but guarantees that the node jumps
        // to another position when the user releases the button.
        return <QuickAddGhostPreview transform={transform} direction={hoveredDirection} ghostBox={ghost} />;
      })()}
      {visibleConfigs.map(({ direction, label, style }) => (
        <button
          key={direction}
          type="button"
          aria-label={label}
          title={label}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onMouseEnter={() => {
            setHoveredDirection(direction);
            startPreview(blockId, roleFor(direction), direction);
          }}
          onMouseLeave={() => {
            setHoveredDirection(null);
            endPreview();
            if (isHandoff) clearQuickAddHandoff();
          }}
          onFocus={() => {
            setHoveredDirection(direction);
            startPreview(blockId, roleFor(direction), direction);
          }}
          onBlur={() => {
            setHoveredDirection(null);
            endPreview();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setHoveredDirection(null);
            cancelPreview();
            runQuickAdd(direction);
          }}
          className="absolute flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-slate-600 transition-all duration-150 dark:text-slate-300"
          style={{
            ...style,
            pointerEvents: "auto",
            touchAction: "none",
          }}
        >
          {/* The dot stays visible for the whole time the block is selected
              (opacity-100 always) rather than only appearing once the
              pointer happens to land inside this button's invisible hit-box
              - otherwise there's nothing on screen telling the user where to
              aim. It only turns into the actual "+" (for the non-flowchart
              case) once `hoveredDirection` confirms the pointer is really
              over it; until then it's just a plain resting dot. */}
          <span className={`flex h-2.5 w-2.5 items-center justify-center rounded-full shadow-sm transition-all duration-150 opacity-100 ${isFlowchart ? "border border-[#a8bff3] bg-[#b8caf5] text-white hover:scale-110 hover:bg-blue-500" : "border border-slate-300 bg-white hover:scale-110 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-blue-400 dark:hover:bg-slate-700 dark:hover:text-blue-400"} ${!isFlowchart && hoveredDirection === direction ? "scale-125 border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-slate-700 dark:text-blue-400" : ""}`}>
            {(() => {
              const isHoveredDirection = hoveredDirection === direction;
              if (isFlowchart) {
                if (!isHoveredDirection) return <span className="h-2 w-2 rounded-full bg-white" />;
                const Icon = direction === "top" ? ArrowUp : direction === "right" ? ArrowRight : direction === "bottom" ? ArrowDown : ArrowLeft;
                return <Icon className="h-3 w-3" strokeWidth={2.5} />;
              }
              return isHoveredDirection ? <Plus className="h-3 w-3" strokeWidth={2.5} /> : null;
            })()}
          </span>
        </button>
      ))}
    </div>
  );
};

export default BlockQuickAddButtons;
