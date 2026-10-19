import { includeWorkspaceDocTables } from './workspaceDocReferences';

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
  let size = -1;
  while (size !== visited.size) {
    size = visited.size;
    includeWorkspaceDocTables(blocks, visited).forEach(visit);
  }
  return [...visited];
}

export function remapContainerReferences<T>(data: T, ids: ReadonlyMap<string, string>): T {
  if (!data || typeof data !== 'object') return data;
  let next = data;
  const members = (data as { frameBlockIds?: unknown }).frameBlockIds;
  if (Array.isArray(members)) next = { ...next, frameBlockIds: members.flatMap((id) => typeof id === 'string' && ids.has(id) ? [ids.get(id)!] : []) };
  const attachments = (data as { cellItems?: Record<string, Array<{ blockId: string }>> }).cellItems;
  if (attachments && typeof attachments === 'object') next = { ...next, cellItems: Object.fromEntries(Object.entries(attachments).map(([key, items]) => [key,
    Array.isArray(items) ? items.flatMap((item) => ids.has(item.blockId) ? [{ ...item, blockId: ids.get(item.blockId)! }] : []) : [],
  ])) };
  const sheets = (data as { sheets?: Array<{ data?: unknown }> }).sheets;
  if (Array.isArray(sheets)) next = { ...next, sheets: sheets.map((sheet) => ({ ...sheet, data: remapContainerReferences(sheet.data, ids) })) };
  return next;
}
