import type { AgentBoardState } from "./operationsCore";
import { duplicateSubtree, freePosition, id, now, record, removeSubtree, resolveId, stringValue, writeTransform } from "./operationsCore";
import type { JsonMap } from "./operationsTables";
const STICKY_KINDS = new Set(["sticky", "sticky_note"]);
const STICKY_DEFAULT_COLOR = "#fef08a";

// A sticky note with no fill is just an outlined page, so default it to yellow.
function shapeStyle(raw: JsonMap): JsonMap | undefined {
  const style = record(raw.style);
  const kind = String(raw.shapeType ?? raw.shapeKind ?? "");
  const withDefault = STICKY_KINDS.has(kind) && style.backgroundColor === undefined ? { ...style, backgroundColor: STICKY_DEFAULT_COLOR } : style;
  return Object.keys(withDefault).length ? withDefault : undefined;
}

export function shapeAction(state: AgentBoardState, raw: JsonMap, type: string): string[] {
  const source = record(raw.shape);
  const targetId = resolveId(raw, state);
  if (type === "create_shape") {
    const blockId = id(); const created = now();
    const width = Number(raw.width ?? raw.w) || 180;
    const height = Number(raw.height ?? raw.h) || 80;
    const position = freePosition(state, { x: Number(raw.x) || 80, y: Number(raw.y) || 80 }, width, height);
    state.blocks[blockId] = { id: blockId, type: "shape", transform: { computed: null, override: { x: position.x, y: position.y, w: width, h: height, rotation: Number(raw.rotation) || 0, zIndex: created } }, data: { shapeKind: String(raw.shapeType ?? raw.shapeKind ?? "rounded_rect"), label: String(raw.text ?? raw.label ?? "") }, ...(shapeStyle(raw) ? { style: shapeStyle(raw) } : {}), createdAt: created, updatedAt: created };
    state.blockOrder.push(blockId); return [blockId];
  }
  if (!targetId || state.blocks[targetId]?.type !== "shape") return [];
  const block = state.blocks[targetId];
  if (type === "delete_shape") return removeSubtree(state, targetId);
  if (type === "duplicate_shape") {
    // `count` makes N copies, each offset one more step; with no offset they
    // line up in a row to the right so the model needs no follow-up arrange.
    const count = Math.max(1, Math.min(20, Math.floor(Number(raw.count ?? raw.copies)) || 1));
    const width = Number(record(record(block.transform).override).w) || 180;
    const stepX = Number(raw.offsetX) || (count > 1 && raw.offsetY === undefined ? width + 24 : 24);
    const stepY = Number(raw.offsetY) || (count > 1 && raw.offsetX === undefined ? 0 : 24);
    return Array.from({ length: count }, (_, index) => duplicateSubtree(state, targetId, stepX * (index + 1), stepY * (index + 1))).flat();
  }
  const sourceData = { ...record(block.data), ...(stringValue(raw.shapeType) ? { shapeKind: raw.shapeType } : {}), ...(stringValue(raw.text) ? { label: raw.text } : {}), ...source };
  block.data = sourceData; if (Object.keys(record(raw.style)).length) block.style = { ...record(block.style), ...record(raw.style) }; writeTransform(block, { ...(raw.x !== undefined ? { x: Number(raw.x) } : {}), ...(raw.y !== undefined ? { y: Number(raw.y) } : {}), ...(raw.width !== undefined ? { w: Number(raw.width) } : {}), ...(raw.height !== undefined ? { h: Number(raw.height) } : {}), ...(raw.rotation !== undefined ? { rotation: Number(raw.rotation) } : {}) }); block.updatedAt = now();
  return [targetId];
}

function freehandPoints(value: unknown): JsonMap[] {
  if (!Array.isArray(value)) return [];
  return value.map(record).filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
}

export function freehandAction(state: AgentBoardState, raw: JsonMap, type: string): string[] {
  const targetId = resolveId(raw, state);
  if (type === "create_freehand") {
    const points = freehandPoints(raw.points);
    if (points.length < 2) return [];
    const blockId = id();
    const created = now();
    const width = Math.max(16, Number(raw.width) || 180);
    const height = Math.max(16, Number(raw.height) || 100);
    const position = freePosition(state, { x: Number(raw.x) || 80, y: Number(raw.y) || 80 }, width, height);
    state.blocks[blockId] = {
      id: blockId,
      type: "path",
      transform: { computed: null, override: { x: position.x, y: position.y, w: width, h: height, rotation: 0, zIndex: created } },
      data: {
        points,
        strokeColor: String(raw.color ?? "#3b82f6"),
        strokeWidth: Number(raw.strokeWidth) || 4,
        tool: String(raw.tool ?? "pen"),
        opacity: Number(raw.opacity ?? 1) > 1 ? Number(raw.opacity ?? 1) / 100 : Number(raw.opacity ?? 1),
      },
      createdAt: created,
      updatedAt: created,
    };
    state.blockOrder.push(blockId);
    return [blockId];
  }
  if (!targetId || state.blocks[targetId]?.type !== "path") return [];
  if (type === "delete_freehand") return removeSubtree(state, targetId);
  if (type === "duplicate_freehand") return duplicateSubtree(state, targetId, Number(raw.offsetX) || 24, Number(raw.offsetY) || 24);
  const block = state.blocks[targetId];
  const data = record(block.data);
  const points = freehandPoints(raw.points);
  if (Array.isArray(raw.points) && points.length < 2) return [];
  block.data = {
    ...data,
    ...(Array.isArray(raw.points) ? { points } : {}),
    ...((raw.color ?? raw.strokeColor) !== undefined ? { strokeColor: raw.color ?? raw.strokeColor } : {}),
    ...(raw.tool !== undefined ? { tool: raw.tool } : {}),
    ...((raw.strokeWidth ?? raw.width) !== undefined ? { strokeWidth: Number(raw.strokeWidth ?? raw.width) } : {}),
    ...(raw.opacity !== undefined ? { opacity: Number(raw.opacity) > 1 ? Number(raw.opacity) / 100 : Number(raw.opacity) } : {}),
  };
  block.updatedAt = now();
  return [targetId];
}
