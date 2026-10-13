import type { WorkspaceSnapshot } from "../hooks/useWorkspaceHistory";

export function sameWorkspaceHistoryContent(before: WorkspaceSnapshot | null, after: WorkspaceSnapshot): boolean {
  if (!before) return false;
  const canonical = (snapshot: WorkspaceSnapshot) => JSON.stringify({
    ...snapshot,
    blocks: Object.fromEntries(Object.entries(snapshot.blocks).map(([id, block]) => {
      const { updatedAt: _updatedAt, lastEditedBy: _lastEditedBy, ...content } = block;
      return [id, content];
    })),
  }, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value);
  return canonical(before) === canonical(after);
}

/** Field names only: identify reconciliation that clears undo without logging document content. */
export function workspaceHistoryChangedFields(before: unknown, after: unknown): string[] {
  const paths: string[] = [];
  const visit = (a: any, b: any, path: string) => {
    if (paths.length >= 12 || a === b) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (/^blocks\.[^.]+$/.test(path) && ["updatedAt", "lastEditedBy"].includes(key)) continue;
        visit(a[key], b[key], path ? `${path}.${key}` : key);
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) paths.push(path);
  };
  visit(before, after, ""); return paths;
}
