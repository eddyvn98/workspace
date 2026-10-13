import { param, record, resolveId, stringValue, type AgentBoardState } from "./operationsCore";

type JsonMap = Record<string, unknown>;

// Aliases the model is allowed to send for the same connector property. The
// Dify prompt mentions "label fields", and models also reuse the stored field
// names (strokeColor, dashed), so every spelling must land on the same field.
const FLAT_KEYS = [
  "type", "lineType", "lineDash", "dashed", "lineStyle", "lineColor", "strokeColor", "color", "lineWidth", "strokeWidth",
  "arrowStart", "arrowEnd", "lineLabel", "label", "labelColor", "labelFontSize", "labelBold", "labelItalic", "labelUnderline",
  "labelStrikethrough", "labelBgColor", "labelAlign", "labelPosition", "labelOrientation", "waypoints", "trunkAxis",
];

function collectPatch(raw: JsonMap): JsonMap {
  const patch: JsonMap = { ...record(param(raw, "relationshipPatch")) };
  for (const key of FLAT_KEYS) if (raw[key] !== undefined && patch[key] === undefined) patch[key] = raw[key];
  return patch;
}

function findConnectors(state: AgentBoardState, raw: JsonMap): JsonMap[] {
  const all = Object.values(state.connectors);
  const connectorId = stringValue(param(raw, "connectorId"));
  if (connectorId) return all.filter((item) => item.id === connectorId);
  const between = record(param(raw, "between"));
  const from = resolveId({ target: param(raw, "from") ?? param(raw, "fromBlockId") ?? between.fromBlockId }, state);
  const to = resolveId({ target: param(raw, "to") ?? param(raw, "toBlockId") ?? between.toBlockId }, state);
  if (!from || !to) return [];
  const forward = all.filter((item) => item.fromBlockId === from && item.toBlockId === to);
  if (forward.length) return forward;
  // A user describing "the line between A and B" does not know its direction.
  return all.filter((item) => item.fromBlockId === to && item.toBlockId === from);
}

// The tool schema offers "none" | "arrow" while stored connectors use booleans.
function arrowFlag(value: unknown): boolean {
  return typeof value === "string" ? value !== "none" && value !== "false" && value !== "" : Boolean(value);
}

function applyPatch(item: JsonMap, patch: JsonMap): void {
  const lineType = patch.lineType ?? patch.type;
  if (lineType === "straight_arrow") { item.lineType = "straight"; item.arrowEnd = true; }
  else if (lineType === "straight" || lineType === "curved" || lineType === "orthogonal") item.lineType = lineType;
  const dash = patch.lineDash ?? patch.lineStyle;
  if (dash !== undefined) item.dashed = dash !== "solid";
  else if (patch.dashed !== undefined) item.dashed = Boolean(patch.dashed);
  const color = patch.lineColor ?? patch.strokeColor ?? patch.color;
  if (color !== undefined) item.strokeColor = color;
  const width = patch.lineWidth ?? patch.strokeWidth;
  if (width !== undefined) item.strokeWidth = Math.max(1, Number(width));
  if (patch.arrowStart !== undefined) item.arrowStart = arrowFlag(patch.arrowStart);
  if (patch.arrowEnd !== undefined) item.arrowEnd = arrowFlag(patch.arrowEnd);
  const label = patch.lineLabel ?? patch.label;
  if (label !== undefined) item.label = label;
  if (patch.labelColor !== undefined) item.labelColor = patch.labelColor;
  if (patch.labelFontSize !== undefined) item.labelFontSize = Math.min(72, Math.max(8, Number(patch.labelFontSize)));
  for (const flag of ["labelBold", "labelItalic", "labelUnderline", "labelStrikethrough"]) {
    if (patch[flag] !== undefined) item[flag] = Boolean(patch[flag]);
  }
  if (patch.labelBgColor !== undefined) item.labelBgColor = patch.labelBgColor;
  if (["left", "center", "right"].includes(String(patch.labelAlign))) item.labelAlign = patch.labelAlign;
  if (patch.labelPosition !== undefined) item.labelPosition = Math.min(1, Math.max(0, Number(patch.labelPosition)));
  if (["horizontal", "parallel", "perpendicular", "follow"].includes(String(patch.labelOrientation))) item.labelOrientation = patch.labelOrientation;
  if (Array.isArray(patch.waypoints)) {
    item.waypoints = patch.waypoints.map(record)
      .filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
      .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
  }
  if (patch.trunkAxis !== undefined) item.trunkAxis = Number(patch.trunkAxis);
}

export function updateRelationship(state: AgentBoardState, raw: JsonMap): string[] {
  const patch = collectPatch(raw);
  const connectors = findConnectors(state, raw);
  connectors.forEach((item) => applyPatch(item, patch));
  return connectors.map((item) => String(item.id));
}
