import type { WorkspaceStore } from "../store/useWorkspaceStore";
import { currentMapLayout } from "../layout/mapRoot";
import { resolveShapeConnectorLineType } from "./connectorStyle";

export function resolveConnectorCreationLineType(state: WorkspaceStore, blockId: string) {
  if (state.activeConnectorTool) return state.activeConnectorTool.lineType;
  const fallback = currentMapLayout(state, blockId).connectorLineType;
  const block = state.blocks[blockId];
  return block && !block.parentId && !block.mapLayout
    ? resolveShapeConnectorLineType(state.connectors, blockId, fallback)
    : fallback;
}
