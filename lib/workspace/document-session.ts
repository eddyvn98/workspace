import type * as Y from "yjs";

/** One active canvas/Office board per tab. Fragment changes do not recreate editors. */
let session: { boardId: string; doc: Y.Doc } | null = null;
const subscribers = new Set<() => void>();
export const subscribeDocumentSession = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; };
export const getDocumentSession = () => session;
export function setDocumentSession(boardId: string, doc: Y.Doc | null): void {
  if (doc === null && session?.boardId !== boardId) return;
  if (doc && session?.doc === doc && session.boardId === boardId) return;
  session = doc ? { boardId, doc } : null;
  for (const listener of subscribers) listener();
}
export function refreshDocumentSession(): void { for (const listener of subscribers) listener(); }
