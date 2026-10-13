import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { buildConflictNotice } from "./conflictNotice";
import type { MergeConflictItem } from "./mergeBoardConflict";

const NOTICE_DURATION_MS = 30_000;

/** Puts the local versions that lost a merge back on the board; the change is
 * an ordinary edit, so it autosaves and becomes the newest version for everyone. */
export function restoreMergeConflicts(items: MergeConflictItem[]): void {
  useWorkspaceStore.setState((state) => {
    const blocks = { ...state.blocks } as Record<string, unknown>;
    const connectors = { ...state.connectors } as Record<string, unknown>;
    let blockOrder = state.blockOrder;
    for (const item of items) {
      const target = item.kind === "block" ? blocks : connectors;
      if (item.mine === undefined) delete target[item.id];
      else target[item.id] = item.mine;
      if (item.kind === "block") {
        if (item.mine === undefined) blockOrder = blockOrder.filter((id) => id !== item.id);
        else if (!blockOrder.includes(item.id)) blockOrder = [...blockOrder, item.id];
      }
    }
    return { blocks: blocks as never, connectors: connectors as never, blockOrder };
  });
}

/** Tells the user which of their edits lost a concurrent-edit merge, and offers to bring them back. */
export function notifyMergeConflicts(items: MergeConflictItem[]): void {
  if (items.length === 0 || typeof window === "undefined") return;
  const { title, description } = buildConflictNotice(items);
  toast.warning(title, {
    description,
    duration: NOTICE_DURATION_MS,
    action: { label: items.length === 1 ? "Restore mine" : "Restore all mine", onClick: () => restoreMergeConflicts(items) },
  });
}
