import type { AnchorSide } from "../../types/connector";
import { center, dedupe, routeAvoidsExisting, routeIsClear } from "./geometry";
import { bestSemanticOrthogonalRoute, routeNearbyOrthogonal } from "./routeCandidates";
import type { SemanticDiagramDirection, SemanticDiagramEdge, SemanticDiagramRect, SemanticDiagramRoute } from "./types";

const CHANNEL_GAP = 48;

export function routeEdges(
  edges: SemanticDiagramEdge[],
  positions: Map<string, SemanticDiagramRect>,
  ranks: Map<string, number>,
  direction: SemanticDiagramDirection,
): Map<number, SemanticDiagramRoute> {
  const routes = new Map<number, SemanticDiagramRoute>();
  const rects = [...positions.values()];
  const minX = Math.min(...rects.map((rect) => rect.x));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));

  const isDirect = (edge: SemanticDiagramEdge): boolean => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return false;
    const delta = (ranks.get(edge.to) ?? 0) - (ranks.get(edge.from) ?? 0);
    return direction === "down" ? delta === 1 && to.y > from.y : delta === 1 && to.x > from.x;
  };
  const edgeOrder = edges.map((_, index) => index).sort((a, b) => Number(!isDirect(edges[a])) - Number(!isDirect(edges[b])) || a - b);
  edgeOrder.forEach((edgeIndex) => {
    const edge = edges[edgeIndex];
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    const fromCentre = center(from);
    const toCentre = center(to);
    const rankDelta = (ranks.get(edge.to) ?? 0) - (ranks.get(edge.from) ?? 0);

    if (direction === "down") {
      const direct = rankDelta === 1 && to.y > from.y;
      if (direct) {
        const start = { x: fromCentre.x, y: from.y + from.h };
        const end = { x: toCentre.x, y: to.y };
        const channelY = (start.y + end.y) / 2;
        routes.set(edgeIndex, {
          fromSide: "bottom",
          toSide: "top",
          waypoints: dedupe([{ x: start.x, y: channelY }, { x: end.x, y: channelY }]),
        });
        return;
      }

      // Positioned swimlanes often contain hand-offs between blocks that are
      // on the same visual row but in different lanes. They are not rank-
      // consecutive in the semantic graph, yet a local horizontal route is
      // still the harmonious choice. Try the same obstacle-aware local
      // candidates used by the horizontal layout before using a perimeter
      // channel as the last-resort escape hatch.
      const nearby = routeNearbyOrthogonal(edge, from, to, positions, edges, routes);
      if (nearby) {
        routes.set(edgeIndex, nearby);
        return;
      }

      // If the local visibility candidates are exhausted, try an escape
      // channel just outside the endpoint pair. It is still obstacle and
      // crossing checked, but it is bounded by this edge rather than by the
      // entire map. The map perimeter is the final emergency fallback only.
      const localChannels = [
        Math.min(from.x, to.x) - CHANNEL_GAP,
        Math.max(from.x + from.w, to.x + to.w) + CHANNEL_GAP,
      ].sort((a, b) => Math.abs(a - fromCentre.x) + Math.abs(a - toCentre.x)
        - Math.abs(b - fromCentre.x) - Math.abs(b - toCentre.x));
      for (const channelX of localChannels) {
        const fromSide: AnchorSide = channelX >= fromCentre.x ? "right" : "left";
        const toSide: AnchorSide = channelX >= toCentre.x ? "right" : "left";
        const start = { x: fromSide === "right" ? from.x + from.w : from.x, y: fromCentre.y };
        const end = { x: toSide === "right" ? to.x + to.w : to.x, y: toCentre.y };
        const points = [start, { x: channelX, y: start.y }, { x: channelX, y: end.y }, end];
        if (routeIsClear(points, edge, positions) && routeAvoidsExisting(points, edge, edges, routes, positions)) {
          routes.set(edgeIndex, { fromSide, toSide, waypoints: dedupe(points.slice(1, -1)) });
          return;
        }
      }

      // Long edges and loop-backs use dedicated outside channels only after
      // all bounded alternatives fail. This keeps them away from intermediate
      // ranks instead of drawing a diagonal slash through the graph's centre.
      const channelX = rankDelta < 0 || edgeIndex % 2 === 0
        ? maxX + CHANNEL_GAP + edgeIndex * 14
        : minX - CHANNEL_GAP - edgeIndex * 14;
      const fromSide: AnchorSide = channelX >= fromCentre.x ? "right" : "left";
      const toSide: AnchorSide = channelX >= toCentre.x ? "right" : "left";
      const start = { x: fromSide === "right" ? from.x + from.w : from.x, y: fromCentre.y };
      const end = { x: toSide === "right" ? to.x + to.w : to.x, y: toCentre.y };
      routes.set(edgeIndex, {
        fromSide,
        toSide,
        waypoints: dedupe([
          { x: channelX, y: start.y },
          { x: channelX, y: end.y },
        ]),
      });
      return;
    }

    const direct = rankDelta === 1 && to.x > from.x;
    if (direct) {
      const anchored = bestSemanticOrthogonalRoute(edge, from, to, positions, edges, routes);
      if (anchored) {
        routes.set(edgeIndex, anchored);
        return;
      }
      const start = { x: from.x + from.w, y: fromCentre.y };
      const end = { x: to.x, y: toCentre.y };
      const channelX = (start.x + end.x) / 2;
      routes.set(edgeIndex, {
        fromSide: "right",
        toSide: "left",
        waypoints: dedupe([{ x: channelX, y: start.y }, { x: channelX, y: end.y }]),
      });
      return;
    }

    // A non-consecutive forward edge (for example OTP → Home when another
    // branch occupies the intermediate rank) should still use a nearby clear
    // channel. The old global top/bottom channel made otherwise valid graphs
    // look needlessly huge and pushed loop lines off the canvas.
    const nearby = routeNearbyOrthogonal(edge, from, to, positions, edges, routes);
    if (nearby) {
      routes.set(edgeIndex, nearby);
      return;
    }

    const localChannels = [
      Math.min(from.y, to.y) - CHANNEL_GAP,
      Math.max(from.y + from.h, to.y + to.h) + CHANNEL_GAP,
    ].sort((a, b) => Math.abs(a - fromCentre.y) + Math.abs(a - toCentre.y)
      - Math.abs(b - fromCentre.y) - Math.abs(b - toCentre.y));
    for (const channelY of localChannels) {
      const fromSide: AnchorSide = channelY >= fromCentre.y ? "bottom" : "top";
      const toSide: AnchorSide = channelY >= toCentre.y ? "bottom" : "top";
      const start = { x: fromCentre.x, y: fromSide === "bottom" ? from.y + from.h : from.y };
      const end = { x: toCentre.x, y: toSide === "bottom" ? to.y + to.h : to.y };
      const points = [start, { x: start.x, y: channelY }, { x: end.x, y: channelY }, end];
      if (routeIsClear(points, edge, positions) && routeAvoidsExisting(points, edge, edges, routes, positions)) {
        routes.set(edgeIndex, { fromSide, toSide, waypoints: dedupe(points.slice(1, -1)) });
        return;
      }
    }

    const channelY = rankDelta < 0 || edgeIndex % 2 === 0
      ? maxY + CHANNEL_GAP + edgeIndex * 14
      : minY - CHANNEL_GAP - edgeIndex * 14;
    const fromSide: AnchorSide = channelY >= fromCentre.y ? "bottom" : "top";
    const toSide: AnchorSide = channelY >= toCentre.y ? "bottom" : "top";
    const start = { x: fromCentre.x, y: fromSide === "bottom" ? from.y + from.h : from.y };
    const end = { x: toCentre.x, y: toSide === "bottom" ? to.y + to.h : to.y };
    routes.set(edgeIndex, {
      fromSide,
      toSide,
      waypoints: dedupe([
        { x: start.x, y: channelY },
        { x: end.x, y: channelY },
      ]),
    });
  });
  return routes;
}
