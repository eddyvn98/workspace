/** Deleted CRDT content can remain in tombstones; only the realtime service receives its checkpoint. */
export function withoutDocumentState<T extends object>(board: T): Omit<T, "documentState"> {
  const { documentState: _checkpoint, ...visible } = board as T & { documentState?: unknown };
  return visible;
}
