import type { SemanticDiagramEdge, SemanticDiagramRect, SemanticDiagramRoute } from "./semanticDiagram/types";

export interface SemanticDiagramValidationIssue {
  code: "duplicate-edge" | "overlapping-node" | "diagonal-route" | "route-through-node" | "edge-crossing";
  message: string;
  edgeIndex?: number;
  nodeKey?: string;
}
export interface SemanticDiagramValidationInput {
  edges: SemanticDiagramEdge[];
  positions: Map<string, SemanticDiagramRect>;
  routes: Map<number, SemanticDiagramRoute>;
}

export interface SemanticDiagramValidationResult {
  valid: boolean;
  issues: SemanticDiagramValidationIssue[];
}

interface Point { x: number; y: number }
interface Segment { a: Point; b: Point }

const EPSILON = 0.5;

function equal(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function pointOnSide(rect: SemanticDiagramRect, side: SemanticDiagramRoute["fromSide"]): Point {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  if (side === "top") return { x: cx, y: rect.y };
  if (side === "right") return { x: rect.x + rect.w, y: cy };
  if (side === "bottom") return { x: cx, y: rect.y + rect.h };
  if (side === "left") return { x: rect.x, y: cy };
  return { x: cx, y: cy };
}

function segmentsFor(
  edge: SemanticDiagramEdge,
  route: SemanticDiagramRoute,
  positions: Map<string, SemanticDiagramRect>,
): Segment[] {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return [];
  const points = [pointOnSide(from, route.fromSide), ...route.waypoints, pointOnSide(to, route.toSide)];
  return points.slice(1).map((point, index) => ({ a: points[index], b: point }));
}

function isAxisAligned(segment: Segment): boolean {
  return equal(segment.a.x, segment.b.x) || equal(segment.a.y, segment.b.y);
}

function overlaps(a: SemanticDiagramRect, b: SemanticDiagramRect): boolean {
  return a.x < b.x + b.w - EPSILON
    && a.x + a.w > b.x + EPSILON
    && a.y < b.y + b.h - EPSILON
    && a.y + a.h > b.y + EPSILON;
}

function segmentPassesThroughRect(segment: Segment, rect: SemanticDiagramRect): boolean {
  if (!isAxisAligned(segment)) return false;
  if (equal(segment.a.x, segment.b.x)) {
    return segment.a.x > rect.x + EPSILON
      && segment.a.x < rect.x + rect.w - EPSILON
      && Math.max(Math.min(segment.a.y, segment.b.y), rect.y + EPSILON)
        < Math.min(Math.max(segment.a.y, segment.b.y), rect.y + rect.h - EPSILON);
  }
  return segment.a.y > rect.y + EPSILON
    && segment.a.y < rect.y + rect.h - EPSILON
    && Math.max(Math.min(segment.a.x, segment.b.x), rect.x + EPSILON)
      < Math.min(Math.max(segment.a.x, segment.b.x), rect.x + rect.w - EPSILON);
}

function properIntersection(a: Segment, b: Segment): boolean {
  const aVertical = equal(a.a.x, a.b.x);
  const bVertical = equal(b.a.x, b.b.x);
  if (aVertical === bVertical) return false;
  const vertical = aVertical ? a : b;
  const horizontal = aVertical ? b : a;
  const vx = vertical.a.x;
  const vyMin = Math.min(vertical.a.y, vertical.b.y);
  const vyMax = Math.max(vertical.a.y, vertical.b.y);
  const hy = horizontal.a.y;
  const hxMin = Math.min(horizontal.a.x, horizontal.b.x);
  const hxMax = Math.max(horizontal.a.x, horizontal.b.x);
  return vx > hxMin + EPSILON && vx < hxMax - EPSILON
    && hy > vyMin + EPSILON && hy < vyMax - EPSILON;
}

function edgesShareNode(a: SemanticDiagramEdge, b: SemanticDiagramEdge): boolean {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
}

/**
 * Checks the invariants that matter after an AI graph has been converted to
 * canvas geometry. It deliberately permits a shared orthogonal spine from a
 * branching node, but rejects real crossings, diagonals and node collisions.
 */
export function validateSemanticDiagram(input: SemanticDiagramValidationInput): SemanticDiagramValidationResult {
  const issues: SemanticDiagramValidationIssue[] = [];
  const seenEdges = new Set<string>();
  input.edges.forEach((edge, edgeIndex) => {
    const edgeKey = `${edge.from}\u0000${edge.to}`;
    if (seenEdges.has(edgeKey)) {
      issues.push({ code: "duplicate-edge", edgeIndex, message: `Duplicate edge ${edge.from} → ${edge.to}` });
    }
    seenEdges.add(edgeKey);
    const route = input.routes.get(edgeIndex);
    if (!route) return;
    const segments = segmentsFor(edge, route, input.positions);
    if (segments.some((segment) => !isAxisAligned(segment))) {
      issues.push({ code: "diagonal-route", edgeIndex, message: `Edge ${edge.from} → ${edge.to} contains a diagonal segment` });
    }
    for (const [nodeKey, rect] of input.positions) {
      if (nodeKey === edge.from || nodeKey === edge.to) continue;
      if (segments.some((segment) => segmentPassesThroughRect(segment, rect))) {
        issues.push({ code: "route-through-node", edgeIndex, nodeKey, message: `Edge ${edge.from} → ${edge.to} passes through ${nodeKey}` });
        break;
      }
    }
  });

  const entries = [...input.positions.entries()];
  for (let index = 0; index < entries.length; index += 1) {
    for (let other = index + 1; other < entries.length; other += 1) {
      if (overlaps(entries[index][1], entries[other][1])) {
        issues.push({ code: "overlapping-node", nodeKey: entries[other][0], message: `Nodes ${entries[index][0]} and ${entries[other][0]} overlap` });
      }
    }
  }

  for (let index = 0; index < input.edges.length; index += 1) {
    const first = input.routes.get(index);
    if (!first) continue;
    const firstSegments = segmentsFor(input.edges[index], first, input.positions);
    for (let other = index + 1; other < input.edges.length; other += 1) {
      const second = input.routes.get(other);
      if (!second || edgesShareNode(input.edges[index], input.edges[other])) continue;
      const secondSegments = segmentsFor(input.edges[other], second, input.positions);
      if (firstSegments.some((a) => secondSegments.some((b) => properIntersection(a, b)))) {
        issues.push({ code: "edge-crossing", edgeIndex: other, message: `Edges ${input.edges[index].from} → ${input.edges[index].to} and ${input.edges[other].from} → ${input.edges[other].to} cross` });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}
