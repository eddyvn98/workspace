import type { TreeDirection, TreeGrowthMode } from "../layout/treeLayout";
import type { TreeLayoutFamily } from "../layout/treeviewLayout";

/** Raw, not-yet-validated tree-layout fields as they arrive from a save
 *  payload, localStorage snapshot, or a remote/public board fetch. */
export interface RawTreeLayoutFields {
  treeLayoutDirection?: unknown;
  treeGrowthMode?: unknown;
  treeLayoutFamily?: unknown;
  treeTimelineBranchMode?: unknown;
  treeTimelineDescendantStyle?: unknown;
  treeCatalogDescendantStyle?: unknown;
}

export interface NormalizedTreeLayoutFields {
  treeLayoutDirection: TreeDirection;
  treeGrowthMode: TreeGrowthMode;
  treeLayoutFamily: TreeLayoutFamily;
  treeTimelineBranchMode: "auto" | "one-side" | "one-side-reverse" | "alternate";
  treeTimelineDescendantStyle: "tree" | "hierarchy";
  treeCatalogDescendantStyle: "tree" | "hierarchy";
}

/**
 * Single source of truth for "what does an unset/corrupt tree-layout field
 * fall back to" — every place that hydrates the store from a persisted
 * source (private board load, public share-link view) must agree, or a
 * board silently renders with different layout defaults depending on which
 * path loaded it.
 */
export function normalizeTreeLayoutFields(raw: RawTreeLayoutFields): NormalizedTreeLayoutFields {
  return {
    treeLayoutDirection: (["right", "left", "down", "up"] as const).includes(
      raw.treeLayoutDirection as TreeDirection,
    )
      ? (raw.treeLayoutDirection as TreeDirection)
      : "right",
    treeGrowthMode: (["one-side", "both-side"] as const).includes(
      raw.treeGrowthMode as TreeGrowthMode,
    )
      ? (raw.treeGrowthMode as TreeGrowthMode)
      : "one-side",
    treeLayoutFamily: (["hierarchy", "treeview", "orgchart", "timeline", "fishbone"] as readonly TreeLayoutFamily[]).includes(
      raw.treeLayoutFamily as TreeLayoutFamily,
    )
      ? (raw.treeLayoutFamily as TreeLayoutFamily)
      : "hierarchy",
    treeTimelineBranchMode: (["auto", "one-side", "one-side-reverse", "alternate"] as const).includes(
      raw.treeTimelineBranchMode as "auto" | "one-side" | "one-side-reverse" | "alternate",
    )
      ? (raw.treeTimelineBranchMode as "auto" | "one-side" | "one-side-reverse" | "alternate")
      : "auto",
    treeTimelineDescendantStyle: (["tree", "hierarchy"] as const).includes(
      raw.treeTimelineDescendantStyle as "tree" | "hierarchy",
    )
      ? (raw.treeTimelineDescendantStyle as "tree" | "hierarchy")
      : "tree",
    treeCatalogDescendantStyle: (["tree", "hierarchy"] as const).includes(
      raw.treeCatalogDescendantStyle as "tree" | "hierarchy",
    )
      ? (raw.treeCatalogDescendantStyle as "tree" | "hierarchy")
      : "tree",
  };
}
