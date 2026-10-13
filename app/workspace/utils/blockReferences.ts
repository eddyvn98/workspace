/** Containers reference members separately from the tree's parent links. */
export function collectReferencedBlockIds<T extends { parentId?: unknown; data?: unknown }>(
  blocks: Record<string, T>, roots: Iterable<string>,
): string[] {
  const children = new Map<string, string[]>();
  for (const [id, block] of Object.entries(blocks)) {
    if (typeof block.parentId === "string") children.set(block.parentId, [...(children.get(block.parentId) ?? []), id]);
  }
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id) || !blocks[id]) return;
    visited.add(id);
    children.get(id)?.forEach(visit);
    const data = blocks[id].data as { frameBlockIds?: unknown } | undefined;
    if (Array.isArray(data?.frameBlockIds)) data.frameBlockIds.forEach((member) => {
      if (typeof member === "string") visit(member);
    });
  };
  for (const id of roots) visit(id);
  return [...visited];
}

export function remapContainerReferences<T>(data: T, ids: ReadonlyMap<string, string>): T {
  if (!data || typeof data !== "object" || !("frameBlockIds" in data)) return data;
  const members = (data as { frameBlockIds?: unknown }).frameBlockIds;
  if (!Array.isArray(members)) return data;
  return { ...data, frameBlockIds: members.flatMap((id) => typeof id === "string" && ids.has(id) ? [ids.get(id)!] : []) };
}
