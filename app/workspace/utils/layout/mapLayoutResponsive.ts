export type WorkspaceMapLayoutPresentation =
  | { mode: "cascade"; side: "left" | "right" }
  | { mode: "compact" };

export interface WorkspaceMapLayoutSpace {
  rootLeft: number;
  rootRight: number;
  viewportWidth: number;
  cascadeWidth: number;
  edgeMargin?: number;
}
export function resolveWorkspaceMapLayoutPresentation({
  rootLeft,
  rootRight,
  viewportWidth,
  cascadeWidth,
  edgeMargin = 8,
}: WorkspaceMapLayoutSpace): WorkspaceMapLayoutPresentation {
  const roomRight = viewportWidth - edgeMargin - rootRight;
  const roomLeft = rootLeft - edgeMargin;
  if (roomRight >= cascadeWidth) return { mode: "cascade", side: "right" };
  if (roomLeft >= cascadeWidth) return { mode: "cascade", side: "left" };
  return { mode: "compact" };
}
