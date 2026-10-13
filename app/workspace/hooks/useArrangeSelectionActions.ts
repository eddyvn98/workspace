"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { type BlockId, type Transform, resolveTransform } from "../types/block";
import { createConnectorId } from "../types/connector";
import { computeFishboneLayout, type FishboneLayoutSize } from "../layout/fishboneLayout";
import { computeTimelineLayout, type TimelineLayoutSize } from "../layout/timelineLayout";
import { computeCatalogLayout, type CatalogLayoutSize } from "../layout/catalogLayout";
import { computeFlowchartLayout, type FlowchartLayoutSize } from "../layout/flowchartLayout";
import { colorForArrangeIndex, type ArrangeColorPreset } from "../layout/arrangeColorPresets";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** The 4 one-shot "Arrange Selection" layout commands — split out of
 *  WorkspaceArrangeMenu.tsx (which was over the 300-line cap) into a plain
 *  hook. Each reads the live selection off the store directly (not via a
 *  reactive selector) since these fire once on click, not on every render. */
export function useArrangeSelectionActions(selectedPreset: ArrangeColorPreset | null, onDone: () => void) {
  const handleArrangeFishbone = useCallback(() => {
    const state = useWorkspaceStore.getState();
    const currentSelected = state.selectedBlockIds;
    if (currentSelected.length < 2) return;

    const spineId = currentSelected[0];
    const ribIds = currentSelected.slice(1);
    const spineBlock = state.blocks[spineId];
    if (!spineBlock) return;

    const spineTransform = resolveTransform(spineBlock.transform, DEFAULT_TRANSFORM);
    const sizes = new Map<BlockId, FishboneLayoutSize>();
    for (const id of currentSelected) {
      const block = state.blocks[id];
      if (block) {
        const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        sizes.set(id, { w: resolved.w, h: resolved.h });
      }
    }

    const positions = computeFishboneLayout(spineId, ribIds, spineTransform.x, spineTransform.y, sizes);

    ribIds.forEach((ribId, idx) => {
      const pos = positions.get(ribId);
      if (pos) {
        state.updateBlockTransform(ribId, { x: pos.x, y: pos.y }, "override");
      }
      state.addConnector({
        id: createConnectorId(),
        fromBlockId: spineId,
        toBlockId: ribId,
        lineType: "straight",
        strokeColor: colorForArrangeIndex(selectedPreset, idx),
      });
    });

    onDone();
  }, [selectedPreset, onDone]);

  const handleArrangeTimeline = useCallback(() => {
    const state = useWorkspaceStore.getState();
    const currentSelected = state.selectedBlockIds;
    if (currentSelected.length < 2) return;

    const firstBlock = state.blocks[currentSelected[0]];
    if (!firstBlock) return;
    const firstTransform = resolveTransform(firstBlock.transform, DEFAULT_TRANSFORM);

    const sizes = new Map<BlockId, TimelineLayoutSize>();
    for (const id of currentSelected) {
      const block = state.blocks[id];
      if (block) {
        const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        sizes.set(id, { w: resolved.w, h: resolved.h });
      }
    }

    const positions = computeTimelineLayout(currentSelected, firstTransform.x, firstTransform.y, sizes);

    for (let i = 1; i < currentSelected.length; i += 1) {
      const pos = positions.get(currentSelected[i]);
      if (pos) state.updateBlockTransform(currentSelected[i], { x: pos.x, y: pos.y }, "override");
    }

    for (let i = 0; i < currentSelected.length - 1; i += 1) {
      state.addConnector({
        id: createConnectorId(),
        fromBlockId: currentSelected[i],
        toBlockId: currentSelected[i + 1],
        lineType: "straight",
        strokeColor: colorForArrangeIndex(selectedPreset, i),
      });
    }

    onDone();
  }, [selectedPreset, onDone]);

  const handleArrangeCatalog = useCallback(() => {
    const state = useWorkspaceStore.getState();
    const currentSelected = state.selectedBlockIds;
    if (currentSelected.length < 2) return;

    const firstBlock = state.blocks[currentSelected[0]];
    if (!firstBlock) return;
    const firstTransform = resolveTransform(firstBlock.transform, DEFAULT_TRANSFORM);

    const sizes = new Map<BlockId, CatalogLayoutSize>();
    for (const id of currentSelected) {
      const block = state.blocks[id];
      if (block) {
        const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        sizes.set(id, { w: resolved.w, h: resolved.h });
      }
    }

    const columns = Math.max(1, Math.ceil(Math.sqrt(currentSelected.length)));
    const positions = computeCatalogLayout(currentSelected, firstTransform.x, firstTransform.y, columns, sizes);

    for (let i = 1; i < currentSelected.length; i += 1) {
      const pos = positions.get(currentSelected[i]);
      if (pos) state.updateBlockTransform(currentSelected[i], { x: pos.x, y: pos.y }, "override");
    }

    onDone();
  }, [onDone]);

  const handleArrangeFlowchart = useCallback(() => {
    const state = useWorkspaceStore.getState();
    const currentSelected = state.selectedBlockIds;
    if (currentSelected.length < 2) return;

    const firstBlock = state.blocks[currentSelected[0]];
    if (!firstBlock) return;
    const firstTransform = resolveTransform(firstBlock.transform, DEFAULT_TRANSFORM);

    const sizes = new Map<BlockId, FlowchartLayoutSize>();
    for (const id of currentSelected) {
      const block = state.blocks[id];
      if (block) {
        const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        sizes.set(id, { w: resolved.w, h: resolved.h });
      }
    }

    const positions = computeFlowchartLayout(currentSelected, firstTransform.x, firstTransform.y, sizes);

    for (let i = 1; i < currentSelected.length; i += 1) {
      const pos = positions.get(currentSelected[i]);
      if (pos) state.updateBlockTransform(currentSelected[i], { x: pos.x, y: pos.y }, "override");
    }

    for (let i = 0; i < currentSelected.length - 1; i += 1) {
      state.addConnector({
        id: createConnectorId(),
        fromBlockId: currentSelected[i],
        toBlockId: currentSelected[i + 1],
        lineType: "orthogonal",
        strokeColor: colorForArrangeIndex(selectedPreset, i),
      });
    }

    onDone();
  }, [selectedPreset, onDone]);

  return { handleArrangeFishbone, handleArrangeTimeline, handleArrangeCatalog, handleArrangeFlowchart };
}
