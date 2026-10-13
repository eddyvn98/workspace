import { computeStructuralConnectorPatch } from "@/app/workspace/layout/reflowConnectorSides";
import type { MapLayoutSettings } from "@/app/workspace/types/block";
import type { AgentBoardState } from "./operationsCore";

/** Pins each parent->child connector to the sides the editor's own reflow would
 * use (e.g. a left-hand child links to its parent's left edge and its own right
 * edge). Without this, connectors saved by the server are drawn by guesswork and
 * the mirrored half of a two-sided map points at the wrong edges. */
export function applyStructuralConnectorSides(
  state: AgentBoardState,
  createdIds: Set<string>,
  layout: MapLayoutSettings,
  positions: Map<string, { x: number; y: number }>,
): void {
  const blocks = state.blocks as Record<string, { parentId?: string | null } | undefined>;
  Object.values(state.connectors).forEach((connector) => {
    const from = String(connector.fromBlockId ?? "");
    const to = String(connector.toBlockId ?? "");
    if (!createdIds.has(from) || !createdIds.has(to) || state.blocks[to]?.parentId !== from) return;
    if (Array.isArray(connector.waypoints) && connector.waypoints.length > 0) return;
    const patch = computeStructuralConnectorPatch({ id: String(connector.id), fromBlockId: from, toBlockId: to }, layout, blocks, positions);
    if (patch.fromSide) connector.fromSide = patch.fromSide; else delete connector.fromSide;
    if (patch.toSide) connector.toSide = patch.toSide; else delete connector.toSide;
  });
}
