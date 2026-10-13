import type { MapLayoutSettings } from "../types/block";
import type { ActionMapLayoutOptions } from "./workspaceChatActionTypes";
import { normalizeWorkspaceMapLayoutType } from "./workspaceMapLayoutContract";

const PALETTES = new Set(["default", "pastel", "minimal", "monochrome", "vibrant"]);

const FAMILY_BY_LAYOUT: Record<string, MapLayoutSettings["family"]> = {
  "logical-right": "hierarchy",
  "logical-left": "hierarchy",
  mindmap: "hierarchy",
  "mindmap-vertical": "hierarchy",
  "org-chart": "orgchart",
  catalog: "treeview",
  treeview: "treeview",
  outline: "treeview",
  timeline: "timeline",
  "vertical-timeline": "timeline",
  fishbone: "fishbone",
};

export const STRUCTURED_MAP_LAYOUT_TYPES = Object.freeze(Object.keys(FAMILY_BY_LAYOUT));

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeCreateMapOptions(raw: Record<string, unknown>): ActionMapLayoutOptions {
  const params = record(raw.params);
  const source = { ...params, ...raw };
  const layoutType = normalizeWorkspaceMapLayoutType(stringValue(source.layoutType ?? source.mapType));
  const direction = stringValue(source.layoutDirection);
  const growthMode = stringValue(source.growthMode);
  const connectionStyle = stringValue(source.connectionStyle ?? source.connectorLineType);
  const palette = stringValue(source.connectorPaletteId ?? source.stylePresetId);
  const timelineBranchMode = stringValue(source.timelineBranchMode);
  const timelineDescendantStyle = stringValue(source.timelineDescendantStyle);
  const catalogDescendantStyle = stringValue(source.catalogDescendantStyle);
  const angle = Number(source.layoutAngle);

  return {
    ...(layoutType && STRUCTURED_MAP_LAYOUT_TYPES.includes(layoutType) ? { layoutType } : {}),
    ...(direction && ["right", "left", "down", "up"].includes(direction) ? { layoutDirection: direction as ActionMapLayoutOptions["layoutDirection"] } : {}),
    ...(growthMode && ["one-side", "both-side"].includes(growthMode) ? { growthMode: growthMode as ActionMapLayoutOptions["growthMode"] } : {}),
    ...(connectionStyle && ["straight", "orthogonal", "curved", "straight_arrow"].includes(connectionStyle) ? { connectionStyle: connectionStyle as ActionMapLayoutOptions["connectionStyle"] } : {}),
    ...(palette && PALETTES.has(palette) ? { connectorPaletteId: palette } : {}),
    ...(Number.isFinite(angle) && angle >= -180 && angle <= 180 ? { layoutAngle: angle } : {}),
    ...(timelineBranchMode && ["auto", "one-side", "one-side-reverse", "alternate"].includes(timelineBranchMode) ? { timelineBranchMode: timelineBranchMode as ActionMapLayoutOptions["timelineBranchMode"] } : {}),
    ...(timelineDescendantStyle && ["tree", "hierarchy"].includes(timelineDescendantStyle) ? { timelineDescendantStyle: timelineDescendantStyle as ActionMapLayoutOptions["timelineDescendantStyle"] } : {}),
    ...(catalogDescendantStyle && ["tree", "hierarchy"].includes(catalogDescendantStyle) ? { catalogDescendantStyle: catalogDescendantStyle as ActionMapLayoutOptions["catalogDescendantStyle"] } : {}),
  };
}

export function mapLayoutPatchForCreate(options: ActionMapLayoutOptions): Partial<MapLayoutSettings> {
  const layoutType = options.layoutType ?? "logical-right";
  const family = FAMILY_BY_LAYOUT[layoutType] ?? "hierarchy";
  const patch: Partial<MapLayoutSettings> = { family };

  if (layoutType === "logical-left") patch.direction = "left";
  else if (layoutType === "mindmap-vertical" || layoutType === "vertical-timeline") patch.direction = "down";
  else if (layoutType === "org-chart") patch.direction = "down";
  else if (layoutType === "mindmap") patch.growthMode = "both-side";
  else patch.direction = "right";

  if (options.layoutDirection) patch.direction = options.layoutDirection as MapLayoutSettings["direction"];
  if (options.growthMode) patch.growthMode = options.growthMode as MapLayoutSettings["growthMode"];
  if (family === "hierarchy" && options.connectionStyle) {
    patch.connectorLineType = options.connectionStyle === "straight_arrow"
      ? "straight"
      : options.connectionStyle as MapLayoutSettings["connectorLineType"];
  }
  if (options.connectorPaletteId) {
    patch.connectorPaletteId = options.connectorPaletteId;
    patch.stylePresetId = options.connectorPaletteId;
  }
  if (options.layoutAngle !== undefined) patch.layoutAngle = options.layoutAngle;
  if (options.timelineBranchMode) patch.timelineBranchMode = options.timelineBranchMode as MapLayoutSettings["timelineBranchMode"];
  if (options.timelineDescendantStyle) patch.timelineDescendantStyle = options.timelineDescendantStyle as MapLayoutSettings["timelineDescendantStyle"];
  if (options.catalogDescendantStyle) patch.catalogDescendantStyle = options.catalogDescendantStyle as MapLayoutSettings["catalogDescendantStyle"];
  return patch;
}

export function isStructuredCreateMapType(value: unknown): boolean {
  const layoutType = stringValue(value);
  return !layoutType || STRUCTURED_MAP_LAYOUT_TYPES.includes(layoutType);
}
