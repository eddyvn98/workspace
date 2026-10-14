export const COLLECTION_PAGE_SIZES = [25, 50, 100, 250] as const;
export type CollectionPageSize = typeof COLLECTION_PAGE_SIZES[number];

/** A bounded DOM slice of the already filtered and sorted Collection records. */
export function collectionTablePage<T>(records: readonly T[], requestedPage: number,
  requestedSize: number = 50) {
  const pageSize = COLLECTION_PAGE_SIZES.includes(requestedSize as CollectionPageSize)
    ? requestedSize as CollectionPageSize : 50;
  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const index = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0;
  const pageIndex = Math.min(pageCount - 1, Math.max(0, index));
  const start = pageIndex * pageSize;
  const end = Math.min(start + pageSize, total);
  return { pageSize, pageCount, pageIndex, total, start, end,
    rows: records.slice(start, end) };
}
