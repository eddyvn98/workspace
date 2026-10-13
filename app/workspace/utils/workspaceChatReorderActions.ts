import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { asRecord, firstString, getBlockTopic, resolveWorkspaceTargetIds } from "./workspaceChatResolver";

function targetId(raw: Record<string, unknown>): string | undefined {
  const params = asRecord(raw.params);
  const target = raw.target ?? params.target ?? raw.parentId ?? params.parentId ?? raw.parent_id ?? params.parent_id;
  const ids = resolveWorkspaceTargetIds({ ...raw, target });
  return ids.length === 1 ? ids[0] : undefined;
}

function descendantRoot(id: string, parentId: string, blocks: ReturnType<typeof useWorkspaceStore.getState>["blocks"]): string | undefined {
  let current = blocks[id];
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.parentId === parentId) return current.id;
    current = blocks[current.parentId];
  }
  return undefined;
}

function childOrder(parentId: string) {
  const state = useWorkspaceStore.getState();
  const children = state.blockOrder.filter((id) => state.blocks[id]?.parentId === parentId);
  const missing = Object.values(state.blocks)
    .filter((block) => block.parentId === parentId && !children.includes(block.id))
    .map((block) => block.id);
  return [...children, ...missing];
}

function requestedChildId(value: unknown, children: string[]): string | undefined {
  if (typeof value === "string") {
    if (children.includes(value)) return value;
    const matches = children.filter((id) => getBlockTopic(useWorkspaceStore.getState().blocks[id]).toLowerCase() === value.trim().toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  }
  const node = asRecord(value);
  const id = firstString(node.id, node.nodeId, node.node_id);
  if (id && children.includes(id)) return id;
  const topic = firstString(node.topic, node.name, node.text, node.label);
  if (!topic) return undefined;
  const matches = children.filter((childId) => getBlockTopic(useWorkspaceStore.getState().blocks[childId]).toLowerCase() === topic.toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

export function applyWorkspaceReorderAction(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const parentId = targetId(raw);
  if (!parentId || !state.blocks[parentId]) return [];
  const params = asRecord(raw.params);
  const values = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : [];
  const children = childOrder(parentId);
  if (values.length !== children.length) return [];
  const desired = values.map((value) => requestedChildId(value, children));
  if (desired.some((id): id is undefined => !id) || new Set(desired).size !== children.length) return [];
  const orderedDesired = desired as string[];

  const directChildren = new Set(children);
  const groups = new Map<string, string[]>();
  for (const childId of children) {
    groups.set(childId, state.blockOrder.filter((id) => id === childId || descendantRoot(id, childId, state.blocks) === childId));
  }
  const rootsInOrder = state.blockOrder.filter((id) => directChildren.has(id));
  if (rootsInOrder.length !== children.length) return [];
  let desiredIndex = 0;
  const nextOrder: string[] = [];
  for (const id of state.blockOrder) {
    if (directChildren.has(id)) {
      nextOrder.push(...(groups.get(orderedDesired[desiredIndex++]) ?? []));
    } else if (!children.some((childId) => descendantRoot(id, childId, state.blocks) === childId)) {
      nextOrder.push(id);
    }
  }
  if (desiredIndex !== orderedDesired.length) return [];
  state.setBlockOrder(nextOrder);
  return [parentId];
}
