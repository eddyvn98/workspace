import type { CollectionRecord } from "../collections/model";

/** Keep the selected editor record on the rendered page after paging/filtering. */
export function visibleMindMapSelection(
  records: readonly CollectionRecord[], selectedId: string | null, page: number, size = 200,
): CollectionRecord | undefined {
  const first = Math.max(0, page) * size;
  const subset = records.slice(first, first + size);
  return subset.find(record => record.id === selectedId) ?? subset[0];
}
