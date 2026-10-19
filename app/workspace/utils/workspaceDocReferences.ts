import { attrValue, parseHtml, walkNodes } from '@/app/api/workspaces/[id]/agent/docHtmlParse';
import { sanitizeAgentHtml } from '@/app/api/workspaces/[id]/agent/agentHtmlSanitize';

type ReferencedBlock = { type?: unknown; embeddedInDocId?: string; data?: unknown; updatedAt?: number };
type RecordData = Record<string, unknown>;
const dataOf = (block: ReferencedBlock): RecordData => block.data && typeof block.data === 'object' ? block.data as RecordData : {};
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function workspaceDocTableIds(html: string): string[] {
  const ids = new Set<string>();
  walkNodes(parseHtml(html), (node) => {
    if (node.tag !== 'div' || attrValue(node, 'data-workspace-table') === undefined) return;
    const id = attrValue(node, 'data-table-id');
    if (id) ids.add(id);
  });
  return [...ids];
}

export function rewriteWorkspaceDocTables(html: string, replace: (id: string) => string | null): string {
  const replacements: Array<{ start: number; end: number; html: string }> = [];
  walkNodes(parseHtml(html), (node) => {
    if (node.tag !== 'div' || attrValue(node, 'data-workspace-table') === undefined) return;
    const id = attrValue(node, 'data-table-id');
    if (!id) return;
    const next = replace(id);
    if (next !== null) replacements.push({ start: node.start, end: node.end, html: next });
  });
  let result = html;
  for (const change of replacements.sort((a, b) => b.start - a.start)) result = result.slice(0, change.start) + change.html + result.slice(change.end);
  return result;
}

/** Add each selected Doc's owned tables to portable copies and backups. */
export function includeWorkspaceDocTables<T extends ReferencedBlock>(blocks: Record<string, T>, ids: Iterable<string>): string[] {
  const selected = new Set(ids);
  for (const id of selected) {
    if (blocks[id]?.type === 'table') {
      const data = dataOf(blocks[id]);
      const sheets = [data, ...(Array.isArray(data.sheets) ? data.sheets.map((sheet) => sheet?.data) : [])];
      for (const sheet of sheets) {
        const attachments = sheet?.cellItems;
        if (attachments && typeof attachments === 'object') {
          for (const items of Object.values(attachments)) if (Array.isArray(items)) {
            for (const item of items) if (typeof item?.blockId === 'string' && blocks[item.blockId]) selected.add(item.blockId);
          }
        }
      }
    }
    if (blocks[id]?.type !== 'doc') continue;
    for (const tableId of workspaceDocTableIds(String(dataOf(blocks[id]).html ?? ''))) {
      if (blocks[tableId]?.type === 'table') selected.add(tableId);
    }
    for (const [tableId, table] of Object.entries(blocks)) if (table.type === 'table' && table.embeddedInDocId === id) selected.add(tableId);
  }
  return [...selected];
}

/** Remaps both sides of the embed relation; an external reference cannot bind to another board's table. */
export function remapWorkspaceDocReferences<T extends ReferencedBlock>(block: T, ids: ReadonlyMap<string, string>): T {
  const data = dataOf(block);
  if (block.type === 'doc') {
    const html = rewriteWorkspaceDocTables(sanitizeAgentHtml(String(data.html ?? ''), { docAlign: true }), (id) => ids.has(id)
      ? `<div data-workspace-table="true" data-table-id="${escapeAttribute(ids.get(id)!)}"></div>`
      : '<p>Table unavailable in this copy.</p>');
    return { ...block, data: { ...data, html } };
  }
  return block.type === 'table' ? { ...block, embeddedInDocId: block.embeddedInDocId ? ids.get(block.embeddedInDocId) : undefined } : block;
}

/** Removing an inline embed releases its table to the canvas, preserving its data. */
export function reconcileWorkspaceDocTables<T extends ReferencedBlock>(blocks: Record<string, T>, docId: string): Record<string, T> {
  const doc = blocks[docId];
  const referenced = new Set(doc?.type === 'doc' ? workspaceDocTableIds(String(dataOf(doc).html ?? '')) : []);
  let next = blocks;
  for (const [id, table] of Object.entries(blocks)) {
    if (table.type !== 'table') continue;
    const owner = referenced.has(id) && (!table.embeddedInDocId || table.embeddedInDocId === docId) ? docId
      : table.embeddedInDocId === docId && !referenced.has(id) ? undefined : table.embeddedInDocId;
    if (owner === table.embeddedInDocId) continue;
    if (next === blocks) next = { ...blocks };
    next[id] = { ...table, embeddedInDocId: owner, updatedAt: Date.now() };
  }
  return next;
}

/** Read-only CRDT projection: stable ownership comes from live document references, never wall-clock time. */
export function normalizeWorkspaceDocOwnership<T>(blocks: Record<string, T>): Record<string, T> {
  const references = new Map<string, string[]>();
  for (const id of Object.keys(blocks).sort()) {
    const block = blocks[id] as ReferencedBlock | null;
    if (!block || typeof block !== 'object' || block.type !== 'doc') continue;
    for (const tableId of workspaceDocTableIds(String(dataOf(block).html ?? ''))) {
      const owners = references.get(tableId) ?? [];
      owners.push(id);
      references.set(tableId, owners);
    }
  }
  let next = blocks;
  for (const [id, value] of Object.entries(blocks)) {
    const table = value as ReferencedBlock | null;
    if (!table || typeof table !== 'object' || table.type !== 'table') continue;
    const owners = references.get(id) ?? [];
    const owner = table.embeddedInDocId && owners.includes(table.embeddedInDocId) ? table.embeddedInDocId : owners[0];
    if (owner === table.embeddedInDocId) continue;
    if (next === blocks) next = { ...blocks };
    next[id] = { ...value, embeddedInDocId: owner };
  }
  return next;
}

/** Delete a table's stale nodes; deleting a Doc releases its tables rather than discarding them. */
export function removeWorkspaceDocReferences<T extends ReferencedBlock>(blocks: Record<string, T>, removedId: string): Record<string, T> {
  let next = blocks;
  for (const [id, block] of Object.entries(blocks)) {
    let updated: T | undefined;
    if (block.type === 'table' && block.embeddedInDocId === removedId) updated = { ...block, embeddedInDocId: undefined };
    if (block.type === 'doc') {
      const data = dataOf(block), html = String(data.html ?? '');
      const clean = rewriteWorkspaceDocTables(html, (tableId) => tableId === removedId ? '' : null);
      if (clean !== html) updated = { ...block, data: { ...data, html: clean || '<p></p>' } };
    }
    if (updated) {
      if (next === blocks) next = { ...blocks };
      next[id] = { ...updated, updatedAt: Date.now() };
    }
  }
  return next;
}
