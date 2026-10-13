import { planSpatialLayout, SPATIAL_LAYOUT_MODES } from "@/app/workspace/utils/spatialLayout";
import { collectDragBlockIds } from "@/app/workspace/hooks/blockDragTypes";
import { editDocText } from "./docHtmlEdit";
import type { AgentBoardState } from "./operations";
import { normalizeWorkspaceBlockZOrder, reorderWorkspaceBlockIds, type WorkspaceZOrderMode } from "@/app/workspace/utils/workspaceZOrder";

export type JsonMap = Record<string, any>;
export type AgentResult = { ids: string[]; operation: string };

export const record = (value: unknown): JsonMap =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const number = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const param = (raw: JsonMap, key: string): unknown => raw[key] ?? record(raw.params)[key];

export function transform(block: JsonMap): JsonMap {
  const source = record(block.transform);
  return record(source.override).x !== undefined ? record(source.override) : record(source.computed);
}

export function targetIds(raw: JsonMap, state: AgentBoardState): string[] {
  const explicit = [
    param(raw, "blockId"),
    param(raw, "nodeId"),
    param(raw, "id"),
  ].map(text).find(Boolean);
  if (explicit && state.blocks[explicit]) return [explicit];

  const target = param(raw, "target");
  const targetRecord = record(target);
  const targetId = (typeof target === "string" ? text(target) : undefined)
    ?? text(targetRecord.id)
    ?? text(targetRecord.blockId)
    ?? text(targetRecord.nodeId);
  if (targetId && state.blocks[targetId]) return [targetId];

  const label = typeof target === "string"
    ? text(target)
    : text(targetRecord.topic) ?? text(targetRecord.name) ?? text(targetRecord.text) ?? text(targetRecord.label);
  if (!label) return [];
  const matches = Object.values(state.blocks).filter((block) => {
    const data = record(block.data);
    return [data.markdown, data.label, data.title, data.text, block.description]
      .some((value) => text(value)?.toLowerCase() === label.toLowerCase());
  });
  return matches.length === 1 ? [String(matches[0].id)] : [];
}

export function updateZOrder(state: AgentBoardState, raw: JsonMap): string[] {
  const ids = targetIds(raw, state).filter((id) => state.blockOrder.includes(id));
  const mode = (text(param(raw, "zOrder")) ?? text(param(raw, "order")) ?? text(param(raw, "action")) ?? "front").toLowerCase();
  if (!ids.length || !["front", "forward", "back", "backward"].includes(mode)) return [];
  state.blockOrder = reorderWorkspaceBlockIds(state.blockOrder, ids, mode as WorkspaceZOrderMode);
  state.blocks = normalizeWorkspaceBlockZOrder(state.blocks, state.blockOrder);
  return ids;
}

/**
 * A model can turn one ambiguous label into several individually valid IDs.
 * Keep the executor from silently fanning that request out across duplicate
 * labels. The model must mark an explicitly requested all-matches operation.
 */
export function findUnconfirmedDuplicateTargetFanout(
  actions: JsonMap[],
  state: AgentBoardState,
): { label: string; ids: string[] } | null {
  const groups = new Map<string, Set<string>>();
  for (const action of actions) {
    if (action.applyToAllMatches === true) continue;
    const ids = [
      ...targetIds(action, state),
      ...(Array.isArray(param(action, "blockIds")) ? param(action, "blockIds") as unknown[] : [])
        .map(text).filter((value): value is string => Boolean(value)),
      ...(Array.isArray(param(action, "targets")) ? (param(action, "targets") as unknown[]).flatMap((target) => targetIds({ target }, state)) : []),
    ];
    for (const blockId of new Set(ids)) {
      const block = state.blocks[blockId];
      if (!block) continue;
      const data = record(block.data);
      const label = [data.markdown, data.label, data.title, data.text, block.description]
        .map(text).find(Boolean);
      if (!label) continue;
      const key = label.toLocaleLowerCase();
      const group = groups.get(key) ?? new Set<string>();
      group.add(blockId);
      groups.set(key, group);
    }
  }
  for (const ids of groups.values()) {
    if (ids.size < 2) continue;
    const first = state.blocks[[...ids][0]];
    const data = record(first?.data);
    const label = [data.markdown, data.label, data.title, data.text, first?.description]
      .map(text).find(Boolean) ?? "";
    return { label, ids: [...ids] };
  }
  return null;
}

