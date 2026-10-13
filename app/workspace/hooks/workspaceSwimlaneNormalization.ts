import { routePositionedSemanticEdges } from "../layout/semanticDiagramLayout";

const SWIMLANE_ROUTE_MARGIN = 24;

type PersistedBoardBlock = {
  id?: string;
  mapId?: string;
  type?: string;
  mapLayout?: { family?: string; direction?: string };
  transform?: { computed?: Record<string, unknown> | null; override?: Record<string, unknown> | null };
};

type PersistedBoardConnector = Record<string, unknown> & {
  fromBlockId?: string;
  toBlockId?: string;
  waypoints?: Array<{ x?: number; y?: number }>;
};

function persistedRect(block: PersistedBoardBlock): { x: number; y: number; w: number; h: number } | null {
  const transform = block.transform ?? {};
  const computed = transform.computed ?? {};
  const override = transform.override ?? {};
  const source = Object.keys(override).length > 0 ? override : computed;
  const x = Number(source.x), y = Number(source.y), w = Number(source.w), h = Number(source.h);
  return [x, y, w, h].every(Number.isFinite) ? { x, y, w, h } : null;
}

/** Normalize legacy swimlane edge routes once during board hydration. */
export function normalizeLegacySwimlaneConnectors(
  rawBlocks: unknown,
  rawConnectors: unknown,
): Record<string, PersistedBoardConnector> {
  const blocks = rawBlocks && typeof rawBlocks === "object" ? rawBlocks as Record<string, PersistedBoardBlock> : {};
  const connectors = rawConnectors && typeof rawConnectors === "object" ? rawConnectors as Record<string, PersistedBoardConnector> : {};
  const swimlanes = Object.values(blocks).filter((block) => block.type === "table" && block.mapLayout?.family === "swimlane")
    .map((table) => ({ table, rect: persistedRect(table) }))
    .filter((entry): entry is { table: PersistedBoardBlock; rect: { x: number; y: number; w: number; h: number } } => Boolean(entry.rect));
  if (swimlanes.length === 0) return connectors;

  let changed = false;
  const normalized = { ...connectors };
  swimlanes.forEach(({ table, rect: tableRect }) => {
    const nodeEntries = Object.entries(blocks)
      .filter(([, block]) => block.type !== "table" && block.mapId && block.mapId === table.mapId)
      .map(([id, block]) => ({ id, rect: persistedRect(block) }))
      .filter((entry): entry is { id: string; rect: { x: number; y: number; w: number; h: number } } => Boolean(entry.rect));
    const positions = new Map(nodeEntries.map(({ id, rect }) => [id, rect] as const));
    if (positions.size < 2) return;
    const edges = Object.entries(connectors)
      .filter(([, connector]) => positions.has(connector.fromBlockId ?? "") && positions.has(connector.toBlockId ?? ""))
      .map(([id, connector]) => ({
        id,
        edge: { from: connector.fromBlockId!, to: connector.toBlockId!, label: typeof connector.label === "string" ? connector.label : undefined },
      }));
    if (edges.length === 0) return;
    const direction = table.mapLayout?.direction === "right" ? "right" : "down";
    const routes = routePositionedSemanticEdges(edges.map(({ edge }) => edge), positions, direction);
    edges.forEach(({ id }, edgeIndex) => {
      const connector = connectors[id];
      const route = routes.get(edgeIndex);
      if (!connector || !route) return;
      const waypoints = connector.waypoints;
      const hasLegacyPerimeterRoute = Boolean(waypoints?.some((point) => {
        const x = Number(point.x), y = Number(point.y);
        return !Number.isFinite(x) || !Number.isFinite(y)
          || x < tableRect.x - SWIMLANE_ROUTE_MARGIN || x > tableRect.x + tableRect.w + SWIMLANE_ROUTE_MARGIN
          || y < tableRect.y - SWIMLANE_ROUTE_MARGIN || y > tableRect.y + tableRect.h + SWIMLANE_ROUTE_MARGIN;
      }));
      const semanticRouteIsPerimeter = route.waypoints.some((point) => {
        const x = Number(point.x), y = Number(point.y);
        return !Number.isFinite(x) || !Number.isFinite(y)
          || x < tableRect.x - SWIMLANE_ROUTE_MARGIN || x > tableRect.x + tableRect.w + SWIMLANE_ROUTE_MARGIN
          || y < tableRect.y - SWIMLANE_ROUTE_MARGIN || y > tableRect.y + tableRect.h + SWIMLANE_ROUTE_MARGIN;
      });
      const isPerimeterRoute = hasLegacyPerimeterRoute || semanticRouteIsPerimeter;
      if (waypoints?.length && !isPerimeterRoute) return;
      const next = {
        ...connector,
        fromSide: isPerimeterRoute ? undefined : route.fromSide,
        toSide: isPerimeterRoute ? undefined : route.toSide,
        waypoints: isPerimeterRoute ? undefined : route.waypoints,
      };
      if (JSON.stringify(next) !== JSON.stringify(connector)) {
        normalized[id] = next;
        changed = true;
      }
    });
  });
  return changed ? normalized : connectors;
}
