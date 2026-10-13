import { computeFamilyPositions, familyRecentersRoot } from "@/app/workspace/layout/familyPositions";
import { DESCRIPTION_PANEL_EXTRA_HEIGHT, type TreeLayoutSize } from "@/app/workspace/layout/treeLayout";
import type { MapLayoutSettings } from "@/app/workspace/types/block";
import type { AgentBoardState } from "./operations";
import { rawMapValue, resolveLayoutRequest } from "./mapLayoutRequest";
import { applyStructuralConnectorSides } from "./mapConnectorSides";
import { syncFishboneBackbone } from "./mapFishboneBackbone";
export { resolveLayoutRequest } from "./mapLayoutRequest";

type Point = { x: number; y: number };

const DEFAULT_MAP_LAYOUT: MapLayoutSettings = {
  family: "hierarchy",
  direction: "right",
  growthMode: "one-side",
  connectorLineType: "curved",
  connectorPaletteId: "default",
  stylePresetId: "default",
  timelineBranchMode: "auto",
  timelineDescendantStyle: "tree",
  catalogDescendantStyle: "tree",
};

const LAYOUT_TYPES = new Set([
  "logical-right",
  "logical-left",
  "logical-down",
  "logical-up",
  "mindmap",
  "mindmap-vertical",
  "org-chart",
  "catalog",
  "timeline",
  "vertical-timeline",
  "fishbone",
]);

const MAP_PALETTE_IDS = new Set(["default", "pastel", "minimal", "monochrome", "vibrant"]);

export function isStructuredMapLayoutType(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  const { layout } = resolveLayoutRequest({ layoutType: value });
  return layout !== undefined && layout !== "flowchart" && layout !== "swimlane";
}

function canonicalLayoutType(raw: Record<string, unknown>): string {
  const { layout } = resolveLayoutRequest(raw);
  return layout && LAYOUT_TYPES.has(layout) ? layout : "logical-right";
}

function applyCommonMapOptions(base: MapLayoutSettings, raw: Record<string, unknown>): void {
  const layoutDirection = rawMapValue(raw, "layoutDirection");
  const requestedDirection = typeof layoutDirection === "string" && ["right", "left", "down", "up"].includes(layoutDirection)
    ? layoutDirection as MapLayoutSettings["direction"]
    : undefined;
  const growthMode = rawMapValue(raw, "growthMode");
  const requestedGrowthMode = growthMode === "both-side" || growthMode === "one-side" ? growthMode : undefined;
  const requestedLineRaw = rawMapValue(raw, "connectionStyle") ?? rawMapValue(raw, "connectorLineType");
  const requestedLine = requestedLineRaw === "elbow" ? "orthogonal" : requestedLineRaw;
  const requestedPalette = rawMapValue(raw, "connectorPaletteId") ?? rawMapValue(raw, "stylePresetId");
  const requestedAngle = Number(rawMapValue(raw, "layoutAngle"));

  if (requestedDirection) base.direction = requestedDirection;
  if (requestedGrowthMode) base.growthMode = requestedGrowthMode;
  if (requestedLine === "curved" || requestedLine === "orthogonal" || requestedLine === "straight") {
    base.connectorLineType = requestedLine;
  }
  if (typeof requestedPalette === "string" && MAP_PALETTE_IDS.has(requestedPalette)) {
    base.connectorPaletteId = requestedPalette;
    base.stylePresetId = requestedPalette;
  }
  if (Number.isFinite(requestedAngle) && requestedAngle >= -180 && requestedAngle <= 180) {
    base.layoutAngle = requestedAngle;
  }

  const timelineBranchMode = rawMapValue(raw, "timelineBranchMode");
  if (["auto", "one-side", "one-side-reverse", "alternate"].includes(String(timelineBranchMode))) {
    base.timelineBranchMode = timelineBranchMode as MapLayoutSettings["timelineBranchMode"];
  }
  const timelineDescendantStyle = rawMapValue(raw, "timelineDescendantStyle");
  if (timelineDescendantStyle === "tree" || timelineDescendantStyle === "hierarchy") {
    base.timelineDescendantStyle = timelineDescendantStyle;
  }
  const catalogDescendantStyle = rawMapValue(raw, "catalogDescendantStyle");
  if (catalogDescendantStyle === "tree" || catalogDescendantStyle === "hierarchy") {
    base.catalogDescendantStyle = catalogDescendantStyle;
  }
}