function selectionIds(raw: JsonMap, state: AgentBoardState): string[] {
  const explicit = Array.isArray(param(raw, "blockIds"))
    ? (param(raw, "blockIds") as unknown[]).map(text).filter((id): id is string => Boolean(id))
    : Array.isArray(param(raw, "ids"))
      ? (param(raw, "ids") as unknown[]).map(text).filter((id): id is string => Boolean(id))
      : [];
  if (explicit.length > 0) return explicit.every((id) => Boolean(state.blocks[id])) ? explicit : [];
  const targets = Array.isArray(param(raw, "targets")) ? param(raw, "targets") as unknown[] : [];
  if (targets.length > 0) {
    const ids = targets.flatMap((target) => targetIds({ target }, state));
    return ids.length === targets.length ? [...new Set(ids)] : [];
  }
  return targetIds(raw, state);
}

function writeTransform(block: JsonMap, patch: JsonMap): void {
  const current = transform(block);
  block.transform = { ...record(block.transform), override: { ...current, ...patch } };
  block.updatedAt = Date.now();
}

function addSequenceConnectors(state: AgentBoardState, ids: string[], lineType: string): string[] {
  const created: string[] = [];
  for (let index = 0; index < ids.length - 1; index += 1) {
    const fromBlockId = ids[index];
    const toBlockId = ids[index + 1];
    const exists = Object.values(state.connectors).some((link) => link.fromBlockId === fromBlockId && link.toBlockId === toBlockId);
    if (exists) continue;
    const connectorId = crypto.randomUUID();
    state.connectors[connectorId] = { id: connectorId, fromBlockId, toBlockId, lineType, ...(lineType === "orthogonal" ? { arrowEnd: true } : {}) };
    created.push(connectorId);
  }
  return created;
}

function replaceText(source: string, query: string, replacement: string, replaceAll: boolean): string {
  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (!lowerQuery) return source;
  if (!replaceAll) {
    const index = lowerSource.indexOf(lowerQuery);
    return index < 0 ? source : `${source.slice(0, index)}${replacement}${source.slice(index + query.length)}`;
  }
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    const index = lowerSource.indexOf(lowerQuery, cursor);
    if (index < 0) return result + source.slice(cursor);
    result += source.slice(cursor, index) + replacement;
    cursor = index + query.length;
  }
  return result;
}

export function searchReplace(state: AgentBoardState, raw: JsonMap): string[] {
  const query = text(param(raw, "query"));
  if (!query) return [];
  const replacement = typeof param(raw, "replacement") === "string" ? param(raw, "replacement") as string : "";
  const replaceAll = param(raw, "replaceAll") !== false;
  const ids = selectionIds(raw, state);
  const candidates = ids.length > 0 ? ids : state.blockOrder;
  const changed: string[] = [];
  for (const blockId of candidates) {
    const block = state.blocks[blockId];
    if (!block) continue;
    const data = record(block.data);
    const fields = block.type === "text" ? ["markdown"] : block.type === "link" ? ["title"] : block.type === "image" ? ["alt"] : block.type === "shape" ? ["label"] : [];
    let blockChanged = false;
    if (block.type === "doc" && typeof data.html === "string") {
      const next = editDocText(data.html, query, { replacement, all: replaceAll });
      if (next !== data.html) { data.html = next; blockChanged = true; }
    }
    if (block.type === "table" && Array.isArray(data.cells)) {
      data.cells = (data.cells as unknown[]).map((row) => (Array.isArray(row) ? row.map((cell) => {
        if (typeof cell !== "string") return cell;
        const next = replaceText(cell, query, replacement, replaceAll);
        if (next !== cell) blockChanged = true;
        return next;
      }) : row));
    }
    for (const field of fields) {
      if (typeof data[field] !== "string") continue;
      const next = replaceText(data[field], query, replacement, replaceAll);
      if (next !== data[field]) {
        data[field] = next;
        blockChanged = true;
      }
    }
    if (blockChanged) {
      block.data = data;
      block.updatedAt = Date.now();
      changed.push(blockId);
    }
  }
  return changed;
}

