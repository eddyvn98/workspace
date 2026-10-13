import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { planFrameDrop } from "../utils/frameMembership";

export function commitFrameDrop(ids: string[]): boolean {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return false;
  const plan = planFrameDrop(state.blocks, ids);
  if (!plan.size) return false;
  const blocks = { ...state.blocks }, updatedAt = Date.now();
  for (const [id, members] of plan) {
    const block = blocks[id];
    blocks[id] = { ...block, data: { ...block.data, frameBlockIds: members }, updatedAt } as typeof block;
  }
  useWorkspaceStore.setState({ blocks });
  return true;
}
