import type { JsonMap } from "./operationsTables";
import { fitWorkspaceCamera } from "@/app/workspace/utils/workspaceViewport";
import type { ActionOutcome } from "./slideFields";

type Frame = JsonMap & { id: string; name: string; order: number; camera: JsonMap };

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function value(raw: JsonMap, key: string): unknown {
  return raw[key] ?? record(raw.params)[key];
}

function frames(state: JsonMap): Frame[] {
  return (Array.isArray(state.frames) ? state.frames : []).map((item, index) => {
    const frame = record(item);
    return { ...frame, id: String(frame.id ?? crypto.randomUUID()), name: String(frame.name ?? `Frame ${index + 1}`), order: index, camera: record(frame.camera) } as Frame;
  });
}

/** A usable camera has finite x, y and a positive zoom; anything else is a
 *  hint (or noise) and must not be stored as the frame's view. */
function validCamera(input: unknown): JsonMap | undefined {
  const camera = record(input);
  return Number.isFinite(Number(camera.x)) && Number.isFinite(Number(camera.y)) && Number.isFinite(Number(camera.zoom)) && Number(camera.zoom) > 0
    ? { x: Number(camera.x), y: Number(camera.y), zoom: Number(camera.zoom) }
    : undefined;
}

/** A frame is addressed by exact id, or by a name (frameName, or frameId/target holding a name) that identifies exactly one frame. */
function frameId(raw: JsonMap, items: Frame[]): string | undefined {
  for (const candidate of [value(raw, "frameId"), value(raw, "id"), value(raw, "target"), value(raw, "frameName")]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (items.some((frame) => frame.id === candidate)) return candidate;
    const byName = items.filter((frame) => frame.name.trim().toLowerCase() === candidate.trim().toLowerCase());
    if (byName.length === 1) return byName[0].id;
  }
  return undefined;
}

function frameList(items: Frame[]): string {
  return items.length ? items.map((frame) => `${frame.id} ("${frame.name}")`).join(", ") : "none";
}

/** Resolves the saved camera of the frame named by frameId/frameName, for focus_view. */
export function resolveFrameCamera(state: JsonMap, raw: JsonMap): { frame?: Frame; camera?: JsonMap; named: boolean; reason?: string } {
  const named = ["frameId", "frameName"].some((key) => typeof value(raw, key) === "string" && String(value(raw, key)).trim() !== "");
  if (!named) return { named };
  const items = frames(state);
  const id = frameId(raw, items);
  const frame = items.find((item) => item.id === id);
  if (!frame) return { named, reason: `No frame matches "${String(value(raw, "frameId") ?? value(raw, "frameName"))}" (use an exact frameId or a unique frame name). Saved frames: ${frameList(items)}.` };
  const camera = (Array.isArray(frame.blockIds) ? fittedCamera(state, { blockIds: frame.blockIds }, true) : undefined) ?? validCamera(frame.camera);
  return camera ? { named, frame, camera } : { named, frame, reason: `Frame "${frame.name}" has no valid saved camera.` };
}

export const FIT_VIEWPORT = { width: 1440, height: 800 };

/** A frame is a saved camera view, so "a frame around X" means a camera that
 *  shows X. Models do not know canvas coordinates, so when they name blocks
 *  (or give no camera at all) the camera is computed here the same way the
 *  canvas's own "Zoom all" fits it. A map root brings its descendants. */
/** Each name is an exact id, or a label that identifies exactly one block. */
export function resolveNamedBlockIds(blocks: JsonMap, named: string[]): string[] {
  const labelOf = (block: JsonMap) => {
    const data = record(block.data);
    return [data.markdown, data.label, data.text, data.title].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim().toLowerCase();
  };
  return named.flatMap((name) => {
    if (name in blocks) return [name];
    const matches = Object.entries(blocks).filter(([, block]) => labelOf(record(block)) === name.trim().toLowerCase());
    return matches.length === 1 ? [matches[0][0]] : [];
  });
}

export function fittedCamera(state: JsonMap, raw: JsonMap, requireNamedBlocks = false): JsonMap | undefined {
  const blocks = record(state.blocks);
  // Models sometimes tuck the block list inside `camera` itself.
  const cameraHints = record(value(raw, "camera"));
  const named = ["fitBlockIds", "blockIds", "targetIds", "ids"].flatMap((key) => {
    const found = value(raw, key) ?? cameraHints[key];
    return Array.isArray(found) ? found.map(String) : [];
  });
  const single = ["blockId", "target"].map((key) => value(raw, key)).find((v) => typeof v === "string") as string | undefined;
  if (single) named.push(single);
  const resolved = resolveNamedBlockIds(blocks, named);
  const wanted = new Set(resolved);
  if ((named.length > 0 || requireNamedBlocks) && wanted.size === 0) return undefined;
  let grew = wanted.size > 0;
  while (grew) {
    grew = false;
    for (const [id, block] of Object.entries(blocks)) {
      const parent = record(block).parentId;
      if (!wanted.has(id) && typeof parent === "string" && wanted.has(parent)) { wanted.add(id); grew = true; }
    }
  }
  const ids = wanted.size > 0 ? [...wanted] : Object.keys(blocks);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const t = record(record(record(blocks[id]).transform).override ?? record(record(blocks[id]).transform).computed);
    const x = Number(t.x), y = Number(t.y), w = Number(t.w) || 220, h = Number(t.h) || 100;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX)) return undefined;
  return { ...fitWorkspaceCamera({ minX, minY, maxX, maxY }, FIT_VIEWPORT) };
}

