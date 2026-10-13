import type { AnchorSide } from "../../types/connector";
import { center, dedupe, nearbyChannelValues, nearbyChannelXs, pointOnSide, routeAvoidsExisting, routeCrossingCount, routeIsClear } from "./geometry";
import { isNegativeEdgeLabel } from "./branchLanes";
import type { SemanticDiagramEdge, SemanticDiagramRect, SemanticDiagramRoute } from "./types";

const ROUTE_CLEARANCE = 24;

const ROUTABLE_SIDES: Exclude<AnchorSide, "center">[] = ["top", "right", "bottom", "left"];
type DiagramPoint = { x: number; y: number };

function sideVector(side: Exclude<AnchorSide, "center">): DiagramPoint {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

/** The first and last segments must point away from the corresponding node.
 * This is the invariant that lets a route use a top/bottom port for a branch
 * instead of always falling back to the middle of the right/left edge. */
function respectsSemanticAnchors(
  points: DiagramPoint[],
  fromSide: Exclude<AnchorSide, "center">,
  toSide: Exclude<AnchorSide, "center">,
): boolean {
  const clean = dedupe(points);
  if (clean.length < 2) return false;
  const from = sideVector(fromSide);
  const to = sideVector(toSide);
  const first = { x: clean[1].x - clean[0].x, y: clean[1].y - clean[0].y };
  const last = { x: clean[clean.length - 2].x - clean[clean.length - 1].x, y: clean[clean.length - 2].y - clean[clean.length - 1].y };
  return first.x * from.x + first.y * from.y > 0
    && last.x * to.x + last.y * to.y > 0;
}

function routeBendCount(points: DiagramPoint[]): number {
  const clean = dedupe(points);
  let bends = 0;
  for (let index = 2; index < clean.length; index += 1) {
    const previous = clean[index - 2];
    const current = clean[index - 1];
    const next = clean[index];
    if ((previous.x === current.x) !== (current.x === next.x)) bends += 1;
  }
  return bends;
}

function semanticRouteCandidates(
  start: DiagramPoint,
  end: DiagramPoint,
  positions: Map<string, SemanticDiagramRect>,
): DiagramPoint[][] {
  // The old candidate set used the min/max coordinate of the whole map.
  // When the short L/U routes were blocked, that made the first valid answer
  // a perimeter route even if a small detour around the endpoint pair was
  // available. Keep the search local to the pair and add two-stage detours
  // so dense swimlanes can still find a clear route without leaving the map.
  const localMinX = Math.min(start.x, end.x) - ROUTE_CLEARANCE * 2;
  const localMaxX = Math.max(start.x, end.x) + ROUTE_CLEARANCE * 2;
  const localMinY = Math.min(start.y, end.y) - ROUTE_CLEARANCE * 2;
  const localMaxY = Math.max(start.y, end.y) + ROUTE_CLEARANCE * 2;
  const withinLocalX = (value: number): boolean => value >= localMinX && value <= localMaxX;
  const withinLocalY = (value: number): boolean => value >= localMinY && value <= localMaxY;
  const unique = (values: number[]): number[] => [...new Set(values.map((value) => Math.round(value * 2) / 2))];
  const xChannels = unique([
    start.x,
    end.x,
    (start.x + end.x) / 2,
    localMinX,
    localMaxX,
    ...[...positions.values()].flatMap((rect) => [rect.x - ROUTE_CLEARANCE, rect.x + rect.w + ROUTE_CLEARANCE]),
  ].filter(withinLocalX));
  const yChannels = unique([
    start.y,
    end.y,
    (start.y + end.y) / 2,
    localMinY,
    localMaxY,
    ...[...positions.values()].flatMap((rect) => [rect.y - ROUTE_CLEARANCE, rect.y + rect.h + ROUTE_CLEARANCE]),
  ].filter(withinLocalY));
  const candidates: DiagramPoint[][] = [
    [start, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ];

  // Horizontal-first and vertical-first local channels. These cover the
  // common same-row lane hand-off and the compact route around one obstacle.
  xChannels.forEach((x) => candidates.push(
    [start, { x, y: start.y }, { x, y: end.y }, end],
  ));
  yChannels.forEach((y) => candidates.push(
    [start, { x: start.x, y }, { x: end.x, y }, end],
  ));

  // Two-stage detours are intentionally bounded by the endpoint pair. They
  // let a route leave one port, pass a nearby obstacle, and re-enter the
  // destination port without resorting to a whole-map channel.
  xChannels.forEach((x) => yChannels.forEach((y) => candidates.push(
    [start, { x, y: start.y }, { x, y }, { x: end.x, y }, end],
  )));
  yChannels.forEach((y) => xChannels.forEach((x) => candidates.push(
    [start, { x: start.x, y }, { x, y }, { x, y: end.y }, end],
  )));

  return candidates.map((candidate) => dedupe(candidate));
}

function preferredSemanticSides(
  from: SemanticDiagramRect,
  to: SemanticDiagramRect,
  label?: string,
): { from: Exclude<AnchorSide, "center">; to: Exclude<AnchorSide, "center"> } {
  const fromCentre = center(from);
  const toCentre = center(to);
  const dx = toCentre.x - fromCentre.x;
  const dy = toCentre.y - fromCentre.y;
  // A branch one lane above/below the backbone should peel off vertically,
  // even when its destination is also one rank to the right. This is the
  // visual distinction that the old right→left-only route lost.
  // A labelled negative/OTP branch is intentionally peeled off vertically.
  // For an unlabelled cross-lane hand-off, prefer the horizontal reading even
  // when the two blocks are a little staggered vertically.
  const labelledVerticalBranch = Boolean(label && (isNegativeEdgeLabel(label) || /otp|xác thực|xac thuc|verification|authentication/i.test(label)));
  const verticalBranch = labelledVerticalBranch
    || Math.abs(dy) > Math.abs(dx) * 1.25 && Math.abs(dy) >= 64;
  if (verticalBranch) {
    return {
      from: dy < 0 ? "top" : "bottom",
      to: Math.abs(dx) >= 64 ? (dx >= 0 ? "left" : "right") : (dy < 0 ? "bottom" : "top"),
    };
  }
  if (Math.abs(dx) >= Math.abs(dy)) return { from: dx >= 0 ? "right" : "left", to: dx >= 0 ? "left" : "right" };
  return { from: dy >= 0 ? "bottom" : "top", to: dy >= 0 ? "top" : "bottom" };
}

export function bestSemanticOrthogonalRoute(
  edge: SemanticDiagramEdge,
  from: SemanticDiagramRect,
  to: SemanticDiagramRect,
  positions: Map<string, SemanticDiagramRect>,
  edges: SemanticDiagramEdge[],
  routes: Map<number, SemanticDiagramRoute>,
): SemanticDiagramRoute | undefined {
  const preferred = preferredSemanticSides(from, to, edge.label);
  const candidates: Array<{ route: SemanticDiagramRoute; score: number }> = [];
  for (const fromSide of ROUTABLE_SIDES) {
    for (const toSide of ROUTABLE_SIDES) {
      const start = pointOnSide(from, fromSide);
      const end = pointOnSide(to, toSide);
      for (const points of semanticRouteCandidates(start, end, positions)) {
        if (!respectsSemanticAnchors(points, fromSide, toSide)) continue;
        if (!routeIsClear(points, edge, positions)) continue;
        const crossingCount = routeCrossingCount(points, edge, edges, routes, positions);
        const length = points.slice(1).reduce((sum, point, index) => sum
          + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
        const bends = routeBendCount(points);
        const sidePenalty = (fromSide === preferred.from ? 0 : 180) + (toSide === preferred.to ? 0 : 90);
        const sameSidePenalty = fromSide === toSide ? 8 : 0;
        candidates.push({
          route: { fromSide, toSide, waypoints: dedupe(points.slice(1, -1)) },
          // A short wire crossing is preferable to sending a connector around
          // the whole diagram. Node collisions remain forbidden above.
          score: length + bends * 42 + sidePenalty + sameSidePenalty + crossingCount * 120,
        });
      }
    }
  }
  return candidates.sort((a, b) => a.score - b.score)[0]?.route;
}

export function routeNearbyOrthogonal(
  edge: SemanticDiagramEdge,
  from: SemanticDiagramRect,
  to: SemanticDiagramRect,
  positions: Map<string, SemanticDiagramRect>,
  edges: SemanticDiagramEdge[],
  routes: Map<number, SemanticDiagramRoute>,
): SemanticDiagramRoute | undefined {
  const semanticRoute = bestSemanticOrthogonalRoute(edge, from, to, positions, edges, routes);
  if (semanticRoute) return semanticRoute;
  const targetIsRight = to.x > from.x;
  const fromCentre = center(from);
  const toCentre = center(to);
  const fromSide: AnchorSide = targetIsRight ? "right" : "left";
  const toSide: AnchorSide = targetIsRight ? "left" : "right";
  const fromAnchor = { x: targetIsRight ? from.x + from.w : from.x, y: fromCentre.y };
  const toAnchor = { x: targetIsRight ? to.x : to.x + to.w, y: toCentre.y };
  const preferBelow = targetIsRight ? toCentre.y >= fromCentre.y : true;

  for (const channelX of nearbyChannelXs(from, to, positions)) {
    if (targetIsRight && (channelX <= fromAnchor.x || channelX >= toAnchor.x)) continue;
    if (!targetIsRight && (channelX >= fromAnchor.x || channelX <= toAnchor.x)) continue;
    for (const channelY of nearbyChannelValues(from, to, positions, preferBelow)) {
      const points = [
        fromAnchor,
        { x: channelX, y: fromAnchor.y },
        { x: channelX, y: channelY },
        { x: toAnchor.x, y: channelY },
        toAnchor,
      ];
      if (routeIsClear(points, edge, positions) && routeAvoidsExisting(points, edge, edges, routes, positions)) {
        return { fromSide, toSide, waypoints: dedupe(points.slice(1, -1)) };
      }
    }
  }
  return undefined;
}
