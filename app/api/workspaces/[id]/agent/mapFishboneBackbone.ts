import { CATEGORY_X_OFFSET } from "@/app/workspace/layout/fishboneLayout";
import { getWorkspaceConnectorPalette } from "@/app/workspace/connectors/connectorStyle";
import type { MapLayoutSettings } from "@/app/workspace/types/block";
import { blockRect, type AgentBoardState } from "./operationsCore";

/** Adds (or removes) the fishbone spine the editor draws for a Fishbone map:
 * one faint horizontal line from the root's right edge to the last category.
 * Mirrors syncFishboneBackbone in the editor's reflow, which never runs when
 * the server lays a map out. */
export function syncFishboneBackbone(
  state: AgentBoardState,
  rootId: string,
  layout: MapLayoutSettings,
  categories: string[],
  positions: Map<string, { x: number; y: number }>,
): void {
  const backboneId = `${rootId}-fishbone-backbone`;
  if (layout.family !== "fishbone" || categories.length === 0 || !state.blocks[rootId]) {
    delete state.connectors[backboneId];
    return;
  }
  const rect = blockRect(state.blocks[rootId]);
  const spineY = rect.y + rect.h / 2;
  const spineStartX = rect.x + rect.w;
  const spineEndX = categories.reduce((max, id) => {
    const point = positions.get(id);
    return point ? Math.max(max, point.x - CATEGORY_X_OFFSET) : max;
  }, spineStartX);
  const existing = state.connectors[backboneId] as { strokeColor?: string } | undefined;
  state.connectors[backboneId] = {
    id: backboneId,
    fromBlockId: rootId,
    toBlockId: categories[categories.length - 1],
    lineType: "straight",
    fromSide: "right",
    strokeColor: existing?.strokeColor ?? getWorkspaceConnectorPalette(layout.connectorPaletteId).colors[0] ?? "#3370ff",
    lineOpacity: 36,
    waypoints: [{ x: spineStartX, y: spineY }, { x: spineEndX, y: spineY }],
  };
}
