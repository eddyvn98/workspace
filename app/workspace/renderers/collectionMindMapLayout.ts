import type { CollectionRecord } from "../collections/model";

export interface MindMapPoint { id: string; parentId: string | null; depth: number; x: number; y: number; }
export interface MindMapLink { source: string; target: string; }
/** Stable record IDs, deterministic layout; untrusted orphan/cyclic parent links never loop. */
export function layoutMindMap(records: CollectionRecord[], limit = 200) {
  const subset = records.slice(0, limit);
  const ids = new Set(subset.map(item => item.id));
  const children = new Map<string | null, CollectionRecord[]>();
  for (const record of subset) {
    const parent = record.parentId && ids.has(record.parentId) && record.parentId !== record.id
      ? record.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), record]);
  }
  const nodes: MindMapPoint[] = [];
  const edges: MindMapLink[] = [];
  const visited = new Set<string>();
  const walk = (record: CollectionRecord, depth: number, parent: string | null) => {
    if (visited.has(record.id)) return;
    visited.add(record.id);
    nodes.push({ id: record.id, parentId: parent, depth, x: depth * 250, y: (nodes.length) * 110 });
    if (parent) edges.push({ source: parent, target: record.id });
    for (const child of children.get(record.id) ?? []) walk(child, depth + 1, record.id);
  };
  for (const root of children.get(null) ?? []) walk(root, 0, null);
  // Preserve cyclic or malformed imported records as isolated roots, not missing nodes.
  for (const record of subset) if (!visited.has(record.id)) walk(record, 0, null);
  return { nodes, edges, truncated: Math.max(0, records.length - subset.length) };
}
