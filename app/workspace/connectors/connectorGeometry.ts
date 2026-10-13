import type { AnchorSide, CanvasConnector } from "../types/connector";
import type { CanvasBlock } from "../types/block";
import type { CameraState } from "../types/camera";
import { pickFacingSide, pointOnRectSide } from "./anchorRegistry";
import { blockWorldRect } from "./blockWorldRect";
import { canvasToScreen } from "../utils/geometry";
import { buildConnectorPathParity } from "./connectorPathParity";
import { routeOrthogonal, routeOrthogonalAuto } from "./connectorRouting";
import type { StructuralConnectorSides } from "./structuralConnectorSides";

function isInsideRect(rect: DOMRect, container: DOMRect): boolean {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return cx >= container.left && cx <= container.right && cy >= container.top && cy <= container.bottom;
}

function isSwimlaneConnector(
  blocks: Record<string, CanvasBlock>,
  worldRectForBlock: (blockId: string) => DOMRect | null,
  fromRect: DOMRect,
  toRect: DOMRect,
): boolean {
  return Object.keys(blocks).some((id) => {
    if (blocks[id]?.type !== "table") return false;
    const tableRect = worldRectForBlock(id);
    if (!tableRect) return false;
    return isInsideRect(fromRect, tableRect) || isInsideRect(toRect, tableRect);
  });
}

export interface ConnectorGeometryResult {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pathD: string | null;
  fromSide: AnchorSide;
  toSide: AnchorSide;
}

