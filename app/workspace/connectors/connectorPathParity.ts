export interface ConnectorPathPoint {
  x: number;
  y: number;
}

const HORIZONTAL_CURVE_GAP = 65;
const VERTICAL_CURVE_GAP = 28;
const ORTHOGONAL_ENDPOINT_SNAP = 12;

function snapNearlyAlignedEndpoint(
  points: ConnectorPathPoint[],
): ConnectorPathPoint[] {
  const snapped = points.map((point) => ({ ...point }));
  const snapPair = (endpointIndex: number, waypointIndex: number) => {
    const endpoint = snapped[endpointIndex];
    const waypoint = snapped[waypointIndex];
    if (!endpoint || !waypoint || (endpoint.x === waypoint.x || endpoint.y === waypoint.y)) return;
    const deltaX = Math.abs(endpoint.x - waypoint.x);
    const deltaY = Math.abs(endpoint.y - waypoint.y);
    // Persisted semantic geometry can be a few pixels out of date after a
    // shape's measured size changes (diamonds are the common case). Snap the
    // nearly aligned axis before inserting a corrective corner; this removes
    // tiny 4–12px endpoint stubs while retaining intentional larger bends.
    if (deltaX <= ORTHOGONAL_ENDPOINT_SNAP) waypoint.x = endpoint.x;
    else if (deltaY <= ORTHOGONAL_ENDPOINT_SNAP) waypoint.y = endpoint.y;
  };
  if (snapped.length >= 2) {
    snapPair(0, 1);
    snapPair(snapped.length - 1, snapped.length - 2);
  }
  return snapped;
}

function normalizeOrthogonalPathPoints(points: ConnectorPathPoint[]): ConnectorPathPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const snappedPoints = snapNearlyAlignedEndpoint(points);
  const normalized: ConnectorPathPoint[] = [{ ...snappedPoints[0] }];
  for (const target of snappedPoints.slice(1)) {
    const previous = normalized[normalized.length - 1];
    if (previous.x === target.x && previous.y === target.y) continue;
    if (previous.x !== target.x && previous.y !== target.y) {
      const beforePrevious = normalized[normalized.length - 2];
      const previousIsVertical = beforePrevious && beforePrevious.x === previous.x;
      normalized.push(previousIsVertical
        ? { x: previous.x, y: target.y }
        : { x: target.x, y: previous.y });
    }
    normalized.push({ ...target });
    while (normalized.length >= 3) {
      const end = normalized.length - 1;
      const a = normalized[end - 2];
      const b = normalized[end - 1];
      const c = normalized[end];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) normalized.splice(end - 1, 1);
      else break;
    }
  }
  return normalized;
}

function pathFromPoints(points: ConnectorPathPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

/** Matches the legacy free-form connector geometry for all three line styles. */
export function buildConnectorPathParity(
  start: ConnectorPathPoint,
  end: ConnectorPathPoint,
  lineType: "straight" | "curved" | "orthogonal",
  waypoints: ConnectorPathPoint[] = [],
): string {
  const points = [start, ...waypoints, end];
  if (lineType === "straight") return pathFromPoints(points);
  if (lineType === "orthogonal") return pathFromPoints(normalizeOrthogonalPathPoints(points));
  if (points.length === 2) {
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    if (horizontal) {
      const direction = Math.sign(end.x - start.x) || 1;
      const offset = Math.min(HORIZONTAL_CURVE_GAP / 2, Math.abs(end.x - start.x) / 2);
      return `M ${start.x} ${start.y} C ${start.x + direction * offset} ${start.y}, ${end.x - direction * offset} ${end.y}, ${end.x} ${end.y}`;
    }
    const direction = Math.sign(end.y - start.y) || 1;
    const offset = Math.min(VERTICAL_CURVE_GAP, Math.abs(end.y - start.y) / 2);
    return `M ${start.x} ${start.y} C ${start.x} ${start.y + direction * offset}, ${end.x} ${end.y - direction * offset}, ${end.x} ${end.y}`;
  }
  return curveWithControlPoints(points);
}

/**
 * A branching parent's curved connectors share a short straight "trunk"
 * before diverging into each child, instead of each curving independently
 * from the parent's own point — matches legacy's bezierVWithSharedTrunk /
 * bezierHWithSharedTrunk (app/mindmap/hooks/layouts/bezierCurves.ts), used
 * whenever a hierarchy/mindmap-vertical parent has 2+ children.
 */
export function buildSharedTrunkCurvePath(
  start: ConnectorPathPoint,
  end: ConnectorPathPoint,
  axis: "horizontal" | "vertical",
): string {
  if (axis === "vertical") {
    const direction = Math.sign(end.y - start.y) || 1;
    const trunk = Math.min(VERTICAL_CURVE_GAP * 0.75, Math.abs(end.y - start.y) / 2);
    if (!trunk) return `M ${start.x} ${start.y}`;
    const junctionY = start.y + direction * trunk;
    const branch = Math.min(VERTICAL_CURVE_GAP * 0.75, Math.abs(end.y - junctionY) / 2);
    return `M ${start.x} ${start.y} V ${junctionY} C ${start.x} ${junctionY + direction * branch}, ${end.x} ${end.y - direction * branch}, ${end.x} ${end.y}`;
  }
  const direction = Math.sign(end.x - start.x) || 1;
  const trunk = Math.min(HORIZONTAL_CURVE_GAP / 2, Math.abs(end.x - start.x) / 2);
  if (!trunk) return `M ${start.x} ${start.y}`;
  const junctionX = start.x + direction * trunk;
  const branch = Math.min(HORIZONTAL_CURVE_GAP / 2, Math.abs(end.x - junctionX) / 2);
  return `M ${start.x} ${start.y} H ${junctionX} C ${junctionX + direction * branch} ${start.y}, ${end.x - direction * branch} ${end.y}, ${end.x} ${end.y}`;
}

/** Builds one orthogonal branch whose sibling branches share the same rail. */
export function buildSharedTrunkOrthogonalPath(
  start: ConnectorPathPoint,
  end: ConnectorPathPoint,
  axis: "horizontal" | "vertical",
): string {
  if (axis === "vertical") {
    const distance = Math.abs(end.y - start.y);
    if (!distance) return pathFromPoints([start, end]);
    const direction = Math.sign(end.y - start.y);
    const trunkY = start.y + direction * Math.min(VERTICAL_CURVE_GAP * 0.75, distance / 2);
    return pathFromPoints([start, { x: start.x, y: trunkY }, { x: end.x, y: trunkY }, end]);
  }
  const distance = Math.abs(end.x - start.x);
  if (!distance) return pathFromPoints([start, end]);
  const direction = Math.sign(end.x - start.x);
  const trunkX = start.x + direction * Math.min(HORIZONTAL_CURVE_GAP / 2, distance / 2);
  return pathFromPoints([start, { x: trunkX, y: start.y }, { x: trunkX, y: end.y }, end]);
}

function curveWithControlPoints(points: ConnectorPathPoint[]): string {
  const extended = [points[0], ...points, points[points.length - 1]];
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = extended[index];
    const p1 = extended[index + 1];
    const p2 = extended[index + 2];
    const p3 = extended[index + 3];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}
