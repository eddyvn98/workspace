import type { SemanticDiagramEdge } from "./types";

export function isPositiveEdgeLabel(label: string | undefined): boolean {
  return /^(yes|y|có|co|đúng|dung|valid|success|ok|done|approved)$/i.test(label?.trim() ?? "");
}

export function isNegativeEdgeLabel(label: string | undefined): boolean {
  return /^(no|n|không|khong|sai|invalid|error|retry|fail|failed)$/i.test(label?.trim() ?? "")
    || /(otp\s*(sai|invalid)|nhập lại|nhap lai)/i.test(label?.trim() ?? "");
}

/** Picks the visually primary path for a left-to-right flow. The graph may
 * have several valid paths, but the positive/valid-labelled branch is the one
 * users expect to read as the straight-through flow. Other branches are then
 * placed above or below it instead of shifting the main path between rows. */
export function preferredRightwardBackbone(
  keys: string[],
  edges: SemanticDiagramEdge[],
  ranks: Map<string, number>,
  labels: Map<string, string>,
): Set<string> {
  const outgoing = new Map<string, SemanticDiagramEdge[]>();
  edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]));
  const start = keys.find((key) => /(^|[-_\s])(start|begin|bắt đầu|bat dau)([-_\s]|$)/i.test(labels.get(key) ?? "") || /(^|[-_\s])(start|begin)([-_\s]|$)/i.test(key))
    ?? keys.find((key) => (ranks.get(key) ?? 0) === 0)
    ?? keys[0];
  const path = new Set<string>();
  const visited = new Set<string>();
  let current = start;
  while (current && !visited.has(current)) {
    visited.add(current);
    path.add(current);
    const candidates = (outgoing.get(current) ?? []).filter((edge) => (ranks.get(edge.to) ?? 0) > (ranks.get(edge.from) ?? 0));
    if (candidates.length === 0) break;
    candidates.sort((a, b) => {
      const score = (edge: SemanticDiagramEdge): number => {
        const label = edge.label ?? "";
        const targetLabel = labels.get(edge.to) ?? "";
        const targetTerminal = !outgoing.has(edge.to) || /(^|[-_\s])(end|finish|kết thúc|ket thuc)([-_\s]|$)/i.test(labels.get(edge.to) ?? "") || /(^|[-_\s])(end|finish)([-_\s]|$)/i.test(edge.to);
        return (isPositiveEdgeLabel(label) ? 100 : isNegativeEdgeLabel(label) ? -100 : 0)
          + (targetTerminal ? 20 : 0)
          + (/check|decision|condition|kiểm tra|kiem tra/i.test(targetLabel) ? 30 : 0)
          + ((ranks.get(edge.to) ?? 0) - (ranks.get(edge.from) ?? 0) === 1 ? 5 : 0);
      };
      return score(b) - score(a);
    });
    current = candidates[0].to;
  }
  return path;
}

export type BranchLane = { side: "above" | "below"; index: number };

/** Assigns every non-backbone node to the lane of the branch that introduced
 * it. Keeping a branch on one horizontal lane is much easier to read than
 * alternating its nodes above/below the backbone at each rank, especially for
 * retry loops that eventually return to an earlier step. */
