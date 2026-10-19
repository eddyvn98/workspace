import { collectReferencedBlockIds, remapContainerReferences } from "@/app/workspace/utils/blockReferences";
import { remapWorkspaceDocReferences, removeWorkspaceDocReferences } from '@/app/workspace/utils/workspaceDocReferences';
import { fitMapNodeSize } from "./mapNodeSize";
import { normalizeTable, type JsonMap } from "./operationsTables";
export type AgentBoardState = {
  blocks: Record<string, JsonMap>;
  blockOrder: string[];
  connectors: Record<string, JsonMap>;
  title: string;
  [key: string]: unknown;
};

export const record = (value: unknown): JsonMap => value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
export const param = (raw: JsonMap, key: string): unknown => raw[key] ?? record(raw.params)[key];
export function repairParam(raw: JsonMap, key: string): unknown {
  const params = record(raw.params);
  const target = record(raw.target);
  const repair = record(raw.repair);
  return raw[key] ?? params[key] ?? target[key] ?? repair[key];
}
export function asArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
	if (typeof value === "string") {
		try {
			return asArray(JSON.parse(value));
		} catch {
			return [];
		}
	}
	return [];
}

export function arrayParam(raw: JsonMap, key: string): unknown[] {
	return asArray(param(raw, key));
}
export function diagramGraph(raw: JsonMap): JsonMap {
  const graph = param(raw, "graphJson");
  if (typeof graph !== "string") return {};
  try { return record(JSON.parse(graph)); } catch { return {}; }
}
export function diagramArrayParam(raw: JsonMap, key: string): unknown[] {
  const direct = arrayParam(raw, key);
  return direct.length > 0 ? direct : arrayParam(diagramGraph(raw), key);
}
export const stringValue = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
export const id = () => crypto.randomUUID();
export const now = () => Date.now();

export function topic(block: JsonMap): string {
  const data = record(block.data);
  return stringValue(data.markdown) ?? stringValue(data.label) ?? stringValue(data.text) ?? stringValue(data.alt) ?? stringValue(block.description) ?? "";
}

/** Label used only for name matching: a node the user bolded may be stored as
 * "**Topic**" or "<strong>Topic</strong>", but people still refer to it as "Topic". */
export function labelKey(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__|~~|\*|_)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function transform(block: JsonMap): JsonMap {
  const current = record(block.transform);
  return record(current.override).x !== undefined ? record(current.override) : record(current.computed);
}

export function writeTransform(block: JsonMap, patch: JsonMap): void {
  const current = record(block.transform);
  block.transform = { ...current, override: { ...transform(block), ...patch } };
}

