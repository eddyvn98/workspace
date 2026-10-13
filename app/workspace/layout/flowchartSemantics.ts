/**
 * Flowchart node semantics — the part that makes a flowchart a flowchart
 * rather than a tree with boxes.
 *
 * Two things a reference flowchart tool (Larksuite, Visio, draw.io) does that
 * a plain node tree does not:
 *  1. A node's SHAPE carries meaning: a pill is where the process starts or
 *     ends, a rectangle is a step, a diamond is a decision, a parallelogram is
 *     input/output, a cylinder is stored data.
 *  2. The branches leaving a decision are LABELLED — "Yes" / "No" — because a
 *     diamond with two unlabelled exits does not say which is which.
 *
 * This module owns both, so the layout engine stays pure geometry and the
 * store stays free of flowchart-specific rules.
 */

import type { BlockId, CanvasBlock, ShapeKind } from "../types/block";

/** The roles a flowchart node can play, in the standard vocabulary. */
export type FlowchartRole =
  | "terminator"
  | "process"
  | "decision"
  | "data"
  | "storage"
  | "preparation";

/** Role -> shape. Every one of these shapes already exists in the engine's
 *  shape set (see WorkspaceNodeStylePopover's SHAPES). */
export const FLOWCHART_ROLE_SHAPE: Record<FlowchartRole, ShapeKind> = {
  terminator: "pill",
  process: "rounded_rect",
  decision: "diamond",
  data: "parallelogram",
  storage: "cylinder",
  preparation: "hexagon",
};

export const FLOWCHART_ROLE_LABELS: Record<FlowchartRole, string> = {
  terminator: "Start / End",
  process: "Process",
  decision: "Decision",
  data: "Input / Output",
  storage: "Data store",
  preparation: "Preparation",
};

/** Default branch labels for a two-way decision, in child order. */
export const DECISION_BRANCH_LABELS = ["Yes", "No"] as const;

/** ...and their colours. The reference tool writes the affirmative branch in
 *  green and the negative one in red, which is what lets a reader tell the two
 *  exits apart at a glance without reading either word. Drawing both in the
 *  connector's own colour loses that. */
export const DECISION_BRANCH_LABEL_COLORS = ["#16a34a", "#dc2626"] as const;

/** The role a block is currently playing, read back from its shape. */
export function roleOfBlock(block: CanvasBlock | undefined): FlowchartRole | null {
  if (!block) return null;
  const kind = shapeKindOf(block);
  if (!kind) return null;
  const found = (Object.entries(FLOWCHART_ROLE_SHAPE) as Array<[FlowchartRole, ShapeKind]>)
    .find(([, shape]) => shape === kind);
  return found ? found[0] : null;
}

function shapeKindOf(block: CanvasBlock): ShapeKind | undefined {
  if (block.type === "shape") {
    return (block.data as { shapeKind?: ShapeKind })?.shapeKind;
  }
  return block.style?.shapeKind;
}

/**
 * Whether this block should be treated as a decision.
 *
 * An explicit diamond always counts. Beyond that a node with two or more
 * children IS a fork in the process, whether or not anyone picked the shape —
 * so it gets decision treatment too. That keeps a flowchart readable when the
 * nodes came from AI or an import that only produced text.
 */
export function isDecisionBlock(
  block: CanvasBlock | undefined,
  childCount: number,
): boolean {
  if (!block) return false;
  if (roleOfBlock(block) === "decision") return true;
  return childCount >= 2;
}

/**
 * The role a node in a flowchart should take when nobody has chosen one.
 *
 * Derived from its position in the flow, which is the same reasoning a person
 * applies by hand: the first node and the dead ends are terminators, a fork is
 * a decision, everything in between is a step.
 */
export function inferFlowchartRole(
  blockId: BlockId,
  rootId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
): FlowchartRole {
  const childCount = (childrenByParent.get(blockId) ?? []).length;
  if (blockId === rootId) return "terminator";
  if (childCount === 0) return "terminator";
  if (childCount >= 2) return "decision";
  return "process";
}

export interface DecisionBranchLabel {
  connectorId: string;
  label: string;
  labelColor: string;
}

/**
 * Labels to apply to the connectors leaving each decision.
 *
 * Only fills a label that is still empty — a label the user wrote ("Rejected",
 * "Needs review") must survive a relayout, so this never overwrites one. Only
 * two-way decisions get Yes/No; a three-way fork has no conventional default,
 * so those are left to the user.
 */
export function computeDecisionBranchLabels(
  rootId: BlockId,
  blocks: Record<BlockId, CanvasBlock>,
  childrenByParent: Map<BlockId, BlockId[]>,
  connectors: Array<{ id: string; fromBlockId: BlockId; toBlockId: BlockId; label?: string }>,
): DecisionBranchLabel[] {
  const out: DecisionBranchLabel[] = [];
  const seen = new Set<BlockId>([rootId]);
  const queue: BlockId[] = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift() as BlockId;
    const children = childrenByParent.get(currentId) ?? [];

    if (children.length === 2 && isDecisionBlock(blocks[currentId], children.length)) {
      children.forEach((childId, index) => {
        const connector = connectors.find(
          (candidate) => candidate.fromBlockId === currentId && candidate.toBlockId === childId,
        );
        if (!connector) return;
        if (connector.label && connector.label.trim()) return;
        out.push({
          connectorId: connector.id,
          label: DECISION_BRANCH_LABELS[index],
          labelColor: DECISION_BRANCH_LABEL_COLORS[index],
        });
      });
    }

    for (const childId of children) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      queue.push(childId);
    }
  }

  return out;
}
