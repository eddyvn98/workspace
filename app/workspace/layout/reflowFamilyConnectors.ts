import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId, MapLayoutSettings, Transform } from "../types/block";
import { getWorkspaceConnectorPalette } from "../connectors/connectorStyle";
import { CATEGORY_X_OFFSET } from "./fishboneLayout";

/** Keep the explicit low-opacity Fishbone spine in sync with the layout pass. */
export function syncFishboneBackbone(
  family: MapLayoutSettings["family"],
  rootId: BlockId,
  layout: MapLayoutSettings,
  categories: BlockId[],
  positions: Map<BlockId, { x: number; y: number }>,
  origin: Pick<Transform, "x" | "y" | "w" | "h">,
) {
  const backboneId = `${rootId}-fishbone-backbone`;
  if (family !== "fishbone") {
    useWorkspaceStore.setState((current) => {
      if (!current.connectors[backboneId]) return current;
      const rest = { ...current.connectors };
      delete rest[backboneId];
      return { connectors: rest };
    });
    return;
  }

  const spineY = origin.y + origin.h / 2;
  const spineStartX = origin.x + origin.w;
  if (categories.length === 0) {
    useWorkspaceStore.setState((current) => {
      if (!current.connectors[backboneId]) return current;
      const rest = { ...current.connectors };
      delete rest[backboneId];
      return { connectors: rest };
    });
    return;
  }

  const lastCategoryId = categories[categories.length - 1];
  const spineEndX = categories.reduce((max, categoryId) => {
    const point = positions.get(categoryId);
    return point ? Math.max(max, point.x - CATEGORY_X_OFFSET) : max;
  }, spineStartX);
  useWorkspaceStore.setState((current) => {
    if (current.isReadOnly) return current;
    const existing = current.connectors[backboneId];
    const paletteColor = getWorkspaceConnectorPalette(layout.connectorPaletteId).colors[0] ?? "#3370ff";
    return {
      connectors: {
        ...current.connectors,
        [backboneId]: {
          id: backboneId,
          fromBlockId: rootId,
          toBlockId: lastCategoryId,
          lineType: "straight" as const,
          fromSide: "right" as const,
          strokeColor: existing?.strokeColor ?? paletteColor,
          lineOpacity: 36,
          waypoints: [{ x: spineStartX, y: spineY }, { x: spineEndX, y: spineY }],
        },
      },
    };
  });
}
