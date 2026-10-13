import type { AgentBoardState } from "./operationsCore";
import { blockRect, record } from "./operationsCore";
import { collectDragBlockIds } from "@/app/workspace/hooks/blockDragTypes";
import { planFrameDrop } from "@/app/workspace/utils/frameMembership";

export function containerPositions(state: AgentBoardState): Map<string, { x: number; y: number }> {
  return new Map(Object.entries(state.blocks)
    .filter(([, block]) => Array.isArray(record(block.data).frameBlockIds))
    .map(([id, block]) => [id, blockRect(block)]));
}

export function moveContainerMembers(state: AgentBoardState, changedIds: string[], before: Map<string, { x: number; y: number }>): string[] {
  const changed = new Set(changedIds);
  const moved = new Set(changedIds);
  const blocks = state.blocks as unknown as Parameters<typeof collectDragBlockIds>[0];
  for (const id of changedIds) {
    const old = before.get(id);
    if (!old || !state.blocks[id]) continue;
    const current = blockRect(state.blocks[id]);
    const dx = current.x - old.x, dy = current.y - old.y;
    if (!dx && !dy) continue;
    for (const memberId of collectDragBlockIds(blocks, id, [id])) {
      if (moved.has(memberId) || record(state.blocks[memberId]?.style).isLocked) continue;
      const block = state.blocks[memberId];
      if (!block) continue;
      const rect = blockRect(block);
      block.transform = { ...record(block.transform), override: { ...rect, x: rect.x + dx, y: rect.y + dy } };
      block.updatedAt = Date.now();
      moved.add(memberId); changed.add(memberId);
    }
  }
  if (changed.size !== changedIds.length) {
    for (const connector of Object.values(state.connectors)) {
      if (changed.has(String(connector.fromBlockId)) || changed.has(String(connector.toBlockId))) {
        delete connector.waypoints;
      }
    }
  }
  const plan = planFrameDrop(state.blocks, changed);
  for (const [id, frameBlockIds] of plan) {
    const block = state.blocks[id];
    block.data = { ...record(block.data), frameBlockIds };
    block.updatedAt = Date.now();
    changed.add(id);
  }
  return [...changed];
}
