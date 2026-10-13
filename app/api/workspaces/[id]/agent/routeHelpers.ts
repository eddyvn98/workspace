import type { WorkspaceBoard } from "@prisma/client";
import { isWorkspaceCommandName } from "@/lib/workspace-command-registry";

export type JsonMap = Record<string, unknown>;

export function map(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

export function list(value: unknown): JsonMap[] {
  if (Array.isArray(value)) return value.map(map);
  return Object.values(map(value)).map(map);
}

export function id(): string {
  return crypto.randomUUID();
}

export function textOf(block: JsonMap): string {
  const data = map(block.data);
  const cells = Array.isArray(data.cells) ? data.cells.flat().join(" ") : "";
  return [data.markdown, data.label, block.description, cells]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function boardContent(board: WorkspaceBoard): JsonMap {
  return {
    title: board.title,
    blocks: board.blocks,
    blockOrder: board.blockOrder,
    connectors: board.connectors,
    camera: board.camera,
    frames: board.frames ?? [],
    treeLayoutDirection: board.treeLayoutDirection,
    treeGrowthMode: board.treeGrowthMode,
    treeLayoutFamily: board.treeLayoutFamily,
    treeTimelineBranchMode: board.treeTimelineBranchMode,
    treeTimelineDescendantStyle: board.treeTimelineDescendantStyle,
    treeCatalogDescendantStyle: board.treeCatalogDescendantStyle,
  };
}

export function agentMutationReceipt(
  board: WorkspaceBoard,
  actions: Array<{ type: string; ids: string[]; changed: boolean }>,
  previousFrames: unknown,
): JsonMap {
  const changedIds = new Set(actions.flatMap((item) => item.ids));
  const styleKeys = ["textColor", "backgroundColor", "fontSize", "fontWeight", "fontStyle", "fontUnderline", "fontStrikethrough", "align", "verticalAlign", "padding", "shapeKind"];
  const transformKeys = ["x", "y", "w", "h", "rotation", "zIndex"];
  const changedBlocks = list(board.blocks).filter((block) => changedIds.has(String(block.id))).map((block) => {
    const data = map(block.data);
    const style = map(block.style ?? data.style);
    const transform = map(map(block.transform).override ?? block.transform);
    // Text formatting (bold, italic, size, align) is stored on `data`, colors
    // on `style`; the receipt must show both or a verifier reads a bold
    // change as "not applied".
    const formatting = { ...data, ...style };
    const pickedStyle = Object.fromEntries(styleKeys.filter((key) => formatting[key] !== undefined).map((key) => [key, formatting[key]]));
    const pickedTransform = Object.fromEntries(transformKeys.filter((key) => typeof transform[key] === "number").map((key) => [key, transform[key]]));
    const summary = textOf(block).trim().slice(0, 240);
    const slideData = block.type === "slideDeck" ? map(block.data) : undefined;
    const slideOrder = Array.isArray(slideData?.slideOrder) ? slideData.slideOrder.map(String) : [];
    return {
      id: String(block.id),
      type: String(block.type ?? ""),
      ...(summary ? { summary } : block.type === "slideDeck" && typeof slideData?.title === "string" ? { summary: slideData.title } : {}),
      ...(typeof block.parentId === "string" ? { parentId: block.parentId } : {}),
      ...(Object.keys(pickedStyle).length ? { style: pickedStyle } : {}),
      ...(Object.keys(pickedTransform).length ? { transform: pickedTransform } : {}),
      ...(typeof data.shapeKind === "string" ? { shapeKind: data.shapeKind } : {}),
      ...(block.type === "slideDeck" ? {
        slideIds: slideOrder,
        slides: slideOrder.map((slideId) => ({
          id: slideId,
          name: String(map(map(slideData?.slides)[slideId]).name ?? slideId),
        })),
      } : {}),
    };
  });
  const connectorKeys = ["id", "fromBlockId", "toBlockId", "label", "strokeColor", "strokeWidth", "dashed", "arrowStart", "arrowEnd", "lineType"];
  const changedConnectors = list(board.connectors).filter((connector) => changedIds.has(String(connector.id))).map((connector) =>
    Object.fromEntries(connectorKeys.filter((key) => connector[key] !== undefined).map((key) => [key, connector[key]])),
  );
  const frameActionTypes = new Set(["create_frame", "update_frame", "delete_frame", "reorder_frames"]);
  const frameActionApplied = actions.some((item) => item.changed && frameActionTypes.has(item.type));
  const currentFrames = Array.isArray(board.frames) ? board.frames : [];
  const oldFrames = Array.isArray(previousFrames) ? previousFrames : [];
  const frameIdOf = (item: unknown, index: number) => {
    const frame = map(item);
    return String(frame.id ?? `frame-${index + 1}`);
  };
  const currentFrameIds = new Set(currentFrames.map((frame, index) => frameIdOf(frame, index)));
  const changedFrames = frameActionApplied ? currentFrames.map((item, index) => {
    const frame = map(item);
    return {
      id: frameIdOf(item, index),
      name: String(frame.name ?? frame.title ?? `Frame ${index + 1}`),
      order: Number(frame.order ?? index),
      ...(Object.keys(map(frame.camera)).length ? { camera: map(frame.camera) } : {}),
    };
  }) : undefined;
  const removedFrameIds = frameActionApplied
    ? oldFrames.map((item, index) => frameIdOf(item, index)).filter((frameId) => !currentFrameIds.has(frameId))
    : undefined;
  return {
    changedBlocks,
    changedConnectors,
    ...(changedFrames ? { changedFrames, removedFrameIds } : {}),
  };
}

export function parseAgentBody(rawBody: string): JsonMap | null {
  const candidates = [
    rawBody.trim(),
    rawBody.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
    rawBody.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        const nested = JSON.parse(parsed);
        return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as JsonMap : null;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonMap;
    } catch {
      // Try the next supported LLM output wrapper.
    }
  }
  return null;
}

export function normalizeAgentBody(body: JsonMap | null): JsonMap | null {
  if (
    body && body.success === true && !("action" in body) && !Array.isArray(body.actions)
    && Number.isInteger(body.revision) && Number.isInteger(body.blockCount) && Number.isInteger(body.connectorCount)
  ) {
    return { action: "read" };
  }
  return body;
}

export function normalizeActionTypeAlias(item: JsonMap): JsonMap {
  if (typeof item.type === "string" && item.type.length > 0) return item;
  const { action, ...rest } = item;
  return typeof action === "string" && isWorkspaceCommandName(action) ? { ...rest, type: action } : item;
}

export function normalizeAgentActions(value: unknown): JsonMap[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(map)
    .filter((item) => Object.keys(item).length > 0)
    .map(normalizeActionTypeAlias);
}

const ARRANGE_SELECTION_PARAMETERS = ["blockIds", "ids", "targets", "mode", "layout", "columns", "gap"] as const;

export function normalizeAgentActionBatch(body: JsonMap): JsonMap[] {
  const actions = normalizeAgentActions(body.actions);
  if (actions.length !== 1 || actions[0].type !== "arrange_selection") return actions;

  const action = { ...actions[0] };
  const nestedParams = map(action.params);
  for (const key of ARRANGE_SELECTION_PARAMETERS) {
    const actionValue = action[key];
    const nestedValue = nestedParams[key];
    const envelopeValue = body[key];
    if (
      (actionValue === undefined || actionValue === null)
      && (nestedValue === undefined || nestedValue === null)
      && envelopeValue !== undefined && envelopeValue !== null
    ) {
      action[key] = body[key];
    }
  }
  return [action];
}

export function createBlock(draft: JsonMap): JsonMap {
  const type = draft.type === "shape" || draft.type === "table" ? draft.type : "text";
  const now = Date.now();
  const x = typeof draft.x === "number" ? draft.x : 80;
  const y = typeof draft.y === "number" ? draft.y : 80;
  const w = typeof draft.w === "number" ? draft.w : 260;
  const h = typeof draft.h === "number" ? draft.h : 120;
  let data: JsonMap;
  if (type === "shape") {
    data = { shapeKind: typeof draft.shapeKind === "string" ? draft.shapeKind : "rounded_rect", label: String(draft.label ?? draft.markdown ?? "") };
  } else if (type === "table") {
    const rows = Math.max(1, Math.min(20, Number(draft.rows) || 2));
    const cols = Math.max(1, Math.min(20, Number(draft.cols) || 2));
    const cells = Array.isArray(draft.cells) ? draft.cells : [];
    data = { rows, cols, cells: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => String(cells[row]?.[col] ?? ""))) };
  } else {
    data = { markdown: String(draft.markdown ?? draft.text ?? draft.label ?? "") };
  }
  return {
    id: id(), type, transform: { computed: null, override: { x, y, w, h, rotation: 0, zIndex: now } },
    data, ...(typeof draft.description === "string" ? { description: draft.description } : {}),
    ...(typeof draft.icon === "string" ? { icon: draft.icon } : {}), createdAt: now, updatedAt: now,
  };
}

export function findBlock(blocks: JsonMap[], blockId: unknown): JsonMap | undefined {
  return blocks.find((block) => block.id === blockId);
}
