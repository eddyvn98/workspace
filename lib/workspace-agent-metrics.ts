/** Aggregate confirmed executor outcomes, not model-proposed actions. */
export interface WorkspaceMutationOutcome {
  type?: string;
  ids?: string[];
  changed?: boolean;
}
export function buildWorkspaceAgentMutationMetrics(
  actions: WorkspaceMutationOutcome[],
  persisted: boolean,
  revision: number,
) {
  return {
    actionCount: actions.length,
    changedActionCount: actions.filter((action) => action.changed === true).length,
    persisted,
    revision,
  };
}