export function resolveId(raw: JsonMap, state: AgentBoardState, explicit?: string): string | undefined {
  const target = param(raw, "target");
  if (typeof target === "string" && Object.hasOwn(state.blocks, target)) return target;
  const tableRef = record(param(raw, "table"));
  const candidate = explicit ?? stringValue(param(raw, "blockId")) ?? stringValue(param(raw, "parentId")) ?? stringValue(param(raw, "nodeId")) ?? stringValue(param(raw, "shapeId")) ?? stringValue(param(raw, "strokeId")) ?? stringValue(param(raw, "tableId")) ?? stringValue(param(raw, "table_id")) ?? stringValue(tableRef.id);
  if (candidate && Object.hasOwn(state.blocks, candidate)) return candidate;
  const targetObject = record(target);
  const targetId = stringValue(targetObject.id) ?? stringValue(targetObject.nodeId) ?? stringValue(targetObject.blockId);
  if (targetId && Object.hasOwn(state.blocks, targetId)) return targetId;
  const blockRef = explicit ?? stringValue(param(raw, "blockId"));
  if (blockRef) {
    const semanticMatches = Object.values(state.blocks).filter((block) =>
      stringValue(record(block.data).semanticKey)?.toLowerCase() === blockRef.toLowerCase());
    if (semanticMatches.length === 1) return String(semanticMatches[0].id);
  }
  const name = typeof target === "string" ? target : stringValue(targetObject.topic) ?? stringValue(targetObject.name) ?? stringValue(targetObject.text) ?? stringValue(targetObject.label);
  if (!name) return undefined;
  // create_flowchart/create_swimlane/extend_flowchart persist the model's own
  // node id as data.semanticKey precisely so a later action (e.g.
  // update_relationship, repair_connector) can address that node again by the
  // same key. Unlike a display label, a semantic key is assigned by the model
  // as an opaque identifier and is expected to be unique, so it can resolve
  // even when several nodes share an identical generic label (e.g. repeated
  // "Task 2" text across parallel flowchart tracks).
  const semanticMatches = Object.values(state.blocks).filter((block) =>
    stringValue(record(block.data).semanticKey)?.toLowerCase() === name.toLowerCase());
  if (semanticMatches.length === 1) return String(semanticMatches[0].id);
  const exact = Object.values(state.blocks).filter((block) => topic(block).toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return String(exact[0].id);
  if (exact.length > 1) return undefined;
  const key = labelKey(name);
  const formatted = key ? Object.values(state.blocks).filter((block) => labelKey(topic(block)) === key) : [];
  return formatted.length === 1 ? String(formatted[0].id) : undefined;
}

export function connector(state: AgentBoardState, from: string, to: string): JsonMap {
  const line = stringValue(param({ lineType: "" }, "lineType"));
  return { id: id(), fromBlockId: from, toBlockId: to, lineType: line === "curved" || line === "orthogonal" ? line : "straight" };
}

export function removeConnectors(state: AgentBoardState, predicate: (item: JsonMap) => boolean): void {
  Object.entries(state.connectors).forEach(([key, item]) => { if (predicate(item)) delete state.connectors[key]; });
}

export type CanvasRect = { x: number; y: number; w: number; h: number };

export function blockRect(block: JsonMap): CanvasRect {
  const current = transform(block);
  return {
    x: Number.isFinite(Number(current.x)) ? Number(current.x) : 80,
    y: Number.isFinite(Number(current.y)) ? Number(current.y) : 80,
    w: Number(current.w) > 0 ? Number(current.w) : 220,
    h: Number(current.h) > 0 ? Number(current.h) : 100,
  };
}

export function rectanglesOverlap(a: CanvasRect, b: CanvasRect, gap = 24): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/**
 * Agent coordinates are suggestions, not a safe layout guarantee. Resolve
 * them server-side so a malformed/repeated model coordinate cannot stack
 * blocks on top of existing content.
 */
export function freePosition(
  state: AgentBoardState,
  preferred: { x: number; y: number },
  width: number,
  height: number,
  ignoreIds: string[] = [],
): { x: number; y: number } {
  const ignored = new Set(ignoreIds);
  const occupied = Object.values(state.blocks)
    .filter((block) => !ignored.has(String(block.id)))
    .map(blockRect);
  const stepX = Math.max(width + 60, 280);
  const stepY = Math.max(height + 50, 150);
  const originX = Number.isFinite(preferred.x) ? preferred.x : 80;
  const originY = Number.isFinite(preferred.y) ? preferred.y : 80;

  for (let row = 0; row < 100; row += 1) {
    for (let column = 0; column < 100; column += 1) {
      const candidate = { x: originX + column * stepX, y: originY + row * stepY, w: width, h: height };
      if (!occupied.some((rect) => rectanglesOverlap(candidate, rect))) return { x: candidate.x, y: candidate.y };
    }
  }
  return { x: originX, y: originY };
}

export function childPosition(state: AgentBoardState, parentId: string, width: number, height: number): { x: number; y: number } {
  const parent = state.blocks[parentId];
  const parentRect = parent ? blockRect(parent) : { x: 0, y: 0, w: 220, h: 100 };
  const siblingCount = Object.values(state.blocks).filter((block) => block.parentId === parentId).length;
  return freePosition(state, {
    x: parentRect.x + parentRect.w + 60,
    y: parentRect.y + (parentRect.h - height) / 2 + siblingCount * (height + 50),
  }, width, height);
}

export function addText(state: AgentBoardState, draft: JsonMap, parentId?: string): string {
  const blockId = id();
  const created = now();
  const width = Number(draft.w ?? draft.width) || 220;
  const height = Number(draft.h ?? draft.height) || 100;
  const requested = { x: typeof draft.x === "number" ? draft.x : 80, y: typeof draft.y === "number" ? draft.y : 80 };
  const positioned = parentId ? childPosition(state, parentId, width, height) : freePosition(state, requested, width, height);
  const block: JsonMap = {
    id: blockId,
    type: draft.type === "image" ? "image" : draft.type === "table" ? "table" : "text",
    transform: { computed: null, override: { x: positioned.x, y: positioned.y, w: width, h: height, rotation: Number(draft.rotation) || 0, zIndex: created } },
    data: draft.type === "image" ? { url: String(draft.url ?? draft.image ?? ""), alt: String(draft.alt ?? draft.text ?? "") } : draft.type === "table" ? normalizeTable({ rows: draft.rows, cols: draft.cols, cells: draft.cells }) : { markdown: String(draft.markdown ?? draft.text ?? draft.topic ?? draft.label ?? "") },
    createdAt: created,
    updatedAt: created,
    ...(parentId ? { parentId } : {}),
    ...(stringValue(draft.description) ? { description: draft.description } : {}),
    ...(stringValue(draft.icon) ? { icon: draft.icon } : {}),
    ...(record(draft.style) && Object.keys(record(draft.style)).length ? { style: record(draft.style) } : {}),
  };
  state.blocks[blockId] = block;
  state.blockOrder.push(blockId);
  if (parentId) {
    const link = connector(state, parentId, blockId);
    state.connectors[String(link.id)] = link;
  }
  return blockId;
}

export function addDrafts(state: AgentBoardState, raw: JsonMap, parentId?: string): string[] {
  const params = record(raw.params);
  const source = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(params.nodes) ? params.nodes : raw.node !== undefined ? [raw.node] : raw.to !== undefined ? [raw.to] : [];
  const created: string[] = [];
  for (const value of source) {
    const draft = typeof value === "string" ? { text: value } : record(value);
    const label = String(draft.markdown ?? draft.text ?? draft.topic ?? draft.label ?? "");
    const ownFit = draft.w === undefined && draft.width === undefined && draft.h === undefined && draft.height === undefined && label ? fitMapNodeSize(label) : undefined;
    // A node added next to existing siblings adopts their box when its text fits,
    // so the level stays aligned.
    const sibling = parentId ? Object.values(state.blocks).find((block) => block.parentId === parentId) : undefined;
    const siblingBox = record(record(sibling?.transform).override);
    const fit = ownFit ? { w: Math.max(ownFit.w, Number(siblingBox.w) || 0), h: Math.max(ownFit.h, Number(siblingBox.h) || 0) } : {};
    const childId = addText(state, { ...fit, ...draft }, parentId);
    const semanticKey = stringValue(draft.id);
    if (semanticKey) {
      const block = state.blocks[childId];
      block.data = { ...record(block.data), semanticKey };
    }
    created.push(childId);
    if (Array.isArray(draft.children)) created.push(...addDrafts(state, { nodes: draft.children }, childId));
  }
  return created;
}

export function removeSubtree(state: AgentBoardState, rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(state.blocks).forEach((block) => { if (typeof block.parentId === "string" && ids.has(block.parentId) && !ids.has(String(block.id))) { ids.add(String(block.id)); changed = true; } });
  }
  ids.forEach((blockId) => delete state.blocks[blockId]);
  for (const blockId of ids) state.blocks = removeWorkspaceDocReferences(state.blocks, blockId);
  state.blockOrder = state.blockOrder.filter((blockId) => !ids.has(blockId));
  removeConnectors(state, (item) => ids.has(String(item.fromBlockId)) || ids.has(String(item.toBlockId)));
  return [...ids];
}

