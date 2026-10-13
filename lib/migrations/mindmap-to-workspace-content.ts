import type { MindmapNodeLike, MindmapRecord } from "@/lib/mindmap/repository";
import { legacyTableData } from "./mindmap-table";

export interface WorkspaceMigrationContent {
  blocks: Record<string, unknown>;
  blockOrder: string[];
  connectors: Record<string, unknown>;
  camera: { x: number; y: number; zoom: number };
  treeLayoutDirection?: string;
  treeGrowthMode?: string;
  treeLayoutFamily?: string;
  treeTimelineBranchMode?: string;
  treeTimelineDescendantStyle?: string;
  treeCatalogDescendantStyle?: string;
  blockIdByMindmapId: Map<string, string>;
  warnings: string[];
}

type LegacyRecord = Record<string, unknown>;

const SHAPE_MAP: Record<string, string> = {
  rounded_rect: "rounded_rect",
  speech_bubble: "speech_bubble",
  sticky_note: "sticky_note",
  arrow_line: "plain_text",
  text: "plain_text",
};

function record(value: unknown): LegacyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LegacyRecord
    : {};
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shapeKind(value: unknown): string {
  const raw = typeof value === "string" ? value : "rectangle";
  return SHAPE_MAP[raw] ?? raw;
}

function layoutFamily(value: unknown): string {
  switch (value) {
    case "org-chart": return "orgchart";
    case "catalog": return "catalog";
    case "timeline":
    case "vertical-timeline": return "timeline";
    case "fishbone": return "fishbone";
    case "flowchart": return "flowchart";
    case "swimlane": return "swimlane";
    case "treeview": return "treeview";
    default: return "hierarchy";
  }
}

function imagesFor(node: MindmapNodeLike): Array<{ url: string }> {
  const raw = Array.isArray(node.images) ? node.images : [];
  const urls = raw.flatMap((image) => {
    if (typeof image === "string") return image ? [{ url: image }] : [];
    const url = record(image).url;
    return typeof url === "string" && url ? [{ url }] : [];
  });
  if (urls.length === 0 && node.image) urls.push({ url: node.image });
  return urls;
}

