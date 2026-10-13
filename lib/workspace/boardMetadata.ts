export const BOARD_METADATA_KEYS = [
  "frames",
  "treeLayoutDirection",
  "treeGrowthMode",
  "treeLayoutFamily",
  "treeTimelineBranchMode",
  "treeTimelineDescendantStyle",
  "treeCatalogDescendantStyle",
] as const;
export type BoardMetadata = Partial<Record<typeof BOARD_METADATA_KEYS[number], unknown>>;

export function boardMetadata<T extends object>(value: T): Pick<T, Extract<typeof BOARD_METADATA_KEYS[number], keyof T>> {
  const source = value as Record<string, unknown>;
  return Object.fromEntries(BOARD_METADATA_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])) as Pick<T, Extract<typeof BOARD_METADATA_KEYS[number], keyof T>>;
}