export function applyFrameAction(state: JsonMap, raw: JsonMap, type: string, out: ActionOutcome = {}): boolean {
  const current = frames(state);
  const noTarget = () => { out.reason = `No frame matches the given frameId/frameName. Saved frames: ${frameList(current)}.`; return false; };
  const explicitCamera = value(raw, "camera");
  if (explicitCamera !== undefined && ["x", "y", "zoom"].some((key) => key in record(explicitCamera)) && !validCamera(explicitCamera)) { out.reason = "camera needs finite x, y and a finite positive zoom."; return false; }
  const blockInput = value(raw, "blockIds") ?? value(raw, "fitBlockIds") ?? record(explicitCamera).blockIds ?? record(explicitCamera).fitBlockIds;
  let blockIds: string[] | undefined;
  if (blockInput !== undefined) {
    if (!Array.isArray(blockInput) || !blockInput.length || blockInput.some((id) => typeof id !== "string")) { out.reason = "blockIds needs a non-empty list of exact ids or unique labels."; return false; }
    const blocks = record(state.blocks);
    const resolved = blockInput.map((id) => resolveNamedBlockIds(blocks, [String(id)])[0]);
    if (resolved.some((id) => !id)) { out.reason = "Cannot fit frame camera: every blockId must resolve to an existing block or unique label."; return false; }
    blockIds = [...new Set(resolved)] as string[];
  }
  const extra: JsonMap = {};
  for (const key of ["hiddenInPresentation", "presenterNotes"] as const) {
    const input = value(raw, key);
    if (input === undefined) continue;
    if (typeof input !== (key === "hiddenInPresentation" ? "boolean" : "string")) { out.reason = `${key} has an invalid type.`; return false; }
    extra[key] = input;
  }
  if (blockIds) extra.blockIds = blockIds;
  if (type === "create_frame") {
    const camera = validCamera(value(raw, "camera")) ?? fittedCamera(state, raw);
    if (!camera) { out.reason = "create_frame needs a camera {x, y, zoom} or blockIds/fitBlockIds (exact ids or unique labels) to frame. None resolved."; return false; }
    const created = { id: crypto.randomUUID(), name: String(value(raw, "name") ?? `Frame ${current.length + 1}`), order: current.length, camera, ...extra };
    current.push(created);
    out.ids = [created.id];
    out.summary = `created frame "${created.name}"`;
  } else if (type === "update_frame") {
    const id = frameId(raw, current);
    if (!id) return noTarget();
    const index = current.findIndex((frame) => frame.id === id);
    const camera = validCamera(value(raw, "camera")) ?? fittedCamera(state, raw, true);
    const name = value(raw, "name");
    if (explicitCamera !== undefined && !blockIds) extra.blockIds = undefined;
    current[index] = { ...current[index], ...extra, ...(typeof name === "string" ? { name } : {}), ...(camera !== undefined ? { camera: record(camera) } : {}) };
    out.ids = [id];
    out.summary = `updated frame "${current[index].name}"`;
  } else if (type === "delete_frame") {
    const id = frameId(raw, current);
    if (!id) return noTarget();
    const deleted = current.find((frame) => frame.id === id)!;
    state.frames = current.filter((frame) => frame.id !== id).map((frame, index) => ({ ...frame, order: index }));
    out.ids = [id];
    out.summary = `deleted frame "${deleted.name}"`;
    return true;
  } else if (type === "reorder_frames") {
    const requested = Array.isArray(value(raw, "frameIds")) ? (value(raw, "frameIds") as unknown[]).map(String) : [];
    if (requested.length !== current.length || requested.some((id) => !current.some((frame) => frame.id === id)) || new Set(requested).size !== current.length) {
      out.reason = `frameIds must list every saved frame exactly once. Saved frames: ${frameList(current)}.`;
      return false;
    }
    const byId = new Map(current.map((frame) => [frame.id, frame]));
    const reordered = requested.map((id, order) => ({ ...byId.get(id)!, order }));
    state.frames = reordered;
    out.ids = requested;
    out.summary = `reordered frames: ${reordered.map((frame) => `"${frame.name}"`).join(", ")}`;
    return true;
  } else {
    return false;
  }
  state.frames = current.map((frame, order) => ({ ...frame, order }));
  return true;
}
