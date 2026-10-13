import { median } from "./geometry";
import type { SemanticDiagramEdge } from "./types";

export function rankNodes(
  keys: string[],
  edges: SemanticDiagramEdge[],
): Map<string, number> {
  const outgoing = new Map(keys.map((key) => [key, [] as string[]]));
  const validEdges = edges.filter((edge) => outgoing.has(edge.from) && outgoing.has(edge.to));
  validEdges.forEach((edge) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  });

  // A retry loop is a real semantic edge, but it must not force every node in
  // the strongly connected portion onto one row. Remove DFS back-edges only
  // for ranking; routing still receives the complete original edge list.
  const visitState = new Map(keys.map((key) => [key, 0]));
  const backEdges = new Set<string>();
  const visit = (key: string): void => {
    visitState.set(key, 1);
    for (const next of outgoing.get(key) ?? []) {
      const state = visitState.get(next) ?? 0;
      if (state === 1) backEdges.add(`${key}\u0000${next}`);
      else if (state === 0) visit(next);
    }
    visitState.set(key, 2);
  };
  keys.forEach((key) => {
    if ((visitState.get(key) ?? 0) === 0) visit(key);
  });

  const rankingEdges = validEdges.filter((edge) => !backEdges.has(`${edge.from}\u0000${edge.to}`));
  const rankingOutgoing = new Map(keys.map((key) => [key, [] as string[]]));
  const incoming = new Map(keys.map((key) => [key, 0]));
  rankingEdges.forEach((edge) => {
    rankingOutgoing.set(edge.from, [...(rankingOutgoing.get(edge.from) ?? []), edge.to]);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  });

  // Kahn ranking gives the longest-path layer after the visual-only back-edge
  // removal. This preserves a readable forward chain while keeping the retry
  // edge available to the orthogonal router.
  const ranks = new Map<string, number>();
  const pendingIncoming = new Map(incoming);
  const queue = keys.filter((key) => (pendingIncoming.get(key) ?? 0) === 0);
  queue.forEach((key) => ranks.set(key, 0));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const next of rankingOutgoing.get(current) ?? []) {
      ranks.set(next, Math.max(ranks.get(next) ?? 0, (ranks.get(current) ?? 0) + 1));
      const remaining = (pendingIncoming.get(next) ?? 0) - 1;
      pendingIncoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  let cycleRank = Math.max(...ranks.values(), 0) + 1;
  keys.forEach((key) => {
    if (!ranks.has(key)) ranks.set(key, cycleRank++);
  });
  return ranks;
}

export function orderLayers(
  layers: Map<number, string[]>,
  ranks: Map<string, number>,
  edges: SemanticDiagramEdge[],
): void {
  const neighbors = new Map<string, string[]>();
  edges.forEach((edge) => {
    neighbors.set(edge.from, [...(neighbors.get(edge.from) ?? []), edge.to]);
    neighbors.set(edge.to, [...(neighbors.get(edge.to) ?? []), edge.from]);
  });

  // Barycentric sweeps are small, deterministic and effective for the usual
  // flowchart sizes. They reorder nodes inside a rank without changing any
  // semantic edge or node identity.
  const maxRank = Math.max(...layers.keys(), 0);
  const positions = new Map<string, number>();
  for (const layer of layers.values()) layer.forEach((key, index) => positions.set(key, index));
  for (let pass = 0; pass < 6; pass += 1) {
    for (const direction of [1, -1] as const) {
      const first = direction === 1 ? 0 : maxRank;
      const last = direction === 1 ? maxRank : 0;
      for (let rank = first; direction === 1 ? rank <= last : rank >= last; rank += direction) {
        const layer = layers.get(rank) ?? [];
        if (layer.length < 2) continue;
        layer.sort((a, b) => {
          const aValues = (neighbors.get(a) ?? [])
            .filter((key) => ranks.get(key) !== rank)
            .map((key) => positions.get(key) ?? 0);
          const bValues = (neighbors.get(b) ?? [])
            .filter((key) => ranks.get(key) !== rank)
            .map((key) => positions.get(key) ?? 0);
          const aMedian = median(aValues);
          const bMedian = median(bValues);
          return aMedian - bMedian || (positions.get(a)! - positions.get(b)!);
        });
        layer.forEach((key, index) => positions.set(key, index));
      }
    }
  }
}
