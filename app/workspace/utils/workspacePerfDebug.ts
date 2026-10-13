const WORKSPACE_PERF_QUERY = "debug=workspace-perf";
const WORKSPACE_PERF_PREFIX = "[workspace-perf]";

export function isWorkspacePerfDebugEnabled(): boolean {
  return typeof window !== "undefined" && window.location.search.includes(WORKSPACE_PERF_QUERY);
}

export function workspacePerfLog(event: string, details?: Record<string, unknown>): void {
  if (!isWorkspacePerfDebugEnabled()) return;
  const payload = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  console.info(`${WORKSPACE_PERF_PREFIX} ${event}${payload}`);
}
