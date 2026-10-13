import type { CanvasBlock, MapLayoutSettings } from "../types/block";
import type { CanvasConnector, AnchorSide } from "../types/connector";
import { hasCustomWorkspaceLayoutAngle } from "../layout/layoutRotation";

export interface ConnectorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StructuralConnectorSides {
  fromSide: AnchorSide;
  toSide: AnchorSide;
}

function opposite(side: AnchorSide): AnchorSide {
  switch (side) {
    case "left": return "right";
    case "right": return "left";
    case "top": return "bottom";
    default: return "top";
  }
}

function center(rect: ConnectorRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Structural map edges use the layout growth axis, not the shortest geometric
 * vector. The old SVG renderer keeps a right/left or top/bottom port even when
 * subtree packing puts a child far above or below its parent.
 */
export function resolveStructuralConnectorSides(
  connector: CanvasConnector,
  fromRect: ConnectorRect,
  toRect: ConnectorRect,
  blocks: Record<string, CanvasBlock>,
  layout: Pick<MapLayoutSettings, "family" | "direction" | "growthMode">,
): StructuralConnectorSides | null {
  if (connector.waypoints?.length) return null;
  if (hasCustomWorkspaceLayoutAngle(layout as Pick<MapLayoutSettings, "family" | "layoutAngle">)) return null;
  const parent = blocks[connector.fromBlockId];
  const child = blocks[connector.toBlockId];
  if (!parent || !child || child.parentId !== parent.id) return null;
  const parentCenter = center(fromRect);
  const childCenter = center(toRect);

  if (layout.family === "flowchart") {
    return flowchartSides(layout.direction, parent, child, blocks, parentCenter, childCenter);
  }
  if (layout.family === "swimlane") {
    return swimlaneSides(layout.direction, parent);
  }
  if (layout.family !== "hierarchy" && layout.family !== "orgchart") return null;

  const horizontal = layout.direction === "right" || layout.direction === "left";
  let fromSide: AnchorSide;

  if (horizontal) {
    const mirroredBranch = layout.growthMode === "both-side";
    fromSide = mirroredBranch
      ? (childCenter.x < parentCenter.x ? "left" : "right")
      : layout.direction === "left" ? "left" : "right";
  } else {
    const mirroredBranch = layout.growthMode === "both-side";
    fromSide = mirroredBranch
      ? (childCenter.y < parentCenter.y ? "top" : "bottom")
      : layout.direction === "up" ? "top" : "bottom";
  }

  return { fromSide, toSide: opposite(fromSide) };
}

/**
 * A flowchart's wires follow the flow axis, and a decision is the exception
 * that matters: when a node forks, its branches peel off the SIDES of the
 * shape and drop into each child's top, which is what makes a decision
 * readable at a glance in every reference tool. Routing both branches out of
 * the same bottom port instead produced two wires sharing one stub, entering
 * their children at the corners — and it stacked both Yes/No labels on that
 * shared stub, so they overprinted each other.
 */
function flowchartSides(
  direction: MapLayoutSettings["direction"],
  parent: CanvasBlock,
  child: CanvasBlock,
  blocks: Record<string, CanvasBlock>,
  parentCenter: { x: number; y: number },
  childCenter: { x: number; y: number },
): StructuralConnectorSides {
  const horizontal = direction === "right" || direction === "left";
  const forks = Object.values(blocks).filter((block) => block.parentId === parent.id).length >= 2;

  if (horizontal) {
    const alongSide: AnchorSide = direction === "left" ? "left" : "right";
    if (!forks) return { fromSide: alongSide, toSide: opposite(alongSide) };
    return {
      fromSide: childCenter.y < parentCenter.y ? "top" : "bottom",
      toSide: opposite(alongSide),
    };
  }

  const alongSide: AnchorSide = direction === "up" ? "top" : "bottom";
  if (!forks) return { fromSide: alongSide, toSide: opposite(alongSide) };
  return {
    fromSide: childCenter.x < parentCenter.x ? "left" : "right",
    toSide: opposite(alongSide),
  };
}

/**
 * A swimlane has two kinds of edge, and they leave different sides:
 *  - title -> lane header, which crosses the bands, so it runs across them;
 *  - lane header -> step, and step -> step, which run ALONG the band.
 * Treating both the same is what made the title's wires cut across the band
 * edges at an angle.
 */
function swimlaneSides(
  direction: MapLayoutSettings["direction"],
  parent: CanvasBlock,
): StructuralConnectorSides {
  const horizontalBands = direction !== "down" && direction !== "up";
  const isTitle = !parent.parentId;

  if (horizontalBands) {
    // Bands stack downward, steps flow right.
    const side: AnchorSide = isTitle ? "bottom" : "right";
    return { fromSide: side, toSide: opposite(side) };
  }
  // Lanes are columns side by side, steps flow downward.
  const side: AnchorSide = isTitle ? "right" : "bottom";
  return { fromSide: side, toSide: opposite(side) };
}
