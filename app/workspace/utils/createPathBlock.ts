import {
  type CanvasBlock,
  type FreehandToolType,
  type Position,
  createBlockId,
  createDualTransform,
} from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { screenToCanvas } from "./geometry";
import { useFreehandConfig } from "./freehandPresets";
import { generateShapePoints, isShapeTool } from "./freehandShapePoints";

const PADDING = 8;

/** Builds and adds a "path" block from a finished stroke/shape's screen-space
 *  points — shared by useFreehandDraw.ts's drag-based tools (pen/shapes) and
 *  its cad_line click-to-chain polyline mode. Split out to keep that hook
 *  under the 300-line cap. */
export function createPathBlockFromScreenPoints(
  screenPoints: Position[],
  tool: FreehandToolType,
  canvasOrigin: Position = { x: 0, y: 0 },
): void {
  if (screenPoints.length < 2) return;
  const { camera, blocks, addBlock } = useWorkspaceStore.getState();
  const { strokeColor, strokeWidth } = useFreehandConfig.getState();
  const toCanvasScreen = (point: Position): Position => ({
    x: point.x - canvasOrigin.x,
    y: point.y - canvasOrigin.y,
  });

  let canvasPoints: Position[];
  if (isShapeTool(tool) && tool !== "line" && tool !== "cad_line") {
    const startCanvas = screenToCanvas(toCanvasScreen(screenPoints[0]), camera);
    const endCanvas = screenToCanvas(toCanvasScreen(screenPoints[screenPoints.length - 1]), camera);
    canvasPoints = generateShapePoints(tool, startCanvas, endCanvas);
  } else {
    canvasPoints = screenPoints.map((pt) => screenToCanvas(toCanvasScreen(pt), camera));
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of canvasPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const localPoints: Position[] = canvasPoints.map((pt) => ({
    x: pt.x - minX + PADDING,
    y: pt.y - minY + PADDING,
  }));

  const isHighlighter = tool === "highlighter";
  const effectiveOpacity = isHighlighter ? 0.4 : 1;
  const effectiveStrokeWidth = isHighlighter ? Math.max(strokeWidth * 4, 12) : strokeWidth;

  const now = Date.now();
  const blockCount = Object.keys(blocks).length;
  const block: CanvasBlock<"path"> = {
    id: createBlockId(),
    type: "path",
    transform: createDualTransform({
      x: minX - PADDING,
      y: minY - PADDING,
      w: Math.max(maxX - minX + PADDING * 2, PADDING * 2),
      h: Math.max(maxY - minY + PADDING * 2, PADDING * 2),
      rotation: 0,
      zIndex: blockCount,
    }),
    data: {
      points: localPoints,
      strokeColor,
      strokeWidth: effectiveStrokeWidth,
      tool,
      opacity: effectiveOpacity,
    },
    createdAt: now,
    updatedAt: now,
  };

  addBlock(block);
}