export function assignRightwardBranchLanes(
  keys: string[],
  edges: SemanticDiagramEdge[],
  ranks: Map<string, number>,
  labels: Map<string, string>,
  backbone: Set<string>,
): Map<string, BranchLane> {
  const incoming = new Map<string, SemanticDiagramEdge[]>();
  edges.forEach((edge) => incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]));
  const laneKeyByNode = new Map<string, string>();
  const laneSeed = new Map<string, { source: string; target: string; edge: SemanticDiagramEdge }>();
  const laneRankOccupancy = new Map<string, Set<number>>();

  // A node's lane must come from its true structural (same-track) parent,
  // not from whichever predecessor a graph walk happens to reach it through
  // first. Ranks are longest-path distances in this DAG, so every edge's
  // source has a strictly smaller rank than its target; processing nodes in
  // ascending rank order therefore guarantees every predecessor is already
  // resolved once its turn comes. Among a node's incoming edges, the
  // predecessor with the *highest* rank is always its nearest (one-hop, same-
  // track) parent, so a farther cross-track dependency edge (whose source sits
  // at an earlier rank) can never outrank — and therefore never steal — the
  // node from its own track's lane.
  [...keys]
    .filter((key) => !backbone.has(key))
    .sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0))
    .forEach((node) => {
      const incomingEdges = (incoming.get(node) ?? []).filter((edge) => edge.from !== node);
      if (incomingEdges.length === 0) return;
      const fromAssigned = incomingEdges
        .filter((edge) => laneKeyByNode.has(edge.from))
        .sort((a, b) => (ranks.get(b.from) ?? 0) - (ranks.get(a.from) ?? 0));
      const fromBackbone = incomingEdges.filter((edge) => backbone.has(edge.from));

      let laneKey: string | undefined;
      if (fromAssigned.length > 0) {
        laneKey = laneKeyByNode.get(fromAssigned[0].from)!;
      } else if (fromBackbone.length > 0) {
        const seedEdge = fromBackbone[0];
        laneKey = `${seedEdge.from}\u0000${seedEdge.label ?? ""}\u0000${node}`;
        laneSeed.set(laneKey, { source: seedEdge.from, target: node, edge: seedEdge });
      } else {
        // Every incoming edge originates from a node that itself has no lane
        // yet (and isn't the backbone) — nothing to inherit from this pass;
        // it falls back to the isolated-node handling below.
        return;
      }

      const rank = ranks.get(node) ?? 0;
      const occupied = laneRankOccupancy.get(laneKey) ?? new Set<number>();
      if (occupied.has(rank)) {
        // A sibling already claimed this rank in this lane (e.g. `Nhập lại
        // OTP` and `Gửi lại OTP` from the same parent). Give this node its
        // own lane instead of stacking it on the same row.
        const splitKey = `${laneKey}\u0000split\u0000${node}`;
        if (!laneSeed.has(splitKey)) laneSeed.set(splitKey, laneSeed.get(laneKey)!);
        laneKey = splitKey;
      }
      const laneOccupied = laneRankOccupancy.get(laneKey) ?? new Set<number>();
      laneOccupied.add(rank);
      laneRankOccupancy.set(laneKey, laneOccupied);
      laneKeyByNode.set(node, laneKey);
    });

  const above = new Map<string, number>();
  const below = new Map<string, number>();
  const laneByKey = new Map<string, BranchLane>();
  [...laneSeed.keys()].forEach((key) => {
    const seed = laneSeed.get(key)!;
    const sourceLabel = labels.get(seed.source) ?? "";
    const targetLabel = labels.get(seed.target) ?? "";
    // OTP verification/retry branches naturally belong below the main path;
    // other side branches use the upper lanes. This keeps the common login
    // path centred while avoiding a loop crossing through it.
    const side: BranchLane["side"] = /otp|xác thực|xac thuc|verification|authentication/i.test(`${sourceLabel} ${targetLabel}`)
      ? "below"
      : "above";
    const counters = side === "above" ? above : below;
    const index = (counters.get(side) ?? 0) + 1;
    counters.set(side, index);
    laneByKey.set(key, { side, index });
  });

  // Any isolated non-backbone node gets its own upper lane rather than being
  // placed on top of another branch.
  keys.filter((key) => !backbone.has(key) && !laneKeyByNode.has(key)).forEach((key) => {
    const index = (above.get("above") ?? 0) + 1;
    above.set("above", index);
    const laneKey = `isolated\u0000${key}`;
    laneKeyByNode.set(key, laneKey);
    laneByKey.set(laneKey, { side: "above", index });
  });
  const laneByNode = new Map<string, BranchLane>();
  laneKeyByNode.forEach((laneKey, node) => {
    const lane = laneByKey.get(laneKey) ?? laneByKey.get([...laneByKey.keys()].find((key) => laneKey.startsWith(`${key}\u0000`)) ?? "");
    if (lane) laneByNode.set(node, lane);
  });
  return laneByNode;
}
