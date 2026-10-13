import { validateSemanticDiagram } from "./semanticDiagramValidation";
import { assignRightwardBranchLanes, preferredRightwardBackbone, type BranchLane } from "./semanticDiagram/branchLanes";
import { sameCoordinate } from "./semanticDiagram/geometry";
import { orderLayers, rankNodes } from "./semanticDiagram/ranking";
import { routeEdges } from "./semanticDiagram/routeEdges";
import type { SemanticDiagramDirection, SemanticDiagramEdge, SemanticDiagramLayoutResult, SemanticDiagramNode, SemanticDiagramRect, SemanticDiagramRoute } from "./semanticDiagram/types";

export type { SemanticDiagramDirection, SemanticDiagramEdge, SemanticDiagramLayoutResult, SemanticDiagramNode, SemanticDiagramRect, SemanticDiagramRoute } from "./semanticDiagram/types";

const CROSS_GAP = 96;
const RANK_GAP = 96;

/**
 * Layouts a semantic graph on a regular layered grid. The graph remains
 * declarative; this function owns alignment, rank spacing and deterministic
 * orthogonal routes so neither the model nor a renderer has to guess pixels.
 */
export function layoutSemanticDiagram(
  nodes: SemanticDiagramNode[],
  edges: SemanticDiagramEdge[],
  origin: { x: number; y: number },
  direction: SemanticDiagramDirection = "down",
): SemanticDiagramLayoutResult {
  if (nodes.length === 0) return { positions: new Map(), ranks: new Map(), routes: new Map(), validation: { valid: true, issues: [] } };
  const keys = nodes.map((node) => node.key);
  const ranks = rankNodes(keys, edges);
  const layers = new Map<number, string[]>();
  keys.forEach((key) => layers.set(ranks.get(key)!, [...(layers.get(ranks.get(key)!) ?? []), key]));
  orderLayers(layers, ranks, edges);
  const labels = new Map(nodes.map((node) => [node.key, node.label ?? ""]));
  const backbone = direction === "right" ? preferredRightwardBackbone(keys, edges, ranks, labels) : new Set<string>();
  const backboneByRank = new Map<number, string>();
  backbone.forEach((key) => backboneByRank.set(ranks.get(key)!, key));

  const sizeByKey = new Map(nodes.map((node) => [node.key, { w: node.w, h: node.h }]));
  const maxRank = Math.max(...layers.keys(), 0);
  const branchLanes = direction === "right"
    ? assignRightwardBranchLanes(keys, edges, ranks, labels, backbone)
    : new Map<string, BranchLane>();
  const maxNodeHeight = Math.max(...nodes.map((node) => node.h), 0);
  const maxLaneDepth = Math.max(...[...branchLanes.values()].map((lane) => lane.index), 0);
  const regularCross = Math.max(...[...layers.values()].map((layer) => layer.reduce((sum, key) => sum + (direction === "down" ? sizeByKey.get(key)!.w : sizeByKey.get(key)!.h), 0) + Math.max(0, layer.length - 1) * CROSS_GAP));
  const maxCross = direction === "right"
    ? Math.max(regularCross, maxNodeHeight + maxLaneDepth * 2 * (maxNodeHeight + CROSS_GAP))
    : regularCross;
  const positions = new Map<string, SemanticDiagramRect>();
  let along = direction === "down" ? origin.y : origin.x;

  for (let rank = 0; rank <= maxRank; rank += 1) {
    const layer = layers.get(rank) ?? [];
    const alongSize = Math.max(...layer.map((key) => direction === "down" ? sizeByKey.get(key)!.h : sizeByKey.get(key)!.w), 0);
    const crossSize = layer.reduce((sum, key) => sum + (direction === "down" ? sizeByKey.get(key)!.w : sizeByKey.get(key)!.h), 0) + Math.max(0, layer.length - 1) * CROSS_GAP;
    const cross = (direction === "down" ? origin.x : origin.y) + (maxCross - crossSize) / 2;
    const positionedLayer = direction === "right" && backboneByRank.has(rank)
      ? (() => {
        const mainKey = backboneByRank.get(rank)!;
        const mainSize = sizeByKey.get(mainKey)!;
        const centre = origin.y + maxCross / 2;
        const mainCross = centre - mainSize.h / 2;
        const result: Array<{ key: string; cross: number }> = [{ key: mainKey, cross: mainCross }];
        const laneStep = maxNodeHeight + CROSS_GAP;
        layer.filter((key) => key !== mainKey).forEach((key, index) => {
          const size = sizeByKey.get(key)!;
          const lane = branchLanes.get(key);
          if (lane) {
            const laneCentre = lane.side === "above"
              ? centre - lane.index * laneStep
              : centre + lane.index * laneStep;
            result.push({ key, cross: laneCentre - size.h / 2 });
          } else {
            const fallbackOffset = index + 1;
            result.push({ key, cross: centre + (index % 2 === 0 ? -1 : 1) * fallbackOffset * laneStep - size.h / 2 });
          }
        });
        return result;
      })()
      : (() => {
        let layerCross = cross;
        return layer.map((key) => {
          const item = { key, cross: layerCross };
          layerCross += (direction === "down" ? sizeByKey.get(key)!.w : sizeByKey.get(key)!.h) + CROSS_GAP;
          return item;
        });
      })();
    positionedLayer.forEach(({ key, cross: layerCross }) => {
      const size = sizeByKey.get(key)!;
      const rect = direction === "down"
        ? { x: layerCross, y: along + (alongSize - size.h) / 2, w: size.w, h: size.h }
        : { x: along + (alongSize - size.w) / 2, y: layerCross, w: size.w, h: size.h };
      positions.set(key, rect);
    });
    along += alongSize + RANK_GAP;
  }

  const routes = routeEdges(edges, positions, ranks, direction);
  return { positions, ranks, routes, validation: validateSemanticDiagram({ edges, positions, routes }) };
}

/** Routes already-positioned nodes, used by swimlanes whose lane grid fixes
 * the node coordinates independently of graph rank. */
export function routePositionedSemanticEdges(
  edges: SemanticDiagramEdge[],
  positions: Map<string, SemanticDiagramRect>,
  direction: SemanticDiagramDirection,
): Map<number, SemanticDiagramRoute> {
  const ranks = new Map<string, number>();
  // Rank by the node centre, not its top/left edge. Terminators and decision
  // nodes intentionally have different dimensions, so their edges can differ
  // while they still occupy the same visual row/column. Using the edge made a
  // straight backbone connector look like a long outer loop after persistence.
  const rawCoordinates = [...positions.values()]
    .map((rect) => direction === "down" ? rect.y + rect.h / 2 : rect.x + rect.w / 2)
    .sort((a, b) => a - b);
  const coordinates = rawCoordinates.filter((value, index) => index === 0 || !sameCoordinate(value, rawCoordinates[index - 1]));
  for (const [key, rect] of positions) {
    const coordinate = direction === "down" ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
    ranks.set(key, coordinates.findIndex((value) => sameCoordinate(value, coordinate)));
  }
  return routeEdges(edges, positions, ranks, direction);
}
