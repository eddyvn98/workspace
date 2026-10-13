import type { MapLayoutSettings } from "@/app/workspace/types/block";

export type WorkspaceMapLayoutFamily = MapLayoutSettings["family"];
export type WorkspaceMapLayoutDirection = MapLayoutSettings["direction"];
export type WorkspaceMapLayoutGrowthMode = MapLayoutSettings["growthMode"];
export type WorkspaceMapLayoutLineType = MapLayoutSettings["connectorLineType"];
export type WorkspaceMapLayoutPatch = Partial<MapLayoutSettings>;
export type WorkspaceMapLayoutCreateKind =
  | "logical-right"
  | "catalog"
  | "timeline"
  | "fishbone"
  | "flowchart"
  | "swimlane-horizontal"
  | "swimlane-vertical";

export interface WorkspaceMapLayoutStructureOption {
  id: WorkspaceMapLayoutCreateKind;
  family: WorkspaceMapLayoutFamily;
  label: string;
}

export interface WorkspaceMapLayoutDirectionOption {
  id: WorkspaceMapLayoutDirection;
  angle: number;
  label: string;
}

export interface WorkspaceMapLayoutLineOption {
  id: WorkspaceMapLayoutLineType;
  label: string;
}

export const STRUCTURES: readonly WorkspaceMapLayoutStructureOption[] = [
  { id: "logical-right", family: "hierarchy", label: "Hierarchy" },
  { id: "catalog", family: "treeview", label: "Treeview" },
  { id: "timeline", family: "timeline", label: "Timeline" },
  { id: "fishbone", family: "fishbone", label: "Fishbone" },
  { id: "flowchart", family: "flowchart", label: "Flowchart" },
  // Both keep family "swimlane" (same icon, same direction control) - only
  // the create-kind id differs, matching Lark's two separate templates.
  { id: "swimlane-horizontal", family: "swimlane", label: "Swimlane (Horizontal)" },
  { id: "swimlane-vertical", family: "swimlane", label: "Swimlane (Vertical)" },
];

export const DIRECTIONS: readonly WorkspaceMapLayoutDirectionOption[] = [
  { id: "right", angle: 0, label: "Right" },
  { id: "left", angle: 180, label: "Left" },
  { id: "down", angle: 90, label: "Down" },
  { id: "up", angle: -90, label: "Up" },
];

export const LINE_STYLES: readonly WorkspaceMapLayoutLineOption[] = [
  { id: "curved", label: "Curved" },
  { id: "orthogonal", label: "Elbow" },
  { id: "straight", label: "Straight" },
];

export function displayFamily(family: WorkspaceMapLayoutFamily): WorkspaceMapLayoutFamily {
  return family === "orgchart" ? "hierarchy" : family;
}

export function supportsMapDirection(family: WorkspaceMapLayoutFamily): boolean {
  const shown = displayFamily(family);
  return shown === "hierarchy"
    || shown === "treeview"
    || shown === "timeline"
    // Flowchart runs top-down (Larksuite's default) or left-to-right, and
    // swimlane reads the same control to choose horizontal bands vs vertical
    // lane columns.
    || shown === "flowchart"
    || shown === "swimlane";
}

export function supportsMapLineStyle(family: WorkspaceMapLayoutFamily): boolean {
  // Connector selection is a Hierarchy-only option. Other renderers have
  // geometry-specific routing that must remain stable for their semantics.
  return family === "hierarchy";
}

export function defaultMapDirection(family: WorkspaceMapLayoutFamily): WorkspaceMapLayoutDirection | undefined {
  if (!supportsMapDirection(family)) return undefined;
  // A flowchart reads top-down by convention; everything else starts to the
  // right, which is where the old panel's canonical orientation was.
  return displayFamily(family) === "flowchart" ? "down" : "right";
}

/**
 * A family switch in the old panel selects the canonical one-side hierarchy
 * unless the user explicitly chooses both-side in the same interaction.
 */
export function growthModeForFamilySwitch(
  previousFamily: WorkspaceMapLayoutFamily,
  nextFamily: WorkspaceMapLayoutFamily,
  current: WorkspaceMapLayoutGrowthMode,
  requested?: WorkspaceMapLayoutGrowthMode,
): WorkspaceMapLayoutGrowthMode {
  if (requested) return requested;
  if (displayFamily(previousFamily) !== displayFamily(nextFamily) && displayFamily(nextFamily) === "hierarchy") {
    return "one-side";
  }
  return current;
}

export function directionOptions(
  family: WorkspaceMapLayoutFamily,
  growthMode: WorkspaceMapLayoutGrowthMode,
): readonly WorkspaceMapLayoutDirectionOption[] {
  const normalizedFamily = displayFamily(family);
  if (normalizedFamily === "treeview") {
    return [
      { id: "right", angle: 0, label: "Down · Left" },
      { id: "left", angle: 180, label: "Down · Right" },
      { id: "up", angle: 270, label: "Up · Left" },
      { id: "down", angle: 90, label: "Up · Right" },
    ];
  }
  if (normalizedFamily === "hierarchy" && growthMode === "both-side") {
    return [
      { id: "right", angle: 0, label: "Left–Right" },
      { id: "down", angle: 90, label: "Up–Down" },
    ];
  }
  return DIRECTIONS;
}

/**
 * The one connector line type each locked-style family (`supportsMapLineStyle`
 * is false for it) exposes in the legacy style panel. Fishbone's custom
 * renderer still draws its diagonal spine/ribs, but the legacy UI presents
 * that family as Orthogonal; preserve the option/value contract independently
 * of the renderer's geometry.
 */
const LOCKED_LINE_TYPE_BY_FAMILY: Partial<Record<WorkspaceMapLayoutFamily, WorkspaceMapLayoutLineType>> = {
  orgchart: "curved",
  fishbone: "orthogonal",
  timeline: "orthogonal",
  treeview: "orthogonal",
  flowchart: "orthogonal",
  swimlane: "orthogonal",
};

export function lineOptions(family: WorkspaceMapLayoutFamily): readonly WorkspaceMapLayoutLineOption[] {
  if (supportsMapLineStyle(family)) return LINE_STYLES;
  const locked = LOCKED_LINE_TYPE_BY_FAMILY[family] ?? "orthogonal";
  return LINE_STYLES.filter((line) => line.id === locked);
}

/**
 * The connector line type a map should use right after switching TO this
 * family, when the caller isn't explicitly setting one. Families that don't
 * expose a line-style picker (`lineOptions` locks them to one choice) must
 * still get that choice applied on the switch itself — otherwise a map that
 * picked "curved" under Hierarchy keeps rendering curved bezier connectors
 * over Fishbone/Timeline/Treeview's diagonal or right-angle node layout,
 * producing looping, overlapping lines instead of clean routing.
 */
export function defaultConnectorLineTypeFor(family: WorkspaceMapLayoutFamily): WorkspaceMapLayoutLineType {
  return lineOptions(family)[0]?.id ?? "curved";
}

export function directionToAngle(direction: WorkspaceMapLayoutDirection): number {
  if (direction === "down") return 90;
  if (direction === "left") return 180;
  if (direction === "up") return -90;
  return 0;
}
