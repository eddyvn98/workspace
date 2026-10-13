import type { CanvasBlock, Position, Transform } from "../types/block";

export type WorkspacePathCadCommand = "move" | "copy" | "rotate" | "transform" | "offset" | "mirror";

export function cadDelta(base: Position, target: Position) {
  return { x: target.x - base.x, y: target.y - base.y };
}

export function scalePathPoints(points: Position[], from: Transform, to: Transform): Position[] {
  const scaleX = from.w > 0 ? to.w / from.w : 1;
  const scaleY = from.h > 0 ? to.h / from.h : 1;
  return points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
}

function cadScale(base: Position, target: Position) {
  return Math.max(0.1, Math.min(10, Math.hypot(target.x - base.x, target.y - base.y) / 50));
}

function cadRotation(base: Position, target: Position, initial: Position | null) {
  const start = initial ?? base;
  return (Math.atan2(target.y - base.y, target.x - base.x) - Math.atan2(start.y - base.y, start.x - base.x)) * 180 / Math.PI;
}

export function previewPathTransform(
  transform: Transform,
  command: WorkspacePathCadCommand,
  base: Position,
  target: Position,
  initial: Position | null,
): Transform {
  const { x, y } = cadDelta(base, target);
  if (command === "move" || command === "copy" || command === "offset") {
    return { ...transform, x: transform.x + x, y: transform.y + y };
  }
  if (command === "rotate") return { ...transform, rotation: transform.rotation + cadRotation(base, target, initial) };
  if (command === "transform") {
    const scale = cadScale(base, target);
    return { ...transform, w: Math.max(40, transform.w * scale), h: Math.max(30, transform.h * scale) };
  }
  return transform;
}

export function previewPathPoints(
  block: CanvasBlock<"path">,
  command: WorkspacePathCadCommand,
): Position[] {
  if (command !== "mirror") return block.data.points;
  const transform = block.transform.override ?? block.transform.computed;
  const width = transform?.w ?? 160;
  return block.data.points.map((point) => ({ x: width - point.x, y: point.y }));
}