export function duplicateSubtree(state: AgentBoardState, rootId: string, offsetX: number, offsetY: number, asNewMap = false): string[] {
  const sourceIds = collectReferencedBlockIds(state.blocks, [rootId]);
  const mapping = new Map<string, string>();
  sourceIds.forEach((sourceId) => mapping.set(sourceId, id()));
  sourceIds.forEach((sourceId) => {
    const source = state.blocks[sourceId];
    if (!source) return;
    const copy = remapWorkspaceDocReferences(structuredClone(source), mapping);
    const copyId = mapping.get(sourceId)!;
    copy.id = copyId;
    copy.data = remapContainerReferences(copy.data, mapping);
    copy.createdAt = now(); copy.updatedAt = now();
    if (sourceId === rootId && asNewMap) delete copy.parentId;
    else if (typeof copy.parentId === "string") copy.parentId = mapping.get(copy.parentId) ?? copy.parentId;
    if (sourceId === rootId && asNewMap) copy.isFloating = true;
    const current = transform(copy);
    writeTransform(copy, { x: (Number(current.x) || 0) + offsetX, y: (Number(current.y) || 0) + offsetY, zIndex: now() });
    state.blocks[copyId] = copy; state.blockOrder.push(copyId);
  });
  Object.values(state.connectors).filter((item) => mapping.has(String(item.fromBlockId)) && mapping.has(String(item.toBlockId))).forEach((item) => {
    const copy = structuredClone(item); copy.id = id(); copy.fromBlockId = mapping.get(String(item.fromBlockId)); copy.toBlockId = mapping.get(String(item.toBlockId));
    if (Array.isArray(copy.waypoints)) copy.waypoints = copy.waypoints.map((point) => ({ ...record(point), x: Number(record(point).x) + offsetX, y: Number(record(point).y) + offsetY }));
    state.connectors[String(copy.id)] = copy;
  });
  const parentId = state.blocks[rootId]?.parentId;
  if (!asNewMap && typeof parentId === "string") { const link = connector(state, parentId, mapping.get(rootId)!); state.connectors[String(link.id)] = link; }
  return [...mapping.values()];
}

export function duplicateSubtreeAsMap(state: AgentBoardState, rootId: string): string[] {
  const root = state.blocks[rootId];
  if (!root) return [];
  const rootRect = blockRect(root);
  const maxX = Object.values(state.blocks).reduce((max, block) => Math.max(max, blockRect(block).x + blockRect(block).w), 0);
  return duplicateSubtree(state, rootId, maxX + 120 - rootRect.x, 0, true);
}

export function mapRoot(state: AgentBoardState, blockId: string): string {
  let current = state.blocks[blockId];
  const seen = new Set<string>();
  const mapId = stringValue(current?.mapId);
  if (mapId) {
    const mappedRoot = Object.values(state.blocks).find((block) =>
      String(block.mapId ?? "") === mapId && record(block.mapLayout).family,
    );
    if (mappedRoot) return String(mappedRoot.id);
  }
  while (current?.parentId && state.blocks[String(current.parentId)] && !seen.has(String(current.id))) { seen.add(String(current.id)); current = state.blocks[String(current.parentId)]; }
  return String(current?.id ?? blockId);
}
