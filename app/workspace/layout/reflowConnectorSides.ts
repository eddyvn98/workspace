import type { BlockId, MapLayoutSettings } from "../types/block";
import { hasCustomWorkspaceLayoutAngle } from "./layoutRotation";

type Side = "top" | "right" | "bottom" | "left";

export type StructuralSidePatch = {
  fromSide: Side | undefined;
  toSide: Side | undefined;
  lineType?: MapLayoutSettings["connectorLineType"];
};

interface StructuralConnector {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
}

const oppositeOf = (side: Side): Side =>
  side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left";

/**
 * Resolves the fromSide/toSide/lineType a structural (parent→child, no manual
 * waypoints) connector should render with, given the map's current layout.
 * Split out of reflowWorkspaceTree.ts to keep that file under the project's
 * 300-line limit — see reflowRoot's call site for why each family needs this
 * pinned instead of left to generic nearest-side geometry.
 */
export function computeStructuralConnectorPatch(
  connector: StructuralConnector,
  layout: MapLayoutSettings,
  blocks: Record<BlockId, { parentId?: BlockId | null } | undefined>,
  positions: Map<BlockId, { x: number; y: number }>,
): StructuralSidePatch {
  const { family, direction, growthMode } = layout;
  if (hasCustomWorkspaceLayoutAngle(layout)) return { fromSide: undefined, toSide: undefined, lineType: layout.connectorLineType };
  const isRootHop = !blocks[connector.fromBlockId]?.parentId;

  // Stacked treeview's depth columns put a child far to the *right* of its
  // parent's row, not below it — the generic nearest-side pick reads that as
  // a steep diagonal and connects corner to corner across intervening rows.
  // Legacy always drops from the parent's own bottom-center rail down into
  // the child's row (layoutOrgChart.ts's runLayoutCatalog).
  const isStackedTreeview = family === "treeview" && (layout.catalogDescendantStyle ?? "tree") !== "hierarchy";
  // "hierarchy" descendant style pins the root→level-1 hop to that same
  // bottom-center spine, then every level-1-down hop to a fixed right-edge
  // (parent) → gutter rail → left-edge (child) bracket (layoutCatalogHierarchy.ts).
  const isHierarchyTreeview = family === "treeview" && layout.catalogDescendantStyle === "hierarchy";
  // Treeview's direction option mirrors the whole layout by flipping
  // coordinates about the root (orientTreeviewLayout) instead of rotating
  // them — "left"/"down" flip which side a child's column sits on, "up"/"down"
  // flip which side its row sits on. The rail pins below must mirror the
  // same way or they point at the wrong edge once a column/row has flipped.
  const treeviewFlipX = direction === "left" || direction === "down";
  const treeviewFlipY = direction === "up" || direction === "down";

  if (isStackedTreeview) {
    return {
      fromSide: treeviewFlipY ? "top" : "bottom",
      toSide: treeviewFlipX ? "right" : "left",
      lineType: "orthogonal",
    };
  }
  if (isHierarchyTreeview) {
    return isRootHop
      ? { fromSide: treeviewFlipY ? "top" : "bottom", toSide: treeviewFlipX ? "right" : "left", lineType: "orthogonal" }
      : { fromSide: treeviewFlipX ? "left" : "right", toSide: treeviewFlipX ? "right" : "left", lineType: "orthogonal" };
  }

  if (family === "fishbone") {
    // Category descent is a vertical ladder in a fixed column per depth
    // (computeFishboneTreeLayout's getFishboneDescendantColumnX), not a
    // literal diagonal — only the root→category hop is a genuine diagonal (a
    // category sits directly off the spine), so leave that one to generic
    // nearest-side geometry and pin every deeper hop to the right-rail
    // bracket the ladder columns actually form.
    return isRootHop
      ? { fromSide: undefined, toSide: undefined, lineType: "straight" }
      : { fromSide: "right", toSide: "left", lineType: "orthogonal" };
  }

  if (family === "flowchart") {
    // Follow the flow axis, and peel a fork's branches off the SIDES of the
    // deciding shape so the two wires separate immediately instead of sharing
    // one stub (which also stacked their Yes/No labels on top of each other).
    // Mirrors resolveStructuralConnectorSides' flowchartSides.
    const isVerticalFlow = direction !== "right" && direction !== "left";
    const alongSide: Side = isVerticalFlow
      ? (direction === "up" ? "top" : "bottom")
      : (direction === "left" ? "left" : "right");
    const siblingCount = Object.values(blocks)
      .filter((block) => block?.parentId === connector.fromBlockId).length;
    if (siblingCount < 2) {
      return { fromSide: alongSide, toSide: oppositeOf(alongSide), lineType: "orthogonal" };
    }
    const parentPos = positions.get(connector.fromBlockId);
    const childPos = positions.get(connector.toBlockId);
    const fromSide: Side = isVerticalFlow
      ? ((childPos?.x ?? 0) < (parentPos?.x ?? 0) ? "left" : "right")
      : ((childPos?.y ?? 0) < (parentPos?.y ?? 0) ? "top" : "bottom");
    return { fromSide, toSide: oppositeOf(alongSide), lineType: "orthogonal" };
  }

  if (family === "swimlane") {
    // Two kinds of edge: the title crosses the bands to reach each lane
    // header, everything else runs along a band. Pinning both the same way
    // sent the title's wires diagonally across the band edges.
    const horizontalBands = direction !== "down" && direction !== "up";
    const side: Side = horizontalBands
      ? (isRootHop ? "bottom" : "right")
      : (isRootHop ? "right" : "bottom");
    return { fromSide: side, toSide: oppositeOf(side), lineType: "orthogonal" };
  }

  if (family === "timeline") {
    // Every timeline hop (root→milestone, milestone→activity,
    // activity→descendant) is axis-aligned by construction — no incidental
    // subtree-packing skew like Hierarchy's diagonal fan — so the dominant
    // position delta between parent and child reliably picks the same side
    // legacy's dedicated rail/tick pins would.
    const parentPos = positions.get(connector.fromBlockId);
    const childPos = positions.get(connector.toBlockId);
    const dx = (childPos?.x ?? 0) - (parentPos?.x ?? 0);
    const dy = (childPos?.y ?? 0) - (parentPos?.y ?? 0);
    const side: Side = Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? "right" : "left")
      : (dy >= 0 ? "bottom" : "top");
    return { fromSide: side, toSide: oppositeOf(side), lineType: layout.connectorLineType };
  }

  if (family === "hierarchy") {
    // Hierarchy pins its side to the map's growth axis instead of leaving it
    // to generic nearest-side geometry — legacy's hierarchySides() always
    // anchors top/bottom for a down/up map regardless of how far sideways
    // subtree packing pushes a child, and only compares left-vs-right
    // x-position for a horizontal map's own bundling decision. Reusing
    // generic geometry instead flips between horizontal/vertical per-child
    // based on incidental spacing, producing zigzag lines legacy never has.
    const isVerticalAxis = direction === "down" || direction === "up";
    let side: Side;
    if (growthMode === "both-side") {
      // Both-side splits children across the axis (some above/below, or some
      // left/right, of the parent) — the side must follow each child's
      // actual resolved position, not the map's nominal direction.
      const parentPos = positions.get(connector.fromBlockId);
      const childPos = positions.get(connector.toBlockId);
      side = isVerticalAxis
        ? (childPos?.y ?? 0) < (parentPos?.y ?? 0) ? "top" : "bottom"
        : (childPos?.x ?? 0) < (parentPos?.x ?? 0) ? "left" : "right";
    } else if (isVerticalAxis) {
      side = direction === "down" ? "bottom" : "top";
    } else {
      side = direction === "left" ? "left" : "right";
    }
    // A structural connector's own `lineType` field never gets rewritten once
    // set (e.g. an import that seeded "orthogonal", or a leftover from
    // switching in from a treeview/timeline map) — ConnectorLayer's
    // shared-trunk bundling checks THIS field, not the map's global
    // connectorLineType setting, so a stale value permanently disables
    // legacy's curved bracket bundling for that connector. Keep it synced to
    // the map's current line-style choice on every reflow.
    return { fromSide: side, toSide: oppositeOf(side), lineType: layout.connectorLineType };
  }

  return { fromSide: undefined, toSide: undefined };
}