export function mapLayoutFor(raw: Record<string, unknown>): MapLayoutSettings {
  const layoutType = canonicalLayoutType(raw);

  const base: MapLayoutSettings = { ...DEFAULT_MAP_LAYOUT };
  switch (layoutType) {
    case "logical-left":
      base.direction = "left";
      break;
    case "logical-down":
      base.direction = "down";
      break;
    case "logical-up":
      base.direction = "up";
      break;
    case "mindmap":
      base.growthMode = "both-side";
      break;
    case "mindmap-vertical":
      base.direction = "down";
      base.growthMode = "both-side";
      break;
    case "org-chart":
      base.family = "orgchart";
      base.direction = "down";
      break;
    case "catalog":
      base.family = "treeview";
      base.connectorLineType = "orthogonal";
      break;
    case "timeline":
      base.family = "timeline";
      base.connectorLineType = "orthogonal";
      break;
    case "vertical-timeline":
      base.family = "timeline";
      base.direction = "down";
      base.connectorLineType = "orthogonal";
      break;
    case "fishbone":
      base.family = "fishbone";
      base.connectorLineType = "orthogonal";
      break;
  }

  applyCommonMapOptions(base, raw);
  if (base.family !== "hierarchy") {
    base.connectorLineType = base.family === "orgchart" ? "curved" : "orthogonal";
  }
  return base;
}

export function flowchartLayoutFor(raw: Record<string, unknown>): MapLayoutSettings {
  const requestedDirection = rawMapValue(raw, "direction") ?? rawMapValue(raw, "layoutDirection");
  const base: MapLayoutSettings = {
    ...DEFAULT_MAP_LAYOUT,
    family: "flowchart",
    direction: requestedDirection === "right" ? "right" : "down",
    connectorLineType: "orthogonal",
  };
  applyCommonMapOptions(base, raw);
  if (requestedDirection === "right" || requestedDirection === "down") {
    base.direction = requestedDirection as MapLayoutSettings["direction"];
  }
  base.connectorLineType = "orthogonal";
  return base;
}

