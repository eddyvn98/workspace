import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { getWorkspaceConnectorPalette } from "./connectorStyle";
import type { ConnectorAuxiliaryPath, StyledConnectorAuxiliaryPath } from "./connectorAuxiliaryPathTypes";

type AuxiliaryKind = "fishbone" | "timeline";

function blockDepth(blocks: Record<string, CanvasBlock>, blockId: string): number {
  let depth = 0;
  let current = blocks[blockId];
  while (current?.parentId && depth < 1000) {
    depth += 1;
    current = blocks[current.parentId];
  }
  return depth;
}

export function styleWorkspaceAuxiliaryPath(
  entry: ConnectorAuxiliaryPath,
  kind: AuxiliaryKind,
  blocks: Record<string, CanvasBlock>,
  connectors: CanvasConnector[],
  resolveLayout: (blockId: string) => { connectorPaletteId: string },
): StyledConnectorAuxiliaryPath {
  const layout = resolveLayout(entry.parentId);
  const fallback = getWorkspaceConnectorPalette(layout.connectorPaletteId).colors[0] ?? "#3370ff";
  const color = kind === "fishbone"
    ? connectors.find((connector) => connector.fromBlockId === entry.parentId)?.strokeColor ?? fallback
    : connectors.find((connector) => connector.toBlockId === entry.parentId)?.strokeColor ?? fallback;
  const opacity = kind === "fishbone"
    ? Math.max(58, 96 - (blockDepth(blocks, entry.parentId) + 1) * 7) / 100
    : 0.85;
  return { ...entry, color, opacity };
}
