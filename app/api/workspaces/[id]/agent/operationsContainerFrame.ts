import type { AgentBoardState } from "./operationsCore";
import { blockRect, id, now, param, record, resolveId, stringValue } from "./operationsCore";
import type { JsonMap } from "./operationsTables";

const DEFAULT_PADDING = 40;
const TITLE_HEIGHT = 32;
const TITLE_GAP = 8;

function requestedTargets(raw: JsonMap): unknown[] {
  const lists = ["targets", "targetIds", "blockIds", "ids"].map((key) => param(raw, key)).find(Array.isArray) as unknown[] | undefined;
  if (lists) return lists;
  const single = param(raw, "target") ?? param(raw, "blockId");
  return single === undefined ? [] : [single];
}

function withDescendants(state: AgentBoardState, rootIds: string[]): Set<string> {
  const found = new Set(rootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const block of Object.values(state.blocks)) {
      const parentId = stringValue(block.parentId);
      if (parentId && found.has(parentId) && !found.has(String(block.id))) { found.add(String(block.id)); grew = true; }
    }
  }
  return found;
}

/** A visible container uses independent membership when movable:true. */
export function wrapBlocksInFrame(state: AgentBoardState, raw: JsonMap): string[] {
  const scope = String(param(raw, "scope") ?? "");
  const resolved = requestedTargets(raw)
    .map((value) => resolveId({ target: value }, state))
    .filter((value): value is string => Boolean(value));
  const wholeBoard = scope === "all" || scope === "board" || (requestedTargets(raw).length === 0 && scope === "");
  if (!wholeBoard && resolved.length === 0) return [];
  const includeChildren = param(raw, "includeDescendants") !== false;
  const members = wholeBoard
    ? new Set(Object.keys(state.blocks))
    : includeChildren ? withDescendants(state, resolved) : new Set(resolved);
  const rects = [...members].map((memberId) => state.blocks[memberId]).filter(Boolean).map(blockRect);
  if (rects.length === 0) return [];

  const padding = Math.max(8, Number(param(raw, "padding")) || DEFAULT_PADDING);
  const left = Math.min(...rects.map((rect) => rect.x)) - padding;
  const top = Math.min(...rects.map((rect) => rect.y)) - padding;
  const right = Math.max(...rects.map((rect) => rect.x + rect.w)) + padding;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h)) + padding;
  const lowestLayer = Math.min(now(), ...Object.values(state.blocks).map((block) => Number(blockLayer(block))).filter(Number.isFinite));

  const frameId = id();
  const created = now();
  state.blocks[frameId] = {
    id: frameId,
    type: "shape",
    transform: { computed: null, override: { x: left, y: top, w: right - left, h: bottom - top, rotation: 0, zIndex: lowestLayer - 1 } },
    data: { shapeKind: "rectangle", label: "", ...(param(raw, "movable") === true ? { frameBlockIds: [...members], frameAutoMembership: param(raw, "autoMembership") !== false } : {}) },
    style: { backgroundColor: "transparent", borderColor: stringValue(param(raw, "color")) ?? "#64748b", borderWidth: 2, borderDash: "dashed", ...record(raw.style) },
    createdAt: created,
    updatedAt: created,
  };
  // Paint order follows blockOrder, so the frame goes first (underneath).
  state.blockOrder.unshift(frameId);
  const ids = [frameId];

  const title = stringValue(param(raw, "title")) ?? stringValue(param(raw, "text")) ?? stringValue(param(raw, "label"));
  if (title) {
    const titleId = id();
    state.blocks[titleId] = {
      id: titleId,
      type: "text",
      transform: { computed: null, override: { x: left, y: top - TITLE_HEIGHT - TITLE_GAP, w: Math.min(360, right - left), h: TITLE_HEIGHT, rotation: 0, zIndex: created } },
      data: { markdown: title, fontWeight: "bold", fontSize: 16, align: "left", padding: 0 },
      createdAt: created,
      updatedAt: created,
    };
    state.blockOrder.push(titleId);
    if (param(raw, "movable") === true) (state.blocks[frameId].data as JsonMap).frameBlockIds = [...members, titleId];
    ids.push(titleId);
  }
  return ids;
}

function blockLayer(block: JsonMap): unknown {
  const override = record(record(block.transform).override);
  return override.zIndex ?? record(record(block.transform).computed).zIndex;
}
