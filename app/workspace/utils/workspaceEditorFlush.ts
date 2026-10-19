type Flush = () => void | boolean | Promise<void | boolean>;
const editors = new Map<string, Map<symbol, Flush>>();
/** Drain editors before a REST/WS flush. Unregister by lease, never just board ID. */
export function registerWorkspaceEditorFlush(boardId: string, flush: Flush): () => void {
  const key = Symbol("editor"), entries = editors.get(boardId) ?? new Map<symbol, Flush>();
  entries.set(key, flush); editors.set(boardId, entries);
  return () => { const current = editors.get(boardId); current?.delete(key); if (!current?.size) editors.delete(boardId); };
}
export async function flushWorkspaceEditors(boardId: string): Promise<boolean> {
  try { for (const flush of [...(editors.get(boardId)?.values() ?? [])]) if (await flush() === false) return false; return true; }
  catch { return false; }
}
