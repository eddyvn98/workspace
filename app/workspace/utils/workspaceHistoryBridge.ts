export interface WorkspaceHistoryHandlers {
  undo: () => void;
  redo: () => void;
}

let activeHandlers: WorkspaceHistoryHandlers | null = null;
let skipNextCanvasSnapshot = false;

export function skipNextWorkspaceHistorySnapshot(): void {
  skipNextCanvasSnapshot = true;
}

export function consumeSkippedWorkspaceHistorySnapshot(): boolean {
  const shouldSkip = skipNextCanvasSnapshot;
  skipNextCanvasSnapshot = false;
  return shouldSkip;
}

export function registerWorkspaceHistoryHandlers(handlers: WorkspaceHistoryHandlers): () => void {
  activeHandlers = handlers;
  return () => {
    if (activeHandlers === handlers) activeHandlers = null;
  };
}

export function runWorkspaceHistoryAction(type: "undo" | "redo"): boolean {
  const handler = activeHandlers?.[type];
  if (!handler) return false;
  handler();
  return true;
}