export function computeConnectorGeometry(
  connector: CanvasConnector,
  fromRect: DOMRect,
  toRect: DOMRect,
  blocks: Record<string, CanvasBlock>,
  camera: CameraState,
  originX: number,
  originY: number,
  structuralSides?: StructuralConnectorSides | null,
  worldRectForBlock: (blockId: string) => DOMRect | null = (blockId) => blockWorldRect(blocks, blockId),
  routeObstacles: DOMRect[] = [],
): ConnectorGeometryResult {
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  let pathD: string | null = null;
  let resolvedFromSide: AnchorSide;
  let resolvedToSide: AnchorSide;
  const hasWaypoints = Boolean(connector.waypoints && connector.waypoints.length > 0);
  if (connector.trunkAxis !== undefined && connector.fromSide && connector.toSide && !structuralSides) {
    const fromSide = connector.fromSide;
    const toSide = connector.toSide;
    resolvedFromSide = fromSide;
    resolvedToSide = toSide;
    const p1 = pointOnRectSide(fromRect, fromSide);
    const p2 = pointOnRectSide(toRect, toSide);
    x1 = p1.x - originX;
    y1 = p1.y - originY;
    x2 = p2.x - originX;
    y2 = p2.y - originY;
    const horizontal = fromSide === "left" || fromSide === "right";
    const toHorizontal = toSide === "left" || toSide === "right";
    if (horizontal === toHorizontal) {
      const trunk = connector.trunkAxis * camera.zoom + (horizontal ? camera.x : camera.y) - (horizontal ? originX : originY);
      const points = horizontal
        ? [{ x: x1, y: y1 }, { x: trunk, y: y1 }, { x: trunk, y: y2 }, { x: x2, y: y2 }]
        : [{ x: x1, y: y1 }, { x: x1, y: trunk }, { x: x2, y: trunk }, { x: x2, y: y2 }];
      pathD = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
    } else {
      const corner = horizontal ? { x: x2, y: y1 } : { x: x1, y: y2 };
      const points = [{ x: x1, y: y1 }, corner, { x: x2, y: y2 }];
      pathD = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
    }
  } else if (hasWaypoints) {
    const wp0 = connector.waypoints![0];
    const wp0Screen = canvasToScreen(wp0, camera);
    const wpLast = connector.waypoints![connector.waypoints!.length - 1];
    const wpLastScreen = canvasToScreen(wpLast, camera);
    const fromSide = connector.fromSide ?? pickFacingSide(fromRect, new DOMRect(wp0Screen.x, wp0Screen.y, 0, 0));
    const toSide = connector.toSide ?? pickFacingSide(toRect, new DOMRect(wpLastScreen.x, wpLastScreen.y, 0, 0));
    resolvedFromSide = fromSide;
    resolvedToSide = toSide;
    const p1 = pointOnRectSide(fromRect, fromSide);
    const p2 = pointOnRectSide(toRect, toSide);
    x1 = p1.x - originX;
    y1 = p1.y - originY;
    x2 = p2.x - originX;
    y2 = p2.y - originY;
    const points = [
      { x: x1, y: y1 },
      ...connector.waypoints!.map((wp) => ({ x: wp.x * camera.zoom + camera.x - originX, y: wp.y * camera.zoom + camera.y - originY })),
      { x: x2, y: y2 },
    ];
    pathD = buildConnectorPathParity(points[0], points[points.length - 1], connector.lineType ?? "straight", points.slice(1, -1));
  } else if (
    connector.lineType === "orthogonal"
    && !structuralSides
    && (isSwimlaneConnector(blocks, worldRectForBlock, fromRect, toRect)
      || (connector.fromSide !== undefined && connector.toSide !== undefined))
  ) {
    const shiftedFromRect = new DOMRect(fromRect.left - originX, fromRect.top - originY, fromRect.width, fromRect.height);
    const shiftedToRect = new DOMRect(toRect.left - originX, toRect.top - originY, toRect.width, toRect.height);
    const fromSide = connector.fromSide ?? pickFacingSide(fromRect, toRect);
    const toSide = connector.toSide ?? pickFacingSide(toRect, fromRect);
    const obstacles = Object.keys(blocks)
      .filter((id) => id !== connector.fromBlockId && id !== connector.toBlockId && blocks[id]?.type !== "table")
      .map((id) => worldRectForBlock(id))
      .filter((rect): rect is DOMRect => rect !== null)
      .map((rect) => new DOMRect(rect.left - originX, rect.top - originY, rect.width, rect.height));
    const routeResult = {
      fromSide, toSide,
      path: routeOrthogonal(pointOnRectSide(shiftedFromRect, fromSide), pointOnRectSide(shiftedToRect, toSide),
        obstacles, fromSide, toSide, { endpointRects: { from: shiftedFromRect, to: shiftedToRect } }),
    };
    pathD = routeResult.path;
    resolvedFromSide = routeResult.fromSide;
    resolvedToSide = routeResult.toSide;
    const p1 = pointOnRectSide(shiftedFromRect, routeResult.fromSide);
    const p2 = pointOnRectSide(shiftedToRect, routeResult.toSide);
    x1 = p1.x;
    y1 = p1.y;
    x2 = p2.x;
    y2 = p2.y;
  } else {
    const isAutoOrthogonal = connector.lineType === "orthogonal" && !structuralSides && connector.fromSide === undefined && connector.toSide === undefined;
    if (isAutoOrthogonal) {
      const shiftedFromRect = new DOMRect(fromRect.left - originX, fromRect.top - originY, fromRect.width, fromRect.height);
      const shiftedToRect = new DOMRect(toRect.left - originX, toRect.top - originY, toRect.width, toRect.height);
      const routeResult = routeOrthogonalAuto(
        shiftedFromRect,
        shiftedToRect,
        [...Object.keys(blocks)
          .filter((id) => id !== connector.fromBlockId && id !== connector.toBlockId)
          .map((id) => worldRectForBlock(id))
          .filter((rect): rect is DOMRect => rect !== null)
          .map((rect) => new DOMRect(rect.left - originX, rect.top - originY, rect.width, rect.height)),
        ...routeObstacles],
      );
      pathD = routeResult.path;
      resolvedFromSide = routeResult.fromSide;
      resolvedToSide = routeResult.toSide;
      const p1 = pointOnRectSide(shiftedFromRect, routeResult.fromSide);
      const p2 = pointOnRectSide(shiftedToRect, routeResult.toSide);
      x1 = p1.x;
      y1 = p1.y;
      x2 = p2.x;
      y2 = p2.y;
    } else {
      let autoFromSide: AnchorSide | undefined;
      let autoToSide: AnchorSide | undefined;
      if (connector.fromSide === undefined && connector.toSide === undefined && !structuralSides) {
        const obstacleRects = Object.keys(blocks)
          .filter((id) => id !== connector.fromBlockId && id !== connector.toBlockId)
          .map((id) => worldRectForBlock(id))
          .filter((rect): rect is DOMRect => rect !== null);
        const picked = routeOrthogonalAuto(fromRect, toRect, obstacleRects);
        autoFromSide = picked.fromSide;
        autoToSide = picked.toSide;
      }
      const fromSide = connector.fromSide ?? structuralSides?.fromSide ?? autoFromSide ?? pickFacingSide(fromRect, toRect);
      const toSide = connector.toSide ?? structuralSides?.toSide ?? autoToSide ?? pickFacingSide(toRect, fromRect);
      resolvedFromSide = fromSide;
      resolvedToSide = toSide;
      const p1 = pointOnRectSide(fromRect, fromSide);
      const p2 = pointOnRectSide(toRect, toSide);
      x1 = p1.x - originX;
      y1 = p1.y - originY;
      x2 = p2.x - originX;
      y2 = p2.y - originY;
      if (connector.lineType === "curved") pathD = buildConnectorPathParity({ x: x1, y: y1 }, { x: x2, y: y2 }, "curved");
      else if (connector.lineType === "orthogonal") {
        const obstacleRects = Object.keys(blocks)
          .filter((id) => id !== connector.fromBlockId && id !== connector.toBlockId)
          .map((id) => worldRectForBlock(id))
          .filter((rect): rect is DOMRect => rect !== null)
          .map((rect) => new DOMRect(rect.left - originX, rect.top - originY, rect.width, rect.height));
        pathD = routeOrthogonal({ x: x1, y: y1 }, { x: x2, y: y2 }, obstacleRects, fromSide, toSide, { compactAnchored: Boolean(structuralSides), endpointRects: { from: { ...fromRect, left: fromRect.left - originX, right: fromRect.right - originX, top: fromRect.top - originY, bottom: fromRect.bottom - originY }, to: { ...toRect, left: toRect.left - originX, right: toRect.right - originX, top: toRect.top - originY, bottom: toRect.bottom - originY } } });
      }
    }
  }
  return { x1, y1, x2, y2, pathD, fromSide: resolvedFromSide, toSide: resolvedToSide };
}