function nodeBlock(node: MindmapNodeLike, parentId: string | undefined, index: number, mapLayout?: LegacyRecord): Record<string, unknown> {
  const style = record(node.style);
  const table = legacyTableData(node);
  const data: LegacyRecord = {
    markdown: node.topic || "Untitled",
    ...(typeof style.fontAlign === "string" ? { align: style.fontAlign } : {}),
    ...(typeof style.fontSize === "number" ? { fontSize: style.fontSize } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(typeof style.fontStyle === "string" ? { fontStyle: style.fontStyle } : {}),
    ...(typeof style.fontUnderline === "boolean" ? { fontUnderline: style.fontUnderline } : {}),
    ...(typeof style.fontStrikethrough === "boolean" ? { fontStrikethrough: style.fontStrikethrough } : {}),
    ...(typeof style.textStyle === "string" ? { textStyle: style.textStyle } : {}),
    ...(typeof style.verticalAlign === "string" ? { verticalAlign: style.verticalAlign } : {}),
  };
  const legacy = {
    ...(node.style ? { style: node.style } : {}),
    ...(node.tableId ? { tableId: node.tableId } : {}),
    ...(node.tableCellId ? { tableCellId: node.tableCellId } : {}),
    ...(node.floatingMapRoot ? { floatingMapRoot: true } : {}),
    ...(node.images ? { images: node.images } : {}),
    ...(node.table ? { table: node.table } : {}),
    ...(node.tableV2 ? { tableV2: node.tableV2 } : {}),
    ...(node.descriptionStyle ? { descriptionStyle: node.descriptionStyle } : {}),
  };
  return {
    id: node.id,
    type: table ? "table" : "text",
    transform: {
      computed: null,
      override: {
        x: finite(node.x, index * 220),
        y: finite(node.y, index * 80),
        w: Math.max(40, finite(node.width, 170)),
        h: Math.max(28, finite(node.height, 48)),
        rotation: 0,
        zIndex: index,
      },
    },
    data: table
      ? { ...table, ...(Object.keys(legacy).length > 0 ? { legacyMindmap: legacy } : {}) }
      : (Object.keys(legacy).length > 0 ? { ...data, legacyMindmap: legacy } : data),
    ...(node.icon ? { icon: node.icon } : {}),
    ...(node.description ? { description: node.description } : {}),
    ...(node.link ? { link: node.link } : {}),
    ...(imagesFor(node).length > 0 ? { attachedImages: imagesFor(node) } : {}),
    ...(parentId ? { parentId } : {}),
    ...(node.expanded === false ? { isCollapsed: true } : {}),
    ...(node.floating ? { isFloating: true } : {}),
    style: {
      ...(style.shape ? { shapeKind: shapeKind(style.shape) } : {}),
      ...(style.bgColor ? { backgroundColor: style.bgColor } : {}),
      ...(style.bgOpacity !== undefined ? { backgroundOpacity: finite(style.bgOpacity, 100) / 100 } : {}),
      ...(style.borderColor ? { borderColor: style.borderColor } : {}),
      ...(style.borderWidth !== undefined ? { borderWidth: finite(style.borderWidth, 1) } : {}),
      ...(style.borderDash ? { borderDash: style.borderDash } : {}),
      ...(style.color ? { textColor: style.color } : {}),
      ...(style.flipH ? { flipH: true } : {}),
      ...(style.flipV ? { flipV: true } : {}),
      ...(style.isLocked ? { isLocked: true } : {}),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(mapLayout ? { mapLayout } : {}),
  };
}

function mapLayout(recordValue: MindmapRecord, root: MindmapNodeLike): LegacyRecord {
  const style = record(root.style);
  const family = layoutFamily(recordValue.layoutType ?? style.layoutType);
  const legacyPresetId = record(recordValue.stylePreset).id;
  const workspacePresetId = ["pastel", "minimal", "monochrome", "vibrant"].includes(String(legacyPresetId))
    ? String(legacyPresetId)
    : "default";
  return {
    family,
    direction: recordValue.layoutType === "logical-left" || style.layoutDirection === "left" ? "left" : "right",
    growthMode: style.layoutGrowthMode === "both-side" ? "both-side" : "one-side",
    connectorLineType: recordValue.connectionStyle ?? "curved",
    connectorPaletteId: workspacePresetId,
    stylePresetId: workspacePresetId,
    timelineBranchMode: style.timelineBranchMode ?? "auto",
    timelineDescendantStyle: style.timelineDescendantStyle ?? "tree",
    catalogDescendantStyle: style.catalogDescendantStyle ?? "tree",
  };
}

function preserveLegacyMapSettings(blocks: Record<string, unknown>, rootId: string, recordValue: MindmapRecord): void {
  const block = record(blocks[rootId]);
  const data = record(block.data);
  const legacy = record(data.legacyMindmap);
  const mapSettings: LegacyRecord = {
    ...(typeof recordValue.layoutType === "string" ? { layoutType: recordValue.layoutType } : {}),
    ...(typeof recordValue.connectionStyle === "string" ? { connectionStyle: recordValue.connectionStyle } : {}),
    ...(typeof recordValue.nodeShape === "string" ? { nodeShape: recordValue.nodeShape } : {}),
    ...(typeof recordValue.freeLayout === "boolean" ? { freeLayout: recordValue.freeLayout } : {}),
    ...(recordValue.stylePreset ? { stylePreset: recordValue.stylePreset } : {}),
  };
  if (Object.keys(mapSettings).length === 0) return;
  blocks[rootId] = {
    ...block,
    data: { ...data, legacyMindmap: { ...legacy, mapSettings } },
  };
}

function addCanvasShape(blocks: Record<string, unknown>, order: string[], raw: unknown, index: number): void {
  const shape = record(raw);
  const id = `shape:${typeof shape.id === "string" ? shape.id : index}`;
  blocks[id] = {
    id,
    type: "shape",
    transform: { computed: null, override: {
      x: finite(shape.x, 0), y: finite(shape.y, 0), w: Math.max(20, finite(shape.width, 160)),
      h: Math.max(20, finite(shape.height, 100)), rotation: finite(shape.rotation, 0), zIndex: 10000 + index,
    } },
    data: { shapeKind: shapeKind(shape.shapeType), label: typeof shape.text === "string" ? shape.text : undefined },
    style: {
      ...(typeof shape.bgColor === "string" ? { backgroundColor: shape.bgColor } : {}),
      ...(typeof shape.borderColor === "string" ? { borderColor: shape.borderColor } : {}),
      ...(typeof shape.textColor === "string" ? { textColor: shape.textColor } : {}),
    },
    createdAt: Date.now(), updatedAt: Date.now(),
    legacyMindmapShape: shape,
  };
  order.push(id);
}

function addFreehandStroke(blocks: Record<string, unknown>, order: string[], raw: unknown, index: number): void {
  const stroke = record(raw);
  const points = Array.isArray(stroke.points) ? stroke.points.map((point) => record(point)).map((point) => ({ x: finite(point.x, 0), y: finite(point.y, 0) })) : [];
  if (points.length === 0) return;
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  const id = `stroke:${typeof stroke.id === "string" ? stroke.id : index}`;
  blocks[id] = {
    id, type: "path",
    transform: { computed: null, override: { x: left, y: top, w: Math.max(20, right - left), h: Math.max(20, bottom - top), rotation: 0, zIndex: 20000 + index } },
    data: { points: points.map((point) => ({ x: point.x - left, y: point.y - top })), strokeColor: stroke.color, strokeWidth: stroke.width, tool: stroke.tool, opacity: stroke.opacity, text: stroke.text },
    createdAt: Date.now(), updatedAt: Date.now(), legacyMindmapStroke: stroke,
  };
  order.push(id);
}

export function convertMindmapToWorkspaceContent(recordValue: MindmapRecord): WorkspaceMigrationContent {
  const blocks: Record<string, unknown> = {};
  const blockOrder: string[] = [];
  const connectors: Record<string, unknown> = {};
  const blockIdByMindmapId = new Map<string, string>();
  const warnings: string[] = [];
  const root = recordValue.tree;
  const roots = root.topic === "Virtual Root" || root.topic === "New Mindmap" ? root.children ?? [] : [root];
  let index = 0;
  const pendingRelationships: Array<{ from: string; relation: LegacyRecord }> = [];

  const visit = (node: MindmapNodeLike, parentId: string | undefined, rootLayout?: LegacyRecord) => {
    if (!node.id || blocks[node.id]) {
      warnings.push(`Skipped duplicate or empty node id: ${node.id || "<empty>"}`);
      return;
    }
    const layout = parentId ? undefined : rootLayout;
    blocks[node.id] = nodeBlock(node, parentId, index++, layout);
    blockOrder.push(node.id);
    blockIdByMindmapId.set(node.id, node.id);
    for (const relation of node.relationships ?? []) pendingRelationships.push({ from: node.id, relation: record(relation) });
    for (const child of node.children ?? []) visit(child, node.id);
  };
  for (const mapRoot of roots) {
    visit(mapRoot, undefined, mapLayout(recordValue, mapRoot));
    if (blocks[mapRoot.id]) preserveLegacyMapSettings(blocks, mapRoot.id, recordValue);
  }

  for (const { from, relation } of pendingRelationships) {
    const to = typeof relation.to === "string" ? relation.to : "";
    if (!blocks[to]) {
      warnings.push(`Skipped relationship ${String(relation.id ?? "<unknown>")}: target node is missing`);
      continue;
    }
    const id = typeof relation.id === "string" ? relation.id : `relationship:${Object.keys(connectors).length}`;
    connectors[id] = {
      id, fromBlockId: from, toBlockId: to,
      ...(relation.fromSide ? { fromSide: relation.fromSide } : {}),
      ...(relation.toSide ? { toSide: relation.toSide } : {}),
      ...(typeof relation.lineLabel === "string" ? { label: relation.lineLabel } : {}),
      ...(typeof relation.lineColor === "string" ? { strokeColor: relation.lineColor } : {}),
      ...(typeof relation.lineWidth === "number" ? { strokeWidth: relation.lineWidth } : {}),
      ...(typeof relation.lineDash === "string" ? { dashed: relation.lineDash !== "solid" } : {}),
      ...(relation.arrowStart && relation.arrowStart !== "none" ? { arrowStart: true } : {}),
      ...(relation.arrowEnd && relation.arrowEnd !== "none" ? { arrowEnd: true } : {}),
      ...(relation.type === "curved" || relation.type === "orthogonal" ? { lineType: relation.type } : {}),
      ...(Array.isArray(relation.waypoints) ? { waypoints: relation.waypoints } : {}),
      legacyMindmapRelationship: relation,
    };
  }
  for (const [i, shape] of (Array.isArray(recordValue.canvasShapes) ? recordValue.canvasShapes : []).entries()) addCanvasShape(blocks, blockOrder, shape, i);
  for (const [i, stroke] of (Array.isArray(recordValue.freehandStrokes) ? recordValue.freehandStrokes : []).entries()) addFreehandStroke(blocks, blockOrder, stroke, i);

  const rootStyle = record(root.style);
  return {
    blocks, blockOrder, connectors, camera: { x: 0, y: 0, zoom: 1 }, blockIdByMindmapId, warnings,
    treeLayoutDirection: recordValue.layoutType === "logical-left" ? "left" : "right",
    treeGrowthMode: rootStyle.layoutGrowthMode === "both-side" ? "both-side" : "one-side",
    treeLayoutFamily: layoutFamily(recordValue.layoutType),
    treeTimelineBranchMode: typeof rootStyle.timelineBranchMode === "string" ? rootStyle.timelineBranchMode : undefined,
    treeTimelineDescendantStyle: typeof rootStyle.timelineDescendantStyle === "string" ? rootStyle.timelineDescendantStyle : undefined,
    treeCatalogDescendantStyle: typeof rootStyle.catalogDescendantStyle === "string" ? rootStyle.catalogDescendantStyle : undefined,
  };
}