export function swimlaneLayoutFor(raw: Record<string, unknown>): MapLayoutSettings {
  const orientation = rawMapValue(raw, "orientation") === "vertical" ? "vertical" : "horizontal";
  const base: MapLayoutSettings = {
    ...DEFAULT_MAP_LAYOUT,
    family: "swimlane",
    direction: orientation === "vertical" ? "down" : "right",
    connectorLineType: "orthogonal",
  };
  applyCommonMapOptions(base, raw);
  // Swimlane geometry is controlled by lane orientation; its connectors stay
  // orthogonal because curved/straight lines obscure lane transitions.
  base.direction = orientation === "vertical" ? "down" : "right";
  base.connectorLineType = "orthogonal";
  return base;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function blockPoint(block: Record<string, unknown>): Point {
  const transform = asRecord(block.transform);
  const override = asRecord(transform.override);
  const computed = asRecord(transform.computed);
  const source = override.x !== undefined ? override : computed;
  return {
    x: Number.isFinite(Number(source.x)) ? Number(source.x) : 80,
    y: Number.isFinite(Number(source.y)) ? Number(source.y) : 80,
  };
}

function blockSize(block: Record<string, unknown>): TreeLayoutSize {
  const transform = asRecord(block.transform);
  const override = asRecord(transform.override);
  const computed = asRecord(transform.computed);
  const source = override.x !== undefined ? override : computed;
  const height = Number(source.h) > 0 ? Number(source.h) : 100;
  return {
    w: Number(source.w) > 0 ? Number(source.w) : 220,
    h: height + (typeof block.description === "string" && block.description.trim()
      ? DESCRIPTION_PANEL_EXTRA_HEIGHT
      : 0),
  };
}

function writeComputedPosition(block: Record<string, unknown>, point: Point): void {
  const current = asRecord(block.transform);
  const override = asRecord(current.override);
  const computed = asRecord(current.computed);
  const source = override.x !== undefined ? override : computed;
  block.transform = {
    ...current,
    computed: { ...source, x: point.x, y: point.y },
    override: null,
  };
}

/**
 * The Dify route creates a complete tree in one server transaction. Arrange
 * that tree only after every descendant exists, so sibling spacing includes
 * each branch's full subtree footprint.
 */
export function layoutCreatedMap(state: AgentBoardState, createdIds: string[], raw: Record<string, unknown> = {}): void {
  const created = new Set(createdIds);
  const layout = mapLayoutFor(raw);
  const roots = createdIds.filter((blockId) => {
    const parentId = String(state.blocks[blockId]?.parentId ?? "");
    return !parentId || !created.has(parentId);
  });

  roots.forEach((rootId) => {
    const root = state.blocks[rootId];
    if (!root) return;

    const childrenByParent = new Map<string, string[]>();
    const sizes = new Map<string, TreeLayoutSize>();
    createdIds.forEach((blockId) => {
      const block = state.blocks[blockId];
      if (!block) return;
      sizes.set(blockId, blockSize(block));
      const parentId = String(block.parentId ?? "");
      if (parentId && created.has(parentId)) {
        childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), blockId]);
      }
    });

    const origin = blockPoint(root);
    const positions = computeFamilyPositions(layout, rootId, origin, childrenByParent, sizes);
    const calculatedRoot = positions.get(rootId);
    const anchorOffset = calculatedRoot && familyRecentersRoot(layout.family)
      ? { x: origin.x - calculatedRoot.x, y: origin.y - calculatedRoot.y }
      : { x: 0, y: 0 };
    positions.forEach((point, blockId) => {
      const block = state.blocks[blockId];
      if (block) {
        // The whole family shifts together so the root lands on its anchor;
        // skipping the root left it displaced from its own branches.
        writeComputedPosition(block, { x: point.x + anchorOffset.x, y: point.y + anchorOffset.y });
        block.updatedAt = Date.now();
      }
    });
    root.mapLayout = layout;
    const finalPositions = new Map([...positions].map(([blockId, point]) => [blockId, { x: point.x + anchorOffset.x, y: point.y + anchorOffset.y }]));
    applyStructuralConnectorSides(state, created, layout, finalPositions);
    syncFishboneBackbone(state, rootId, layout, childrenByParent.get(rootId) ?? [], finalPositions);
  });

  Object.values(state.connectors).forEach((connector) => {
    const from = String(connector.fromBlockId ?? "");
    const to = String(connector.toBlockId ?? "");
    if (created.has(from) && created.has(to) && state.blocks[to]?.parentId === from) {
      connector.lineType = layout.connectorLineType;
    }
  });
}

export function layoutExistingMap(state: AgentBoardState, rootId: string, raw: Record<string, unknown>): void {
  if (!state.blocks[rootId]) return;
  const childrenByParent = new Map<string, string[]>();
  Object.values(state.blocks).forEach((block) => {
    const parentId = String(block.parentId ?? "");
    if (parentId && state.blocks[parentId]) {
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), String(block.id)]);
    }
  });
  const members = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const blockId = pending.pop()!;
    if (members.has(blockId)) continue;
    members.add(blockId);
    pending.push(...(childrenByParent.get(blockId) ?? []));
  }
  // Siblings stay in blockOrder: the editor's timeline rail (root->m1->m2) and both-side split use it.
  layoutCreatedMap(state, state.blockOrder.filter((blockId) => members.has(blockId)), raw);
}
