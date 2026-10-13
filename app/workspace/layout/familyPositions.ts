import type { BlockId, MapLayoutSettings } from "../types/block";
import { computeFishboneTreeLayout } from "./fishboneLayout";
import { computeFlowchartTreeLayout } from "./flowchartLayout";
import { computeOrgChartLayout } from "./orgChartLayout";
import { computeSwimlaneLayout, type SwimlaneLayoutSize } from "./swimlaneLayout";
import { computeTimelineTreeLayout } from "./timelineLayout";
import { computeTreeLayout, type TreeLayoutSize } from "./treeLayout";
import { computeTreeviewLayout } from "./treeviewLayout";
import { applyWorkspaceLayoutRotation } from "./layoutRotation";

/**
 * Picks the layout calculator for a map's family and hands it the options
 * that family expects. Split out of reflowWorkspaceTree.ts to keep that file
 * under the project's 300-line cap, and because "which calculator, with what
 * options" is a decision worth reading on its own.
 */
export function computeFamilyPositions(
  layout: MapLayoutSettings,
  rootId: BlockId,
  origin: { x: number; y: number },
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
  options: { fishboneCapturedSlots?: ReadonlyMap<BlockId, number> } = {},
): Map<BlockId, { x: number; y: number }> {
  const { family, direction, growthMode } = layout;

  const positions = (() => {
    if (family === "treeview") {
      return computeTreeviewLayout(rootId, origin.x, origin.y, childrenByParent, sizes, {
      style: layout.catalogDescendantStyle === "hierarchy" ? "hierarchy" : "stacked",
      direction,
      });
    }

    if (family === "orgchart") return computeOrgChartLayout(rootId, origin.x, origin.y, childrenByParent, sizes);

    if (family === "timeline") {
      return computeTimelineTreeLayout(rootId, origin.x, origin.y, childrenByParent, sizes, {
      axis: direction === "down" || direction === "up" ? "vertical" : "horizontal",
      branchMode: layout.timelineBranchMode,
      descendantStyle: layout.timelineDescendantStyle,
      });
    }

    if (family === "flowchart") {
    // The correct depth-ranked column math already existed but nothing called
    // it, so "flowchart" was not a real family at all — the only reachable
    // code was the flat arrange-selection helper, which stacks whatever is
    // selected in list order with no branch structure.
      return computeFlowchartTreeLayout(rootId, origin.x, origin.y, childrenByParent, sizes, {
      direction: direction === "right" || direction === "left" ? "right" : "down",
      });
    }

    if (family === "swimlane") {
    // "down" means lanes run as columns with steps flowing downward (legacy's
    // orientation); everything else gives the reference tools' horizontal
    // bands.
      return computeSwimlaneLayout(rootId, origin.x, origin.y, childrenByParent, sizes, {
      orientation: direction === "down" || direction === "up" ? "vertical" : "horizontal",
      }).positions;
    }

    if (family === "fishbone") {
    // Legacy always runs fishbone in "nested" mode (usePageLayout.ts's two
    // runLayoutFishbone call sites both pass it literally). Leaving this unset
    // fell back to "outward", which widens boneStep 76 -> 104 and
    // descendantStep 188 -> 206: the first cause column sat 28px further from
    // its category, every extra depth added 18px, and the wider footprint
    // stretched the spine.
      return computeFishboneTreeLayout(rootId, origin.x, origin.y, childrenByParent, sizes, {
      mode: "nested",
      capturedSlots: options.fishboneCapturedSlots,
      });
    }

    return computeTreeLayout(rootId, origin.x, origin.y, direction, childrenByParent, sizes, growthMode);
  })();
  return applyWorkspaceLayoutRotation(positions, rootId, sizes, layout);
}

/** Header cells are real blocks, so the reflow pass needs the same dimensions
 * as the swimlane calculator in order to make the label occupy its row. */
export function computeSwimlaneHeaderCells(
  layout: MapLayoutSettings,
  rootId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
): Map<BlockId, SwimlaneLayoutSize> {
  if (layout.family !== "swimlane") return new Map();
  const orientation = layout.direction === "down" || layout.direction === "up"
    ? "vertical"
    : "horizontal";
  return computeSwimlaneLayout(rootId, 0, 0, childrenByParent, sizes, { orientation }).laneCells;
}

/**
 * Families whose calculator centres the root over its own subtree rather than
 * leaving it at the origin it was handed.
 *
 * The canvas treats the root's stored position as the anchor and never moves
 * it, so for these the descendants have to be translated back by the same
 * centre-to-anchor delta. Without that the whole map sits offset from its own
 * root, which showed up as every wire jogging sideways to reach a child that
 * should have been directly in line.
 */
export function familyRecentersRoot(family: MapLayoutSettings["family"]): boolean {
  return family === "hierarchy" || family === "flowchart" || family === "swimlane";
}

/**
 * Whether a family arranges its nodes for the user, or leaves them wherever
 * the user put them.
 *
 * Flowchart and swimlane are the free-form ones, and that is a deliberate
 * match for the reference tool rather than an omission. Larksuite's auto-layout
 * picker offers only Mind map, Tree diagram and Timeline; both its flowchart
 * and its two swimlane templates are free-placed shapes joined by smart
 * connectors, with the swimlane's lanes drawn as a table BEHIND the diagram
 * that owns none of it. Dragging a step from one lane to another there reflows
 * nothing at all.
 *
 * That is exactly why such a diagram can grow in whatever direction you like,
 * and why one can contain a feedback loop running back to an earlier step -
 * neither is expressible by a layout that insists on ranking nodes by depth
 * along one axis.
 *
 * The slot math is still there and still correct; it just becomes an explicit
 * "Auto arrange" the user asks for (see reflowRoot's `arrange` option) instead
 * of something that fires on every edit and drags their shapes back into a
 * tree.
 */
export function familyAutoArranges(family: MapLayoutSettings["family"]): boolean {
  return family !== "flowchart" && family !== "swimlane";
}
