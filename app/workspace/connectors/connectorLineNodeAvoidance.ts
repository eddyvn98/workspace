export interface WorkspaceLineNode {
  id: string;
  mapRootId: string;
  rect: { left: number; right: number; top: number; bottom: number };
}

export interface WorkspaceLinePath {
  id: string;
  fromBlockId: string;
  toBlockId: string;
  d: string;
}

const CLEARANCE = 8;
type Point = { x: number; y: number };
type Rect = WorkspaceLineNode["rect"];

function segmentRange(a: Point, b: Point, rect: Rect): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let range: [number, number] = [0, 1];
  for (const [p, q] of [
    [-dx, a.x - rect.left], [dx, rect.right - a.x],
    [-dy, a.y - rect.top], [dy, rect.bottom - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const value = q / p;
    if (p < 0) {
      if (value > range[1]) return null;
      range = [Math.max(range[0], value), range[1]];
    } else {
      if (value < range[0]) return null;
      range = [range[0], Math.min(range[1], value)];
    }
  }
  return range[0] <= range[1] ? range : null;
}

function crosses(a: Point, b: Point, rect: Rect): boolean {
  const range = segmentRange(a, b, rect);
  return Boolean(range && range[1] - range[0] > 0.001 && range[1] > 0.02 && range[0] < 0.98);
}

function detour(a: Point, b: Point, node: WorkspaceLineNode): Point[] | null {
  const rect = node.rect;
  const corners = [
    { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.bottom },
  ];
  const distance = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  return corners
    .map((corner) => ({ corner, cost: distance(a, corner) + distance(corner, b) }))
    .sort((left, right) => left.cost - right.cost)
    .map(({ corner }) => [a, corner, b])
    .find(([start, corner, end]) => !crosses(start, corner, rect) && !crosses(corner, end, rect)) ?? null;
}

function parseSimpleLine(d: string): [Point, Point] | null {
  const values = d.match(/^\s*M\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+L\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+)\s*$/i);
  if (!values) return null;
  return [{ x: Number(values[1]), y: Number(values[2]) }, { x: Number(values[3]), y: Number(values[4]) }];
}

function formatPolyline(points: Point[]): string {
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

/** Applies the legacy last-pass detour only to simple straight paths. */
export function avoidWorkspaceLineNodeOverlaps(
  paths: WorkspaceLinePath[],
  nodes: WorkspaceLineNode[],
): Map<string, string> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjusted = new Map<string, string>();
  for (const path of paths) {
    const line = parseSimpleLine(path.d);
    const source = nodeById.get(path.fromBlockId);
    if (!line || !source) continue;
    for (const node of nodes) {
      if (node.id === path.fromBlockId || node.id === path.toBlockId || node.mapRootId !== source.mapRootId) continue;
      const expanded = {
        left: node.rect.left - CLEARANCE,
        right: node.rect.right + CLEARANCE,
        top: node.rect.top - CLEARANCE,
        bottom: node.rect.bottom + CLEARANCE,
      };
      if (!crosses(line[0], line[1], expanded)) continue;
      const routed = detour(line[0], line[1], { ...node, rect: expanded });
      if (routed) {
        adjusted.set(path.id, formatPolyline(routed));
        break;
      }
    }
  }
  return adjusted;
}
