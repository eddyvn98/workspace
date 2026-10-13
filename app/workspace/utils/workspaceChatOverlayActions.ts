import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  createBlockId,
  createDualTransform,
  resolveTransform,
  type CanvasBlock,
  type Position,
  type ShapeKind,
} from "../types/block";
import { asNumber, asRecord } from "./workspaceChatResolver";

type OverlayAction =
  | "create_shape" | "update_shape" | "delete_shape" | "duplicate_shape"
  | "create_freehand" | "update_freehand" | "delete_freehand" | "duplicate_freehand";

const SHAPE_ALIASES: Record<string, ShapeKind> = {
  rounded: "rounded", pill: "pill", underline: "underline", circle: "circle", oval: "oval",
  rounded_rect: "rounded_rect", rectangle: "rectangle", square: "rectangle", diamond: "diamond",
  triangle: "triangle", hexagon: "hexagon", parallelogram: "parallelogram", star: "star",
  speech_bubble: "speech_bubble", cylinder: "cylinder", cloud_rect: "cloud_rect",
  sticky_note: "sticky_note", sticky: "sticky", text: "plain_text",
};

function payload(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = raw[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : raw;
}

function number(value: unknown, fallback: number): number {
  return asNumber(value) ?? fallback;
}

function blockId(raw: Record<string, unknown>, key: "shape" | "stroke"): string | undefined {
  const nested = payload(raw, key);
  const value = key === "shape"
    ? raw.shapeId ?? nested.id ?? raw.id
    : raw.strokeId ?? nested.id ?? raw.id;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nextZIndex(): number {
  const state = useWorkspaceStore.getState();
  return Object.values(state.blocks).reduce((max, block) =>
    Math.max(max, resolveTransform(block.transform, { x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0 }).zIndex), 0) + 1;
}

function shapeStyle(source: Record<string, unknown>) {
  const style: CanvasBlock["style"] = {};
  if (typeof source.bgColor === "string") style.backgroundColor = source.bgColor;
  if (typeof source.bgOpacity === "number") style.backgroundOpacity = source.bgOpacity > 1 ? source.bgOpacity / 100 : source.bgOpacity;
  if (typeof source.borderColor === "string") style.borderColor = source.borderColor;
  if (typeof source.textColor === "string") style.textColor = source.textColor;
  if (source.borderWidth !== undefined) {
    const width = number(source.borderWidth, 1);
    if (width === 1 || width === 1.5 || width === 2 || width === 3) style.borderWidth = width;
  }
  if (source.borderDash === "solid" || source.borderDash === "dashed" || source.borderDash === "dotted") style.borderDash = source.borderDash;
  return Object.keys(style).length ? style : undefined;
}

/** `text`/`label` was accepted by the JSON-Schema tool description but
 *  silently dropped here — a shape block DOES support a `label` (see
 *  CanvasBlock's `shape: { shapeKind; label? }`), it just was never read
 *  from the model's payload, so an AI-created shape could show a color but
 *  never a name — indistinguishable on canvas from every other shape of the
 *  same color. */
function shapeLabel(source: Record<string, unknown>): string | undefined {
  return typeof source.text === "string" ? source.text : typeof source.label === "string" ? source.label : undefined;
}

function shapeData(source: Record<string, unknown>): { shapeKind: ShapeKind; label?: string } | undefined {
  const rawKind = typeof source.shapeType === "string" ? source.shapeType : typeof source.shapeKind === "string" ? source.shapeKind : undefined;
  const shapeKind = rawKind ? SHAPE_ALIASES[rawKind] : undefined;
  if (!shapeKind) return undefined;
  const label = shapeLabel(source);
  return label !== undefined ? { shapeKind, label } : { shapeKind };
}

function shapeTransform(source: Record<string, unknown>, zIndex: number) {
  return createDualTransform({
    x: number(source.x, 120), y: number(source.y, 120),
    w: Math.max(1, number(source.width ?? source.w, 180)),
    h: Math.max(1, number(source.height ?? source.h, 80)),
    rotation: number(source.rotation, 0), zIndex,
  });
}

/** AI shape calls often omit coordinates even though the tool schema makes
 * them optional. A fixed fallback is fine for one shape, but every following
 * shape then lands on the exact same pixel. Find a deterministic free slot at
 * the right of the current canvas; explicit model coordinates still win. */
function shapePosition(source: Record<string, unknown>): { x: number; y: number } {
  const hasX = asNumber(source.x) !== undefined;
  const hasY = asNumber(source.y) !== undefined;
  if (hasX && hasY) return { x: asNumber(source.x)!, y: asNumber(source.y)! };

  const blocks = Object.values(useWorkspaceStore.getState().blocks);
  if (blocks.length === 0) return { x: 120, y: 120 };
  const rightEdge = blocks.reduce((max, block) => {
    const transform = resolveTransform(block.transform, { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 });
    return Math.max(max, transform.x + transform.w);
  }, 120);
  const top = blocks.reduce((min, block) => {
    const transform = resolveTransform(block.transform, { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 });
    return Math.min(min, transform.y);
  }, 120);
  return {
    x: hasX ? asNumber(source.x)! : rightEdge + 72,
    y: hasY ? asNumber(source.y)! : Math.max(120, top),
  };
}

function shapeTransformAt(source: Record<string, unknown>, zIndex: number, position: { x: number; y: number }) {
  const transform = shapeTransform(source, zIndex);
  const resolved = transform.override!;
  return createDualTransform({ ...resolved, ...position });
}

function pointsFrom(source: Record<string, unknown>): Position[] {
  if (!Array.isArray(source.points)) return [];
  return source.points.flatMap((point) => {
    const value = asRecord(point);
    const x = asNumber(value.x);
    const y = asNumber(value.y);
    return x !== undefined && y !== undefined ? [{ x, y }] : [];
  }).slice(0, 2000);
}

function pathBlock(source: Record<string, unknown>, id: string, zIndex: number): CanvasBlock<"path"> | undefined {
  const points = pointsFrom(source);
  if (!points.length) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const padding = 8;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    id,
    type: "path",
    transform: createDualTransform({ x: minX - padding, y: minY - padding, w: Math.max(16, maxX - minX + padding * 2), h: Math.max(16, maxY - minY + padding * 2), rotation: 0, zIndex }),
    data: {
      points: points.map((point) => ({ x: point.x - minX + padding, y: point.y - minY + padding })),
      strokeColor: typeof source.color === "string" ? source.color : typeof source.strokeColor === "string" ? source.strokeColor : "#3b82f6",
      strokeWidth: Math.max(1, number(source.width ?? source.strokeWidth, 4)),
      tool: typeof source.tool === "string" ? source.tool as CanvasBlock<"path">["data"]["tool"] : "pen",
      opacity: Math.max(0, Math.min(1, number(source.opacity, 100) > 1 ? number(source.opacity, 100) / 100 : number(source.opacity, 1))),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function updateShape(raw: Record<string, unknown>, id: string): boolean {
  const state = useWorkspaceStore.getState();
  const current = state.blocks[id];
  if (!current || current.type !== "shape") return false;
  const source = payload(raw, "shape");
  const data = shapeData(source);
  const style = shapeStyle(source);
  // A label-only update (no shapeType given) doesn't match shapeData's own
  // shapeKind requirement — merge the label onto the existing data directly
  // so "rename this shape" doesn't require also re-stating its shapeKind.
  const label = data ? undefined : shapeLabel(source);
  const nextData = data ?? (label !== undefined ? { ...current.data, label } : undefined);
  if (nextData) state.updateBlock(id, { data: nextData, ...(style ? { style: { ...current.style, ...style } } : {}) });
  else if (style) state.updateBlock(id, { style: { ...current.style, ...style } });
  const transform = resolveTransform(current.transform, { x: 0, y: 0, w: 180, h: 80, rotation: 0, zIndex: 0 });
  const hasGeometry = ["x", "y", "width", "height", "w", "h", "rotation"].some((key) => source[key] !== undefined);
  if (hasGeometry) state.updateBlockTransform(id, { x: number(source.x, transform.x), y: number(source.y, transform.y), w: Math.max(1, number(source.width ?? source.w, transform.w)), h: Math.max(1, number(source.height ?? source.h, transform.h)), rotation: number(source.rotation, transform.rotation) }, "override");
  return Boolean(nextData || style || hasGeometry);
}

export function applyWorkspaceOverlayAction(raw: Record<string, unknown>): string[] {
  const type = String(raw.type ?? "").toLowerCase() as OverlayAction;
  const state = useWorkspaceStore.getState();
  if (type === "create_shape") {
    const source = payload(raw, "shape");
    const id = blockId(raw, "shape") && !state.blocks[blockId(raw, "shape")!] ? blockId(raw, "shape")! : createBlockId();
    const data = shapeData(source);
    if (!data) return [];
    const now = Date.now();
    const position = shapePosition(source);
    state.addBlock({ id, type: "shape", transform: shapeTransformAt(source, nextZIndex(), position), data, style: shapeStyle(source), createdAt: now, updatedAt: now });
    state.setSelection([id]);
    return [id];
  }
  if (type === "update_shape") {
    const id = blockId(raw, "shape");
    return id && updateShape(raw, id) ? [id] : [];
  }
  if (type === "delete_shape") {
    const id = blockId(raw, "shape");
    if (!id || state.blocks[id]?.type !== "shape") return [];
    state.removeBlock(id);
    return [id];
  }
  if (type === "duplicate_shape") {
    const sourceId = blockId(raw, "shape");
    const source = sourceId ? state.blocks[sourceId] : undefined;
    if (!source || source.type !== "shape") return [];
    const transform = resolveTransform(source.transform, { x: 0, y: 0, w: 180, h: 80, rotation: 0, zIndex: 0 });
    const id = createBlockId();
    const now = Date.now();
    state.addBlock({ ...source, id, transform: createDualTransform({ ...transform, x: transform.x + number(raw.offsetX, 24), y: transform.y + number(raw.offsetY, 24), zIndex: nextZIndex() }), createdAt: now, updatedAt: now });
    state.setSelection([id]);
    return [id];
  }
  const source = payload(raw, "stroke");
  if (type === "create_freehand") {
    const block = pathBlock(source, blockId(raw, "stroke") && !state.blocks[blockId(raw, "stroke")!] ? blockId(raw, "stroke")! : createBlockId(), nextZIndex());
    if (!block) return [];
    state.addBlock(block); state.setSelection([block.id]); return [block.id];
  }
  const id = blockId(raw, "stroke");
  const current = id ? state.blocks[id] : undefined;
  if (!id || !current || current.type !== "path") return [];
  const currentPath = current as CanvasBlock<"path">;
  if (type === "delete_freehand") { state.removeBlock(id); return [id]; }
  if (type === "duplicate_freehand") {
    const transform = resolveTransform(currentPath.transform, { x: 0, y: 0, w: 16, h: 16, rotation: 0, zIndex: 0 });
    const copyId = createBlockId();
    state.addBlock({ ...current, id: copyId, transform: createDualTransform({ ...transform, x: transform.x + number(raw.offsetX, 24), y: transform.y + number(raw.offsetY, 24), zIndex: nextZIndex() }), createdAt: Date.now(), updatedAt: Date.now() });
    state.setSelection([copyId]); return [copyId];
  }
  if (type === "update_freehand") {
    const points = pointsFrom(source);
    const patch: Partial<CanvasBlock<"path">["data"]> = {};
    if (points.length) {
      const next = pathBlock(source, id, resolveTransform(currentPath.transform, { x: 0, y: 0, w: 16, h: 16, rotation: 0, zIndex: 0 }).zIndex);
      if (next) {
        const nextData = { ...currentPath.data, points: next.data.points };
        if (typeof source.color === "string") nextData.strokeColor = source.color;
        if (source.width !== undefined) nextData.strokeWidth = Math.max(1, number(source.width, nextData.strokeWidth ?? 4));
        if (source.opacity !== undefined) nextData.opacity = Math.max(0, Math.min(1, number(source.opacity, 1) > 1 ? number(source.opacity, 1) / 100 : number(source.opacity, 1)));
        if (typeof source.tool === "string") nextData.tool = source.tool as typeof nextData.tool;
        state.updateBlock(id, { data: nextData });
        state.updateBlockTransform(id, { ...resolveTransform(next.transform, resolveTransform(currentPath.transform, { x: 0, y: 0, w: 16, h: 16, rotation: 0, zIndex: 0 })) }, "override");
        return [id];
      }
    }
    if (typeof source.color === "string") patch.strokeColor = source.color;
    if (source.width !== undefined) patch.strokeWidth = Math.max(1, number(source.width, currentPath.data.strokeWidth ?? 4));
    if (source.opacity !== undefined) patch.opacity = Math.max(0, Math.min(1, number(source.opacity, 1) > 1 ? number(source.opacity, 1) / 100 : number(source.opacity, 1)));
    if (typeof source.tool === "string") patch.tool = source.tool as CanvasBlock<"path">["data"]["tool"];
    if (!Object.keys(patch).length) return [];
    state.updateBlock(id, { data: { ...current.data, ...patch } }); return [id];
  }
  return [];
}
