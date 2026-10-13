import type { MapLayoutSettings } from "../../types/block";

export type WorkspaceTimelineBranchMode = MapLayoutSettings["timelineBranchMode"];
export type ResolvedWorkspaceTimelineBranchMode = Exclude<WorkspaceTimelineBranchMode, "auto">;

/** Resolve the legacy Timeline auto mode used by both layout and picker UI. */
export function resolveWorkspaceTimelineBranchMode(
  mode: WorkspaceTimelineBranchMode,
  activityCount: number,
): ResolvedWorkspaceTimelineBranchMode {
  if (mode !== "auto") return mode;
  return activityCount > 3 ? "alternate" : "one-side";
}
