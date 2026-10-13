import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId, CanvasBlock, MapLayoutSettings } from "../types/block";
import { computeDecisionBranchLabels } from "./flowchartSemantics";

/**
 * Fills in Yes/No on a flowchart decision's two exits.
 *
 * A diamond with two unlabelled exits does not say which way is which, so the
 * reference tool labels them — and colours them, the affirmative green and the
 * negative red, which is what lets a reader tell them apart without reading
 * either word. Only an EMPTY label is filled, so wording the user chose
 * ("Rejected", "Needs review") survives every relayout, and an existing colour
 * is never overwritten either.
 */
export function applyDecisionBranchLabels(
  family: MapLayoutSettings["family"],
  rootId: BlockId,
  blocks: Record<BlockId, CanvasBlock>,
  childrenByParent: Map<BlockId, BlockId[]>,
): void {
  if (family !== "flowchart") return;

  const connectorList = Object.values(useWorkspaceStore.getState().connectors);
  const labels = computeDecisionBranchLabels(rootId, blocks, childrenByParent, connectorList);
  if (labels.length === 0) return;

  useWorkspaceStore.setState((current) => {
    if (current.isReadOnly) return current;
    const connectors = { ...current.connectors };
    for (const patch of labels) {
      const existing = connectors[patch.connectorId];
      if (!existing) continue;
      connectors[patch.connectorId] = {
        ...existing,
        label: patch.label,
        labelColor: existing.labelColor ?? patch.labelColor,
      };
    }
    return { connectors };
  });
}
