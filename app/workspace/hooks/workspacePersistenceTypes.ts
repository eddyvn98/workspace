export interface WorkspacePersistenceApi {
  save: () => void;
  /** Cancels any pending debounced autosave and awaits it (and anything it
   *  chains) reaching the server. Call before an AI board read so a
   *  just-created block is not still sitting in the debounce window. Resolves
   *  `false` when the save did not confirm as persisted — a caller must not
   *  treat that as a successful flush. */
  flushPendingSave: () => Promise<boolean>;
  /** True while a debounced autosave is scheduled or in-flight. */
  isSavePending: boolean;
  /** Error from the latest remote save, while local cache remains available. */
  saveError: string | null;
  /** True when the board cannot be loaded from local or remote state. */
  loadError: boolean;
  /** True while the board's remote state is being resolved. */
  isLoadingBoard: boolean;
  /** True only after this exact board has finished its initial hydration. */
  isBoardReady: boolean;
  /** True when a local or non-default remote viewport should be preserved. */
  hasSavedCamera: boolean;
}

export interface AdoptPayload {
  blocks?: unknown;
  blockOrder?: unknown;
  connectors?: unknown;
  camera?: unknown;
  frames?: unknown;
  title?: unknown;
  treeLayoutDirection?: unknown;
  treeGrowthMode?: unknown;
  treeLayoutFamily?: unknown;
  treeTimelineBranchMode?: unknown;
  treeTimelineDescendantStyle?: unknown;
  treeCatalogDescendantStyle?: unknown;
}
