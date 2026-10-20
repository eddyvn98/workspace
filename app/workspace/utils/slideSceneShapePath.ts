import type { SceneShapeFields } from "../types/slideSceneShape";
type Shape = SceneShapeFields & { w: number; h: number; radius?: number };
const n = (value: number) => Math.round(value * 1000) / 1000;
export function sceneShapePath(shape: Shape): string {
  const { w, h } = shape, kind = shape.shapeKind ?? (shape.radius ? "roundRect" : "rect");
  const polygon = (points: number[][]) => points.map(([x, y], index) => `${index ? "L" : "M"}${n(x * w)} ${n(y * h)}`).join(" ") + " Z";
  if (kind === "custom" && shape.shapePath) {
    const path = shape.shapePath, sx = w / path.width, sy = h / path.height;
    return path.commands.map(c => {
      if (c.type === "Z") return "Z";
      if (c.type === "C") return `C${n(c.x1 * sx)} ${n(c.y1 * sy)} ${n(c.x2 * sx)} ${n(c.y2 * sy)} ${n(c.x * sx)} ${n(c.y * sy)}`;
      if (c.type === "Q") return `Q${n(c.x1 * sx)} ${n(c.y1 * sy)} ${n(c.x * sx)} ${n(c.y * sy)}`;
      return `${c.type}${n(c.x * sx)} ${n(c.y * sy)}`;
    }).join(" ");
  }
  if (kind === "line") return `M0 0 L${n(w)} ${n(h)}`;
  if (kind === "ellipse") return `M${w / 2} 0 A${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
  if (kind === "triangle") return polygon([[0.5, 0], [1, 1], [0, 1]]);
  if (kind === "rtTriangle") return polygon([[0, 0], [1, 1], [0, 1]]);
  if (kind === "diamond") return polygon([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
  if (kind === "hexagon") return polygon([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]);
  if (kind === "pentagon") return polygon([[0.5, 0], [1, 0.382], [0.809, 1], [0.191, 1], [0, 0.382]]);
  if (kind === "octagon") return polygon([[0.293, 0], [0.707, 0], [1, 0.293], [1, 0.707], [0.707, 1], [0.293, 1], [0, 0.707], [0, 0.293]]);
  if (kind === "parallelogram") return polygon([[0.25, 0], [1, 0], [0.75, 1], [0, 1]]);
  if (kind === "trapezoid") return polygon([[0.25, 0], [0.75, 0], [1, 1], [0, 1]]);
  if (kind === "chevron") return polygon([[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1], [0.25, 0.5]]);
  const arrow = [[0, 0.25], [0.5, 0.25], [0.5, 0], [1, 0.5], [0.5, 1], [0.5, 0.75], [0, 0.75]];
  if (kind === "rightArrow") return polygon(arrow);
  if (kind === "leftArrow") return polygon(arrow.map(([x, y]) => [1 - x, y]));
  if (kind === "downArrow") return polygon(arrow.map(([x, y]) => [y, x]));
  if (kind === "upArrow") return polygon(arrow.map(([x, y]) => [y, 1 - x]));
  if (kind === "leftRightArrow") return polygon([[0, 0.5], [0.25, 0], [0.25, 0.25], [0.75, 0.25], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.75], [0.25, 0.75], [0.25, 1]]);
  if (kind === "plus") return polygon([[1 / 3, 0], [2 / 3, 0], [2 / 3, 1 / 3], [1, 1 / 3], [1, 2 / 3], [2 / 3, 2 / 3], [2 / 3, 1], [1 / 3, 1], [1 / 3, 2 / 3], [0, 2 / 3], [0, 1 / 3], [1 / 3, 1 / 3]]);
  if (kind === "star5") return polygon(Array.from({ length: 10 }, (_, i) => { const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.191 : 0.5; return [0.5 + Math.cos(angle) * r, 0.5 + Math.sin(angle) * r]; }));
  if (kind === "heart") return `M${w / 2} ${h} C${w * 0.38} ${h * 0.8} 0 ${h * 0.55} 0 ${h * 0.25} C0 ${-h * 0.1} ${w * 0.4} ${-h * 0.1} ${w / 2} ${h * 0.2} C${w * 0.6} ${-h * 0.1} ${w} ${-h * 0.1} ${w} ${h * 0.25} C${w} ${h * 0.55} ${w * 0.62} ${h * 0.8} ${w / 2} ${h} Z`;
  const r = kind === "roundRect" ? Math.min(shape.radius ?? Math.min(w, h) / 6, w / 2, h / 2) : 0;
  if (!r) return `M0 0 H${n(w)} V${n(h)} H0 Z`;
  return `M${n(r)} 0 H${n(w - r)} Q${n(w)} 0 ${n(w)} ${n(r)} V${n(h - r)} Q${n(w)} ${n(h)} ${n(w - r)} ${n(h)} H${n(r)} Q0 ${n(h)} 0 ${n(h - r)} V${n(r)} Q0 0 ${n(r)} 0 Z`;
}
export function sceneShapeDash(shape: SceneShapeFields): string | undefined {
  const width = shape.strokeWidth ?? 2;
  return shape.strokeDash === "dash" ? `${width * 4} ${width * 3}` : shape.strokeDash === "dot" ? `${width} ${width * 2}` : undefined;
}
