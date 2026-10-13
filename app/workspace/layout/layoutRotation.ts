import type { BlockId, MapLayoutSettings } from "../types/block";

type Point = { x: number; y: number };
type RectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;

export interface WorkspaceLayoutRotationContext {
  pivot: Point;
  angle: number;
}

export function normalizeWorkspaceLayoutAngle(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export function hasCustomWorkspaceLayoutAngle(layout: Pick<MapLayoutSettings, "family" | "layoutAngle">): boolean {
  if (layout.family !== "hierarchy" && layout.family !== "timeline") return false;
  if (!Number.isFinite(layout.layoutAngle)) return false;
  const angle = normalizeWorkspaceLayoutAngle(layout.layoutAngle!);
  return ![0, 90, -90, 180, -180].includes(angle);
}

function rotate(point: Point, pivot: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

export function createWorkspaceLayoutRotationContext(
  layout: Pick<MapLayoutSettings, "family" | "layoutAngle">,
  rootRect: RectLike | null,
): WorkspaceLayoutRotationContext | null {
  if (!rootRect || !hasCustomWorkspaceLayoutAngle(layout)) return null;
  return {
    pivot: { x: rootRect.left + rootRect.width / 2, y: rootRect.top },
    angle: normalizeWorkspaceLayoutAngle(layout.layoutAngle!),
  };
}

export function inverseRotateWorkspacePoint(point: Point, context: WorkspaceLayoutRotationContext): Point {
  return rotate(point, context.pivot, -context.angle);
}

/** Convert the axis-aligned box used by Workspace back to the pre-rotation
 * box used by the native layout. Legacy rotates each node's top-center anchor
 * and keeps the node rectangle axis-aligned, so only that anchor is inverse-
 * rotated here. */
export function inverseRotateWorkspaceRect(rect: RectLike, context: WorkspaceLayoutRotationContext): DOMRect {
  const topCenter = inverseRotateWorkspacePoint(
    { x: rect.left + rect.width / 2, y: rect.top },
    context,
  );
  return new DOMRect(topCenter.x - rect.width / 2, topCenter.y, rect.width, rect.height);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatPoint(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`;
}

const COMMAND_ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4 };

/** Rotate an SVG path's geometry, including control points. Workspace emits
 * absolute path commands, but accepting relative commands keeps this helper
 * safe for imported/manual paths too. */
export function rotateWorkspacePathD(d: string, context: WorkspaceLayoutRotationContext): string {
  const segments = d.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  const output: string[] = [];
  for (const segment of segments) {
    const rawCommand = segment[0];
    const command = rawCommand.toUpperCase();
    const relative = rawCommand !== command;
    if (command === "Z") {
      output.push("Z");
      current = subpathStart;
      continue;
    }
    const arity = COMMAND_ARITY[command];
    const values = segment.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    if (!arity) {
      output.push(segment);
      continue;
    }
    for (let offset = 0; offset + arity <= values.length; offset += arity) {
      const numbers = values.slice(offset, offset + arity);
      const absolutePoint = (x: number, y: number): Point => ({
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
      });
      if (command === "H" || command === "V") {
        const point = command === "H"
          ? absolutePoint(numbers[0], relative ? 0 : current.y)
          : absolutePoint(relative ? 0 : current.x, numbers[0]);
        output.push(`L ${formatPoint(rotate(point, context.pivot, context.angle))}`);
        current = point;
        continue;
      }
      const points: Point[] = [];
      for (let index = 0; index < arity / 2; index += 1) {
        points.push(absolutePoint(numbers[index * 2], numbers[index * 2 + 1]));
      }
      const renderedCommand = command === "M" && output.length > 0 ? "L" : command;
      output.push(`${renderedCommand} ${points.map((point) => formatPoint(rotate(point, context.pivot, context.angle))).join(" ")}`);
      current = points[points.length - 1];
      if (command === "M") subpathStart = current;
    }
  }
  return output.join(" ");
}

/** Intersects a ray from a rectangle's top-center anchor through `toward`
 * with the rectangle edge, matching the legacy endpoint re-projection pass. */
export function workspaceRectangleEdgePoint(rect: RectLike, toward: Point): Point {
  const center = { x: rect.left + rect.width / 2, y: rect.top };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return center;
  const scale = 1 / Math.max(
    Math.abs(dx) / Math.max(rect.width / 2, 0.001),
    Math.abs(dy) / Math.max(rect.height / 2, 0.001),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function replacePathEndpoint(d: string, start: Point | null, end: Point | null): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const isCommand = (token: string) => /^[A-Za-z]$/.test(token);
  const firstCommand = tokens.findIndex((token) => token.toUpperCase() === "M");
  if (start && firstCommand >= 0 && firstCommand + 2 < tokens.length) {
    tokens[firstCommand + 1] = String(round(start.x));
    tokens[firstCommand + 2] = String(round(start.y));
  }
  if (end) {
    let commandIndex = -1;
    tokens.forEach((token, index) => { if (isCommand(token)) commandIndex = index; });
    const command = tokens[commandIndex]?.toUpperCase();
    const arity = COMMAND_ARITY[command] ?? (command === "A" ? 7 : 0);
    if (commandIndex >= 0 && arity >= 2 && commandIndex + arity < tokens.length) {
      tokens[commandIndex + arity - 1] = String(round(end.x));
      tokens[commandIndex + arity] = String(round(end.y));
    }
  }
  return tokens.join(" ");
}

export function reprojectRotatedWorkspacePath(
  pathD: string,
  context: WorkspaceLayoutRotationContext,
  fromRect: RectLike,
  toRect: RectLike,
): { pathD: string; start: Point; end: Point } {
  const start = workspaceRectangleEdgePoint(fromRect, { x: toRect.left + toRect.width / 2, y: toRect.top });
  const end = workspaceRectangleEdgePoint(toRect, { x: fromRect.left + fromRect.width / 2, y: fromRect.top });
  return { pathD: replacePathEndpoint(rotateWorkspacePathD(pathD, context), start, end), start, end };
}

/** Rotates auto-layout positions around the root's top-center anchor. Blocks
 * remain axis-aligned, matching the legacy map-angle behavior. */
export function applyWorkspaceLayoutRotation(
  positions: Map<BlockId, Point>,
  rootId: BlockId,
  sizes: ReadonlyMap<BlockId, { w: number; h: number }>,
  layout: Pick<MapLayoutSettings, "family" | "layoutAngle">,
): Map<BlockId, Point> {
  if (!hasCustomWorkspaceLayoutAngle(layout)) return positions;
  const root = positions.get(rootId);
  const rootSize = sizes.get(rootId);
  if (!root || !rootSize) return positions;
  const angle = normalizeWorkspaceLayoutAngle(layout.layoutAngle!);
  const pivot = { x: root.x + rootSize.w / 2, y: root.y };
  const rotated = new Map<BlockId, Point>();
  positions.forEach((position, id) => {
    const size = sizes.get(id);
    if (!size) return;
    const center = rotate({ x: position.x + size.w / 2, y: position.y }, pivot, angle);
    rotated.set(id, { x: center.x - size.w / 2, y: center.y });
  });
  return rotated;
}
