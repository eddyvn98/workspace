/**
 * lib/workspace/canvas-graph.ts
 *
 * The structural half of canvas search: given a few "seed" blocks, walk the
 * board's own connections (tree parentId + connector lines) outward and
 * return the neighbourhood, not just the seeds themselves. Workspace twin of
 * lib/mindmap/canvas-graph.ts.
 *
 * One dimension simpler than the mindmap version on purpose: a mindmap query
 * can span several maps a person owns, so that graph is keyed by
 * `mindmapId:nodeId`. A workspace board's chat only ever asks about the one
 * board it is open on (see fetchWorkspaceKnowledgeContext), so this graph is
 * keyed by blockId alone — no map dimension to carry through every function.
 */

export type GraphBlockRow = {
  id: string;
  parentId: string | null;
  topic: string;
  description: string | null;
};

export type GraphConnectorRow = {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  label?: string;
};

export type GraphSeed = {
  blockId: string;
  score: number;
  content: string;
  reason?: "match" | "overview";
};

type GraphNode = {
  blockId: string;
  topic: string;
  description: string | null;
  path: string[];
  pathBlockIds: string[];
  reason: "match" | "ancestor" | "neighbor" | "overview";
  score?: number;
};

export type CanvasGraphContext = {
  matches: Array<GraphNode & { score: number }>;
  nodes: GraphNode[];
  edges: Array<{
    fromBlockId: string;
    toBlockId: string;
    kind: "parent-child" | "relationship";
    label?: string;
  }>;
  truncated: boolean;
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? Number(value) : fallback));
}

export function buildCanvasGraphContext(input: {
  blocks: GraphBlockRow[];
  connectors: GraphConnectorRow[];
  seeds: GraphSeed[];
  maxHops?: number;
  maxNodes?: number;
}): CanvasGraphContext {
  const maxHops = clamp(input.maxHops, 0, 3, 2);
  const maxNodes = clamp(input.maxNodes, 16, 120, 80);
  const byId = new Map(input.blocks.map((block) => [block.id, block]));
  const neighbors = new Map<string, Set<string>>();
  const addNeighbor = (a: string, b: string) => {
    const list = neighbors.get(a) ?? new Set<string>();
    list.add(b);
    neighbors.set(a, list);
  };

  for (const block of input.blocks) {
    if (block.parentId && byId.has(block.parentId)) {
      addNeighbor(block.id, block.parentId);
      addNeighbor(block.parentId, block.id);
    }
  }
  for (const connector of input.connectors) {
    if (byId.has(connector.fromBlockId) && byId.has(connector.toBlockId)) {
      addNeighbor(connector.fromBlockId, connector.toBlockId);
      addNeighbor(connector.toBlockId, connector.fromBlockId);
    }
  }

  const included = new Map<string, { reason: GraphNode["reason"]; score?: number }>();
  let truncated = false;
  const include = (blockId: string, reason: GraphNode["reason"], score?: number) => {
    if (!byId.has(blockId)) return;
    const current = included.get(blockId);
    if (!current && included.size >= maxNodes) {
      truncated = true;
      return;
    }
    if (!current || (score ?? 0) > (current.score ?? 0)) included.set(blockId, { reason, score });
  };

  for (const seed of input.seeds) {
    include(seed.blockId, seed.reason ?? "match", seed.score);

    let cursor = byId.get(seed.blockId);
    while (cursor?.parentId) {
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      include(parent.id, "ancestor");
      cursor = parent;
    }

    const queue: Array<{ blockId: string; depth: number }> = [{ blockId: seed.blockId, depth: 0 }];
    const seen = new Set([seed.blockId]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.depth >= maxHops) continue;
      for (const next of neighbors.get(current.blockId) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push({ blockId: next, depth: current.depth + 1 });
        }
        include(next, "neighbor");
      }
    }
  }

  const pathFor = (block: GraphBlockRow): { topics: string[]; ids: string[] } => {
    const topics: string[] = [];
    const ids: string[] = [];
    let cursor: GraphBlockRow | undefined = block;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      topics.unshift(cursor.topic);
      ids.unshift(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return { topics, ids };
  };

  const nodes = [...included.entries()].map(([blockId, meta]) => {
    const block = byId.get(blockId)!;
    const path = pathFor(block);
    return {
      blockId: block.id,
      topic: block.topic,
      description: block.description,
      path: path.topics,
      pathBlockIds: path.ids,
      reason: meta.reason,
      ...(meta.score === undefined ? {} : { score: meta.score }),
    };
  });

  const includedIds = new Set(included.keys());
  const edges: CanvasGraphContext["edges"] = [];
  const edgeKeys = new Set<string>();
  for (const block of input.blocks) {
    if (block.parentId) {
      const edgeKey = `${block.parentId}:${block.id}:parent-child`;
      if (includedIds.has(block.id) && includedIds.has(block.parentId) && !edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({ fromBlockId: block.parentId, toBlockId: block.id, kind: "parent-child" });
      }
    }
  }
  for (const connector of input.connectors) {
    const edgeKey = `${connector.fromBlockId}:${connector.toBlockId}:${connector.id}`;
    if (includedIds.has(connector.fromBlockId) && includedIds.has(connector.toBlockId) && !edgeKeys.has(edgeKey)) {
      edgeKeys.add(edgeKey);
      edges.push({
        fromBlockId: connector.fromBlockId,
        toBlockId: connector.toBlockId,
        kind: "relationship",
        ...(connector.label ? { label: connector.label } : {}),
      });
    }
  }

  const matches = input.seeds
    .filter((seed) => seed.reason !== "overview")
    .flatMap((seed) => {
      const match = nodes.find((node) => node.blockId === seed.blockId);
      return match ? [{ ...match, score: seed.score }] : [];
    });

  return { matches, nodes, edges, truncated };
}
