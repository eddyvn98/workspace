/** Bounded vector paths are data, never arbitrary SVG/HTML. Coordinates are local to the path viewBox. */
export const SCENE_SHAPES = ["rect", "roundRect", "ellipse", "triangle", "rtTriangle", "diamond", "pentagon", "hexagon", "octagon", "parallelogram", "trapezoid", "chevron", "rightArrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "star5", "plus", "heart", "line", "custom"] as const;
export type SceneShapeKind = typeof SCENE_SHAPES[number];
export type ScenePathCommand = { type: "M" | "L"; x: number; y: number } | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { type: "Q"; x1: number; y1: number; x: number; y: number } | { type: "Z" };
export interface SceneVectorPath { width: number; height: number; commands: ScenePathCommand[]; }
export interface SceneShapeFields { shapeKind?: SceneShapeKind; shapePath?: SceneVectorPath; strokeWidth?: number; strokeDash?: "solid" | "dash" | "dot"; }
export function isSceneShapeKind(value: unknown): value is SceneShapeKind { return typeof value === "string" && (SCENE_SHAPES as readonly string[]).includes(value); }
export function normalizeSceneVectorPath(value: unknown): SceneVectorPath | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const raw = value as Record<string, unknown>, num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!num(raw.width) || !num(raw.height) || raw.width < 1 || raw.height < 1 || raw.width > 1e9 || raw.height > 1e9 || !Array.isArray(raw.commands) || raw.commands.length < 2 || raw.commands.length > 256) return;
  const commands: ScenePathCommand[] = []; let hasMove = false;
  for (const value of raw.commands) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const c = value as Record<string, unknown>, type = c.type;
    if (!["M", "L", "C", "Q", "Z"].includes(String(type)) || (!hasMove && type !== "M")) return;
    if (type === "M") hasMove = true;
    const keys = type === "C" ? ["x1", "y1", "x2", "y2", "x", "y"] : type === "Q" ? ["x1", "y1", "x", "y"] : type === "Z" ? [] : ["x", "y"];
    const next: Record<string, unknown> = { type };
    for (const key of keys) { if (!num(c[key]) || Math.abs(c[key]) > 2e9) return; next[key] = c[key]; }
    commands.push(next as unknown as ScenePathCommand);
  }
  return { width: raw.width, height: raw.height, commands };
}
export function normalizeSceneShape(value: Record<string, unknown>): SceneShapeFields | undefined {
  const kind = value.shapeKind ?? (typeof value.radius === "number" && value.radius > 0 ? "roundRect" : "rect");
  if (!isSceneShapeKind(kind)) return;
  const path = value.shapePath === undefined ? undefined : normalizeSceneVectorPath(value.shapePath);
  if ((value.shapePath !== undefined && !path) || (kind === "custom" && !path)) return;
  const width = value.strokeWidth === undefined ? 2 : value.strokeWidth;
  if (typeof width !== "number" || !Number.isFinite(width) || width < 0 || width > 40) return;
  const dash = value.strokeDash ?? "solid"; if (!["solid", "dash", "dot"].includes(String(dash))) return;
  return { shapeKind: kind, ...(path ? { shapePath: path } : {}), strokeWidth: width, strokeDash: dash as SceneShapeFields["strokeDash"] };
}
export function defaultSceneVectorPath(): SceneVectorPath {
  return { width: 1000, height: 1000, commands: [{ type: "M", x: 0, y: 700 }, { type: "C", x1: 250, y1: 0, x2: 750, y2: 1000, x: 1000, y: 300 }, { type: "L", x: 1000, y: 1000 }, { type: "L", x: 0, y: 1000 }, { type: "Z" }] };
}