export function arrangeSelection(state: AgentBoardState, raw: JsonMap): string[] {
  const ids = selectionIds(raw, state);
  if (ids.length < 2) return [];
  const mode = (text(param(raw, "mode")) ?? text(param(raw, "layout")) ?? "catalog").toLowerCase().replace(/[\s-]+/g, "_");
  if (ids.some((id) => record(state.blocks[id]?.style).isLocked === true)) return [];
  if (mode === "catalog" || SPATIAL_LAYOUT_MODES.includes(mode as never)) {
    const blocks = state.blocks as unknown as Parameters<typeof collectDragBlockIds>[0];
    const roots = ids.filter((id) => !ids.some((other) => other !== id && collectDragBlockIds(blocks, other, [other]).includes(id)));
    const rects = roots.map((id) => { const r = transform(state.blocks[id]); return { id, x: Number(r.x) || 0, y: Number(r.y) || 0, w: Number(r.w) || 180, h: Number(r.h) || 80 }; });
    const plan = planSpatialLayout(rects, mode === "catalog" ? "grid" : mode, number(param(raw, "gap")) ?? (mode === "catalog" ? 80 : 32), number(param(raw, "columns")));
    if (!plan) return [];
    const moved = new Set<string>();
    for (const rect of rects) {
      const next = plan.get(rect.id)!;
      for (const id of collectDragBlockIds(blocks, rect.id, [rect.id])) {
        if (moved.has(id)) continue;
        const current = transform(state.blocks[id]);
        writeTransform(state.blocks[id], { x: Number(current.x) + next.x - rect.x, y: Number(current.y) + next.y - rect.y });
        moved.add(id);
      }
    }
    for (const connector of Object.values(state.connectors)) if (moved.has(String(connector.fromBlockId)) || moved.has(String(connector.toBlockId))) delete connector.waypoints;
    return [...moved];
  }
  if (!["timeline", "flowchart", "vertical", "fishbone"].includes(mode)) return [];
  const first = transform(state.blocks[ids[0]]);
  const gap = number(param(raw, "gap")) ?? 80;
  const changed = new Set(ids);
  if (mode === "timeline") {
    let x = number(first.x) ?? 80;
    for (const blockId of ids) {
      const rect = transform(state.blocks[blockId]);
      writeTransform(state.blocks[blockId], { x, y: number(first.y) ?? 80 });
      x += (number(rect.w) ?? 180) + gap;
    }
  } else if (mode === "flowchart" || mode === "vertical") {
    let y = number(first.y) ?? 80;
    for (const blockId of ids) {
      const rect = transform(state.blocks[blockId]);
      writeTransform(state.blocks[blockId], { x: number(first.x) ?? 80, y });
      y += (number(rect.h) ?? 80) + gap;
    }
    addSequenceConnectors(state, ids, "orthogonal").forEach((id) => changed.add(id));
  } else if (mode === "fishbone") {
    const spine = transform(state.blocks[ids[0]]);
    const spineX = number(spine.x) ?? 80;
    const spineY = number(spine.y) ?? 80;
    ids.slice(1).forEach((blockId, index) => {
      const rect = transform(state.blocks[blockId]);
      const direction = index % 2 === 0 ? -1 : 1;
      writeTransform(state.blocks[blockId], {
        x: spineX + (number(spine.w) ?? 180) + gap + index * gap,
        y: spineY + direction * ((number(rect.h) ?? 80) + gap),
      });
    });
    addSequenceConnectors(state, ids, "straight").forEach((id) => changed.add(id));
  } else {
    const columns = Math.max(1, Math.floor(number(param(raw, "columns")) ?? Math.ceil(Math.sqrt(ids.length))));
    const originX = number(first.x) ?? 80;
    const originY = number(first.y) ?? 80;
    ids.forEach((blockId, index) => {
      const rect = transform(state.blocks[blockId]);
      writeTransform(state.blocks[blockId], {
        x: originX + (index % columns) * ((number(rect.w) ?? 180) + gap),
        y: originY + Math.floor(index / columns) * ((number(rect.h) ?? 80) + gap),
      });
    });
  }
  return [...changed];
}
