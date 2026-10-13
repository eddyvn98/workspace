"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { WorkspaceStore } from "../store/useWorkspaceStore";
import {
  createBlockId,
  createComputedTransform,
  resolveTransform,
  type BlockId,
  type CanvasBlock,
  type Transform,
} from "../types/block";
import { createConnectorId, type AnchorSide } from "../types/connector";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { currentMapLayout } from "../layout/mapRoot";
import { findMapRootId } from "../layout/mapRoot";
import { calculateFloatingQuickAddPosition } from "../layout/floatingQuickAddPlacement";
import { restyleWorkspaceMapConnectors } from "../connectors/restyleWorkspaceMapConnectors";
import { resolveWorkspaceTimelineBranchMode } from "../utils/layout/timelineBranchMode";

export type QuickAddDirection = "top" | "right" | "bottom" | "left";
export type QuickAddRole = "child" | "parent" | "siblingBefore" | "siblingAfter";
export type QuickAddRoles = Record<QuickAddDirection, QuickAddRole>;

export const QUICK_ADD_GAP_X = 60;
export const QUICK_ADD_GAP_Y = 50;

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export function getOppositeSide(side: QuickAddDirection): AnchorSide {
  switch (side) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

export function calculateAdjacentBlockPosition(
  sourceTransform: Transform,
  direction: QuickAddDirection,
  newSize: { w: number; h: number } = { w: sourceTransform.w, h: sourceTransform.h },
  gapX: number = QUICK_ADD_GAP_X,
  gapY: number = QUICK_ADD_GAP_Y
): { x: number; y: number } {
  const { x, y, w, h } = sourceTransform;
  const newW = newSize.w > 0 ? newSize.w : 160;
  const newH = newSize.h > 0 ? newSize.h : 80;

  switch (direction) {
    case "right":
      return {
        x: x + w + gapX,
        y: y + (h - newH) / 2,
      };
    case "left":
      return {
        x: x - newW - gapX,
        y: y + (h - newH) / 2,
      };
    case "bottom":
      return {
        x: x + (w - newW) / 2,
        y: y + h + gapY,
      };
    case "top":
      return {
        x: x + (w - newW) / 2,
        y: y - newH - gapY,
      };
  }
}

const FISHBONE_SIDE_THRESHOLD = 30;

function centerOf(transform: Transform): { x: number; y: number } {
  return { x: transform.x + transform.w / 2, y: transform.y + transform.h / 2 };
}

/**
 * Mirrors legacy's sideFromVector (app/mindmap/components/svg/
 * quickAddConfig.ts) — a horizontal offset of >=30px always wins (fishbone
 * ribs always run rightward, whether the category sits above or below the
 * spine), otherwise fall back to the vertical sign.
 */
function sideFromVector(dx: number, dy: number): QuickAddDirection {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return "right";
  if (dx >= FISHBONE_SIDE_THRESHOLD) return "right";
  if (dx <= -FISHBONE_SIDE_THRESHOLD) return "left";
  if (dy > 0) return "bottom";
  if (dy < 0) return "top";
  return "right";
}

function rolesForChildSide(childSide: QuickAddDirection): QuickAddRoles {
  if (childSide === "left") {
    return { left: "child", right: "parent", top: "siblingBefore", bottom: "siblingAfter" };
  }
  if (childSide === "bottom") {
    return { bottom: "child", top: "parent", left: "siblingBefore", right: "siblingAfter" };
  }
  if (childSide === "top") {
    return { top: "child", bottom: "parent", left: "siblingBefore", right: "siblingAfter" };
  }
  return { right: "child", left: "parent", top: "siblingBefore", bottom: "siblingAfter" };
}

function timelineChildSide(
  state: Pick<WorkspaceStore, "blocks" | "blockOrder" | "treeTimelineBranchMode">,
  blockId: BlockId,
  layout: ReturnType<typeof currentMapLayout>,
): QuickAddDirection {
  const block = state.blocks[blockId];
  const vertical = layout.direction === "down" || layout.direction === "up";
  const children = state.blockOrder
    .map((id) => state.blocks[id])
    .filter((candidate) => candidate?.parentId === blockId);

  // Existing descendants are the most reliable source of truth, especially
  // for alternate timelines and for nodes deeper than the first activity
  // level. Their rendered vector is the side where the next child belongs.
  const referenceChild = children[0];
  if (referenceChild && block) {
    const parentCenter = centerOf(resolveTransform(block.transform, DEFAULT_TRANSFORM));
    const childCenter = centerOf(resolveTransform(referenceChild.transform, DEFAULT_TRANSFORM));
    if (vertical && Math.abs(childCenter.x - parentCenter.x) >= FISHBONE_SIDE_THRESHOLD) {
      return childCenter.x < parentCenter.x ? "left" : "right";
    }
    if (!vertical && Math.abs(childCenter.y - parentCenter.y) >= FISHBONE_SIDE_THRESHOLD) {
      return childCenter.y < parentCenter.y ? "top" : "bottom";
    }
  }

  // Direct children of the map root are timeline milestones. Their children
  // branch according to the timeline branch mode, not along the rail.
  const parent = block?.parentId ? state.blocks[block.parentId] : undefined;
  if (block && parent && !parent.parentId) {
    const milestoneIndex = (state.blockOrder
      .map((id) => state.blocks[id])
      .filter((candidate) => candidate?.parentId === parent.id)
      .findIndex((candidate) => candidate?.id === block.id));
    const activityCount = state.blockOrder
      .map((id) => state.blocks[id])
      .filter((candidate) => candidate?.parentId && state.blocks[candidate.parentId]?.parentId === parent.id)
      .length;
    const mode = resolveWorkspaceTimelineBranchMode(layout.timelineBranchMode, activityCount);
    const reverse = mode === "one-side-reverse";
    const alternate = mode === "alternate" && milestoneIndex >= 0 && milestoneIndex % 2 === 1;
    const positive = reverse !== alternate;
    if (vertical) return positive ? "right" : "left";
    return positive ? "bottom" : "top";
  }

  // For deeper nodes without children yet, keep the branch side of their
  // nearest milestone. This avoids falling back to the rail direction.
  if (block) {
    let cursor = block;
    for (let guard = 0; guard < 1000 && cursor.parentId; guard += 1) {
      const parentNode = state.blocks[cursor.parentId];
      if (!parentNode) break;
      if (!parentNode.parentId) return vertical ? "left" : "top";
      cursor = parentNode;
    }
  }
  return vertical ? "left" : "top";
}

const CHILD_ONLY_ROLES: QuickAddRoles = {
  top: "child",
  right: "child",
  bottom: "child",
  left: "child",
};

/**
 * Workspace's four quick-add buttons must resolve the same semantic action as
 * the legacy config, not just use the global direction. In particular, the
 * root follows its first rendered child, while fishbone/treeview follow the
 * actual parent-child vector and both-side growth cannot trust one direction.
 */
export function getQuickAddRoles(
  state: Pick<WorkspaceStore, "blocks" | "blockOrder" | "treeLayoutFamily" | "treeLayoutDirection" | "treeGrowthMode" | "treeConnectorLineType" | "treeConnectorPaletteId" | "treeTimelineBranchMode" | "treeTimelineDescendantStyle" | "treeCatalogDescendantStyle">,
  blockId: BlockId,
): QuickAddRoles {
  const block = state.blocks[blockId];
  if (!block) return rolesForChildSide("right");
  const layout = currentMapLayout(state, blockId);

  if (layout.family === "flowchart") return CHILD_ONLY_ROLES;
  if (layout.family === "swimlane") return CHILD_ONLY_ROLES;

  if (layout.family === "timeline") {
    const rootId = findMapRootId(state.blocks, blockId);
    const block = state.blocks[blockId];
    // The root creates the first milestone along the timeline rail. Once a
    // node is on the rail, its child grows into the perpendicular activity
    // branch while siblings continue along the rail.
    if (rootId === blockId || !block?.parentId) {
      const railSide = layout.direction === "down" ? "bottom"
        : layout.direction === "up" ? "top"
          : layout.direction === "left" ? "left" : "right";
      return rolesForChildSide(railSide);
    }
    return rolesForChildSide(timelineChildSide(state, blockId, layout));
  }

  const rootId = findMapRootId(state.blocks, blockId);
  const mapRoot = rootId ? state.blocks[rootId] : undefined;
  // Legacy keeps detached/floating groups out of the tree quick-add
  // semantics: every handle grows a child from the selected floating block.
  // Do this before resolving a parent or layout direction, otherwise a
  // detached node inherits the stale hierarchy direction and exposes a
  // misleading parent action on its opposite side.
  if (block.isFloating || mapRoot?.isFloating) return CHILD_ONLY_ROLES;
  const parent = block.parentId ? state.blocks[block.parentId] : undefined;
  const referenceChild = !block.parentId
    ? state.blockOrder.map((id) => state.blocks[id]).find((candidate) => candidate?.parentId === blockId)
    : undefined;
  const origin = parent ?? block;
  const target = parent ? block : referenceChild;
  const originTransform = resolveTransform(origin.transform, DEFAULT_TRANSFORM);
  const targetTransform = target ? resolveTransform(target.transform, DEFAULT_TRANSFORM) : null;
  const geometrySide = targetTransform
    ? sideFromVector(
        targetTransform.x + targetTransform.w / 2 - (originTransform.x + originTransform.w / 2),
        targetTransform.y + targetTransform.h / 2 - (originTransform.y + originTransform.h / 2),
      )
    : null;

  const followsGeometry = layout.family === "fishbone"
    || layout.family === "treeview"
    || layout.growthMode === "both-side";
  const configuredSide = layout.direction === "down"
    ? "bottom"
    : layout.direction === "up"
      ? "top"
      : layout.direction;
  const childSide = (followsGeometry ? geometrySide : configuredSide) ?? geometrySide ?? "right";

  // The map root only exposes the child action(s), matching the legacy root
  // overlay. A free-form/process family is intentionally all-child and is
  // covered by usability smoke rather than old-layout parity.
  if (!rootId) return rolesForChildSide("right");
  if (!block.parentId) {
    const roles = rolesForChildSide(childSide);
    return {
      top: roles.top === "child" ? "child" : "parent",
      right: roles.right === "child" ? "child" : "parent",
      bottom: roles.bottom === "child" ? "child" : "parent",
      left: roles.left === "child" ? "child" : "parent",
    };
  }
  return rolesForChildSide(childSide);
}

/**
 * Fishbone has no stored map direction, and Treeview's direction labels are
 * semantic ("Down · Left" etc.) rather than the physical edge where a child
 * grows. Legacy resolves both families' quick-add side from each node's
 * rendered position relative to its parent (or, at the map root, relative to
 * the first child) via sideFromVector. Reproduce that geometry lookup instead
 * of trusting the single global direction.
 */
export function useFishboneQuickAddDirection(blockId: BlockId): QuickAddDirection | null {
  return useWorkspaceStore((state) => {
    const layout = currentMapLayout(state, blockId);
    if (layout.family !== "fishbone" && layout.family !== "treeview") return null;
    const block = state.blocks[blockId];
    if (!block) return "right";

    const parentId = block.parentId;
    const origin = parentId ? state.blocks[parentId] : block;
    const target = parentId
      ? block
      : state.blockOrder
          .map((id) => state.blocks[id])
          .find((candidate) => candidate?.parentId === blockId);
    if (!origin || !target) return "right";

    const originCenter = centerOf(resolveTransform(origin.transform, DEFAULT_TRANSFORM));
    const targetCenter = centerOf(resolveTransform(target.transform, DEFAULT_TRANSFORM));
    return sideFromVector(targetCenter.x - originCenter.x, targetCenter.y - originCenter.y);
  });
}

export function useBlockQuickAdd(blockId: BlockId) {
  const quickAdd = useCallback(
    (direction: QuickAddDirection) => {
      const state = useWorkspaceStore.getState();
      if (state.isReadOnly) return null;
      const sourceBlock = state.blocks[blockId];
      if (!sourceBlock) return null;

      const sourceTransform = resolveTransform(sourceBlock.transform, DEFAULT_TRANSFORM);
      const mapLayout = currentMapLayout(state, blockId);
      const newW = sourceTransform.w > 0 ? sourceTransform.w : 160;
      const newH = sourceTransform.h > 0 ? sourceTransform.h : 80;
      const mapRootId = findMapRootId(state.blocks, blockId);
      const mapRoot = mapRootId ? state.blocks[mapRootId] : undefined;
      const isFloatingGroup = Boolean(sourceBlock.isFloating || mapRoot?.isFloating);
      // Flowchart skips the tree reflow below (it is a free-form diagram, not
      // a hierarchy), so — like a floating group — its placement has to be
      // collision-safe up front: nothing will move the new block off an
      // existing one afterward.
      const needsCollisionSafePlacement = isFloatingGroup
        || mapLayout.family === "flowchart"
        || mapLayout.family === "swimlane";
      const targetPos = needsCollisionSafePlacement
        ? calculateFloatingQuickAddPosition(state.blocks, blockId, sourceTransform, direction, { w: newW, h: newH })
        : calculateAdjacentBlockPosition(sourceTransform, direction, { w: newW, h: newH });

      const newId = createBlockId();
      const now = Date.now();
      const newBlock: CanvasBlock<"text"> = {
        id: newId,
        type: "text",
        // Quick-add is a tree gesture, not a free-canvas placement. Persisting
        // the source as parent keeps map layout reflow and multi-level maps
        // consistent with the legacy Tab/Enter path. The transform must start
        // in the `computed` slot (not `override`) so the reflow below —
        // and every later layout-family/direction change — can actually move
        // this block; an `override` transform would always win in
        // resolveTransform and silently swallow every future reflow.
        parentId: blockId,
        // Without this, findMapRootId can't trace the new block back to the
        // map's actual root via mapId (it has no parentId chain of its own
        // yet to fall back on either, until a second quick-add points at
        // it) — it falsely resolves as its own "legacy tree root" the moment
        // a second quick-add gives it a parentId-pointing child. That root
        // mismatch is what let repeated quick-adds from the same source
        // silently stack new blocks on the exact same spot: each one's
        // collision check (calculateFloatingQuickAddPosition) only looks at
        // blocks sharing the source's resolved root, and prior siblings
        // resolved to a different (wrong) one.
        ...(sourceBlock.mapId ? { mapId: sourceBlock.mapId } : {}),
        ...(isFloatingGroup ? { isFloating: true } : {}),
        transform: createComputedTransform({
          x: Math.round(targetPos.x),
          y: Math.round(targetPos.y),
          w: Math.round(newW),
          h: Math.round(newH),
          rotation: 0,
          zIndex: state.blockOrder.length,
        }),
        // Legacy quick-add commits the visible placeholder as the node topic.
        // Keeping the same value avoids rendering Workspace's empty-editor hint
        // ("Type text here...") for a newly connected node.
        data: { markdown: "New Node" },
        style: sourceBlock.style ? { ...sourceBlock.style } : undefined,
        createdAt: now,
        updatedAt: now,
      };

      state.addBlock(newBlock);
      // Match whichever stroke color and arrowhead already touch this block
      // (the template's own connectors, or an earlier quick-add) instead of
      // falling back to the renderer's unstyled default — otherwise a
      // flowchart's uniformly colored, arrowed edges get one plain,
      // arrowless outlier every time quick-add draws a new one.
      const existingConnector = Object.values(state.connectors).find(
        (connector) => connector.fromBlockId === blockId || connector.toBlockId === blockId,
      );
      state.addConnector({
        id: createConnectorId(),
        fromBlockId: blockId,
        fromSide: direction,
        toBlockId: newId,
        toSide: getOppositeSide(direction),
        lineType: mapLayout.connectorLineType,
        arrowEnd: existingConnector?.arrowEnd ?? true,
        ...(existingConnector?.strokeColor ? { strokeColor: existingConnector.strokeColor } : {}),
      });
      // Structured maps need an immediate reflow because the layout knows
      // about every sibling. Floating groups deliberately skip that pass;
      // calculateFloatingQuickAddPosition has already searched the group for
      // a free spot without changing any user-authored positions.
      // Flowcharts are free-positioned diagrams. Running the complete tree
      // reflow/collision pass here does not change their layout, but still
      // walks every node and connector, which makes quick-add feel blocked.
      if (!isFloatingGroup && mapLayout.family !== "flowchart" && mapLayout.family !== "swimlane") reflowWorkspaceTree(blockId);
      restyleWorkspaceMapConnectors(blockId);
      state.setSelection([newId]);
      // Selecting the new block immediately is important for editing, but in
      // a free-form flowchart its opposite quick-add handle can now occupy
      // the same screen point as the handle the pointer is still over on the
      // source block. Keep that source handle authoritative until the pointer
      // leaves it; otherwise a second click silently changes the connector's
      // source to the newly-created node.
      if (mapLayout.family === "flowchart" || mapLayout.family === "swimlane") {
        state.setQuickAddHandoff({ blockId, direction });
      }
      state.setPendingEditBlockId(newId);
      return newId;
    },
    [blockId]
  );

  return { quickAdd };
}

export default useBlockQuickAdd;
