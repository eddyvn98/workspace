import { applyPresentationView } from "./viewPresentation";
import type { AgentBoardState } from "./operationsCore";
import type { JsonMap } from "./operationsTables";
import { fittedCamera, FIT_VIEWPORT, resolveFrameCamera, resolveNamedBlockIds } from "./frameOperations";
import type { ActionOutcome } from "./slideFields";
import { WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM } from "@/app/workspace/utils/viewportConstants";

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function value(raw: JsonMap, key: string): unknown {
  return raw[key] ?? record(raw.params)[key];
}

function number(raw: JsonMap, key: string): number | undefined {
  const parsed = Number(value(raw, key));
  return value(raw, key) !== undefined && value(raw, key) !== "" && Number.isFinite(parsed) ? parsed : undefined;
}

const clampZoom = (zoom: number) => Math.min(WORKSPACE_MAX_ZOOM, Math.max(WORKSPACE_MIN_ZOOM, zoom));

function namesBlocks(raw: JsonMap): boolean {
  return ["blockId", "target", "blockIds", "targetIds", "ids", "fitBlockIds"].some((key) => {
    const found = value(raw, key);
    return Array.isArray(found) ? found.length > 0 : typeof found === "string" && found.trim() !== "";
  });
}

/**
 * focus_view moves the persisted board camera, the same state a user changes
 * by panning and zooming. mode: fit (all blocks, or the named ones), focus
 * (centre the named blocks at an optional zoom), zoom (absolute zoom, or
 * factor relative to the current zoom, around the viewport centre) and pan
 * (dx/dy in canvas units, positive moves the view right/down). The selection
 * request travels with the camera so the open canvas can select the same
 * blocks once it adopts the new board.
 */
export function applyViewAction(state: JsonMap, raw: JsonMap, out: ActionOutcome = {}): { changed: boolean; ids: string[] } {
  if (value(raw, "mode") === "present") {
    const result = applyPresentationView(state as AgentBoardState, raw); out.reason = result.reason; return result;
  }
  const current = record(state.camera);
  const target = resolveFrameCamera(state, raw);
  if (target.named) {
    // A saved presentation frame: adopt its stored camera, the same view a user gets by clicking the frame.
    if (!target.frame || !target.camera) {
      out.reason = target.reason;
      return { changed: false, ids: [] };
    }
    const prior = Number(record(current.focus).seq) || 0;
    state.camera = { ...current, ...target.camera, activeFrameId: target.frame.id, focus: { seq: prior + 1, mode: "frame", blockIds: [], frameId: target.frame.id } };
    return { changed: true, ids: [target.frame.id] };
  }
  const previous = { x: Number(current.x) || 0, y: Number(current.y) || 0, zoom: Number(current.zoom) > 0 ? Number(current.zoom) : 1 };
  const requested = String(value(raw, "mode") ?? (namesBlocks(raw) ? "focus" : "fit")).toLowerCase();
  const named = namesBlocks(raw);
  const requestedZoom = number(raw, "zoom");
  let next: { x: number; y: number; zoom: number } | undefined;
  let blockIds: string[] = [];
  let fitIds: string[] = [];

  if (requested === "fit" || requested === "focus") {
    const fitted = fittedCamera(state, raw, named);
    if (!fitted) {
      out.reason = named ? "None of the named blocks matched (use exact block ids or unique labels)." : "The board has no blocks to fit.";
      return { changed: false, ids: [] };
    }
    next = { x: Number(fitted.x), y: Number(fitted.y), zoom: Number(fitted.zoom) };
    if (requested === "focus" && requestedZoom !== undefined) {
      // Keep the fitted centre while applying the requested zoom.
      const centerX = (FIT_VIEWPORT.width / 2 - next.x) / next.zoom;
      const centerY = (FIT_VIEWPORT.height / 2 - next.y) / next.zoom;
      const zoom = clampZoom(requestedZoom);
      next = { x: FIT_VIEWPORT.width / 2 - centerX * zoom, y: FIT_VIEWPORT.height / 2 - centerY * zoom, zoom };
    }
    fitIds = named ? selectedIds(state, raw) : [];
    blockIds = fitIds;
    // "Fit everything and select X": the selection list does not change what the camera frames.
    const chosen = selectionList(state, raw);
    if (chosen.length > 0) blockIds = chosen;
  } else if (requested === "zoom") {
    const factor = number(raw, "factor");
    const zoom = requestedZoom !== undefined ? clampZoom(requestedZoom) : factor !== undefined && factor > 0 ? clampZoom(previous.zoom * factor) : undefined;
    if (zoom === undefined) return { changed: false, ids: [] };
    const centerX = (FIT_VIEWPORT.width / 2 - previous.x) / previous.zoom;
    const centerY = (FIT_VIEWPORT.height / 2 - previous.y) / previous.zoom;
    next = { x: FIT_VIEWPORT.width / 2 - centerX * zoom, y: FIT_VIEWPORT.height / 2 - centerY * zoom, zoom };
  } else if (requested === "pan") {
    const dx = number(raw, "dx");
    const dy = number(raw, "dy");
    if (dx === undefined && dy === undefined) return { changed: false, ids: [] };
    next = { x: previous.x - (dx ?? 0) * previous.zoom, y: previous.y - (dy ?? 0) * previous.zoom, zoom: previous.zoom };
  } else {
    out.reason = `Unknown focus_view mode "${requested}". Use fit, focus, zoom or pan, or pass frameId/frameName.`;
    return { changed: false, ids: [] };
  }

  if (requested === "zoom" || requested === "pan") blockIds = selectionList(state, raw);
  const select = value(raw, "select");
  const prior = Number(record(current.focus).seq) || 0;
  state.camera = {
    ...current,
    ...next,
    activeFrameId: null,
    focus: { seq: prior + 1, mode: requested, blockIds: select === false ? [] : blockIds, ...(fitIds.length > 0 ? { fitIds } : {}), ...((requested === "focus" && requestedZoom !== undefined) || requested === "zoom" ? { zoom: next.zoom } : {}) },
  };
  return { changed: true, ids: blockIds.length > 0 ? blockIds : ["camera"] };
}

/** Exact ids, or labels naming exactly one block, in the order given. */
function selectedIds(state: JsonMap, raw: JsonMap): string[] {
  const blocks = record(state.blocks);
  const names = ["blockId", "target", "blockIds", "targetIds", "ids", "fitBlockIds"].flatMap((key) => {
    const found = value(raw, key);
    return Array.isArray(found) ? found.map(String) : typeof found === "string" ? [found] : [];
  });
  return [...new Set(resolveNamedBlockIds(blocks, names))];
}

/** Blocks to select without changing what the camera frames (selectBlockIds). */
function selectionList(state: JsonMap, raw: JsonMap): string[] {
  const found = value(raw, "selectBlockIds");
  const names = Array.isArray(found) ? found.map(String) : typeof found === "string" ? [found] : [];
  return [...new Set(resolveNamedBlockIds(record(state.blocks), names))];
}
