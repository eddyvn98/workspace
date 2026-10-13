export type WorkspaceZOrderMode = "front" | "forward" | "backward" | "back";

export function reorderWorkspaceBlockIds(
  order: string[],
  blockIds: string[],
  mode: WorkspaceZOrderMode,
): string[] {
  const selected = new Set(blockIds.filter((id) => order.includes(id)));
  if (!selected.size) return order;

  if (mode === "front") return [...order.filter((id) => !selected.has(id)), ...order.filter((id) => selected.has(id))];
  if (mode === "back") return [...order.filter((id) => selected.has(id)), ...order.filter((id) => !selected.has(id))];

  const next = [...order];
  if (mode === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index]) && !selected.has(next[index + 1])) [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index]) && !selected.has(next[index - 1])) [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }
  return next;
}

export function normalizeWorkspaceBlockZOrder<T extends Record<string, unknown>>(blocks: T, order: string[]): T {
  const next: Record<string, unknown> = { ...blocks };
  order.forEach((id, zIndex) => {
    const block = next[id];
    if (!block || typeof block !== "object" || Array.isArray(block)) return;
    const value = block as Record<string, unknown>;
    const transform = value.transform;
    if (!transform || typeof transform !== "object" || Array.isArray(transform)) return;
    const dual = transform as Record<string, unknown>;
    const normalizeSlot = (slot: unknown) =>
      slot && typeof slot === "object" && !Array.isArray(slot) ? { ...slot, zIndex } : slot;
    next[id] = {
      ...value,
      transform: {
        ...dual,
        computed: normalizeSlot(dual.computed),
        override: normalizeSlot(dual.override),
      },
    };
  });
  return next as T;
}
