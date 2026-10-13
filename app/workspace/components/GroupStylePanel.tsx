"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useAnchoredPanelPosition } from "../hooks/useAnchoredPanelPosition";
import { useBlockContextMenuActions } from "../hooks/useBlockContextMenuActions";
import { blockScreenRect, workspaceCanvasOrigin } from "../utils/blockRects";
import type { BlockStyle, ShapeKind } from "../types/block";
import type { WorkspaceTextStylePatch } from "./WorkspaceToolbarPrimitives";
import {
  GroupStylePanelControls,
  type GroupStylePopoverKey,
  type GroupTextData,
} from "./GroupStylePanelControls";

interface GroupStylePanelProps {
  selectedBlockIds: string[];
}

export function GroupStylePanel({ selectedBlockIds }: GroupStylePanelProps) {
  const [active, setActive] = useState<GroupStylePopoverKey>(null);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const removeBlock = useWorkspaceStore((state) => state.removeBlock);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const removeConnector = useWorkspaceStore((state) => state.removeConnector);
  const actions = useBlockContextMenuActions();

  const { toolbarRef, style: anchoredStyle, placement } = useAnchoredPanelPosition(
    selectedBlockIds.length > 0,
    () => {
      const camera = useWorkspaceStore.getState().camera;
      const origin = workspaceCanvasOrigin();
      const rects = selectedBlockIds
        .map((id) => blockScreenRect(blocks, id, camera, origin))
        .filter((rect): rect is DOMRect => rect !== null);
      if (rects.length === 0) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return new DOMRect(left, top, right - left, bottom - top);
    },
  );

  const toggle = useCallback((key: Exclude<GroupStylePopoverKey, null>) => {
    setActive((current) => (current === key ? null : key));
  }, []);

  const primaryId = selectedBlockIds[0];
  const primaryBlock = primaryId ? blocks[primaryId] : null;
  const selectedBlocks = useMemo(
    () => selectedBlockIds.map((id) => blocks[id]).filter(Boolean),
    [selectedBlockIds, blocks],
  );

  if (selectedBlockIds.length < 2 || !primaryBlock || !primaryId) return null;

  const primaryShapeKind = primaryBlock.type === "shape"
    ? (primaryBlock.data as { shapeKind?: ShapeKind }).shapeKind
    : primaryBlock.style?.shapeKind;
  const isPrimaryText = primaryBlock.type === "text";
  const primaryTextData: GroupTextData | null = isPrimaryText
    ? (primaryBlock.data as GroupTextData)
    : null;
  const fontSize = primaryTextData?.fontSize ?? 11;
  const backgroundColor = primaryBlock.style?.backgroundColor ?? "#ffffff";
  const textColor = primaryBlock.style?.textColor ?? "#1e293b";
  const below = placement === "below" || (anchoredStyle?.top ?? 80) < 80;

  const textBlocks = selectedBlocks.filter((block) => block.type === "text");
  const hasMixed = (key: "fontWeight" | "fontStyle" | "fontUnderline" | "fontStrikethrough") =>
    textBlocks.length > 1 && new Set(textBlocks.map((block) => (block.data as Record<string, unknown>)[key])).size > 1;
  const mixedFontWeight = hasMixed("fontWeight");
  const mixedFontStyle = hasMixed("fontStyle");
  const mixedUnderline = hasMixed("fontUnderline");
  const mixedStrikethrough = hasMixed("fontStrikethrough");

  const handleBulkStyle = (patch: Partial<BlockStyle>) => {
    selectedBlockIds.forEach((id) => {
      const block = blocks[id];
      if (!block) return;
      updateBlock(id, { style: { ...block.style, ...patch } });
    });
  };

  const handleBulkShape = (nextKind: ShapeKind) => {
    selectedBlockIds.forEach((id) => {
      const block = blocks[id];
      if (!block) return;
      if (block.type === "shape") {
        updateBlock(id, { data: { ...(block.data as object), shapeKind: nextKind } as typeof block.data });
      } else {
        updateBlock(id, { style: { ...block.style, shapeKind: nextKind } });
      }
    });
  };

  const handleBulkFontSize = (size: number) => {
    selectedBlockIds.forEach((id) => {
      const block = blocks[id];
      if (block?.type === "text") {
        updateBlock(id, { data: { ...(block.data as object), fontSize: size } as typeof block.data });
      }
    });
  };

  const handleBulkTextStyle = (patch: Partial<WorkspaceTextStylePatch>) => {
    const dataPatch: Record<string, unknown> = {};
    if (patch.fontSize !== undefined) dataPatch.fontSize = patch.fontSize;
    if (patch.fontWeight !== undefined) dataPatch.fontWeight = patch.fontWeight;
    if (patch.fontStyle !== undefined) dataPatch.fontStyle = patch.fontStyle;
    if (patch.fontUnderline !== undefined) dataPatch.fontUnderline = patch.fontUnderline;
    if (patch.fontStrikethrough !== undefined) dataPatch.fontStrikethrough = patch.fontStrikethrough;
    if (patch.textStyle !== undefined) dataPatch.textStyle = patch.textStyle;
    if (patch.fontAlign !== undefined) dataPatch.align = patch.fontAlign;
    if (patch.verticalAlign !== undefined) dataPatch.verticalAlign = patch.verticalAlign;
    if (patch.textPadding !== undefined) dataPatch.padding = patch.textPadding;

    selectedBlockIds.forEach((id) => {
      const block = blocks[id];
      if (!block) return;
      if (block.type === "text" && Object.keys(dataPatch).length > 0) {
        updateBlock(id, { data: { ...(block.data as object), ...dataPatch } as typeof block.data });
      }
      if (patch.textColor !== undefined || patch.bgColor !== undefined) {
        updateBlock(id, {
          style: {
            ...block.style,
            ...(patch.textColor !== undefined ? { textColor: patch.textColor } : {}),
            ...(patch.bgColor !== undefined ? { backgroundColor: patch.bgColor } : {}),
          },
        });
      }
    });
  };

  const handleBulkDelete = () => {
    const selectedSet = new Set(selectedBlockIds);
    Object.values(connectors).forEach((connector) => {
      if (selectedSet.has(connector.fromBlockId) || selectedSet.has(connector.toBlockId)) {
        removeConnector(connector.id);
      }
    });
    selectedBlockIds.forEach((id) => removeBlock(id));
    useWorkspaceStore.getState().setSelection([]);
  };

  return <GroupStylePanelControls
    selectedBlockIds={selectedBlockIds}
    primaryBlock={primaryBlock}
    primaryShapeKind={primaryShapeKind}
    primaryTextData={primaryTextData}
    backgroundColor={backgroundColor}
    textColor={textColor}
    fontSize={fontSize}
    below={below}
    mixedFontWeight={mixedFontWeight}
    mixedFontStyle={mixedFontStyle}
    mixedUnderline={mixedUnderline}
    mixedStrikethrough={mixedStrikethrough}
    active={active}
    toggle={toggle}
    onStyle={handleBulkStyle}
    onShape={handleBulkShape}
    onFontSize={handleBulkFontSize}
    onTextStyle={handleBulkTextStyle}
    onCopy={() => actions.copyBlock(primaryId)}
    onPasteStyle={() => actions.pasteStyle(primaryId)}
    canPasteStyle={actions.canPasteStyle}
    onDelete={handleBulkDelete}
    toolbarRef={toolbarRef}
    anchoredStyle={anchoredStyle}
  />;
}

export default GroupStylePanel;
