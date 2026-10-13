import type { BlockStyle } from "../types/block";

export interface ActionMapLayoutOptions {
  layoutType?: string;
  layoutDirection?: "right" | "left" | "down" | "up";
  growthMode?: "one-side" | "both-side";
  connectionStyle?: "straight" | "orthogonal" | "curved" | "straight_arrow";
  connectorPaletteId?: string;
  layoutAngle?: number;
  timelineBranchMode?: "auto" | "one-side" | "one-side-reverse" | "alternate";
  timelineDescendantStyle?: "tree" | "hierarchy";
  catalogDescendantStyle?: "tree" | "hierarchy";
}

/** Shared between workspaceChatActions.ts (parsing) and
 *  workspaceChatMapLayout.ts (layout) — kept in its own file so neither one
 *  has to import the other, which would be a circular dependency. */
export interface ActionNode {
  topic: string;
  children: ActionNode[];
  description?: string;
  icon?: string;
  image?: string;
  style?: BlockStyle;
  table?: { rows: number; cols: number; cells: string[][] };
}

// Match the legacy Mindmap default node box (layoutHelpers.ts).
export const TEXT_SIZE = { w: 170, h: 36 };
export const IMAGE_SIZE = { w: 240, h: 160 };
export const TABLE_SIZE = { w: 320, h: 180 };
